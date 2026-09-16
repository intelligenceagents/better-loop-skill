# Local measurement engine

Engine `bl-measurement-0.1`, package `@better-loop/measurement@0.1.0-draft.1`.
This implements M4's pure calculations and local protocol helpers. The coordinator
owns actual model runs and their reports. This package makes no model/network
calls, executes no assessed input, scans no history, and uploads nothing.

The [assessment rules](../skills/better-loop/references/assessment.md) and
[research foundation](../skills/better-loop/references/foundation.md) govern the
meaning of results. The unchanged [evaluation schema](../schemas/evaluation-run.schema.json)
remains wire `0.1.0`. Registration/options/expanded reports are **local sidecars**,
not extra fields accepted by evaluation or public sharing schemas.

## Build and API

Use the existing workspace toolchain. Build contracts first in a clean checkout,
then run:

```sh
npm run build --workspace @better-loop/measurement
npm run typecheck --workspace @better-loop/measurement
npm test --workspace @better-loop/measurement
```

The package bundles ESM/CJS, declarations, dependency notices, and a CLI; it needs
no runtime dependency installation. The build verifies its structural evaluation
type snapshot against the reviewed contracts source. Root integration belongs to
the workspace coordinator.

Import `@better-loop/measurement`, or directly
`packages/measurement/dist/index.js` before workspace linking.
`measureEvaluation(draft, options?)` accepts the existing `EvaluationRun` with
`summary` omitted and returns:

```ts
{ valid: true, record: EvaluationRun, report: MeasurementReport }
{ valid: false, errors: [{ code: string, path: string }] }
```

The detached validated `record` contains a computed summary. The `report` retains
all pairs/statuses/deltas, every outcome count, observed means, uncertainty,
registration/comparability, telemetry, eligibility and limitations. Inputs are
never mutated. `analyzeEvaluation(record, options?)` validates a complete record
before recomputing; it rejects false percentages/unsupported submitted wins.
Use the draft path after changing measurements instead of carrying an old summary.

Every planned pair must appear exactly once. Failed/timed-out arms preserve
actual consumed work and a reason; no completed-task delta is calculated for
them. `not_run` requires a reason, null measurements/quality/timestamps, and
no telemetry events. Completed arms require a null failure reason. Missing
metrics stay null; count metrics must be nonnegative safe integers.
No failed/omitted pair is silently removed.

Without verified registered context, the engine returns descriptive deltas but
labels overall evidence insufficient. A bare `compatibility: "comparable"`
assertion does not establish numerical matching.

## Freeze before execution

Persist the exact registration separately before any task runs. Retain immutable
selected raw outputs, telemetry, fixture/prompt versions, evaluator expectations,
and all outcomes locally. Reruns need a new run ID/registration; do not overwrite
failed runs. The helpers neither write files nor obtain trusted timestamps.

```ts
import { freezeProtocol, planFromRecord } from "@better-loop/measurement";

const common = {
  task: draft.task,
  input_version: "public-fixture-v1",
  equivalence_group: "equivalent-reconciliation-v1", // or null
  acceptance_criteria_version: "exact-json-ground-truth-v1",
  evaluator_version: draft.protocol.evaluator_version,
  metric_definition_version: "bl-metrics-0.1",
  metric_unit: "count",
  resource_conditions: "same isolated tool access and resource conditions",
};
const registration = freezeProtocol(planFromRecord(draft), {
  registered_at: "2026-09-14T00:00:00Z", // illustrative; use actual freeze time
  baseline: { ...common, conditions: draft.conditions.baseline },
  candidate: { ...common, conditions: draft.conditions.candidate },
  allowed_condition_changes: ["skill_version"],
  quality_rule: {
    version: "exact-json-v1",
    dimensions: [
      { id: "exact_json", minimum: 0, maximum: 1, floor: 1, max_regression: 0 },
    ],
  },
  task_fingerprint: "stable-public-input-identity-or-content-digest",
  independent_pairs: false,
  trial_plan: [
    { pair_id: "pair-1", order: "baseline_first", seed: null, blind_assignment: "candidate_as_A" },
    { pair_id: "pair-2", order: "candidate_first", seed: null, blind_assignment: "baseline_as_A" },
    { pair_id: "pair-3", order: "baseline_first", seed: null, blind_assignment: "candidate_as_A" },
  ],
});
```

`planFromRecord` extracts only schema/framework/origin, run/task identity, task,
protocol and conditions. The trial plan must match exactly the planned pair IDs;
the three-pair example needs a three-pair plan. Unit is `count` for tokens/rework,
`seconds` for model duration/human effort, `USD` for estimated cost, or
`index`/`percent`/`proportion` for quality.

Date-times need a timezone. Registration must be **strictly before** every known
execution start. End cannot precede start; declared arm order must agree with
chronological start order. Recorded order/seed must match the frozen trial plan.
Missing executed-arm start time cannot establish preregistration.

The SHA-256 digest binds canonical plan/context/quality rule/input identity/trial
plan. Returned objects are detached and recursively frozen. Changed bytes, rule,
plan, seed, order, or late registration invalidate verification. The
`verifyRegistration(draft, registration)` helper gives fixed-code reasons.
A caller can fabricate records and dates: hashes do not establish authorship,
truthful execution, trusted external timing, or a server verification tier.

The existing benchmark-contract enum is unchanged. Actual execution on current
public/synthetic reconciliation tasks can use `synthetic-reconciliation-0.1`;
exact fixture/evaluator versions live in the registration.
`unregistered` is ineligible for benchmark gates.

## Comparable tasks and quality

`compareTasks(baselineContext, candidateContext, allowedConditionChanges?)`
separates taxonomy similarity from comparable/not-comparable/unknown.
It checks family, problem, objective, difficulty/basis, constraints, task and
benchmark versions, acceptance criteria, evaluator, units, measurement version,
resource conditions, input equivalence and host conditions.

Unknown difficulty cannot establish comparability. Different inputs require an
explicit equal `equivalence_group`; similarity does not infer equal difficulty.
That group is a reviewable assertion, not calibrated proof. Skill tags are
observed outputs; set ordering does not change constraints/tool access.

Allowed changing conditions are platform, model_version, effort, skill_version
and tool_access. Declare only the intended intervention. A model-change
experiment must explicitly allow model_version while holding the other relevant
conditions fixed. No job title, employer, identity or person score enters matching.

`evaluateQuality(rule, {baseline, candidate})` checks prespecified named
higher-is-better dimensions. Scores must be within ranges and have exactly the
registered IDs. Example measurement option:

```ts
const quality = {
  "pair-1": { baseline: { exact_json: 1 }, candidate: { exact_json: 1 } },
  "pair-2": { baseline: { exact_json: 0 }, candidate: { exact_json: 1 } },
  "pair-3": { baseline: { exact_json: 1 }, candidate: { exact_json: 0 } },
};
```

The map covers every pair. Floor flags on both arms and candidate critical
regression must agree with computed quality. `max_regression` is the maximum
permitted baseline-to-candidate drop; null declares a dimension non-critical.
Passing the floor can coexist with a critical regression. Unknown scores remain
null, while known failures are not hidden by another missing dimension.

The engine does not independently grade semantic correctness or evaluator
competence. Supply actual results of the frozen evaluator; do not weaken the
rubric after seeing outputs. Quality sidecars require verified registration.

## Telemetry and overhead

`accountTelemetry(ledger)` accepts:

```ts
const ledger = {
  coverage: {
    parent: "complete", worker: "not_applicable", judge: "not_applicable",
    retry: "not_applicable", orchestration: "not_applicable",
  },
  entries: [{
    id: "unique-session-and-usage-event", role: "parent",
    input_token_semantics: "includes_cache",
    input_tokens: null, output_tokens: null,
    cache_read_tokens: null, cache_write_tokens: null,
    model_duration_seconds: null, human_effort_seconds: null,
    actual_billing_usd: null, estimated_api_cost_usd: null,
  }],
};
// options.telemetry = { "pair-1": { baseline: ledger1, candidate: ledger2 }, ... }
```

Replace null only with actual supplied telemetry. Roles are parent, worker,
judge, retry and orchestration. Coverage is complete/missing/not_applicable.
Complete roles need entries; not-applicable roles must have none. Missing roles
block complete totals. A known subtotal is separately labeled and never used
as a complete total; it sums fully known entry totals for that quantity.

Entries are **disjoint** usage events. IDs are unique across all arms/shared
work; namespace counters that restart per session. Never add cumulative parent
totals to included worker events. Duplicate IDs and obvious contradictions
reject, but the engine cannot detect overlapping usage disguised by different IDs.

`includes_cache` counts input plus output; cache counts are already included.
Unknown cache breakdown can remain null with a known inclusive input total.
`excludes_cache` requires and adds input/output/cache-read/cache-write values.
Unknown inclusion semantics makes total tokens null. Characters never become
measured tokens.

Per-arm ledger totals must exactly match record model_tokens/model_duration/
human_effort/estimated_api_cost; incomplete totals require null. Rework and quality
come from evaluators. All planned pairs need ledgers if this option is supplied.
For `not_run`, use no entries and every role not_applicable.

Model duration is additive model work, **not wall-clock task latency**.
Parallel model time can exceed elapsed time. Human effort is active measured
work, not time away from a device. Cost estimates use caller-supplied recorded
pricing; no model prices are hard-coded. Actual billing is separate. Fewer tokens
do not prove subscription cash savings.

Optional `options.shared_telemetry` accounts for truly shared protocol-wide work
that cannot be truthfully attributed to an arm. Its totals are reported separately
and included in budgets; no guessed split is made. Resource-improvement eligibility
then remains false because pair deltas exclude shared work. This does not erase
actual benchmark execution.

Budgets include failed work and shared overhead. Duration budget checks use
supplied additive model duration. The parent separately enforces wall-clock
deadlines; this pure library cannot interrupt model calls. Unknown required
budget usage remains unknown.

## Arithmetic, outcomes and uncertainty

`measurePair(baseline, candidate, direction, unit?)` returns:

- Absolute change: candidate minus baseline in the original unit.
- Favorable absolute change: positive means favorable in the stated direction.
- Relative percent change: positive means favorable; lower-is-better uses
  `100 × (baseline − candidate) / baseline`.
- Percentage-point change: candidate minus baseline for a percent unit, or
  100 times that difference for a proportion unit.
- Baseline index 100 and candidate index rounded to the nearest five points.

Baseline zero supports an absolute difference but no relative/index KPI.
Missing/overflow results are null, never Infinity or guessed zero.
The stricter wire contract rejects an unrepresentable relative value.
Percent, percentage-point and index changes are different. Small real changes
can round back to index 100; do not claim an improvement from that rounded KPI.
Percent claims derived from rounded indices must be labeled approximate.

Outcomes are improved/no_change/regressed/mixed/insufficient_evidence.
Incomplete pairs or unknown quality cannot pass. Favorable resource use with
a quality failure is mixed. Favorable and adverse pairs together remain mixed
even if their mean is favorable. Neutral/adverse runs are retained honestly.
Observed means do not replace missing pairs with zero or claim an all-pair mean
when evidence is incomplete.

`pairedUncertainty(changes, independentPairs?)` reports an observed median/range
and an optional exact two-sided 95% **median** interval. For sorted observations
`x[0..n−1]`, it chooses the narrowest supported `[x[k], x[n−k−1]]` with coverage
`1 − 2 × P(Binomial(n, 0.5) ≤ k) ≥ 0.95`. Small-sample exact probabilities are tested.

This assumes independent pairs sampled from one stable distribution. Caller
assertion is not statistical validation; repeated task/model dependence can
invalidate the interval. Missing pairs remain excluded from numerical intervals
and can introduce selection bias. Ties can make coverage conservative.
The interval is for a population median paired change, not a mean, person score,
or causal effect.

Fewer than six observed pairs cannot give a finite two-sided 95% median interval:
six have min/max coverage 31/32; five only have 15/16. Three- and five-pair results
therefore return a null interval with a reason. Five is a product gate, not
established statistical sufficiency. Range is descriptive; standard deviation
is never mislabeled as a confidence interval.

## Actual benchmark evidence and milestones

| Record origin | Meaning |
|---|---|
| `synthetic` | Invented fixture measurements; never actual benchmark evidence. |
| `public_benchmark` | Genuinely executed model trials on approved public/synthetic task inputs, with preserved local outputs, telemetry and protocol. |
| `private_work` | Selected user-authorized local work; never a public benchmark/upload record. |

The origin is a caller claim, not proof. `report.execution_claim` separately
preserves invented_fixture/reported_host_execution/reported_private_work/
no_execution_reported. A false eligibility gate never means real execution
did not occur.

`actual_benchmark_evidence` can be true for a registered and accounted real
public/synthetic-task pilot with fewer than five pairs or a neutral/adverse
outcome. It signals benchmark protocol evidence, not efficacy or sufficient
power. Missing integrity/comparability/telemetry can still make this gate false
while the reported execution remains explicit.

`preliminary_measured_improvement` additionally needs at least five complete
pairs, favorable non-mixed outcome, quality evidence, compatible frozen context,
actual overhead accounting and known budget compliance. Invented synthetic
measurements are excluded. An actual two-task/three-pair pilot with higher
candidate tokens in every pair remains **regressed**, with no reduction claim
or preliminary/repeated improvement.

`repeatedImprovement([{record, options}, ...])` recomputes every record. It needs
at least three distinct comparable eligible task instances, each with five pairs.
Reruns of one task count once; any adverse/ineligible rerun disqualifies that
task instead of selecting its earlier best outcome. Duplicate run IDs and
copied input fingerprints cannot become new tasks. Different evaluators,
conditions, interventions, or observational/controlled tracks are not pooled.
The returned exclusions retain each run ID and its reasons.

This is a **task** milestone. The engine never establishes human attribution or
population sampling: `human_achievement_evidence` and
`population_cohort_evidence` are always false, including for genuinely executed
synthetic tasks. Neither fixture numbers nor model benchmark activity enter
human achievements, public person ranks, cohort counts or population claims.
Behavior assessment remains separate; the engine awards no fluency score or badge.

## Expectations and blinded comparison

`gradeExpectations(output, expectations)` supports literal text inclusion/
exclusion and strict JSON equality at a JSON Pointer. Missing output is unknown;
malformed/duplicate JSON fails JSON expectations. It evaluates no regex, code,
shell, or instructions embedded in output. The caller freezes the expectation
set before observing results. It is a deterministic checker, not an independent
semantic judge.

`counterbalancedAssignments(pairIds, seed)` supplies reproducible balanced A/B
labels. Persist the result before execution. `blindComparison(baseline, candidate,
assignment)` returns a label-only judge packet and a separate private mapping.
Send only the packet to the judge. `resolveBlindVerdict` maps A/B/tie/inconclusive
back afterward. Outputs themselves can reveal conditions; this helper does not
guarantee effective blinding. Counterbalance execution order separately in the
registered trial plan.

These helpers independently implement the baseline/expectation/blind-comparison
structure described in the foundation. No upstream skill-creator code, prompts
or assets are copied or vendored, so no reused upstream commit/license applies.
Bundled library licenses are included. Reusing upstream material later requires
an explicit pinned version and notices; do not silently substitute its missing
values or character-token fallbacks.

## CLI and verification limits

```sh
node packages/measurement/dist/cli.js measure draft.json options.json
node packages/measurement/dist/cli.js analyze record.json options.json
node packages/measurement/dist/cli.js freeze plan-and-evidence.json
node packages/measurement/dist/cli.js telemetry ledger.json
node packages/measurement/dist/cli.js milestone records-and-options.json
```

`-` reads stdin. Freeze input is exactly `{plan,evidence}`; milestone input is
an array of `{record,options?}`. Errors use fixed codes and omit submitted bytes,
arbitrary field names and file paths. Exit 0 means a valid calculation, including
adverse/ineligible outcomes; 1 means invalid input; 2 means CLI usage error.
The CLI prints complete **local** records; its output must never be submitted to
the public service as a share candidate.

Tests use only [invented synthetic fixtures](../evals/measurement/README.md).
They cover all-outcome arithmetic, null/zero/overflow, quality failures,
tampering, telemetry/cache overhead, explicit omission, duplicated tasks,
all seven families, separate tracks, exact uncertainty, malicious input data,
CLI parsing and an offline packed ESM/CJS/type consumer.
These tests establish engine behavior, not actual host efficacy or calibration.
The coordinator's separately preserved real experiment report supplies actual
execution evidence and must retain neutral/adverse findings.
