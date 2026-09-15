# Prepare a local release candidate

This manual procedure prepares source, skill and ten npm package archives for review. It does not create a Git tag, GitHub release, npm publication or deployment. MIT remains unchanged. A candidate is not a signed or independently verified release, native host validation, semantic assessment or model benchmark.

## Local preparation

Use the repository's declared Node/npm versions and Python development dependencies (see [Contributing](../CONTRIBUTING.md)). Populate the npm cache with `npm ci` first. Activate the Python environment containing `requirements-dev.txt` before running the checks.

Commit the intended source first. The command rejects staged changes, unstaged changes, deleted tracked files and all nonignored untracked files. Clear any assume-unchanged or skip-worktree index flags first; they can conceal changes and are rejected. Ignored generated files are allowed but never used as build input. Choose a **new directory outside the checkout**, with an existing parent:

```sh
node tools/prepare-release-candidate.mjs --output /tmp/better-loop-review-1 --label review-1
```

The label is only an operator's review identifier. For example, a source CLI version of `0.4.0-draft.5` stays exactly that version regardless of the label. The receipt records the actual source CLI manifest version and full commit SHA; it never constructs a stable release tag from draft source.

Preparation uses `git archive` of the selected clean HEAD for `source.tar.gz` and `skill.tar.gz` (the `skills/better-loop` subtree). Normal committed Git archive attributes apply; submodules are rejected because their content is not included by Git archive. The source archive is extracted into a new temporary directory. No files, dependencies or existing archives from the working checkout are copied into it.

In that extracted source it runs offline locked dependency installation, `npm run check` (including build and package metadata checks), existing offline consumer/declaration checks, and `tools/pack-local.mjs`. The existing consumer tools repack the same build. An additional check installs the exact ten candidate archives offline using both npm install and npm ci, then imports every package as ESM and CommonJS. Each archive's name/version is compared with its source manifest and packed metadata, and its SHA-256 and SHA-512 integrity are recomputed and compared with the packer's receipt.

The output contains both Git archives, all ten npm archives, the packer's `local-release.json`, and a final `candidate.json`. The final receipt includes source identity, unchanged CLI version, exact archive hashes, completed check names, and Node/npm versions. It records no publication, tag or signature. These hashes identify the produced bytes; they do not promise reproducible compression across environments or prove narrative truth, privacy clearance or efficacy.

An existing output directory or symlink is rejected. On failure, partial output stays available for inspection and has no final `candidate.json`; use another new directory for a retry. Temporary build files and logs are removed. The checkout's clean state and HEAD are checked again before the success receipt. Filesystem checks are not protection against a malicious same-user process racing preparation.

## Manual GitHub workflow

[The candidate workflow](../.github/workflows/release-candidate.yml) has only `workflow_dispatch` and read-only repository permissions. Select the intended committed ref and enter a review label. It performs the same isolated preparation and uploads the candidate as a short-lived Actions artifact after all checks pass. Dispatching it authorizes that artifact upload to GitHub; local preparation alone uploads nothing. There is no push trigger or release/tag/publish command. This document does not assert that a hosted run has passed.

Review the exact receipt and candidate before any separately authorized publication. Revert the four candidate-tooling files to roll back this feature; no host configuration or license change is involved.

## A future published release

Release checks become meaningful only after a separately authorized maintainer publishes a stable release in this public repository. Prepare and review a clean source commit whose actual CLI manifest, exported CLI version, detector and matching skill requirements agree. For a stable publication, that CLI version must itself be stable SemVer; use the matching `v<CLI-version>` tag. Do not relabel draft source as a stable version in candidate metadata. Keep dependent package versions as actually built.

Before any such publication, reconcile the candidate's full source SHA, exact source/skill/archive hashes, completed deterministic checks, known limitations and rollback pair. Publish only those reviewed bytes and retain the candidate receipt alongside them; independently inspect the tag's resolved commit because GitHub `target_commitish` may name a branch. Select the release as GitHub's latest stable release deliberately: the notifier follows GitHub's latest designation, not the numerically highest tag. Draft/prerelease records do not qualify. A release/tag or matching hash string alone does not authenticate an installed source build.

This preparation creates no tag or published release. The [installed release guide](../skills/better-loop/references/releases.md) explains the check's fixed public requests, cache, optional notice and separate manual update/rollback.
