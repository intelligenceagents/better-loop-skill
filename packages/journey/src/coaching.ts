import type { JourneyCheckpoint, RepositorySnapshot } from "./types.js";
import { digest } from "./safety.js";

type Context = Pick<JourneyCheckpoint, "scope" | "assessment" | "host_assessment">;
const normalized = (text: string) => text.trim().replace(/\s+/gu, " ");
export function sameRecommendation(a: { next_action: string; acceptance_check: string }, b: { next_action: string; acceptance_check: string }): boolean {
  return normalized(a.next_action) === normalized(b.next_action) && normalized(a.acceptance_check) === normalized(b.acceptance_check);
}
/** A retained older host report is context, never the active analysis of a new delta. */
export function activeRecommendation(current: Context) {
  const host = current.host_assessment?.local_assessment_id === current.assessment?.id ? current.host_assessment : null;
  const assessment = current.assessment;
  if (!assessment) return null;
  const action = host?.report.next_action ?? assessment.report.recommendation.action;
  const acceptance_check = host?.report.acceptance_check ?? assessment.report.recommendation.acceptance_check;
  return {
    id: host?.id ?? assessment.id, action, acceptance_check, host: host !== null,
    key: digest({ scope: current.scope.scope_id, revision: current.scope.revision, assessment: assessment.id,
      action: normalized(action), acceptance_check: normalized(acceptance_check) }),
  };
}
export function snapshotEvidence(snapshots: RepositorySnapshot[]): string {
  // HEAD, checkpoint write count, host revisions and paths of output reports are not new task evidence.
  return digest(snapshots.map(snapshot => ({
    root: snapshot.root, identity: snapshot.identity,
    files: snapshot.files.map(file => ({ path: file.path, hash: file.hash })),
    unavailable: snapshot.unavailable,
  })));
}
