# Discovery package verification

Updated 2026-09-14. Package `@better-loop/discovery@0.1.0-draft.2` is implemented and tested locally on the existing `codex/m2-m6-skill` branch. This scoped report leaves central coordination and root integration to their owners.

Draft.2 rebundles the corrected `@better-loop/evidence@0.1.0-draft.2` validator from parent commit `01091e5c26378576b3b42d6a7f9735821d9ae2e4`. Observed candidate human indicators require matching selected-human-message support. Legitimate attestations with base `insufficient_evidence` or `not_observed` and null rating remain valid and explicitly attestation-only. API/schema/policy shapes and all frozen benchmark/judge/results bytes are unchanged.

Implemented:

- Strict controlled role criteria and current opted-in work-derived record matching, with separate task/skill relevance, relevant quality checks, reported human attribution, gaps and server trust reasons. No person score or automated hiring decision.
- Exact registered-task descriptive cohorts with explicit benchmark consent, fixed minimum twenty distinct server owners, equal owner weight, known benchmark/correctness floor, no critical regression, rounded normalized indices and neutral/negative resource outcomes. Operational owner IDs never enter results.
- Local reflection/later comparable follow-up and public self-reported milestone summaries. Revisions, copies, unchanged work, task bands, token use, expense and publishing volume earn no competence benefit.
- One immutable actual-public-work approval-binding registry, bounded deterministic output judge and baseline/guidance protocol. Source/check/prompt freeze was pushed at `0aab3f442e48e9a705575bfa5b2283349781b2cb` before new execution.
- Subsequent sanitized actual execution report and packaged `PUBLIC_APPROVAL_BINDING_RESULTS` summary, with hashes/provenance and unknown-resource limits. Original freeze remains unchanged.
- Bundled ESM/CommonJS/browser-compatible runtime and self-contained declarations extracted from the owning contracts/evidence packages. MIT license and dependency notices included.

Verification actually run:

| Check | Result |
|---|---|
| Package build, source/registration/results drift checks | Passed |
| Strict TypeScript source/test check | Passed |
| Behavior and package checks | 77 passed, 0 failed |
| Offline packed consumer | ESM, CommonJS and both declaration modes passed without contracts/evidence installed |
| Draft.2 bundled attribution validation | Both packed runtime modes accept legitimate unobserved attestations and reject unsupported observed indicators |
| Current consent, withdrawal, deletion, legacy/synthetic exclusion | Passed |
| Fixed 19/20-owner boundary, deduplication, rounded arithmetic, negative/neutral retention | Passed |
| Missing/agent-only attribution, unknown/relevant quality, milestone non-inflation | Passed |
| Frozen benchmark files and exact real-output rejudging | Passed |
| Scoped whitespace check | Passed |

Checks used Node `22.10.0` and the repository's installed locked tooling. The input fixture tests are explicitly fictional and excluded from the package artifact; they are not execution results.

Packed draft.2 artifact: `artifacts/better-loop-discovery-0.1.0-draft.2.tgz`, 112,320 bytes, 19 allowlisted files. SHA-256: `4c42d94f15cbee29cf398d82449b002a6aa844b1cdc12c3e8030dac8b55894d1`. The archive is a local ignored release artifact, not a package-registry publication. Root npm installation remains Carson's responsibility.

The coordinator's two actual native Claude Code benchmark invocations used host version `2.1.270` for one baseline-then-guided pair. Both outputs met all twelve case checks and three scope limits. All model-usage entries total 34,617 baseline tokens and 34,981 guided tokens (+364, about +1.05%). Host-reported list-cost estimates were USD0.223280 and USD0.223716, not cash billing. There was no measured quality gain and no established savings or causal speed improvement. The discovery worker made zero model calls.

Limitations: this is a pure data package, not server admission/authentication, a semantic review, a security audit, validated hiring assessment or a production service. Server integrations must derive current ownership/consent/trust and discard stale projections/caches; the helper cannot attest a caller. Twenty owners plus rounding do not guarantee anonymity or prevent repeated-query differencing. One public task and one pair do not establish full-skill effectiveness or human learning; shared coding-agent overhead and human effort remain unknown. No package-registry publication, deployment or new service occurred.

Next: Carson integrates root build/CLI consumption; Zeno consumes the pure interfaces and packaged actual-results summary in the private app. Their integration checks and coordinator release acceptance remain separate from this package's checks. Rollback is to revert the discovery/results implementation commit; preserve the historical public benchmark freeze and actual execution evidence.
