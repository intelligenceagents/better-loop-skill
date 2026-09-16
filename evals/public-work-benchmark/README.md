# Actual public approval-binding benchmark

One registered task: **bl-public-approval-binding**, version **0.1**. This is a bounded code-reasoning challenge derived from actual public Better Loop implementation and history. There are no customer-work examples or invented execution results here.

Read [the registration](registration.json), [protocol](PROTOCOL.md), [baseline challenge](BASELINE.md) and [additional guidance](GUIDANCE.md). The source files are byte-for-byte copies of the pinned public commit, with original MIT licensing retained in [LICENSE](LICENSE). Checks are frozen in [rubric.json](rubric.json). The package `@better-loop/discovery` supplies a pure output judge and registry metadata; it makes no model calls.

`freeze.json` records SHA-256 hashes of every registered input and the frozen source copies. Verify with `node evals/public-work-benchmark/verify-freeze.mjs` from the repository root. That command reads files and checks bytes only. Tests under `packages/discovery/tests` use clearly labeled fixtures for software correctness; their answers are not benchmark execution evidence.

The coordinator must record the committed freeze revision before actual baseline/with-guidance execution and retain failures and neutral outcomes. At registration there are no model results, no improvement claim and no independently verified human ability evidence. Existing public source tests are provenance for the task, not new model results.
