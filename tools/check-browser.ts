import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { contractCases, consent, share } from "../tests/cases.js";
import { canonicalize, computePreviewDigest } from "../packages/contracts/src/index.js";

const bundle = readFileSync("packages/contracts/dist/index.js");
const server = createServer((request, response) => {
  response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'none'");
  if (request.url === "/contracts.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(bundle);
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end("<!doctype html><title>Better Loop synthetic contract check</title>");
  }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch(process.env.BETTER_LOOP_BROWSER_EXECUTABLE
    ? { executablePath: process.env.BETTER_LOOP_BROWSER_EXECUTABLE } : {});
  const page = await browser.newPage();
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async ({ cases, candidate, purposes }) => {
    const path = "/contracts.js";
    const api = await import(path) as typeof import("../packages/contracts/src/index.js");
    const errors = [];
    for (const item of cases) {
      const result = item.contract === "share" ? api.validateShareCandidate(item.input) : api.validateEvaluationRun(item.input);
      if (result.valid !== item.valid) errors.push(item.label);
    }
    const digest = api.computePreviewDigest(candidate, purposes);
    const canonical = api.canonicalize({ candidate, consent: purposes });
    const webCrypto = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical))),
      byte => byte.toString(16).padStart(2, "0")).join("");
    let malformedRejected = 0;
    for (const bad of ["\ud800", Infinity, undefined, new Date(0), new Array(1)]) {
      try { api.canonicalize(bad); } catch { malformedRejected++; }
    }
    return { errors, digest, canonical, webCrypto, malformedRejected };
  }, { cases: contractCases(), candidate: share(), purposes: consent() });
  assert.deepEqual(result.errors, []);
  assert.equal(result.digest, computePreviewDigest(share(), consent()));
  assert.equal(result.webCrypto, result.digest);
  assert.equal(result.canonical, canonicalize({ candidate: share(), consent: consent() }));
  assert.equal(result.malformedRejected, 5);
  console.log(`PASS: Chromium ${browser.version()}, ${contractCases().length} synthetic contract cases, Node/WebCrypto digest parity, CSP without unsafe-eval.`);
} finally {
  await browser?.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
