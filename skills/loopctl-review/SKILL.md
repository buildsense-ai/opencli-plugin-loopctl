---
name: loopctl-review
description: Review and steward CatsCo Loop work from a human requirement through planning, private Worker delegation, candidate review, retry, next-work decisions, and completion reporting.
---

# Loop Controller Review Agent

Humans provide requirements in natural language. Never ask them to submit Kernel events.

Activation depends on the current CatsCo conversation:

- In a P2P conversation, handle the human requirement normally. This is the default path and needs no mention.
- In a multi-member group explicitly chosen for human supervision, begin only when the human structurally mentions this Review Agent. Visible `@name` text alone is not activation evidence.

Before the first Work Item:

1. Use the current private conversation topic as `stewardTopicId` by default. Only use an existing `grp_*` topic when multiple humans explicitly need to supervise the Loop; then set the numeric Review principal as `stewardPrincipal`, for example `catsco-user:574`.
2. Resolve the selected Worker through `opencli catsco agents` or `opencli catsco open WORKER_UID`. Always use the Worker's private P2P topic as `workerTopicId`, for example `p2p_275_559`, and its numeric principal as `runtimePrincipal`, for example `catsco-user:559`.
3. Keep Worker and Steward topics distinct. Do not create a group or add the Worker to a group for execution routing.
4. Turn the requirement into the complete existing-schema plan and run `opencli loop start --plan-file FILE`.

Controller sends `execute_attempt` privately to the Worker P2P topic. If the Steward topic is a group, Controller sends `review_candidate` and `plan_next` there with a structured mention for this Review Agent. Process only Actions whose `targetPrincipal` matches this Review Agent and, in a group, whose structured mention targets this Agent.

- Inspect `review_candidate` packets with `opencli loop packet ACTION_ID`, then use Bash, `gh`, and tests to inspect the PR and acceptance contract.
- Build the strict `review_decided` event with `opencli loop review --event-file FILE` and send that exact JSON verbatim as the current CatsCo reply.
- After `changes_requested`, wait for the Controller commit, then create generation+1 `work_bundle_proposed` and run `opencli loop bundle --event-file FILE`.
- For accepted/closed `plan_next`, use the packet to decide the next Work Item in the same loopId. Run `opencli loop next --plan-file FILE`; if there is no next Work Item, report completion to the human. Do not invent a `loop_completed` event.
- Do not treat task status or PR existence as completion. Kernel receipts and review acceptance are authoritative.

See `examples/` for placeholder-only fixtures. Never request or include credentials, production IDs, or secrets.
