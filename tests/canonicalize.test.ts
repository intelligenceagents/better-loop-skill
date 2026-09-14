import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonicalize, computePreviewDigest, ContractInputError } from "../packages/contracts/src/index.js";
import { consent, evaluation, share } from "./cases.js";

test("ECMAScript finite-number serialization matches RFC 8785 examples", () => {
  assert.equal(canonicalize([333333333.33333329, 1e30, 4.50, 2e-3, 1e-27, -0]),
    "[333333333.3333333,1e+30,4.5,0.002,1e-27,0]");
});
test("sorts numeric-looking object keys lexically, including nested objects", () => {
  assert.equal(canonicalize({ z: { 2: false, 10: true }, a: [3, 2, 1] }), '{"a":[3,2,1],"z":{"10":true,"2":false}}');
});
test("RFC 8785 UTF16 ordering and escaping", () => {
  const value = { "\u20ac": 1, "\r": 2, "\ufb33": 3, "1": 4, "😀": 5, "\u0080": 6, "ö": 7 };
  assert.equal(canonicalize(value), '{"\\r":2,"1":4,"\u0080":6,"ö":7,"€":1,"😀":5,"דּ":3}');
  assert.equal(canonicalize('\b\t\n\f\r"\\/\u0000'), '"\\b\\t\\n\\f\\r\\"\\\\/\\u0000"');
});
test("Unicode is preserved, not normalized", () => {
  assert.notEqual(canonicalize("é"), canonicalize("e\u0301"));
});
test("null-prototype JSON records and repeated references are allowed", () => {
  const child = Object.assign(Object.create(null) as object, { value: null });
  assert.equal(canonicalize([child, child]), '[{"value":null},{"value":null}]');
});
for (const [label, value] of [
  ["undefined", undefined], ["function", () => 0], ["symbol", Symbol("synthetic")],
  ["bigint", 1n], ["NaN", NaN], ["positive infinity", Infinity], ["negative infinity", -Infinity],
  ["date", new Date(0)], ["map", new Map()], ["set", new Set()], ["boxed number", new Number(1)],
  ["typed array", new Uint8Array([1])], ["sparse array", new Array(2)],
  ["nested undefined", { a: undefined }], ["high surrogate", "\ud800"], ["low surrogate", "\udc00"],
  ["bad surrogate pair", "\ud800a"], ["bad key", { "\ud800": true }],
  ["custom prototype", Object.create({ inherited: true })],
  ["symbol key", { [Symbol("synthetic")]: 1 }],
] as const) {
  test(`canonicalize rejects ${label}`, () => assert.throws(() => canonicalize(value), ContractInputError));
}
test("canonicalize rejects cycles, extra array properties, hidden fields, accessors and toJSON", () => {
  const cycle: unknown[] = []; cycle.push(cycle);
  const extra = Object.assign([1], { extra: 2 });
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  let executions = 0;
  const accessor = { get value() { executions++; return 1; } };
  const toJSON = { toJSON() { executions++; return null; } };
  for (const input of [cycle, extra, hidden, accessor, toJSON]) assert.throws(() => canonicalize(input), ContractInputError);
  assert.equal(executions, 0);
});
test("prototype-related JSON keys remain data", () => {
  assert.equal(canonicalize(JSON.parse('{"__proto__":1,"constructor":2}')), '{"__proto__":1,"constructor":2}');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
test("digest matches independent Node SHA256 over the exact envelope", () => {
  const candidate = share(); const purposes = consent();
  const expected = createHash("sha256").update(canonicalize({ candidate, consent: purposes }), "utf8").digest("hex");
  assert.equal(computePreviewDigest(candidate, purposes), expected);
  assert.match(expected, /^[0-9a-f]{64}$/);
});
test("digest ignores formatting/key order, binds content/array order/purpose choices", () => {
  const candidate = share(); const purposes = consent();
  const first = computePreviewDigest(candidate, purposes);
  const reverse = Object.fromEntries(Object.entries(candidate).reverse());
  assert.equal(computePreviewDigest(reverse, Object.fromEntries(Object.entries(purposes).reverse())), first);
  candidate.story.lesson += " Synthetic edit.";
  assert.notEqual(computePreviewDigest(candidate, purposes), first);
  assert.notEqual(computePreviewDigest(share(), { ...purposes, benchmark_aggregation: true }), first);
  assert.notEqual(computePreviewDigest(share(), { ...purposes, community_learning: true }), first);
  const reordered = share(); reordered.human_behaviors.reverse();
  assert.notEqual(computePreviewDigest(reordered, purposes), first);
});
test("consent requires exact fields, true public_story, explicit optional booleans, and known policy", () => {
  for (const bad of [
    null, [], {}, { ...consent(), public_story: false }, { ...consent(), benchmark_aggregation: "false" },
    { ...consent(), policy_version: "future" }, { ...consent(), email: "SYNTHETIC" },
    { public_story: true, policy_version: "bl-sharing-0.1" }, { ...consent(), community_learning: undefined },
  ]) assert.throws(() => computePreviewDigest(share(), bad), ContractInputError);
});
test("local evaluation evidence and invalid share claims cannot get a preview digest", () => {
  assert.throws(() => computePreviewDigest(evaluation(), consent()), /invalid_share_candidate/);
  const bad = share(); bad.kpis[0]!.candidate_index = 120;
  assert.throws(() => computePreviewDigest(bad, consent()), /invalid_share_candidate/);
});
