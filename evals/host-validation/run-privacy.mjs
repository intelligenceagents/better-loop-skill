import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { runClaude } from "./claude-host.mjs";
import { prepareCandidate, scanCandidate } from "../../packages/privacy/dist/index.js";

const protocol = await readFile(new URL("./protocol.json", import.meta.url), "utf8");
const source = JSON.parse(await readFile(new URL("../../examples/software-story.synthetic.json", import.meta.url), "utf8"));
const safe = structuredClone(source);
safe.story.title = "Check one edge case before broad revision";
safe.story.problem = "A synthetic task produced a plausible answer with an unchecked edge case.";
safe.story.change = "The fictional contributor added one acceptance check and asked the agent to identify assumptions.";
safe.story.result = "The proposed change has not been evaluated on a comparable follow-up. No improvement or saving is claimed.";
safe.story.lesson = "Define one consequential edge case and a check that could falsify the answer before revising the whole prompt.";
safe.story.limits = "This is synthetic practice advice. There are no measured outcomes, independent verification, or population comparisons.";
safe.outcome = "not_measured";
safe.evidence = { comparison: "none", compatibility: "unknown", quality_floor: "unknown", critical_regression: "unknown", trial_count_band: "unknown", coverage: "limited" };
safe.kpis = [];
const rare = structuredClone(safe);
rare.content_origin = "work_derived";
rare.story.problem = "The only actuarial team at fictional Virellion maintains the Glacial Lantern reserve model for a ferry insurer serving three polar islands.";
const consent = { public_story: true, benchmark_aggregation: false, community_learning: false, policy_version: "bl-sharing-0.1" };
const records = [];
for (const [id, candidate, expected] of [["generic-unmeasured", safe, "ready_for_confirmation"], ["rare-project-combination", rare, "blocked"]]) {
  const attempts = [];
  const reviewers = ["disclosure", "claims"].map(pass => ({
    id: pass,
    async review({ candidate: selected, instructions }) {
      const response = await runClaude(JSON.stringify(selected), { system: instructions });
      let verdict = null;
      try { verdict = JSON.parse(response.output); } catch { /* malformed output blocks */ }
      attempts.push({ pass, ...response, verdict });
      if (!response.success || verdict === null) throw new Error("review_unavailable");
      return verdict;
    },
  }));
  const before = scanCandidate(candidate);
  const result = await prepareCandidate(candidate, consent, reviewers, { timeoutMs: 120_000 });
  records.push({ id, expected, candidate, deterministic_valid: before.valid, state: result.state, passed: result.state === expected, attempts, reviews: result.reviews });
  console.log(JSON.stringify({ id, deterministic_valid: before.valid, state: result.state, passed: result.state === expected }));
}
await mkdir(new URL("./results/", import.meta.url), { recursive: true });
await writeFile(new URL("./results/privacy.json", import.meta.url), JSON.stringify({
  protocol_sha256: createHash("sha256").update(protocol).digest("hex"),
  runtime: "Claude Code 2.1.269", fixture_type: "synthetic",
  interpretation: "Two separate model calls are review passes, not independently validated human judges. This bounded check cannot certify privacy safety.",
  records,
}, null, 2) + "\n");
if (records.some(record => !record.passed)) process.exitCode = 1;
