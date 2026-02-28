# Production Readiness Audit - 2026-02-26

## Scope

Repository: `/Users/sero/projects/browser-ai`

Goals completed in this pass:

1. Audit current production gates.
2. Add deterministic cleanup automation.
3. Add production-readiness orchestration with persisted evidence.
4. Resolve repo-standards structural blockers caused by oversized files.
5. Re-run builds and produce a final gate report.

## Commands executed

```bash
npm run check:repo-standards
npm run typecheck
npm run lint
npm run build
npm run build:firefox
npm run build:firefox:xpi
npm run ready:production
```

## Added automation

- `scripts/clean.mjs`
- `scripts/verify-version-sync.mjs`
- `scripts/production-readiness.mjs`

New npm scripts:

- `clean`
- `verify:version-sync`
- `verify:version-sync:fix`
- `audit:production`
- `ready:production`

## Structural cleanup delivered

- Split markdown rendering internals into focused files:
  - `ui/chat/markdown-highlighter.ts`
  - `ui/chat/markdown-table.ts`
  - `ui/chat/panel-markdown.ts` (reduced below 300 lines)
- Split theme catalog into bounded files:
  - `ui/settings/theme-definition.ts`
  - `ui/settings/theme-catalog-core.ts`
  - `ui/settings/theme-catalog-extended-a.ts`
  - `ui/settings/theme-catalog-extended-b.ts`
  - `ui/settings/themes.ts` (aggregator)

Result: `npm run check:repo-standards` now passes on this branch.

## Latest gate status (from automation report)

Source of truth:

- `test-output/production-readiness/latest.md`
- `test-output/production-readiness/latest.json`

Snapshot:

- Pass: `verify:version-sync`, `typecheck`, `repo-standards`, `api-tests`, `build-chrome`, `build-firefox`
- Fail: `lint`, `unit-tests`, `e2e-tests`

Current blockers:

1. `lint`: remaining backend formatting/rule violations (notably `openrouterManagement.ts` and related backend files).
2. `unit-tests`: deterministic failure in `buildRunPlan preserves createdAt and updates timestamps`.
3. `e2e-tests`: six UI selector/timeout failures in sidepanel/run/history/stream/thinking/tool-call flows.

## Process documentation

The durable workflow is documented in:

- `docs/production-readiness-playbook.md`

This defines command usage, required gates, artifact locations, and failure triage sequence.
