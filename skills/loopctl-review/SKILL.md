---
name: loopctl-review
description: Review and steward CatsCo Loop work from a human requirement through planning, private Worker delegation, candidate review, retry, next-work decisions, and completion reporting.
---

# Loop Controller Review Agent

Humans provide requirements in natural language. Never ask them to submit Kernel events.

## Auth Preflight

Before handling every new Human request, first verify that this runtime's OpenCLI CatsCo session is authenticated and belongs to the expected owner context. Use the existing read-only command:

```bash
opencli catsco me
```

If it fails because the session is missing, expired, or unauthorized, stop and tell the Human to log in to CatsCo/OpenCLI on this host. Do not answer the task, call `opencli loop`, inspect a Worker, or modify files while the required session is unavailable. Do not ask the Human for credentials or print tokens.

If `catsco me` succeeds, continue to the mode decision below. A successful login check does not itself select Loop mode.

## Mode Gate

Loop is opt-in. Do not create a Work Item, call `opencli loop`, dispatch a Worker, or start a Worktree merely because a human described a software task.

- For an ordinary request without an explicit Loop instruction, behave as the normal Review/Agent: answer, inspect, or modify using the host's normal workflow.
- Enter Loop mode only when the human explicitly asks to use Loop, start a Loop, use `loopctl`, or otherwise clearly requests Controller/Worker orchestration. The Human does not need to choose single-task versus parallel execution.
- A verified Controller Action (`execute_attempt`, `review_candidate`, or `plan_next`) is also an explicit Loop-mode signal for continuing an already-started Loop.
- A structured group mention only wakes this Agent; it does not by itself opt the human into Loop mode.

When Loop mode is not active, do not create Loop JSON, Worktree Contracts, Candidates, or `loop_completed` messages.

Activation depends on the current CatsCo conversation:

- In a P2P conversation, handle the human requirement normally. This is the default path and needs no mention.
- In a multi-member group explicitly chosen for human supervision, begin only when the human structurally mentions this Review Agent. Visible `@name` text alone is not activation evidence.

When Loop mode is active, before the first Work Item:

1. Check Worker availability with `opencli catsco agents --format json`. Select only an available Agent that can perform the needed work; do not assume that Review itself must execute it.
2. If no eligible Worker is available, stop before creating a Work Item. Tell the task author which capability is missing and ask them to provide the CatsCo Agent UID to add. Adding an Agent means establishing a friend relationship, not creating a Bot. After the author provides an Agent UID, use `opencli catsco friend-request AGENT_UID --message "Loop Worker access requested"`, wait for the Agent owner to accept, then rerun `opencli catsco agents --format json`. Do not proceed until the Agent is visible and available. Never ask for an API key, password, JWT, or other credential.
3. Use the current private conversation topic as `stewardTopicId` by default. Only use an existing `grp_*` topic when multiple humans explicitly need to supervise the Loop; then set the numeric Review principal as `stewardPrincipal`, for example `catsco-user:574`.
4. Resolve the selected Worker through `opencli catsco agents` or `opencli catsco open WORKER_UID`. Always use the Worker's private P2P topic as `workerTopicId`, for example `p2p_275_559`, and its numeric principal as `runtimePrincipal`, for example `catsco-user:559`.
5. Keep Worker and Steward topics distinct. Do not create a group or add the Worker to a group for execution routing.
6. Decide the execution shape yourself after the Human opts into Loop. Prefer bounded multi-Worker fan-out for large tasks when they can be decomposed into independent deliverables with non-overlapping or manageable write scopes. Use `opencli loop fanout --plan-file FILE` by default for that case. Use one Work Item and `opencli loop start --plan-file FILE` for small tasks, tightly coupled work, ordered shared state, fragile overlapping files, or work where parallel coordination would add more risk than value. Do not fan out merely to increase Worker count. An Agent UID is an addressable principal, not a single-session lock: the same Worker may serve multiple concurrent, independent Attempts when its advertised capacity permits. For fan-out, create one registration/bundle pair per Work Item under the same `loopId`. Every bundle instruction must contain exactly one line beginning `LOOP_WORKTREE_CONTRACT_V1=` with JSON fields `repository`, `baseRevision`, `branchName`, `worktreePath`, `cleanupPolicy`, and `workspaceLease`. Keep Work Item IDs, Attempt IDs, generations, branches, paths, and leases unique; bound fan-out to the selected Worker's advertised runtime capacity, not merely its UID count.

After every independent Candidate is accepted, create one new integration Work Item and run `opencli loop integrate --plan-file FILE`. Its bundle instructions must contain one `LOOP_INTEGRATION_INPUTS_V1=` line with immutable accepted Candidate/PR references: `workItemId`, `candidateId`, repository, PR number, head SHA, and digest. Integration gets its own branch and worktree, combines the accepted heads, resolves conflicts, runs aggregate verification, and submits the final Candidate. Never start integration before all required independent Work Items are accepted.

Controller sends `execute_attempt` privately to the Worker P2P topic. Review Actions are delivered through the native CatsCo Runtime message handler. Do not use `sleep`, `opencli catsco messages`, `catsco watch`, or a self-managed polling loop to discover Actions; if the native bridge is unavailable, report that bridge failure and stop. If the Steward topic is a group, Controller sends `review_candidate` and `plan_next` there with a structured mention for this Review Agent. Process only Actions whose `targetPrincipal` matches this Review Agent and, in a group, whose structured mention targets this Agent.

- Inspect `review_candidate` packets with `opencli loop packet ACTION_ID`, then use Bash, `gh`, and tests to inspect the PR and acceptance contract.
- Build the strict `review_decided` event with `opencli loop review --event-file FILE` and send that exact JSON verbatim as the current CatsCo reply.
- After `changes_requested`, wait for the Controller commit, then create generation+1 `work_bundle_proposed` and run `opencli loop bundle --event-file FILE`.
- For accepted/closed `plan_next`, use the packet to decide the next Work Item in the same loopId. Run `opencli loop next --plan-file FILE`; if there is no next Work Item, report completion to the human. Do not invent a `loop_completed` event.
- Do not treat task status or PR existence as completion. Kernel receipts and review acceptance are authoritative.

See `examples/` for placeholder-only fixtures. Never request or include credentials, production IDs, or secrets.
