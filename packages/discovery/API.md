# Integration API 0.1.0-draft.2

The authoritative types are [src/types.ts](src/types.ts). Import all public types and functions from `@better-loop/discovery`.

```ts
matchRoleEvidence(criteria: RoleCriteria, records: readonly PublicEvidenceRecord[], context: DiscoveryContext): RoleEvidenceResult;
aggregateBenchmarkCohort(query: BenchmarkCohortQuery, records: readonly BenchmarkCohortRecord[], context: DiscoveryContext): BenchmarkCohortResult;
summarizeLocalMilestones(events: readonly LocalMilestoneEvent[]): MilestoneSummary;
summarizePublicMilestones(records: readonly PublicEvidenceRecord[], context: DiscoveryContext): MilestoneSummary;
judgeApprovalBindingOutput(output: unknown): ApprovalBindingJudgment;
```

Shared `CapabilityEvidence` and `ContributionConsent` are imported from `@better-loop/evidence` and `ShareCandidate` from `@better-loop/contracts`. The current API is pure and does not fetch, persist, authenticate, review, upload or execute a task.

This release bundles evidence `0.1.0-draft.2`. API/schema/policy shapes are unchanged. Every observed candidate human indicator needs a matching `selected_human_message` action. Legitimate `user_attestation` remains distinguishable and accepts base `insufficient_evidence` or `not_observed` with a null rating; it is never upgraded to observed conversation evidence.

For server integrations, supply `context: { source: "current_server_snapshot", complete: true }` only after an authoritative current read. Rows contain `public_id`, `current`, `status`, `candidate`, `capability_evidence`, `consent` and `server_trust_tier`. Use `null` capsule/consent for legacy records. Discovery requires explicit candidate-discovery consent. Public summaries require current public-story consent; they summarize evidence without counts or ability badges.

Cohort rows additionally contain private `server_owner_id` and `benchmark_conditions_version`. The query pins taxonomy/difficulty/basis/constraints, framework/rubric, benchmark ID/version/protocol, metric/version/direction/provenance, paired conditions, comparison track and trust/basis. Deduplication keys are server operational values only. Neither owner IDs nor exact suppressed-cohort counts enter the result. Query matching is exact; descriptive results include neutral/negative normalized indices and use equal owner weight. The fixed threshold is twenty eligible distinct owners.

For local journey integration, map a reflection and a later checked follow-up to the same stable local `task_key` and `equivalence_key`, with increasing sequence numbers. Copies/revisions/unchanged inputs do not establish milestones. Keys never appear in the summary. A negative comparable follow-up still records useful learning; a quality failure remains visible.

Benchmark export: `PUBLIC_APPROVAL_BINDING_BENCHMARK`, plus `APPROVAL_BINDING_CASE_IDS`, `APPROVAL_BINDING_REASONS`, and `APPROVAL_BINDING_LIMITS`. The freeze commit is `0aab3f4` on `codex/m2-m6-skill`; the coordinator must bind actual runs to its full commit. Judge input is the JSON object or bounded JSON string specified by the frozen `BASELINE.md`.

For the app benchmark panel, `PUBLIC_APPROVAL_BINDING_RESULTS` exports the subsequently retained actual execution summary, including `status: "real_executions_retained"`, both arms' case/limit checks, tokens, list-cost estimates and host wall time, the source/freeze/judge versions, result-file hash and limitations. One actual pair met 12/12 cases and 3/3 limits in each arm; reported tokens increased 34,617 → 34,981, with no measured quality gain. Unknown human effort, cash billing and shared orchestration remain null. The benchmark preregistration's `frozen_before_execution` status remains historical; use the separate results export for execution status.
