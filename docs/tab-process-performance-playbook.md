# Tab process performance playbook

Use this when Firefox or Chrome starts eating RAM/CPU during long Parchi sessions.

## What `npm run perf:tabs` does

```bash
npm run perf:tabs
```

That command:

1. rebuilds the repo
2. runs `dist/tests/perf/run-tab-cpu-audit.js`
3. samples browser processes with `ps`
4. correlates Firefox tab processes with the Parchi XPI using `lsof`
5. writes artifacts to `test-output/perf/`

Artifacts:

- `test-output/perf/tab-cpu-audit-*.json`
- `test-output/perf/tab-cpu-audit-*.md`

## The metrics that matter now

The audit no longer just dumps total browser memory.

It now reports:

- **Firefox tab RSS total**
- **Parchi-attributed Firefox RSS total**
- **Parchi-attributed Firefox tab count**
- **Parchi-attributed RSS slope (MB/min)**
- **Parchi-attributed CPU slope (%/min)**
- **top aggregated Parchi-attributed rows**

Why this matters:

- raw Firefox totals can be dominated by unrelated tabs
- the Parchi XPI correlation gives a better extension-attributed signal
- slope is more useful than a single snapshot for leak detection

## How to run a useful audit

### Active-run audit

Use this while navigating, reading, screenshotting, or running tool-heavy sessions:

```bash
TAB_AUDIT_SAMPLES=6 TAB_AUDIT_INTERVAL_MS=10000 npm run perf:tabs
```

This gives you roughly one minute of data.

### Idle-run audit

Use this after the extension has already done work and is now sitting idle:

1. reload the built extension
2. reproduce the workload once
3. stop interacting
4. wait 5+ minutes
5. run:

```bash
TAB_AUDIT_SAMPLES=6 TAB_AUDIT_INTERVAL_MS=10000 npm run perf:tabs
```

Idle sustained growth is the better leak signal.

## How to read the output

### Case A: Firefox total is huge, Parchi slope is flat or negative

Interpretation:

- browser memory is high
- but the extension-attributed slice is not obviously growing

Action:

- inspect unrelated tabs first
- keep the extension fix local to verified retention hotspots

### Case B: Parchi-attributed RSS slope is persistently positive

Interpretation:

- extension-attributed tabs are still climbing over time

Action:

- inspect sidepanel retention structures first:
  - `contextHistory`
  - `toolCallViews`
  - `reportImages`
  - `historyTurnMap`

### Case C: one giant sustained alert row is **not** Parchi-attributed

Interpretation:

- the hottest process in Firefox may not be the extension

Action:

- do not treat the biggest raw RSS row as proof of an extension leak
- use the Parchi-attributed rows + slope instead

## Current known retention-sensitive areas

### Sidepanel

Files:

- `packages/extension/sidepanel/ui/core/panel-session-memory.ts`
- `packages/extension/sidepanel/ui/chat/panel-tools-report-images.ts`
- `packages/extension/sidepanel/ui/core/panel-core.ts`
- `packages/extension/sidepanel/ui/history/panel-history.ts`

What to watch:

- `contextHistory` growth
- stale `toolCallViews`
- screenshot blob URLs not being revoked
- selected report images bypassing normal eviction

### Background

Files:

- `packages/extension/background/report-images.ts`
- `packages/extension/background/session-manager.ts`
- `packages/extension/background/content-perf.ts`

What to watch:

- per-session screenshot bytes
- too many concurrent long-lived sessions
- noisy content perf telemetry

## Validation ladder after a perf fix

Run this set, in order:

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run check:repo-standards
npm run perf:tabs
```

## Practical thresholds

These are not hard product limits. They are triage heuristics.

- **Positive Parchi RSS slope during idle**: suspicious
- **Repeated cap hits on report image budgets**: capture volume is too high or retention is wrong
- **Sustained alert on non-Parchi row only**: probably not an extension regression by itself

## One good writeup pattern

When reporting a perf change, include:

```md
- commit
- commands run
- artifact paths
- latest Firefox tab RSS total
- latest Parchi-attributed RSS total
- Parchi RSS slope
- whether the hottest sustained row was Parchi-attributed
```

That makes regressions comparable across runs instead of anecdotal.
