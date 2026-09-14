import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalize, parseJson, ContractInputError } from "../packages/contracts/src/index.js";
import { evaluation, share } from "./cases.js";

test("strict parsing preserves JSON values", () => {
  for (const input of [share(), evaluation(), null, [], true, -0, 1e27, { "__proto__": null }, ['"\\\r\n', "🧪", "é"]]) {
    const text = JSON.stringify(input);
    assert.equal(canonicalize(parseJson(text)), canonicalize(input));
  }
  assert.equal(canonicalize(parseJson(' \r\n\t{ "a": 1 } ')), '{"a":1}');
});
for (const invalid of [
  "", "{", "undefined", "[1,]", '{"a":1,}', '{"a":1,"a":2}',
  '{"nested":{"a":1,"\\u0061":2}}', '{"a":1} true', "01", "+1", ".5", "1.",
  "1e", "NaN", "Infinity", "1e999", '"\\ud800"', '"\\uZZZZ"', '"\n"', "\u00a0null",
]) test(`strict parsing rejects malformed case ${JSON.stringify(invalid)}`, () => assert.throws(() => parseJson(invalid), ContractInputError));
test("strict parsing preserves prototype-related keys without pollution", () => {
  const value = parseJson('{"__proto__":{"polluted":true},"constructor":1}');
  assert.equal(canonicalize(value), '{"__proto__":{"polluted":true},"constructor":1}');
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
