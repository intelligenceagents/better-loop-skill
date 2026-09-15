import type { AccountedValue, TelemetryAccounting, TelemetryEntry, TelemetryLedger } from "./types.js";
import { TELEMETRY_ROLES } from "./types.js";
import { fail, numeric, object, snapshot, text } from "./guards.js";

const quantities = [
  "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens", "model_duration_seconds",
  "human_effort_seconds", "actual_billing_usd", "estimated_api_cost_usd",
] as const;
type Quantity = typeof quantities[number];

function checkedSum(values: readonly number[], integer = false): number {
  const total = values.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || (integer && !Number.isSafeInteger(total))) fail("telemetry_total_overflow");
  return total;
}

/** Entries must be disjoint usage events; never combine a cumulative parent total with its included workers. */
export function accountTelemetry(input: TelemetryLedger): TelemetryAccounting {
  const ledger = snapshot(input);
  object(ledger, ["coverage", "entries"], "invalid_telemetry");
  object(ledger.coverage, TELEMETRY_ROLES, "invalid_telemetry_coverage");
  if (!Array.isArray(ledger.entries) || ledger.entries.length > 10000) fail("invalid_telemetry");
  const ids = new Set<string>();
  for (const role of TELEMETRY_ROLES) {
    if (!["complete", "missing", "not_applicable"].includes(ledger.coverage[role])) fail("invalid_telemetry_coverage");
  }
  for (const entry of ledger.entries) {
    object(entry, ["id", "role", "input_token_semantics", ...quantities], "invalid_telemetry_entry");
    text(entry.id, "invalid_telemetry_entry");
    if (ids.has(entry.id)) fail("duplicate_telemetry_entry");
    ids.add(entry.id);
    if (!TELEMETRY_ROLES.includes(entry.role) ||
        !["includes_cache", "excludes_cache", "unknown"].includes(entry.input_token_semantics)) fail("invalid_telemetry_entry");
    for (const key of quantities) numeric(entry[key], "invalid_telemetry_value", key.endsWith("_tokens"));
    if (entry.input_token_semantics === "includes_cache" && entry.input_tokens !== null &&
        (entry.cache_read_tokens !== null || entry.cache_write_tokens !== null) &&
        (entry.cache_read_tokens ?? 0) + (entry.cache_write_tokens ?? 0) > entry.input_tokens) fail("cache_exceeds_inclusive_input");
  }
  for (const role of TELEMETRY_ROLES) {
    const entries = ledger.entries.filter(entry => entry.role === role);
    if (ledger.coverage[role] === "not_applicable" && entries.length) fail("telemetry_coverage_contradiction");
    if (ledger.coverage[role] === "complete" && !entries.length) fail("telemetry_complete_role_without_entries");
  }
  const coverageComplete = TELEMETRY_ROLES.every(role => ledger.coverage[role] !== "missing");
  function account(values: readonly (number | null)[], integer = false): AccountedValue {
    const known = values.filter((value): value is number => value !== null);
    const known_subtotal = checkedSum(known, integer);
    const complete = coverageComplete && known.length === values.length;
    return { total: complete ? known_subtotal : null, known_subtotal, complete };
  }
  function tokens(entry: TelemetryEntry): number | null {
    if (entry.input_tokens === null || entry.output_tokens === null || entry.input_token_semantics === "unknown") return null;
    if (entry.input_token_semantics === "includes_cache") return checkedSum([entry.input_tokens, entry.output_tokens], true);
    if (entry.cache_read_tokens === null || entry.cache_write_tokens === null) return null;
    return checkedSum([entry.input_tokens, entry.output_tokens, entry.cache_read_tokens, entry.cache_write_tokens], true);
  }
  const quantity = (key: Quantity): AccountedValue => account(ledger.entries.map(entry => entry[key]), key.endsWith("_tokens"));
  const result: TelemetryAccounting = {
    model_tokens: account(ledger.entries.map(tokens), true),
    cache_read_tokens: quantity("cache_read_tokens"), cache_write_tokens: quantity("cache_write_tokens"),
    model_duration_seconds: quantity("model_duration_seconds"), human_effort_seconds: quantity("human_effort_seconds"),
    actual_billing_usd: quantity("actual_billing_usd"), estimated_api_cost_usd: quantity("estimated_api_cost_usd"),
    reasons: [],
  };
  for (const role of TELEMETRY_ROLES) if (ledger.coverage[role] === "missing") result.reasons.push(`missing_${role}_coverage`);
  if (ledger.entries.some(entry => entry.input_token_semantics === "unknown")) result.reasons.push("unknown_cache_inclusion");
  for (const key of ["model_tokens", "cache_read_tokens", "cache_write_tokens", "model_duration_seconds",
    "human_effort_seconds", "actual_billing_usd", "estimated_api_cost_usd"] as const) {
    if (!result[key].complete) result.reasons.push(`${key}_incomplete`);
  }
  return result;
}
