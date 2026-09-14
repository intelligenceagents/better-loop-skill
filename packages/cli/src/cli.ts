#!/usr/bin/env node
import { parseJson, validateShareCandidate } from "@better-loop/contracts";
import type { PreviewConsent } from "@better-loop/contracts";
import { normalizeSelectedExport, parseTaskContext, TEXT_LIMIT } from "@better-loop/adapters";
import { assess, auditSkill, literalText, renderPrivateReport, rewritePrompt, TASK_FAMILIES, selectLearningLessons, renderLearningProposals } from "@better-loop/core";
import type { Host, TaskFamily } from "@better-loop/core";
import { buildCandidate, confirmPreview, prepareCandidate } from "@better-loop/privacy";
import { measureEvaluation, analyzeEvaluation, repeatedImprovement } from "@better-loop/measurement";
import type { EvaluationInput, MeasurementOptions } from "@better-loop/measurement";
import { capabilities, configuredReviewers, planInstructionChange, applyInstructionChange, readSelectedFile, writePrivateOutput, learnFromService, journeyCommand } from "./index.js";
import { JourneyError } from "@better-loop/journey";
import { confirmContribution, prepareContribution, validateContribution, CONTRIBUTION_SCHEMA_VERSION } from "@better-loop/evidence";
import type { ContributionConsent } from "@better-loop/evidence";
import { startHandoff } from "@better-loop/handoff";
import { configuredContributionReviewers } from "./reviewers.js";

const HELP = `Better Loop local helper
  better-loop capabilities --json
  better-loop journey create --state selected-dedicated-directory --root exact-repository [--root another-repository] --task selected-task.json
  better-loop journey use --state selected-directory --host codex|claude_code [--expected checkpoint-id] [--excerpt-bytes 8192] [--excerpt-files 8] [--excerpt-path relative-file]
  better-loop journey record-assessment --state selected-directory --expected checkpoint-id --host codex|claude_code --input actual-host-report.json
  better-loop journey outcome --state selected-directory --expected checkpoint-id --recommendation report-id --status not_tried|declined|helped|did_not_help|inconclusive [--note-file selected-note.txt] [--acknowledge --origin work_derived|synthetic] [--check selected-followup.json --check-evidence selected-actual-check.txt]
  better-loop journey inspect|history|progress --state selected-directory [--format json]
  better-loop journey update --state selected-directory --expected checkpoint-id --root exact-repository [--root another-repository] --task selected-task.json
  better-loop journey reset --state selected-directory --scope-id exact-scope-id --expected checkpoint-id
  better-loop journey forget --state selected-directory --scope-id exact-scope-id
  better-loop journey recover-lock --state selected-directory --lock-token exact-stale-token
  better-loop capture --task selected-task-context.json [--artifact selected-diff-or-document.txt] [--checks selected-check-output.txt] --output new-selected-export.json
  better-loop assess --host claude_code|codex --input selected.json [--task task.json] [--format markdown|json] [--output new-file]
  better-loop rewrite --input prompt.txt --family software|analysis_finance|research_strategy|mathematics_science|writing_design|operations_education|general [--output new-file]
  better-loop audit --input SKILL.md [--output new-file]
  better-loop measure|analyze --input selected-local-record.json [--options selected-protocol-and-evidence.json] [--output new-file]
  better-loop milestones --input selected-local-records-with-options.json [--output new-file]
  better-loop learn --query controlled-taxonomy.json (--service explicit-origin | --lessons selected-public-export.json) [--format markdown|json] [--output new-file]
  better-loop instructions plan --root selected-project --path AGENTS.md --after proposed.txt --output new-plan.json
  better-loop instructions apply|rollback --root selected-project --plan plan.json --approve exact-approval-digest
  better-loop draft-share --input minimized-candidate.json --consent purposes.json --output new-draft.json [--reviewers selected-commands.json] [--timeout-ms 30000] [--confirm --digest exact-preview-digest]
  better-loop draft-share --input minimized-candidate.json --capability selected-capability.json --consent contribution-purposes.json --output new-draft.json [--reviewers selected-commands.json] [--confirm --digest exact-preview-digest] [--handoff --target-origin explicitly-chosen-origin --ttl-ms 120000]
Outputs may contain private selected evidence. Output files are exclusive and mode 0600.
Default commands have no network/model calls. draft-share reviewer commands are explicit opt-in and receive only a minimized candidate or whole minimized contribution.
learn --service makes an explicit public GET with controlled taxonomy only; offline exports produce no automated recommendations.
No upload transport. Static cue detection is not a validated assessment or a measured improvement.`;

function options(argv: string[], allowed: string[], flags: string[] = []) {
  const output: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]!;
    if (!key.startsWith("--") || !allowed.includes(key.slice(2)) || Object.hasOwn(output, key.slice(2))) throw new Error("invalid_cli_options");
    if (flags.includes(key.slice(2))) output[key.slice(2)] = true;
    else {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error("missing_cli_option_value");
      output[key.slice(2)] = value;
    }
  }
  return output;
}
function required(opts: Record<string, string | true>, key: string): string {
  const value = opts[key];
  if (typeof value !== "string" || !value) throw new Error("missing_cli_option");
  return value;
}
async function emit(value: unknown, output?: string | true, markdown = false) {
  const text = (markdown ? String(value) : JSON.stringify(value, null, 2).replace(
    /[\u202a-\u202e\u2066-\u2069]/gu, character => `\\u${character.charCodeAt(0).toString(16)}`,
  )) + "\n";
  if (typeof output === "string") { await writePrivateOutput(output, text); process.stdout.write('{"state":"written_local_file"}\n'); }
  else process.stdout.write(text);
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === "--help" || command === "help") { process.stdout.write(`${HELP}\n`); return; }
  if (command === "--version") { process.stdout.write(`${capabilities().helper_version}\n`); return; }
  if (command === "capabilities") {
    options(args, ["json"], ["json"]); await emit(capabilities()); return;
  }
  if (command === "journey") {
    const result = await journeyCommand(args);
    await emit(result.value, result.output, result.markdown); return;
  }
  if (command === "capture") {
    const opts = options(args, ["task", "artifact", "checks", "output"]);
    const output = required(opts, "output");
    const task = parseTaskContext(parseJson(await readSelectedFile(required(opts, "task"), 32768)));
    if (typeof opts.artifact !== "string" && typeof opts.checks !== "string") throw new Error("explicit_selected_evidence_required");
    const messages: { actor: string; channel: string; text: string }[] = [];
    for (const key of ["artifact", "checks"] as const) {
      if (typeof opts[key] !== "string") continue;
      const selected = await readSelectedFile(opts[key], 65536);
      if (!selected.trim() || selected.length > TEXT_LIMIT) throw new Error("select_a_bounded_evidence_excerpt");
      messages.push({
        actor: key === "checks" ? "tool" : "unknown", channel: key === "checks" ? "tool_result" : "artifact", text: selected,
      });
    }
    await emit({ schema_version: "bl-selected-0.2", task, coverage: "partial", messages }, output);
    return;
  }
  if (command === "assess") {
    const opts = options(args, ["host", "input", "task", "format", "output"]);
    const host = required(opts, "host");
    if (host !== "claude_code" && host !== "codex") throw new Error("unsupported_host");
    const format = opts.format ?? "markdown";
    if (format !== "markdown" && format !== "json") throw new Error("invalid_output_format");
    const task = typeof opts.task === "string" ? parseTaskContext(parseJson(await readSelectedFile(opts.task, 32768))) : undefined;
    const input = normalizeSelectedExport(await readSelectedFile(required(opts, "input")), host as Host, task ? { task } : {});
    const report = assess(input);
    await emit(format === "markdown" ? renderPrivateReport(report) : report, opts.output, format === "markdown"); return;
  }
  if (command === "rewrite") {
    const opts = options(args, ["input", "family", "output"]);
    const family = required(opts, "family") as TaskFamily;
    if (!TASK_FAMILIES.includes(family)) throw new Error("unsupported_task_family");
    await emit(rewritePrompt(await readSelectedFile(required(opts, "input"), 65536), family), opts.output); return;
  }
  if (command === "audit") {
    const opts = options(args, ["input", "output"]);
    await emit(auditSkill(await readSelectedFile(required(opts, "input"), 262144)), opts.output); return;
  }
  if (command === "measure" || command === "analyze") {
    const opts = options(args, ["input", "options", "output"]);
    const input: unknown = parseJson(await readSelectedFile(required(opts, "input"), 32 * 1024 * 1024));
    const measurementOptions: MeasurementOptions = typeof opts.options === "string"
      ? parseJson(await readSelectedFile(opts.options, 32 * 1024 * 1024)) as unknown as MeasurementOptions : {};
    const result = command === "measure" ? measureEvaluation(input, measurementOptions) : analyzeEvaluation(input, measurementOptions);
    await emit(result, opts.output);
    if (!result.valid) process.exitCode = 1;
    return;
  }
  if (command === "milestones") {
    const opts = options(args, ["input", "output"]);
    const input: unknown = parseJson(await readSelectedFile(required(opts, "input"), 32 * 1024 * 1024));
    if (!Array.isArray(input) || input.length > 100) throw new Error("invalid_milestone_input");
    const result = repeatedImprovement(input as EvaluationInput[]);
    await emit({
      state: "private_local_milestone", result, ability_score: null, public_achievement: false,
      explanation: "Only qualifying distinct comparable tasks can meet this local measurement gate. Synthetic measurements and duplicate reruns do not count. It does not establish human ability, a public badge, or a universal score.",
    }, opts.output);
    return;
  }
  if (command === "learn") {
    const opts = options(args, ["query", "lessons", "service", "format", "output"]);
    const query: unknown = parseJson(await readSelectedFile(required(opts, "query"), 4096));
    if ((typeof opts.lessons === "string") === (typeof opts.service === "string")) throw new Error("choose_explicit_service_or_selected_export");
    const format = opts.format ?? "markdown";
    if (format !== "markdown" && format !== "json") throw new Error("invalid_output_format");
    const result = typeof opts.service === "string"
      ? await learnFromService(query, opts.service)
      : selectLearningLessons(query, parseJson(await readSelectedFile(required(opts, "lessons"), 65536)));
    await emit(format === "markdown" ? renderLearningProposals(result) : result, opts.output, format === "markdown");
    return;
  }
  if (command === "instructions") {
    const [action, ...rest] = args;
    if (action === "plan") {
      const opts = options(rest, ["root", "path", "after", "output"]);
      const plan = await planInstructionChange(required(opts, "root"), required(opts, "path"), await readSelectedFile(required(opts, "after"), 262144));
      await emit(plan, required(opts, "output"));
      process.stdout.write(`${literalText(plan.diff)}\nApproval digest: ${plan.approval_digest}\n`);
      return;
    }
    if (action === "apply" || action === "rollback") {
      const opts = options(rest, ["root", "plan", "approve"]);
      await emit(await applyInstructionChange(required(opts, "root"), parseJson(await readSelectedFile(required(opts, "plan"))), required(opts, "approve"), action));
      return;
    }
    throw new Error("unknown_instruction_action");
  }
  if (command === "draft-share") {
    const opts = options(args, ["input", "consent", "output", "reviewers", "timeout-ms", "confirm", "digest", "capability", "handoff", "target-origin", "ttl-ms"], ["confirm", "handoff"]);
    const output = required(opts, "output");
    const input: unknown = parseJson(await readSelectedFile(required(opts, "input"), 16384));
    const validation = validateShareCandidate(input);
    if (!validation.valid) {
      await emit({ state: "blocked", local_draft: "original_selected_file_retained", findings: validation.errors }, output);
      process.exitCode = 1; return;
    }
    const selectedConsent = parseJson(await readSelectedFile(required(opts, "consent"), 4096));
    const consent = selectedConsent as unknown as PreviewConsent;
    const timeout = opts["timeout-ms"] === undefined ? 30000 : Number(opts["timeout-ms"]);
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new Error("invalid_review_timeout");
    if ((opts.confirm === true) !== (typeof opts.digest === "string")) throw new Error("confirmation_requires_flag_and_exact_digest");
    if (opts.handoff === true && (typeof opts.capability !== "string" || opts.confirm !== true ||
        !["https://better-loop.com", "http://127.0.0.1:3100"].includes(required(opts, "target-origin")))) throw new Error("handoff_requires_exact_extended_confirmation_and_target");
    if (opts.handoff !== true && (opts["target-origin"] !== undefined || opts["ttl-ms"] !== undefined)) throw new Error("explicit_handoff_required");
    const ttlMs = opts["ttl-ms"] === undefined ? 120000 : Number(opts["ttl-ms"]);
    if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new Error("invalid_handoff_ttl");
    if (typeof opts.capability === "string") {
      const capsule: unknown = parseJson(await readSelectedFile(opts.capability, 4096));
      const contribution = validateContribution({
        schema_version: CONTRIBUTION_SCHEMA_VERSION, candidate: validation.data, capability_evidence: capsule,
      });
      if (!contribution.valid) {
        await emit({ state: "blocked", local_draft: "original_selected_files_retained", findings: contribution.errors }, output);
        process.exitCode = 1; return;
      }
      const reviewers = typeof opts.reviewers === "string"
        ? configuredContributionReviewers(parseJson(await readSelectedFile(opts.reviewers, 32768)), timeout) : [];
      const prepared = await prepareContribution(contribution.data, selectedConsent as unknown as ContributionConsent, reviewers, { timeoutMs: timeout });
      if (opts.confirm === true && prepared.state === "ready_for_confirmation") {
        const approval = confirmContribution(prepared, required(opts, "digest"), true);
        await emit(approval, output);
        if (opts.handoff === true) {
          const handoff = await startHandoff(approval, { targetOrigin: required(opts, "target-origin"), ttlMs });
          const close = () => { void handoff.close(); };
          process.once("SIGINT", close); process.once("SIGTERM", close);
          await emit({
            state: "local_handoff_ready", url: handoff.url, origin: handoff.origin, expires_after_ms: ttlMs,
            message: "Open the local preview yourself. The website receives only this exact approval after your button click, then requires review, sign-in and explicit publication. No browser was opened or contribution published by the CLI.",
          });
        }
        return;
      }
      await emit({
        state: "local_unapproved_contribution", contribution: contribution.data, consent: selectedConsent, preparation: prepared,
        message: "No upload occurred. Changed contribution fields or purposes require fresh whole-contribution review and exact confirmation. Journey source/state is never a capability capsule.",
      }, output);
      if (prepared.state === "blocked") process.exitCode = 1;
      return;
    }
    const reviewers = typeof opts.reviewers === "string" ? configuredReviewers(parseJson(await readSelectedFile(opts.reviewers, 32768)), timeout) : [];
    // The shared helper is the sole privacy scanner. It is never replaced by a CLI heuristic.
    let candidate = validation.data;
    try { candidate = buildCandidate(validation.data); } catch { /* preserve the valid local draft and expose prepareCandidate's safe findings */ }
    const prepared = await prepareCandidate(candidate, consent, reviewers, { timeoutMs: timeout });
    if (opts.confirm === true && prepared.state === "ready_for_confirmation") {
      const approval = confirmPreview(prepared, required(opts, "digest"), true);
      // The browser imports exactly LocalApproval. Review receipts stay in the private preview, not this handoff.
      await emit(approval, output); return;
    }
    await emit({
      state: "local_unapproved_draft", candidate, consent, preparation: prepared,
      message: "No upload occurred. Review the exact preview; confirmation requires both --confirm and its exact digest. Confirmation reruns configured reviewers.",
    }, output);
    if (prepared.state === "blocked") process.exitCode = 1;
    return;
  }
  throw new Error("unknown_command");
}
main().catch((error: unknown) => {
  if (error instanceof JourneyError) {
    process.stderr.write(`Better Loop journey could not complete: ${error.code}. Selected state was not assessed as an improvement. Inspect the chosen scope/state; no upload occurred.\n`);
    process.exitCode = 1; return;
  }
  // Never echo an untrusted path, input excerpt, reviewer stderr, or provider error.
  process.stderr.write("Better Loop could not complete the selected local operation. Check the command, input format, scope, byte preconditions, and configured helper availability. No upload was attempted by this CLI.\n");
  process.exitCode = 1;
});
