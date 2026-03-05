# Tab process performance playbook

Use this when Firefox or Chrome looks heavy during long Parchi sessions.

## Run the audit

```bash
npm run perf:tabs
```

What it does:

1. rebuilds the repo
2. samples browser processes with `ps`
3. correlates Firefox tab processes with the Parchi XPI via `lsof`
4. writes:
   - `test-output/perf/tab-cpu-audit-*.json`
   - `test-output/perf/tab-cpu-audit-*.md`

## Metrics to read first

- **Firefox tab RSS total** — total browser tab memory
- **Parchi-attributed Firefox RSS total** — likely extension-related tab memory
- **Parchi-attributed RSS slope (MB/min)** — leak signal
- **Parchi-attributed CPU slope (%/min)** — idle churn signal
- **Top Parchi-attributed rows** — likely extension-heavy processes

The slope matters more than one large snapshot.

## Good workflow

### Active run

```bash
TAB_AUDIT_SAMPLES=6 TAB_AUDIT_INTERVAL_MS=10000 npm run perf:tabs
```

### Idle run

1. reload the built extension
2. reproduce the workload once
3. stop interacting for 5+ minutes
4. rerun the same command

Idle positive slope is the stronger leak signal.

## How to interpret results

| Situation | Read |
| --- | --- |
| Firefox total is high, Parchi slope is flat/negative | browser is heavy, extension is not clearly growing |
| Parchi RSS slope stays positive | extension-attributed state is still climbing |
| Biggest sustained row is not Parchi-attributed | do not call it an extension leak yet |

## First places to inspect

### Sidepanel

- `packages/extension/sidepanel/ui/core/panel-session-memory.ts`
- `packages/extension/sidepanel/ui/chat/panel-tools-report-images.ts`
- `packages/extension/sidepanel/ui/core/panel-core.ts`
- `packages/extension/sidepanel/ui/history/panel-history.ts`

Watch for:

- `contextHistory` growth
- stale `toolCallViews`
- blob URLs not revoked
- selected report images bypassing eviction

### Background

- `packages/extension/background/report-images.ts`
- `packages/extension/background/session-manager.ts`
- `packages/extension/background/content-perf.ts`

Watch for:

- per-session screenshot bytes
- too many live sessions
- noisy perf telemetry

## Validation after a fix

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run check:repo-standards
npm run perf:tabs
```

## What to include in a perf writeup

- commit
- commands run
- artifact paths
- Firefox tab RSS total
- Parchi-attributed RSS total
- Parchi RSS slope
- whether the hottest sustained row was Parchi-attributed
