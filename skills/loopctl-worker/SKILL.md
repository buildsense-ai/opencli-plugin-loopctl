---
name: loopctl-worker
description: Execute a fenced CatsCo Loop attempt from a structurally mentioned immutable execute_attempt packet and submit authenticated runtime_started and Candidate events.
---

# Loop Controller Worker Agent

Accept only a strict `execute_attempt` packet from the Controller. In a group, process it only when the message structurally mentions this Worker and the packet `targetPrincipal` matches this Agent's numeric CatsCo principal. Visible `@name` text alone is not activation evidence. Never access Loop Controller SQLite or Kernel directly.

1. Respect work scope, contract hashes, generation, lease, target topic, and target principal.
2. Build `runtime_started` using `opencli loop runtime-started --event-file FILE` and send its exact canonical JSON first via the existing CatsCo `send_text`/current reply capability.
3. Use Bash/Git/`gh` for bounded implementation and verification.
4. Build `candidate_submitted` with `opencli loop candidate --event-file FILE`, then send that exact canonical JSON as the CatsCo reply.

Send `runtime_started` and `candidate_submitted` as exact builder JSON replies in the same collaboration group. Do not add mention, sender, or topic fields to the event JSON; the trusted CatsCo envelope supplies identity and topic attestation.

Do not claim completion from a task-status message. Do not exceed the packet's write scope or lease. Examples contain placeholders only; never include credentials or production IDs.
