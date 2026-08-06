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
opencli loop integrate --plan-file plans/integration.json
opencli loop bundle --event-file plans/retry-generation-2.json
opencli loop runtime-started --event-file events/runtime-started.json
opencli loop candidate --event-file events/candidate.json
opencli loop review --event-file events/review.json
opencli loop next --plan-next-action-id ACTION_ID --plan-file plans/next.json
```

The eleven commands are:

- `status [--work-item ID]` — delegate to `loopctl status`.
- `pending` — list ready Actions and current Work Items.
- `packet ACTION_ID` — read the complete, current Agent packet.
- `start --plan-file FILE` — ingest registration and bundle, then tick. The plan must contain exactly those two existing-schema events.
- `fanout --plan-file FILE` — validate and ingest two or more independent registration/bundle pairs under one `loopId`, requiring unique Work Item IDs, Attempt IDs, branches, and worktree paths, then tick once to dispatch ready Actions.
- `integrate --plan-file FILE` — require immutable Candidate/PR inputs, verify each input Work Item is accepted/closed and its Candidate exists, then register and dispatch one integration Work Item.
- `bundle --event-file FILE` — ingest a higher-generation bundle after `changes_requested`, then tick.
- `runtime-started`, `candidate`, and `review` — validate and canonicalize existing-schema event JSON for an Agent to send verbatim; they never ingest locally.
- `next --plan-next-action-id ACTION_ID --plan-file FILE` — validate the current `plan_next` packet, verify the new plan has the same `loopId` and a new Work Item ID, then ingest registration and bundle and tick.

## Review and Worker flow

The human supplies natural language only to the Review Agent.

P2P is the default: Review uses its current private topic as `stewardTopicId`, and resolves the selected Worker's existing private P2P topic through `opencli catsco agents`/`open` as `workerTopicId`. These topics remain distinct and no group or mention is needed.

Fallback for multiple human supervisors: Review may explicitly use an existing multi-member `grp_*` conversation as `stewardTopicId`. In that mode, a human must structurally mention Review; visible `@name` text is not a wake signal. This changes only Review's human interaction surface; Worker dispatch remains private P2P.

Review creates a complete plan and runs `opencli loop start`; it does not ask the human for Kernel events. For independent parallel work, Review uses `opencli loop fanout`; each bundle carries a `LOOP_WORKTREE_CONTRACT_V1` instruction with a unique branch, worktree path, base revision, cleanup policy, and workspace lease. After all required Candidates are accepted, Review uses `opencli loop integrate`; the command fails closed unless every declared Candidate input is present behind an accepted/closed Work Item. Controller sends `execute_attempt` privately to Worker P2P. If the explicitly selected Steward topic is a group, Controller derives `mentions:["usr<review-uid>"]` for `review_candidate` and `plan_next`, so only Review wakes in that group. Packet content and protocol events remain unchanged.

Review inspects `review_candidate` packets with Bash, `gh`, and tests, then sends the exact output of `opencli loop review` as its CatsCo reply.

The Worker accepts only an `execute_attempt` packet. It sends the exact `runtime-started` output first through the existing CatsCo reply capability, performs bounded Bash/Git/`gh` work within the packet's contracts, scope, and lease, and sends the exact Candidate output afterward.

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

The integration retains these P0 limits: fan-out dispatch and worktree contracts do not themselves prove distinct XiaoBa process sessions; bounded 200-message polling; Review is co-located with `loopctl`; P2P is the default; a group is an explicit fallback human-supervision surface rather than a Worker execution queue; group membership is human/CatsCo conversation state rather than Kernel fact; Worker execution uses existing private P2P Topics; Agents must send builder output verbatim; and there is no durable `loop_completed` event. Completion is represented by no next Work Item plus a human-facing completion report.
