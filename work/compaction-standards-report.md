# Context/Conversation Compaction Standards Report

**Date:** 2026-03-04  
**Purpose:** Document the state-of-the-art for context compaction across LLM providers and frameworks, to evaluate MiniMax M2.5's erratic compaction behavior against industry standards.

---

## Executive Summary

Context compaction is an **emerging but rapidly maturing** area. As of early 2026, both Anthropic and OpenAI have shipped dedicated compaction APIs with well-defined contracts. Google provides no built-in API-level compaction but has large context windows and client-side tooling via ADK. There is **no formal cross-vendor standard** for compaction, but clear patterns have emerged:

1. **Compaction should be opt-in and client-controlled** (threshold, strategy, instructions)
2. **Compaction events must be emitted** (stop reasons, content blocks, streaming events)
3. **Usage metadata must be transparent** (separate billing for compaction iterations)
4. **The compacted output must be deterministic and structurally valid** (no orphaned tool references, no erratic token counts)

MiniMax M2.5's behavior — silent, unpredictable compaction with no events, no configuration, and wildly oscillating effective context (300–140K) — violates every established pattern.

---

## 1. Anthropic Claude

**Source:** [platform.claude.com/docs/en/build-with-claude/compaction](https://platform.claude.com/docs/en/build-with-claude/compaction)

### Approach
- **Server-side summarization** (recommended) + **Client-side SDK compaction** (alternative)
- When input tokens exceed a configurable trigger threshold, Claude generates a structured summary of the conversation, creates a `compaction` content block, and continues the response with compacted context.
- On subsequent requests, all message blocks prior to the latest `compaction` block are dropped.

### API Contract
- **Beta header:** `compact-2026-01-12`
- **Parameter:** `context_management.edits[].type = "compact_20260112"`
- **Configurable trigger:** `trigger.type = "input_tokens"`, `trigger.value = N` (min 50,000, default 150,000)
- **Custom summarization instructions:** `instructions` parameter completely replaces default prompt
- **Pause mechanism:** `pause_after_compaction: true` → API returns with `stop_reason: "compaction"`, allowing client to inject additional context before continuation

### Events Emitted
- ✅ **`compaction` content block** in response (type: `"compaction"`, content: summary text)
- ✅ **`stop_reason: "compaction"`** when pause_after_compaction is enabled
- ✅ **Streaming events:** `content_block_start` (type=compaction), `content_block_delta` (type=compaction_delta), `content_block_stop`
- ✅ **Usage iterations array:** Separate `compaction` and `message` iteration entries with individual input/output token counts

### Usage/Billing Transparency
```json
{
  "usage": {
    "input_tokens": 45000,
    "output_tokens": 1234,
    "iterations": [
      {"type": "compaction", "input_tokens": 180000, "output_tokens": 3500},
      {"type": "message", "input_tokens": 23000, "output_tokens": 1000}
    ]
  }
}
```
Top-level `input_tokens`/`output_tokens` exclude compaction; full cost requires summing `iterations[]`.

### Client Control
- ✅ Trigger threshold (configurable, min 50K)
- ✅ Custom summarization prompt
- ✅ Pause-after-compaction for mid-compaction injection
- ✅ Token counting endpoint respects existing compaction blocks
- ✅ Prompt caching integration (cache_control on compaction blocks)

### Additional Context Editing Strategies
- **Tool result clearing** (`clear_tool_uses_20250919`): Clears old tool results, replaces with placeholders
- **Thinking block clearing** (`clear_thinking_20251015`): Manages extended thinking blocks
- **Memory tool integration:** Claude can save context to memory files before clearing

### Maximum Context Window
- 200K tokens (standard), 1M tokens (beta, Opus 4.6 / Sonnet 4.6)

### What Happens When Context Exceeded
- Without compaction: API returns error (token limit exceeded)
- With compaction: Automatic summarization at threshold, conversation continues seamlessly

### Supported Models
- Claude Opus 4.6, Claude Sonnet 4.6

---

## 2. OpenAI

**Source:** [developers.openai.com/api/docs/guides/compaction](https://developers.openai.com/api/docs/guides/compaction/)

### Approach
- **Server-side compaction** via Responses API + **Standalone `/responses/compact` endpoint**
- When token count crosses `compact_threshold`, server runs compaction automatically
- Returns an **opaque, encrypted compaction item** (not human-readable) that carries forward state

### API Contract
- **Parameter:** `context_management = [{"type": "compaction", "compact_threshold": N}]` in `POST /responses`
- **Standalone endpoint:** `POST /responses/compact` for explicit, stateless compaction
- **Chaining:** Supports stateless input-array chaining (append output items) or `previous_response_id` chaining

### Events Emitted
- ✅ **Compaction item in response stream** (encrypted, opaque)
- ✅ ZDR-friendly when `store=false`
- Items before the most recent compaction item can be dropped for latency optimization

### Client Control
- ✅ `compact_threshold` (configurable token count)
- ✅ Standalone endpoint for explicit compaction calls
- ✅ Choice between auto (server-side) and manual (standalone endpoint)
- ❌ No custom summarization instructions (opaque/encrypted output)
- ❌ No pause mechanism

### Key Difference from Anthropic
OpenAI's compaction output is **encrypted and opaque** — the client cannot inspect or modify the summary. Anthropic's is **plaintext and transparent**.

### Additional Context Management
- **`truncation: "auto"`** on Responses API — automatically truncates to fit context
- **Conversation state API** — persistent conversation objects with auto state management

### Maximum Context Window
- GPT-5.2: 400K tokens
- GPT-4o: 128K tokens

### What Happens When Context Exceeded
- Without compaction: `context_length_exceeded` error
- With `truncation: "auto"`: Silent truncation (earliest tokens dropped)
- With compaction: Automatic compaction at threshold, encrypted item carries state forward

---

## 3. Google Gemini

**Source:** Multiple (Google Cloud docs, AI Studio, community forums)

### Approach
- **No built-in API-level compaction**
- Relies on **very large context windows** (up to 1M–2M tokens) to avoid the problem
- Client-side management is expected (truncation, summarization, chunking)
- Google ADK provides framework-level compaction (see Section 5)

### API Contract
- **No `context_management` or compaction parameter** in `generate_content` API
- When input exceeds context window, API either:
  - Returns an error
  - Silently truncates earliest tokens (behavior varies by model/endpoint)

### Events Emitted
- ❌ **No compaction events**
- ❌ **No structured notification of truncation**
- Silent truncation when it occurs

### Client Control
- ❌ No server-side compaction configuration
- `maxOutputTokens` parameter controls output length
- Client responsible for all context management

### Maximum Context Window
- Gemini 3.0 Pro: 2M tokens
- Gemini 2.5 Pro/Flash: 1M tokens
- Gemini 1.5 Pro: 1M tokens (2M in some variants)

### What Happens When Context Exceeded
- **Inconsistent behavior:** Some models return errors, others silently truncate
- Known bugs with premature truncation (e.g., Gemini 2.5 Pro truncating at 90K–130K despite 250K capacity)
- Live API sessions exceeding limits may not auto-compress or truncate, leading to errors

### Google ADK (Agent Development Kit) Context Compression
- Framework-level (not API-level) compaction via `EventsCompactionConfig`
- Sliding window approach with configurable `compaction_interval` and `overlap_size`
- Optional `LlmEventSummarizer` with custom model for summarization
- Runs in background via ADK Runner
- **Not exposed at the Gemini API level** — only available through ADK framework

---

## 4. Open Source Frameworks

### 4a. LangChain

**Source:** [blog.langchain.com/context-management-for-deepagents](https://blog.langchain.com/context-management-for-deepagents/)

#### Approach
- **Multi-strategy:** Summarization, offloading (filesystem), truncation
- **Deep Agents SDK** provides context compression pipeline:
  1. Large tool outputs (>20K tokens) offloaded to disk, replaced with references
  2. When offloading insufficient, full conversation summarized to disk, replaced with structured summary
  3. Filesystem abstraction for external storage

#### Memory Types
- `ConversationBufferMemory` — full history (no compaction)
- `ConversationSummaryMemory` — summarizes conversation
- `ConversationSummaryBufferMemory` — hybrid: recent messages verbatim + summary of older
- `ConversationTokenBufferMemory` — sliding window by token count

#### Client Control
- ✅ Full control over strategy selection
- ✅ Custom summarization prompts
- ✅ Configurable thresholds
- ✅ Multiple backend options (Redis, vector stores, filesystem)

### 4b. LlamaIndex

#### Approach
- **Contextual compression** for RAG pipelines
- `ContextualCompressionRetriever` filters/compresses retrieved documents based on query relevance
- Integration with LLMLingua for compression
- Focus is on retrieval compression rather than conversation compaction

### 4c. Google ADK (see Section 3 above)

### 4d. compact-memory (Open Source Toolkit)

**Source:** [github.com/scottfalconer/compact-memory](https://github.com/scottfalconer/compact-memory)

- Open-source Python framework for advanced context compression
- Supports custom compression engines, gist-based memory
- CLI and Python API
- Focused on developing and sharing compression strategies

### 4e. ForgeCode

**Source:** [forgecode.dev/docs/context-compaction](https://forgecode.dev/docs/context-compaction/)

- Configurable thresholds (token count, message count, user turns)
- Selects messages for summarization, replaces originals with summaries
- Preserves reasoning chains and conversation flow

---

## 5. Model Context Protocol (MCP)

**Source:** [modelcontextprotocol.io/specification/2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)

### Current State
- MCP is an **open standard for tool/resource integration** with LLMs (JSON-RPC 2.0 based)
- **MCP does NOT specify context compaction or management** in its protocol
- MCP focuses on: tool invocation, prompts, resources, sampling, elicitation
- No compaction-related messages, events, or capabilities in the spec

### What MCP Covers
- Capability negotiation between client/server
- Tool execution and structured output
- Prompts and resources
- Server-initiated requests (elicitation, sampling)
- OAuth 2.0 security model
- Protocol versioning (`MCP-Protocol-Version` header)

### What MCP Does NOT Cover
- ❌ Context window management
- ❌ Compaction/summarization
- ❌ Token counting or budget management
- ❌ Conversation state management

### Security Considerations
- CoSAI (OASIS workstream) has published MCP security analysis
- Focus on authentication, data sanitization, sandboxing — not context management

---

## 6. Emerging Standards

### Current Status: **No Formal Standard Exists**

As of March 2026, there is **no ratified standard** from AI Alliance, OASIS, NIST, or any standards body for context compaction. However:

#### De Facto Patterns
The Anthropic and OpenAI implementations have established de facto patterns:

| Aspect | Anthropic Pattern | OpenAI Pattern |
|--------|------------------|----------------|
| Trigger | Token threshold (configurable) | Token threshold (configurable) |
| Compaction output | Plaintext summary (transparent) | Encrypted opaque item |
| Events | Content blocks + stop_reason | Output items in stream |
| Client control | Full (threshold, instructions, pause) | Partial (threshold only) |
| Billing transparency | Iterations array with separate counts | Standard usage reporting |
| Caching integration | ✅ Prompt caching compatible | ✅ Prompt caching compatible |

#### Research Contributions
- **ACON framework** (arxiv 2510.00615): Optimizes compression prompts via failure-driven refinement, 26–54% memory savings, 95%+ task accuracy
- **Factory's anchored iterative summarization**: Extends previous summaries incrementally rather than full reconstruction
- **AI Observational Memory**: Background agents distill key information into prioritized notes

#### Industry Direction
Multiple articles (Bermudez 2026, Kargar 2026, Myung 2026) identify compaction as a "missing design principle" but no formal standardization effort has been announced.

---

## 7. Best Practices Consensus

Based on the research, here is the emerging consensus:

### Should compaction be transparent or silent?
**TRANSPARENT.** Both Anthropic (plaintext summaries) and OpenAI (compaction items in stream) make compaction visible. Silent compaction (like MiniMax's behavior) is universally considered problematic because:
- Clients cannot track effective context size
- Debugging becomes impossible
- Cost accounting is unreliable

### Should there be a compaction event/webhook?
**YES.** Anthropic emits:
- `content_block_start` (type=compaction) during streaming
- `stop_reason: "compaction"` for pause-after-compaction
- `context_management.applied_edits[]` in response for context editing

OpenAI includes compaction items in the response output stream.

### Should the client control compaction strategy?
**YES.** Both major providers offer:
- Configurable token thresholds
- Anthropic additionally offers: custom summarization prompts, pause-after-compaction, exclude_tools
- Minimum thresholds to prevent excessive compaction (Anthropic: min 50K tokens)

### What metadata should be preserved through compaction?
Per Anthropic's default prompt and Claude Code's implementation:
- Task state and progress
- Next steps and learnings
- Key decisions and constraints
- File paths and technical details
- User preferences and commitments
- Recent tool results and active work

### How should important/pinned context be handled?
- **Anthropic:** `pause_after_compaction` allows injecting pinned content post-compaction; `exclude_tools` protects specific tool results; custom `instructions` focus preservation
- **OpenAI:** Less flexible — opaque compaction, but `previous_response_id` carries state automatically
- **LangChain:** System prompts and pinned messages excluded from summarization window

---

## 8. Comparison Matrix

| Feature | Anthropic Claude | OpenAI | Google Gemini | MiniMax M2.5 (observed) |
|---------|-----------------|--------|---------------|------------------------|
| **Compaction approach** | Summarization (plaintext) | Summarization (encrypted) | None (large window) | Unknown/erratic |
| **API parameter** | `context_management.edits` | `context_management` | N/A | None documented |
| **Configurable threshold** | ✅ (min 50K, default 150K) | ✅ (`compact_threshold`) | N/A | ❌ |
| **Events emitted** | ✅ (content blocks, stop_reason, streaming) | ✅ (output items) | ❌ | ❌ |
| **Custom instructions** | ✅ | ❌ (opaque) | N/A | ❌ |
| **Pause mechanism** | ✅ (`pause_after_compaction`) | ❌ | N/A | ❌ |
| **Billing transparency** | ✅ (`iterations[]` array) | Standard | N/A | Unknown |
| **Output inspectable** | ✅ (plaintext summary) | ❌ (encrypted) | N/A | N/A |
| **Prompt caching compatible** | ✅ | ✅ | N/A | Unknown |
| **Token counting post-compaction** | ✅ (`/count_tokens`) | ✅ | N/A | ❌ |
| **Max context window** | 200K (1M beta) | 400K (GPT-5.2) | 1M–2M | 256K |
| **Behavior on exceeded** | Error (or compact) | Error / truncation / compact | Error / silent truncation | Erratic oscillation |
| **ZDR compatible** | ✅ | ✅ (`store=false`) | N/A | Unknown |

---

## 9. Assessment of MiniMax M2.5 Behavior

Based on the standards established by Anthropic and OpenAI, MiniMax M2.5's observed behavior is **non-conformant** in every dimension:

| Standard Practice | MiniMax M2.5 Behavior | Verdict |
|------------------|----------------------|---------|
| Compaction is opt-in with configurable threshold | Compaction happens silently and unpredictably | ❌ VIOLATION |
| Compaction events are emitted | No events emitted | ❌ VIOLATION |
| Effective context is predictable | Oscillates wildly (300–140K tokens) | ❌ VIOLATION |
| Tokens removed follow a consistent strategy | Tokens removed unpredictably | ❌ VIOLATION |
| Client can control/configure compaction | No configuration available | ❌ VIOLATION |
| Billing/usage is transparent | Unknown impact on billing | ❌ VIOLATION |

### Recommendation
When using Anthropic-compatible APIs from third-party providers, the minimum expectation should be:
1. **No silent modification** of the conversation — if compaction occurs, it must be visible
2. **Predictable behavior** — effective context should not oscillate
3. **Events/metadata** — at minimum, the response should indicate that compaction occurred
4. **Client opt-in** — compaction should not happen without the client requesting it

---

## 10. Source URLs

### Primary Documentation
- Anthropic Compaction: https://platform.claude.com/docs/en/build-with-claude/compaction
- Anthropic Context Editing: https://platform.claude.com/docs/en/build-with-claude/context-editing
- OpenAI Compaction: https://developers.openai.com/api/docs/guides/compaction/
- OpenAI Compact Endpoint: https://developers.openai.com/api/reference/resources/responses/methods/compact/
- Google ADK Compaction: https://google.github.io/adk-docs/context/compaction/
- MCP Specification: https://modelcontextprotocol.io/specification/2025-11-25

### Technical Articles
- Anthropic Context Engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- LangChain Deep Agents Context: https://blog.langchain.com/context-management-for-deepagents/
- Google ADK Architecture: https://developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework-for-production/
- ACON Paper: https://arxiv.org/abs/2510.00615v2

### Community/Analysis
- Claude Code Compaction Deep Dive: https://decodeclaude.com/compaction-deep-dive/
- Zylos LLM Context Management: https://zylos.ai/research/2026-01-19-llm-context-management
- Zylos Agent Context Compression: https://zylos.ai/research/2026-02-28-ai-agent-context-compression-strategies
- Redis Context Window Overflow: https://redis.io/blog/context-window-overflow/

### GitHub Issues (relevant implementations)
- OpenClaw Anthropic Compaction: https://github.com/openclaw/openclaw/issues/13752
- Google ADK Compaction Enhancement: https://github.com/google/adk-python/issues/4146
- Anthropic SDK context_management: https://github.com/anthropics/claude-agent-sdk-python/issues/581
