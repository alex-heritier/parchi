# Browser-AI Coding Standards Audit

Date: 2026-02-18
Repo: `/Users/sero/projects/browser-ai`
Branch reviewed: `fix/oauth-providers`

## 1) Scope and Sources of Truth

This audit used the standards that are explicitly documented or enforced in-repo:

1. `/Users/sero/projects/browser-ai/AGENTS.md`
2. `/Users/sero/projects/browser-ai/README.md`
3. `/Users/sero/projects/browser-ai/biome.json`
4. `/Users/sero/projects/browser-ai/tsconfig.json`
5. `/Users/sero/projects/browser-ai/.github/workflows/ci.yml`
6. `/Users/sero/projects/browser-ai/scripts/build.mjs`
7. `/Users/sero/projects/browser-ai/docs/firefox-compat-system.md`

## 2) Standards Matrix (Documented vs Enforced)

| Area | Standard | Source | Enforced By | Current State |
|---|---|---|---|---|
| Build handoff | Always run `npm run build` before handoff | `AGENTS.md` | Social/process only | Failing (build currently broken) |
| UI source of truth | Edit under `packages/extension/sidepanel/`, keep `dist/` in sync | `AGENTS.md` | Social/process only | At risk (build broken prevents sync validation) |
| Firefox release discipline | Bump Firefox manifest version each release | `AGENTS.md` | Social/process only | Partially followed (`0.3.13`), but cross-version drift exists |
| Lint/format/import order | Biome check/format/import sorting | `biome.json` + `package.json` scripts | `npm run lint`, CI `lint` job | Failing (39 errors) |
| Type safety | TS strict mode with selected relaxations (`noImplicitAny: false`) | `tsconfig.json` | `npm run typecheck`, CI `typecheck` job | Failing (module resolution error) |
| Build validity | Typecheck then bundle extension/tests/relay | `scripts/build.mjs` | `npm run build`, CI `build` job | Failing (blocked by typecheck) |
| CI quality gates | Lint + typecheck + build + unit tests | `.github/workflows/ci.yml` | GitHub Actions | Would fail today |
| Browser-compat architecture | New browser-specific background behavior goes through `browser-compat.ts` | `docs/firefox-compat-system.md` | Documentation only | Pattern exists but not automatically checked |

## 3) Current Compliance Baseline (Evidence)

### Command results

1. `npm run lint`
- Result: FAIL
- Summary: 39 errors, 547 warnings
- Error taxonomy: `format` (28), `organizeImports` (6), `useImportType` (2), `useNumberNamespace` (2), `noBannedTypes` (1)
- Warning taxonomy: 547x `lint/suspicious/noExplicitAny`

2. `npm run typecheck`
- Result: FAIL
- Blocking error:
  - `packages/extension/recording/recording-coordinator.ts:6`
  - `TS2307: Cannot find module '../../../shared/src/recording.js'`

3. `npm run build`
- Result: FAIL
- Build script hard-stops on typecheck failure from the same missing module path.

### Concrete drift/mismatch findings

1. Firefox minimum version drift:
- README badge says Firefox 109+
  - `/Users/sero/projects/browser-ai/README.md:12`
- Firefox manifest requires 112+
  - `/Users/sero/projects/browser-ai/packages/extension/manifest.firefox.json:7`

2. Cross-version drift:
- Package version is `0.4.0`
  - `/Users/sero/projects/browser-ai/package.json`
- Firefox manifest version is `0.3.13`
  - `/Users/sero/projects/browser-ai/packages/extension/manifest.firefox.json:13`

3. Generated code linting conflict:
- Convex generated files under `packages/backend/convex/_generated/` are producing lint errors (format/import/type-style), creating recurring noise if regenerated.

## 4) Priority Assessment

## P0 (Release-blocking)

1. Fix broken TypeScript import path in recording coordinator.
- Impact: blocks `typecheck`, `build`, and CI.
- Suspected fix: import should resolve to `../../shared/src/recording.js` from `packages/extension/recording/recording-coordinator.ts`.

2. Restore passing lint baseline for enforceable errors.
- Impact: CI `lint` gate fails.
- Main blockers are formatting/import-order violations plus generated-file conflicts.

## P1 (Near-term quality/systemic)

1. Decide policy for generated Convex files in lint.
- Option A: ignore `_generated/**` in Biome.
- Option B: add deterministic generation+format step in CI and local workflows.
- Current state causes recurring avoidable failures.

2. Align versioning/docs between README/package/Firefox manifest.
- Reduce operator confusion and release mistakes.

3. Expand CI coverage beyond minimal unit path.
- Current CI runs only `test:unit` after build; no Firefox-target build and no `validate` gate.

## P2 (Sustained maintainability)

1. Reduce `any` debt (547 warnings).
- Concentrated in high-risk files like:
  - `packages/extension/background/service.ts`
  - `packages/extension/tools/browser-tools.ts`
  - `packages/extension/sidepanel/ui/core/panel-core.ts`

2. Add local guardrails to reduce regressions.
- Pre-commit hook for changed files (`biome check`, `tsc --noEmit` scoped).
- Optional `check:all` script for consistent local/CI behavior.

## 5) Action Plan

### Phase 0: Stabilize Gates (Today)

1. Fix import path in recording coordinator and re-run:
- `npm run typecheck`
- `npm run build`

2. Normalize lint blockers:
- Run `npm run format`
- Run `npm run lint:fix`
- Re-run `npm run lint`

3. Resolve generated-file strategy now:
- Recommended: exclude `packages/backend/convex/_generated/**` from Biome checks to avoid codegen churn.

Success criteria:
- `lint`, `typecheck`, `build` all pass locally.

### Phase 1: Close Standards Gaps (1-3 days)

1. Synchronize version and compatibility messaging:
- Update README Firefox badge/support text to match manifest minimum.
- Define single source of truth for release version(s).

2. Harden CI:
- Add `npm run validate` job.
- Add Firefox build job (`npm run build:firefox`) to catch browser-specific breakage.

Success criteria:
- CI checks mirror real release path for both Chrome and Firefox.

### Phase 2: Debt Burn-Down (1-2 weeks)

1. `any` reduction program (incremental, file-by-file).
- Start with highest-surface files:
  - `background/service.ts`
  - `tools/browser-tools.ts`
  - core sidepanel UI files

2. Introduce policy for new code:
- No net increase in `noExplicitAny` count per PR.
- Require typed wrappers/interfaces for new runtime message paths.

Success criteria:
- Warning count trends down every week; no regression PRs.

## 6) Suggested Owners and Workpack

1. Build/Type gates owner: extension platform maintainer
2. Lint policy owner: code quality maintainer
3. Release/docs owner: release manager
4. Type debt owner: feature-area owners by directory

Recommended ticket split:
1. `standards-p0-build-unblock`
2. `standards-p1-generated-lint-policy`
3. `standards-p1-ci-firefox-validate`
4. `standards-p1-docs-version-sync`
5. `standards-p2-any-debt-wave-1`

## 7) Bottom Line

Current coding standards are well-intended but partially enforced and currently failing on core gates. The repo needs immediate gate stabilization (P0), followed by enforcement alignment (P1), then type-quality debt reduction (P2).
