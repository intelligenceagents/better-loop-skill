import { parseJson } from "@better-loop/contracts";
import { HANDOFF_PROTOCOL, parseMessage, snapshotApproval } from "./protocol.js";

interface SenderConfig {
  nonce: string;
  targetOrigin: string;
  origin: string;
  claimPath: string;
  expiresAt: number;
  digest: string;
}

// This entry point is bundled into the server's nonce-free, hash-authorized inline script.
const configNode = document.getElementById("handoff-config");
const config = JSON.parse(configNode!.textContent!) as SenderConfig;
configNode!.remove();
window.history.replaceState(null, "", "/handoff");
const button = document.getElementById("open-website") as HTMLButtonElement;
const status = document.getElementById("status")!;
const preview = document.getElementById("approval")!;
let popup: Window | null = null;
let state: "preview" | "opening" | "claiming" | "sent" | "done" | "closed" = "preview";
const controller = new AbortController();
const finish = (message: string, completed = false) => {
  if (state === "done" || state === "closed") return;
  state = completed ? "done" : "closed";
  button.disabled = true;
  controller.abort();
  clearTimeout(expiry);
  window.removeEventListener("message", onMessage);
  preview.textContent = "";
  status.textContent = message;
};
async function onMessage(event: MessageEvent) {
  if (Date.now() >= config.expiresAt) { finish("This preview has expired. Start a new handoff."); return; }
  if (!popup || event.source !== popup || event.origin !== config.targetOrigin) return;
  const message = parseMessage(event.data);
  if (!message || message.nonce !== config.nonce) return;
  if (message.type === "ack" && state === "sent" && message.digest === config.digest) {
    finish("Imported into the website's memory. Review there, sign in, and explicitly publish only if you choose.", true);
    return;
  }
  if (message.type !== "ready" || state !== "opening") return;
  state = "claiming";
  try {
    const response = await fetch(config.claimPath, {
      method: "POST", mode: "same-origin", credentials: "omit", cache: "no-store", redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nonce: config.nonce }), signal: controller.signal,
    });
    if (!response.ok || response.headers.get("content-type") !== "application/json; charset=utf-8")
      throw new Error("claim_unavailable");
    const approval = snapshotApproval(parseJson(await response.text()));
    if (!approval || approval.preview_digest !== config.digest) throw new Error("changed_approval");
    if (controller.signal.aborted || Date.now() >= config.expiresAt || popup.closed)
      throw new Error("handoff_closed");
    state = "sent";
    popup.postMessage({
      protocol: HANDOFF_PROTOCOL, type: "payload", nonce: config.nonce,
      expires_at: config.expiresAt, approval,
    }, config.targetOrigin);
    status.textContent = "Waiting for the website to confirm local import…";
  } catch { finish("The handoff could not complete. Start a new handoff or use local file import."); }
}
const expiry = setTimeout(() => finish("This preview has expired. Start a new handoff."), Math.max(0, config.expiresAt - Date.now()));
window.addEventListener("message", onMessage);
window.addEventListener("pagehide", () => finish("Preview closed."), { once: true });
button.addEventListener("click", event => {
  // Opening is tied to a real user gesture; programmatic .click() is not authorization.
  if (!event.isTrusted || state !== "preview" || Date.now() >= config.expiresAt) return;
  const url = new URL("/share", config.targetOrigin);
  url.hash = new URLSearchParams({ bl_handoff: config.nonce, bl_origin: config.origin }).toString();
  popup = window.open(url.href, "_blank");
  if (!popup) { status.textContent = "Allow this browser to open the website, then try again."; return; }
  state = "opening";
  button.disabled = true;
  status.textContent = "Waiting for the website to become ready…";
});
