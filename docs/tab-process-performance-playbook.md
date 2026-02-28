# Tab process performance playbook (Firefox + Chrome)

This runbook is for diagnosing and validating extension-induced CPU/RAM leaks in tab/renderer processes.

## 1) Build both browser targets

```bash
npm run build
npm run build:firefox
```

## 2) Capture OS-level process metrics (multi-sample profiler)

Run while automation is active:

```bash
TAB_AUDIT_SAMPLES=6 TAB_AUDIT_INTERVAL_MS=10000 npm run perf:tabs
```

Run again after 5+ minutes idle (no active runs).

Output:

- `test-output/perf/tab-cpu-audit-<timestamp>.json`
- `test-output/perf/tab-cpu-audit-<timestamp>.md`

The profiler reports:

- hottest browser processes (max + average CPU/RSS)
- Firefox tab process numbers (`N tab`)
- whether a Firefox tab process loaded Parchi’s XPI bundle
- sustained alerts (high CPU/RSS over multiple samples)
- browser totals timeline (Firefox tab + Chrome renderer)

Threshold env vars (optional):

- `TAB_AUDIT_CPU_ALERT` (default `80`)
- `TAB_AUDIT_RSS_ALERT_MB` (default `1024`)
- `TAB_AUDIT_TOP_N` (default `25`)

## 3) Browser-native process validation

### Firefox

1. Open `about:processes`.
2. Sort by CPU and memory.
3. Correlate hot process with profiler process number (`N tab`).
4. If needed, open `about:memory` → **Measure** and inspect extension memory sections.
5. For extension ID mapping, open `about:debugging#/runtime/this-firefox`.

### Chrome

1. Open Chrome Task Manager (`Shift+Esc`).
2. Sort by CPU and memory.
3. Compare against `perf:tabs` renderer rows.
4. Verify renderer usage drops after run completion.

## 4) Runtime perf telemetry from content scripts

Content scripts emit `content_perf_event` telemetry (stored in `chrome.storage.local`) when protection caps trigger:

- `source: "overlay"` when overlay tracking exceeds max tracking window.
- `source: "recording"` when injected recording script auto-stops after runtime cap.

Storage keys:

- `contentPerfEvents` (rolling last 100)
- `contentPerfLastEventAt`

Quick inspection:

```js
chrome.storage.local.get(["contentPerfEvents", "contentPerfLastEventAt"]).then(console.log)
```

## 5) Guardrails that prevent runaway usage

- Overlay tracking loop is timer-based (no perpetual `requestAnimationFrame`) and hard-stops after max tracking window.
- Recording content script auto-cleans after max runtime even if stop-message path fails.
- Recording coordinator force-cleans content script during stop/discard.
- Tool `timeoutMs` for click/type is clamped to prevent unbounded tab polling.
- Background stores perf events in a bounded ring buffer.

## 6) Regression criteria (ship blocker)

Treat as regression if this persists for >5 minutes idle:

- any sustained alert in `tab-cpu-audit` output
- single tab process sustained >80% CPU
- single tab process sustained >1GB RSS
- repeated `content_perf_event` bursts while idle

If regression reproduces, attach:

- both active + idle `tab-cpu-audit` artifacts
- screenshots from `about:processes` / Chrome Task Manager
- `contentPerfEvents` dump
