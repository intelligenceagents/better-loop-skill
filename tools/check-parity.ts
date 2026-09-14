import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { contractCases } from "../tests/cases.js";
import { validateEvaluationRun, validateShareCandidate } from "../packages/contracts/src/index.js";

const cases = contractCases();
const python = spawnSync(process.env.BETTER_LOOP_PYTHON ?? "python3", ["-c", `
import json, sys
from tools.validate_context import load, share_errors, evaluation_errors, ROOT
from jsonschema import Draft202012Validator, FormatChecker
sv = Draft202012Validator(load(ROOT/'schemas/share-candidate.schema.json'), format_checker=FormatChecker())
ev = Draft202012Validator(load(ROOT/'schemas/evaluation-run.schema.json'), format_checker=FormatChecker())
print(json.dumps([not (share_errors(x['input'], sv) if x['contract']=='share' else evaluation_errors(x['input'], ev)) for x in json.load(sys.stdin)]))
`], { input: JSON.stringify(cases), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
assert.equal(python.status, 0, "Python parity process failed; install requirements-dev.txt.");
const reference: boolean[] = JSON.parse(python.stdout) as boolean[];
assert.equal(reference.length, cases.length);
cases.forEach((item, index) => {
  const result = item.contract === "share" ? validateShareCandidate(item.input) : validateEvaluationRun(item.input);
  assert.equal(result.valid, reference[index], `Python/TypeScript disagreement: ${item.label}`);
  assert.equal(result.valid, item.valid, `Unexpected validity: ${item.label}`);
});
console.log(`PASS: Python/TypeScript parity for ${cases.length} synthetic contract cases.`);
