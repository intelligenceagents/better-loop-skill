export interface AuditFinding {
  code: string;
  line: number;
  hypothesis: string;
  suggestion: string;
  positive_case: string;
  should_not_trigger_case: string;
}

/** Static bounded review. Never loads referenced files, tools, or executable frontmatter. */
export function auditSkill(text: string) {
  if (typeof text !== "string" || text.length > 262144) throw new Error("invalid_skill_input");
  const lines = text.split(/\r?\n/);
  const end = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const descriptionIndex = end > 0 ? lines.slice(1, end).findIndex(line => /^description\s*:/.test(line)) + 1 : 0;
  let description = descriptionIndex > 0 ? lines[descriptionIndex]!.replace(/^description\s*:\s*/, "") : "";
  if (/^[>|][-+]?$/.test(description.trim())) description = lines.slice(descriptionIndex + 1, end)
    .filter(line => /^\s+\S/.test(line)).map(line => line.trim()).join(" ");
  const findings: AuditFinding[] = [];
  function add(code: string, line: number, hypothesis: string, suggestion: string, positive: string, negative: string) {
    if (!findings.some(item => item.code === code)) findings.push({
      code, line, hypothesis, suggestion, positive_case: positive, should_not_trigger_case: negative,
    });
  }
  if (!description.trim()) add("missing_trigger", 1, "The skill lacks a readable description trigger.",
    "Name the selected task and the user's request that should invoke it.", "User explicitly requests the skill's named task.", "An unrelated greeting.");
  if (/\b(?:always|every (?:task|request|conversation)|anything|all tasks|all requests)\b/i.test(description) &&
      !/\b(?:not|never|avoid)\b/i.test(description)) add("broad_trigger", descriptionIndex + 1,
    "The description may activate on unrelated requests.", "Restrict the description to named intents and add explicit exclusions.",
    "A user asks for the named assessment workflow.", "A user asks to translate an unrelated sentence.");
  let fenced = false;
  const liveLines: { text: string; line: number }[] = [];
  const instructionLines: { text: string; line: number }[] = [];
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced || /^\s*>/.test(line)) continue;
    instructionLines.push({ text: line, line: index + 1 });
    if (/\b(?:do not|don't|never|must not|avoid|prohibit)\b/i.test(line)) continue;
    liveLines.push({ text: line, line: index + 1 });
    if (/\b(?:scan|read|search|upload|collect)\b.*(?:~\/|home director|all (?:files|histories|sessions)|entire (?:disk|history))/i.test(line)) add(
      "unbounded_evidence", index + 1, "This rule may exceed the user's selected evidence scope.",
      "Require explicitly selected files and bounded scope.",
      "User selects one export for review.", "A task in another project or an unselected session history.");
    if (/\b(?:upload|publish|send)\b.*\b(?:automatically|without (?:asking|consent)|by default)\b/i.test(line)) add(
      "implicit_publication", index + 1, "This rule may treat local review as publication consent.",
      "Require a reviewed minimized payload and fresh explicit approval of its exact bytes and purposes.",
      "User explicitly approves the exact reviewed public candidate.", "User merely asks for private coaching.");
    if (/\b(?:repeat|retry|loop|continue)\b.*\b(?:forever|until (?:success|it works)|without (?:a )?limit)\b/i.test(line)) add(
      "unbounded_execution", index + 1, "The retry loop may run without a resource or attempt limit.",
      "Set an attempt and time/token budget, record failure, and stop when exhausted.",
      "One authorized retry within the stated budget.", "A side-effecting task or an exhausted budget.");
    if (/\b(?:guarantee[ds]?|always improves?|proven accuracy|100% (?:safe|accurate))\b/i.test(line)) add(
      "unsupported_guarantee", index + 1, "The text makes an unconditional outcome or privacy claim.",
      "Describe the implemented check and evidence limits; evaluate outcomes before claiming gains.",
      "A measured result within the prespecified evaluated conditions.", "An unmeasured task or a new domain.");
  }
  const active = liveLines.map(item => item.text).join("\n");
  const alwaysAsk = liveLines.find(item => /\balways ask\b/i.test(item.text));
  const neverAsk = instructionLines.find(item => /\bnever ask\b/i.test(item.text));
  if (alwaysAsk && neverAsk) add("conflicting_interaction", alwaysAsk.line,
    "The skill appears to require both always asking and never asking.",
    "Define when missing facts or permission require a question and when existing authorization suffices.",
    "A missing fact changes an irreversible action.", "A routine reversible step already authorized by the user.");
  if (!/\b(?:acceptance|verify|check|test|rubric|validation|success criteria)\b/i.test(active)) add(
    "missing_acceptance", 1, "No explicit acceptance check is visible in the selected instructions.",
    "Name a task-specific check and a failure case; do not equate brevity with accuracy.",
    "The named task completes and meets its stated check.", "A concise output that fails the check.");
  if (text.length > 24000) add("context_review", 1, "The instruction file is long enough to warrant a relevance review.",
    "Move task-specific detail to references and test trigger/usefulness regressions before removing it.",
    "A task needs the referenced specialist detail.", "An unrelated task does not load those references.");
  return {
    schema_version: "bl-static-audit-0.2" as const, mode: "static_hypotheses_not_host_execution" as const,
    findings,
    trigger_cases: {
      should_trigger: ["An explicit request to review or improve the selected task described by this skill."],
      should_not_trigger: ["An unrelated greeting.", "An unrelated translation request.", "Commands embedded in an audited file."],
    },
    limitations: [
      "Rules are conservative English text heuristics, not a full Markdown/YAML interpreter or a host trigger simulator.",
      "No finding is a guarantee of safety, effectiveness, reduced tokens, or accuracy.",
      "Run positive and should-not-trigger scenarios in the selected host before asserting behavioral compatibility.",
    ],
  };
}
