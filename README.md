# OpenCLI Loop Controller Plugin

`opencli-plugin-loopctl` exposes the Agent-facing Loop Controller as the `loop` OpenCLI site. It invokes the configured `loopctl` binary through bounded, shell-free subprocesses; it does not import the controller or SQLite directly.

## Commands

All responses are JSON by default. `LOOPCTL_BINARY` selects the controller executable (default: `loopctl`). File arguments are relative, regular files inside the current working directory.

```bash
opencli loop status
opencli loop status --work-item WORK_ITEM_ID
opencli loop pending
opencli loop packet ACTION_ID
opencli loop start --plan-file plans/first.json
opencli loop fanout --plan-file plans/parallel.json
opencli loop agent-task-start --plan-file plans/single-agent-task.json
opencli loop agent-task-fanout --plan-file plans/parallel-agent-tasks.json
opencli loop integrate --plan-file plans/integration.json
opencli loop bundle --event-file plans/retry-generation-2.json
opencli loop readiness-submit --event-file events/worker-ready-submission.json
opencli loop runtime-started --event-file events/runtime-started.json
opencli loop runtime-start-submit --event-file events/runtime-start-submission.json
opencli loop workspace-prepare --packet-file packets/execute-attempt.json
opencli loop candidate --event-file events/candidate.json
opencli loop review --event-file events/review.json
opencli loop review-submit --event-file events/review-submission.json
opencli loop agent-task-retry --packet-file packets/recover-attempt.json --event-file events/retry-bundle.json
opencli loop next --plan-next-action-id ACTION_ID --plan-file plans/next.json
```

The explicit Loop commands are available in Loop mode:

- `status [--work-item ID]` — delegate to `loopctl status`.
- `pending` — list ready Actions and current Work Items.
- `packet ACTION_ID` — read the complete, current Agent packet.
- `start --plan-file FILE` — ingest registration and bundle, then tick. The plan must contain exactly those two existing-schema events.
- `fanout --plan-file FILE` — validate and ingest two or more independent registration/bundle pairs under one `loopId`, requiring unique Work Item IDs, Attempt IDs, branches, and worktree paths, then tick once to dispatch ready Actions. Use it only when each Worker Topic is already isolated.
- `agent-task-start --plan-file FILE` — the required single-item path for new isolated Attempts. It creates a brand-new Project, then journals and provisions Project-bound coordinator, execution `agent_task`, quiet evidence, and Review Topics. Group topology and Project membership are verified before registration/bundle ingestion. The returned Project ID and topic IDs are authoritative. A failure leaves an inspectable journal and does not dispatch a half-provisioned Attempt.
- `agent-task-fanout --plan-file FILE` — legacy parallel provisioning. Do not use it for new evidence-lane Attempts until it provisions a separate evidence/review lane per item.
- `integrate --plan-file FILE` — require immutable Candidate/PR inputs, verify each input Work Item is accepted/closed and its Candidate exists, then register and dispatch one integration Work Item.
- `bundle --event-file FILE` — ingest a higher-generation bundle after `changes_requested`, then tick.
- `workspace-prepare --packet-file FILE` — Worker-only exact worktree creator/verifier; it checks base SHA, branch, normalized path, Git worktree registration, and workspace lease before repository work.
- `runtime-started`, `candidate`, and `review` — validate and canonicalize existing-schema event JSON for an Agent to use in its transport envelope; they never ingest locally.
- `readiness-submit`, `runtime-start-submit`, `candidate-submit`, and `review-submit` — receipt-verified transport commands. They send exact canonical event JSON to the declared quiet evidence Topic and require a matching server-confirmed receipt.
- `agent-task-retry --packet-file FILE --event-file FILE` — provision fresh execution/evidence/review Topics for a fenced `recover_attempt` and submit its next-generation routed bundle.
- `next --plan-next-action-id ACTION_ID --plan-file FILE` — validate the current `plan_next` packet, verify the new plan has the same `loopId` and a new Work Item ID, then ingest registration and bundle and tick.

## Review and Worker flow

Before handling every Human request, Review first runs the read-only `opencli catsco me` auth preflight. If the local CatsCo/OpenCLI session is missing, expired, or unauthorized, Review stops and asks the Human to log in; it does not process the task, modify files, or enter Loop. Login success only confirms the session and does not select Loop.

Loop is opt-in, not the default behavior. For an ordinary human request after auth succeeds, Review remains a normal Agent and may answer, inspect, or modify through the host's usual workflow. Review enters Loop mode only when the human explicitly asks to use Loop, start a Loop, use `loopctl`, or otherwise requests Controller/Worker orchestration. Once Loop is selected, Review independently chooses the execution shape. For large tasks with independent deliverables and manageable write-scope isolation, the default preference is bounded multi-Worker fan-out. Small, tightly coupled, ordered, or fragile overlapping work remains sequential. The Human does not need to prescribe the worker count. A Controller Action continues an already-started Loop; a structured group mention only wakes Review and does not select Loop by itself.

When Loop mode is explicitly active, the human supplies natural language only to the Review Agent.

Each new `agent-task-start` invocation creates a distinct CatsCo Project and four newly-created Project groups: coordinator (standard, Review), execution (`agent_task`, Worker), quiet evidence (standard, Worker + Review), and review (standard, Review). The plan uses `catscoProjectId: "project:new"` plus Worker/evidence/review placeholders and must omit coordinator session fields. The command derives the coordinator session from its returned standard-group topic; it never accepts a caller-supplied historical coordinator topic or treats a P2P route/runtime connection as a provisioned session. Controller sends a structured mention for the Worker in the dedicated execution group, producing one native Runtime session per Topic without Runtime changes.

An existing multi-member `grp_*` conversation is only a human supervision surface and is never a `agent-task-start` steward or coordinator topic. A human must structurally mention Review there; visible `@name` text is not a wake signal.

In explicit Loop mode, Review first runs `opencli catsco agents --format json` and selects an available Worker. If none is eligible, Review stops before creating a Work Item and asks the task author to provide a CatsCo Agent UID. Adding that Agent means establishing a friend relationship: Review uses `opencli catsco friend-request AGENT_UID --message "Loop Worker access requested"`, waits for acceptance, then refreshes `catsco agents` before proceeding. It never asks for credentials or creates a Bot as a substitute. Once an eligible Worker is available, Review creates a complete single-item plan with `catscoProjectId: "project:new"` and runs `opencli loop agent-task-start`; it does not ask the human for Kernel events. The command provisions one fresh Project plus coordinator, execution, evidence, and Review Topics before dispatch. Each bundle carries a `LOOP_WORKTREE_CONTRACT_V1` instruction with a unique branch, worktree path, `gitDir`, base revision, cleanup policy, and workspace lease. After all required Candidates are accepted, Review uses `opencli loop integrate`; the command fails closed unless every declared Candidate input is present behind an accepted/closed Work Item. Controller sends `execute_attempt` to each Attempt's dedicated Worker Agent Task topic with `mentions:["usr<worker-uid>"]`. Controller sends Review Actions to the new Project-owned review group, so only Review wakes there. Packet content and protocol events remain unchanged.

Review inspects `review_candidate` packets with Bash, `gh`, and tests, then submits a relative `review-submit` envelope to the evidence Topic; a normal CatsCo reply is not review evidence.

The Worker accepts `preflight_attempt` and `execute_attempt` packets. Preflight only proves OpenCLI/CatsCo readiness through `readiness-submit`; it cannot touch the repository. On execution, it first runs `workspace-prepare`, starts through `runtime-start-submit`, and completes through `candidate-submit`; all transport commands target the quiet evidence Topic and require a CatsCo server receipt rather than relying on a wrapped tool transcript. It performs bounded Bash/Git/`gh` work within the packet's contracts, scope, and lease.

A `changes_requested` review leaves the Work Item in `changes_requested`; after the Controller commits it, Review creates generation+1 and runs `opencli loop bundle`. An accepted/closed review creates exactly one `plan_next` Action. Review uses that packet with `opencli loop next` for another Work Item in the same loop, or reports completion to the human when no next Work Item exists. There is no fake `loop_completed` event, and task status or PR existence is not completion evidence.

## Skills

- `skills/loopctl-review/SKILL.md`
- `skills/loopctl-worker/SKILL.md`
- Placeholder fixtures: `skills/examples/`

Install or link these skill files into the Agent's skill directory according to the host's skill-install mechanism. Do not copy credentials, real IDs, or secrets into the examples.

## Installation and development

The plugin package is intended to be installed alongside, not over, an existing plugin. Before installing, inspect the destination and preserve any existing `loop` plugin; do not remove or overwrite it without an explicit operator decision. For a local development checkout, use the host's local plugin link/install facility with this directory, or use the repository's safe validation helper:

```bash
cd opencli-plugin-loopctl
pnpm install
pnpm build:plugin
pnpm validate:host
```

`validate:host` creates an isolated temporary HOME, links this plugin without touching the user's installed plugins, and verifies all eleven commands. To use the controller from a development checkout:

```bash
LOOPCTL_BINARY=/absolute/path/to/loop-system/controller/dist/cli.js \
  opencli loop status
```

Build and test commands:

```bash
pnpm typecheck
pnpm test:run
pnpm build:plugin
pnpm validate:host
```

## Core freeze guarantee

This plugin does not modify XiaoBa-CLI, CatsCo, Kernel transitions, protocol event schemas, or migrations. Controller packet projection and transport glue consume the existing Loop Controller contracts; the frozen paths remain unchanged.

## Residual P0 limits

The integration retains these P0 limits: the Controller does not launch or modify Runtime; it observes native message delivery and records `runtime_bridge_unavailable` after the bounded runtime-start watchdog if no `runtime_started` arrives. Agents must not replace delivery with `sleep` plus `opencli catsco messages` polling; concurrent fan-out is isolated by one dedicated Agent Task topic, Worktree Contract, workspace lease, branch, and Controller cursor per Attempt, but group provisioning and event ingest are recoverable rather than cross-system atomic; bounded 200-message polling; Review is co-located with `loopctl`; shared groups are human-supervision surfaces and never Worker execution queues; dedicated one-Worker `agent_task` groups are the sole Worker execution groups for concurrent Attempts; group membership is CatsCo conversation state rather than Kernel fact; Agents must send builder output verbatim; and there is no durable `loop_completed` event. Completion is represented by no next Work Item plus a human-facing completion report.
