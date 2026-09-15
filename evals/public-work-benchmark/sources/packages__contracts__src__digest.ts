import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { canonicalize, ContractInputError } from "./canonicalize.js";
import { validateShareCandidate } from "./validation.js";

export const SHARING_POLICY_VERSION = "bl-sharing-0.1" as const;
export interface PreviewConsent {
  readonly public_story: true;
  readonly benchmark_aggregation: boolean;
  readonly community_learning: boolean;
  readonly policy_version: typeof SHARING_POLICY_VERSION;
}

/** Hashes a validated candidate and exact purposes; does not approve or transmit. */
export function computePreviewDigest(candidate: unknown, consent: unknown): string {
  const checked = validateShareCandidate(candidate);
  if (!checked.valid) throw new ContractInputError("invalid_share_candidate");
  const copy: unknown = JSON.parse(canonicalize(consent));
  if (copy === null || typeof copy !== "object" || Array.isArray(copy)) {
    throw new ContractInputError("invalid_consent");
  }
  const fields = copy as Record<string, unknown>;
  if (Object.keys(fields).sort().join(",") !== "benchmark_aggregation,community_learning,policy_version,public_story" ||
      fields.public_story !== true ||
      typeof fields.benchmark_aggregation !== "boolean" ||
      typeof fields.community_learning !== "boolean" ||
      fields.policy_version !== SHARING_POLICY_VERSION) {
    throw new ContractInputError("invalid_consent");
  }
  const bytes = new TextEncoder().encode(canonicalize({ candidate: checked.data, consent: fields }));
  return bytesToHex(sha256(bytes));
}
