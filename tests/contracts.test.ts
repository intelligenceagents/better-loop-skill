import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { validateEvaluationRun, validateShareCandidate } from "../packages/contracts/src/index.js";
import { contractCases, evaluation, share } from "./cases.js";

for (const item of contractCases()) {
  test(item.label, () => {
    const original = JSON.stringify(item.input);
    const result = item.contract === "share" ? validateShareCandidate(item.input) : validateEvaluationRun(item.input);
    assert.equal(result.valid, item.valid, JSON.stringify(result.valid ? {} : result.errors));
    assert.equal(JSON.stringify(item.input), original);
    assert.equal(result.errors.length === 0, item.valid);
  });
}
for (const filename of readdirSync("examples").filter(name => name.endsWith(".synthetic.json"))) {
  test(`public synthetic fixture: ${filename}`, () => {
    const fixture = JSON.parse(readFileSync(`examples/${filename}`, "utf8")) as unknown;
    assert.equal(filename.startsWith("evaluation-run") ? validateEvaluationRun(fixture).valid : validateShareCandidate(fixture).valid, true);
  });
}
test("all declared task families validate without a ranking claim", () => {
  for (const family of ["software", "analysis_finance", "research_strategy", "mathematics_science", "writing_design", "operations_education", "general"] as const) {
    const data = share(); data.task.task_family = family;
    assert.equal(validateShareCandidate(data).valid, true);
  }
});
test("successful results are detached and retain null evidence", () => {
  const input = evaluation(); const result = validateEvaluationRun(input);
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.notEqual(result.data, input);
    assert.equal(result.data.trials[0]!.baseline.metrics.model_duration, null);
    input.trials[0]!.baseline.metrics.model_tokens = 42;
    assert.equal(result.data.trials[0]!.baseline.metrics.model_tokens, 1000);
  }
});
test("failures do not echo submitted values or arbitrary property names", () => {
  const input = share(); Object.assign(input.story, { SYNTHETIC_PRIVATE_SENTINEL: "SYNTHETIC_CONTENT_SENTINEL" });
  assert.doesNotMatch(JSON.stringify(validateShareCandidate(input)), /SENTINEL/);
});
test("validators reject JavaScript-only values and do not execute accessors", () => {
  for (const bad of [NaN, Infinity, undefined, 1n, new Date(), () => 0, Symbol("synthetic")]) {
    const input = evaluation(); Object.assign(input.trials[0]!.baseline.metrics, { model_tokens: bad });
    assert.equal(validateEvaluationRun(input).valid, false);
  }
  let executions = 0;
  const input = share();
  Object.defineProperty(input.story, "title", { enumerable: true, get() { executions++; return "Synthetic"; } });
  assert.equal(validateShareCandidate(input).valid, false);
  assert.equal(executions, 0);
});
test("UTF8 byte limit includes multibyte characters", () => {
  const input = share();
  for (const key of ["problem", "change", "result", "lesson", "limits"] as const) input.story[key] = "a".repeat(800);
  assert.equal(validateShareCandidate(input).valid, true);
  for (const key of ["problem", "change", "result", "lesson", "limits"] as const) input.story[key] = "🧪".repeat(800);
  const result = validateShareCandidate(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === "candidate_too_large"));
});
