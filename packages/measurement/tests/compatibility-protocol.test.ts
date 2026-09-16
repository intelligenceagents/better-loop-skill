import assert from "node:assert/strict";
import test from "node:test";
import { compareTasks, freezeProtocol, planFromRecord, verifyRegistration } from "../src/index.js";
import { context, draft, prepare } from "./fixtures.js";

test("same taxonomy is insufficient when evaluator, units, objective, conditions or difficulty differ", () => {
  const a = context(draft()); const b = structuredClone(a);
  b.evaluator_version = "different";
  assert.deepEqual(compareTasks(a, b), {
    similarity: "same_taxonomy", status: "not_comparable", reasons: ["evaluator_version_mismatch"],
  });
  b.evaluator_version = a.evaluator_version; b.task.difficulty = "unknown";
  assert.equal(compareTasks(a, b).status, "not_comparable");
  a.task.difficulty = "unknown";
  assert.equal(compareTasks(a, b).status, "unknown");
});
for (const field of ["acceptance_criteria_version", "evaluator_version", "metric_definition_version", "resource_conditions"] as const) {
  test(`${field} mismatch blocks comparable measurements`, () => {
    const a = context(draft()); const b = structuredClone(a); b[field] += "-changed";
    assert.equal(compareTasks(a, b).status, "not_comparable");
  });
}
test("similarity does not infer difficulty or different-input equivalence", () => {
  const a = context(draft()); const b = structuredClone(a);
  b.input_version = "different"; b.equivalence_group = null;
  assert.equal(compareTasks(a, b).status, "not_comparable");
  b.equivalence_group = a.equivalence_group;
  assert.equal(compareTasks(a, b).status, "comparable");
});
test("model interventions must explicitly declare their changing condition", () => {
  const a = context(draft()); const b = structuredClone(a); b.conditions.model_version = "invented-model-b";
  assert.equal(compareTasks(a, b).status, "not_comparable");
  assert.equal(compareTasks(a, b, ["model_version"]).status, "comparable");
  b.resource_conditions = "larger-budget";
  assert.equal(compareTasks(a, b, ["model_version"]).status, "not_comparable");
});
test("set ordering and observed skill differences are irrelevant to input comparability", () => {
  const a = context(draft()); const b = structuredClone(a);
  b.task.constraints.reverse(); b.task.demonstrated_skills = ["tool_selection"];
  assert.equal(compareTasks(a, b).status, "comparable");
  Object.assign(b, { hidden: "not-an-allowed-field" });
  assert.throws(() => compareTasks(a, b), /invalid_context/);
});
test("registration is detached, recursively frozen and bound to exact planned context", () => {
  const prepared = prepare();
  const registration = prepared.options.registration!;
  assert.equal(Object.isFrozen(registration.evidence.quality_rule.dimensions[0]), true);
  assert.equal(verifyRegistration(prepared.draft, registration).verified, true);
  prepared.draft.protocol.intervention = "different-intervention";
  assert.ok(verifyRegistration(prepared.draft, registration).reasons.includes("registered_plan_changed"));
});
test("tampered digest, quality rule, trial order and seed invalidate registration", () => {
  const prepared = prepare();
  const tampered = structuredClone(prepared.options.registration!);
  tampered.evidence.quality_rule.dimensions[0]!.floor = 0;
  assert.ok(verifyRegistration(prepared.draft, tampered).reasons.includes("registration_digest_mismatch"));
  prepared.draft.trials[0]!.seed = 100;
  assert.ok(verifyRegistration(prepared.draft, prepared.options.registration!).reasons.includes("trial_plan_changed"));
});
test("freezing after results or with unknown execution start cannot establish preregistration", () => {
  const prepared = prepare();
  prepared.draft.trials[0]!.baseline.started_at = "2019-12-31T23:59:59Z";
  assert.ok(verifyRegistration(prepared.draft, prepared.options.registration!).reasons.includes("registration_not_before_execution"));
  prepared.draft.trials[0]!.baseline.started_at = null;
  assert.ok(verifyRegistration(prepared.draft, prepared.options.registration!).reasons.includes("execution_start_time_missing"));
});
test("plan freeze rejects unknown fields, mismatched task/conditions/units and omitted trial plans", () => {
  const prepared = prepare();
  const plan = planFromRecord(prepared.draft);
  const evidence = structuredClone(prepared.options.registration!.evidence);
  evidence.baseline.metric_unit = "USD";
  assert.throws(() => freezeProtocol(plan, evidence), /metric_unit_mismatch/);
  evidence.baseline.metric_unit = "count";
  evidence.trial_plan.pop();
  assert.throws(() => freezeProtocol(plan, evidence), /trial_plan_pairs_mismatch/);
  evidence.trial_plan.push(structuredClone(evidence.trial_plan[0]!));
  assert.throws(() => freezeProtocol(plan, evidence), /duplicate_planned_pair/);
});
test("unfrozen plans cannot be registered and malformed time values reject", () => {
  const prepared = prepare();
  const plan = planFromRecord(prepared.draft); plan.protocol.frozen_before_execution = false;
  assert.throws(() => freezeProtocol(plan, prepared.options.registration!.evidence), /protocol_not_frozen/);
  plan.protocol.frozen_before_execution = true;
  const evidence = structuredClone(prepared.options.registration!.evidence); evidence.registered_at = "yesterday";
  assert.throws(() => freezeProtocol(plan, evidence), /invalid_timestamp/);
  evidence.registered_at = "2026-02-30T00:00:00Z";
  assert.throws(() => freezeProtocol(plan, evidence), /invalid_timestamp/);
});
