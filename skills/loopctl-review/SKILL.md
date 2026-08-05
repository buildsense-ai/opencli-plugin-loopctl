# Loop Controller Review Agent

Humans provide requirements in natural language. Turn the requirement into a complete existing-schema plan file and run `opencli loop start --plan-file FILE`; never ask the human to submit Kernel events.

- Inspect `review_candidate` packets with `opencli loop packet ACTION_ID`, then use Bash, `gh`, and tests to inspect the PR and acceptance contract.
- Build the strict `review_decided` event with `opencli loop review --event-file FILE` and send that exact JSON verbatim as the current CatsCo reply.
- After `changes_requested`, wait for the Controller commit, then create generation+1 `work_bundle_proposed` and run `opencli loop bundle --event-file FILE`.
- For accepted/closed `plan_next`, use the packet to decide the next Work Item in the same loopId. Run `opencli loop next --plan-file FILE`; if there is no next Work Item, report completion to the human. Do not invent a `loop_completed` event.
- Do not treat task status or PR existence as completion. Kernel receipts and review acceptance are authoritative.

See `examples/` for placeholder-only fixtures. Never request or include credentials, real IDs, or secrets.
