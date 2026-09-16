# Better Loop

### Get better at working with AI. One real task at a time.

You finish a task with AI. Something worked. Something took three attempts. What should you do differently next time?

**Better Loop helps you turn that experience into a clearer prompt, a useful check, and a lesson you can return to.** Run it in Claude Code or Codex, choose the work it may see, and keep your progress on your laptop.

**Private first · Your choice of scope · Saved history · Open source · MIT**

[Get started](#start-your-first-loop) · [Explore the website](https://better-loop-web-o4bzaktxra-uk.a.run.app) · [How it works](docs/journey.md) · [Read the skill](skills/better-loop/SKILL.md)

## A better next attempt

1. **Choose real work.** Use your current repository, an explicit set of repositories, or selected exports. No background history scan.
2. **Find one useful change.** Sharpen the goal, prompt, delegation or acceptance check. Make the next attempt deliberate.
3. **Shape how AI works with you.** Review a scoped `AGENTS.md` or `CLAUDE.md` proposal based on your preferences. Apply the exact diff when you choose; retain its rollback.
4. **Return and compare.** Reuse your saved local checkpoint. Review changed evidence, revisit the earlier check, and keep the result—even when the change did not help.

Your history survives a new chat because it lives in an explicitly selected local checkpoint. Unchanged work does not create a fresh assessment or progress credit. [See your saved progress](docs/journey.md#see-your-saved-progress) in a private HTML viewer.

## Start your first loop

You need Git, Node 22 with npm 10.9.0, and a configured **Claude Code or Codex** installation. Build from `main` in a new directory:

```sh
git clone --branch main --single-branch https://github.com/intelligenceagents/better-loop-skill.git
cd better-loop-skill
npm ci
npm run build:local
node skills/better-loop/scripts/detect-helper.mjs
```

Then follow the [host install guide](docs/hosts.md#install-only-the-chosen-host-skill) to copy the skill into your chosen project and point it at this built helper. The guide preserves an existing installation and explains updates and rollback. Keep the checkout's commit if you need to reproduce your installed version.

In your selected project, invoke **`/better-loop` in Claude Code** or **`$better-loop` in Codex**, then ask:

> Review my current repository only. Help me identify one change in how I work with AI and a concrete check for my next attempt. Use a dedicated local checkpoint so I can return to this result. Ask for any missing task or state-directory choice. Keep this private.

Use [ready-to-copy requests](docs/host-prompts.md) for several repositories, returning to saved state, viewing progress or preparing an optional story.

The source packages are early versions and are **not published on npm**. Building needs public dependencies; private coaching needs no Better Loop account. Host reasoning uses your configured model provider.

## Bring the work you actually do

Better Loop covers coding, analysis and finance, research and strategy, mathematics and science, writing and design, operations and education, and general tasks.

| Your next task | A useful thing to practice |
| --- | --- |
| Diagnose a software error | Define the failure and the check before changing code |
| Reconcile an analysis | Make assumptions, source coverage and discrepancies explicit |
| Synthesize research | Separate supported conclusions from uncertainty |
| Draft for a reader | Specify audience, examples and a review rubric |
| Coordinate a plan | Clarify dependencies, decisions and acceptance criteria |

These are starting points for your own work. Choose among [eight shared practice briefs](packages/discovery/README.md), adapt the prompt, and use the same check on a later attempt.

## Make your working preferences explicit

Ask for the feedback, level of detail, delegation and verification you want. The [personal coach](docs/personal-coach.md) prepares a prompt and a project-scoped working agreement. Named host/model profiles let you choose different guidance for different tools.

You review the proposal before it changes a file. It does not train a model or guarantee instruction following. Applying a preference is preparation; the next checked result is the evidence.

## Progress worth keeping

Keep a useful reflection, a deliberate test and a checked follow-up. Preserve weak and negative results too. Copies, token spending and posting volume earn no competence credit.

The comparison tools group consented reports by problem, difficulty, conditions, quality and measurement version. Quality and relative token usage stay separate. Numerical community views require at least **20 eligible contributors** and remain uncalibrated; there is no universal person score or validated hiring prediction.

The [hosted website](https://better-loop-web-o4bzaktxra-uk.a.run.app) currently offers practice and story preview. **Sign-in, public contribution data and publishing are disabled while production integration is completed.**

## Your work stays yours

Raw workflows, code, documents and transcripts are not Better Loop uploads. Your configured model provider may process the local evidence you select; that is a separate boundary from Better Loop.

Optional sharing prepares a minimized lesson. It requires privacy review and your approval of the exact content and purposes. Changing either invalidates approval. Sharing is never required for private coaching. Read the [privacy boundaries](skills/better-loop/references/privacy.md) and [reviewer setup](skills/better-loop/references/reviewers.md).

## Inspect the evidence

We keep outcomes that do not support the promise:

- [Real returning-host checks](evals/host-validation/returning-journey.md) exercise selected scope, saved recall and changed/unchanged work in both hosts, with failures retained.
- [One frozen public-work comparison](evals/public-work-benchmark/RESULTS.md) found equal quality and **1.05% more reported tokens** with guidance.
- [One retrospective validator repair](evals/public-repair-proof/RESULTS.md) passed **16/24 → 24/24** known checks, with eight repaired and none regressed.

These are bounded engineering observations, not proof of human learning or guaranteed savings. Behavioral observations draw on [Anthropic's 4D framework and 11 observable indicators](skills/better-loop/references/foundation.md); outcomes, missing evidence and verification remain separate. [Current status](STATUS.md) records the implementation and its limits.

## Build with us

MIT welcomes personal, commercial and corporate reuse. [Tell us about your integration](docs/corporate-integration-and-reuse.md) if you would like to; notification is voluntary and should contain no confidential information.

For contributor checks, add Python 3.11 or later to the setup above:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
npm run check
```

These automated checks use local fixtures and make no model calls. See [development](docs/development.md) for browser and offline package checks, [contributing](CONTRIBUTING.md) for patches, and [security](SECURITY.md) for private vulnerability reports.

**Bring one real task. Leave with one useful next check.**
