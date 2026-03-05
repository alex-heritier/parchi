# Parchi docs

This repo was missing a real docs surface. Start here.

## Core docs

- [`agent-pipeline.md`](./agent-pipeline.md) — end-to-end runtime flow from sidepanel input to tool execution, compaction, relay, and UI updates.
- [`tab-process-performance-playbook.md`](./tab-process-performance-playbook.md) — how to run Firefox/Chrome tab-memory audits, read the new Parchi-attributed metrics, and validate regressions.

## Fast repo map

| Area | Path | Notes |
| --- | --- | --- |
| Extension entrypoints | `packages/extension/` | Browser runtime, background worker, sidepanel, content scripts |
| Shared contracts | `packages/shared/src/` | Prompt text, plans, runtime message schemas, settings |
| Relay daemon + CLI | `packages/relay-service/`, `packages/cli/` | Local automation endpoint and client |
| Electron agent | `packages/electron-agent/` | Relay-native desktop automation |
| Backend | `packages/backend/` | Auth, billing, proxy/runtime services |

## Fast validation ladder

```bash
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e
npm run check:repo-standards
```

For browser-memory work, also run:

```bash
npm run perf:tabs
```
