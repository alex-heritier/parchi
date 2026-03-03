# Browser-AI Simplification Roadmap (2026-03-03)

Branch: `simplify/complexity-pass-20260303`
Owner: core orchestrator
Status: in progress

## Objective
Reduce complexity in the highest-churn/highest-risk modules while preserving behavior and release velocity.

## Priority pockets

### P0 — Background dispatch monolith
- File: `packages/extension/background/service.ts` (~2939 LOC)
- Problem:
  - Two large switch dispatch blocks (`handleMessage`, `handleRelayRpc`) are hard to reason about.
  - Message/rpc route behavior is tightly coupled and difficult to test in isolation.
- Simplification target:
  - Extract handler maps + domain modules (relay, recording, settings, run control, diagnostics).
  - Keep one thin dispatcher and shared error envelope.
- Success criteria:
  - No behavior regressions in existing unit/e2e gates.
  - `service.ts` shrinks materially and becomes orchestration-only.

### P1 — Sidepanel event orchestration blob
- File: `packages/extension/sidepanel/ui/core/panel-core.ts` (~1174 LOC)
- Problem:
  - `setupEventListeners` and `handleRuntimeMessage` are overloaded and mutation-heavy.
- Simplification target:
  - Extract feature-specific listener binders.
  - Extract runtime message handlers into map-based routing with helpers.
- Success criteria:
  - Event wiring is grouped by feature and readable.
  - Runtime message path has explicit per-type handlers.

### P2 — Browser tools mega-module
- File: `packages/extension/tools/browser-tools.ts` (~1498 LOC)
- Problem:
  - Tool definition metadata and execution logic are co-located.
  - Large switch in `executeTool` increases merge conflicts.
- Simplification target:
  - Split into `tool-definitions` + command modules (`navigate`, `click`, `type`, `tabs`, etc.).
  - Shared command context/utilities for tab lookup, timeout, and result normalization.
- Success criteria:
  - Each tool command can be tested and reasoned about independently.
  - Registry-style command map replaces large switch.

### P3 — Settings/profile serialization duplication
- Files:
  - `packages/extension/sidepanel/ui/settings/panel-settings.ts`
  - `packages/extension/sidepanel/ui/settings/panel-profiles.ts`
- Problem:
  - Repeated boolean/number/default coercion logic across paths.
- Simplification target:
  - Introduce one schema-driven normalization module shared across load/edit/save.
- Success criteria:
  - Default/coercion logic exists in one place.
  - Fewer field-level drift bugs.

### P4 — Element registry sprawl
- File: `packages/extension/sidepanel/ui/core/panel-elements.ts`
- Problem:
  - Massive flat registry + aliases is noisy and brittle.
- Simplification target:
  - Structured descriptor map + typed group sections.
- Success criteria:
  - Easier to add/remove elements without giant diff churn.

### P5 — Unit test runner monolith
- File: `tests/unit/run-unit-tests.ts` (~1016 LOC)
- Problem:
  - One giant runner causes conflicts and slows focused debugging.
- Simplification target:
  - Split by domain + small aggregator runner.
- Success criteria:
  - Domain tests are isolated and easier to maintain.

## Subagent assignments

| Agent | Scope | Deliverable |
|---|---|---|
| A1 | P0 background dispatch | Concrete extraction plan: modules, handler map design, migration order, risk list |
| A2 | P1 sidepanel core | Concrete extraction plan: event binder split + runtime message router map |
| A3 | P2 browser tools | Concrete extraction plan: command registry architecture + phased extraction |
| A4 | P3 settings serialization | Shared schema proposal + migration points in settings/profiles |
| A5 | P5 unit tests | Test file split plan and runner aggregation strategy |

## Execution protocol
1. Each subagent returns:
   - exact files/functions to touch
   - smallest safe first refactor step
   - regression checks/gates
2. Orchestrator consolidates into ordered implementation queue.
3. Implement in microcommits with full gate checks.

## Required gates for every implementation PR
- `npm run build`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run check:repo-standards`


## Subagent run log (completed)

| Agent | ID | Nickname | Status | Key output |
|---|---|---|---|---|
| A1 (P0) | `019cb517-e7db-7780-adf7-329f7c5964a6` | Chandrasekhar | ✅ completed | Dispatch decomposition plan for `service.ts` with handler maps for `handleRelayRpc` and `handleMessage`, migration phases, and invariants. |
| A2 (P1) | `019cb517-e82c-7592-ad0e-b4353bf5d26a` | Ramanujan | ✅ completed | Event-listener module split + runtime message router map for `panel-core.ts` with first minimal delegator patch. |
| A3 (P2) | `019cb517-e866-7b02-be37-9df8611b6fe5` | Huygens | ✅ completed | Browser tools registry architecture with command context and extraction order replacing `executeTool` switch. |
| A4 (P3) | `019cb517-e8af-7291-b004-6dac27ca7a20` | Herschel | ✅ completed | Shared settings schema/coercion plan (`settings-schema.ts`) to remove panel settings/profile normalization drift. |
| A5 (P5) | `019cb517-e8e9-7f01-a2f0-95ea1d80ce22` | Galileo | ✅ completed | Unit test runner split into `shared/` + `suites/` with tiny aggregator and output parity constraints. |

## Consolidated implementation queue (from subagents)

### Wave 1 (lowest-risk wins)
1. P5 unit test runner split (A5)
2. P0 relay RPC map extraction only (A1 Phase A)

### Wave 2
3. P2 browser tools definitions + registry skeleton (A3)
4. P1 `panel-core` delegator split (`setupEventListeners`, `handleRuntimeMessage`) (A2 minimal patch)

### Wave 3
5. P3 shared settings schema integration in settings/profiles (A4)
6. P0 runtime message dispatch extraction (A1 Phase B)

## Guardrails from subagent outputs
- Preserve message/method keys and response contracts exactly while moving code.
- Prefer map-based dispatch with fallback behavior identical to current implementation.
- Keep first patch as no-behavior-change extraction before deeper cleanup.
- Add parity tests as each dispatcher/runner split lands.
