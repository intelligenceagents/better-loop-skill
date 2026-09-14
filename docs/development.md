# Development and verification

Follow the clean setup in [README.md](../README.md). Keep the Python virtual environment active while running npm checks, because parity tests invoke `python3`. Alternatively set `BETTER_LOOP_PYTHON` to the intended interpreter for `npm run test:parity` and invoke the seed checker with that interpreter directly.

The build generates validators and TypeScript structural types from the two root schemas, then emits bundled ESM/CommonJS/CLI code and copies the exact schemas into the package. Generated files, dependencies, local reports, and archives are ignored by Git. The public source is sufficient to rebuild the archive.

AJV compiles Draft 2020-12 with strict mode, full format checks, own-property validation, no coercion, no defaults, and no removal of unknown fields. Only the `strictTypes` schema-authoring lint is disabled: the unchanged draft conditionals inherit object types from parent subschemas. This does not relax instance validation. The browser runtime uses precompiled validators, so it needs neither `eval` nor `new Function`.

Python's optional date-time checker is explicitly installed and asserted. Without it, `FormatChecker` silently omits that format. The seed link checker excludes dependency/generated directories while still checking all authored Markdown.

## Commands

| Command | Evidence |
|---|---|
| `npm run check` | Build, TS type checks/tests, seed checks, Python parity, package allowlist and schema-byte comparison |
| `npm run test:browser` | Real Chromium validation, Node/WebCrypto digest parity, restrictive CSP |
| `npm run pack:contracts` | Local archive in ignored `artifacts/`; no registry publication |
| `npm run test:consumer` | Install archive into an isolated directory, ESM/CJS/schema/CLI and declaration checks |

Install a test browser if needed:

```sh
npx playwright install chromium
npm run test:browser
```

Or set `BETTER_LOOP_BROWSER_EXECUTABLE` to an existing Chromium-compatible executable. Tests serve only synthetic content on loopback. Chromium is a verification tool, not a package runtime dependency.

CI runs the same checks on the selected Node 22 patch and Node 24, with Python 3.11. It installs a browser for the browser test. Remote CI execution requires a reviewed push and is not implied by a local pass. No deployment job or publishing workflow is present.

## Coverage and limits

The shared synthetic matrix exercises every Python semantic branch and additional schema/format failures. Tests also cover malformed JavaScript values, Unicode, duplicate JSON members, consent edits, private-field rejection, honest missing evidence, safe error output, and package/browser consumption.

These are deterministic contract tests. The 16 prose evaluation scenarios remain unexecuted against either host. There is no benchmark engine, real-world improvement evidence, local sanitizer, authenticated service admission, or ranking calibration.
