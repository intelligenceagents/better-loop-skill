# Dependency choices

Direct versions were checked against the official npm registry on 2026-09-14 using `npm view <package> version engines license --json`; Python packages were checked through PyPI/pip metadata. Exact npm versions and transitive integrity entries are committed in `package-lock.json`.

| Dependency | Pinned version | Role / declared Node compatibility |
|---|---|---|
| TypeScript | 7.0.2 | Type checks/declarations; Node >=16.20 |
| AJV | 8.20.0 | Draft 2020-12 validator generation |
| ajv-formats | 3.0.1 | Full date-time format checking |
| @noble/hashes | 2.4.0 | Portable synchronous SHA-256; Node >=20.19 |
| esbuild | 0.28.2 | Bundle precompiled validators and runtime; Node >=18 |
| json-schema-to-typescript | 16.0.0 | Structural declarations; Node >=16 |
| tsx | 4.23.13 | TypeScript test execution; Node >=18 |
| @types/node | 22.20.2 | Node 22 declaration baseline |
| Playwright | 1.63.0 | Chromium verification; Node >=20 |
| jsonschema | 4.26.0 | Python seed/parity reference |
| rfc3339-validator | 0.1.4 | Ensures Python date-time checking actually runs |

The selected Node patch is 22.23.2; npm is pinned to 10.9.0. Node 22 satisfies the declared dependency ranges. Registry availability and ranges are necessary checks; actual local build/browser/consumer tests provide compatibility evidence. No model identifiers or prices are embedded in the implementation.

Only required runtime code is bundled into the distributed contracts archive. Its third-party notice file preserves the licenses of AJV/format helpers and SHA-256 code. No external evaluation implementation is vendored.

References: [AJV Draft 2020-12](https://ajv.js.org/json-schema.html), [AJV standalone generation](https://ajv.js.org/standalone.html), [noble-hashes](https://github.com/paulmillr/noble-hashes), [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785), and the versioned package metadata in the npm lockfile.
