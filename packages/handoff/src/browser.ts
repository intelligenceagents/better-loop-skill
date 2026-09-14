import type { ContributionApproval } from "@better-loop/evidence";
import {
  DEFAULT_TTL_MS, HANDOFF_PROTOCOL, MAX_TTL_MS, isLoopbackOrigin, isNonce, isTargetOrigin, parseMessage,
} from "./protocol.js";

export { HANDOFF_PROTOCOL } from "./protocol.js";
export interface HandoffReceiver {
  result: Promise<ContributionApproval>;
  cancel(): void;
}
export interface ReceiverOptions { timeoutMs?: number }

/** Call before analytics/auth on /share. Removes the rendezvous fragment synchronously. */
export function receiveHandoff(options: ReceiverOptions = {}): HandoffReceiver | null {
  const fragment = window.location.hash;
  if (!fragment) return null;
  const params = new URLSearchParams(fragment.slice(1));
  if (!params.has("bl_handoff") && !params.has("bl_origin")) return null;

  // This is intentionally before validation, opener inspection, timers or promises.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  const nonce = params.get("bl_handoff");
  const origin = params.get("bl_origin");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TTL_MS;
  const opener: Window | null = window.opener;
  let cancel = () => {};
  const result = new Promise<ContributionApproval>((resolve, reject) => {
    if (window.location.pathname !== "/share" || !isTargetOrigin(window.location.origin) ||
        params.size !== 2 || params.getAll("bl_handoff").length !== 1 ||
        params.getAll("bl_origin").length !== 1 || !isNonce(nonce) || !isLoopbackOrigin(origin) ||
        !opener || opener === window || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TTL_MS) {
      reject(new Error("invalid_handoff_rendezvous"));
      return;
    }
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onPageHide);
    };
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(code));
    };
    const onPageHide = () => fail("handoff_cancelled");
    const onMessage = (event: MessageEvent) => {
      if (settled || event.origin !== origin || event.source !== opener) return;
      const message = parseMessage(event.data);
      if (!message || message.nonce !== nonce || message.type !== "payload") return;
      const now = Date.now();
      if (now >= message.expires_at || message.expires_at - now > MAX_TTL_MS) {
        fail("handoff_expired");
        return;
      }
      settled = true;
      cleanup();
      try {
        opener.postMessage({
          protocol: HANDOFF_PROTOCOL, type: "ack", nonce, digest: message.approval.preview_digest,
        }, origin);
      } catch {
        reject(new Error("handoff_ack_failed"));
        return;
      }
      resolve(message.approval);
    };
    const timer = setTimeout(() => fail("handoff_timeout"), timeoutMs);
    cancel = () => fail("handoff_cancelled");
    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", onPageHide);
    try { opener.postMessage({ protocol: HANDOFF_PROTOCOL, type: "ready", nonce }, origin); }
    catch { fail("handoff_opener_unavailable"); }
  });
  return { result, cancel: () => cancel() };
}
