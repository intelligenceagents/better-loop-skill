# Better Loop

Better Loop helps knowledge workers review selected AI-assisted work and improve the next attempt. Private coaching comes first; sharing is optional. The intended public learning destination is better-loop.com.

M1 provides a working TypeScript contracts package, an instruction-only skill, synthetic examples, and development checks. It does not provide a production sanitizer, host adapter, assessment engine, benchmark runner, uploader, or live website. Passing a contract check does not establish privacy, truth, human judgment, or improvement.

Start with [host installation](docs/hosts.md), [the skill](skills/better-loop/SKILL.md), [the behavioral foundation](skills/better-loop/references/foundation.md), and [privacy boundaries](skills/better-loop/references/privacy.md). Claude Code and Codex can read the same skill; model behavior and host adapters have not been validated.

Use Node 22 (the selected patch is in `.nvmrc`), npm 10.9.0, and Python 3.11 or later:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
npm ci
npm run check
```

The initial install downloads public dependencies. Tests use synthetic local data and require no service credentials, model calls, or Better Loop connection. `npm run check` builds the package, type-checks, runs TypeScript tests, validates the seed, compares Python/TypeScript behavior, and checks the package allowlist. See [development](docs/development.md) for browser and clean-consumer checks.

The unpublished draft package is `@better-loop/contracts@0.1.0-draft.1`, implementing the unchanged wire schema `0.1.0`. Its [API and CLI](packages/contracts/README.md) validate both contracts, canonicalize JSON, and calculate exact-preview digests locally. Build a reviewable archive with `npm run pack:contracts`; do not assume it is available on the npm registry.

All [examples](examples/README.md) are fictional and excluded from efficacy claims. See [status](STATUS.md), [contributing](CONTRIBUTING.md), [security](SECURITY.md), and [MIT license](LICENSE).
