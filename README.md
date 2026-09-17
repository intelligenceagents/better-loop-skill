# Better Loop

**Get better at working with AI. One real task at a time.**

Better Loop is a private coaching skill for **Claude Code and Codex**. Bring a task you worked on with AI. Leave with a clearer prompt, one change to try, and a concrete way to check the next result.

You choose the work it may read. Your history stays on your laptop. **No Better Loop account is needed; sharing is optional.**

[Get started](https://github.com/intelligenceagents/better-loop-skill/blob/main/README.md#start-your-first-loop) · [How it works](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/journey.md) · [Read the skill](https://github.com/intelligenceagents/better-loop-skill/blob/main/skills/better-loop/SKILL.md)

## A better next attempt

1. **Choose your scope:** one repository, several repositories you name, or selected exports.
2. **Improve your approach:** sharpen the prompt, delegation, judgment or result check.
3. **Try it on later work:** use the change, then check what actually happened.
4. **Keep the lesson:** save useful, neutral and negative results for your next attempt.

## Start your first loop

Install **from source on `main`**. These early packages are **not published on npm**. You need Git, Node 22 (the selected patch is in [`.nvmrc`](https://github.com/intelligenceagents/better-loop-skill/blob/main/.nvmrc)), npm 10.9.0, and a configured Claude Code or Codex installation.

```sh
git clone --branch main --single-branch https://github.com/intelligenceagents/better-loop-skill.git
cd better-loop-skill
npm ci
npm run build:local
git rev-parse HEAD
node skills/better-loop/scripts/detect-helper.mjs
```

Keep the printed commit with your installation details. Follow the [host install guide](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/hosts.md#install-only-the-chosen-host-skill) to copy the skill into your chosen project and connect it to this helper. It covers existing installations, updates and rollback.

In that project, invoke **`/better-loop` in Claude Code** or **`$better-loop` in Codex**, then ask:

> Review my current repository only. Help me improve how I work with AI: suggest one prompt change and one check for my next attempt. Ask for any missing task or dedicated local checkpoint path. Save the result there and keep it private.

For several repositories, replace the first sentence with: **“Review only these repositories: [your exact paths].”** There is no background history scan.

Building downloads public dependencies. Host reasoning uses your configured model provider, which may process the local material you select.

## Make AI work with your preferences

> Help me clarify my audience, output format, collaboration style, feedback, delegation boundaries, verification habits and next acceptance check. Propose a better prompt and a working agreement for this project. Show me the exact diff before applying it.

Those seven choices guide a project-scoped **`AGENTS.md` for Codex** or **`CLAUDE.md` for Claude Code**. You can explicitly select different host/model profiles. Review and approve the exact proposal; keep its rollback.

This adapts instructions, not model weights. Instruction following varies; a saved preference is preparation, and the next checked task supplies evidence. See the [personal coach guide](https://github.com/intelligenceagents/better-loop-skill/blob/main/skills/better-loop/references/coach.md).

## Return to your progress

> Return to my approved checkpoint at [exact local path]. Review only changed selected evidence, recall the earlier recommendation, and check whether the later result supports improvement. Keep missing measurements explicit.

The same selected checkpoint preserves history across chats and both hosts. Unchanged work creates no new assessment or progress credit; changed scope or conditions can prevent comparison. Open a [private progress viewer](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/journey.md#see-your-saved-progress) or use the [host request guide](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/host-prompts.md).

## Bring your field

| Work you do | Something to practice |
| --- | --- |
| Coding | Define a failure and its check before changing code |
| Analysis and finance | Make assumptions and discrepancies explicit |
| Research and strategy | Separate supported conclusions from uncertainty |
| Mathematics and science | Test assumptions, units and counterexamples |
| Writing and design | Specify the audience and review criteria |
| Operations and education | Clarify dependencies and acceptance checks |
| General tasks | Define a useful result before delegating |

Try one of [eight shared practice briefs](https://github.com/intelligenceagents/better-loop-skill/blob/main/packages/discovery/README.md). These are starting points; host support does not establish assessment validity in every field.

## Share a lesson only if you choose

The [hosted review website](https://better-loop.com) offers practice and preview. **Hosted authentication is unavailable; sign-in, public contribution data and publishing are disabled while production integration is completed.**

Optional sharing prepares a minimized improvement story. Raw code, documents, workflows and transcripts are not Better Loop uploads. Export requires privacy review and your approval of the exact content and purposes; changing either invalidates approval. See [privacy and reviewer setup](https://github.com/intelligenceagents/better-loop-skill/blob/main/skills/better-loop/references/reviewers.md).

Private coaching and history remain useful without sharing.

## Inspect the evidence

Behavioral coaching draws on [Anthropic's 4D framework and 11 observable indicators](https://github.com/intelligenceagents/better-loop-skill/blob/main/skills/better-loop/references/foundation.md). Outcomes, efficiency, missing evidence and verification stay separate. Better Loop has no universal person score or validated hiring prediction.

<details>
<summary>What the recorded checks show, including limits</summary>

- [Returning-host checks](https://github.com/intelligenceagents/better-loop-skill/blob/main/evals/host-validation/returning-journey.md) cover selected scope, saved recall and changed/unchanged work, with failures retained.
- [One frozen public-work comparison](https://github.com/intelligenceagents/better-loop-skill/blob/main/evals/public-work-benchmark/RESULTS.md) found equal quality and **1.05% more reported tokens** with guidance.
- [One retrospective validator repair](https://github.com/intelligenceagents/better-loop-skill/blob/main/evals/public-repair-proof/RESULTS.md) passed **16/24 → 24/24** known checks, with eight repaired and none regressed.

These are bounded engineering observations, not proof of human learning or guaranteed savings. [Current status](https://github.com/intelligenceagents/better-loop-skill/blob/main/STATUS.md) records implementation and verification limits.

</details>

## Build with us

[MIT licensed](https://github.com/intelligenceagents/better-loop-skill/blob/main/LICENSE), including commercial and corporate reuse. [Integration notifications](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/corporate-integration-and-reuse.md) are voluntary and should contain no confidential information.

<details>
<summary>Run contributor checks</summary>

After the source setup above, add Python 3.11 or later:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
npm run check
```

These checks use local fixtures and make no model calls. See [development](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/development.md) for browser and offline package checks.

</details>

[Contribute a patch](https://github.com/intelligenceagents/better-loop-skill/blob/main/CONTRIBUTING.md) · [Report a security issue privately](https://github.com/intelligenceagents/better-loop-skill/blob/main/SECURITY.md)
