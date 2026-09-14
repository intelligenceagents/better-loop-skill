export { canonicalize, ContractInputError } from "./canonicalize.js";
export type { JsonValue } from "./canonicalize.js";
export { parseJson } from "./parse-json.js";
export { validateShareCandidate, validateEvaluationRun } from "./validation.js";
export type { ShareCandidate, EvaluationRun, ValidationResult, ValidationIssue } from "./validation.js";
export { computePreviewDigest, SHARING_POLICY_VERSION } from "./digest.js";
export type { PreviewConsent } from "./digest.js";
export const SCHEMA_VERSION = "0.1.0" as const;
export const CONTRACT_PACKAGE_VERSION = "0.1.0-draft.1" as const;
