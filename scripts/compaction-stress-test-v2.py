#!/usr/bin/env python3
"""Professional compaction validation harness (v2).

Key upgrades over the initial prototype:
- No inline secrets; API key is required via environment variable.
- Structured event stream (`.events.jsonl`) for auditability.
- Atomic checkpoint writes for crash/interruption recovery.
- Explicit compaction-event detection with configurable slack.
- Deterministic machine-readable final report (`.json`) + human summary (`.md`).
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_BASE_URL = "https://api.minimax.io/anthropic"
DEFAULT_MODEL = "MiniMax-M2.5"
DEFAULT_MAX_TOKENS = 4096
DEFAULT_TOTAL_TURNS = 300
DEFAULT_PROBE_EVERY = 10
DEFAULT_REQUEST_TIMEOUT_S = 180
DEFAULT_RETRIES = 3
DEFAULT_COMPACTION_SLACK_TOKENS = 32
DEFAULT_CHECKPOINT_EVERY = 1

DEFAULT_SEED_FACTS = {
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

DEFAULT_FILLER_TASKS = [
    "Write a comprehensive 3000-word technical specification for a distributed consensus protocol that handles network partitions, Byzantine faults, and clock skew. Include pseudocode for all message types, state transitions, and recovery procedures. Cover leader election, log replication, snapshotting, and membership changes.",
    "Create an exhaustive reference manual for a hypothetical programming language called Meridian. Cover its type system (dependent types, linear types, effect types), memory model, concurrency primitives, pattern matching, macro system, and standard library. Provide code examples for each feature.",
    "Write a detailed incident post-mortem for a fictional cascading failure in a microservices architecture. The failure started with a memory leak in a payment service, cascaded through a circuit breaker misconfiguration, overwhelmed a message queue, caused data inconsistency in an order database, and triggered a 4-hour outage. Include timeline, root cause analysis, contributing factors, action items, and lessons learned.",
    "Design a complete real-time multiplayer game networking architecture. Cover client-side prediction, server reconciliation, lag compensation, interest management, delta compression, snapshot interpolation, and anti-cheat. Provide pseudocode for the netcode layer, serialization format, and tick synchronization.",
    "Write an in-depth analysis of 15 different garbage collection algorithms: mark-sweep, mark-compact, copying, generational, incremental, concurrent mark-sweep, G1, ZGC, Shenandoah, Epsilon, reference counting, cycle detection, region-based, Immix, and Sapphire. Compare pause times, throughput, memory overhead, and implementation complexity.",
    "Create a full RFC-style specification for a new binary protocol called SWIFTLINK. Cover framing, multiplexing, flow control, encryption negotiation, compression, error codes, keepalives, graceful shutdown, and extension mechanisms. Include ABNF grammar, state machine diagrams described textually, and example message sequences.",
    "Write an operating systems textbook chapter on virtual memory. Cover page tables (single-level, multi-level, inverted), TLBs, page replacement algorithms (FIFO, LRU, Clock, WSClock, aging), demand paging, copy-on-write, memory-mapped files, huge pages, NUMA awareness, and kernel address space layout.",
    "Design a complete search engine architecture from crawling to ranking. Cover URL frontier management, politeness policies, content extraction, inverted index construction, BM25 scoring, PageRank, learning-to-rank features, query parsing, spelling correction, autocomplete, snippet generation, and A/B testing infrastructure.",
    "Write a comprehensive guide to implementing a SQL query optimizer. Cover parsing, logical plan generation, predicate pushdown, join reordering (dynamic programming and greedy), cost estimation (histograms, HyperLogLog), physical plan selection (hash join vs merge join vs nested loop), parallel execution, and adaptive query execution.",
    "Create a detailed security architecture document for a banking API platform. Cover authentication (OAuth2, mTLS, FIDO2), authorization (RBAC, ABAC, policy engines), encryption (at-rest, in-transit, application-level), key management (HSMs, key rotation), audit logging, intrusion detection, rate limiting, DDoS protection, PCI-DSS compliance, and incident response procedures.",
]


def utc_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    tmp_path.replace(path)


def emit_event(event_fp: Any, event_type: str, **data: Any) -> None:
    event = {"ts": utc_now(), "event": event_type, **data}
    event_fp.write(json.dumps(event, ensure_ascii=False) + "\n")
    event_fp.flush()


def normalize_value(value: str) -> str:
    return " ".join(value.strip().lower().split())


def parse_key_value_lines(response: str) -> dict[str, str]:
    parsed: dict[str, str] = {}
    for line in response.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        parsed[key.strip().upper()] = value.strip()
    return parsed


def score_recall(response: str, seed_facts: dict[str, str]) -> dict[str, Any]:
    parsed = parse_key_value_lines(response)
    details: dict[str, dict[str, Any]] = {}
    correct = 0

    for key, expected in seed_facts.items():
        actual = parsed.get(key)
        exact_match = actual is not None and normalize_value(actual) == normalize_value(expected)
        fallback_match = normalize_value(expected) in normalize_value(response)
        found = exact_match or fallback_match

        if found:
            correct += 1

        details[key] = {
            "expected": expected,
            "actual": actual,
            "found": found,
            "exact_match": exact_match,
        }

    total = len(seed_facts)
    return {
        "accuracy": correct / total if total else 0,
        "correct": correct,
        "total": total,
        "details": details,
    }


def detect_compaction(
    previous_input_tokens: int,
    previous_output_tokens: int,
    current_input_tokens: int,
    slack_tokens: int,
) -> dict[str, int] | None:
    if previous_input_tokens < 0 or previous_output_tokens < 0 or current_input_tokens < 0:
        return None

    expected_min_input = previous_input_tokens + previous_output_tokens
    removed_tokens_lower_bound = expected_min_input - current_input_tokens

    if removed_tokens_lower_bound > slack_tokens:
        return {
            "expected_min_input_tokens": expected_min_input,
            "observed_input_tokens": current_input_tokens,
            "removed_tokens_lower_bound": removed_tokens_lower_bound,
        }
    return None


def make_seed_prompt(seed_facts: dict[str, str]) -> str:
    lines = ["CRITICAL PROJECT REFERENCE — memorise every single field exactly as written:"]
    for key, value in seed_facts.items():
        lines.append(f"  {key} = {value}")
    return "\n".join(lines)


def make_probe_prompt(turn_num: int, seed_facts: dict[str, str]) -> str:
    keys = ", ".join(seed_facts.keys())
    return (
        f"RECALL CHECK (turn {turn_num}): State the EXACT values for ALL of these project fields: {keys}. "
        "Reply ONLY as KEY = VALUE, one per line, no extra text."
    )


def make_filler_prompt(turn_num: int) -> str:
    task = DEFAULT_FILLER_TASKS[turn_num % len(DEFAULT_FILLER_TASKS)]
    return (
        f"[Turn {turn_num}] {task} "
        "Be maximally thorough and verbose. Do not abbreviate."
    )


def call_api(config: argparse.Namespace, messages: list[dict[str, str]], event_fp: Any) -> dict[str, Any]:
    url = f"{config.base_url.rstrip('/')}/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": config.api_key,
        "anthropic-version": "2023-06-01",
    }
    body = json.dumps(
        {
            "model": config.model,
            "max_tokens": config.max_tokens,
            "messages": messages,
        }
    ).encode("utf-8")

    for attempt in range(1, config.retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=config.request_timeout_s) as response:
                payload = json.loads(response.read().decode("utf-8"))

            text_blocks = [
                block.get("text", "")
                for block in payload.get("content", [])
                if isinstance(block, dict) and block.get("type") == "text"
            ]
            text = "\n".join([t for t in text_blocks if t]).strip()

            usage = payload.get("usage", {}) if isinstance(payload.get("usage", {}), dict) else {}
            return {
                "ok": True,
                "text": text,
                "input_tokens": int(usage.get("input_tokens", -1)),
                "output_tokens": int(usage.get("output_tokens", -1)),
                "stop_reason": payload.get("stop_reason", "unknown"),
                "raw_keys": list(payload.keys()),
            }
        except urllib.error.HTTPError as error:
            error_body = error.read().decode("utf-8", errors="ignore") if error.fp else ""
            lower = error_body.lower()

            if error.code == 400 and any(k in lower for k in ("too long", "too many tokens", "context", "prompt token")):
                return {
                    "ok": False,
                    "error_kind": "context_limit_exceeded",
                    "error": f"HTTP {error.code}: {error_body[:1000]}",
                    "input_tokens": -1,
                    "output_tokens": 0,
                    "text": "",
                }

            retryable = error.code == 429 or error.code >= 500
            emit_event(
                event_fp,
                "api_http_error",
                attempt=attempt,
                status_code=error.code,
                retryable=retryable,
                error_preview=error_body[:300],
            )

            if retryable and attempt < config.retries:
                delay = min(30, 2 ** (attempt - 1)) + random.uniform(0, 0.5)
                time.sleep(delay)
                continue

            return {
                "ok": False,
                "error_kind": "http_error",
                "error": f"HTTP {error.code}: {error_body[:1000]}",
                "input_tokens": -1,
                "output_tokens": 0,
                "text": "",
            }
        except Exception as error:  # noqa: BLE001
            emit_event(
                event_fp,
                "api_exception",
                attempt=attempt,
                retryable=attempt < config.retries,
                error=str(error),
            )
            if attempt < config.retries:
                delay = min(30, 2 ** (attempt - 1)) + random.uniform(0, 0.5)
                time.sleep(delay)
                continue
            return {
                "ok": False,
                "error_kind": "exception",
                "error": str(error),
                "input_tokens": -1,
                "output_tokens": 0,
                "text": "",
            }

    return {
        "ok": False,
        "error_kind": "retry_exhausted",
        "error": "All retries exhausted",
        "input_tokens": -1,
        "output_tokens": 0,
        "text": "",
    }


def build_metrics_markdown(report: dict[str, Any], output_json_path: Path, events_path: Path) -> str:
    summary = report["summary"]
    probes = report["probes"]
    compaction_events = report["compaction_events"]
    config = report["config"]

    lines = [
        f"# Compaction Validation Report — {report['run_id']}",
        "",
        f"- **Status**: {report['status']}",
        f"- **Model**: {config['model']}",
        f"- **Endpoint**: {config['base_url']}",
        f"- **Turns completed**: {summary['turns_completed']}",
        f"- **Compaction events detected**: {summary['compaction_events_detected']}",
        f"- **Compaction rate**: {summary['compaction_rate']:.2%}",
        f"- **Peak input_tokens**: {summary['peak_input_tokens']:,} (turn {summary['peak_input_turn']})",
        f"- **Total input_tokens seen**: {summary['total_input_tokens_seen']:,}",
        f"- **Total output_tokens seen**: {summary['total_output_tokens_seen']:,}",
        f"- **Max removed tokens (lower bound)**: {summary['max_removed_tokens_lower_bound']:,} (turn {summary['max_removed_turn']})",
        f"- **Probe count**: {summary['probe_count']}",
        f"- **Min probe recall**: {summary['min_probe_accuracy']:.2%}",
        f"- **Last probe recall**: {summary['last_probe_accuracy']:.2%}",
        "",
        "## Compaction Events",
        "",
        "| Turn | Expected Min Input | Observed Input | Removed (Lower Bound) |",
        "|------|--------------------|----------------|------------------------|",
    ]

    for event in compaction_events:
        lines.append(
            f"| {event['turn']} | {event['expected_min_input_tokens']:,} | {event['observed_input_tokens']:,} | {event['removed_tokens_lower_bound']:,} |"
        )

    lines.extend(
        [
            "",
            "## Probe Accuracy",
            "",
            "| Turn | Input Tokens | Recall | Correct/Total |",
            "|------|--------------|--------|---------------|",
        ]
    )

    for probe in probes:
        lines.append(
            f"| {probe['turn']} | {probe['input_tokens']:,} | {probe['accuracy']:.2%} | {probe['correct']}/{probe['total']} |"
        )

    lines.extend(
        [
            "",
            f"JSON report: `{output_json_path}`",
            f"Event log: `{events_path}`",
        ]
    )

    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Professional compaction validation harness")
    parser.add_argument("--api-key-env", default="ANTHROPIC_API_KEY")
    parser.add_argument("--base-url", default=os.environ.get("ANTHROPIC_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--model", default=os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL))
    parser.add_argument("--max-tokens", type=int, default=DEFAULT_MAX_TOKENS)
    parser.add_argument("--total-turns", type=int, default=DEFAULT_TOTAL_TURNS)
    parser.add_argument("--probe-every", type=int, default=DEFAULT_PROBE_EVERY)
    parser.add_argument("--request-timeout-s", type=int, default=DEFAULT_REQUEST_TIMEOUT_S)
    parser.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    parser.add_argument("--compaction-slack-tokens", type=int, default=DEFAULT_COMPACTION_SLACK_TOKENS)
    parser.add_argument("--checkpoint-every", type=int, default=DEFAULT_CHECKPOINT_EVERY)
    parser.add_argument("--out-dir", default=str(Path(__file__).resolve().parent.parent / "test-output"))
    parser.add_argument("--run-id", default=datetime.datetime.now().strftime("%Y%m%dT%H%M%S"))
    parser.add_argument("--seed-facts-path", help="Optional JSON file containing seed facts object")
    return parser


def load_seed_facts(path: str | None) -> dict[str, str]:
    if not path:
        return dict(DEFAULT_SEED_FACTS)
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or not payload:
        raise ValueError("seed-facts-path must point to a non-empty JSON object")
    return {str(k): str(v) for k, v in payload.items()}


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    api_key = os.environ.get(args.api_key_env)
    if not api_key:
        print(
            f"ERROR: Missing required API key environment variable '{args.api_key_env}'.",
            file=sys.stderr,
        )
        return 2

    args.api_key = api_key

    if args.probe_every <= 0 or args.total_turns <= 0:
        print("ERROR: --probe-every and --total-turns must be > 0", file=sys.stderr)
        return 2

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    run_prefix = f"compaction-v2-{args.run_id}"
    output_json_path = out_dir / f"{run_prefix}.json"
    output_md_path = out_dir / f"{run_prefix}-metrics.md"
    events_path = out_dir / f"{run_prefix}.events.jsonl"
    checkpoint_path = out_dir / f"{run_prefix}.checkpoint.json"

    seed_facts = load_seed_facts(args.seed_facts_path)
    start_time = time.time()

    messages: list[dict[str, str]] = []
    transcript: list[dict[str, Any]] = []
    token_log: list[dict[str, Any]] = []
    probes: list[dict[str, Any]] = []
    compaction_events: list[dict[str, Any]] = []

    previous_input_tokens = -1
    previous_output_tokens = -1

    print("=== Professional Compaction Validation Harness ===")
    print(f"Run ID: {args.run_id}")
    print(f"Model: {args.model}")
    print(f"Endpoint: {args.base_url}")
    print(f"Target turns: {args.total_turns}")
    print(f"Probe every: {args.probe_every}")
    print(f"Output JSON: {output_json_path}")
    print(f"Event log: {events_path}")

    status = "completed"
    error_message: str | None = None

    with events_path.open("w", encoding="utf-8") as event_fp:
        emit_event(
            event_fp,
            "run_started",
            run_id=args.run_id,
            model=args.model,
            base_url=args.base_url,
            total_turns=args.total_turns,
            probe_every=args.probe_every,
            max_tokens=args.max_tokens,
        )

        try:
            seed_prompt = make_seed_prompt(seed_facts)
            messages.append({"role": "user", "content": seed_prompt})
            seed_result = call_api(args, messages, event_fp)

            if not seed_result["ok"]:
                status = "failed"
                error_message = seed_result.get("error", "seed request failed")
                emit_event(event_fp, "seed_failed", error=error_message)
                raise RuntimeError(error_message)

            messages.append({"role": "assistant", "content": seed_result["text"]})
            token_log.append(
                {
                    "turn": 0,
                    "input_tokens": seed_result["input_tokens"],
                    "output_tokens": seed_result["output_tokens"],
                    "expected_min_input_tokens": None,
                    "token_delta": None,
                    "compacted": False,
                    "stop_reason": seed_result["stop_reason"],
                }
            )
            transcript.append(
                {
                    "turn": 0,
                    "type": "seed",
                    "user": seed_prompt,
                    "assistant": seed_result["text"],
                    "tokens": token_log[-1],
                }
            )

            previous_input_tokens = seed_result["input_tokens"]
            previous_output_tokens = seed_result["output_tokens"]

            print(
                f"[Turn 0] seed: in={seed_result['input_tokens']} out={seed_result['output_tokens']} chars={len(seed_result['text'])}"
            )
            emit_event(
                event_fp,
                "seed_completed",
                input_tokens=seed_result["input_tokens"],
                output_tokens=seed_result["output_tokens"],
                response_chars=len(seed_result["text"]),
            )

            for turn in range(1, args.total_turns + 1):
                is_probe = turn % args.probe_every == 0
                prompt = make_probe_prompt(turn, seed_facts) if is_probe else make_filler_prompt(turn)
                turn_type = "probe" if is_probe else "filler"

                emit_event(event_fp, "turn_started", turn=turn, turn_type=turn_type)
                t0 = time.time()

                messages.append({"role": "user", "content": prompt})
                result = call_api(args, messages, event_fp)
                elapsed_s = round(time.time() - t0, 2)

                if not result["ok"]:
                    kind = result.get("error_kind", "unknown")
                    if kind == "context_limit_exceeded":
                        status = "context_limit_exceeded"
                    else:
                        status = "failed"
                    error_message = result.get("error", "request failed")
                    messages.pop()
                    emit_event(
                        event_fp,
                        "turn_failed",
                        turn=turn,
                        turn_type=turn_type,
                        error_kind=kind,
                        error=error_message,
                    )
                    break

                messages.append({"role": "assistant", "content": result["text"]})

                token_entry = {
                    "turn": turn,
                    "input_tokens": result["input_tokens"],
                    "output_tokens": result["output_tokens"],
                    "expected_min_input_tokens": None,
                    "token_delta": None,
                    "compacted": False,
                    "stop_reason": result["stop_reason"],
                }

                compaction = detect_compaction(
                    previous_input_tokens,
                    previous_output_tokens,
                    result["input_tokens"],
                    args.compaction_slack_tokens,
                )
                if compaction:
                    token_entry["compacted"] = True
                    token_entry["expected_min_input_tokens"] = compaction["expected_min_input_tokens"]
                    token_entry["token_delta"] = result["input_tokens"] - compaction["expected_min_input_tokens"]
                    compaction_event = {"turn": turn, **compaction}
                    compaction_events.append(compaction_event)
                    emit_event(event_fp, "compaction_detected", **compaction_event)
                elif previous_input_tokens >= 0 and previous_output_tokens >= 0 and result["input_tokens"] >= 0:
                    expected = previous_input_tokens + previous_output_tokens
                    token_entry["expected_min_input_tokens"] = expected
                    token_entry["token_delta"] = result["input_tokens"] - expected

                entry = {
                    "turn": turn,
                    "type": turn_type,
                    "user": prompt,
                    "assistant": result["text"],
                    "elapsed_s": elapsed_s,
                    "msg_count": len(messages),
                    "tokens": token_entry,
                }

                if is_probe:
                    recall = score_recall(result["text"], seed_facts)
                    entry["recall"] = recall
                    probes.append({"turn": turn, "input_tokens": result["input_tokens"], **recall})
                    print(
                        f"[Turn {turn}] probe in={result['input_tokens']} out={result['output_tokens']} "
                        f"recall={recall['accuracy']:.0%} ({recall['correct']}/{recall['total']})"
                    )
                    emit_event(
                        event_fp,
                        "probe_completed",
                        turn=turn,
                        input_tokens=result["input_tokens"],
                        output_tokens=result["output_tokens"],
                        accuracy=recall["accuracy"],
                        correct=recall["correct"],
                        total=recall["total"],
                    )
                else:
                    suffix = " COMPACTED" if token_entry["compacted"] else ""
                    print(
                        f"[Turn {turn}] filler in={result['input_tokens']} out={result['output_tokens']} "
                        f"delta={token_entry['token_delta']} ({elapsed_s}s){suffix}"
                    )

                transcript.append(entry)
                token_log.append(token_entry)
                previous_input_tokens = result["input_tokens"]
                previous_output_tokens = result["output_tokens"]

                emit_event(
                    event_fp,
                    "turn_completed",
                    turn=turn,
                    turn_type=turn_type,
                    elapsed_s=elapsed_s,
                    input_tokens=result["input_tokens"],
                    output_tokens=result["output_tokens"],
                    compacted=token_entry["compacted"],
                )

                if turn % args.checkpoint_every == 0 or token_entry["compacted"] or is_probe:
                    checkpoint_payload = {
                        "status": "running",
                        "run_id": args.run_id,
                        "updated_at": utc_now(),
                        "progress": {"last_turn": turn, "total_turns": args.total_turns},
                        "config": {
                            "model": args.model,
                            "base_url": args.base_url,
                            "max_tokens": args.max_tokens,
                            "probe_every": args.probe_every,
                            "compaction_slack_tokens": args.compaction_slack_tokens,
                        },
                        "transcript": transcript,
                        "token_log": token_log,
                        "probes": probes,
                        "compaction_events": compaction_events,
                    }
                    write_json_atomic(checkpoint_path, checkpoint_payload)
                    emit_event(event_fp, "checkpoint_written", turn=turn, path=str(checkpoint_path))

        except KeyboardInterrupt:
            status = "interrupted"
            error_message = "Interrupted by user"
            emit_event(event_fp, "run_interrupted")
        except Exception as error:  # noqa: BLE001
            if status == "completed":
                status = "failed"
            error_message = str(error)
            emit_event(event_fp, "run_exception", error=error_message)

        elapsed_total_s = round(time.time() - start_time, 2)

        valid_inputs = [t["input_tokens"] for t in token_log if isinstance(t.get("input_tokens"), int) and t["input_tokens"] >= 0]
        valid_outputs = [t["output_tokens"] for t in token_log if isinstance(t.get("output_tokens"), int) and t["output_tokens"] >= 0]

        probe_accuracies = [p["accuracy"] for p in probes]
        if not probe_accuracies:
            probe_accuracies = [0.0]

        summary = {
            "turns_completed": len(transcript),
            "elapsed_seconds": elapsed_total_s,
            "compaction_events_detected": len(compaction_events),
            "compaction_rate": (len(compaction_events) / len(token_log)) if token_log else 0,
            "first_compaction_turn": compaction_events[0]["turn"] if compaction_events else None,
            "max_removed_tokens_lower_bound": max((e["removed_tokens_lower_bound"] for e in compaction_events), default=0),
            "max_removed_turn": (
                max(compaction_events, key=lambda e: e["removed_tokens_lower_bound"])["turn"]
                if compaction_events
                else None
            ),
            "peak_input_tokens": max(valid_inputs, default=0),
            "peak_input_turn": (
                max(token_log, key=lambda t: t.get("input_tokens", -1)).get("turn")
                if token_log
                else None
            ),
            "total_input_tokens_seen": sum(valid_inputs),
            "total_output_tokens_seen": sum(valid_outputs),
            "avg_input_tokens": (sum(valid_inputs) / len(valid_inputs)) if valid_inputs else 0,
            "avg_output_tokens": (sum(valid_outputs) / len(valid_outputs)) if valid_outputs else 0,
            "probe_count": len(probes),
            "min_probe_accuracy": min(probe_accuracies),
            "last_probe_accuracy": probe_accuracies[-1],
        }

        report = {
            "run_id": args.run_id,
            "status": status,
            "error": error_message,
            "started_at": utc_now(),
            "config": {
                "model": args.model,
                "base_url": args.base_url,
                "max_tokens": args.max_tokens,
                "total_turns": args.total_turns,
                "probe_every": args.probe_every,
                "request_timeout_s": args.request_timeout_s,
                "retries": args.retries,
                "compaction_slack_tokens": args.compaction_slack_tokens,
                "checkpoint_every": args.checkpoint_every,
                "seed_facts_count": len(seed_facts),
            },
            "summary": summary,
            "token_log": token_log,
            "probes": probes,
            "compaction_events": compaction_events,
            "transcript": transcript,
            "artifacts": {
                "events_path": str(events_path),
                "checkpoint_path": str(checkpoint_path),
                "json_report_path": str(output_json_path),
                "metrics_markdown_path": str(output_md_path),
            },
        }

        write_json_atomic(output_json_path, report)
        output_md_path.write_text(
            build_metrics_markdown(report, output_json_path, events_path),
            encoding="utf-8",
        )

        final_checkpoint = {
            "status": status,
            "run_id": args.run_id,
            "updated_at": utc_now(),
            "summary": summary,
            "artifacts": report["artifacts"],
        }
        write_json_atomic(checkpoint_path, final_checkpoint)

        emit_event(
            event_fp,
            "run_completed",
            status=status,
            error=error_message,
            turns_completed=summary["turns_completed"],
            compaction_events=summary["compaction_events_detected"],
            peak_input_tokens=summary["peak_input_tokens"],
            elapsed_seconds=summary["elapsed_seconds"],
        )

    print("=" * 60)
    print(f"Status: {status}")
    print(f"Turns completed: {len(transcript)}")
    print(f"Compaction events: {len(compaction_events)}")
    print(f"Peak input tokens: {summary['peak_input_tokens']:,}")
    print(f"Output JSON: {output_json_path}")
    print(f"Output Markdown: {output_md_path}")
    print(f"Events JSONL: {events_path}")

    return 0 if status in {"completed", "context_limit_exceeded"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
