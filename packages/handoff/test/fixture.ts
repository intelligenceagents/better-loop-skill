import { readFileSync } from "node:fs";
import {
  prepareContribution, confirmContribution,
  type Contribution, type ContributionApproval, type ContributionConsent,
} from "@better-loop/evidence";

/** Unit-test-only public synthetic example. These mocked reviews are not real privacy evidence. */
export async function fixture(): Promise<ContributionApproval> {
  const contribution: Contribution = {
    schema_version: "bl-contribution-0.2",
    candidate: JSON.parse(readFileSync(new URL("../../../examples/software-story.synthetic.json", import.meta.url), "utf8")),
    capability_evidence: {
      schema_version: "bl-capability-evidence-0.1", rubric_id: "bl-work-evidence-0.1",
      assessment_basis: "conversation_and_artifacts", human_involvement: "human_directed",
      human_actions: [
        { action: "goal_definition", evidence: "selected_human_message", outcome_check: "unknown" },
        { action: "factual_verification", evidence: "selected_human_message", outcome_check: "unknown" },
      ],
      quality_checks: [], change: "initial", distinct_task_band: "one", benchmark: null,
    },
  };
  const consent: ContributionConsent = {
    public_story: true, benchmark_aggregation: false, community_learning: false,
    candidate_discovery: false, policy_version: "bl-sharing-0.2",
  };
  const prepared = await prepareContribution(contribution, consent, ["first", "second"].map(id => ({
    id, review: async () => ({
      verdict: "allow", confidentiality: "clear", claim_support: "consistent", usefulness: "useful", reasons: [],
    }),
  })));
  if (prepared.state !== "ready_for_confirmation") throw new Error("synthetic_fixture_invalid");
  return confirmContribution(prepared, prepared.preview_digest, true);
}
