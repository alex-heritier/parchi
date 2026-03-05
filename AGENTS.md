# Agent Notes

- Default browser automation runtime is `agent-browser` (`npm run browser:agent`).
- Use Playwright only for the repo's E2E test harnesses unless explicitly requested otherwise.
- The extension is loaded from `dist/`. After UI changes, rebuild with `npm run build` or update the matching files in `dist/`.
- When editing UI code, prefer updating the source files under `sidepanel/` and then rebuilding so `dist/sidepanel/` stays in sync.
- Always run `npm run build` after any UI/CSS/TS changes and verify `dist/` was updated before handing off.
- Run `npm run check:repo-standards` before handoff. This enforces changed-file guardrails (line limits + diff-based checks).
- For Firefox packaging, keep `packages/extension/manifest.firefox.json` `version` in sync with root `package.json` and Chrome manifest (`0.4.41` currently).
- Pipeline details for agent/LSP guardrails: `docs/agent-pipeline.md`.
