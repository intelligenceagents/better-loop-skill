import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDeltaExcerpt } from "../packages/journey/src/diff.js";

test("distant one-line edits form separate hunks and never remove unchanged middle guidance", () => {
  const middle = Array.from({ length: 30 }, (_, index) => `UNCHANGED guidance ${index}: retain the selected scope.`);
  const before = ["intro", "OLD first rule", ...middle, "OLD final rule", "ending"].join("\n");
  const after = ["intro", "NEW first rule", ...middle, "NEW final rule", "ending"].join("\n");
  const diff = renderDeltaExcerpt(before, after, 800);
  assert.equal(diff.format, "unified_hunks");
  assert.equal((diff.text.match(/^@@ /gm) ?? []).length, 2);
  for (const line of ["-OLD first rule", "+NEW first rule", "-OLD final rule", "+NEW final rule"]) assert.ok(diff.text.includes(line), diff.text);
  assert.doesNotMatch(diff.text, /^[-+]UNCHANGED/gm);
  assert.ok(Buffer.byteLength(diff.text) <= 800);
  assert.equal(diff.omitted_hunks, 0);
});
test("long edited lines share the budget between removed and added sides", () => {
  const diff = renderDeltaExcerpt("OLD_BEGIN " + "a".repeat(12000), "NEW_BEGIN " + "b".repeat(12000), 300);
  assert.match(diff.text, /^-OLD_BEGIN/m);
  assert.match(diff.text, /^\+NEW_BEGIN/m);
  assert.match(diff.text, /line clipped/);
  assert.equal(diff.truncated, true);
  assert.ok(Buffer.byteLength(diff.text) <= 300);
});
test("large replacement hunks retain samples from both sides and explicitly mark omitted lines", () => {
  const before = Array.from({ length: 80 }, (_, i) => `OLD ${i}`).join("\n");
  const after = Array.from({ length: 80 }, (_, i) => `NEW ${i}`).join("\n");
  const diff = renderDeltaExcerpt(before, after, 300);
  assert.match(diff.text, /^-OLD/m); assert.match(diff.text, /^\+NEW/m);
  assert.match(diff.text, /hunk lines omitted by budget/);
  assert.equal(diff.truncated, true); assert.ok(Buffer.byteLength(diff.text) <= 300);
});
test("complexity fallback is labeled samples, not a misleading removal block", () => {
  const before = Array.from({ length: 1500 }, (_, i) => `old-${i}`).join("\n");
  const after = Array.from({ length: 1500 }, (_, i) => `new-${i}`).join("\n");
  const diff = renderDeltaExcerpt(before, after, 500);
  assert.equal(diff.format, "bounded_samples_not_diff");
  assert.match(diff.text, /NOT added\/removed lines/);
  assert.match(diff.text, /Before sample:/); assert.match(diff.text, /After sample:/);
  assert.doesNotMatch(diff.text, /^[-+]old-/m);
  assert.equal(diff.truncated, true); assert.ok(Buffer.byteLength(diff.text) <= 500);
});
test("tiny and Unicode excerpt budgets stay exact and signal omitted hunks", () => {
  for (const budget of [0, 1, 20, 99, 100, 101, 150, 301]) {
    const diff = renderDeltaExcerpt("before 😀".repeat(200), "after 🙂".repeat(200), budget);
    assert.ok(Buffer.byteLength(diff.text) <= budget, String(budget));
    assert.doesNotMatch(diff.text, /\uFFFD|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    assert.equal(diff.truncated, true);
    if (budget < 100) assert.equal(diff.omitted_hunks, 1);
  }
});
test("identical lines are empty evidence; additions/deletions preserve the actual side", () => {
  assert.equal(renderDeltaExcerpt("same", "same", 1000).text, "");
  const added = renderDeltaExcerpt(null, "actual addition", 200);
  assert.match(added.text, /^\+actual addition/m); assert.doesNotMatch(added.text, /^-actual addition/m);
  const removed = renderDeltaExcerpt("actual removal", null, 200);
  assert.match(removed.text, /^-actual removal/m); assert.doesNotMatch(removed.text, /^\+actual removal/m);
});
