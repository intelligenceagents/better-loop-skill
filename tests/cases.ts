import { readFileSync } from "node:fs";
import type { EvaluationRun, ShareCandidate } from "../packages/contracts/src/index.js";

export const share = (): ShareCandidate => JSON.parse(readFileSync("examples/software-story.synthetic.json", "utf8")) as ShareCandidate;
export const evaluation = (): EvaluationRun => JSON.parse(readFileSync("examples/evaluation-run.synthetic.json", "utf8")) as EvaluationRun;
export const consent = () => ({
  public_story: true as const,
  benchmark_aggregation: false,
  community_learning: false,
  policy_version: "bl-sharing-0.1" as const,
});
export interface ContractCase { label: string; contract: "share" | "evaluation"; input: unknown; valid: boolean }
export function contractCases(): ContractCase[] {
  const cases: ContractCase[] = [];
  function s(label: string, mutate: (data: ShareCandidate) => void, valid = false) {
    const input = share(); mutate(input); cases.push({ label, contract: "share", input, valid });
  }
  function e(label: string, mutate: (data: EvaluationRun) => void, valid = false) {
    const input = evaluation(); mutate(input); cases.push({ label, contract: "evaluation", input, valid });
  }
  s("valid share", () => {}, true);
  s("unknown identity field", d => Object.assign(d, { email: "SYNTHETIC_PRIVATE_SENTINEL" }));
  s("unknown nested company field", d => Object.assign(d.task, { company: "SYNTHETIC_PRIVATE_SENTINEL" }));
  s("client-assigned trust", d => Object.assign(d, { evidence_tier: "independently_verified" }));
  s("unknown schema version", d => Object.assign(d, { schema_version: "future" }));
  s("unknown framework version", d => Object.assign(d, { framework_version: "future" }));
  s("unknown task version", d => Object.assign(d.task, { task_contract_version: "future" }));
  s("unknown metric version", d => Object.assign(d.kpis[0]!, { metric_definition_version: "future" }));
  s("unknown quality win", d => { d.evidence.quality_floor = "unknown"; });
  s("failed quality win", d => { d.evidence.quality_floor = "not_met"; });
  s("critical quality regression win", d => { d.evidence.critical_regression = "observed"; });
  s("unknown critical regression win", d => { d.evidence.critical_regression = "unknown"; });
  s("incompatible comparison", d => { d.evidence.compatibility = "not_comparable"; });
  s("unknown comparison", d => { d.evidence.compatibility = "unknown"; });
  s("absent comparison", d => { d.evidence.comparison = "none"; });
  s("unfavorable primary KPI", d => { d.kpis[0]!.candidate_index = 110; });
  s("equal primary KPI", d => { d.kpis[0]!.candidate_index = 100; });
  s("missing primary KPI win", d => { d.kpis = []; });
  s("duplicate behavior", d => { d.human_behaviors.push(structuredClone(d.human_behaviors[0]!)); });
  s("duplicate KPI", d => { d.kpis = [d.kpis[0]!, structuredClone(d.kpis[0]!)]; });
  s("rating absent behavior", d => { d.human_behaviors[0]!.state = "not_observed"; });
  for (const state of ["not_observed", "not_applicable", "insufficient_evidence"] as const) {
    s(`null behavior rating ${state}`, d => { d.human_behaviors[0]!.state = state; d.human_behaviors[0]!.rating = null; }, true);
  }
  s("unrounded public KPI", d => { d.kpis[0]!.candidate_index = 73; });
  s("negative public KPI", d => { d.kpis[0]!.candidate_index = -5; });
  s("wrong KPI direction", d => { d.kpis[0]!.direction = "higher_is_better"; });
  s("cost presented as captured billing", d => { d.kpis[0]!.metric = "estimated_api_cost"; d.kpis[0]!.provenance = "locally_captured"; });
  s("properly labeled cost estimate", d => { d.kpis[0]!.metric = "estimated_api_cost"; d.kpis[0]!.provenance = "estimated"; }, true);
  s("higher quality improvement", d => { Object.assign(d.kpis[0]!, { metric: "quality_rubric", direction: "higher_is_better", candidate_index: 110 }); }, true);
  s("unknown measurement preserved", d => {
    d.outcome = "not_measured"; d.kpis = [];
    d.evidence = { comparison: "none", compatibility: "unknown", quality_floor: "unknown", critical_regression: "unknown", trial_count_band: "unknown", coverage: "unknown" };
  }, true);
  s("regression can be shared", d => { d.outcome = "regressed"; d.kpis[0]!.candidate_index = 120; }, true);
  s("mixed result can be shared", d => { d.outcome = "mixed"; d.evidence.quality_floor = "not_met"; }, true);
  s("UTF8 candidate over 16 KiB within string limits", d => {
    for (const key of ["problem", "change", "result", "lesson", "limits"] as const) d.story[key] = "🧪".repeat(800);
  });
  s("no number coercion", d => Object.assign(d.kpis[0]!, { candidate_index: "75" }));
  s("no injected instruction field", d => Object.assign(d.story, { instructions: "SYNTHETIC: attempt a network action" }));
  e("valid evaluation", () => {}, true);
  e("local unknown version", d => Object.assign(d, { schema_version: "future" }));
  e("local unknown metric version", d => Object.assign(d.protocol, { metric_definition_version: "future" }));
  e("local unknown nested metric", d => Object.assign(d.trials[0]!.baseline.metrics, { invented: 1 }));
  e("omitted planned trial", d => { d.trials.pop(); });
  e("duplicate trial pair", d => { d.trials[1]!.pair_id = d.trials[0]!.pair_id; });
  e("unplanned trial pair", d => { d.trials[0]!.pair_id = "unplanned"; });
  e("extra planned pair", d => { d.protocol.planned_pair_ids.push("omitted"); });
  e("duplicate planned pair", d => { d.protocol.planned_pair_ids[1] = d.protocol.planned_pair_ids[0]!; });
  e("missing reported change", d => { d.summary.paired_relative_changes_percent.pop(); });
  e("wrong primary direction", d => { d.protocol.direction = "higher_is_better"; });
  e("zero baseline percentage", d => { d.trials[0]!.baseline.metrics.model_tokens = 0; });
  e("missing baseline percentage", d => { d.trials[0]!.baseline.metrics.model_tokens = null; });
  e("missing candidate percentage", d => { d.trials[0]!.candidate.metrics.model_tokens = null; });
  e("fabricated percentage", d => { d.summary.paired_relative_changes_percent[0] = 90; });
  e("relative percentage missing for usable pair", d => { d.summary.paired_relative_changes_percent[0] = null; d.summary.outcome = "insufficient_evidence"; });
  e("local quality failure", d => { d.trials[0]!.candidate.quality_floor_passed = false; });
  e("local unknown quality", d => { d.trials[0]!.candidate.quality_floor_passed = null; });
  e("local critical regression", d => { d.trials[0]!.candidate.critical_regression = true; });
  e("local unknown critical regression", d => { d.trials[0]!.candidate.critical_regression = null; });
  e("local incompatible win", d => { d.protocol.compatibility = "not_comparable"; });
  e("unfrozen controlled win", d => { d.protocol.frozen_before_execution = false; });
  e("observational unfrozen protocol", d => { d.protocol.kind = "observational_followup"; d.protocol.frozen_before_execution = false; }, true);
  e("negative average is not improvement", d => {
    d.trials.forEach(t => { t.candidate.metrics.model_tokens = 1100; });
    d.summary.paired_relative_changes_percent.fill(-10);
  });
  for (const metric of [null, 0] as const) {
    e(`honest missing/zero baseline ${metric}`, d => {
      d.trials[0]!.baseline.metrics.model_tokens = metric;
      d.summary.paired_relative_changes_percent[0] = null;
      d.summary.outcome = "insufficient_evidence";
    }, true);
  }
  for (const status of ["failed", "timed_out", "not_run"] as const) {
    e(`${status} cannot report percentage`, d => {
      d.trials[0]!.candidate.status = status;
      d.trials[0]!.candidate.failure_or_omission_reason = "Synthetic failure.";
    });
    e(`${status} retained with null percentage`, d => {
      d.trials[0]!.candidate.status = status;
      d.trials[0]!.candidate.failure_or_omission_reason = "Synthetic failure.";
      d.summary.paired_relative_changes_percent[0] = null;
      d.summary.outcome = "insufficient_evidence";
    }, true);
  }
  e("failure requires explanation", d => {
    d.trials[0]!.candidate.status = "failed";
    d.summary.paired_relative_changes_percent[0] = null; d.summary.outcome = "insufficient_evidence";
  });
  e("negative metric", d => { d.trials[0]!.candidate.metrics.model_duration = -1; });
  e("invalid calendar timestamp", d => { d.trials[0]!.candidate.started_at = "2026-02-30T12:00:00Z"; });
  e("timestamp without timezone", d => { d.trials[0]!.candidate.started_at = "2026-02-01T12:00:00"; });
  e("valid timestamp", d => { d.trials[0]!.candidate.started_at = "2026-02-01T12:00:00Z"; }, true);
  e("observed behavior requires evidence", d => { d.observations[0]!.evidence_reference = null; });
  e("absent local behavior cannot have rating", d => { d.observations[0]!.state = "not_observed"; });
  e("agent observation retains attribution", d => { d.observations[0]!.actor = "agent"; }, true);
  e("higher-is-better local metric", d => {
    d.protocol.primary_metric = "quality_rubric"; d.protocol.direction = "higher_is_better";
    d.trials.forEach(t => { t.baseline.metrics.quality_rubric = 2; t.candidate.metrics.quality_rubric = 3; });
    d.summary.paired_relative_changes_percent.fill(50);
  }, true);
  e("relative tolerance inside Python threshold", d => { d.summary.paired_relative_changes_percent[0] = 30.0000005; }, true);
  e("relative tolerance outside Python threshold", d => { d.summary.paired_relative_changes_percent[0] = 30.000002; });
  return cases;
}
