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

## M2 local assessment — implemented and verified locally

`@better-loop/core`, `@better-loop/adapters`, and `@better-loop/cli` are version `0.2.0-draft.1`. They provide:

- Portable single-task exports plus conservative selected Claude Code JSONL and Codex exec/rollout adapters. Synthetic semantic-equivalence tests preserve human, agent, tool, reviewer and unknown attribution.
- Exactly 11 source-mapped descriptive observations, separate human state, explicit irrelevant/unobserved/partial states and null ratings. All seven task families receive bounded process advice with validation methods. Outcome/resource metrics are never inferred from text.
- Private Markdown/JSON reports, exact-format-preserving prompt proposals, and static skill audits with positive and should-not-trigger cases. No audited command, path or upload instruction is executed.
- Explicit capture of actual selected artifact/check files, with partial coverage and no invented human messages or check outcomes. Native/portable conversations can be assessed directly.
- Scoped instruction plans with full diff, exact approval digest, containment, byte preconditions, exclusive lock, atomic replacement and rollback. Global directories, symlinks, hardlinks, arbitrary file targets, stale edits and unapproved plan changes fail.
- Executable portable skill capability detection, repository-local install/update/rollback instructions, six-package archive generation and offline consumption.

The real local workflow was exercised on the current `packages/cli/src/learning-service.ts` plus selected actual automated-test summaries. Capture and assessment completed locally with no model call or raw upload. The private report remains in the ignored local review directory; it is not a public story. The default workflow uses the person's actual selected evidence; fixtures remain automated test data.

## M3/M4 integration and M6 local learning

The CLI consumes the coordinator-owned `@better-loop/privacy@0.1.0-draft.3` and the measurement worker's `@better-loop/measurement@0.1.0-draft.1`. The unchanged contracts package stays `0.1.0-draft.1` / wire `0.1.0`.

`draft-share` uses only the shared candidate scanner/builder, exactly two explicitly configured reviewer commands, and same-process exact preview/confirmation. No reviewer is selected by default. Missing/failed/disagreeing review blocks clearance while keeping an unapproved local draft. Raw reports are not candidates. Local approval is non-attesting and the server must independently recheck.

`measure`, `analyze`, and `milestones` delegate to the local measurement engine. They retain unknown metrics and reject unsupported gains; repeated milestones exclude synthetic measurements, duplicates, copied tasks and insufficient evidence. No universal score or public achievement is awarded.

`learn` implements the separately versioned `bl-public-lessons-0.1` response and pure shared taxonomy matcher. Explicit service retrieval sends only controlled taxonomy on a public GET, without authentication, cookies or private task text. It requires no-store, refuses redirects, and enforces a five-second/64 KiB bound. Only fresh currently eligible server projections generate local experiment proposals with source citations, conditions and limits. Offline, expired or future-dated exports generate no automated recommendations. The configured loopback app accepted an actual query and returned an honest `no_eligible_matching_lessons` result. No production deployment or public content was invented.

Verification on the current source:

| Check | Result |
|---|---|
| Package builds and strict root/measurement TypeScript | PASS |
| Root TypeScript behavior tests | 235 passed (145 existing contract tests plus 90 local workflow/learning tests) |
| Shared privacy workspace tests | 67 passed |
| Measurement workspace tests | 99 passed |
| Seed/schema/link check and authored-document regression | PASS with declared Python environment |
| Python/TypeScript contract parity | 79 passed |
| Contracts archive inspection | 18 allowed files; unchanged schema bytes |
| Six-package offline consumer | PASS: npm ci, ESM/CJS, declaration modes, local CLI and measurement imports |
| Real selected repository capture/assessment | PASS; selected source/check evidence remains local |
| Actual configured loopback lesson request | PASS; no eligible content returned |

The shell's default Python lacked the optional date-time checker; the declared `.venv` has it. The Python checks passed using that environment. Follow the documented virtual-environment setup when running `npm run check`.

## Prior model validation and remaining limits

The [prior pilot analysis](evals/host-validation/results/benchmark-analysis.json) retains 12 actual Claude Code invocations on two synthetic reconciliation tasks, three pairs each. Mean per-pair reported token use increased about 17% and 20%, with no measured quality gain because all exact-JSON checks passed in both conditions. The [frozen registration](evals/host-validation/benchmark-registration.json) and [raw results](evals/host-validation/results/benchmark-raw.json) are retained. This preceded the switch to actual repository work and is **not real-work evidence**. It does not establish savings, repeated improvement, human ability or a validated population claim. Unknown shared overhead/effort/billing remains unknown.

The [actual native Claude evaluation](evals/host-validation/results/capabilities.json) used selected real Better Loop repository changes and checks. The positive review loaded the installed skill, ran only the authorized capability detector and selected reads, and had no permission denials. The ordinary architecture question used no skill or tools. Behavioral boundaries passed, but length limits failed: 953 words against a 700-word request, and 909 against 750. That evaluated snapshot also exposed ambiguous brand-dependent triggering and an invitation rule that did not explicitly respect upfront declines. Two retained real prompt follow-ups invoked the skill without a brand name, used only the detector, honored the no-sharing request and made no edits. They still exceeded the requested limit: 290 and then 258 whitespace-delimited words against 250. The final rewrite preserved scope without inserting new approval or stop-on-failure rules. Exact length compliance remains a known host limitation, not an implemented guarantee; 250 words is a test condition, not a product-wide limit. See the [host evidence report](evals/host-validation/README.md).

Seven-family automated cases remain unit coverage, not field validation. M2 cue rules are conservative English development heuristics, not independently calibrated classifiers; native adapters implement selected format subsets, not arbitrary full histories. Native Codex model behavior has not been established by the Claude run. Static audit findings remain behavioral hypotheses. Filesystem safeguards are not an OS sandbox against a malicious same-user process racing syscalls.

MIT remains unchanged. The founder selected [voluntary integration and reuse notification](docs/corporate-integration-and-reuse.md), with a public issue form for non-confidential notices. No mandatory registration, telemetry, corporate tenant, private cloud library, internal uploader, package registry publication, production activation or deployment is introduced. GitHub private vulnerability reporting is enabled and the setting verified; [SECURITY.md](SECURITY.md) explains the route and response-time limitation.
