import type { Direction, MetricUnit, PairDelta, Uncertainty } from "./types.js";
import { fail, finite, mean, numeric } from "./guards.js";

/** Positive relative change means favorable; absolute/percentage-point change means candidate minus baseline. */
export function measurePair(
  baseline: number | null, candidate: number | null, direction: Direction, unit: MetricUnit = "count",
): PairDelta {
  numeric(baseline, "invalid_metric"); numeric(candidate, "invalid_metric");
  if (!["lower_is_better", "higher_is_better"].includes(direction)) fail("invalid_direction");
  if (!["count", "seconds", "USD", "index", "percent", "proportion"].includes(unit)) fail("invalid_unit");
  if (unit === "proportion" && ((baseline ?? 0) > 1 || (candidate ?? 0) > 1)) fail("invalid_proportion");
  if (unit === "percent" && ((baseline ?? 0) > 100 || (candidate ?? 0) > 100)) fail("invalid_percent");
  const result: PairDelta = {
    baseline, candidate, absolute_change: null, favorable_absolute_change: null,
    relative_change_percent: null, percentage_point_change: null,
    baseline_index: null, candidate_index: null, index_rounding: "nearest_5_points", reason: null,
  };
  if (baseline === null || candidate === null) return { ...result, reason: "missing_value" };
  result.absolute_change = finite(candidate - baseline);
  result.favorable_absolute_change = finite((direction === "lower_is_better" ? -1 : 1) * (candidate - baseline));
  result.percentage_point_change = unit === "percent" ? result.absolute_change :
    unit === "proportion" ? finite((candidate - baseline) * 100) : null;
  if (baseline === 0) return { ...result, reason: "zero_baseline" };
  // Division before multiplication avoids unnecessary intermediate overflow.
  result.relative_change_percent = finite(((direction === "lower_is_better" ? baseline - candidate : candidate - baseline) / baseline) * 100);
  const index = finite((candidate / baseline) * 100);
  result.candidate_index = index === null ? null : finite(Math.round(index / 5) * 5);
  result.baseline_index = result.candidate_index === null ? null : 100;
  if (result.absolute_change === null || result.relative_change_percent === null || result.candidate_index === null) {
    result.reason = "numeric_overflow";
  }
  return result;
}

/**
 * Distribution-free two-sided median interval from order statistics.
 * For k discarded observations per tail, coverage = 1 - 2 P(Bin(n,.5) <= k).
 * No finite 95% interval exists with fewer than six independent pairs.
 */
export function pairedUncertainty(values: readonly (number | null)[], independentPairs = false): Uncertainty {
  if (!Array.isArray(values) || typeof independentPairs !== "boolean") fail("invalid_uncertainty_input");
  values.forEach(value => { if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) fail("invalid_delta"); });
  const sorted = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  const n = sorted.length;
  if (n > 1000) fail("too_many_pairs");
  const midpoint = Math.floor(n / 2);
  const result: Uncertainty = {
    method: "exact_sign_median_interval", confidence_level: 0.95, observed_pair_count: n,
    median_relative_change_percent: n === 0 ? null : n % 2 ? sorted[midpoint]! : mean([sorted[midpoint - 1]!, sorted[midpoint]!]),
    observed_range_percent: n === 0 ? null : [sorted[0]!, sorted[n - 1]!],
    interval_percent: null, interval_coverage: null,
    unavailable_reason: null,
    assumptions: [
      "Independent pairs sampled from one stable task/condition distribution; caller assertion is not statistical verification.",
      "Interval concerns the population median paired relative change, not a mean, a person, or causal efficacy.",
      "Observed range is descriptive. Missing/failed pairs remain excluded from numerical intervals and block eligibility.",
      "Discrete/tied outcomes can make coverage conservative; repeated task/model dependence can invalidate the interval.",
    ],
  };
  if (!independentPairs) return { ...result, unavailable_reason: "independent_pairs_not_established" };
  if (n < 6) return { ...result, unavailable_reason: "fewer_than_six_observed_pairs_no_finite_95_percent_interval" };
  let probability = Math.pow(0.5, n);
  let cumulative = 0;
  let selected = -1;
  let coverage = 0;
  for (let k = 0; k < n / 2; k++) {
    cumulative += probability;
    const candidateCoverage = 1 - 2 * cumulative;
    if (candidateCoverage < 0.95) break;
    selected = k; coverage = candidateCoverage;
    probability *= (n - k) / (k + 1);
  }
  if (selected >= 0) {
    result.interval_percent = [sorted[selected]!, sorted[n - selected - 1]!];
    result.interval_coverage = coverage;
  }
  return result;
}
