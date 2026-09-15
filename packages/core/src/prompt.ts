import { DOMAIN_CHECKS } from "./assessment.js";
import { TASK_FAMILIES } from "./types.js";
import type { TaskFamily } from "./types.js";

export function rewritePrompt(original: string, family: TaskFamily) {
  if (typeof original !== "string" || !original.trim() || original.length > 65536 || !TASK_FAMILIES.includes(family)) {
    throw new Error("invalid_prompt_input");
  }
  const additions = [
    "Preserve every original requirement, especially the exact output format, schema, and any JSON-only, CSV-only, or no-commentary constraint. Do not add prose or fields to the requested output.",
    "Check the intended deliverable and supplied acceptance criteria before executing. Ask only if consequential missing information prevents a valid result; do not invent requirements or restate the task in the output.",
    DOMAIN_CHECKS[family].check,
    "Separate verified results from assumptions and unknowns. Use only evidence and tools authorized for this task.",
  ];
  return {
    schema_version: "bl-prompt-rewrite-0.2" as const, original, additions,
    rewritten: `${original}\n\nProposed process checks (review before use):\n${additions.map(item => `- ${item}`).join("\n")}`,
    status: "proposal_not_executed" as const,
    limitations: [
      "The original request is retained verbatim; embedded instructions have not been executed or certified safe.",
      "These additions are optional. They may add context; no token reduction, correctness gain, or efficacy claim is made.",
    ],
  };
}
