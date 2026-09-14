import { validateShareCandidate } from "../packages/contracts/src/index.js";
import type { ShareCandidate } from "../packages/contracts/src/index.js";

const validated = validateShareCandidate({});
if (validated.valid) {
  const title: string = validated.data.story.title;
  void title;
}

type Story = ShareCandidate["story"];
const complete: Story = {
  title: "Synthetic title", problem: "Synthetic problem", change: "Synthetic change",
  result: "Synthetic result", lesson: "Synthetic lesson", limits: "Synthetic limits",
};
// @ts-expect-error The title is a required contract field.
const missingTitle: Story = {
  problem: "Synthetic problem", change: "Synthetic change", result: "Synthetic result",
  lesson: "Synthetic lesson", limits: "Synthetic limits",
};
// @ts-expect-error Title must be a string, never a number.
const numericTitle: Story = { ...complete, title: 42 };
void missingTitle;
void numericTitle;
