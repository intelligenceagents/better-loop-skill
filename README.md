# Better Loop

Better Loop helps knowledge workers review selected AI-assisted work and improve the next attempt. Private coaching comes first; sharing is optional. The intended public learning destination is better-loop.com.

Choose one repository or an explicit set in Claude Code or Codex. A [local journey](docs/journey.md) remembers that scope, earlier assessments and your feedback. Return to the same selected state to review changed evidence and choose the next acceptance check. Unchanged work creates no new assessment or progress credit.

The workspace also provides selected-export adapters, descriptive assessment, prompt proposals, static skill audits, and scoped instruction edits with exact-byte rollback. Optional sharing prepares a minimized story and [capability evidence](packages/evidence/README.md), with separate benchmark, community-learning and role-discovery choices. Two configured semantic reviews and your exact confirmation are required. An optional [browser handoff](packages/handoff/README.md) opens a local preview; publication remains a separate website action. Passing a contract check does not establish privacy, truth, human judgment, or improvement.

Start with [host installation](docs/hosts.md), [the local CLI](packages/cli/README.md), [the skill](skills/better-loop/SKILL.md), [the behavioral foundation](skills/better-loop/references/foundation.md), and [privacy boundaries](skills/better-loop/references/privacy.md). Both adapters have synthetic semantic-equivalence tests. Deterministic cue tests do not establish model behavior, independent classifier calibration, or domain validity.

The [real returning-host checks](evals/host-validation/returning-journey.md) exercised selected repository work in both native hosts, including cross-host recall, changed-work assessment and unchanged reuse. All failures are retained. The [frozen public-work benchmark](evals/public-work-benchmark/RESULTS.md) measured equal quality and 1.05% more reported tokens with guidance in one pair; it establishes no savings or hiring validity. [Role evidence, descriptive cohorts and milestones](packages/discovery/API.md) keep relevance, observed human actions, reported claims, quality and missing evidence separate.

Use Node 22 (the selected patch is in `.nvmrc`), npm 10.9.0, and Python 3.11 or later:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
npm ci
npm run check
```

The initial install downloads public dependencies. Default checks use synthetic local data and require no service credentials, model calls, or Better Loop connection. `npm run check` builds the workspaces, type-checks, runs behavior/privacy/measurement tests, validates the seed, compares Python/TypeScript behavior, and checks the contract package allowlist. See [development](docs/development.md) for browser and packed-consumer checks.

Use your explicitly selected task after building:

```sh
node packages/cli/dist/cli.js capabilities --json
node skills/better-loop/scripts/detect-helper.mjs
node packages/cli/dist/cli.js assess --host codex --input selected-task-export.json
```

The report gives domain-specific checks and 11 source-mapped descriptive cues with actor and evidence limits. Outcome/resource metrics remain unknown. The helper makes no model call; richer host reasoning uses the user's configured model provider, a separate processing boundary. Private reports contain selected evidence and are never public candidates.

For real repository work with a selected diff/document and existing check output, use `capture --task selected-task-context.json --artifact selected-change.diff --checks selected-check-output.txt --output selected-task-export.json`. It reads only those explicit files, retains their actual text locally, and marks the selection partial. It never runs a command from a diff, fabricates check results, infers a human decision from agent code, or scans repository/history directories. The task-context format and native host export formats are in [adapters](packages/adapters/README.md).

Prior validation: the [first real-host pilot](evals/host-validation/results/benchmark-analysis.json) ran 12 model calls across two synthetic reconciliation tasks with frozen prompts and strict JSON checks. The rewrite increased mean per-pair reported token use by about 17% and 20%, with no measured quality gain. All baseline and candidate checks passed. This was performed before the workflow switched to actual selected repository evidence; it is not real-work evidence or a savings claim. Shared preparation overhead and several effort/cost measures remain unknown. See the [frozen registration](evals/host-validation/benchmark-registration.json) and [retained raw run results](evals/host-validation/results/benchmark-raw.json).

Explicit public-learning retrieval and private measurement milestones are described in [local learning](docs/local-learning.md). Learning sends only controlled taxonomy on an explicitly requested public GET; offline/expired lesson exports cannot generate automated recommendations. No default production service, automatic experiment, evidence upload, or universal score is supplied.

The unpublished draft package is `@better-loop/contracts@0.1.0-draft.1`, implementing the unchanged wire schema `0.1.0`. Its [API and CLI](packages/contracts/README.md) validate both contracts, canonicalize JSON, and calculate exact-preview digests locally. Build a reviewable archive with `npm run pack:contracts`; do not assume it is available on the npm registry.

The [example fixtures](examples/README.md) are fictional and excluded from efficacy claims. Real host and public-work results are labeled separately. See [status](STATUS.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md), and [MIT license](LICENSE).

Corporate and other reuse is welcome. [Corporate integration and reuse](docs/corporate-integration-and-reuse.md) describes the optional, non-confidential notification process. MIT is unchanged; notification and registration are voluntary, and no results are collected automatically.
