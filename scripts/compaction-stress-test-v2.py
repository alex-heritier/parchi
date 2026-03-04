#!/usr/bin/env python3
"""
Autocompaction stress test v2 — with per-turn token auditing.

Goal: prove compaction happens by tracking input_tokens every turn.
If the API compacts, input_tokens will DROP or PLATEAU instead of
monotonically increasing. That drop IS the compaction event.

Strategy:
  - Massive filler prompts (~2K tokens each)
  - Request max_tokens=4096 responses to balloon history fast
  - Log input_tokens + output_tokens every single turn
  - Detect & flag any turn where input_tokens < previous input_tokens + previous output_tokens
  - Run until we hit an API error (context too long) or detect compaction
"""

import json
import time
import datetime
import os
import sys
import urllib.request
import urllib.error

# ── Config ──────────────────────────────────────────────────────────────────
API_KEY = os.environ.get(
    "ANTHROPIC_API_KEY",
    "sk-cp-VZXCwLKJP1zX0mYOVmjDfr-gGLupgGQ8mpzB0n83whbH01xEntzonMLp9FvT04hNjuguGNRalskz4nS3IoNhEbLI0WDYFG84unUdAfn1ALnXSIA7etYTXgY",
)
BASE_URL = os.environ.get("ANTHROPIC_BASE_URL", "https://api.minimax.io/anthropic")
MODEL = os.environ.get("ANTHROPIC_MODEL", "MiniMax-M2.5")
MAX_TOKENS = 4096           # request long responses to fill context fast
TOTAL_TURNS = 300           # high ceiling — we'll stop on compaction or error
PROBE_EVERY = 10

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "test-output")
TIMESTAMP = datetime.datetime.now().strftime("%Y%m%dT%H%M%S")
TRANSCRIPT_PATH = os.path.join(OUT_DIR, f"compaction-v2-{TIMESTAMP}.json")
METRICS_PATH = os.path.join(OUT_DIR, f"compaction-v2-{TIMESTAMP}-metrics.md")

# ── Seed facts ─────────────────────────────────────────────────────────────
SEED_FACTS = {
    "PROJECT_CODENAME": "ORBIT-DELTA-917",
    "LEAD_ENGINEER": "Dr. Yuki Tanaka",
    "BUDGET_USD": "4,218,903.77",
    "LAUNCH_DATE": "2027-11-03",
    "PRIMARY_LANGUAGE": "Rust",
    "SATELLITE_COUNT": "14",
    "HQ_CITY": "Reykjavik",
    "ENCRYPTION_ALGO": "ChaCha20-Poly1305",
    "DATABASE_ENGINE": "TigerBeetle",
    "MASCOT_NAME": "Nimbus the Otter",
    "MAX_ALTITUDE_KM": "487.3",
    "RELAY_PROTOCOL": "QUIC-v2",
    "BACKUP_SITE": "Ushuaia",
    "PATCH_CADENCE": "every 13 days",
    "LEGAL_ENTITY": "Boreal Dynamics GmbH",
    "BOARD_CHAIR": "Ingrid Solberg",
    "FLEET_SIZE": "38 drones",
    "COMMS_FREQUENCY_GHZ": "28.7",
    "HEAT_SHIELD_MATERIAL": "Nextel 440",
    "FAILOVER_TIMEOUT_MS": "1750",
}

SEED_BLOCK = "CRITICAL PROJECT REFERENCE — you MUST memorise every single detail:\n" + "\n".join(
    f"  {k} = {v}" for k, v in SEED_FACTS.items()
)

# ── Massive filler prompts (designed to generate long responses) ───────────
FILLER_TASKS = [
    "Write a comprehensive 3000-word technical specification for a distributed consensus protocol that handles network partitions, Byzantine faults, and clock skew. Include pseudocode for all message types, state transitions, and recovery procedures. Cover leader election, log replication, snapshotting, and membership changes.",
    "Create an exhaustive reference manual for a hypothetical programming language called 'Meridian'. Cover its type system (dependent types, linear types, effect types), memory model, concurrency primitives, pattern matching, macro system, and standard library. Provide code examples for each feature.",
    "Write a detailed incident post-mortem for a fictional cascading failure in a microservices architecture. The failure started with a memory leak in a payment service, cascaded through a circuit breaker misconfiguration, overwhelmed a message queue, caused data inconsistency in an order database, and triggered a 4-hour outage. Include timeline, root cause analysis, contributing factors, action items, and lessons learned.",
    "Design a complete real-time multiplayer game networking architecture. Cover client-side prediction, server reconciliation, lag compensation, interest management, delta compression, snapshot interpolation, and anti-cheat. Provide pseudocode for the netcode layer, serialization format, and tick synchronization.",
    "Write an in-depth analysis of 15 different garbage collection algorithms: mark-sweep, mark-compact, copying, generational, incremental, concurrent mark-sweep, G1, ZGC, Shenandoah, Epsilon, reference counting, cycle detection, region-based, Immix, and Sapphire. Compare pause times, throughput, memory overhead, and implementation complexity.",
    "Create a full RFC-style specification for a new binary protocol called SWIFTLINK. Cover framing, multiplexing, flow control, encryption negotiation, compression, error codes, keepalives, graceful shutdown, and extension mechanisms. Include ABNF grammar, state machine diagrams described textually, and example message sequences.",
    "Write an operating systems textbook chapter on virtual memory. Cover page tables (single-level, multi-level, inverted), TLBs, page replacement algorithms (FIFO, LRU, Clock, WSClock, aging), demand paging, copy-on-write, memory-mapped files, huge pages, NUMA awareness, and kernel address space layout. Include diagrams described in text.",
    "Design a complete search engine architecture from crawling to ranking. Cover URL frontier management, politeness policies, content extraction, inverted index construction, BM25 scoring, PageRank, learning-to-rank with features, query parsing, spelling correction, autocomplete, snippet generation, and A/B testing infrastructure.",
    "Write a comprehensive guide to implementing a SQL query optimizer. Cover parsing, logical plan generation, predicate pushdown, join reordering (dynamic programming and greedy), cost estimation (histograms, HyperLogLog), physical plan selection (hash join vs merge join vs nested loop), parallel execution, and adaptive query execution.",
    "Create a detailed security architecture document for a banking API platform. Cover authentication (OAuth2, mTLS, FIDO2), authorization (RBAC, ABAC, policy engines), encryption (at-rest, in-transit, application-level), key management (HSMs, key rotation), audit logging, intrusion detection, rate limiting, DDoS protection, PCI-DSS compliance, and incident response procedures.",
]


def make_probe_prompt(turn_num: int) -> str:
    keys = list(SEED_FACTS.keys())
    # Test ALL 20 facts, not just 5
    items = ", ".join(keys)
    return (
        f"RECALL CHECK (turn {turn_num}): State the EXACT values for ALL of these project fields: {items}. "
        "Reply ONLY in the format KEY = VALUE, one per line, nothing else. Do not skip any."
    )


def make_filler_prompt(turn_num: int) -> str:
    task = FILLER_TASKS[turn_num % len(FILLER_TASKS)]
    return f"[Turn {turn_num}] {task} Be maximally thorough and verbose. Do not abbreviate or summarize — write everything out in full."


# ── API call with full response capture ────────────────────────────────────
def call_api(messages: list, retries: int = 3) -> dict:
    """Returns {'text': str, 'input_tokens': int, 'output_tokens': int, 'raw_keys': list, 'stop_reason': str}"""
    url = f"{BASE_URL}/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01",
    }
    body = json.dumps({
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": messages,
    }).encode()

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=180) as resp:
                data = json.loads(resp.read().decode())

                text = ""
                for block in data.get("content", []):
                    if block.get("type") == "text":
                        text = block.get("text", "")
                        break

                usage = data.get("usage", {})
                return {
                    "text": text,
                    "input_tokens": usage.get("input_tokens", -1),
                    "output_tokens": usage.get("output_tokens", -1),
                    "stop_reason": data.get("stop_reason", "unknown"),
                    "raw_keys": list(data.keys()),
                }
        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            print(f"  [HTTP {e.code}] attempt {attempt+1}/{retries}: {err_body[:300]}")
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            # Context too long error — this is valuable data!
            if e.code == 400 and ("too long" in err_body.lower() or "too many tokens" in err_body.lower() or "context" in err_body.lower()):
                return {
                    "text": f"[CONTEXT_LIMIT_ERROR: HTTP {e.code}] {err_body[:500]}",
                    "input_tokens": -1,
                    "output_tokens": 0,
                    "stop_reason": "context_limit_exceeded",
                    "error": err_body[:1000],
                }
            raise
        except Exception as e:
            print(f"  [ERR] attempt {attempt+1}/{retries}: {e}")
            if attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise
    return {"text": "[ERROR: all retries exhausted]", "input_tokens": -1, "output_tokens": 0, "stop_reason": "error"}


# ── Recall scorer (all 20 facts) ──────────────────────────────────────────
def score_recall(response: str) -> dict:
    results = {}
    for key, expected in SEED_FACTS.items():
        found = expected.lower() in response.lower()
        results[key] = {"expected": expected, "found": found}
    total = len(results)
    correct = sum(1 for v in results.values() if v["found"])
    return {"accuracy": correct / total if total else 0, "correct": correct, "total": total, "details": results}


# ── Main ───────────────────────────────────────────────────────────────────
def main():
    print(f"=== Autocompaction Stress Test v2 (token-audited) ===")
    print(f"Model: {MODEL}")
    print(f"Endpoint: {BASE_URL}")
    print(f"Max tokens per response: {MAX_TOKENS}")
    print(f"Target turns: {TOTAL_TURNS}")
    print(f"Probe every: {PROBE_EVERY} turns")
    print(f"Transcript: {TRANSCRIPT_PATH}")
    print()

    messages = []
    transcript = []
    probes = []
    token_log = []  # per-turn token tracking
    compaction_events = []

    prev_input_tokens = 0
    prev_output_tokens = 0

    # Turn 0: inject seed facts
    print(f"[Turn 0] Injecting {len(SEED_FACTS)} seed facts...")
    messages.append({"role": "user", "content": SEED_BLOCK})
    result = call_api(messages)
    messages.append({"role": "assistant", "content": result["text"]})

    token_entry = {
        "turn": 0,
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "cumulative_generated": result["output_tokens"],
        "stop_reason": result["stop_reason"],
    }
    token_log.append(token_entry)
    prev_input_tokens = result["input_tokens"]
    prev_output_tokens = result["output_tokens"]

    transcript.append({
        "turn": 0, "type": "seed",
        "user": SEED_BLOCK, "assistant": result["text"],
        "tokens": token_entry,
    })
    print(f"  -> {len(result['text'])} chars, {result['input_tokens']} in / {result['output_tokens']} out tokens")

    cumulative_output = result["output_tokens"]

    for turn in range(1, TOTAL_TURNS + 1):
        is_probe = (turn % PROBE_EVERY == 0)
        prompt = make_probe_prompt(turn) if is_probe else make_filler_prompt(turn)
        ptype = "probe" if is_probe else "filler"

        print(f"[Turn {turn}/{TOTAL_TURNS}] {ptype}...", end=" ", flush=True)
        messages.append({"role": "user", "content": prompt})

        t0 = time.time()
        result = call_api(messages)
        elapsed = time.time() - t0

        # Check for context limit error
        if result["stop_reason"] == "context_limit_exceeded":
            print(f"\n*** CONTEXT LIMIT HIT at turn {turn} ***")
            print(f"  Error: {result.get('error', 'unknown')[:200]}")
            transcript.append({
                "turn": turn, "type": "context_limit",
                "user": prompt, "assistant": result["text"],
                "elapsed_s": round(elapsed, 2),
            })
            messages.pop()  # remove the failed user message
            break

        messages.append({"role": "assistant", "content": result["text"]})
        cumulative_output += result["output_tokens"]

        # ── COMPACTION DETECTION ──
        # Expected: input_tokens should be >= prev_input_tokens + prev_output_tokens + new_user_prompt_tokens
        # If input_tokens DROPS compared to previous, compaction happened.
        expected_min = prev_input_tokens + prev_output_tokens
        actual_input = result["input_tokens"]
        compacted = False
        token_delta = actual_input - expected_min

        if actual_input > 0 and prev_input_tokens > 0 and actual_input < expected_min:
            compacted = True
            tokens_removed = expected_min - actual_input
            compaction_events.append({
                "turn": turn,
                "expected_min_input": expected_min,
                "actual_input": actual_input,
                "tokens_removed": tokens_removed,
                "prev_input": prev_input_tokens,
                "prev_output": prev_output_tokens,
            })
            print(f"*** COMPACTION DETECTED! expected>={expected_min}, got {actual_input}, removed ~{tokens_removed} tokens ***", end=" ")

        token_entry = {
            "turn": turn,
            "input_tokens": actual_input,
            "output_tokens": result["output_tokens"],
            "expected_min_input": expected_min,
            "token_delta": token_delta,
            "compacted": compacted,
            "cumulative_generated": cumulative_output,
            "stop_reason": result["stop_reason"],
        }
        token_log.append(token_entry)

        entry = {
            "turn": turn,
            "type": ptype,
            "user": prompt,
            "assistant": result["text"],
            "elapsed_s": round(elapsed, 2),
            "msg_count": len(messages),
            "tokens": token_entry,
        }

        if is_probe:
            score = score_recall(result["text"])
            entry["recall"] = score
            probes.append({"turn": turn, "input_tokens": actual_input, **score})
            lost = [k for k, v in score["details"].items() if not v["found"]]
            lost_str = ", ".join(lost[:5]) if lost else "none"
            print(f"recall={score['accuracy']:.0%} ({score['correct']}/{score['total']}) in={actual_input} out={result['output_tokens']} ({elapsed:.1f}s) lost=[{lost_str}]")
        else:
            print(f"in={actual_input} out={result['output_tokens']} delta={token_delta:+d} ({elapsed:.1f}s, {len(result['text'])} chars){' COMPACTED!' if compacted else ''}")

        transcript.append(entry)
        prev_input_tokens = actual_input
        prev_output_tokens = result["output_tokens"]

        # Stop if total recall collapse on TWO consecutive probes
        if is_probe and len(probes) >= 2 and probes[-1]["accuracy"] == 0 and probes[-2]["accuracy"] == 0:
            print(f"\n*** TOTAL RECALL COLLAPSE (2 consecutive 0%) at turn {turn} — stopping ***")
            break

    # ── Write outputs ──────────────────────────────────────────────────────
    os.makedirs(OUT_DIR, exist_ok=True)

    output = {
        "config": {
            "model": MODEL, "base_url": BASE_URL,
            "max_tokens": MAX_TOKENS, "total_turns": TOTAL_TURNS,
            "probe_every": PROBE_EVERY, "seed_facts": SEED_FACTS,
            "timestamp": TIMESTAMP,
        },
        "transcript": transcript,
        "probes": probes,
        "token_log": token_log,
        "compaction_events": compaction_events,
        "summary": {
            "turns_completed": len(transcript),
            "compaction_events_detected": len(compaction_events),
            "final_input_tokens": token_log[-1]["input_tokens"] if token_log else -1,
            "peak_input_tokens": max(t["input_tokens"] for t in token_log) if token_log else -1,
            "total_output_tokens": cumulative_output,
        },
    }

    with open(TRANSCRIPT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    # ── Metrics markdown ───────────────────────────────────────────────────
    lines = [
        f"# Autocompaction Stress Test v2 — {TIMESTAMP}",
        f"",
        f"- **Model**: {MODEL}",
        f"- **Endpoint**: {BASE_URL}",
        f"- **Max tokens/response**: {MAX_TOKENS}",
        f"- **Turns completed**: {len(transcript)}",
        f"- **Seed facts**: {len(SEED_FACTS)}",
        f"- **Peak input_tokens**: {output['summary']['peak_input_tokens']:,}",
        f"- **Final input_tokens**: {output['summary']['final_input_tokens']:,}",
        f"- **Total output_tokens generated**: {cumulative_output:,}",
        f"- **Compaction events detected**: {len(compaction_events)}",
        f"",
    ]

    if compaction_events:
        lines.append("## Compaction Events")
        lines.append("")
        lines.append("| Turn | Expected Min Input | Actual Input | Tokens Removed |")
        lines.append("|------|-------------------|-------------|----------------|")
        for ce in compaction_events:
            lines.append(f"| {ce['turn']} | {ce['expected_min_input']:,} | {ce['actual_input']:,} | {ce['tokens_removed']:,} |")
        lines.append("")

    lines.append("## Token Growth Per Turn")
    lines.append("")
    lines.append("| Turn | Input Tokens | Output Tokens | Expected Min | Delta | Compacted? |")
    lines.append("|------|-------------|--------------|-------------|-------|------------|")
    for t in token_log:
        c = "YES" if t.get("compacted") else ""
        exp = t.get("expected_min_input", "n/a")
        lines.append(f"| {t['turn']} | {t['input_tokens']:,} | {t['output_tokens']:,} | {exp} | {t.get('token_delta', 'n/a'):+,} | {c} |")
    lines.append("")

    lines.append("## Recall Probes")
    lines.append("")
    lines.append("| Turn | Input Tokens | Accuracy | Lost Facts |")
    lines.append("|------|-------------|----------|------------|")
    for p in probes:
        lost = [k for k, v in p["details"].items() if not v["found"]]
        lost_str = ", ".join(lost) if lost else "none"
        lines.append(f"| {p['turn']} | {p['input_tokens']:,} | {p['accuracy']:.0%} ({p['correct']}/{p['total']}) | {lost_str} |")

    lines.append("")
    lines.append(f"Full transcript: `{TRANSCRIPT_PATH}`")

    with open(METRICS_PATH, "w") as f:
        f.write("\n".join(lines))

    print(f"\n{'='*60}")
    print(f"DONE.")
    print(f"  Turns completed:    {len(transcript)}")
    print(f"  Compaction events:  {len(compaction_events)}")
    print(f"  Peak input_tokens:  {output['summary']['peak_input_tokens']:,}")
    print(f"  Final input_tokens: {output['summary']['final_input_tokens']:,}")
    print(f"  Metrics: {METRICS_PATH}")
    print(f"  Transcript: {TRANSCRIPT_PATH}")


if __name__ == "__main__":
    main()
