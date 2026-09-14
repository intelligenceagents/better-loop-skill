# Development and verification

Follow the clean setup in [README.md](../README.md). Keep the Python virtual environment active while running npm checks, because parity tests invoke `python3`. Alternatively set `BETTER_LOOP_PYTHON` to the intended interpreter for `npm run test:parity` and invoke the seed checker with that interpreter directly.

The build generates validators and TypeScript structural types from the two root schemas, then emits bundled ESM/CommonJS/CLI code and copies the exact schemas into the contracts package. It also builds core/adapters/local CLI plus privacy, evidence, measurement, discovery, handoff and journey. Local packages keep exact-version workspace dependencies; the packed-consumer check installs the reviewed archives together offline. Generated files, dependencies, local reports, and archives are ignored by Git. The public source is sufficient to rebuild the archives.

AJV compiles Draft 2020-12 with strict mode, full format checks, own-property validation, no coercion, no defaults, and no removal of unknown fields. Only the `strictTypes` schema-authoring lint is disabled: the unchanged draft conditionals inherit object types from parent subschemas. This does not relax instance validation. The browser runtime uses precompiled validators, so it needs neither `eval` nor `new Function`.

Python's optional date-time checker is explicitly installed and asserted. Without it, `FormatChecker` silently omits that format. The seed link checker excludes dependency/generated directories while still checking all authored Markdown.

## Commands

| Command | Evidence |
|---|---|
| `npm run check` | Build, TS type checks/tests, seed checks, Python parity, package allowlist and schema-byte comparison |
| `npm run build:local && npm run test:local` | M2 actors, states, seven families, adapters, reports, prompt/audit cases, contained instruction rollback, CLI/privacy integration and capability detection |
| `npm run test:privacy` | Shared privacy scanner, reviewer failure and exact-consent behavior |
| `npm run test:measurement` | Measurement worker's isolated behavior suite |
| `npm run test:browser` | Real Chromium validation, Node/WebCrypto digest parity, restrictive CSP |
| `npm run pack:contracts` | Local archive in ignored `artifacts/`; no registry publication |
| `npm run test:extensions` | Evidence, discovery and handoff workspace behavior suites |
| `npm run pack:local` | Ten version-pinned local archives and integrity manifest in `artifacts/local-release.json`; no registry publication |
| `npm run test:consumer` | Install contracts and local-tooling archives into isolated directories, offline npm ci, ESM/CJS/schema/CLI and declaration checks |

Install a test browser if needed:

```sh
npx playwright install chromium
npm run test:browser
```

Or set `BETTER_LOOP_BROWSER_EXECUTABLE` to an existing Chromium-compatible executable. Tests serve only synthetic content on loopback. Chromium is a verification tool, not a package runtime dependency.

CI runs the same checks on the selected Node 22 patch and Node 24, with Python 3.11. It installs a browser for the browser test. Remote CI execution requires a reviewed push and is not implied by a local pass. No deployment job or publishing workflow is present.

## Coverage and limits

The shared synthetic matrix exercises every Python semantic branch and additional schema/format failures. Tests also cover malformed JavaScript values, Unicode, duplicate JSON members, consent edits, private-field rejection, honest missing evidence, safe error output, and package/browser consumption.

M2 adds deterministic behavior tests on synthetic selected material, including all 11 indicator mappings, all seven task families, native adapter equivalence, malicious inputs, null metrics, exact output constraints, and positive/negative static audit findings. CLI tests deny network/subprocess creation for ordinary assessment, preserve private file permissions, and test scope/byte preconditions. Synthetic reviewer executables test only transport/failure/confirmation behavior; they are not semantic privacy evidence.

These development cases are not independently labeled held-out classifier calibration or measured improvement. The coordinator records actual host runs and frozen experiments separately. The public helper has no authenticated service, upload transport, public trust badge, or calibrated ranking.

Journey fixtures exercise independent invocations across both hosts, persisted host report revisions, unchanged/delta behavior, explicit multi-repository updates, missing evidence, rewritten history, exclusion bounds, stale writes, corrupted/partial state, local deletion and user-reported follow-up gates. The actual workflow uses selected real repository evidence. CLI reviewer fixtures test argv/input/consent binding without model requests or claiming semantic review. The handoff workspace separately exercises its browser transport; a passing loopback test is not a production deployment or publication.
