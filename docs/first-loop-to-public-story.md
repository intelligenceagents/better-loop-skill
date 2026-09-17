# Your first loop, from private coaching to an optional public story

Start in Codex or Claude Code with a real task. The skill helps you choose one
change and a check for the next attempt. Your private report is useful whether
or not you share anything.

Install the source-built helper and the skill for your selected project using
the [host guide](https://github.com/intelligenceagents/better-loop-skill/blob/main/docs/hosts.md).
The early packages are not published on npm.

## 1. Choose the work

Invoke `$better-loop` in Codex or `/better-loop` in Claude Code:

> Review this repository only. Help me improve how I work with AI. Ask for the
> task and acceptance criteria if they are missing. Use my approved local
> checkpoint, or help me choose one. Keep the result private.

For several repositories, name their exact paths. There is no global repository
or session-history scan. The first run establishes a baseline; it does not claim
improvement.

**Produced privately:** the selected scope, a checkpoint, bounded evidence and
an assessment. The host report contains a summary, diagnosis, next action,
acceptance check and limitations. Missing measurements stay unknown.

## 2. Choose one change

Review the recommendation. For example, a task may need explicit acceptance
criteria or a check that covers both the failure and the cases that already
work. That is a proposed next step, not an action the person has already taken.

If a prompt or working agreement would help:

> Propose one better prompt for this task. Show the exact project instruction
> diff and its rollback before applying it.

**Produced privately:** a proposed prompt, acceptance check and an optional
scoped `AGENTS.md` or `CLAUDE.md` plan. Applying it needs approval of that exact
change. It changes instructions, not model weights. Start a new host session
when testing newly applied project instructions.

## 3. Try it, then return

Do the later task and retain its actual check. Then ask:

> Return to my approved checkpoint. Review only changed selected evidence.
> Recall the earlier recommendation and ask what I tried. Check the later
> result against the acceptance criteria. Keep unsuccessful and missing
> results visible.

**Produced privately:** a delta assessment, saved feedback and the next check.
If evidence is unchanged, the skill recalls the previous result without a new
assessment or progress credit. Changed scope or incompatible conditions can
require a fresh baseline.

Ask for a private HTML progress report at an exact local output path. It shows
saved assessments, recommendations, feedback and evidence-backed practice
states. The viewer itself makes no model or network request; host reasoning may
process selected work through your configured model provider.

## 4. Decide whether to share

After useful feedback, the skill may offer once:

> Would you like to keep this private, or prepare a generalized story to share?

Declining ends the sharing flow. Private coaching and history continue.
Choosing to prepare a story does not authorize publication.

**Produced privately:** a fresh minimized draft containing a generalized
problem, the changed approach, supported observations, a reusable lesson and
limitations. Raw code, company documents, transcripts, private reports and
screenshots are not attachments. The draft starts as **not cleared for upload**.

Sharing preparation requires two explicitly configured semantic reviewers.
There is no bundled default reviewer. Use the
[reviewer setup guide](https://github.com/intelligenceagents/better-loop-skill/blob/main/skills/better-loop/references/reviewers.md).
Missing, failed or disagreeing reviews block sharing; they do not block coaching.

## 5. Approve the exact public preview

Inspect every field, the recipient and each separate purpose:

- Public story display.
- Community learning.
- Benchmark aggregation.
- Candidate discovery.

All choices start off. Public display must be on to publish; the others are
independent and optional. More disclosure earns no ability or achievement credit.

The confirmation binds the exact content, purposes, recipient and digest.
Changed content or purposes need a new review and approval. Successful local
review is not server verification or automatic publication.

**Produced privately:** an approved minimized candidate. Optional browser
handoff provides a temporary local preview URL; alternatively, import the
approved JSON manually into the website preview. Private history is never
that upload file.

## 6. Publish on the website

Open the local handoff yourself and use its website button, or visit
[Better Loop](https://better-loop.com) for manual preview. Review the candidate,
sign in with an email code and choose a public nickname. The host does not
read your code or browser session.

Explicitly select **Publish** after inspecting the content and purposes.
The server validates ownership, consent and the contribution, performs its
required reviews, and publishes only when admission is available.

**Produced publicly:** a readable story and its link. Your email and raw work
do not appear in the story. **Produced for the owner:** submitted-version
history and controls to unpublish or delete. Editing a story is not itself
evidence that your work improved.

## A real published result

[Check both valid and invalid records after a repair](https://better-loop.com/stories/f96aedb4-a13c-4dfb-8ca0-cb54a05f56b7)
reports a real public validator comparison: 16 of 24 checks before, 24 of 24
after, eight repaired and none regressed on those known cases.

It is a bounded software repair, not proof of human learning, hiring ability
or general improvement. Its public-story permission does not automatically
include learning, benchmark or candidate-discovery use.

The website's public beta availability and operating limits are separate from
the local skill. If publication is paused, keep the approved draft private and
continue your next loop.
