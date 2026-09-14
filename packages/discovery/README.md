# @better-loop/discovery

Version `0.1.0-draft.2`. Bounded pure helpers for role-relevant public evidence, descriptive benchmark cohorts and learning milestones, plus one frozen actual-public-work benchmark judge. No universal person score, automatic hiring decision, ability badge or population percentile.

See [API.md](API.md) for integration shapes. ESM, CommonJS and declarations are packaged with bundled runtime dependencies and extracted shared type declarations. Source imports the approved `@better-loop/evidence@0.1.0-draft.2` types and validators; the package has no install-time runtime dependency downloads.

```ts
import { matchRoleEvidence } from "@better-loop/discovery";

const result = matchRoleEvidence(criteria, currentServerRows, {
  source: "current_server_snapshot",
  complete: true,
});
```

The caller must authenticate and derive current publication, revision, ownership, consent and trust state. This helper is not admission, authentication or independent verification. It performs no semantic reviews, model calls, uploads, persistence or side effects.

Discovery requires explicit `candidate_discovery` consent on current published work-derived evidence. It lists stories in public-ID order, with separate task/skills, relevant quality checks, reported human actions, missing evidence and server trust reasons. Cross-family matches show their different context. A local claim cannot increase the server trust tier; email verification and agent work are not human judgment.

The draft.2 validator requires matching selected-human-message evidence for every observed candidate indicator. A legitimate user attestation can accompany base `insufficient_evidence` or `not_observed` with a null rating. Discovery retains its attestation-only gap and self-reported trust; it does not manufacture an observed conversation to accept the claim. API/schema/policy shapes, the frozen benchmark, its judge and retained execution results are unchanged.

`aggregateBenchmarkCohort` requires explicit benchmark consent, a known registered benchmark, exact benchmark/framework/rubric/task/difficulty/conditions/metric versions and matching trust/provenance strata, comparable measurements, known quality and no critical regression. It accepts only normalized candidate indices, with baseline 100. Suppressed cohorts return no exact count or statistic. The fixed minimum is **20 distinct eligible server owners**; the caller cannot lower it. Owner IDs appear only in operational input and never in any output.

For this registered correctness task, the capsule must report benchmark `met` and a known `correctness` check `met`; a failed/incomplete benchmark or an unrelated quality check cannot override that floor. Negative and neutral resource outcomes with the same quality floor remain eligible. Failed-quality benchmark executions stay in execution reports but do not enter quality-qualified aggregates.

One mean of eligible current records is computed per owner, then each owner receives equal weight. Negative and neutral values remain in mean/median calculations. Statistics round to five index points and the owner count rounds down to five. Duplicate copies of the same current public record are collapsed; conflicting current versions invalidate the batch. Synthetic, incomplete, missing-quality, withdrawn, opted-out and incompatible records do not qualify. No best-result selection occurs.

Twenty owners and rounding are heuristics, not anonymity guarantees. Arbitrary repeated/differencing queries and stale caches need service controls; this pure package does not implement those controls. Always re-read authoritative state and discard old derived results after withdrawal, deletion or changed consent. Offline or incomplete snapshots return unavailable states. The maximum input is 1,000 records, each bounded to 28 KiB; larger cohorts must not be silently truncated to fit.

Local summaries require a recorded reflection and a later comparable checked outcome for the same caller-bound task/equivalence keys. Negative follow-up is useful learning; quality failure remains visible. Copies, revisions, unchanged work and missing evidence cannot establish that milestone. Public summaries describe reported reflection/follow-up, expose no progress counts and grant no competence benefit for activity, tokens, cost, sharing or self-reported task bands.

`judgeApprovalBindingOutput` accepts a bounded JSON object/string in the frozen answer format and returns passed/failed/missing case checks, coverage and a limited `met`/`not_met`/`incomplete` result. Only `bl-public-approval-binding@0.1` is registered. The actual public source, checks and baseline/guidance protocol were frozen in Git commit `0aab3f442e48e9a705575bfa5b2283349781b2cb` before new model outputs. Read `evals/public-work-benchmark` in the source repository. Fixture answers are software checks, not model results, customer work, measured improvement or a security audit.

`PUBLIC_APPROVAL_BINDING_RESULTS` contains the separately retained actual execution summary for one subsequent coordinator-run pair, with source/freeze/judge provenance and a results hash. Both arms passed 12/12 cases and 3/3 limits; guided reported tokens increased about 1.05%, with no measured quality gain. Costs are host-reported list estimates, not cash billing. Shared orchestration and human effort remain unknown. The original freeze is unchanged. No savings, causal speed improvement or full-skill effectiveness is established.

From the installed source workspace, after contracts/privacy/evidence builds:

```sh
npm run check --workspace @better-loop/discovery
```

The checks include independent expected aggregation arithmetic, consent/withdrawal and owner deduplication, attribution/missing-evidence behavior, milestone non-inflation, judge coverage/errors, frozen-source integrity and an offline packed ESM/CJS/declaration consumer. No root build or CLI integration is provided by this package's scoped implementation.
