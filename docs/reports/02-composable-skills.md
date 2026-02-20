# Report: Composable Skill System

## Problem
The recording/workflow system captured sessions but had no structured way to:
- Decompose workflows into reusable building blocks
- Learn from failures (same tool+target failing repeatedly)
- Inject site-specific knowledge into the model's context
- Differentiate between successful and failed tool patterns

## What Changed

### Files Modified (4)
| File | Change |
|------|--------|
| `shared/src/recording.ts` | Added `AtomicSkill` and `ComposedSkill` types |
| `background/service.ts` | Added `failureTracker` to SessionState, failure dedup in `executeToolByName`, `getMatchedSkills()`, skill injection in `enhanceSystemPrompt` |
| `ui/chat/panel-workflows.ts` | Extract positive/negative examples from `historyTurnMap`, save workflow as composable skill |
| `background/service.ts` | Pass `matchedSkills` to both `enhanceSystemPrompt` call sites |

### Lines Added/Removed
- **+145 / -5** across source files (net +140)

## Architecture

### Type System (`recording.ts`)
```
AtomicSkill = single tool call + pre/postconditions
ComposedSkill = sequence of AtomicSkills + examples + metadata
```

A `ComposedSkill` carries:
- `sitePattern` — regex for URL matching
- `steps` — ordered `AtomicSkill[]`
- `positiveExamples` — tool calls that succeeded (from session history)
- `negativeExamples` — tool calls that failed (deduplicated, first-occurrence only)
- `successCount` / `failureCount` — lifetime counters for quality tracking

### Failure Deduplication (`service.ts`)
In `executeToolByName`, a `failureTracker` Map keyed by `toolName:selector|url` counts consecutive failures. After 3 failures on the same tool+target:
- Injects `_failureAdvice` into the result: "Try a fundamentally different approach"
- Resets on success

This prevents the model from retrying the same broken selector/URL indefinitely.

### Skill Injection (`service.ts`)
`getMatchedSkills(url)`:
1. Loads skills from `chrome.storage.local`
2. Filters by `sitePattern` regex against current URL
3. Returns top 5 matches

`enhanceSystemPrompt` injects an `<available_skills>` XML section when matches exist, giving the model pre-built step sequences for the current site.

### Workflow → Skill Extraction (`panel-workflows.ts`)
When generating a workflow from session:
1. Iterates `historyTurnMap` for `tool_execution_result` events
2. Separates into positive examples (success) and negative examples (failure)
3. Deduplicates failures (only first occurrence per key)
4. Saves alongside the workflow in `chrome.storage.local` under `'skills'` key

## Design Decisions

1. **Storage in `chrome.storage.local`** — Skills persist alongside workflows. No new storage mechanism needed.
2. **sitePattern as glob-to-regex** — Simple `*` → `.*` conversion. Covers the 90% case without requiring users to write regex.
3. **Top 5 limit** — Prevents system prompt bloat. Skills are ordered by storage position (FIFO).
4. **First-failure-only for negatives** — Prevents flooding examples with the same error repeated 50 times.

## What's NOT Included
- Skill composition UI (creating ComposedSkills from AtomicSkills in the UI)
- Skill success/failure counter incrementing during runtime
- Skill editing/deletion UI
- Cross-session skill ranking by reliability

## Risk Assessment
- **Low risk**: Failure tracker is per-session (cleared on new session). Skill injection is read-only from storage.
- **Edge case**: If `chrome.storage.local` has corrupted `skills` array, `getMatchedSkills` catches and returns `[]`.
