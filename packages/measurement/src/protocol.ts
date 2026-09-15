import { canonicalize, validateEvaluationRun } from "@better-loop/contracts";
import { sha256 } from "@noble/hashes/sha2.js";
import type { EvaluationDraft, FrozenProtocol, ProtocolPlan, RegistrationEvidence } from "./types.js";
import { compareTasks, validateTaskContext } from "./compatibility.js";
import { validateQualityRule } from "./quality.js";
import { deepFreeze, equal, fail, object, snapshot, text, timestamp } from "./guards.js";

const PLAN_KEYS = ["schema_version", "framework_version", "content_origin", "run_id", "task_instance_id", "task", "protocol", "conditions"] as const;
const emptyMetrics = { model_tokens: null, model_duration: null, human_effort: null, estimated_api_cost: null, rework_cycles: null, quality_rubric: null };

export function planFromRecord(record: EvaluationDraft): ProtocolPlan {
  return Object.fromEntries(PLAN_KEYS.map(key => [key, record[key]])) as unknown as ProtocolPlan;
}
function validatePlan(input: ProtocolPlan): ProtocolPlan {
  const plan = snapshot(input);
  object(plan, PLAN_KEYS, "invalid_protocol_plan");
  if (!plan.protocol || !Array.isArray(plan.protocol.planned_pair_ids) || !plan.protocol.planned_pair_ids.length) fail("invalid_protocol_plan");
  const arm = {
    status: "not_run", metrics: emptyMetrics, quality_floor_passed: null, critical_regression: null,
    started_at: null, finished_at: null, failure_or_omission_reason: "Prespecified; execution has not begun.",
  };
  const record = {
    ...plan, observations: [],
    trials: plan.protocol.planned_pair_ids.map(pair_id => ({ pair_id, order: "baseline_first", seed: null, baseline: arm, candidate: arm })),
    summary: {
      outcome: "insufficient_evidence", paired_relative_changes_percent: plan.protocol.planned_pair_ids.map(() => null),
      uncertainty: "Not executed.", limitations: [],
    },
  };
  if (!validateEvaluationRun(record).valid) fail("invalid_protocol_plan");
  if (!plan.protocol.frozen_before_execution) fail("protocol_not_frozen");
  return plan;
}

function validateEvidence(input: RegistrationEvidence): RegistrationEvidence {
  const evidence = snapshot(input);
  object(evidence, ["registered_at", "baseline", "candidate", "allowed_condition_changes", "quality_rule", "task_fingerprint", "independent_pairs", "trial_plan"], "invalid_registration_evidence");
  timestamp(evidence.registered_at);
  text(evidence.task_fingerprint, "invalid_task_fingerprint");
  if (typeof evidence.independent_pairs !== "boolean") fail("invalid_registration_evidence");
  if (!Array.isArray(evidence.trial_plan) || evidence.trial_plan.length < 1 || evidence.trial_plan.length > 1000) fail("invalid_trial_plan");
  const ids = new Set<string>();
  for (const trial of evidence.trial_plan) {
    object(trial, ["pair_id", "order", "seed", "blind_assignment"], "invalid_trial_plan");
    text(trial.pair_id, "invalid_trial_plan");
    if (ids.has(trial.pair_id)) fail("duplicate_planned_pair");
    ids.add(trial.pair_id);
    if (!["baseline_first", "candidate_first"].includes(trial.order) ||
        !["baseline_as_A", "candidate_as_A"].includes(trial.blind_assignment) ||
        (trial.seed !== null && !Number.isSafeInteger(trial.seed))) fail("invalid_trial_plan");
  }
  evidence.baseline = validateTaskContext(evidence.baseline);
  evidence.candidate = validateTaskContext(evidence.candidate);
  compareTasks(evidence.baseline, evidence.candidate, evidence.allowed_condition_changes);
  evidence.quality_rule = validateQualityRule(evidence.quality_rule);
  return evidence;
}
function digest(value: unknown): string {
  return Array.from(sha256(new TextEncoder().encode(canonicalize(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
function validateBinding(plan: ProtocolPlan, evidence: RegistrationEvidence): void {
  if (!equal([...plan.protocol.planned_pair_ids].sort(), evidence.trial_plan.map(trial => trial.pair_id).sort())) fail("trial_plan_pairs_mismatch");
  for (const [side, context] of [["baseline", evidence.baseline], ["candidate", evidence.candidate]] as const) {
    if (!equal(plan.task, context.task) || !equal(plan.conditions[side], context.conditions) ||
        plan.protocol.evaluator_version !== context.evaluator_version ||
        plan.protocol.metric_definition_version !== context.metric_definition_version) fail("registration_context_mismatch");
  }
  const unit = evidence.baseline.metric_unit;
  const metric = plan.protocol.primary_metric;
  if ((metric === "model_tokens" || metric === "rework_cycles") && unit !== "count" ||
      (metric === "model_duration" || metric === "human_effort") && unit !== "seconds" ||
      metric === "estimated_api_cost" && unit !== "USD" ||
      metric === "quality_rubric" && !["index", "percent", "proportion"].includes(unit)) fail("metric_unit_mismatch");
}

/**
 * Call before execution and persist the returned object separately. A digest detects changed bytes;
 * it is not an independently trusted timestamp, authorship claim, or evidence of real execution.
 */
export function freezeProtocol(inputPlan: ProtocolPlan, inputEvidence: RegistrationEvidence): FrozenProtocol {
  const plan = validatePlan(inputPlan);
  const evidence = validateEvidence(inputEvidence);
  validateBinding(plan, evidence);
  const registration = { version: "bl-measurement-registration-0.1" as const, plan, evidence };
  return deepFreeze({ ...registration, digest: digest(registration) });
}

export function verifyRegistration(record: EvaluationDraft, input: FrozenProtocol): { verified: boolean; reasons: string[] } {
  try {
    const registration = snapshot(input);
    object(registration, ["version", "plan", "evidence", "digest"], "invalid_registration");
    if (registration.version !== "bl-measurement-registration-0.1") fail("invalid_registration_version");
    const expected = freezeProtocol(registration.plan, registration.evidence);
    if (expected.digest !== registration.digest) return { verified: false, reasons: ["registration_digest_mismatch"] };
    if (!equal(planFromRecord(record), registration.plan)) return { verified: false, reasons: ["registered_plan_changed"] };
    const frozenAt = timestamp(registration.evidence.registered_at);
    const reasons: string[] = [];
    for (const trial of record.trials) {
      const planned = registration.evidence.trial_plan.find(item => item.pair_id === trial.pair_id);
      if (!planned || trial.order !== planned.order || trial.seed !== planned.seed) reasons.push("trial_plan_changed");
      for (const arm of [trial.baseline, trial.candidate]) {
        if (arm.status === "not_run") continue;
        if (arm.started_at === null) { reasons.push("execution_start_time_missing"); continue; }
        if (timestamp(arm.started_at) <= frozenAt) reasons.push("registration_not_before_execution");
      }
    }
    return { verified: reasons.length === 0, reasons: [...new Set(reasons)] };
  } catch { return { verified: false, reasons: ["invalid_registration"] }; }
}
