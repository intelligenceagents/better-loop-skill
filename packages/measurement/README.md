# Better Loop measurement

Draft package `@better-loop/measurement@0.1.0-draft.1`, engine `bl-measurement-0.1`.
Pure local TypeScript; bundled ESM/CommonJS and a local JSON CLI. No model calls,
network operations, filesystem scanning, uploads, or execution of assessed inputs.
The CLI reads only explicitly named files or stdin.

```ts
import {
  measurePair, accountTelemetry, measureEvaluation,
  freezeProtocol, planFromRecord,
} from "@better-loop/measurement";

measurePair(200, 150, "lower_is_better");
// absolute_change: -50; relative_change_percent: 25; candidate_index: 75

// draft = EvaluationRun v0.1.0, with summary omitted.
// Register exact plan/evidence BEFORE running tasks.
const registration = freezeProtocol(planFromRecord(draft), evidence);
const result = measureEvaluation(draft, { registration, quality, telemetry });
// {valid:true, record, report} or {valid:false, errors:[{code,path}]}
```

Complete types are exported. The source workspace's `docs/measurement.md`
documents registration, telemetry, quality, and milestone inputs.
`analyzeEvaluation(record, options)` validates an existing complete record before
recomputing the summary. Without registered context, `measureEvaluation(draft)`
still returns descriptive deltas but cannot establish comparability or a milestone.

```sh
better-loop-measure measure draft.json options.json
better-loop-measure analyze local-record.json options.json
better-loop-measure freeze plan-and-evidence.json
better-loop-measure telemetry selected-usage-ledger.json
better-loop-measure milestone selected-local-records.json
```

The CLI prints complete **local** records, which can contain private task
references. Its output is not a public upload payload. Errors contain fixed
codes, not input bytes or arbitrary field names. Exit codes: `0` valid calculation
(including neutral, adverse, or ineligible results), `1` invalid input, `2` usage.

Keep every planned pair, including failures/timeouts/omissions with reasons.
Missing metrics remain null; output characters never become tokens. Declare cache
inclusion and parent/worker/judge/retry/orchestration coverage. A known subtotal
is not a complete total. Keep actual billing, estimates, model duration, and
human effort separate.

`content_origin: "synthetic"` means invented fixture measurements, which are
ineligible as actual benchmark evidence. Genuinely executed approved
public/synthetic task runs use `"public_benchmark"` and preserve raw outputs,
actual telemetry, and the frozen protocol locally. Three-pair pilots and
neutral/adverse outcomes can still be actual benchmark protocol evidence.
Three pairs are below the five-pair preliminary gate; two tasks are below the
three-distinct-task repeated gate.

This task engine never establishes human achievement, population sampling,
domain calibration, or universal ranking. `human_achievement_evidence` and
`population_cohort_evidence` are always false. Registration hashes detect changed
bytes, not authorship, independent timestamps, or truthful measurements.
Eligibility is a local calculation, not a server trust tier.

Independently authored implementation. No upstream skill-creator code is vendored.
MIT; bundled dependency notices are included.
