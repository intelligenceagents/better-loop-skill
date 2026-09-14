import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { runClaude } from "./claude-host.mjs";
import {
  scanCandidate, validateSemanticVerdict, SEMANTIC_REVIEW_INSTRUCTIONS, REVIEW_POLICY_VERSION,
} from "../../packages/privacy/dist/index.js";

// Synthetic development acceptance only. This is not a production model service.
const key = process.env.BETTER_LOOP_REVIEW_KEY;
const port = Number(process.env.BETTER_LOOP_REVIEW_PORT ?? "3102");
const maximum = Number(process.env.BETTER_LOOP_REVIEW_MAX_CALLS ?? "4");
if (!key || key.length < 32 || !Number.isInteger(port) || port < 1024 ||
    !Number.isInteger(maximum) || maximum < 1 || maximum > 8) throw new Error("invalid_bridge_config");
const auth = Buffer.from(`Bearer ${key}`);
let used = 0;
const evidence = [];
await mkdir(new URL("./results/", import.meta.url), { recursive: true });
const server = createServer(async (request, response) => {
  const received = Buffer.from(request.headers.authorization ?? "");
  const reply = (status, body) => {
    response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(JSON.stringify(body));
  };
  if (received.length !== auth.length || !timingSafeEqual(received, auth)) return reply(401, { error: "unauthorized" });
  if (request.method === "GET" && request.url === "/health") return reply(200, { ready: used < maximum, synthetic_only: true });
  if (request.method !== "POST" || request.url !== "/review" || request.headers["content-type"] !== "application/json")
    return reply(400, { error: "invalid_request" });
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk.toString();
      if (Buffer.byteLength(body) > 24_576) return reply(413, { error: "too_large" });
    }
    const input = JSON.parse(body);
    if (input.policy_version !== REVIEW_POLICY_VERSION || input.candidate?.content_origin !== "synthetic" ||
        !["confidentiality", "claims"].includes(input.reviewer) || !scanCandidate(input.candidate).valid)
      return reply(422, { error: "invalid_synthetic_candidate" });
    if (used >= maximum) return reply(503, { error: "budget_exhausted" });
    used++;
    const result = await runClaude(JSON.stringify(input.candidate), { system: SEMANTIC_REVIEW_INSTRUCTIONS });
    let verdict;
    try { verdict = validateSemanticVerdict(JSON.parse(result.output)); } catch { verdict = null; }
    evidence.push({ reviewer: input.reviewer, ...result, verdict });
    await writeFile(new URL("./results/application-semantic.json", import.meta.url), JSON.stringify({
      scope: "Real model review of synthetic application submissions; no production contribution or human verification.",
      maximum_calls: maximum, used_calls: used, evidence,
    }, null, 2) + "\n");
    if (!result.success || !verdict) return reply(503, { error: "review_unavailable" });
    return reply(200, verdict);
  } catch { return reply(503, { error: "review_unavailable" }); }
});
server.requestTimeout = 125_000;
server.listen(port, "127.0.0.1", () => console.log("Synthetic Claude review bridge listening on loopback."));
