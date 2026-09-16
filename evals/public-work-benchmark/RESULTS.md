# Actual public-source results — one paired execution

Status: **real executions retained**. The historical registration remains unchanged: its source, protocol and checks were committed before execution at `0aab3f442e48e9a705575bfa5b2283349781b2cb`. The coordinator verified the freeze before running two actual Claude Code invocations, host version `2.1.270`, in baseline-then-with-guidance order.

Both outputs met all **12/12 case checks and 3/3 scope-limit checks** under the frozen deterministic judge. There was **no measured quality gain**. The guided arm used slightly more reported model tokens. This is a bounded consistency-classification task on actual public Better Loop code; it does not test the full installed skill, host workflow or human trajectory.

| Observation | Baseline | With guidance |
|---|---:|---:|
| Frozen case checks | 12/12 | 12/12 |
| Scope-limit checks | 3/3 | 3/3 |
| Reported model tokens, all model entries | 34,617 | 34,981 |
| Host-reported API list-cost estimate, USD | 0.223280 | 0.223716 |
| Observed host wall duration, seconds | 11.799 | 10.039 |

Tokens increased by **364 (about 1.05%)** with guidance. No savings or efficiency gain is established. The single observed duration difference does not establish a causal speed improvement. The cost figures are provider-list estimates reported by the host, **not cash billing**.

[RESULTS.json](RESULTS.json) retains both exact public-task outputs, host status, assembled-prompt hashes, each `model_usage` entry, deterministic judge results, calculated accounting and limitations. It was created from the coordinator's actual execution record using an explicit field allowlist after inspecting that record. No private paths, account identity, email, credentials or customer work are included.

Token accounting sums `inputTokens + outputTokens + cacheReadInputTokens + cacheCreationInputTokens` once for **every** `model_usage` entry, including the host classifier model and main model. Top-level `usage` and its iteration data repeat main-model accounting and are not added again. Thinking tokens are a subset of reported output tokens and are not added again. Model-entry costs are summed once. No model names or prices are built into the rubric.

Only one task and one ordered pair were observed. No counterbalanced replication, uncertainty estimate, independently held-out validation or population comparison is available. Public source/rubric contamination is possible; assembled prompt hashes identify prompts but do not independently prove every host configuration condition. The registered five-pair preliminary improvement gate is not met. Full coding-agent orchestration overhead, parent/other worker/retry coverage, human effort and actual cash billing are unknown. No causal improvement, repeated learning, human ability, hiring validity or security audit is claimed.

The discovery package performed no model calls. These were two coordinator-run native host invocations; their per-model accounting is retained within each arm. Do not present fixture tests as additional executions. Registered source files and original `freeze.json` are unchanged; results are a subsequent artifact.
