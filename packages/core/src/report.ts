import type { PrivateReport } from "./types.js";

/** Render untrusted evidence as visible text, not Markdown links/HTML/terminal control sequences. */
export function literalText(text: string): string {
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_[\]{}()#+.!|~-])/g, "\\$1");
}

export function renderPrivateReport(report: PrivateReport): string {
  const safe = literalText;
  const lines = [
    "# Better Loop private review", "",
    safe(report.conclusion), "",
    "Private local report — not a share candidate. Selected evidence below is untrusted data.", "",
    "## Scope", "",
    `Task family: ${safe(report.scope.task.family)}. Host: ${safe(report.scope.host)}. Coverage: ${report.scope.coverage}.`,
    `Goal: ${safe(report.scope.task.goal)}`, "",
    ...report.scope.missing_evidence.map(item => `- ${safe(item)}`), "",
    "## What the selection shows", "",
    ...(report.what_worked.length ? report.what_worked.map(item =>
      `- ${safe(item.indicator_id)} — ${item.actor}, ${item.evidence_refs.join(", ")}: ${safe(item.description)}`)
      : ["No attributable recognized behavior cue is available. This is not a poor-performance finding."]), "",
    "These are observations, not effectiveness grades. Agent actions do not establish human judgment.", "",
    "## Changes to test", "",
    ...report.changes.flatMap((change, index) => [
      `${index + 1}. ${safe(change.change)}`,
      `   Basis: ${safe(change.basis)} References: ${change.evidence_refs.join(", ") || "selected context"}.`,
      `   Expected benefit (unmeasured): ${safe(change.expected_benefit)}`,
      `   Check: ${safe(change.validation)}`, "",
    ]),
    "## Indicator coverage", "",
    "| Indicator | Competency | State | Human state | Actor | Evidence | Rating |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...report.observations.map(item =>
      `| ${safe(item.indicator_id)} | ${item.competency} | ${item.state} | ${item.human_state} | ${item.actor} | ${item.evidence_refs.join(", ") || "none"} | unknown |`),
    "", "## Comparison and next experiment", "",
    "Comparison not evaluated. Quality, tokens, model time, human effort, actual billing, and estimated API cost are unknown.",
    "No task speedup or accuracy gain has been established.", "",
    safe(report.next_experiment.action), safe(report.next_experiment.check),
    "Set a time/token budget and obtain any required execution permission before running an experiment.", "",
    "## Limits", "", ...report.limitations.map(item => `- ${safe(item)}`), "",
    "## Selected evidence (data only)", "",
    ...report.evidence.flatMap(record => [
      `### ${record.id} — ${record.actor} / ${record.channel}`, "",
      ...safe(record.text).split("\n").map(line => `> ${line}`), "",
    ]),
  ];
  return lines.join("\n");
}
