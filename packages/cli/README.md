# Better Loop local CLI

`@better-loop/cli@0.2.0-draft.1` provides local assessment, prompt proposals, static skill audits, contained instruction edits, and candidate preparation through the shared privacy helper. It has no uploader or identity service. Default commands need no account or network.

Build the reviewed source workspace, then use `node packages/cli/dist/cli.js` or the installed `better-loop` bin. These draft packages are distributed as reviewed local archives; do not assume a registry release.

```sh
better-loop capabilities --json
better-loop capture --task selected-task-context.json --artifact selected-change.diff --checks selected-check-output.txt --output selected.json
better-loop assess --host codex --input selected.json --format markdown --output private-report.md
better-loop assess --host claude_code --input selected.jsonl --task task.json --format json
better-loop rewrite --input selected-prompt.txt --family writing_design --output rewrite.json
better-loop audit --input selected-SKILL.md --output audit.json
```

Input files must be explicitly selected, bounded regular files with one hard link; symlink inputs, directories and malformed UTF-8 are rejected. No recursive discovery occurs. Private output files are created exclusively with mode 0600; existing files are never overwritten. Reports and rewrite proposals may contain the person's selected raw evidence and must stay private.

`capture` uses actual selected artifact/check text to create a portable partial export. The task context is supplied separately. It does not run tests, obtain a diff automatically, fabricate output, infer a human actor from code, or read history. Each selected excerpt must fit 16,384 characters; choose a relevant bounded excerpt instead of uploading a repository. Artifact authorship stays unknown; check output has the explicitly selected tool-result channel, which is not proof of independent verification. Capturing files is optional when a native or portable selected conversation export already exists.

Instruction editing is a separate explicit operation:

```sh
better-loop instructions plan --root selected-project --path AGENTS.md --after proposed.txt --output change.json
better-loop instructions apply --root selected-project --plan change.json --approve EXACT_APPROVAL_DIGEST
better-loop instructions rollback --root selected-project --plan change.json --approve EXACT_APPROVAL_DIGEST
```

Review the full diff and its digest first. Allowed paths are root `AGENTS.md`/`CLAUDE.md` or one `SKILL.md` under `skills/NAME`, `.agents/skills/NAME`, or `.claude/skills/NAME`. Parent directories must already exist. Global host directories, path escapes, symbolic links, hard links, unapproved plan edits, stale target bytes, and concurrent cooperating helper edits are rejected. The helper preserves exact UTF-8 bytes, BOM/newlines and file mode. Rollback restores the original bytes or removes the exact newly created file, refusing to overwrite subsequent edits.

Containment and replacement checks protect normal local editing, including changed parents between planning and applying. This is not an OS security sandbox against a hostile process racing filesystem syscalls under the same user account. Do not edit in a directory controlled by an adversary.

Candidate preparation uses only an already-minimized, strict share candidate:

```sh
better-loop draft-share --input candidate.json --consent purposes.json --output unapproved.json
better-loop draft-share --input candidate.json --consent purposes.json --reviewers chosen-reviewers.json --timeout-ms 30000 --output preview.json
better-loop draft-share --input candidate.json --consent purposes.json --reviewers chosen-reviewers.json --output confirmed.json --confirm --digest EXACT_PREVIEW_DIGEST
```

There is no default reviewer. Without exactly two configured passing reviews, clearance is blocked and the local draft remains unapproved. The shared privacy package is the sole scanner; CLI code does not provide an alternative scanner. A schema-invalid input stays in its original selected file and receives safe validation findings.

The reviewer configuration is a separately chosen JSON array of exactly two distinct objects, each with `id`, an absolute `command`, and an `args` string array. Commands run through `execFile` without a shell and receive only `{policy_version,instructions,candidate}` on stdin. They must return only the strict semantic verdict required by the privacy package. Each command has a time limit (default 30 seconds; maximum 120 seconds), a 64 KiB output cap, and cancellation. Commands may use their own configured model provider and host authentication; select and authorize that processing before invoking them. Do not construct this configuration from candidate strings or private report content.

Confirmation reruns the configured reviews and requires an explicit flag and matching current digest. Changed text or purposes invalidates it. The confirmed output file contains exactly the `LocalApproval` envelope accepted by the browser, with no outer status wrapper or review receipts. Unapproved preview files remain private and are not the browser handoff. The result is local approval, not a server attestation, a trust tier, a public link, or permission for automatic upload.

`measure`, `analyze`, and `milestones` delegate to the measurement workspace with explicitly selected records. `learn` accepts only controlled taxonomy and either an explicitly selected service or a selected public export. Offline/expired exports cannot generate automated recommendations. See the source workspace's `docs/local-learning.md` for the strict API, source citations, withdrawal/freshness behavior, and examples. These commands never run an experiment or upload evidence.
