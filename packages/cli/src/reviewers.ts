import { execFile } from "node:child_process";
import { isAbsolute } from "node:path";
import { parseJson } from "@better-loop/contracts";
import type { SemanticReviewer } from "@better-loop/privacy";
import type { ContributionReviewer } from "@better-loop/evidence";

/** Configuration is selected separately by the operator; it never comes from candidate strings. */
function commands(input: unknown) {
  if (!Array.isArray(input) || input.length !== 2) throw new Error("two_explicit_reviewer_commands_required");
  const ids = new Set<string>();
  return input.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).sort().join(",") !== "args,command,id") throw new Error("invalid_reviewer_configuration");
    const { id, command, args } = entry as Record<string, unknown>;
    if (typeof id !== "string" || !/^[a-z][a-z0-9_-]{0,39}$/.test(id) || ids.has(id) ||
        typeof command !== "string" || !isAbsolute(command) || command.includes("\0") ||
        !Array.isArray(args) || args.length > 32 || args.some(arg => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"))) {
      throw new Error("invalid_reviewer_configuration");
    }
    ids.add(id);
    return { id, command, args: args as string[] };
  });
}
function reviewCommand(
  command: string, args: string[], timeoutMs: number, request: { signal: AbortSignal; policy_version: string; instructions: string },
  selection: object,
) {
        return new Promise((resolve, reject) => {
          const child = execFile(command, args, {
            shell: false, encoding: "utf8", maxBuffer: 65536, timeout: timeoutMs,
            signal: request.signal, windowsHide: true,
          }, (error, stdout) => {
            if (error) { reject(new Error("configured_reviewer_unavailable")); return; }
            try { resolve(parseJson(stdout)); } catch { reject(new Error("invalid_reviewer_output")); }
          });
          child.stdin?.on("error", () => reject(new Error("configured_reviewer_unavailable")));
          child.stdin?.end(JSON.stringify({
            policy_version: request.policy_version, instructions: request.instructions, ...selection,
          }));
        });
}
export function configuredReviewers(input: unknown, timeoutMs: number): SemanticReviewer[] {
  return commands(input).map(({ id, command, args }) => ({
    id, review: request => reviewCommand(command, args, timeoutMs, request, { candidate: request.candidate }),
  }));
}
export function configuredContributionReviewers(input: unknown, timeoutMs: number): ContributionReviewer[] {
  return commands(input).map(({ id, command, args }) => ({
    id, review: request => reviewCommand(command, args, timeoutMs, request, { contribution: request.contribution }),
  }));
}
