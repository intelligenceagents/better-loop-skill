# Claude Code and Codex discovery

The same `skills/better-loop/` directory serves both hosts. Its guidance is paired with an executable local helper for selected assessment, prompt proposals, static audits, instruction changes, and candidate preparation. The helper's conservative deterministic observations are distinct from the host model's reasoning.

For a repository-scoped install, run one of these from this checkout. Replace `/path/to/selected-project` with the project you intentionally want to configure. The guard prevents overwriting an existing Better Loop skill.

Claude Code:

```sh
target_project=/path/to/selected-project
if test ! -e "$target_project/.claude/skills/better-loop"; then
  mkdir -p "$target_project/.claude/skills"
  cp -R skills/better-loop "$target_project/.claude/skills/better-loop"
fi
```

Codex:

```sh
target_project=/path/to/selected-project
if test ! -e "$target_project/.agents/skills/better-loop"; then
  mkdir -p "$target_project/.agents/skills"
  cp -R skills/better-loop "$target_project/.agents/skills/better-loop"
fi
```

The copy runs only when the destination does not exist. Keep any existing installation intact until you have reviewed an update diff. Review the installed `SKILL.md` and all references. In Claude Code invoke `/better-loop`; in Codex invoke `$better-loop`, or select the skill in the skill picker. If discovery is stale, start a new session. Ask for a bounded review of your actual selected task, diff or exported conversation; inspect the host's output before relying on it. Do not replace that work with a synthetic demonstration. Fixtures are reserved for automated development checks.

Build the local helper with `npm run build:local`. From a source checkout, `node skills/better-loop/scripts/detect-helper.mjs` checks the known helper. For an installed skill copy, pass the operator's explicit absolute helper entrypoint to the copied detector:

```sh
node /path/to/selected-project/.agents/skills/better-loop/scripts/detect-helper.mjs /path/to/reviewed-checkout/packages/cli/dist/cli.js
```

Use the corresponding `.claude/skills` path in Claude Code. The detector executes that known helper's `capabilities --json`, checks protocol/package versions and release limits, and reports unavailable or incompatible without installing anything. A capability result is not an authenticity signature or evidence of model efficacy.

For a separate Node installation, `npm run pack:local` creates six reviewed archives with an integrity manifest. Install those exact six tarballs together in a selected local Node project using `npm install --offline --ignore-scripts` with each tarball path as an argument. The installed bin is `better-loop`; its entrypoint is `node_modules/@better-loop/cli/dist/cli.js`. Keep the installed skill's explicit detector argument pointed at that entrypoint. Do not assume these unpublished draft versions exist in a package registry. The consumer check verifies this archive installation and both ESM/CommonJS consumers with no registry access.

No global configuration is edited by this repository. For an update, compare the installed directory with the reviewed release, retain the previous copy, then replace only that directory. Rollback restores that copy. Uninstall removes only the chosen `.claude/skills/better-loop` or `.agents/skills/better-loop` directory.

| Surface | Local implementation | Separate validation needed |
|---|---|---|
| Claude Code | Standard skill layout, capability detection, selected portable/JSONL adapter with synthetic equivalence tests | Host reasoning/trigger outcomes and independent domain calibration |
| Codex | Same skill, OpenAI display metadata, selected portable/exec/rollout adapter with synthetic equivalence tests | Host reasoning/trigger outcomes and independent domain calibration |
| Node | Local assessment, rewrite, audit, contained instruction apply/rollback, privacy-helper integration | Real provider review evidence and controlled efficacy evaluation |
| Browser | Bundled validators/canonicalization tested in Chromium with restrictive CSP | Privacy review, publication, all-browser compatibility |

Running a skill on your laptop may send selected material to your configured model provider. The deterministic assessment helper itself is offline. Explicit reviewer subprocesses receive only an already-minimized candidate and use their configured provider/authentication boundary. No raw evidence is sent to Better Loop by this package. Offline model inference is a separate capability requiring a compatible local model. See [current status](../STATUS.md) for executed evidence and limits; documentation/discovery is not a host behavior test.

Discovery conventions were checked against the official [Claude Code skills documentation](https://code.claude.com/docs/en/skills) and [Codex skills documentation](https://developers.openai.com/codex/skills) on 2026-09-14. Reading documentation is not a behavioral compatibility test.
