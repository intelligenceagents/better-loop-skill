#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { canonicalize, computePreviewDigest, parseJson, validateShareCandidate, validateEvaluationRun } from "./index.js";

const [command, filename, extra] = process.argv.slice(2);
if (!command || !filename || extra || !["share", "evaluation", "canonicalize", "digest"].includes(command)) {
  console.error("Usage: better-loop-contracts <share|evaluation|canonicalize|digest> <file|->");
  process.exitCode = 2;
} else {
  try {
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(filename === "-" ? 0 : filename));
    const input: unknown = parseJson(text);
    if (command === "canonicalize") {
      process.stdout.write(canonicalize(input) + "\n");
    } else if (command === "digest") {
      if (input === null || typeof input !== "object" || Array.isArray(input) ||
          Object.keys(input).sort().join(",") !== "candidate,consent") throw new Error("invalid_envelope");
      const envelope = input as Record<string, unknown>;
      console.log(computePreviewDigest(envelope.candidate, envelope.consent));
    } else {
      const result = command === "share" ? validateShareCandidate(input) : validateEvaluationRun(input);
      console.log(JSON.stringify(result.valid ? { valid: true, errors: [] } : result));
      if (!result.valid) process.exitCode = 1;
    }
  } catch {
    // Parser/filesystem exceptions may contain submitted text or local paths.
    console.error('{"valid":false,"errors":[{"path":"","code":"invalid_input"}]}');
    process.exitCode = 1;
  }
}
