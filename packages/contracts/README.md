# @better-loop/contracts

Version `0.1.0-draft.1` implements the unchanged Better Loop draft schemas `0.1.0`. This package is a local validation and serialization foundation. It cannot establish confidentiality, narrative truth, authorship, consent, or efficacy. It performs no network operations. Local evaluation records must never be submitted to the public service.

This prerelease has not been published to npm. Obtain a reviewed archive, then pin that file in your consumer and commit the consumer lockfile:

```sh
npm install --save-exact ./vendor/better-loop-contracts-0.1.0-draft.1.tgz
```

The archive includes both schemas, TypeScript declarations, an ESM/browser entry, a CommonJS entry, a Node CLI, licenses, and bundled runtime code. No sibling checkout or build tool is needed at runtime. Node 22+ is supported. Modern browsers need `TextEncoder`, `Object.hasOwn`, and ES2022 support.

## API

```ts
import {
  validateShareCandidate, validateEvaluationRun,
  canonicalize, computePreviewDigest, parseJson,
  SHARING_POLICY_VERSION,
} from "@better-loop/contracts";
import type {
  ShareCandidate, EvaluationRun, ValidationResult, PreviewConsent,
} from "@better-loop/contracts";

const result = validateShareCandidate(parseJson(selectedJsonText));
if (result.valid) {
  const consent: PreviewConsent = {
    public_story: true,
    benchmark_aggregation: false,
    community_learning: false,
    policy_version: SHARING_POLICY_VERSION,
  };
  const digest = computePreviewDigest(result.data, consent);
  // A digest identifies content. It grants no permission to upload it.
}
```

All functions are synchronous:

```ts
type ValidationIssue = { readonly path: string; readonly code: string };
type ValidationResult<T> =
  | { readonly valid: true; readonly data: T; readonly errors: readonly [] }
  | { readonly valid: false; readonly errors: readonly ValidationIssue[] };

validateShareCandidate(input: unknown): ValidationResult<ShareCandidate>;
validateEvaluationRun(input: unknown): ValidationResult<EvaluationRun>;
canonicalize(input: unknown): string;
computePreviewDigest(candidate: unknown, consent: unknown): string;
parseJson(text: string): JsonValue;
```

Validation never mutates input. Success returns a detached JSON snapshot; failure returns fixed codes and contract locations, without submitted values or arbitrary property names. Schema errors use codes such as `schema_additionalProperties` with an empty path. Semantic errors identify fixed contract paths. Errors are not a suitable substitute for content review. Types describe structural shape; only runtime checks enforce conditional and cross-field rules.

`canonicalize`, `parseJson`, and `computePreviewDigest` throw `ContractInputError` for invalid input. Its `code` and message contain no input values. Validators convert malformed values to a validation failure. The API accepts JSON data, not executable objects from untrusted JavaScript realms; a Proxy can execute traps before it is inspected. Parse untrusted text and enforce transport limits at your own admission boundary.

Additional exports: `ContractInputError`, `JsonValue`, `ValidationIssue`, `PreviewConsent`, `SCHEMA_VERSION` (`0.1.0`), `CONTRACT_PACKAGE_VERSION` (`0.1.0-draft.1`), and `SHARING_POLICY_VERSION` (`bl-sharing-0.1`).

Schema subpaths:

```text
@better-loop/contracts/schemas/share-candidate.schema.json
@better-loop/contracts/schemas/evaluation-run.schema.json
```

## Validation and digest contract

Both Draft 2020-12 schemas reject unknown fields and versions, with no coercion, default filling, or property removal. Runtime checks also enforce candidate size, unique indicators/KPIs, favorable primary KPI claims, exact planned-pair coverage, metric direction, reported paired percentages, missing/failed/zero-baseline evidence, quality floors, and frozen controlled protocols.

Candidate size is limited to 16 KiB of canonical UTF-8 JSON. Date-time formats are checked. Unknown local metrics remain null. No favorable numerical claim can repair unknown quality or incompatible evidence. Narrative claims and identifying text still need later privacy and semantic review.

Canonicalization follows RFC 8785 JSON serialization: recursive UTF-16 object-key ordering, unchanged array order, ECMAScript string/finite-number serialization, no whitespace, and no Unicode normalization. Negative zero serializes as zero. `parseJson` additionally rejects duplicate object members, including escaped duplicates. Rejects include undefined, functions, symbols, big integers, non-finite numbers, ill-formed strings, sparse arrays, cycles, custom object prototypes, hidden properties, and accessors. Canonicalization does not call `toJSON`.

`computePreviewDigest` first validates the candidate and exact consent fields. It hashes the UTF-8 canonical serialization of:

```json
{
  "candidate": "<the validated candidate object>",
  "consent": {
    "public_story": true,
    "benchmark_aggregation": false,
    "community_learning": false,
    "policy_version": "bl-sharing-0.1"
  }
}
```

The candidate placeholder above is illustrative, not a valid candidate. The result is 64 lowercase SHA-256 hexadecimal characters. Purpose booleans must be explicit. Extra fields, false public-story consent, and unknown policy versions are rejected. Changed text, array ordering, or purpose choices require a fresh preview and approval. Only formatting and object-key order are insignificant. Raw evaluation evidence, email, identity, and account identifiers are excluded from this digest API.

## CLI

```sh
better-loop-contracts share candidate.json
better-loop-contracts evaluation local-evaluation.json
better-loop-contracts canonicalize selected.json
better-loop-contracts digest preview-envelope.json
```

Use `-` instead of a filename to read stdin. `digest` accepts exactly `{candidate, consent}`. `share` and `evaluation` print only validation status/errors, never input content. `canonicalize` intentionally prints the selected JSON; do not send its output to shared logs. `digest` prints only the digest. Exit codes: 0 success, 1 invalid input/unreadable input, 2 usage error. There is no upload command.
