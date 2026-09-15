# Public evidence-attribution repair demonstration

Protocol and evaluator version: `bl-evidence-attribution-repair-0.1`.

This is a matched software regression demonstration of two known defects repaired in actual public Better Loop code. It is not a registered model benchmark. The evaluator and authored JSON probes are frozen in a separate Git commit before either source version is compiled or called for this demonstration. The evaluator author has already inspected the repair and its existing tests; this is not held-out, blinded or independent validation.

The bounded claim to check is: **The repaired contribution validator rejects unsupported observed-human claims while accepting honest missing-evidence attestations across every frozen probe, without breaking the normal controls.**

## Actual software under comparison

Repository: `https://github.com/intelligenceagents/better-loop-skill`

Function: `validateContribution`, in `packages/evidence/src/index.ts`.

| Arm | Actual source commit | Evidence package |
|---|---|---|
| Before | `d1fce5188002dada01634cd1c328ff903ed0f6b4` | `0.1.0-draft.1` |
| After | `01091e5c26378576b3b42d6a7f9735821d9ae2e4` | `0.1.0-draft.2` |

F1 concerns observed human behavior lacking matching selected-human-message attribution. F2 concerns legitimate user attestations incorrectly requiring an observed base behavior. The repaired code requires correspondence in both directions and preserves attestations as reported claims.

This is a separate repair episode from the existing privacy exact-content/purpose-binding story. Reachable public history introduces `packages/privacy/src/index.ts` at `990428dadb3061453b54d3b078b1c8434d4e5d47`; it does not provide an earlier committed implementation for that proposed comparison. No earlier privacy implementation is fabricated, and this attribution result cannot be relabeled as a measured repair of the privacy episode.

Only the evidence entrypoint changes between arms. Contracts/privacy source trees are identical at these commits. Both arms use the same hash-pinned cached contracts/privacy builds, Noble hashes and esbuild compiler. This isolates the source repair; it is not a reconstruction of every historical environment detail. `FREEZE.json` pins source/package hashes, dependency tree identities, cached dependency bytes, evaluator/input bytes and runtime version.

## Inputs, checks and floor

`cases.json` contains 24 complete authored test inputs with prespecified accept/reject decisions:

- Five F1 repair cases reject observed behavior backed by unknown, absent, artifacts-only, unknown-basis or attestation-only attribution.
- Three F2 repair cases accept user attestations with `insufficient_evidence`, `not_observed`, or no base behavior. Ratings stay null; no observation is manufactured.
- Six positive controls accept corresponding selected-human evidence and honest missing-evidence/agent-only records, including two correctly matched indicators.
- Ten negative controls reject absent or mismatched base observations, incompatible observation bases, autonomous attribution and duplicates.

Every payload explicitly has `content_origin: synthetic`, no KPIs and no measured outcome. Its narrative describes an authored validation probe, not an invented achievement, customer task or executed model interaction. These inputs are never contributions and are not published through admission.

One case passes only if the function returns the expected validity, does not throw, leaves its input unchanged, and—when accepted—returns deeply equal contribution data. The preservation condition includes observability states, null ratings and attestation labels. Returned validation findings are retained, but exact error wording is not the primary oracle.

**Quality floor:** after must pass all 24 cases, including all six positive and ten negative controls. No case may regress from pass to fail. A partial result, exception, failed control or unavailable build is reported as such; it cannot satisfy the promise. Counts are software-test outcomes, not quality or ability scores for a person.

## Frozen execution procedure

1. Commit this directory with `PROTOCOL.md`, `cases.json`, `run.mjs` and `FREEZE.json` before running the evaluator.
2. From a local checkout with both Git objects and the pinned dependencies already available, execute `node evals/public-repair-proof/run.mjs`. No package install, network download or root/package build is performed.
3. The runner verifies every frozen file against the commit and every cached dependency hash. It extracts only the two exact public evidence entrypoints into separate temporary directories.
4. Compile each entrypoint using the same cached esbuild and dependency bytes; run the same 24 probes once per arm, in fixed order: before, then after. Each arm has at most 50 seconds; the whole runner has a 120-second deadline. No test input can select a command or file.
5. Retain every case result, including failures, and any infrastructure failure. The runner writes one new `RESULTS.json` using exclusive creation and refuses to overwrite it. A fresh reproduction can choose a new output path. Execution order is not counterbalanced; this is a deterministic self-test, not a randomized experiment.
6. Summarize the observed outputs in `RESULTS.md` without altering frozen inputs or the existing public-work benchmark.

The runner calls no models or semantic reviewers, creates no approval, submits no contribution, and touches no application/database/service. It executes only the fixed engineering operations above. Compilation occurs in temporary directories; production package builds and pins stay unchanged.

## Reporting and limitations

Report before/after exact counts, group counts, expected acceptance/rejection counts, repaired/regressed/unchanged case IDs, quality-floor result, source/evaluator/compiler/runtime versions and frozen hashes. Retain the before failures.

Use absolute counts and percentage-point change in test pass fraction. Do not label a change from zero repair-case passes as a relative percentage improvement; division by a zero baseline is undefined. Case pass fraction is not resource efficiency. No time, token, cash-cost or human-effort savings are measured, and coding/orchestration effort remains unknown.

Known-case selection can overstate general coverage. The probes share a base template and are not independent task samples; no population inference or confidence interval is justified. Passing proves only these executions of the frozen checks. It does not establish unseen-defect absence, truth of any human claim, privacy clearance, human ability, hiring validity, full native-skill efficacy or learning transfer. Publication/admission and actual user consent remain separate.

The earlier frozen `bl-public-approval-binding` model benchmark and its equal-quality, slightly-higher-token result remain unchanged.
