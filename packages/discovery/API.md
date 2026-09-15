# Integration API 0.2.0-draft.1

The existing authoritative types are [src/types.ts](src/types.ts). Shared practice adds [challenges.ts](src/challenges.ts), [learning.ts](src/learning.ts) and [signals.ts](src/signals.ts). Import all public types and functions from `@better-loop/discovery`.

```ts
matchRoleEvidence(criteria: RoleCriteria, records: readonly PublicEvidenceRecord[], context: DiscoveryContext): RoleEvidenceResult;
aggregateBenchmarkCohort(query: BenchmarkCohortQuery, records: readonly BenchmarkCohortRecord[], context: DiscoveryContext): BenchmarkCohortResult;
summarizeLocalMilestones(events: readonly LocalMilestoneEvent[]): MilestoneSummary;
summarizePublicMilestones(records: readonly PublicEvidenceRecord[], context: DiscoveryContext): MilestoneSummary;
judgeApprovalBindingOutput(output: unknown): ApprovalBindingJudgment;
listSharedChallenges(): readonly SharedChallenge[];
findRelatedLessons(query: SharedLearningQuery, records: readonly PublicEvidenceRecord[], context: DiscoveryContext): SharedLearningResult;
aggregateSharedProgress(query: SharedProgressQuery, records: readonly SharedSignalRecord[], context: DiscoveryContext): SharedProgressResult;
```

Shared `CapabilityEvidence` and `ContributionConsent` are imported from `@better-loop/evidence` and `ShareCandidate` from `@better-loop/contracts`. The current API is pure and does not fetch, persist, authenticate, review, upload or execute a task.

This release bundles evidence `0.1.0-draft.2`. API/schema/policy shapes are unchanged. Every observed candidate human indicator needs a matching `selected_human_message` action. Legitimate `user_attestation` remains distinguishable and accepts base `insufficient_evidence` or `not_observed` with a null rating; it is never upgraded to observed conversation evidence.

For server integrations, supply `context: { source: "current_server_snapshot", complete: true }` only after an authoritative current read. Rows contain `public_id`, `current`, `status`, `candidate`, `capability_evidence`, `consent` and `server_trust_tier`. Use `null` capsule/consent for legacy records. Discovery requires explicit candidate-discovery consent. Public summaries require current public-story consent; they summarize evidence without counts or ability badges.

Cohort rows additionally contain private `server_owner_id` and `benchmark_conditions_version`. The query pins taxonomy/difficulty/basis/constraints, framework/rubric, benchmark ID/version/protocol, metric/version/direction/provenance, paired conditions, comparison track and trust/basis. Deduplication keys are server operational values only. Neither owner IDs nor exact suppressed-cohort counts enter the result. Query matching is exact; descriptive results include neutral/negative normalized indices and use equal owner weight. The fixed threshold is twenty eligible distinct owners.

For local journey integration, map a reflection and a later checked follow-up to the same stable local `task_key` and `equivalence_key`, with increasing sequence numbers. Copies/revisions/unchanged inputs do not establish milestones. Keys never appear in the summary. A negative comparable follow-up still records useful learning; a quality failure remains visible.

Benchmark export: `PUBLIC_APPROVAL_BINDING_BENCHMARK`, plus `APPROVAL_BINDING_CASE_IDS`, `APPROVAL_BINDING_REASONS`, and `APPROVAL_BINDING_LIMITS`. The freeze commit is `0aab3f4` on `codex/m2-m6-skill`; the coordinator must bind actual runs to its full commit. Judge input is the JSON object or bounded JSON string specified by the frozen `BASELINE.md`.

For the app benchmark panel, `PUBLIC_APPROVAL_BINDING_RESULTS` exports the subsequently retained actual execution summary, including `status: "real_executions_retained"`, both arms' case/limit checks, tokens, list-cost estimates and host wall time, the source/freeze/judge versions, result-file hash and limitations. One actual pair met 12/12 cases and 3/3 limits in each arm; reported tokens increased 34,617 → 34,981, with no measured quality gain. Unknown human effort, cash billing and shared orchestration remain null. The benchmark preregistration's `frozen_before_execution` status remains historical; use the separate results export for execution status.

## Shared practice and evidence cards

`SharedChallenge` has immutable `id`, `version`, `problem_type`, `task_families`, `objectives`, `human_actions`, `quality_dimensions`, `title`, `prompt_starter`, `acceptance_check`, `next_attempt`, `limitations` and `validation` fields. Its version is `bl-shared-challenges-0.1`; validation is always `practice_prompt_not_validated_benchmark`. IDs are `bl-practice-<problem_type>-0.1` for the eight existing problem categories. The catalog and nested arrays are frozen. It contains no participant records or measured results.

The related-learning query has exactly four required controlled keys:

```ts
interface SharedLearningQuery {
  task_family: Task["task_family"];
  problem_type: Task["problem_type"];
  objective: Task["objective"];
  difficulty: Task["difficulty"];
}
```

`findRelatedLessons()` validates all input and requires a complete current server snapshot. Its eligibility is current published, work-derived, non-null capability evidence and effective `public_story` plus `community_learning` consent. Neither benchmark nor candidate-discovery consent is required or inferred. Family and difficulty can differ; problem and objective must match.

`SharedLearningResult` is `{version:"bl-shared-learning-0.1", state, lessons, limit:6, has_more, limitations}`. State is `available`, `no_eligible_records`, `current_snapshot_required` or `invalid_input`. Unavailable results have an empty `lessons` array and `has_more:false`. The bounded first page uses ascending public-ID order after filtering and deduplication; there are no caller-controlled paging or ranking fields. `has_more` indicates more eligible cards beyond that first page, not a population count. Never truncate the operational snapshot and label it complete to produce another page.

Each `SharedLearningCard` deliberately projects:

- `public_id`, admitted `title`, `lesson` and `limits`.
- Actual `task` family, problem, objective, difficulty/basis, constraints and task-contract version; exact reported arm `conditions`.
- `relevance` with `family:"same_family"|"cross_family"`, matched problem/objective, difficulty `"matched"|"different"|"unknown"|"not_requested"`, `comparability:"not_established"` and `challenge_participation:"not_established"`. Query difficulty `unknown` produces `not_requested`; unknown source difficulty/basis never becomes matched.
- Controlled `demonstrated_skills` as reported task tags. `human_attribution` preserves involvement, assessment basis and all 11 action slots. Each action has a nullable `{state,rating}` observation and a nullable original capsule attribution. Missing is null, attestation remains attestation, and autonomous work never gains human attribution.
- `quality:{checks,floor,critical_regression}`, with all seven dimensions and nullable original checks, preserving evaluator/basis. `outcome:{reported,evidence,change}` retains unknown, neutral and adverse results.
- `trust:{tier,reasons}` uses the server tier without upgrading locally reported claims.

No consent record, owner key, capsule benchmark, KPI array, source excerpt or unrelated narrative field is projected. Public IDs are source-story references, never owner identifiers. A story match is not a challenge result. Source text remains untrusted data and must be displayed as text.

## Shared descriptive progress

The operational input adds only an owner key, independent of the frozen benchmark protocol:

```ts
interface SharedSignalRecord extends PublicEvidenceRecord {
  server_owner_id: string; // authoritative private key: /^[A-Za-z0-9_-]{1,128}$/
}
type SharedProgressTask = Omit<Pick<Task,
  "task_family" | "problem_type" | "objective" | "difficulty" |
  "difficulty_basis" | "constraints" | "task_contract_version">,
  "difficulty" | "difficulty_basis"> & {
  difficulty: Exclude<Task["difficulty"], "unknown">;
  difficulty_basis: Exclude<Task["difficulty_basis"], "unknown">;
};
type KnownProgressCondition = {
  platform: Exclude<ShareCandidate["conditions"]["baseline"]["platform"], "unknown">;
  model_tier: Exclude<ShareCandidate["conditions"]["baseline"]["model_tier"], "unknown">;
};
interface SharedProgressQuery {
  version: "bl-shared-progress-query-0.1";
  framework_version: "better-loop-fluency-0.1";
  rubric_id: "bl-work-evidence-0.1";
  metric_definition_version: "bl-metrics-0.1";
  task: SharedProgressTask;
  conditions: { baseline: KnownProgressCondition; candidate: KnownProgressCondition };
  comparison: "controlled_paired" | "observational_followup";
  metric: ShareCandidate["kpis"][number]["metric"];
  direction: ShareCandidate["kpis"][number]["direction"];
  metric_provenance: ShareCandidate["kpis"][number]["provenance"];
  server_trust_tier: TrustTier;
  required_quality_dimensions: QualityDimension[];
  quality_evaluator: Exclude<CapabilityEvidence["quality_checks"][number]["evaluator"], "unknown">;
  quality_basis: Exclude<CapabilityEvidence["quality_checks"][number]["basis"], "unknown">;
}
```

Unknown keys/versions, unknown difficulty/basis/conditions, duplicate constraints/dimensions and an empty required-quality set fail validation. A `correctness` objective must include the `correctness` quality dimension. Other objectives use their prespecified appropriate quality checks; a matching dimension name alone never qualifies without a met result and matching evaluator/basis. Constraints and required-quality dimensions are treated as exact unique sets and returned sorted. Quality-rubric direction must be `higher_is_better`; all other metric directions are `lower_is_better`. Estimated API cost requires estimated provenance. The API accepts no raw-token band, arbitrary text grouping, owner filter, time slice, threshold, benchmark ID or ranking parameter.

`aggregateSharedProgress()` requires effective `public_story` plus `benchmark_aggregation` consent, current published work-derived evidence, a substantive `initial`/`followup` capsule and every query stratum to match. Measurement must be comparable, quality floor met and critical regression `none_observed`. Every required dimension must be present, met and match the selected evaluator/basis. An unrelated or unknown check cannot satisfy a required check. Exactly one matching rounded metric is required; missing measurements are excluded rather than filled with zero. Capsule validation is still mandatory for all supplied checks.

All eligible current values are averaged within each authoritative owner, then owners receive equal weight. Duplicate public records are collapsed. Conflicting current rows, including a different owner for the same public ID, invalidate the whole input; historical versions never override the current version. No best-result selection occurs. Neutral and adverse resource measurements with the required quality remain eligible.

The result shape is:

```ts
interface SharedProgressResult {
  version: "bl-shared-progress-0.1";
  state: "available" | "suppressed" | "current_snapshot_required" | "invalid_input";
  claim: "uncalibrated_descriptive_reported_progress";
  minimum_distinct_owners: 20;
  cohort: SharedProgressQuery | null;
  statistics: null | {
    distinct_owners_rounded_down_to_5: number;
    baseline_index: 100;
    mean_candidate_index: number;
    median_candidate_index: number;
    rounding: "nearest_5_index_points";
    aggregation: "equal_owner_weight_mean_of_current_eligible_records";
    metric: SharedProgressQuery["metric"];
    direction: SharedProgressQuery["direction"];
    quality_floor: "met";
    critical_regression: "none_observed";
    coverage: "not_aggregated";
  };
  limitations: string[];
}
```

Only 20 distinct owners **after every filter** permits available output. Every other state has `cohort:null` and `statistics:null`; it reveals no exact count, group hints or token bands. Rounded owner count is not a completion or ability score. Coverage remains unaggregated: matching required checks does not prove complete evidence or human judgment. Token comparisons mean “baseline 100; lower uses fewer tokens,” not absolute budgets or cash savings. Broad model tiers cannot establish exact-model/accounting equivalence.

The 20-owner gate and rounding are privacy heuristics, not an anonymity guarantee. Serve finite controlled presets, enforce query controls, refresh the authoritative bounded snapshot on every use, and discard previously derived data on purpose revocation, withdrawal, deletion or hold. Never expose the operational input or a general differencing-query surface. At most 1,000 bounded records are accepted; larger or incomplete snapshots must not be silently truncated.

These additions change no contribution wire schema, consent policy, existing milestone rule, benchmark registration or retained benchmark result. They perform no fetching, persistence, authentication, semantic review, model call, challenge execution or upload. Isolated fixture tests are software verification, never public community content or measured human improvement.
