# Assessment and repeated improvement

## What the assessment measures

Assess observed collaboration behaviors, task outcomes, and environment/skill configuration separately. The agent doing a good job does not automatically demonstrate that the person made the choices responsible for it. Skills are demonstrated under particular conditions; do not present this as a measure of general intelligence, personality, unaided ability, or fitness for employment.

Each observation has an evidence reference, actor (`human`, `agent`, `tool`, `reviewer`, or `unknown`), observed behavior, coverage, and a limited conclusion. Private references may point to selected local evidence; they never appear in public candidates.

Use the Anthropic 4D framework and 11 conversation-visible indicators as the behavioral foundation. Read [foundation.md](foundation.md) for the versioned mapping and source limits. Better Loop adds task quality, resource efficiency, static configuration quality, creative application, and learning transfer as separate measures. They are not components of Anthropic's published Index. A single task usually cannot establish learning transfer. Missing evidence is null/missing, not poor performance.

For descriptive behavior ratings, use `partial` (an attempt with an observable gap), `effective` (appropriate behavior demonstrated for this task), and `adaptive` (the person adjusts appropriately to new evidence or constraints). These are ordinal observations, not calibrated scores. Attach evidence quality separately. Do not put “verified” at the top of a performance scale: a verified result can be poor.

## Comparable-task contract

First label each relevant indicator `observed`, `not_observed`, `not_applicable`, or `insufficient_evidence`. Rate only an observed behavior with sufficient evidence; otherwise use null. These states and ordinal ratings are Better Loop extensions to the source's binary classification. A short successful task may need no iteration. Absence in selected material does not demonstrate inability. External checks may provide additional evidence but must not silently become conversation-visible behavior.

Classify the task independently of the person's job title. A financial analyst and a scientist may both be reconciling data. A developer and a teacher may both be designing a clear explanation.

Every candidate records a versioned task taxonomy:

| Field | Meaning |
|---|---|
| task_family | Broad work family, including `general` |
| problem_type | The underlying problem: diagnosing an error, reconciling data, synthesizing evidence, quantitative reasoning, creating content, coordinating a plan, extracting information, or improving a process |
| objective | Correctness, less rework, lower resource use, clearer communication, useful alternatives, or reproducibility |
| difficulty + basis | Routine/moderate/complex/unknown, with self-estimated or rubric-estimated provenance |
| constraints | Bounded categories such as source requirements or a time budget; no original internal requirements |
| demonstrated_skills | Controlled, evidence-grounded skill tags; never inferred personality traits |
| platform + model tier | Conditions relevant to resource/performance comparisons, without private account data |
| task_contract_version + rubric_version | Exact measurement/taxonomy context |

This supports **similarity discovery**, not automatic numerical comparability. Computing an improvement additionally requires a stable objective, task difficulty, acceptance criteria, measurement definition, units, resources, and evaluator. Exact input/evaluator/model versions and trial metadata stay in local benchmark records. A public privacy-filtered story loses detail, so public comparisons must state that limitation.

## Domain evidence

- Software: relevant executable checks, reproduced failures, and independent behavior review. Passing unrelated or newly weakened tests is not a gain.
- Analysis/finance: reconciled totals, source/assumption traceability, units, reproducible calculations, and sensitivity checks. Do not publicize actual business figures.
- Mathematics/science: valid derivation or proof, explicit assumptions, counterexamples, and reproducibility. A confident explanation is not a correctness check.
- Research/strategy: correct attribution, evidence/inference separation, competing explanations, and decision usefulness.
- Writing/design: audience/brief satisfaction, accuracy, meaningful originality, and a stable blinded review rubric.
- Operations/education/general: task-specific acceptance criteria, exceptions, actionable output, and an appropriate independent assessment where available.

If the evaluator lacks domain competence, provide process coaching and mark outcome quality unknown. Keep uncalibrated domains available for learning without emitting unsupported public ranks.

## Measuring an intervention

An intervention might clarify a prompt, reduce irrelevant context, change a skill trigger, add a verification step, use a bounded subagent, or select another model. Define the primary outcome and quality floor before evaluating. Change one factor where practical; otherwise describe the intervention as a bundle.

Two evidence tracks must remain distinct:

1. **Controlled task evaluation:** run baseline and candidate on equivalent isolated tasks with a fixed evaluator and resource conditions. Randomize/counterbalance order, reset state, and retain every trial. Do not rerun tasks with external side effects. Use held-out examples to avoid tuning to the test.
2. **Real-world follow-up:** observe later tasks selected by the person. State task differences, missing follow-up, and selection effects. Improvements are observational; do not claim causation.

Planning defaults for a controlled evaluation: at least five paired trials per task for a preliminary result, then three distinct comparable task instances for a “repeated measured improvement” milestone. These are product gates, not statistically established sufficiency. Confidence intervals may still be wide, and domain validation may require much more data.

For each pair, record baseline/candidate metrics, units, model/version, effort, skills/rubric/evaluator versions, tool access, timestamps locally, trial order, random seed when available, and quality checks. If any comparable run is omitted, record why. A lower-cost model experiment changes model identity by design; its protocol must hold the other conditions fixed and declare that intervention.

Compute paired changes, aggregate over pairs rather than choosing the best result, and report uncertainty. For a lower-is-better metric with positive baseline:

`reduction_percent = 100 * (baseline - candidate) / baseline`

For higher-is-better measures report the explicit direction. A percentage-point change in a success rate is not the same as a percent change. Baseline zero makes relative change undefined; report a local absolute difference or no public relative KPI. Missing values remain null and cannot pass improvement eligibility.

Public export can use a normalized index with baseline 100 and a rounded candidate index. This discloses relative performance, not confidential absolute volumes or financial figures. Round to five index points and label that rounding. Do not infer public raw values from the index. Percent claims derived from an index must be marked approximate.

Examples of permitted metric families: task completion time, total model tokens, total estimated API cost, substantive rework cycles, and a named quality-rubric index. No actual revenue, profit, customer count, customer outcomes, internal forecast, compensation, or company operational KPI is exported.

“Improved” requires the prespecified quality floor, no material critical-dimension regression, comparable evidence, and favorable primary metric. Report mixed, unchanged, regressed, and insufficient-evidence outcomes honestly. Passing a floor does not guarantee the entire change is an improvement.

Count evaluator work, subagents, retries, cache tokens, and orchestration overhead where available. Separate actual billing, API-list-price estimate, model duration, and human effort. Do not claim subscription cash savings from lower token counts. Do not count time away from a laptop as working time.

## Repeated improvement and open-source evidence

Use the public `anthropics/skills` skill-creator workflow as the implementation reference: skill/no-skill or new/old baselines, explicit expectations, qualitative review, blinded output comparison, and versioned repeated runs. [foundation.md](foundation.md) records the sources, modifications, and calibration plan. This method is not proof that Better Loop improves every task or validly measures talent.

Version the skill, task fixtures, evaluators, model configuration, and metric definitions. Keep historical benchmark results as immutable records; reruns produce new versions. Never overwrite a failed benchmark with a successful rerun under the same identity.

For a public open-source benchmark release, use only public/synthetic tasks. Include all tested tasks, complete run results, seeds/order where possible, confidence/limitations, and regression explanations. A hosted model may not be bit-for-bit reproducible: document access date/configuration rather than promising determinism.

Report separate claims: a skill version improves a benchmark, a person demonstrates a behavior, a person improves on later comparable work, and a community intervention is associated with better outcomes. One does not prove the others.

## Community learning and consented evidence discovery

Recommend lessons from opted-in public stories matching task/problem/objective. Show the source, conditions, and failure cases. Start with retrieval and versioned generic suggestions, not automatic model training. Apply a lesson locally, observe results, and attach a new comparable story only with fresh consent.

Public evidence tiers are server-derived: `self_reported`, `locally_recorded`, and later `independently_verified`. Client instrumentation remains under the author's control. Hashes/signatures support integrity but do not prove authorship or truth. Keep tiers separate in comparisons; email verification changes none of them.

For candidate evidence discovery, controlled criteria declare required task/problem families, skills, complexity and evidence needs. Retrieve only current public stories with explicit per-contribution `candidate_discovery` consent; legacy publication is not consent. Show supporting evidence, human-action provenance, quality checks, conditions, gaps and uncertainty separately. No generic person rank, unexplained fit percentile, employment decision or prediction of job success is established.
