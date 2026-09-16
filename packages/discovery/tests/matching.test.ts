import assert from "node:assert/strict";
import test from "node:test";
import { matchRoleEvidence } from "../dist/index.js";
import { attestedRow, criteria, current, row } from "./fixtures.js";

test("separate task/skills, relevant quality, human attribution and gaps; no score or tier promotion", () => {
  const result = matchRoleEvidence(criteria(), [row()], current);
  assert.equal(result.state, "available");
  const match = result.matches[0]!;
  assert.deepEqual(match.skills.supported, ["factual_verification"]);
  assert.deepEqual(match.skills.missing, ["domain_validation"]);
  assert.equal(match.quality.find(check => check.dimension === "reasoning")!.check, null);
  assert.equal(match.human_attribution.actions[0]!.evidence!.evidence, "selected_human_message");
  assert.equal(match.trust.tier, "self_reported");
  assert.match(match.trust.reasons.join(" "), /do not raise/);
  assert.equal(match.task.comparability, "not_established");
  assert.ok(match.gaps.some(gap => gap.requirement === "reasoning" && gap.reason === "missing_evidence"));
  assert.equal("score" in match, false);
  assert.equal("consent" in match, false);
});
test("same problem/objective in another family stays relevant, with differing context and unknown difficulty", () => {
  const record = row();
  record.candidate.task.task_family = "analysis_finance";
  record.candidate.task.difficulty = "unknown";
  record.candidate.task.difficulty_basis = "unknown";
  const match = matchRoleEvidence(criteria(), [record], current).matches[0]!;
  assert.equal(match.task.family, "different");
  assert.equal(match.task.difficulty, "unknown");
  assert.ok(match.gaps.some(gap => gap.area === "difficulty" && gap.reason === "missing_evidence"));
});
test("wrong problem or objective is not a role match; list ordering does not rank skill claims", () => {
  const unrelated = row(3); unrelated.candidate.task.problem_type = "creating_content";
  const another = row(2); another.candidate.task.demonstrated_skills.push("domain_validation");
  assert.deepEqual(matchRoleEvidence(criteria(), [unrelated, another, row(1)], current).matches.map(item => item.public_id),
    [row(1).public_id, row(2).public_id]);
});
for (const scenario of ["withdrawn", "deleted", "held", "not_current", "optout", "legacy", "synthetic"] as const) {
  test(`discovery excludes ${scenario} and does not infer opt-in`, () => {
    const record = row();
    if (["withdrawn", "deleted", "held"].includes(scenario)) record.status = scenario as "withdrawn" | "deleted" | "held";
    if (scenario === "not_current") record.current = false;
    if (scenario === "optout") record.consent!.candidate_discovery = false;
    if (scenario === "legacy") { record.capability_evidence = null; record.consent = null; }
    if (scenario === "synthetic") { record.candidate.content_origin = "synthetic"; record.capability_evidence!.benchmark = null; }
    assert.equal(matchRoleEvidence(criteria(), [record], current).state, "no_eligible_records");
  });
}
test("autonomous agent checks are retained as quality, never inferred human actions", () => {
  const record = row();
  record.candidate.human_behaviors = [];
  record.capability_evidence!.assessment_basis = "artifacts_only";
  record.capability_evidence!.human_involvement = "agent_autonomous";
  record.capability_evidence!.human_actions = [];
  const match = matchRoleEvidence(criteria(), [record], current).matches[0]!;
  assert.equal(match.quality[0]!.check!.result, "met");
  assert.equal(match.human_attribution.actions[0]!.evidence, null);
  assert.ok(match.gaps.some(gap => gap.area === "human_action" && gap.reason === "missing_evidence"));
});
test("attestations and known failed checks stay distinct from missing data", () => {
  const record = attestedRow();
  record.capability_evidence!.human_actions[0]!.outcome_check = "not_met";
  record.capability_evidence!.quality_checks[0]!.result = "not_met";
  const match = matchRoleEvidence(criteria(), [record], current).matches[0]!;
  assert.ok(match.gaps.some(gap => gap.reason === "attestation_only"));
  assert.ok(match.gaps.some(gap => gap.area === "quality" && gap.reason === "check_not_met"));
});
for (const state of ["insufficient_evidence", "not_observed"] as const) {
  test(`legitimate self-attestation with ${state} is discoverable without manufacturing observed human evidence`, () => {
    const record = attestedRow(1, state);
    const result = matchRoleEvidence(criteria(), [record], current);
    assert.equal(result.state, "available");
    const match = result.matches[0]!;
    assert.equal(match.human_attribution.assessment_basis, "user_attestation");
    assert.equal(match.human_attribution.actions[0]!.evidence!.evidence, "user_attestation");
    assert.equal(match.human_attribution.actions[0]!.evidence!.outcome_check, "met");
    assert.ok(match.gaps.some(gap => gap.area === "human_action" && gap.reason === "attestation_only"));
    assert.equal(match.trust.tier, "self_reported");
    assert.equal(record.candidate.human_behaviors[0]!.state, state);
    assert.equal(record.candidate.human_behaviors[0]!.rating, null);
  });
}
test("bundled validator requires selected-human-message support for every observed base indicator", () => {
  const missing = row(); missing.capability_evidence!.human_actions = [];
  const attestedObserved = row(); attestedObserved.capability_evidence!.human_actions[0]!.evidence = "user_attestation";
  const wrongIndicator = row(); wrongIndicator.capability_evidence!.human_actions[0]!.action = "goal_definition";
  for (const record of [missing, attestedObserved, wrongIndicator]) {
    assert.equal(matchRoleEvidence(criteria(), [record], current).state, "invalid_input");
  }
  // Positive control: observed candidate behavior has its matching selected human message.
  assert.equal(matchRoleEvidence(criteria(), [row()], current).state, "available");
});
test("client capsule contradictions and unsupported role fields are rejected without echoing input", () => {
  const record = row(); record.capability_evidence!.assessment_basis = "artifacts_only";
  assert.equal(matchRoleEvidence(criteria(), [record], current).state, "invalid_input");
  const result = matchRoleEvidence({ ...criteria(), employer: "TEST_ONLY_PRIVATE_VALUE" } as never, [row()], current);
  assert.equal(result.state, "invalid_input");
  assert.equal(JSON.stringify(result).includes("TEST_ONLY_PRIVATE_VALUE"), false);
  assert.equal(matchRoleEvidence({ ...criteria(), required_skills: ["factual_verification", "factual_verification"] }, [], current).state, "invalid_input");
});
test("offline/incomplete snapshots do not recommend records; outputs are detached", () => {
  assert.equal(matchRoleEvidence(criteria(), [row()], { source: "offline_snapshot", complete: true }).state, "current_snapshot_required");
  assert.equal(matchRoleEvidence(criteria(), [row()], { ...current, complete: false }).state, "current_snapshot_required");
  const record = row();
  const result = matchRoleEvidence(criteria(), [record], current);
  result.matches[0]!.quality[0]!.check!.result = "not_met";
  assert.equal(record.capability_evidence!.quality_checks[0]!.result, "met");
});
test("duplicate current records collapse and conflicting current publication states invalidate", () => {
  assert.equal(matchRoleEvidence(criteria(), [row(), row()], current).matches.length, 1);
  const withdrawn = row(); withdrawn.status = "withdrawn";
  assert.equal(matchRoleEvidence(criteria(), [row(), withdrawn], current).state, "invalid_input");
});
