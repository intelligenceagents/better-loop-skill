# Research foundation and assessment implementation

Methodology version: `better-loop-fluency-0.1`. Sources inspected 2026-09-14. Better Loop is an independent adaptation; no Anthropic endorsement or certification is implied.

## What we use

The [AI Fluency Index](https://academy.claude.com/tutorials/the-ai-fluency-index) applies the 4D framework developed by Rick Dakan and Joseph Feller with Anthropic. Its initial study classifies 11 visible behaviors in 9,830 multi-turn Claude.ai conversations. The full framework contains 24 behaviors. The initial study is observational, covers only part of fluency, and does not establish an individual talent percentile or a causal treatment effect.

The four competencies are **Delegation, Description, Discernment, and Diligence**. Better Loop preserves the source chart's grouping for the 11 indicators below, using shorter labels and stable local IDs. The feedback and outcome checks are Better Loop proposals, not validated Anthropic assessment items.

| Stable ID | Competency | Behavior to look for | Better Loop coaching experiment |
|---|---|---|---|
| goal_definition | Delegation | Establishing the objective before execution | State the deliverable and acceptance criteria; test whether omissions decline |
| approach_consultation | Delegation | Discussing a strategy before implementation | Compare feasible approaches when warranted; check decision quality |
| iterative_refinement | Description | Improving the work through follow-up | Make a targeted revision after a failed check; measure whether the defect is resolved |
| quality_examples | Description | Showing examples of a suitable result | Supply a relevant example and counterexample; check consistency on unseen cases |
| output_structure | Description | Communicating the required output form | Define the structure needed by the reader or downstream tool; test acceptance |
| collaboration_mode | Description | Specifying the desired interaction | Request uncertainty, challenge, or concise checkpoints; check whether this helps |
| tone_preferences | Description | Making stylistic expectations explicit | Supply necessary tone constraints; use a stable review rubric |
| audience_definition | Description | Identifying who will use the result | Describe the reader's needs; review comprehension and usefulness |
| context_gap_detection | Discernment | Noticing missing information | Surface unknown assumptions; check for consequential omissions |
| reasoning_scrutiny | Discernment | Challenging a questionable conclusion | Request assumptions, evidence, or a counterexample; assess the justification |
| factual_verification | Discernment | Verifying consequential assertions | Check the original source or an appropriate independent test; track errors |

No Diligence indicator is among those 11. Do not guess responsibility from chat. Optional explicit evidence about disclosure, permission, and intended use can support a separate local Diligence reflection. It is not part of the replicated indicator set or a character rating. Never demand private business context to earn a score.

## How feedback follows research

The later [research-backed curriculum](https://academy.claude.com/tutorials/getting-good-at-claude-a-research-backed-curriculum) reports broader work across Chat, Code, and Cowork. It emphasizes goal definition on agentic surfaces, durable configuration, and repeated practice in evaluating outputs. Better Loop starts agentic coaching with the desired result, moves useful repeated instructions into scoped files, and checks each intervention. Codex remains a transfer hypothesis requiring its own validation. Do not advertise the source's findings as a completed cross-platform Better Loop study.

Do not optimize for using every indicator, writing longer prompts, or sending more messages. Select behavior appropriate to the problem and test its value. Requesting an explanation means a concise justification, assumptions, evidence, or checkable derivation; it does not require access to hidden model reasoning.

## Public implementation reference

Use [Anthropic's open-source skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator) for its evaluation loop. Its [instructions](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) describe baseline comparisons, expectation grading, human feedback, and iteration. The [blind comparator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/agents/comparator.md) and [benchmark aggregator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/aggregate_benchmark.py) are inspectable implementation references.

Build a host-neutral runner around this experimental structure. Do not blindly vendor the scripts. In the inspected aggregator, missing values can default to zero and output characters can be a fallback for tokens; Better Loop requires missing values to stay null and prohibits treating character counts as measured tokens. Freeze the rubric before inspecting results, allow inconclusive/tied outcomes, and counterbalance blinded presentation. Standard deviation alone is not a confidence interval or proof of improvement.

Pin the upstream commit when integrating and preserve required notices. The inspected skill-creator folder carries an Apache-2.0 license. This seed links to the approach and contains independently authored guidance and contracts; it does not copy upstream code. Better Loop's MIT license does not relicense upstream assets or course content.

## Three validation questions

1. **Can we observe the behavior reliably?** Create public/synthetic labeled cases across every task family, both hosts, short/long tasks, and varied language proficiency. Have two independent reviewers label a held-out subset with evidence and opportunity-to-observe. Report agreement, per-indicator precision/recall, errors, and missing coverage. Freeze the test set and record classifier/prompt versions. Do not tune and assess on identical examples.
2. **Does advice improve a task?** Run the paired protocol in [assessment.md](assessment.md) with prespecified acceptance checks and quality floors. Compare no-skill/with-skill and old/new versions. Retain neutral/adverse outcomes and all overhead. Repeat on unseen tasks. Human fluency, skill effectiveness, and model capability are different claims.
3. **Does improvement persist and transfer?** Observe later comparable work and distinguish retention from assisted performance. Disclose model/tool changes and self-selection. Role prediction is a later validation program requiring relevant outcomes, accessibility/fairness review, and separate participation consent.

The initial release offers descriptive coaching and evidence summaries. It has no calibrated universal score, no claim to reproduce Anthropic's private classifiers, and no validated hiring score. Activity counts and source population prevalence rates are not individual percentiles.

## Local record and public story

Local observations record indicator ID, actor, evidence reference, channel, observability state, optional ordinal rating, and limitations. Keep raw evidence local. Public candidates may include generalized human behavior observations with the same IDs and taxonomy, without source excerpts, paths, private hashes, or exact original work metrics. Version the methodology so revisions are not silently mixed.

Task quality, time/tokens, orchestration overhead, and creativity remain separate Better Loop measures. Creativity needs evidence of useful alternatives and task-specific review; surprising output or expensive tool use alone is not creative competence. No combined score is defined in v0.1.
