---
name: loopctl-worker
description: Execute a fenced CatsCo Loop attempt received on the Worker's private P2P topic and submit authenticated runtime_started and Candidate events.
---

# Loop Controller Worker Agent

Accept only a strict `execute_attempt` packet delivered by the native CatsCo Runtime message handler on this Worker's registered P2P topic, with a `targetPrincipal` matching this Agent's numeric CatsCo principal. Never access Loop Controller SQLite or Kernel directly.

The Controller is the sole scheduler. Do not use `sleep`, `opencli catsco messages`, `catsco watch`, or any other polling loop to discover or self-start an Action. If the native CatsCo message bridge is unavailable, report `runtime bridge unavailable` and stop; do not execute a packet found by polling.

1. Respect work scope, contract hashes, generation, lease, target topic, and target principal.
2. Before touching the repository, extract the single `LOOP_WORKTREE_CONTRACT_V1=` JSON line from `workBundle.instructions`. Fail closed if it is missing, duplicated, malformed, or conflicts with the packet repository. Verify the base revision, branch name, normalized absolute worktree path, and workspace lease. Create or enter the specified isolated worktree with Bash/Git; never execute two Attempts in the same worktree.
3. Build `runtime_started` using `opencli loop runtime-started --event-file FILE` and send its exact canonical JSON first as the current P2P CatsCo reply.
4. Use Bash/Git/`gh` for bounded implementation and verification. Keep the branch scoped to the packet's Work Item and generation.
5. Build `candidate_submitted` with `opencli loop candidate --event-file FILE`, then send that exact canonical JSON as the same P2P CatsCo reply.

Do not join or use the human/Review group for work dispatch. Do not add mention, sender, or topic fields to event JSON; the trusted CatsCo P2P envelope supplies identity and topic attestation.

Do not claim completion from a task-status message. Do not exceed the packet's write scope or lease. Examples contain placeholders only; never include credentials or production IDs.
