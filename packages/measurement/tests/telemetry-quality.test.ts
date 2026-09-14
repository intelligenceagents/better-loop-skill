import assert from "node:assert/strict";
import test from "node:test";
import { accountTelemetry, evaluateQuality, TELEMETRY_ROLES } from "../src/index.js";
import { entry, ledger, qualityRule } from "./fixtures.js";

test("inclusive cached inputs count once and cash billing stays separate from estimates", () => {
  const input = ledger();
  Object.assign(input.entries[0]!, { input_tokens: 800, output_tokens: 200, cache_read_tokens: 300, cache_write_tokens: 100,
    actual_billing_usd: 0, estimated_api_cost_usd: 0.04, model_duration_seconds: 10, human_effort_seconds: null });
  const result = accountTelemetry(input);
  assert.equal(result.model_tokens.total, 1000);
  assert.equal(result.cache_read_tokens.total, 300);
  assert.equal(result.actual_billing_usd.total, 0);
  assert.equal(result.estimated_api_cost_usd.total, 0.04);
  assert.equal(result.human_effort_seconds.total, null);
});
test("exclusive cache semantics add cache tokens explicitly", () => {
  const input = ledger();
  Object.assign(input.entries[0]!, { input_token_semantics: "excludes_cache", input_tokens: 400, output_tokens: 100, cache_read_tokens: 300, cache_write_tokens: 200 });
  assert.equal(accountTelemetry(input).model_tokens.total, 1000);
});
test("every disjoint parent/worker/judge/retry/orchestration event contributes to overhead", () => {
  const input = ledger();
  input.coverage = { parent: "complete", worker: "complete", judge: "complete", retry: "complete", orchestration: "complete" };
  input.entries = TELEMETRY_ROLES.map((role, i) => ({ ...entry(100), role, id: `invented-event-${i}`, model_duration_seconds: 2 }));
  const result = accountTelemetry(input);
  assert.equal(result.model_tokens.total, 500);
  assert.equal(result.model_duration_seconds.total, 10);
});
for (const role of TELEMETRY_ROLES) {
  test(`missing ${role} coverage blocks a total while retaining a labeled known subtotal`, () => {
    const input = ledger();
    input.coverage[role] = "missing";
    const result = accountTelemetry(input);
    assert.equal(result.model_tokens.total, null);
    assert.equal(result.model_tokens.known_subtotal, 1000);
    assert.ok(result.reasons.includes(`missing_${role}_coverage`));
  });
}
test("unknown cache semantics cannot masquerade as actual total tokens", () => {
  const input = ledger();
  input.entries[0]!.input_token_semantics = "unknown";
  assert.equal(accountTelemetry(input).model_tokens.total, null);
  input.entries[0]!.input_token_semantics = "includes_cache";
  input.entries[0]!.cache_read_tokens = null;
  assert.equal(accountTelemetry(input).model_tokens.total, 1000);
  assert.equal(accountTelemetry(input).cache_read_tokens.total, null);
  input.entries[0]!.input_token_semantics = "excludes_cache";
  assert.equal(accountTelemetry(input).model_tokens.total, null);
});
test("no events can be a real zero only when every role explicitly did no work", () => {
  const input = ledger();
  input.entries = [];
  input.coverage.parent = "not_applicable";
  assert.equal(accountTelemetry(input).model_tokens.total, 0);
  input.coverage.parent = "complete";
  assert.throws(() => accountTelemetry(input), /without_entries/);
});
test("duplicate usage, contradictory coverage, cache overcounts, and invented token proxies reject", () => {
  const duplicate = ledger(); duplicate.entries.push(structuredClone(duplicate.entries[0]!));
  assert.throws(() => accountTelemetry(duplicate), /duplicate_telemetry_entry/);
  const contradiction = ledger(); contradiction.coverage.parent = "not_applicable";
  assert.throws(() => accountTelemetry(contradiction), /coverage_contradiction/);
  const cache = ledger(); cache.entries[0]!.cache_read_tokens = 10000;
  assert.throws(() => accountTelemetry(cache), /cache_exceeds/);
  const proxy = ledger(); Object.assign(proxy.entries[0]!, { output_characters: 1000 });
  assert.throws(() => accountTelemetry(proxy), /invalid_telemetry_entry/);
});
for (const value of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid actual token count rejects ${String(value)}`, () => {
    const input = ledger(); input.entries[0]!.output_tokens = value;
    assert.throws(() => accountTelemetry(input), /invalid_telemetry_value|invalid_json_value/);
  });
}
test("safe individual token counts cannot create an unsafe total", () => {
  const input = ledger(); input.entries[0]!.input_tokens = Number.MAX_SAFE_INTEGER;
  assert.throws(() => accountTelemetry(input), /telemetry_total_overflow/);
});
test("quality floor and critical regression are separate", () => {
  const rule = structuredClone(qualityRule);
  Object.assign(rule.dimensions[0]!, { maximum: 100, floor: 70, max_regression: 5 });
  const result = evaluateQuality(rule, { baseline: { acceptance: 95 }, candidate: { acceptance: 80 } });
  assert.equal(result.quality_floor_passed, true);
  assert.equal(result.critical_regression, true);
});
test("null quality remains unknown and known failures are never hidden by other missing dimensions", () => {
  assert.equal(evaluateQuality(qualityRule, { baseline: { acceptance: 1 }, candidate: { acceptance: null } }).quality_floor_passed, null);
  assert.equal(evaluateQuality(qualityRule, { baseline: { acceptance: null }, candidate: { acceptance: 1 } }).critical_regression, null);
  const rule = structuredClone(qualityRule);
  rule.dimensions.push({ ...rule.dimensions[0]!, id: "second" });
  const result = evaluateQuality(rule, { baseline: { acceptance: 1, second: 1 }, candidate: { acceptance: 0, second: null } });
  assert.equal(result.quality_floor_passed, false);
  assert.equal(result.critical_regression, true);
});
test("prespecified dimension identifiers, bounds, and floor must be valid", () => {
  assert.throws(() => evaluateQuality(qualityRule, { baseline: {}, candidate: {} }), /dimension_mismatch/);
  assert.throws(() => evaluateQuality(qualityRule, { baseline: { acceptance: 1 }, candidate: { acceptance: 2 } }), /out_of_bounds/);
  const duplicate = structuredClone(qualityRule); duplicate.dimensions.push(structuredClone(duplicate.dimensions[0]!));
  assert.throws(() => evaluateQuality(duplicate, { baseline: {}, candidate: {} }), /duplicate_quality_dimension/);
  const floor = structuredClone(qualityRule); floor.dimensions[0]!.floor = 10;
  assert.throws(() => evaluateQuality(floor, { baseline: {}, candidate: {} }), /invalid_quality_dimension/);
});
