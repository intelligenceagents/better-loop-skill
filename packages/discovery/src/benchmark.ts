import { parseJson } from "@better-loop/contracts";
import { exact, oneOf, snapshot, uniqueValues } from "./input.js";
import { FROZEN_REGISTRATION, FROZEN_RUBRIC, FREEZE_SHA256 } from "./frozen-benchmark.js";
import { PUBLIC_RESULTS_SHA256, PUBLIC_RESULTS_SUMMARY } from "./benchmark-results.js";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
/** Metadata only. A known ID is not completion, independent verification or model execution. */
export const PUBLIC_APPROVAL_BINDING_BENCHMARK = deepFreeze({
  ...FROZEN_REGISTRATION,
  freeze_sha256: FREEZE_SHA256,
  freeze_git_commit: "0aab3f442e48e9a705575bfa5b2283349781b2cb",
});
/** Subsequent actual execution evidence. The original preregistration stays historical and unchanged. */
export const PUBLIC_APPROVAL_BINDING_RESULTS = deepFreeze({
  ...PUBLIC_RESULTS_SUMMARY,
  results_sha256: PUBLIC_RESULTS_SHA256,
});
export const APPROVAL_BINDING_CASE_IDS = Object.freeze(FROZEN_RUBRIC.checks.map(check => check.id));
export const APPROVAL_BINDING_REASONS = Object.freeze([...new Set(FROZEN_RUBRIC.checks.map(check => check.reason))]);
export const APPROVAL_BINDING_LIMITS = Object.freeze([...FROZEN_RUBRIC.required_limits]);
export interface ApprovalBindingAnswer {
  schema_version: "bl-approval-binding-answer-0.1";
  benchmark_id: "bl-public-approval-binding";
  benchmark_version: "0.1";
  cases: Array<{ id: typeof APPROVAL_BINDING_CASE_IDS[number]; decision: "accept" | "reject"; reason: typeof APPROVAL_BINDING_REASONS[number] }>;
  limits: typeof APPROVAL_BINDING_LIMITS[number][];
}
export interface ApprovalBindingJudgment {
  benchmark_id: "bl-public-approval-binding";
  benchmark_version: "0.1";
  judge_version: "bl-approval-binding-judge-0.1";
  format_valid: boolean;
  result: "met" | "not_met" | "incomplete";
  coverage: { expected_cases: 12; supplied_cases: number; missing_cases: string[] };
  checks: Array<{ id: string; status: "passed" | "failed" | "missing" }>;
  limit_checks: Array<{ id: string; status: "passed" | "missing" }>;
  limitations: string[];
}
export function judgeApprovalBindingOutput(output: unknown): ApprovalBindingJudgment {
  const base: ApprovalBindingJudgment = {
    benchmark_id: "bl-public-approval-binding", benchmark_version: "0.1", judge_version: "bl-approval-binding-judge-0.1",
    format_valid: false, result: "incomplete",
    coverage: { expected_cases: 12, supplied_cases: 0, missing_cases: [...APPROVAL_BINDING_CASE_IDS] },
    checks: APPROVAL_BINDING_CASE_IDS.map(id => ({ id, status: "missing" })),
    limit_checks: APPROVAL_BINDING_LIMITS.map(id => ({ id, status: "missing" })),
    limitations: [
      "Only frozen structured decisions on twelve public-source cases are checked; missing coverage is not a zero ability score.",
      "No code, model, service, publication or side-effecting task was executed by this judge.",
      "Task reasoning prose, other domains, unaided human judgment and hiring validity are not evaluated.",
      "Public source/rubric contamination is possible. Test fixture success is not model benchmark evidence or improvement.",
    ],
  };
  try {
    if (typeof output === "string" && new TextEncoder().encode(output).byteLength > 8_192) return base;
    const value = snapshot(typeof output === "string" ? parseJson(output) : output, 8_192);
    if (!exact(value, ["schema_version", "benchmark_id", "benchmark_version", "cases", "limits"]) ||
        value.schema_version !== "bl-approval-binding-answer-0.1" || value.benchmark_id !== "bl-public-approval-binding" ||
        value.benchmark_version !== "0.1" || !Array.isArray(value.cases) || value.cases.length > 12 ||
        !uniqueValues(value.limits, APPROVAL_BINDING_LIMITS)) return base;
    const cases = new Map<string, ApprovalBindingAnswer["cases"][number]>();
    for (const item of value.cases) {
      if (!exact(item, ["id", "decision", "reason"]) || !oneOf(item.id, APPROVAL_BINDING_CASE_IDS) ||
          !oneOf(item.decision, ["accept", "reject"]) || !oneOf(item.reason, APPROVAL_BINDING_REASONS) ||
          cases.has(item.id as string)) return base;
      cases.set(item.id as string, item as unknown as ApprovalBindingAnswer["cases"][number]);
    }
    const checks = FROZEN_RUBRIC.checks.map(expected => {
      const actual = cases.get(expected.id);
      return { id: expected.id, status: !actual ? "missing" as const :
        actual.decision === expected.decision && actual.reason === expected.reason ? "passed" as const : "failed" as const };
    });
    const limitChecks = APPROVAL_BINDING_LIMITS.map(id => ({
      id, status: (value.limits as string[]).includes(id) ? "passed" as const : "missing" as const,
    }));
    const missing = checks.filter(check => check.status === "missing").map(check => check.id);
    return {
      ...base, format_valid: true,
      result: missing.length || limitChecks.some(check => check.status === "missing") ? "incomplete" :
        checks.every(check => check.status === "passed") ? "met" : "not_met",
      coverage: { expected_cases: 12, supplied_cases: cases.size, missing_cases: missing },
      checks, limit_checks: limitChecks,
    };
  } catch { return base; }
}
