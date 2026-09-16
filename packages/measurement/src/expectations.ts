import { parseJson } from "@better-loop/contracts";
import { equal, fail, object, snapshot, text } from "./guards.js";

export type Expectation =
  | { id: string; kind: "text_includes" | "text_excludes"; value: string }
  | { id: string; kind: "json_equals"; pointer: string; value: unknown };
export interface ExpectationGrade {
  checks: { id: string; passed: boolean | null }[];
  all_passed: boolean | null;
}

function pointerValue(input: unknown, pointer: string): { found: boolean; value: unknown } {
  if (pointer === "") return { found: true, value: input };
  if (!pointer.startsWith("/") || /~(?:[^01]|$)/.test(pointer)) fail("invalid_json_pointer");
  let value = input;
  for (const encoded of pointer.slice(1).split("/")) {
    const key = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return { found: false, value: null };
    value = (value as Record<string, unknown>)[key];
  }
  return { found: true, value };
}

/** Literal matching and strict JSON equality only. No evaluation of output, regex, shell, or instructions. */
export function gradeExpectations(output: string | null, input: readonly Expectation[]): ExpectationGrade {
  const expectations = snapshot(input);
  if (!Array.isArray(expectations) || expectations.length < 1 || expectations.length > 100) fail("invalid_expectations");
  if (output !== null && (typeof output !== "string" || new TextEncoder().encode(output).byteLength > 1_048_576)) fail("invalid_expectation_output");
  const ids = new Set<string>();
  const checks = expectations.map(expectation => {
    if (!expectation || !["text_includes", "text_excludes", "json_equals"].includes(expectation.kind)) fail("invalid_expectation");
    object(expectation, expectation.kind === "json_equals" ? ["id", "kind", "pointer", "value"] : ["id", "kind", "value"], "invalid_expectation");
    text(expectation.id, "invalid_expectation");
    if (ids.has(expectation.id)) fail("duplicate_expectation");
    ids.add(expectation.id);
    if (expectation.kind !== "json_equals") {
      text(expectation.value, "invalid_expectation");
      const present = output === null ? null : output.includes(expectation.value);
      return { id: expectation.id, passed: present === null ? null : expectation.kind === "text_includes" ? present : !present };
    }
    if (typeof expectation.pointer !== "string" || expectation.pointer.length > 1000) fail("invalid_json_pointer");
    // Validate pointer even when there is no output or JSON parsing fails.
    pointerValue({}, expectation.pointer);
    if (output === null) return { id: expectation.id, passed: null };
    try {
      const actual = pointerValue(parseJson(output), expectation.pointer);
      return { id: expectation.id, passed: actual.found && equal(actual.value, expectation.value) };
    } catch { return { id: expectation.id, passed: false }; }
  });
  return {
    checks, all_passed: checks.some(check => check.passed === false) ? false :
      checks.some(check => check.passed === null) ? null : true,
  };
}

export type BlindAssignment = "baseline_as_A" | "candidate_as_A";
export type BlindVerdict = "A" | "B" | "tie" | "inconclusive";

/** Balanced deterministic assignment for a registered seed; retain mapping outside the judge packet. */
export function counterbalancedAssignments(pairIds: readonly string[], seed: number): { pair_id: string; assignment: BlindAssignment }[] {
  if (!Array.isArray(pairIds) || !pairIds.length || pairIds.length > 1000 ||
      new Set(pairIds).size !== pairIds.length || !Number.isSafeInteger(seed)) fail("invalid_assignment_plan");
  pairIds.forEach(id => text(id, "invalid_assignment_plan"));
  let state = seed >>> 0 || 0x9e3779b9;
  function random(): number {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  }
  const shuffled = [...pairIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const flip = random() < 0.5 ? 0 : 1;
  const map = new Map(shuffled.map((id, index) => [id, (index + flip) % 2 === 0 ? "baseline_as_A" as const : "candidate_as_A" as const]));
  return pairIds.map(pair_id => ({ pair_id, assignment: map.get(pair_id)! }));
}

export function blindComparison(baseline: unknown, candidate: unknown, assignment: BlindAssignment): {
  packet: { label: "A" | "B"; output: unknown }[];
  private_key: { assignment: BlindAssignment };
} {
  if (!["baseline_as_A", "candidate_as_A"].includes(assignment)) fail("invalid_blind_assignment");
  const values = snapshot(assignment === "baseline_as_A" ? [baseline, candidate] : [candidate, baseline]);
  return { packet: [{ label: "A", output: values[0] }, { label: "B", output: values[1] }], private_key: { assignment } };
}
export function resolveBlindVerdict(assignment: BlindAssignment, verdict: BlindVerdict): "baseline" | "candidate" | "tie" | "inconclusive" {
  if (!["baseline_as_A", "candidate_as_A"].includes(assignment) || !["A", "B", "tie", "inconclusive"].includes(verdict)) fail("invalid_blind_verdict");
  if (verdict === "tie" || verdict === "inconclusive") return verdict;
  return (assignment === "baseline_as_A") === (verdict === "A") ? "baseline" : "candidate";
}
