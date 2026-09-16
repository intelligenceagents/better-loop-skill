import assert from "node:assert/strict";
import test from "node:test";
import { listSharedChallenges } from "../dist/index.js";
import { actions, families, objectives, problems, qualityDimensions } from "./shared-fixtures.js";

test("eight stable problem briefs cover all seven task families without inventing participants or validation", () => {
  const catalogue = listSharedChallenges();
  assert.equal(catalogue.length, 8);
  assert.deepEqual(catalogue.map(brief => brief.problem_type), [...problems]);
  assert.equal(new Set(catalogue.map(brief => brief.id)).size, 8);
  for (const brief of catalogue) {
    assert.equal(brief.id, `bl-practice-${brief.problem_type}-0.1`);
    assert.equal(brief.version, "bl-shared-challenges-0.1");
    assert.deepEqual(brief.task_families, [...families]);
    assert.equal(brief.validation, "practice_prompt_not_validated_benchmark");
    for (const [values, allowed] of [
      [brief.objectives, objectives], [brief.human_actions, actions], [brief.quality_dimensions, qualityDimensions],
    ] as const) {
      assert.ok(values.length > 0);
      assert.equal(new Set(values).size, values.length);
      for (const value of values) assert.ok((allowed as readonly string[]).includes(value));
    }
    for (const text of [brief.title, brief.prompt_starter, brief.acceptance_check, brief.next_attempt, ...brief.limitations]) {
      assert.ok(text.trim().length > 0 && text.length <= 800);
    }
    assert.match(brief.next_attempt, /Sharing is optional/);
    assert.match(brief.limitations.join(" "), /preparation/);
    assert.match(brief.limitations.join(" "), /not a validated benchmark/);
    assert.equal("participants" in brief, false);
    assert.equal("results" in brief, false);
    assert.equal("completion" in brief, false);
  }
});

test("callers cannot corrupt shared briefs or their nested controlled fields", () => {
  const catalogue = listSharedChallenges();
  const original = JSON.stringify(catalogue);
  assert.throws(() => (catalogue as unknown as unknown[]).pop(), TypeError);
  assert.throws(() => { (catalogue[0] as unknown as { title: string }).title = "Changed"; }, TypeError);
  for (const key of ["task_families", "objectives", "human_actions", "quality_dimensions", "limitations"] as const) {
    assert.throws(() => (catalogue[0]![key] as unknown as string[]).push("Changed"), TypeError);
  }
  assert.equal(JSON.stringify(listSharedChallenges()), original);
});

test("briefs teach distinct human decisions and checks, including unfavorable and missing outcomes", () => {
  const catalogue = listSharedChallenges();
  assert.equal(new Set(catalogue.map(brief => brief.prompt_starter)).size, 8);
  assert.equal(new Set(catalogue.map(brief => brief.acceptance_check)).size, 8);
  assert.match(catalogue.find(brief => brief.problem_type === "extracting_information")!.acceptance_check, /missing/);
  assert.match(catalogue.find(brief => brief.problem_type === "improving_process")!.acceptance_check, /neutral, adverse and missing/);
  assert.match(catalogue.find(brief => brief.problem_type === "quantitative_reasoning")!.acceptance_check, /not treat.*as proof/);
});
