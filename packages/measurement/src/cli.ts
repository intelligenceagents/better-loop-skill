#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { parseJson } from "@better-loop/contracts";
import { analyzeEvaluation, measureEvaluation, repeatedImprovement } from "./engine.js";
import { accountTelemetry } from "./telemetry.js";
import { freezeProtocol } from "./protocol.js";
import type { EvaluationInput, MeasurementOptions, ProtocolPlan, RegistrationEvidence, TelemetryLedger } from "./types.js";

const [command, filename, optionsFile, ...extra] = process.argv.slice(2);
if (!command || !filename || extra.length || !["measure", "analyze", "milestone", "telemetry", "freeze"].includes(command) ||
    (optionsFile !== undefined && !["measure", "analyze"].includes(command)) || (filename === "-" && optionsFile === "-")) {
  console.error("Usage: better-loop-measure <measure|analyze> <file|-> [options.json]\n       better-loop-measure <milestone|telemetry|freeze> <file|->");
  process.exitCode = 2;
} else {
  try {
    const read = (file: string): unknown => {
      const text = readFileSync(file === "-" ? 0 : file, "utf8");
      if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new Error("input_too_large");
      return parseJson(text);
    };
    const input = read(filename);
    const options = optionsFile ? read(optionsFile) as MeasurementOptions : {};
    let result: unknown;
    switch (command) {
      case "measure": result = measureEvaluation(input, options); break;
      case "analyze": result = analyzeEvaluation(input, options); break;
      case "milestone": result = repeatedImprovement(input as EvaluationInput[]); break;
      case "telemetry": result = accountTelemetry(input as TelemetryLedger); break;
      case "freeze": {
        if (!input || typeof input !== "object" || Array.isArray(input) ||
            Object.keys(input).length !== 2 || !Object.hasOwn(input, "plan") || !Object.hasOwn(input, "evidence")) throw new Error("invalid_freeze_input");
        const value = input as { plan: ProtocolPlan; evidence: RegistrationEvidence };
        result = freezeProtocol(value.plan, value.evidence); break;
      }
    }
    console.log(JSON.stringify(result, null, 2));
    if (result && typeof result === "object" && "valid" in result && result.valid === false) process.exitCode = 1;
  } catch {
    // No input bytes, arbitrary field names, file paths, stack traces, or provider output in errors.
    console.error(JSON.stringify({ valid: false, errors: [{ code: "invalid_cli_input", path: "" }] }));
    process.exitCode = 1;
  }
}
