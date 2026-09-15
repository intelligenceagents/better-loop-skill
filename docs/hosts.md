# Claude Code and Codex discovery

The same `skills/better-loop/` directory serves both hosts. Its guidance is paired with an executable local helper for selected assessment, prompt proposals, static audits, instruction changes, and candidate preparation. The helper's conservative deterministic observations are distinct from the host model's reasoning.

## First private use

Start with Git, Node 22 (selected patch in `.nvmrc`), npm 10.9.0, and your installed/configured Claude Code or Codex host. Choose a reviewed source commit and a new helper checkout location. The following are **non-runnable placeholders** until you replace the path and commit:

```text
git clone --no-checkout https://github.com/intelligenceagents/better-loop-skill.git /path/to/new-helper-checkout
git -C /path/to/new-helper-checkout checkout --detach REVIEWED_SOURCE_COMMIT
cd /path/to/new-helper-checkout
npm ci
npm run build:local
```

Dependency installation initially needs access to public packages. The local build makes no model call and needs no service credentials. Python is needed for the full contributor checks in the root README, not this helper build.

Next copy the skill into only the selected host/project using the blocks below, run the copied detector with your explicit built helper entrypoint, and check for `state:"available"` with the expected package versions. If unavailable, check that the selected entrypoint exists after building; if incompatible, align the reviewed skill/helper versions. Do not install an unreviewed global fallback.

Invoke the installed skill with one [private first-use request](host-prompts.md), choose the task and dedicated state, and keep the returned checkpoint plus exact helper/state paths in your chosen private session notes outside dedicated state. A baseline is a saved first assessment, not an improvement claim. Reviewer setup and website sign-in are not prerequisites.

## Install only the chosen host skill

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

For a separate Node installation, `npm run pack:local` creates ten reviewed archives with an integrity manifest: contracts, core, adapters, privacy, measurement, evidence, discovery, handoff, journey and CLI. Install those exact ten tarballs together in a selected local Node project using `npm install --offline --ignore-scripts` with each tarball path as an argument. The package supplies a project-local `node_modules/.bin/better-loop`, which is not automatically on your shell `PATH`. You can invoke `node /absolute/path/to/selected-install/node_modules/@better-loop/cli/dist/cli.js help` directly. Keep the installed skill's explicit detector argument pointed at that entrypoint. Do not assume these unpublished draft versions exist in a package registry. The consumer check verifies this archive installation and both ESM/CommonJS consumers with no registry access.

## Return, share or upgrade

For returning repository work, [choose a local journey scope](journey.md) once and retain its explicit state path. Both hosts use that same path across invocations. No host-global pointer or repository search is installed. A scope can contain the current repository or exact user-listed roots; changes require the user's choice. The helper persists the actual host's selected assessment separately from deterministic artifact cues and returns only bounded delta excerpts with previous context. The provider may process those selected raw excerpts. An unchanged scan does not justify a new assessment or progress benefit.

For optional sharing, choose a compliant reviewer using the [public integration guide](../skills/better-loop/references/reviewers.md) before consuming review allowance. The copied share prompt asks for missing configuration instead of inventing commands. Private coaching remains useful when review is unavailable. `draft-share --help`, `journey --help` and `journey view --help` read no selected input/state and make no model call.

For an update, retain the previous selected skill and helper package set, review the new scoped diff/version requirements, build/install the exact compatible package set, then replace only the chosen skill directory and update its selected helper path. Rerun the detector, reuse the same approved state path, and check any separately selected reviewer against the documented protocol. CLI `0.4.0-draft.5` adds bounded release awareness and complete package compatibility detection; journey `0.2.0-draft.3`, evidence, consent and state formats are unchanged. Updating alone does not assess or award progress.

Rollback restores the retained compatible skill/helper pair; it never resets or deletes journey state. No global configuration is edited. Uninstall removes only the chosen `.claude/skills/better-loop` or `.agents/skills/better-loop` directory; state deletion remains a separate explicit action.

| Surface | Implementation and executed evidence | Separate validation needed |
|---|---|---|
| Claude Code | Installed skill, selected adapters, real single/multiple-scope sessions, cross-host recall, final changed/unchanged checks | Broad trigger reliability, factual accuracy, brevity and independent domain calibration |
| Codex | Same skill, OpenAI metadata, selected adapters, actual baseline and returning multiple-scope session | Final repaired-source model interpretation, broad trigger reliability and independent domain calibration |
| Node | Local assessment, journey, rewrite, audit, scoped edits/rollback, full contribution preparation; two actual final-helper semantic passes | Controlled efficacy evaluation and privacy review of each new contribution |
| Browser | Chromium validators and local handoff protocol; joint application preview and explicit publication workflows in isolated tests | Production acceptance and all-browser compatibility |

The [returning-host report](../evals/host-validation/returning-journey.md) retains all six sessions and failures. The two actual semantic passes allowed an unapproved work-derived draft; they did not grant human consent or publish it. Synthetic adapter and transport tests remain separate engineering evidence.

Running a skill on your laptop may send selected material to your configured model provider. The deterministic assessment helper itself is offline. Explicit reviewer subprocesses receive only an already-minimized candidate or whole minimized contribution and use their configured provider/authentication boundary. No raw evidence is sent to Better Loop by this package. Optional exact contribution handoff runs a temporary loopback preview and requires the user to transfer it to a chosen website window; no automatic publication follows. Offline model inference is a separate capability requiring a compatible local model. See [current status](../STATUS.md) for executed evidence and limits; documentation/discovery is not a host behavior test.

Discovery conventions were checked against the official [Claude Code skills documentation](https://code.claude.com/docs/en/skills) and [Codex skills documentation](https://developers.openai.com/codex/skills) on 2026-09-14. Reading documentation is not a behavioral compatibility test.

## Automatic release awareness

Select an absolute cache directory dedicated to this skill installation, for example `<selected-skill-directory>/.release-cache`, alongside the exact helper entrypoint. The directory may be created inside an existing selected parent. Keep this selection in the scoped installation instructions or the current session; no global configuration is required. After the detector confirms the complete pinned package set, the skill automatically invokes `release-check` with that cache if session network/tool scope permits. Detector-only requests, help and capabilities do not check releases. The caller selects and passes the cache path explicitly within the chosen installation; if that location is unavailable or cache writes are outside scope, the skill checks once uncached for that entry.

The [installed release guide](../skills/better-loop/references/releases.md) covers disable/offline flags, bounded public metadata requests, dated cache observations and separate manual update/rollback. Cache failure never blocks private coaching. This instruction change has deterministic coverage; no new native host evaluation is claimed.
