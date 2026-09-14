# Implementation status

Updated: 2026-09-14.

## M1 public foundation — complete locally

Implemented and locally tested:

- Pinned TypeScript/npm workspace and lockfile; package `@better-loop/contracts@0.1.0-draft.1`.
- Both unchanged Draft 2020-12 schemas, wire version `0.1.0`, generated structural types, strict precompiled validators, and every seed semantic check.
- RFC 8785-compatible canonicalization, strict JSON parsing, synchronous browser/Node preview digest with exact purposes and policy `bl-sharing-0.1`.
- Self-contained ESM/CommonJS package, schema subpaths, local CLI, scoped host discovery/install documentation, build and CI configuration.
- Safe validation error output, null evidence preservation, and the Python optional date-time dependency explicitly installed.

Verification:

| Check | Result |
|---|---|
| Build and strict TypeScript check | PASS |
| TypeScript tests | 145 passed, 0 failed |
| Python seed check | PASS: 2 schemas, 4 synthetic fixtures, 15 rejection cases, 1 missing-evidence case, 16 scenario definitions, 42 local links |
| Authored-document coverage regression | PASS: nested checkout still validates authored links and rejects broken links while ignoring dependency docs |
| Python/TypeScript parity | PASS: 79 public synthetic cases |
| Chromium 153.0.8010.36 | PASS: 79 cases, Node/WebCrypto SHA-256 parity, restrictive CSP without unsafe-eval |
| Package inspection | PASS: 18 allowlisted files, schemas byte-identical to source, bundled runtime |
| Offline packed consumer | PASS: archive install/npm ci, ESM/CJS, schema import, CLI, both TypeScript declaration entry modes |
| Required story title declarations | PASS: string access, required field, and wrong-type compile regressions; installed ESM/CJS types preserve the title |
| Clean source install | PASS: selected Node 22.23.2/npm 10.9.0/Python 3.11.6, fresh dependencies, full checks |
| Whitespace checks | PASS |

Checks ran on Node 22.10.0 and the selected Node 22.23.2, npm 10.9.0, and Python 3.11.6. The corrected package also passed browser and consumer checks from a clean source archive. Package files match across the two Node builds; compressed npm archive bytes can differ, so consumers must pin the exact reviewed archive integrity. Source is available on the repository's `main` and M1 work branch. Hosted CI is configured; the local results above do not assert a passing hosted run.

The initial seed was committed after its passing seed validation. Repository-local instruction scope and rollback are recorded in [instruction changes](docs/instruction-changes.md).

## Capability and release limits

The skill remains instruction-only. M2 normalized host adapters/assessment, M3 minimization/privacy review/export/consent workflow, and M4 experiment runner/repeated evaluation are **not implemented**. The 16 behavioral scenarios have not run against Claude Code or Codex. Synthetic contract tests do not establish model behavior, sanitizer effectiveness, domain calibration, or genuine improvement.

No package publication, network upload, live website, production authentication, deployment, or measured user success is provided. A private vulnerability-reporting route remains unverified as described in [SECURITY.md](SECURITY.md). Review and applicable release authorization are still required.

Next milestone: M2 useful private assessment on explicitly selected evidence, with actor attribution, bounded feedback, and equivalent normalized semantics across the two hosts. M3 remains a prerequisite for export/publication.
