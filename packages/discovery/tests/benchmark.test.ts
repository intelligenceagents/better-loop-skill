import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  APPROVAL_BINDING_CASE_IDS, APPROVAL_BINDING_LIMITS, judgeApprovalBindingOutput, PUBLIC_APPROVAL_BINDING_BENCHMARK, PUBLIC_APPROVAL_BINDING_RESULTS,
} from "../dist/index.js";

// Deliberate oracle fixtures only; never model executions or benchmark result files.
const fixtureAnswer = () => ({
  schema_version: "bl-approval-binding-answer-0.1", benchmark_id: "bl-public-approval-binding", benchmark_version: "0.1",
  cases: [
    ["original", "accept", "original_reviewed_state"],
    ["wrong_digest", "reject", "exact_digest_required"],
    ["not_confirmed", "reject", "explicit_confirmation_required"],
    ["edited_candidate", "reject", "reviewed_snapshot_changed"],
    ["edited_purpose", "reject", "reviewed_snapshot_changed"],
    ["edited_preview", "reject", "reviewed_snapshot_changed"],
    ["edited_receipts", "reject", "reviewed_snapshot_changed"],
    ["json_clone", "reject", "original_object_identity_required"],
    ["shallow_clone", "reject", "original_object_identity_required"],
    ["caller_consent_changed", "accept", "caller_consent_snapshotted"],
    ["reviewer_copy_changed", "accept", "reviewer_input_detached"],
    ["key_order_only", "accept", "canonical_key_order_ignored"],
  ].map(([id, decision, reason]) => ({ id, decision, reason })),
  limits: [...APPROVAL_BINDING_LIMITS],
});
test("pure oracle fixture checks coverage of all allowed/rejected cases and scope limits", () => {
  const judgment = judgeApprovalBindingOutput(fixtureAnswer());
  assert.equal(judgment.format_valid, true);
  assert.equal(judgment.result, "met");
  assert.equal(judgment.coverage.supplied_cases, 12);
  assert.deepEqual(judgment.coverage.missing_cases, []);
  assert.equal(judgment.checks.every(check => check.status === "passed"), true);
  assert.deepEqual(judgeApprovalBindingOutput(JSON.stringify(fixtureAnswer())), judgment);
});
test("wrong but complete answer is not_met, without disguising failed checks as missing", () => {
  const answer = fixtureAnswer();
  answer.cases[0]!.decision = "reject";
  const judgment = judgeApprovalBindingOutput(answer);
  assert.equal(judgment.result, "not_met");
  assert.equal(judgment.checks[0]!.status, "failed");
  assert.equal(judgment.coverage.supplied_cases, 12);
});
test("blanket rejection fails; changing the explanation while keeping decision correct fails", () => {
  const blanket = fixtureAnswer(); blanket.cases.forEach(item => { item.decision = "reject"; });
  assert.equal(judgeApprovalBindingOutput(blanket).result, "not_met");
  const explanation = fixtureAnswer(); explanation.cases[0]!.reason = "reviewed_snapshot_changed";
  assert.equal(judgeApprovalBindingOutput(explanation).checks[0]!.status, "failed");
});
test("incomplete answers retain missing coverage separately from failure and do not award a zero score", () => {
  const partial = fixtureAnswer(); partial.cases.pop();
  const result = judgeApprovalBindingOutput(partial);
  assert.equal(result.result, "incomplete");
  assert.equal(result.coverage.supplied_cases, 11);
  assert.deepEqual(result.coverage.missing_cases, ["key_order_only"]);
  assert.equal("score" in result, false);
  const noLimits = fixtureAnswer(); noLimits.limits = [];
  assert.equal(judgeApprovalBindingOutput(noLimits).result, "incomplete");
});
test("duplicate cases/keys, wrong versions, extra data, oversized or malformed output do not pass", () => {
  const duplicate = fixtureAnswer(); duplicate.cases[11] = duplicate.cases[0]!;
  const unknown = fixtureAnswer(); unknown.cases[0]!.reason = "TEST_ONLY_UNSUPPORTED_REASON";
  for (const input of [
    duplicate, unknown, { ...fixtureAnswer(), benchmark_version: "0.2" },
    { ...fixtureAnswer(), upload: "TEST_ONLY_PRIVATE_VALUE" }, "```json\n{}\n```",
    '{"cases":[],"cases":[]}', " ".repeat(8193), null,
  ]) {
    const result = judgeApprovalBindingOutput(input);
    assert.equal(result.format_valid, false);
    assert.equal(result.result, "incomplete");
    assert.equal(JSON.stringify(result).includes("TEST_ONLY_PRIVATE_VALUE"), false);
  }
});
test("one registry is deeply frozen and byte-linked to the committed sources/prompts/rubric", () => {
  assert.equal(PUBLIC_APPROVAL_BINDING_BENCHMARK.id, "bl-public-approval-binding");
  assert.equal(PUBLIC_APPROVAL_BINDING_BENCHMARK.version, "0.1");
  assert.equal(PUBLIC_APPROVAL_BINDING_BENCHMARK.execution.outputs_at_freeze, 0);
  assert.equal(PUBLIC_APPROVAL_BINDING_BENCHMARK.execution.model_calls_by_package, 0);
  assert.equal(PUBLIC_APPROVAL_BINDING_BENCHMARK.source_commit, "990428dadb3061453b54d3b078b1c8434d4e5d47");
  assert.equal(Object.isFrozen(PUBLIC_APPROVAL_BINDING_BENCHMARK.sources), true);
  const root = new URL("../../../evals/public-work-benchmark/", import.meta.url);
  const bytes = readFileSync(new URL("freeze.json", root));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), PUBLIC_APPROVAL_BINDING_BENCHMARK.freeze_sha256);
  const freeze = JSON.parse(bytes.toString()) as { files: { path: string; sha256: string }[] };
  for (const entry of freeze.files) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(entry.path, root))).digest("hex"), entry.sha256);
  }
  assert.equal(APPROVAL_BINDING_CASE_IDS.length, 12);
});
test("retained real executions independently rejudge, account all model entries once and match packaged summary", () => {
  const bytes = readFileSync(new URL("../../../evals/public-work-benchmark/RESULTS.json", import.meta.url));
  const report = JSON.parse(bytes.toString()) as {
    summary: { arms: unknown[] };
    executions: Array<{ output: string; judgment: unknown; reported_total_model_tokens: number; estimated_api_cost_usd: number;
      model_usage: Array<{ input_tokens_excluding_cache: number; output_tokens_including_thinking: number;
        cache_read_input_tokens: number; cache_creation_input_tokens: number; estimated_api_cost_usd: number }> }>;
  };
  assert.equal(PUBLIC_APPROVAL_BINDING_RESULTS.status, "real_executions_retained");
  assert.equal(PUBLIC_APPROVAL_BINDING_BENCHMARK.status, "frozen_before_execution");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), PUBLIC_APPROVAL_BINDING_RESULTS.results_sha256);
  assert.equal(report.executions.length, 2);
  for (const run of report.executions) {
    assert.deepEqual(judgeApprovalBindingOutput(run.output), run.judgment);
    const sum = run.model_usage.reduce((n, model) => n + model.input_tokens_excluding_cache + model.output_tokens_including_thinking +
      model.cache_read_input_tokens + model.cache_creation_input_tokens, 0);
    assert.equal(sum, run.reported_total_model_tokens);
    assert.ok(Math.abs(run.model_usage.reduce((n, model) => n + model.estimated_api_cost_usd, 0) - run.estimated_api_cost_usd) < 1e-9);
  }
  assert.deepEqual(report.summary.arms, PUBLIC_APPROVAL_BINDING_RESULTS.arms);
  assert.deepEqual(report.executions.map(run => run.reported_total_model_tokens), [34617, 34981]);
  assert.equal(PUBLIC_APPROVAL_BINDING_RESULTS.guided_minus_baseline_tokens, 364);
  assert.equal(PUBLIC_APPROVAL_BINDING_RESULTS.shared_orchestration_resources, null);
  assert.equal(PUBLIC_APPROVAL_BINDING_RESULTS.human_effort_seconds, null);
  assert.equal(PUBLIC_APPROVAL_BINDING_RESULTS.cash_billing_usd, null);
  assert.equal(Object.isFrozen(PUBLIC_APPROVAL_BINDING_RESULTS.arms), true);
  assert.equal(/\/Users\/|\/home\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(bytes.toString()), false);
});
