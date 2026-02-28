# Production Readiness Playbook

This playbook defines the repeatable workflow to audit, clean, build, and validate this repository before release.

## Goals

- Start from a deterministic local state.
- Run the same gate sequence every time.
- Preserve machine-readable and human-readable evidence under `test-output/`.

## One-command workflow

```bash
npm run ready:production
```

This runs:

1. `npm run clean`
2. `npm run audit:production`

## Script reference

- `npm run clean`
  - Removes generated artifacts: `dist/`, `dist-firefox/`, `dist-relay/`, `dist-cli/`, `tmp/`, `test-output/`, `dist.crx`, `parchi-*.zip`, `parchi-*.xpi`.
  - Use `node scripts/clean.mjs --dry-run` to preview deletions.

- `npm run verify:version-sync`
  - Verifies version parity across:
    - `package.json`
    - `packages/extension/manifest.json`
    - `packages/extension/manifest.firefox.json`
  - Use `npm run verify:version-sync:fix` to reconcile mismatches.

- `npm run audit:production`
  - Runs production gates and emits reports/logs.
  - Default gate order:
    1. `verify:version-sync`
    2. `lint`
    3. `typecheck`
    4. `check:repo-standards`
    5. `test:unit`
    6. `test:api`
    7. `test:e2e`
    8. `build`
    9. `build:firefox`
  - Optional flags:
    - `node scripts/production-readiness.mjs --quick` (skip tests)
    - `node scripts/production-readiness.mjs --with-xpi` (include `build:firefox:xpi`)

## Evidence artifacts

Each audit run writes to:

- `test-output/production-readiness/<run-id>/readiness.json`
- `test-output/production-readiness/<run-id>/readiness.md`
- `test-output/production-readiness/<run-id>/logs/*.log`
- `test-output/production-readiness/latest.json`
- `test-output/production-readiness/latest.md`

`readiness.md` is the operator report. `readiness.json` is for automation/CI ingestion.

## Release criteria

Treat the repo as release-ready only when all required gates are green in the latest readiness report.

Minimum required status:

- `verify:version-sync`: pass
- `lint`: pass
- `typecheck`: pass
- `check:repo-standards`: pass
- `test:unit`: pass
- `test:api`: pass (or explicitly documented credential skip policy)
- `test:e2e`: pass
- `build`: pass
- `build:firefox`: pass

## Failure handling

1. Open `test-output/production-readiness/latest.md`.
2. Identify failed step(s).
3. Open the referenced `logs/<step>.log` file.
4. Fix the failing gate(s) and rerun `npm run audit:production`.
5. Re-run `npm run ready:production` before release handoff.
