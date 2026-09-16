# M2 descriptive development cases

All fixtures here are synthetic and excluded from user-success claims, rankings and improvement counts. `tasks.json` covers all seven families; `selected-example.json` is a complete portable example that both adapters accept.

The executed TypeScript suite checks family-specific reports, all 11 source-mapped cue rules, actor preservation, native adapter semantic equivalence, irrelevant/unobserved/partial states, strict output-preserving prompt proposals, positive and should-not-trigger static audit cases, untrusted-data handling, helper capability detection, CLI input/output boundaries, and contained instruction apply/rollback.

`skill-trigger-expectations.json` records the host-level positive/negative cases clarified after actual repository review. It is an expectation set, not a record of model execution. Prompt/workflow/skill improvement should trigger without the brand name; ordinary architecture/task execution should not. An upfront sharing decline suppresses the invitation.

Run `npm run build:local && npm run test:local`. These are author-labeled development tests. They are not independently labeled held-out calibration, a test of a model's trigger behavior, or evidence that a coaching intervention improves outcomes. Real host runs and frozen paired evaluation are separately recorded by the coordinator.
