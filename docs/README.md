# Parchi docs

Start here.

## Read first

- [`agent-pipeline.md`](./agent-pipeline.md) — runtime flow, ownership, and debugging order.
- [`tab-process-performance-playbook.md`](./tab-process-performance-playbook.md) — Firefox/Chrome memory and CPU triage.

## Repo map

| Area | Path |
| --- | --- |
| Extension | `packages/extension/` |
| Shared contracts | `packages/shared/src/` |
| Relay + CLI | `packages/relay-service/`, `packages/cli/` |
| Electron agent | `packages/electron-agent/` |
| Backend | `packages/backend/` |

## Validation

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run check:repo-standards
```

For browser perf work:

```bash
npm run perf:tabs
```
