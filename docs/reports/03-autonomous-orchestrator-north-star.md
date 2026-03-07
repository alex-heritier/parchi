# North Star: Multi-Tab Autonomous Orchestrator

## 0. Why this document exists

The previous draft captured the ambition but not the actual system boundaries. This version is grounded in the code that exists today and defines a technically correct path from the current extension to a real multi-tab orchestrator.

This document preserves the original goals:
- profiles = model/provider/prompt configurations
- skills = workflows + recordings + prompt injection
- vision = screenshot/video-assisted perception
- tab use = bounded session tab set
- orchestration = delegating work toward a goal
- user interview, task research, dependency mapping, validation, UX, tests, and observability

It also corrects the key architectural mistake in the earlier draft:

> Today, Parchi does not yet have a true async multi-worker orchestrator.
> It has session-scoped tabs, a linear run plan, prompt-injected skills, and a synchronous `spawn_subagent` primitive.

So the North Star must be built in layers, not assumed into existence.

---

## 1. Ground truth: what exists in the repo today

### 1.1 Profiles and model roles

The current settings model already supports role-specific profiles in `packages/shared/src/settings.ts` and the sidepanel settings UI:

- `activeConfig` = main profile
- `orchestratorProfile` = planning / delegation model
- `visionProfile` = screenshot and video interpretation model
- `auxAgentProfiles` = team profiles for delegated work
- `useOrchestrator` = orchestration mode toggle

This is important: the product already thinks in terms of **role-specialized models**, not just one agent.

### 1.2 Skills and recordings

The current skill system is implemented around `AtomicSkill` and `ComposedSkill` in `packages/shared/src/recording.ts`.

What exists today:
- user recording of actions and screenshots
- workflow extraction from session history
- storage in `chrome.storage.local`
- site-pattern matching
- prompt injection of matched skills in `BackgroundService.getMatchedSkills()`

What does **not** exist today:
- no scheduler that chooses skills as executable task nodes
- no reliability-weighted planner
- no graph-level skill composition
- no cross-tab skill handoff contract

### 1.3 Planning and execution today

Current planning is defined by `RunPlan` in `packages/shared/src/plan.ts`.

`RunPlan` today is:
- a **linear checklist**
- status per step: `pending | running | done | blocked`
- enforced through `set_plan` and `update_plan`
- rendered in the sidepanel plan drawer

This is useful, but it is not a dependency graph.

### 1.4 Tab model today

`packages/extension/tools/browser-tools.ts` already gives us a bounded session tab set:

- session tab capture
- current tab focus
- `openTab`, `closeTab`, `switchTab`, `focusTab`, `groupTabs`
- hard cap: `MAX_SESSION_TABS = 5`

This is the correct primitive for the North Star. The product requirement “manage up to 5 tabs at a time” already matches the implementation boundary.

But today these tabs are:
- **session-scoped**, not worker-reserved
- **shared**, not owned by a particular task
- managed by one `BrowserTools` instance per session

### 1.5 Vision today

Vision exists as optional tools, not as a separate execution substrate:

- `screenshot`
- `watchVideo`
- `getVideoInfo`
- `describeImageWithModel()` bridge through the configured `visionProfile`

That means the realistic UX is not “live video streaming across 5 tabs.”
The realistic UX is **periodic screenshot previews plus structured status**.

### 1.6 Orchestration today

The current orchestrator primitive is `spawn_subagent` in `packages/extension/background/service.ts`.

Important truth:
- it is **not** a full async dispatcher yet
- it runs inside the same background service run envelope
- it returns through `subagent_complete`
- until this PR, it was not tab-pinned and had no shared memory primitive

So the real foundation is:
- session tabs
- synchronous delegation primitive
- linear run plan
- site-matched skills
- runtime events

That foundation is useful, but it is not yet the North Star system.

---

## 2. Product North Star

## 2.1 The user promise

A user should be able to give a goal like:

> “Publish a YouTube video.”

And Parchi should be able to:

1. interview the user
2. research missing context
3. propose a plan
4. show all moving pieces
5. identify dependencies and parallelizable work
6. reserve up to 5 tabs
7. delegate work to specialized workers
8. maintain shared state across tasks
9. validate completion
10. escalate only when blocked

This is not “browser automation.”
This is **goal orchestration over browser tasks**.

## 2.2 The operating model

The orchestrator is best understood as a **control plane** managing a set of **tab-bound workers**.

```text
User
  -> Interviewer / Planner
      -> Execution Graph
          -> Scheduler
              -> Tab Reservations (max 5)
                  -> Worker A on Tab 1
                  -> Worker B on Tab 2
                  -> Worker C on Tab 3
              -> Shared Whiteboard
              -> Validation Engine
              -> Observability / Timeline
```

The scheduler does not “do the task.”
It decides:
- what is ready
- what must wait
- which tab/profile to use
- what shared outputs are needed
- whether a task is actually complete

---

## 3. The canonical workflow example: Publish a YouTube video

## 3.1 User goal

> Publish the latest Riverside interview to YouTube with a strong thumbnail and searchable title.

## 3.2 Interview phase

Before executing anything, the orchestrator should gather:

- which Riverside recording?
- which YouTube channel?
- desired publishing mode: draft / private / public?
- target audience?
- brand constraints for the thumbnail?
- required assets already available vs to be generated?
- whether the user wants trend research only from Google Trends, or also Google Search / YouTube autocomplete?

## 3.3 Sites involved

For this example, the planner must reason across at least these domains:

- `riverside.fm` or `riverside.io` — source asset download
- `trends.google.com` — trend data
- Google Search and/or YouTube search/autocomplete — search term validation
- `canva.com` or other thumbnail tool — thumbnail creation
- `studio.youtube.com` — upload, metadata, thumbnail, publish

Optional supporting sites:
- Drive/Dropbox if assets need transfer
- brand asset source if logos/templates are needed

## 3.4 Task graph

```text
Goal: Publish Riverside video to YouTube

A. Interview user and resolve missing inputs
B. Download source video from Riverside
C. Research trend terms
D. Generate thumbnail brief
E. Build thumbnail asset
F. Upload video to YouTube Studio
G. Apply title/description/tags/thumbnail
H. Validate published state and return final URL

Dependencies:
A -> B
A -> C
A -> D
C + D -> E
B -> F
B + C + E -> G
F + G -> H
```

## 3.5 Parallelization window

Once interview is complete:

- Tab 1: Riverside download
- Tab 2: Google Trends research
- Tab 3: Google / YouTube keyword verification
- Tab 4: Thumbnail design
- Tab 5: reserved for YouTube Studio upload once upload inputs are ready

Not every task should open a new tab. The scheduler should prefer:
1. reuse of reserved tabs by domain/role
2. preserving authenticated state
3. avoiding unnecessary tab churn

---

## 4. The core technical model

## 4.1 Control plane vs worker plane

### Control plane

Responsibilities:
- interview
- plan graph creation
- dependency resolution
- tab reservation
- profile selection
- shared state management
- retry policy
- validation policy
- user escalation

### Worker plane

Responsibilities:
- act inside exactly one tab
- execute a bounded task prompt
- write structured outputs back to shared memory
- stop at task completion or blocker

This split matters because the current codebase already has most worker primitives, but lacks a true control plane.

## 4.2 Shared memory: the whiteboard

A multi-tab orchestrator fails without durable shared state.

The whiteboard is the contract between tasks.

Examples of whiteboard keys:
- `recording.videoFile`
- `research.primaryKeywords`
- `research.titleCandidates`
- `thumbnail.brief`
- `thumbnail.assetUrl`
- `youtube.draftUrl`
- `youtube.publishState`

The whiteboard is not conversation history.
It is structured, task-addressable working memory.

## 4.3 Execution graph

A real orchestrator needs a DAG, not a checklist.

Each node must define:
- what it is trying to do
- what it depends on
- which site(s) it targets
- which profile it should use
- what inputs it consumes from the whiteboard
- what outputs it must publish
- how success is validated
- whether failure blocks downstream work

## 4.4 Tab reservation model

This is the correct tab model for Parchi:

```text
Session Tab Pool (max 5)
  Tab 1 -> reservation: riverside-download
  Tab 2 -> reservation: trend-research
  Tab 3 -> reservation: keyword-verification
  Tab 4 -> reservation: thumbnail-design
  Tab 5 -> reservation: youtube-upload
```

Rules:
- a running task owns its reserved tab
- sibling workers cannot switch into each other’s tabs
- the scheduler may reuse a tab only after the current reservation is terminal
- authenticated sites should prefer tab reuse on the same domain

This is stricter than the current session tab model and is necessary for correctness.

## 4.5 Validation model

Validation must be explicit and task-local.

A task is not complete because the model says so.
A task is complete because its validation contract passed.

Validation types:
- URL state reached
- DOM text present
- required whiteboard key written
- tool result asserted
- human confirmation required

Example:

```text
Task: Upload video to YouTube Studio
Success is not “clicked upload”.
Success is:
- file accepted by uploader
- upload progress started or draft page loaded
- draft/video URL written to whiteboard
```

---

## 5. Current architecture gaps

## 5.1 What is missing today

### Gap A — planner outputs a checklist, not a graph
Current `RunPlan` is sequential and UI-facing.
It cannot represent:
- fan-out
- fan-in
- data dependencies
- partial failure propagation

### Gap B — no shared orchestration memory
Before this PR, sibling delegated work had no durable structured memory surface.

### Gap C — subagents were not tab-isolated
Before this PR, `spawn_subagent` could delegate work, but not safely pin a worker to a single session tab.

### Gap D — no scheduler
There is no async loop yet that evaluates “ready tasks”, dispatches them, and reacts to completion events.

### Gap E — no orchestrator-specific UX
The current UI can show:
- streaming output
- tool events
- plan drawer
- session tabs

It cannot yet show:
- graph planning review
- worker reservation map
- whiteboard state
- per-task validation state

---

## 6. Correct architecture for the North Star

## 6.1 Interview subsystem

The interviewer should run before execution and produce:
- resolved inputs
- unresolved questions
- assumptions
- risk flags
- required auth checkpoints
- user-approved scope

Output contract:

```text
Interview Result
  requiredInputs
  optionalInputs
  missingInputs
  assumptions
  constraints
  siteAccessRequirements
```

## 6.2 Planner subsystem

Input:
- user goal
- interview result
- current tabs
- matched skills
- known auth state

Output:
- execution graph
- recommended profiles per task
- tab demand estimate
- whiteboard schema
- validation contracts

## 6.3 Scheduler subsystem

The scheduler loop should do this repeatedly:

```text
1. Read graph state
2. Find ready tasks (dependencies satisfied)
3. Check tab and profile availability
4. Reserve tab(s)
5. Spawn worker(s)
6. Wait for worker result / timeout / blocker
7. Update task state + whiteboard
8. Unlock newly ready tasks
9. Run validation tasks
10. Stop when goal terminal or irrecoverably blocked
```

## 6.4 Worker contract

Each worker receives:
- task id
- tab id reservation
- profile selection
- task prompt
- allowed tools
- whiteboard snapshot
- required outputs
- validation expectations

Each worker returns:
- success/failure/blocker
- summary
- evidence
- output keys written
- recommended next action if blocked

## 6.5 Failure policy

Failure propagation must be typed.

Task failures are not all equal:
- `retryable` — same node may retry with modified approach
- `requires_user` — scheduler pauses and escalates
- `soft_fail` — downstream can continue with degraded mode
- `hard_fail` — dependent tasks cancel

This is critical for flows like:
- thumbnail generation failed, but upload draft can still proceed
- trend research failed, but publish can continue with fallback metadata
- YouTube login required, user must intervene

---

## 7. UX North Star

## 7.1 Pre-flight “War Room”

Before execution, show:
- interview answers
- assumptions
- site list
- task graph
- concurrency plan
- expected outputs
- risk and auth checkpoints

The user should be able to:
- edit a task
- remove a task
- change ordering constraints
- set publish mode to draft/private/public
- approve execution

## 7.2 Live “Command Center”

During execution, show:
- graph with node status
- tab reservation board
- worker cards
- whiteboard panel
- error / blocker queue
- validation results

Recommended layout:

```text
+--------------------------------------------------------------+
| Chat / Orchestrator Log                                      |
+-------------------------+------------------------------------+
| Graph / Task Tree       | Worker / Tab Preview Grid          |
|                         | [Tab1] [Tab2] [Tab3] [Tab4] [Tab5] |
+-------------------------+------------------------------------+
| Whiteboard              | Validation + Blockers              |
+--------------------------------------------------------------+
```

## 7.3 Preview strategy

Do not attempt full live tab streaming as v1.
Use:
- periodic screenshots
- active tool label
- current URL/title
- last successful verification excerpt

This aligns with the current vision stack and keeps token / performance cost bounded.

---

## 8. Test and observability architecture

## 8.1 What must be tested

### Planner tests
- ambiguous goal -> interview questions generated
- graph is acyclic
- whiteboard bindings are coherent
- concurrency is clamped to max 5 tabs

### Scheduler tests
- ready-task detection
- dependency unlocking
- tab reservation and reuse
- cancellation propagation
- user-intervention pause/resume

### Worker tests
- tab-pinned execution cannot escape reservation
- whiteboard reads/writes work
- validation contracts are checked

### End-to-end workflow tests
Use realistic mock flows for:
- Riverside download
- Google Trends lookup
- thumbnail creation flow
- YouTube Studio upload flow

## 8.2 Observability model

Every orchestrated run should be reconstructable.

Required identifiers:
- `runId` = whole orchestration run
- `taskId` = graph node
- `tabId` = browser reservation
- `subagentId` = delegated worker instance
- `profile` = model role actually used

Timeline events should support replay:
- task ready
- task reserved
- worker started
- tool called
- verification passed
- whiteboard updated
- validation passed/failed
- task terminal

## 8.3 Deterministic testing strategy

For CI, prefer a local mock web sandbox instead of live sites.

```text
/mock/riverside
/mock/google-trends
/mock/thumbnail-tool
/mock/youtube-studio
```

And use mock model responses for scheduler tests so we can verify orchestration logic without nondeterministic LLM behavior.

---

## 9. Data model for the target system

This PR introduces the shared graph model in `packages/shared/src/orchestrator.ts`.

```ts
OrchestratorPlan
  goal
  assumptions
  interviewQuestions
  tasks[]
  whiteboardKeys[]
  maxConcurrentTabs

OrchestratorTaskNode
  id
  title
  kind
  status
  dependencies[]
  sitePatterns[]
  requiredSkills[]
  assignedProfile?
  assignedTabId?
  prompt?
  inputs[]
  outputs[]
  validations[]
```

This model is intentionally separate from `RunPlan`.

Reason:
- `RunPlan` remains the linear execution/checklist primitive used by an individual worker
- `OrchestratorPlan` becomes the graph primitive used by the scheduler

That separation is the technically correct design.

---

## 10. What this PR implements

This PR is the first real foundation slice, not the full orchestrator.

### 10.1 Implemented in code

#### A. Shared orchestration graph types
Added `packages/shared/src/orchestrator.ts` with:
- orchestrator task statuses
- task graph node type
- whiteboard entry type
- plan normalization helpers
- ready-task derivation helpers

#### B. Shared whiteboard tools
Added orchestrator shared memory tools in `BackgroundService`:
- `whiteboard_get`
- `whiteboard_set`
- `whiteboard_list`

These create a real structured state surface for cross-task handoff.

#### C. Tab-pinned subagent foundation
`spawn_subagent` now supports:
- `tabId`
- `name`
- `whiteboardKeys`

When pinned:
- the worker is forced onto one session tab
- tab-management tools are removed
- browser calls are scoped to that tab

This is the correct first step toward safe multi-tab delegation.

#### D. Prompt/runtime grounding
The orchestrator prompt now surfaces:
- shared whiteboard snapshot
- explicit whiteboard tool usage
- tab-pinned delegation guidance

#### E. Unit coverage
Added unit tests for:
- orchestrator task normalization
- concurrency clamping
- whiteboard key derivation
- ready-task derivation

## 10.2 Not implemented yet

Still intentionally out of scope for this PR:
- async scheduler/event loop
- tab reservation ledger UI
- graph editor UI
- task-level validation engine
- blocker escalation UI
- automated parallel execution of 5 workers at once

Those belong in the next phases.

---

## 11. Delivery roadmap

## Phase 1 — Foundations
- graph types
- whiteboard
- tab-pinned worker contract
- unit coverage

## Phase 2 — Scheduler
- ready queue
- reservation ledger
- task lifecycle state machine
- async worker dispatch

## Phase 3 — Validation engine
- reusable validation rule executor
- blocker classification
- human-in-the-loop checkpoints

## Phase 4 — UX
- war room
- command center
- whiteboard panel
- worker cards and previews

## Phase 5 — Real workflow packs
- publish YouTube video
- post LinkedIn update
- research + outreach pipeline
- internal multi-site operational flows

---

## 12. Final position

The North Star is not “let one agent open five tabs.”
It is:

> Build a control plane that can interview, plan, reserve tabs, delegate bounded work, share state, validate outcomes, and only escalate to the user when required.

That is the technically correct path from the Parchi codebase as it exists today to the product described in the original request.
