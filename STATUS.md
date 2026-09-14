# Implementation status

Updated: 2026-09-14.

## M1 public foundation

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
| Python seed check | PASS: 2 schemas, 4 synthetic fixtures, 15 rejection cases, 1 missing-evidence case, 16 scenario definitions, 40 local links |
| Python/TypeScript parity | PASS: 79 public synthetic cases |
| Chromium 153.0.8010.36 | PASS: 79 cases, Node/WebCrypto SHA-256 parity, restrictive CSP without unsafe-eval |
| Package inspection | PASS: 18 allowlisted files, schemas byte-identical to source, bundled runtime |
| Offline packed consumer | PASS: archive install/npm ci, ESM/CJS, schema import, CLI, both TypeScript declaration entry modes |
| Whitespace checks | PASS |

Local checks above ran on Node 22.10.0/npm 10.9.0 and Python 3.11.6. The selected Node 22.23.2 binary is available; clean-checkout checks on that patch are the remaining verification step. Remote CI has not run because no code has been pushed.

The initial seed was committed after its passing seed validation. Repository-local instruction scope and rollback are recorded in [instruction changes](docs/instruction-changes.md).

## Capability and release limits

The skill remains instruction-only. M2 normalized host adapters/assessment, M3 minimization/privacy review/export/consent workflow, and M4 experiment runner/repeated evaluation are **not implemented**. The 16 behavioral scenarios have not run against Claude Code or Codex. Synthetic contract tests do not establish model behavior, sanitizer effectiveness, domain calibration, or genuine improvement.

No package publication, network upload, live website, production authentication, deployment, or measured user success is provided. A private vulnerability-reporting route remains unverified as described in [SECURITY.md](SECURITY.md). Review and applicable release authorization are still required.

Next milestone: M2 useful private assessment on explicitly selected evidence, with actor attribution, bounded feedback, and equivalent normalized semantics across the two hosts. M3 remains a prerequisite for export/publication.
