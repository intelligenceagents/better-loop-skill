# Better Loop local core

`@better-loop/core@0.2.0-draft.1` provides deterministic private process coaching. It makes no file reads, subprocess calls, model calls, or network requests. Node 22 or later is required. The report is private local evidence, **not a public share candidate**.

```ts
import { assess, renderPrivateReport, rewritePrompt, auditSkill } from "@better-loop/core";
import { normalizeSelectedExport } from "@better-loop/adapters";

const selected = normalizeSelectedExport(selectedJson, "codex");
const report = assess(selected);
const markdown = renderPrivateReport(report);
const rewrite = rewritePrompt("Return only the requested JSON.", "analysis_finance");
const audit = auditSkill(selectedSkillText);
```

`assess` returns 11 source-mapped observations with actor, channel, local evidence references, descriptive state, separate human state, and a null rating. It provides at most three grounded process changes, validation methods, one next experiment, and explicit evidence limits. All seven declared task families have distinct checks. Outcome quality and resource metrics remain null; use a separately evaluated measurement protocol for comparisons.

The rules recognize conservative English lexical cues. A cue is not a completed action, human ability, efficacy, or an ordinal performance rating. Quoted/code-block and negated text are omitted from cue matching, and tool outputs/artifacts never become conversation fluency. False positives and missed paraphrases remain possible. This is not a reproduction of a proprietary classifier. Independent held-out calibration and domain validation have not been established.

`rewritePrompt` preserves the original text verbatim and adds optional process checks that explicitly preserve exact output constraints. It proposes a rewrite without running it. `auditSkill` returns static hypotheses, line references, positive cases, and should-not-trigger cases without loading references or executing instructions.

`createInstructionPlan(relativePath, beforeOrNull, after)` returns exact before/after strings, SHA-256 byte preconditions, an approval digest and a unified diff. `validateInstructionPlan` checks its complete shape and integrity. The CLI owns filesystem containment and explicit application/rollback. No source contracts or sharing semantics are changed by this local format.
