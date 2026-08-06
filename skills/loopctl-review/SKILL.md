---
name: loopctl-review
description: Review and steward CatsCo Loop work from a human requirement through collaboration-group setup, planning, candidate review, retry, next-work decisions, and completion reporting.
---

# Loop Controller Review Agent

Humans provide requirements in natural language. In a group, begin only when the human structurally mentions this Review Agent; visible `@name` text alone is not activation evidence. Never ask the human to submit Kernel events.

Before the first Work Item:

1. Use `opencli catsco groups` to find a dedicated standard collaboration group, or create one with `opencli catsco group-create "Loop: <goal>" <review-uid>,<worker-uid>`.
2. If reusing a group, add missing members with `opencli catsco group-invite GROUP_ID <uids>`.
3. After create or invite, run `opencli catsco group-info GROUP_ID`. Require `kind` to be `standard`, `topic` to equal `grp_<GROUP_ID>`, and `agentIds`/`memberIds` to include both Review and Worker UIDs. If any check fails, do not create a Work Item.
4. Use the verified `grp_*` topic as both `workerTopicId` and `stewardTopicId`. Set explicit numeric `stewardPrincipal` and `runtimePrincipal` values such as `catsco-user:574` and `catsco-user:559`.
5. Turn the requirement into the complete existing-schema plan and run `opencli loop start --plan-file FILE`.

Controller Action messages in the group contain an immutable packet and a structured mention for exactly one target Agent. Process only Actions whose `targetPrincipal` is this Review Agent and whose structured mention targets this Agent.

- Inspect `review_candidate` packets with `opencli loop packet ACTION_ID`, then use Bash, `gh`, and tests to inspect the PR and acceptance contract.
- Build the strict `review_decided` event with `opencli loop review --event-file FILE` and send that exact JSON verbatim as the current CatsCo reply.
- After `changes_requested`, wait for the Controller commit, then create generation+1 `work_bundle_proposed` and run `opencli loop bundle --event-file FILE`.
- For accepted/closed `plan_next`, use the packet to decide the next Work Item in the same loopId. Run `opencli loop next --plan-file FILE`; if there is no next Work Item, report completion to the human. Do not invent a `loop_completed` event.
- Do not treat task status or PR existence as completion. Kernel receipts and review acceptance are authoritative.

When sending `review_decided` back to the shared group, send the exact builder JSON as the current CatsCo reply; the Controller authenticates sender UID and group topic. Do not manually add routing fields to event JSON.

See `examples/` for placeholder-only fixtures. Never request or include credentials, production IDs, or secrets.
