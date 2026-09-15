import type { PairQualityScores, QualityAssessment, QualityRule, QualityScores } from "./types.js";
import { fail, numeric, object, snapshot, text } from "./guards.js";

export function validateQualityRule(input: QualityRule): QualityRule {
  const rule = snapshot(input);
  object(rule, ["version", "dimensions"], "invalid_quality_rule");
  text(rule.version, "invalid_quality_rule");
  if (!Array.isArray(rule.dimensions) || !rule.dimensions.length || rule.dimensions.length > 30) fail("invalid_quality_rule");
  const ids = new Set<string>();
  for (const dimension of rule.dimensions) {
    object(dimension, ["id", "minimum", "maximum", "floor", "max_regression"], "invalid_quality_dimension");
    text(dimension.id, "invalid_quality_dimension");
    if (ids.has(dimension.id)) fail("duplicate_quality_dimension");
    ids.add(dimension.id);
    for (const value of [dimension.minimum, dimension.maximum, dimension.floor, dimension.max_regression]) numeric(value, "invalid_quality_dimension");
    if (dimension.minimum === null || dimension.maximum === null || dimension.floor === null ||
        dimension.minimum >= dimension.maximum || dimension.floor < dimension.minimum || dimension.floor > dimension.maximum) fail("invalid_quality_dimension");
  }
  return rule;
}

/** A prespecified higher-is-better rubric; raw expectations can be scored 0/1. */
export function evaluateQuality(inputRule: QualityRule, inputScores: PairQualityScores): QualityAssessment {
  const rule = validateQualityRule(inputRule);
  const scores = snapshot(inputScores);
  object(scores, ["baseline", "candidate"], "invalid_quality_scores");
  const keys = rule.dimensions.map(dimension => dimension.id);
  for (const side of [scores.baseline, scores.candidate]) {
    object(side, keys, "quality_dimension_mismatch");
    for (const dimension of rule.dimensions) {
      const value = side[dimension.id];
      numeric(value, "invalid_quality_score");
      if (value !== null && (value < dimension.minimum || value > dimension.maximum)) fail("quality_score_out_of_bounds");
    }
  }
  function floor(side: QualityScores): boolean | null {
    if (rule.dimensions.some(dimension => side[dimension.id] !== null && side[dimension.id]! < dimension.floor)) return false;
    return rule.dimensions.some(dimension => side[dimension.id] === null) ? null : true;
  }
  let unknown = false;
  let regression = false;
  for (const dimension of rule.dimensions) {
    if (dimension.max_regression === null) continue;
    const b = scores.baseline[dimension.id]!;
    const c = scores.candidate[dimension.id]!;
    if (b === null || c === null) unknown = true;
    else if (b - c > dimension.max_regression) regression = true;
  }
  const result: QualityAssessment = {
    baseline_floor_passed: floor(scores.baseline), quality_floor_passed: floor(scores.candidate),
    critical_regression: regression ? true : unknown ? null : false, reasons: [],
  };
  if (result.quality_floor_passed === false) result.reasons.push("quality_floor_not_met");
  if (result.quality_floor_passed === null) result.reasons.push("quality_floor_unknown");
  if (result.critical_regression === true) result.reasons.push("critical_quality_regression");
  if (result.critical_regression === null) result.reasons.push("critical_quality_regression_unknown");
  return result;
}
