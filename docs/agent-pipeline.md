# Agent Pipeline and LSP Guardrails

## Why this exists

Agents are fast but drift when constraints are only tribal knowledge. This repo now keeps constraints in both:

1. Human-readable instructions (`AGENTS.md`)
2. Machine-enforced checks (`npm run check:repo-standards`)

## Enforced checks

`npm run check:repo-standards`

Current rules (diff-aware):
- New source files cannot exceed 300 lines.
- Modified source files cannot cross from <=300 lines to >300 lines.

CI now runs this check on every PR/push through `.github/workflows/ci.yml`.

## LSP reality (important)

TypeScript/IDE LSP alone cannot reliably enforce architectural rules like "max 300 LOC" or broader diff-based repository policies.

Use LSP for:
- Type errors
- symbol navigation
- refactor safety

Use repo checks + CI for:
- file-size limits
- folder/module policy
- cross-file architectural contracts

Current editor baseline lives at `.vscode/settings.json`:
- Biome is the default formatter for JS/TS.
- Code actions are configured for Biome fix/import organization on save.

## Recommended local workflow for agents

1. Read root `AGENTS.md`.
2. Review relevant docs under `docs/` for subsystem constraints.
3. Run:
   - `npm run typecheck`
   - `npm run check:repo-standards`
   - `npm run build`
4. For broad changes, run `npm run check:all`.

## Production readiness automation

For release-style verification, use:

- `npm run ready:production` (clean + full readiness audit)
- `npm run audit:production` (audit only, no cleanup)

The audit writes evidence to `test-output/production-readiness/` (machine JSON, operator markdown, and per-step logs).
See `docs/production-readiness-playbook.md` for details.

## Evolving standards safely

When adding a new rule:
1. Add it to `scripts/check-repo-standards.mjs`.
2. Document it in this file.
3. Keep it diff-aware first (avoid blocking pre-existing debt).
4. Promote to full-repo enforcement once debt is reduced.
