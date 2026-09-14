# Claude Code and Codex discovery

The same `skills/better-loop/` directory serves both hosts. It is instruction-only. The contracts package adds deterministic checks; it does not implement assessment adapters, privacy clearance, model evaluation, or publication.

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

The copy runs only when the destination does not exist. Keep any existing installation intact until you have reviewed an update diff. Review the installed `SKILL.md` and all references. In Claude Code invoke `/better-loop`; in Codex invoke `$better-loop`, or select the skill in the skill picker. If discovery is stale, start a new session. Ask for a bounded review of an explicitly selected synthetic task; inspect the host's output before relying on it.

No global configuration is edited by this repository. For an update, compare the installed directory with the reviewed release, retain the previous copy, then replace only that directory. Rollback restores that copy. Uninstall removes only the chosen `.claude/skills/better-loop` or `.agents/skills/better-loop` directory.

| Surface | M1 status | Not established |
|---|---|---|
| Claude Code | Standard `SKILL.md` layout and repository-scoped discovery instructions | Executed behavioral scenarios, host adapter equivalence |
| Codex | Same `SKILL.md`, plus `agents/openai.yaml` display metadata | Executed behavioral scenarios, rubric validity on Codex |
| Node | Contracts and CLI tested | End-to-end coaching/export |
| Browser | Bundled validators/canonicalization tested in Chromium with restrictive CSP | Privacy review, publication, all-browser compatibility |

Running a skill on your laptop may send selected material to your configured model provider. No raw evidence is sent to Better Loop by this package. Offline model inference is a separate capability requiring a compatible local model.

Discovery conventions were checked against the official [Claude Code skills documentation](https://code.claude.com/docs/en/skills) and [Codex skills documentation](https://developers.openai.com/codex/skills) on 2026-09-14. Reading documentation is not a behavioral compatibility test.
