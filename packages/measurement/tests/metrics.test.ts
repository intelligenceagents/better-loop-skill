import assert from "node:assert/strict";
import test from "node:test";
import { measurePair, pairedUncertainty } from "../src/index.js";

test("direction-aware absolute, relative, percentage-point and rounded index arithmetic", () => {
  const reduction = measurePair(200, 150, "lower_is_better");
  assert.equal(reduction.absolute_change, -50);
  assert.equal(reduction.favorable_absolute_change, 50);
  assert.equal(reduction.relative_change_percent, 25);
  assert.equal(reduction.candidate_index, 75);
  const increase = measurePair(0.5, 0.6, "higher_is_better", "proportion");
  assert.ok(Math.abs(increase.relative_change_percent! - 20) < 1e-10);
  assert.ok(Math.abs(increase.percentage_point_change! - 10) < 1e-10);
  assert.equal(measurePair(50, 60, "higher_is_better", "percent").percentage_point_change, 10);
  assert.equal(measurePair(100, 77.7, "lower_is_better").candidate_index, 80);
  assert.equal(measurePair(100, 99, "lower_is_better").candidate_index, 100);
  assert.equal(measurePair(100, 0, "lower_is_better").relative_change_percent, 100);
});
for (const [baseline, candidate] of [[null, null], [null, 0], [0, null], [1, null]] as const) {
  test(`missing ${baseline}/${candidate} stays missing`, () => {
    const result = measurePair(baseline, candidate, "lower_is_better");
    assert.equal(result.reason, "missing_value");
    assert.equal(result.absolute_change, null);
    assert.equal(result.relative_change_percent, null);
    assert.equal(result.candidate_index, null);
  });
}
test("baseline zero retains absolute change but cannot emit relative KPI", () => {
  for (const candidate of [0, 1, 100]) {
    const result = measurePair(0, candidate, "higher_is_better");
    assert.equal(result.absolute_change, candidate);
    assert.equal(result.relative_change_percent, null);
    assert.equal(result.reason, "zero_baseline");
    assert.equal(result.baseline_index, null);
  }
});
for (const value of [NaN, Infinity, -Infinity, -1, undefined, "100", true]) {
  test(`invalid metric rejects: ${String(value)}`, () => assert.throws(() =>
    measurePair(value as number, 1, "lower_is_better"), /invalid_metric/));
}
test("overflow remains null; finite representable large ratios do not overflow unnecessarily", () => {
  const overflow = measurePair(Number.MIN_VALUE, Number.MAX_VALUE, "higher_is_better");
  assert.equal(overflow.relative_change_percent, null);
  assert.equal(overflow.reason, "numeric_overflow");
  assert.equal(measurePair(Number.MAX_VALUE, Number.MAX_VALUE / 2, "lower_is_better").relative_change_percent, 50);
});
test("unit ranges and enum values reject", () => {
  assert.throws(() => measurePair(1.1, 1, "higher_is_better", "proportion"), /invalid_proportion/);
  assert.throws(() => measurePair(101, 90, "higher_is_better", "percent"), /invalid_percent/);
  assert.throws(() => measurePair(1, 1, "sideways" as never), /invalid_direction/);
  assert.throws(() => measurePair(1, 1, "higher_is_better", "private-revenue" as never), /invalid_unit/);
});
test("five pairs yield no finite 95% interval despite passing the product pair-count gate", () => {
  const result = pairedUncertainty([30, 20, 25, 25, 25], true);
  assert.equal(result.median_relative_change_percent, 25);
  assert.deepEqual(result.observed_range_percent, [20, 30]);
  assert.equal(result.interval_percent, null);
  assert.match(result.unavailable_reason!, /fewer_than_six/);
});
test("six independent pairs give min/max interval with exact 31/32 coverage", () => {
  const result = pairedUncertainty([6, 1, 3, 4, 2, 5], true);
  assert.deepEqual(result.interval_percent, [1, 6]);
  assert.equal(result.median_relative_change_percent, 3.5);
  assert.equal(result.interval_coverage, 0.96875);
});
test("ten independent pairs choose the narrowest supported exact interval", () => {
  const result = pairedUncertainty([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true);
  assert.deepEqual(result.interval_percent, [2, 9]);
  assert.equal(result.interval_coverage, 1 - 22 / 1024);
});
test("dependence is not silently ignored and missing entries never become zero", () => {
  const result = pairedUncertainty([null, 2, 4, null], true);
  assert.equal(result.observed_pair_count, 2);
  assert.equal(result.median_relative_change_percent, 3);
  assert.equal(pairedUncertainty([1, 2, 3, 4, 5, 6]).interval_percent, null);
  assert.equal(pairedUncertainty([null]).observed_range_percent, null);
});
test("large and tied samples retain finite exact coverage and no false infinite values", () => {
  const result = pairedUncertainty(Array(1000).fill(1) as number[], true);
  assert.deepEqual(result.interval_percent, [1, 1]);
  assert.ok(result.interval_coverage! >= 0.95);
  assert.throws(() => pairedUncertainty([NaN]), /invalid_delta/);
  assert.throws(() => pairedUncertainty(Array(1001).fill(1) as number[]), /too_many_pairs/);
});
