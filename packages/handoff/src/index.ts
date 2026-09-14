import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { canonicalize, parseJson } from "@better-loop/contracts";
import type { ContributionApproval } from "@better-loop/evidence";
import { DEFAULT_TTL_MS, MAX_TTL_MS, isTargetOrigin, snapshotApproval } from "./protocol.js";

export { HANDOFF_PROTOCOL } from "./protocol.js";
export interface HandoffOptions { targetOrigin: string; ttlMs?: number }
export interface LocalHandoff {
  /** A tokenized local URL. It contains no approval bytes. */
  url: string;
  origin: string;
  /** Revoke future preview/claim requests and release the server's in-memory approval. */
  close(): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
const style = `
:root{color-scheme:light;font:16px/1.6 system-ui,sans-serif;background:#f7f7ee;color:#173b2f}
body{margin:0;padding:32px 20px}main{max-width:860px;margin:auto}h1{font-size:clamp(1.8rem,5vw,2.6rem);line-height:1.15}
.eyebrow{font-size:.8rem;text-transform:uppercase;letter-spacing:.1em}p{max-width:68ch}
.notice{border-left:4px solid #83a98a;padding:8px 18px;background:white}button{font:inherit;font-weight:650;background:#173b2f;color:white;border:0;border-radius:8px;padding:14px 22px;cursor:pointer}
button:focus-visible,summary:focus-visible{outline:3px solid #b6d668;outline-offset:4px}button:disabled{opacity:.55;cursor:default}
details{margin:24px 0;border:1px solid #ccd5c9;border-radius:8px;background:white;padding:16px}summary{cursor:pointer;font-weight:650}
pre{font:13px/1.55 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;color:#243b32}
#status{min-height:3em}.small{font-size:.9rem;color:#486252}footer{margin-top:24px}
`;
const hash = (value: string) => createHash("sha256").update(value).digest("base64");

function securityHeaders(response: ServerResponse, script: string) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Pragma", "no-cache");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Robots-Tag", "noindex, nofollow, nosnippet, noarchive");
  response.setHeader("Content-Security-Policy", [
    "default-src 'none'", `script-src 'sha256-${hash(script)}'`, `style-src 'sha256-${hash(style)}'`,
    "connect-src 'self'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
  ].join("; "));
}
function reply(response: ServerResponse, status: number, body: string, json = false) {
  response.statusCode = status;
  response.setHeader("Content-Type", json ? "application/json; charset=utf-8" : "text/plain; charset=utf-8");
  response.end(body);
}
async function readClaim(request: IncomingMessage): Promise<unknown> {
  let body = "";
  let bytes = 0;
  for await (const chunk of request) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 256) throw new Error("claim_too_large");
    body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
  }
  return parseJson(body);
}

/** No browser is opened here. The caller displays the returned local URL to the user. */
export async function startHandoff(input: ContributionApproval, options: HandoffOptions): Promise<LocalHandoff> {
  if (!options || !isTargetOrigin(options.targetOrigin) ||
      Object.keys(options).some(key => key !== "targetOrigin" && key !== "ttlMs"))
    throw new Error("invalid_handoff_target");
  const targetOrigin = options.targetOrigin;
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_TTL_MS) throw new Error("invalid_handoff_ttl");
  let approval = snapshotApproval(input);
  if (!approval) throw new Error("invalid_handoff_approval");
  // The runtime asset is bundled by this package's build. Both source and dist live one level below the package root.
  const script = readFileSync(new URL("../dist/sender.inline.js", import.meta.url), "utf8");
  const token = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const previewPath = `/preview/${token}`;
  const claimPath = `/claim/${token}`;
  const expiresAt = Date.now() + ttlMs;
  const digest = approval.preview_digest;
  let stored: string | null = canonicalize(approval);
  approval = null;
  let claimed = false;
  let closed = false;
  let origin = "";
  let closePromise: Promise<void> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const server = createServer((request, response) => {
    securityHeaders(response, script);
    void (async () => {
      if (closed || Date.now() >= expiresAt) { reply(response, 410, "Handoff unavailable."); return; }
      if (request.headers.host !== origin.slice("http://".length)) { reply(response, 403, "Request not allowed."); return; }
      if (request.method === "GET" && request.url === previewPath) {
        if (!stored || claimed) { reply(response, 410, "Handoff unavailable."); return; }
        const config = { nonce, targetOrigin, origin, claimPath, expiresAt, digest };
        const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Better Loop — local preview</title><style>${style}</style></head><body><main>
<p class="eyebrow">Better Loop · private browser preview</p><h1>Review before opening the website</h1>
<p>This is the exact minimized contribution and sharing purposes you approved locally. No contribution has been sent to Better Loop.</p>
<div class="notice"><p>The next button opens ${targetOrigin === "http://127.0.0.1:3100" ? "the local website for review" : "Better Loop"}. After its browser page is ready, this approval is imported into that page's memory. You can review it again, sign in there, and explicitly publish if you choose.</p></div>
<details open><summary>Exact contribution, capability evidence and consent</summary><pre id="approval">${escapeHtml(JSON.stringify(JSON.parse(stored), null, 2))}</pre></details>
<button id="open-website" type="button">Open website to review sharing</button><p id="status" role="status" aria-live="polite">Sharing is optional. This preview expires shortly and can be used once.</p>
<footer class="small">Email, verification codes and website sessions stay in the website. Opening it does not publish this contribution.</footer>
</main><script type="application/json" id="handoff-config">${scriptJson(config)}</script><script>${script}</script></body></html>`;
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(html);
        return;
      }
      if (request.method === "POST" && request.url === claimPath) {
        if (request.headers.origin !== origin || request.headers["content-type"] !== "application/json" ||
            (request.headers["sec-fetch-site"] !== undefined && request.headers["sec-fetch-site"] !== "same-origin")) {
          reply(response, 403, "Request not allowed."); return;
        }
        let claim: unknown;
        try { claim = await readClaim(request); } catch { reply(response, 400, "Invalid claim."); return; }
        if (!claim || typeof claim !== "object" || Array.isArray(claim) ||
            Object.keys(claim).join(",") !== "nonce" || (claim as { nonce: unknown }).nonce !== nonce) {
          reply(response, 400, "Invalid claim."); return;
        }
        if (closed || Date.now() >= expiresAt || claimed || stored === null) {
          reply(response, 410, "Handoff unavailable."); return;
        }
        const payload = stored;
        claimed = true;
        stored = null;
        reply(response, 200, payload, true);
        return;
      }
      reply(response, 404, "Handoff unavailable.");
    })().catch(() => {
      if (!response.headersSent) reply(response, 400, "Handoff unavailable.");
      else response.end();
    });
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = 1;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closed = true;
    stored = null;
    if (expiry) clearTimeout(expiry);
    closePromise = new Promise(resolve => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    return closePromise;
  };
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") { await close(); throw new Error("handoff_unavailable"); }
  origin = `http://127.0.0.1:${address.port}`;
  expiry = setTimeout(() => { void close(); }, Math.max(0, expiresAt - Date.now()));
  expiry.unref();
  return { url: origin + previewPath, origin, close };
}
