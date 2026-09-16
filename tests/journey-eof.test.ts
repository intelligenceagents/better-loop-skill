import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDeltaExcerpt } from "../packages/journey/src/diff.js";

const marker = "\\ No newline at end of file\n";
function complete(before: string | null, after: string | null, expected: string) {
  const result = renderDeltaExcerpt(before, after, 4000);
  assert.deepEqual(result, { text: expected, truncated: false, format: "unified_hunks", omitted_hunks: 0 });
}

test("newline-terminated files have no phantom context; empty files have no source lines", () => {
  complete("one\n", "two\n", "@@ -1,1 +1,1 @@\n-one\n+two\n");
  for (const [before, after] of [[null, ""], ["", null], ["", ""], [null, null]] as const) complete(before, after, "");
  complete(null, "one\n", "@@ -0,0 +1,1 @@\n+one\n");
  complete("one\n", null, "@@ -1,1 +0,0 @@\n-one\n");
});

test("real blank lines remain lines, including blank-only files and an additional trailing blank", () => {
  complete("", "\n", "@@ -0,0 +1,1 @@\n+\n");
  complete("\n", "", "@@ -1,1 +0,0 @@\n-\n");
  complete("one\n\ntwo\n", "one\ntwo\n", "@@ -1,3 +1,2 @@\n one\n-\n two\n");
  complete("one\n\n", "one\n", "@@ -1,2 +1,1 @@\n one\n-\n");
  complete("one\n", "one\n\n", "@@ -1,1 +1,2 @@\n one\n+\n");
});

test("adding or removing EOF newline changes termination, not an invented blank source line", () => {
  complete("one\n", "one", "@@ -1,1 +1,1 @@\n-one\n+one\n" + marker);
  complete("one", "one\n", "@@ -1,1 +1,1 @@\n-one\n" + marker + "+one\n");
  complete("one", "two", "@@ -1,1 +1,1 @@\n-one\n" + marker + "+two\n" + marker);
  complete(null, "one", "@@ -0,0 +1,1 @@\n+one\n" + marker);
  complete("one", null, "@@ -1,1 +0,0 @@\n-one\n" + marker);
  complete("one", "one", "");
});

test("EOF metadata does not shift insertion coordinates or count as context/source lines", () => {
  complete("one\nend", "one\ninsert\nend", "@@ -1,2 +1,3 @@\n one\n+insert\n end\n" + marker);
  complete("first\r\nlast\r\n", "first\r\nchanged\r\n", "@@ -1,2 +1,2 @@\n first\r\n-last\r\n+changed\r\n");
  complete("\nend", "end", "@@ -1,2 +1,1 @@\n-\n end\n" + marker);
});

test("EOF marker stays attached atomically to its displayed line within every byte cap", () => {
  const expected = "@@ -1,1 +1,1 @@\n-😀\n" + marker + "+🙂\n" + marker;
  const bytes = Buffer.byteLength(expected);
  for (let budget = 0; budget <= bytes + 5; budget++) {
    const result = renderDeltaExcerpt("😀", "🙂", budget);
    assert.ok(Buffer.byteLength(result.text) <= budget, String(budget));
    assert.doesNotMatch(result.text, /\uFFFD|[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    if (result.text.includes("-😀")) assert.ok(result.text.includes("-😀\n" + marker));
    if (result.text.includes("+🙂")) assert.ok(result.text.includes("+🙂\n" + marker));
    assert.equal(result.truncated, budget < bytes);
    if (budget >= bytes) { assert.equal(result.text, expected); assert.equal(result.omitted_hunks, 0); }
  }
  const old = Array.from({ length: 60 }, (_, i) => `old ${i}`).join("\n");
  const next = Array.from({ length: 60 }, (_, i) => `new ${i}`).join("\n");
  const partial = renderDeltaExcerpt(old, next, 600);
  assert.equal(partial.truncated, true);
  assert.ok(Buffer.byteLength(partial.text) <= 600);
  if (partial.text.includes("-old 59\n")) assert.ok(partial.text.includes("-old 59\n" + marker));
  if (partial.text.includes("+new 59\n")) assert.ok(partial.text.includes("+new 59\n" + marker));
  assert.match(partial.text, /hunk lines omitted by budget/);
});
