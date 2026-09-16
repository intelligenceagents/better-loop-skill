# Actual public software repair: evidence attribution

**16/24 → 24/24 frozen checks, eight repairs, zero regressions.** Read [the complete results](RESULTS.md) and [the machine-readable summary](SUMMARY.json).

This is a retrospective comparison of two actual public software versions using known authored regression probes. It is a separate evidence-attribution repair episode from the earlier privacy-binding story. It is not a new registered model benchmark, held-out evaluation, human achievement or proof of skill efficacy.

## Retained records

| Record | Meaning |
|---|---|
| [Protocol](PROTOCOL.md), [inputs](cases.json), [original freeze](FREEZE.json) | Committed before source compilation/execution |
| [Original result](RESULTS.json) | Two infrastructure failures before validator calls; retained unchanged |
| [Amendment](AMENDMENT-v0.2.md), [amended freeze](FREEZE-v0.2.json) | Canonical temporary-path correction, committed before the next attempt |
| [Completed execution](RESULTS-v0.2.json) | All 48 individual outcomes: same 24 cases on before and after |
| [Summary](SUMMARY.json) | Exact counts, case transitions, source provenance and bounded arithmetic index |

## Reproduce without models

Use a checkout containing both source commits and the freeze commits, Node `v22.10.0` on macOS arm64, and the exact cached dependencies described in `FREEZE-v0.2.json`. The normal workspace contracts/privacy builds must already exist. Their source trees are identical across the two compared commits; the evaluator verifies their built bytes and every imported dependency. It does not install packages, rebuild source packages or download dependencies.

From the repository root, choose a new output filename:

```sh
node evals/public-repair-proof/run-v0.2.mjs --output /tmp/better-loop-repair-reproduction.json
```

The runner refuses existing output files, uncommitted/changed frozen files, changed dependencies and runtime mismatches before calling a validator. It extracts only the exact public evidence source into separate temporary directories, compiles offline and runs the fixed checks. Each arm is bounded to 50 seconds; the recorded execution also had an outer 120-second timeout. Results retain failures and do not overwrite earlier attempts.

The original `run.mjs` remains frozen for provenance; use the amended evaluator for reproduction. Another runtime or dependency build requires a separately recorded protocol amendment, not editing these frozen manifests. Reproduction can have different timestamps and temporary-build hashes; compare case IDs, decisions, preservation checks and source/input identities.

The 100 → 150 summary index is only `24 / 16 × 100` for this fixed pass count. It is not a general quality gain. The repair-only subset has a zero before baseline, so its relative percentage improvement is undefined. No time, token, cash or human-effort savings were measured.

No model, semantic review, approval or publication occurs here. Any local story/admission is a separate action with its own exact consent. The [existing model benchmark](../public-work-benchmark/RESULTS.md) and its neutral quality result remain unchanged.
