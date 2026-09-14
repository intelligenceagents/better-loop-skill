import { INDICATORS, LOCAL_VERSION, METHODOLOGY_VERSION, TASK_FAMILIES, unknownMetrics } from "./types.js";
import type { EvidenceRecord, IndicatorId, NormalizedTask, Observation, PrivateReport, Recommendation, TaskFamily } from "./types.js";

const cues: Record<IndicatorId, { pattern: RegExp; description: string }> = {
  goal_definition: { pattern: /\b(?:goal|objective|deliverable|success means|acceptance criteria)\b\s*[:=-]?\s*\S/i, description: "An explicit objective or acceptance cue appears in the selected text." },
  approach_consultation: { pattern: /\b(?:compare (?:the )?(?:approaches|options)|which (?:approach|strategy)|before (?:implementing|starting)|propose (?:a |two |some )?(?:plan|approach)|trade-?offs)\b/i, description: "The selected text discusses a plan, strategy, or alternatives." },
  iterative_refinement: { pattern: /\b(?:revise|revision|try again|instead|adjust|correct|fix)\b/i, description: "A follow-up contains a revision cue; whether it improved the result needs an output check." },
  quality_examples: { pattern: /\b(?:for example|good example|counterexample|sample (?:output|answer)|example of|avoid this example)\b/i, description: "An example or counterexample cue is present; its relevance has not been graded." },
  output_structure: { pattern: /\b(?:format (?:as|in)|return (?:a |an )?(?:json|table|list)|output (?:format|structure)|use (?:a |an )?(?:table|headings|bullets)|schema)\b/i, description: "The selected text states an output structure cue." },
  collaboration_mode: { pattern: /\b(?:ask (?:me|before)|challenge (?:me|my)|flag uncertainty|checkpoints?|work independently|keep me informed|clarifying questions)\b/i, description: "The selected text specifies a collaboration preference." },
  tone_preferences: { pattern: /\b(?:tone|style)\s*[:=-]|\b(?:plain language|formal tone|concise prose|friendly tone)\b/i, description: "The selected text specifies a style or tone preference." },
  audience_definition: { pattern: /\b(?:audience|reader|readers|intended for|written for)\b/i, description: "The selected text identifies a reader or audience cue." },
  context_gap_detection: { pattern: /\b(?:missing (?:information|context|data)|unknown assumption|what (?:is|are) (?:missing|unknown)|we (?:do not|don't) know|clarify (?:the |this )?assumption)\b/i, description: "The selected text explicitly raises a context gap." },
  reasoning_scrutiny: { pattern: /\b(?:what evidence|check (?:the |your )?(?:assumptions|reasoning)|justify (?:the |your )?(?:claim|conclusion)|why (?:does|is|would)|counterexample|alternative explanation)\b/i, description: "The selected text questions a conclusion or its supporting reasoning." },
  factual_verification: { pattern: /\b(?:verify|verified|cross-check|cross-checked|reconcile|reconciled|original source|independent test|test (?:passed|failed|result)|tests (?:passed|failed))\b/i, description: "A verification cue is present; this is not proof that the check was independent or correct." },
};

export const DOMAIN_CHECKS: Record<TaskFamily, { change: string; check: string; benefit: string }> = {
  software: {
    change: "Define a behavior check for the requested change and a relevant failure case.",
    check: "Reproduce the original failure, then run the same behavior check and an unchanged regression check.",
    benefit: "May catch a fix that only satisfies an unrelated or weakened test.",
  },
  analysis_finance: {
    change: "State units and assumptions, reconcile totals, and select a sensitivity check.",
    check: "Recompute a sample from its source, reconcile the total, and vary one consequential assumption.",
    benefit: "May expose unit errors or conclusions that depend on an unstated assumption.",
  },
  research_strategy: {
    change: "Separate source-backed statements from inference and include a competing explanation.",
    check: "Trace consequential claims to the selected sources and review an alternative explanation against them.",
    benefit: "May make unsupported conclusions and decision uncertainty easier to see.",
  },
  mathematics_science: {
    change: "State assumptions and choose a boundary case or counterexample before accepting the derivation.",
    check: "Check each consequential step, units when relevant, and at least one limiting case with a competent reviewer.",
    benefit: "May uncover a plausible explanation that does not establish the result.",
  },
  writing_design: {
    change: "Set the intended audience and a brief-specific review rubric before revising.",
    check: "Review original and revised work blind against the same brief, audience needs, and accuracy criteria.",
    benefit: "May distinguish a useful revision from a change in style alone.",
  },
  operations_education: {
    change: "Define the intended action or learning outcome and an exception the plan must handle.",
    check: "Walk through a normal case and an exception; check that the intended reader can complete the action.",
    benefit: "May expose missing dependencies or instructions that are difficult to use.",
  },
  general: {
    change: "Define a checkable deliverable and one failure case for this task.",
    check: "Compare the delivered result with the stated criteria and review one plausible failure case.",
    benefit: "May make the next attempt easier to assess without collecting more private context.",
  },
};

// A match is only a lexical cue. Quoted/code blocks and explicitly negated sentences do not establish behavior.
function cueText(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "")
    .split("\n").filter(line => !/^\s*>/.test(line))
    .join("\n").replace(/"[^"\n]*"|'[^'\n]*'/g, "")
    .split(/(?<=[.!?])\s+|\n/)
    .filter(sentence => !/\b(?:do not|don't|never|did not|didn't|not going to|no need to)\b/i.test(sentence))
    .join("\n");
}

function matches(record: EvidenceRecord, id: IndicatorId, index: number, records: EvidenceRecord[]): boolean {
  if (record.channel === "artifact" || record.channel === "tool_result") return false;
  if (id === "iterative_refinement" &&
      !records.slice(0, index).some(previous => previous.actor === record.actor && previous.channel === record.channel)) return false;
  return cues[id].pattern.test(cueText(record.text));
}

export function observe(input: NormalizedTask): Observation[] {
  const hasHuman = input.records.some(record => record.actor === "human" && record.channel === "conversation");
  return (Object.keys(INDICATORS) as IndicatorId[]).map(id => {
    const reason = input.task.not_applicable?.[id];
    if (reason !== undefined) {
      return { indicator_id: id, competency: INDICATORS[id], state: "not_applicable", human_state: "not_applicable",
        actor: "unknown", channel: null, evidence_refs: [], rating: null,
        description: `User-declared not applicable: ${reason}`,
        limitations: ["Applicability is selected context, not an inference about a person's ability."] };
    }
    const matching = input.records.filter((record, index) => matches(record, id, index, input.records));
    const first = matching.find(record => record.actor === "human") ?? matching[0];
    const humanMissing = input.coverage === "partial" || !hasHuman ? "insufficient_evidence" : "not_observed";
    if (!first) return {
      indicator_id: id, competency: INDICATORS[id], state: humanMissing, human_state: humanMissing,
      actor: "unknown", channel: null, evidence_refs: [], rating: null,
      description: humanMissing === "not_observed"
        ? "No recognized cue in the selected human conversation; absence is not evidence of inability."
        : "The selection does not support a conclusion about this human behavior.",
      limitations: ["The deterministic cue rules are English-only and can miss paraphrases, context, or non-text evidence."],
    };
    return {
      indicator_id: id, competency: INDICATORS[id], state: "observed",
      human_state: first.actor === "human" ? "observed" : humanMissing,
      actor: first.actor, channel: first.channel,
      evidence_refs: matching.filter(record => record.actor === first.actor && record.channel === first.channel).map(record => record.id),
      rating: null, description: cues[id].description,
      limitations: ["Lexical cue only; no effectiveness or ordinal rating has been established.",
        ...(first.actor === "human" ? [] : ["This actor's action is not evidence of human judgment."])],
    };
  });
}

export function assess(input: NormalizedTask): PrivateReport {
  if (input.schema_version !== LOCAL_VERSION || !TASK_FAMILIES.includes(input.task.family)) throw new Error("unsupported_local_input");
  const observations = observe(input);
  const domain = DOMAIN_CHECKS[input.task.family];
  const humanRefs = input.records.filter(record => record.actor === "human").map(record => record.id);
  const changes: Recommendation[] = [{
    change: domain.change, evidence_refs: humanRefs.slice(0, 1), basis: "Process coaching selected for the declared task family; outcome quality is unknown.",
    expected_benefit: domain.benefit, validation: domain.check,
  }];
  if (input.task.acceptance_criteria.length === 0) changes.push({
    change: "Write one observable acceptance criterion before the next attempt.",
    evidence_refs: [], basis: "No acceptance criteria were supplied in the selected task context.",
    expected_benefit: "May make omissions and rework easier to detect.",
    validation: "Have a reviewer decide whether the result meets that criterion without seeing which attempt produced it.",
  });
  if (input.coverage === "partial" || !humanRefs.length) changes.push({
    change: "For a human-behavior review, select the relevant human decision and the response or check it informed.",
    evidence_refs: [], basis: "The selection is partial or contains no attributable human messages.",
    expected_benefit: "May improve attribution without collecting unrelated task history.",
    validation: "Confirm each claimed human decision has a selected human evidence reference; keep other observations unknown.",
  });
  else if (!observations.some(observation => observation.indicator_id === "factual_verification" && observation.human_state === "observed")) changes.push({
    change: "Choose one consequential claim to verify and retain the result of that check locally.",
    evidence_refs: humanRefs.slice(-1), basis: "No recognized human verification cue appears in this selection.",
    expected_benefit: "May reveal a consequential error; the cue's absence does not establish that no check occurred.",
    validation: domain.check,
  });
  return {
    schema_version: "bl-report-0.2", methodology_version: METHODOLOGY_VERSION,
    classification: "private_local_report_not_share_candidate",
    conclusion: `For the next attempt: ${domain.change}`,
    scope: {
      host: input.host, source_format: input.source_format, task: structuredClone(input.task),
      coverage: input.coverage, evidence_count: input.records.length,
      missing_evidence: [...input.limitations, "Task outcome and complete resource measurements are unavailable.",
        ...(!humanRefs.length ? ["No human conversation evidence was selected."] : [])],
    },
    observations, what_worked: observations.filter(observation => observation.state === "observed").slice(0, 3),
    changes: changes.slice(0, 3), metrics: unknownMetrics(), outcome: "unknown", comparison: "not_evaluated",
    next_experiment: { action: domain.change, check: domain.check, resource_estimate: null },
    limitations: [
      "Deterministic English cue detection provides descriptive process coaching, not an LLM judgment or a validated classifier.",
      "Selected evidence is user-controlled; actor labels and completeness are not independently verified.",
      "No universal score, percentile, measured improvement, or job-fit inference is produced.",
      "Diligence is outside the 11 mapped indicators; no character or responsibility rating is inferred.",
      "This private report contains selected evidence. It is not an approved public payload.",
      "These helpers make no model-provider or Better Loop requests. A host reading this report uses its configured provider boundary.",
    ],
    evidence: structuredClone(input.records),
  };
}
