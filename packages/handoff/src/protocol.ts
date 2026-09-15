import { canonicalize } from "@better-loop/contracts";
import { validateContributionApproval, type ContributionApproval } from "@better-loop/evidence";

export const HANDOFF_PROTOCOL = "bl-handoff-0.1" as const;
export const MAX_HANDOFF_BYTES = 32_768;
export const MAX_TTL_MS = 300_000;
export const DEFAULT_TTL_MS = 120_000;
export const TARGET_ORIGINS = ["https://better-loop.com", "http://127.0.0.1:3100"] as const;

export type HandoffMessage =
  | { protocol: typeof HANDOFF_PROTOCOL; type: "ready"; nonce: string }
  | { protocol: typeof HANDOFF_PROTOCOL; type: "payload"; nonce: string; expires_at: number; approval: ContributionApproval }
  | { protocol: typeof HANDOFF_PROTOCOL; type: "ack"; nonce: string; digest: string };

const encoder = new TextEncoder();
export function isNonce(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}
export function isTargetOrigin(value: unknown): value is string {
  return typeof value === "string" && TARGET_ORIGINS.some(origin => origin === value);
}
export function isLoopbackOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === value && url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      url.username === "" && url.password === "" && /^[1-9]\d{0,4}$/.test(url.port) &&
      Number(url.port) <= 65_535;
  } catch { return false; }
}
export function snapshotApproval(input: unknown): ContributionApproval | null {
  try {
    const encoded = canonicalize(input);
    if (encoder.encode(encoded).byteLength > MAX_HANDOFF_BYTES) return null;
    const result = validateContributionApproval(JSON.parse(encoded));
    return result.valid ? result.data : null;
  } catch { return null; }
}
export function parseMessage(input: unknown): HandoffMessage | null {
  try {
    const encoded = canonicalize(input);
    if (encoder.encode(encoded).byteLength > MAX_HANDOFF_BYTES) return null;
    const value: unknown = JSON.parse(encoded);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (record.protocol !== HANDOFF_PROTOCOL || !isNonce(record.nonce)) return null;
    const keys = Object.keys(record).sort().join(",");
    if (record.type === "ready" && keys === "nonce,protocol,type") return record as HandoffMessage;
    if (record.type === "ack" && keys === "digest,nonce,protocol,type" &&
        typeof record.digest === "string" && /^[a-f0-9]{64}$/.test(record.digest))
      return record as HandoffMessage;
    if (record.type === "payload" && keys === "approval,expires_at,nonce,protocol,type" &&
        Number.isSafeInteger(record.expires_at) && (record.expires_at as number) > 0) {
      const approval = snapshotApproval(record.approval);
      if (approval) return {
        protocol: HANDOFF_PROTOCOL, type: "payload", nonce: record.nonce,
        expires_at: record.expires_at as number, approval,
      };
    }
  } catch { /* Message content is untrusted; do not expose it through errors. */ }
  return null;
}
