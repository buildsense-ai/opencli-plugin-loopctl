---
name: loopctl-worker
description: Execute a fenced CatsCo Loop Attempt received on its dedicated CatsCo Agent Task topic and submit authenticated runtime_started and Candidate events.
---

# Loop Controller Worker Agent

Accept only a strict `preflight_attempt` or `execute_attempt` packet delivered by the native CatsCo Runtime message handler on this Attempt's dedicated CatsCo `agent_task` topic (or a single non-parallel Worker P2P topic), with a `targetPrincipal` matching this Agent's numeric CatsCo principal. Never access Loop Controller SQLite or Kernel directly.

The Controller is the sole scheduler. Do not use `sleep`, `opencli catsco messages`, `catsco watch`, or any other polling loop to discover or self-start an Action. If the native CatsCo message bridge is unavailable, report `runtime bridge unavailable` and stop; do not execute a packet found by polling.

1. Respect work scope, contract hashes, generation, lease, target topic, target principal, and `evidenceTopicId`. The target Agent principal may receive multiple independent Attempts; it is not a session identifier. For parallel work, this packet must arrive on its dedicated `grp_<id>` Agent Task topic; reject a parallel packet sent to a shared P2P topic. Treat `attemptId + generation + workspaceLease + targetTopicId` as the execution-session boundary.
2. A `preflight_attempt` is **not** permission to inspect or modify the repository. It is an authentication/readiness gate only. Write a relative regular non-symlink file containing exactly `{ "targetTopicId": "<packet evidenceTopicId>", "event": <worker_ready event> }`, run `opencli loop readiness-submit --event-file FILE`, and require its server-confirmed receipt. If `evidenceTopicId` is missing or receipt confirmation fails, report the blocker and stop. Do not create a worktree, run tests, or emit `runtime_started` during preflight.
3. On `execute_attempt`, first save the exact received packet to a relative regular non-symlink file, then run `opencli loop workspace-prepare --packet-file FILE`. It is the required worktree creator/verifier. Fail closed if it cannot prove the base revision, branch, exact normalized path, and workspace lease; never substitute a nearby or historical worktree.
4. Only after workspace preparation succeeds, write a relative submission file containing exactly `{ "targetTopicId": "<packet evidenceTopicId>", "event": <runtime_started event> }`, then run `opencli loop runtime-start-submit --event-file FILE`. `FILE` must be a regular non-symlink path below the current shell directory; never pass an absolute path. The command builds canonical JSON, sends it, and verifies the CatsCo receipt. Do not rely on a wrapped tool result or delayed final chat reply as event transport.
5. Use Bash/Git/`gh` for bounded implementation and verification. Keep the branch scoped to the packet's Work Item and generation.
6. Write a relative Candidate submission file containing exactly `{ "targetTopicId": "<packet evidenceTopicId>", "event": <candidate_submitted event> }`, then run `opencli loop candidate-submit --event-file FILE` from that same directory. `FILE` must not be absolute. Completion requires its server-confirmed CatsCo receipt; do not manually send Candidate JSON or claim completion if the command fails.

Do not join or use the human/Review group for work dispatch. The execution topic only carries Actions; the quiet `evidenceTopicId` only carries receipt-attested `worker_ready`, `runtime_started`, Candidate, and Review JSON. Do not add mention, sender, or topic fields to event JSON; the trusted CatsCo envelope supplies identity and topic attestation.

Do not claim completion from a task-status message. Do not exceed the packet's write scope or lease. Examples contain placeholders only; never include credentials or production IDs.
