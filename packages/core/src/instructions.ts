import { createHash } from "node:crypto";

export interface InstructionPlan {
  schema_version: "bl-instruction-plan-0.2";
  relative_path: string;
  before: string | null;
  after: string;
  before_sha256: string | null;
  after_sha256: string;
  approval_digest: string;
  diff: string;
}
export const hashText = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
export function assertInstructionPath(path: string): void {
  if (typeof path !== "string" || path.length > 240 ||
      !/^(?:(?:AGENTS|CLAUDE)\.md|(?:\.agents\/skills|\.claude\/skills|skills)\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\/SKILL\.md)$/.test(path)) {
    throw new Error("instruction_path_outside_allowed_scope");
  }
}
function validText(text: string) {
  return typeof text === "string" && Buffer.byteLength(text, "utf8") <= 262144 &&
    Buffer.from(text, "utf8").toString("utf8") === text && !text.includes("\0");
}
function diffText(path: string, before: string | null, after: string): string {
  const lines = (text: string): string[] => text === "" ? [] : text.split("\n").slice(0, text.endsWith("\n") ? -1 : undefined);
  const oldLines = lines(before ?? "");
  const newLines = lines(after);
  return [
    `--- ${before === null ? "/dev/null" : `a/${path}`}`, `+++ b/${path}`,
    `@@ -${oldLines.length ? 1 : 0},${oldLines.length} +${newLines.length ? 1 : 0},${newLines.length} @@`,
    ...oldLines.map(line => `-${line}`),
    ...((before && !before.endsWith("\n")) ? ["\\ No newline at end of file"] : []),
    ...newLines.map(line => `+${line}`),
    ...(after && !after.endsWith("\n") ? ["\\ No newline at end of file"] : []), "",
  ].join("\n");
}
export function createInstructionPlan(relativePath: string, before: string | null, after: string): InstructionPlan {
  assertInstructionPath(relativePath);
  if ((before !== null && !validText(before)) || !validText(after) || before === after) throw new Error("invalid_instruction_change");
  const fields = {
    schema_version: "bl-instruction-plan-0.2" as const, relative_path: relativePath, before, after,
    before_sha256: before === null ? null : hashText(before), after_sha256: hashText(after),
  };
  return { ...fields, approval_digest: hashText(JSON.stringify(fields)), diff: diffText(relativePath, before, after) };
}
export function validateInstructionPlan(input: unknown): InstructionPlan {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_instruction_plan");
  const object = input as Record<string, unknown>;
  const keys = ["schema_version", "relative_path", "before", "after", "before_sha256", "after_sha256", "approval_digest", "diff"];
  if (Object.keys(object).length !== keys.length || keys.some(key => !Object.hasOwn(object, key))) throw new Error("invalid_instruction_plan");
  const expected = createInstructionPlan(object.relative_path as string, object.before as string | null, object.after as string);
  if (keys.some(key => object[key] !== expected[key as keyof InstructionPlan])) throw new Error("instruction_plan_integrity_failed");
  return expected;
}
