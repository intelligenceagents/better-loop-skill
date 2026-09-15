import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDeltaExcerpt } from "../packages/journey/src/diff.js";

const actualLines = (text: string) => (text.match(/[^\n]*\n|[^\n]+$/g) ?? []).map(line => line.endsWith("\n") ? line.slice(0, -1) : line);

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
test("oversize changed lines are omitted whole instead of presenting clipped identifiers", () => {
  const diff = renderDeltaExcerpt("OLD_BEGIN " + "a".repeat(12000), "NEW_BEGIN " + "b".repeat(12000), 300);
  assert.doesNotMatch(diff.text, /OLD_BEGIN|NEW_BEGIN|line clipped|\[clipped\]/);
  assert.equal(diff.omitted_hunks, 1);
  assert.match(diff.text, /unassessed, not absent/);
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

test("a complete added statement cannot imply an omitted oversize removed statement was absent", () => {
  const diff = renderDeltaExcerpt("old long statement " + "x".repeat(12000), "return actualNewResult;", 500);
  assert.match(diff.text, /^\+return actualNewResult;$/m);
  assert.match(diff.text, /removed 1, added 0/);
  assert.match(diff.text, /unassessed, not absent/);
  assert.doesNotMatch(diff.text, /line clipped|\[clipped\]/);
});

test("bounded actual public SKILL/viewer changes preserve coherent statements under the native 4k/two-path selection", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const selected = JSON.parse(await readFile("tests/fixtures/journey-real-public-source.json", "utf8")) as {
    files: { path: string; before: string | null; after: string; before_sha256: string | null; after_sha256: string }[];
  };
  let remaining = 4000;
  const result = selected.files.map((file, index) => {
    assert.equal(createHash("sha256").update(file.after).digest("hex"), file.after_sha256);
    if (file.before !== null) assert.equal(createHash("sha256").update(file.before).digest("hex"), file.before_sha256);
    const rendered = renderDeltaExcerpt(file.before, file.after, Math.floor(remaining / (selected.files.length - index)));
    remaining -= Buffer.byteLength(rendered.text);
    assert.doesNotMatch(rendered.text, /line clipped|\[clipped\]|\uFFFD/);
    assert.match(rendered.text, /hunk lines omitted by budget/);
    assert.match(rendered.text, /unassessed, not absent/);
    for (const line of rendered.text.split("\n")) {
      if (line.startsWith("+")) assert.ok(actualLines(file.after).includes(line.slice(1)), "Every displayed added line must be exact and complete.");
      if (line.startsWith("-")) assert.ok(file.before !== null && actualLines(file.before).includes(line.slice(1)), "Every displayed removed line must be exact and complete.");
    }
    return rendered;
  });
  assert.ok(remaining >= 0);
  assert.match(result[0]!.text, /^\+Make progress you can prove:.*Sharing is optional\.$/m);
  assert.match(result[0]!.text, /^-Help the person make the next task better\..*private host tools\.$/m);
  // Actual implementation, from its declaration through its returned no-side-effect receipt.
  const source = selected.files[1]!.after;
  const actualFunction = source.slice(source.indexOf("export async function writeJourneyView"));
  const shown = result[1]!.text.split("\n").filter(line => line.startsWith("+")).map(line => line.slice(1)).join("\n");
  assert.ok(shown.includes(actualFunction.trimEnd()), "The real writer must remain one coherent complete function, not distributed fragments.");
  assert.match(shown, /viewer_output_must_be_outside_state/);
  assert.match(shown, /await writePrivateOutput\(output, renderJourneyView\(review\)\)/);
});
