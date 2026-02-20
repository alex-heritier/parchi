# Agent Notes

- Default browser automation runtime is `agent-browser` (`npm run browser:agent`).
- Use Playwright only for the repo's E2E test harnesses unless explicitly requested otherwise.
- The extension is loaded from `dist/`. After UI changes, rebuild with `npm run build` or update the matching files in `dist/`.
- When editing UI code, prefer updating the source files under `sidepanel/` and then rebuilding so `dist/sidepanel/` stays in sync.
- Always run `npm run build` before handing off UI changes.
- Run `npm run check:repo-standards` before handoff. This enforces changed-file guardrails (line limits + module context docs).
- For Firefox packaging, increment `packages/extension/manifest.firefox.json` `version` on every build/release; current baseline is `0.3.13`.
- Any newly introduced module directory under `packages/` must include a module-local `AGENTS.md`.
- Pipeline details for agent/LSP guardrails: `docs/agent-pipeline.md`.
