import { canonicalize } from "@better-loop/contracts";

export class MeasurementInputError extends Error {
  constructor(readonly code: string) { super(code); this.name = "MeasurementInputError"; }
}
export function fail(code: string): never { throw new MeasurementInputError(code); }
export function snapshot<T>(value: T): T {
  try { return JSON.parse(canonicalize(value)) as T; }
  catch { return fail("invalid_json_value"); }
}
export function object(value: unknown, keys: readonly string[], code: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(code);
}
export function text(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 1000) fail(code);
}
export function numeric(value: unknown, code: string, integer = false): asserts value is number | null {
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      (integer && !Number.isSafeInteger(value)))) fail(code);
}
export function timestamp(value: unknown): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) fail("invalid_timestamp");
  const year = Number(value.slice(0, 4)); const month = Number(value.slice(5, 7)); const day = Number(value.slice(8, 10));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (maxDay === undefined || day < 1 || day > maxDay) fail("invalid_timestamp");
  const result = Date.parse(value);
  if (!Number.isFinite(result)) fail("invalid_timestamp");
  return result;
}
export function finite(value: number): number | null { return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : null; }
export function mean(values: readonly number[]): number | null {
  if (!values.length) return null;
  // Divide first to avoid a sum overflow when the finite mean is representable.
  return finite(values.reduce((total, value) => total + value / values.length, 0));
}
export function equal(a: unknown, b: unknown): boolean { return canonicalize(a) === canonicalize(b); }
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
