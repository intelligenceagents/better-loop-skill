# Eight known attribution failures repaired

The actual repaired Better Loop validator passed **24/24 frozen checks**, compared with **16/24** for the initial public implementation. Eight cases changed from fail to pass; no case regressed. The prespecified quality floor passed: all 24 correct decisions, all six positive and ten negative controls preserved, no thrown validator exceptions or input mutations, and exact returned data preservation for every accepted record.

This is a **retrospective code-version regression check using known authored test probes**. It demonstrates a specific public software repair. It does not measure a person's ability, model/skill efficacy, general software quality or savings.

## Exact outcomes

| Check group | Before | After |
|---|---:|---:|
| F1: reject unsupported observed-human claims | 0/5 | 5/5 |
| F2: accept honest missing-evidence attestations | 0/3 | 3/3 |
| Positive controls | 6/6 | 6/6 |
| Negative controls | 10/10 | 10/10 |
| **All frozen cases** | **16/24** | **24/24** |

Across all groups, valid-input acceptance was 6/9 before and 9/9 after; invalid-input rejection was 10/15 before and 15/15 after. Before accepted five unsupported observed-human claims and rejected three legitimate attestation forms. After rejected those unsupported observations and preserved the valid reported claims, including insufficient/not-observed states and null ratings.

The pass fraction moved from 66.67% to 100%, an increase of 33.33 percentage points. A normalized **test-pass-count index** is 100 → 150 because the actual baseline is 16 passes and the after count is 24 on the same set. This arithmetic is not a general “50% quality improvement.” The repair-only subset starts at zero passes, so its relative percentage improvement is undefined; use 0/8 → 8/8.

| Frozen check ID | Expected | Before | After |
|---|---|---|---|
| F1-unknown-attribution | reject | accepted · FAIL | rejected · pass |
| F1-absent-attribution | reject | accepted · FAIL | rejected · pass |
| F1-artifacts-only | reject | accepted · FAIL | rejected · pass |
| F1-unknown-basis | reject | accepted · FAIL | rejected · pass |
| F1-attestation-not-observation | reject | accepted · FAIL | rejected · pass |
| F2-attestation-insufficient | accept | rejected · FAIL | accepted · pass |
| F2-attestation-not-observed | accept | rejected · FAIL | accepted · pass |
| F2-attestation-no-base-behavior | accept | rejected · FAIL | accepted · pass |
| P1-selected-message | accept | accepted · pass | accepted · pass |
| P2-conversation-basis | accept | accepted · pass | accepted · pass |
| P3-artifacts-unobserved | accept | accepted · pass | accepted · pass |
| P4-unknown-unobserved | accept | accepted · pass | accepted · pass |
| P5-autonomous-unobserved | accept | accepted · pass | accepted · pass |
| P6-two-matched-indicators | accept | accepted · pass | accepted · pass |
| N1-selected-not_observed | reject | rejected · pass | rejected · pass |
| N2-selected-insufficient_evidence | reject | rejected · pass | rejected · pass |
| N3-selected-not_applicable | reject | rejected · pass | rejected · pass |
| N4-selected-no-behavior | reject | rejected · pass | rejected · pass |
| N5-selected-wrong-indicator | reject | rejected · pass | rejected · pass |
| N6-selected-artifacts-basis | reject | rejected · pass | rejected · pass |
| N7-selected-attestation-basis | reject | rejected · pass | rejected · pass |
| N8-selected-autonomous | reject | rejected · pass | rejected · pass |
| N9-duplicate-base-indicator | reject | rejected · pass | rejected · pass |
| N10-duplicate-capsule-action | reject | rejected · pass | rejected · pass |

## Sources and evaluator

- Before: evidence `0.1.0-draft.1`, public commit `d1fce5188002dada01634cd1c328ff903ed0f6b4`.
- After: evidence `0.1.0-draft.2`, public commit `01091e5c26378576b3b42d6a7f9735821d9ae2e4`.
- Function: `validateContribution`, `packages/evidence/src/index.ts`; both exact entrypoints compiled in isolated temporary directories against identical hash-pinned cached dependencies. Contracts/privacy source trees are identical between commits.
- Original protocol/input freeze: `513a92c33f59326c31e96c1715fff37ad56854a6`.
- Harness amendment freeze: `e63931af0e49562b60e3f5d023b4384333452773`.
- Evaluator: `bl-evidence-attribution-repair-0.2`; esbuild `0.28.2`; Node `v22.10.0`, macOS arm64.
- Completed at 2026-09-15T17:21:54.450Z; before then after, one call per case per source. The 1,277 ms total checks the 120-second execution bound only and is not a before/after performance measurement.

Source, compiler-input and bundle hashes are retained in [the complete execution record](RESULTS-v0.2.json), [the freeze manifest](FREEZE-v0.2.json) and [the machine-readable summary](SUMMARY.json). The [protocol](PROTOCOL.md) and [complete inputs](cases.json) remain frozen.

## Failed attempt retained

The first attempt compiled both source versions but failed a temporary-path identity check before importing/calling either validator. [Its original result](RESULTS.json) retains two infrastructure failures, zero evaluated cases and quality floor false. The confirmed macOS alias required canonical path comparison. [The amendment](AMENDMENT-v0.2.md) was separately committed and pushed before the second attempt. Inputs, expected decisions, source versions and quality floor were unchanged. This infrastructure retry is not an independent replication.

## Scope and honest story use

The test inputs are generic authored JSON probes marked `synthetic`, with no KPIs or claimed work result. The measured result above comes from executing actual public software, not from inventing a customer task or model output. The evaluator author inspected the repair and earlier tests before writing this suite. The checks are known cases, share a template, and are neither held-out nor blinded or independent validation. No unseen-case coverage or population inference follows.

This is a separate evidence-attribution repair story. Public privacy history begins with the already-repaired package at commit `990428dadb3061453b54d3b078b1c8434d4e5d47`; no earlier committed privacy implementation was available for the proposed original-story comparison. That missing before source is material. Do not present this different component's results as measured repair of the existing exact-content/purpose-binding episode.

No models, semantic reviewers, approvals or contributions were invoked. Human effort, coding/orchestration resources and cash cost remain unmeasured. The result establishes no human judgment, hiring validity, privacy clearance, full native-skill improvement or savings. Any real repair story still needs its own exact review, consent and admission.

The earlier [public model benchmark](../public-work-benchmark/RESULTS.md) remains unchanged: equal quality and slightly more reported tokens with guidance. This regression report is not a new registered model benchmark or community cohort record.
