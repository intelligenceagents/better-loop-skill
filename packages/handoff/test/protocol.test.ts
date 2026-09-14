import assert from "node:assert/strict";
import { test } from "node:test";
import { HANDOFF_PROTOCOL, isLoopbackOrigin, isTargetOrigin, parseMessage, snapshotApproval } from "../src/protocol.js";
import { fixture } from "./fixture.js";

const nonce = "a".repeat(43);
test("target and loopback origins are exact, with no credentials, path, fragment or host aliases", () => {
  assert.equal(isTargetOrigin("https://better-loop.com"), true);
  assert.equal(isTargetOrigin("http://127.0.0.1:3100"), true);
  for (const origin of ["https://better-loop.com/", "http://better-loop.com", "https://better-loop.com:443",
    "https://better-loop.com.evil.test", "https://user@better-loop.com", "http://localhost:3100", null])
    assert.equal(isTargetOrigin(origin), false);
  assert.equal(isLoopbackOrigin("http://127.0.0.1:43210"), true);
  for (const origin of ["http://127.0.0.1", "http://127.0.0.1:80", "http://127.0.0.1:0",
    "http://localhost:43210", "http://[::1]:43210", "http://127.0.0.1:43210/",
    "http://user@127.0.0.1:43210", "http://127.0.0.1:43210?x", "https://127.0.0.1:43210"])
    assert.equal(isLoopbackOrigin(origin), false, origin);
});
test("every message type rejects unknown fields and malformed envelopes", async () => {
  const approval = await fixture();
  for (const message of [
    { protocol: HANDOFF_PROTOCOL, type: "ready", nonce },
    { protocol: HANDOFF_PROTOCOL, type: "ack", nonce, digest: approval.preview_digest },
    { protocol: HANDOFF_PROTOCOL, type: "payload", nonce, expires_at: Date.now() + 10_000, approval },
  ]) {
    assert.ok(parseMessage(message));
    for (const invalid of [{ ...message, extra: true }, { ...message, nonce: "short" }, { ...message, protocol: "future" },
      { ...message, nonce: [nonce] }, { ...message, type: "unknown" }])
      assert.equal(parseMessage(invalid), null);
  }
  for (const invalid of [null, [], true, "ready", { protocol: HANDOFF_PROTOCOL, type: "ready", nonce, approval }])
    assert.equal(parseMessage(invalid), null);
});
test("approval snapshot is detached and rejects edited purposes, capsule, unknown fields and oversize data", async () => {
  const approval = await fixture();
  const snapshot = snapshotApproval(approval)!;
  approval.consent.candidate_discovery = true;
  assert.equal(snapshot.consent.candidate_discovery, false);
  assert.equal(snapshotApproval(approval), null);
  const changedCapsule = structuredClone(snapshot);
  changedCapsule.contribution.capability_evidence.change = "followup";
  assert.equal(snapshotApproval(changedCapsule), null);
  assert.equal(snapshotApproval({ ...snapshot, raw: "x".repeat(33_000) }), null);
  assert.equal(snapshotApproval({ ...snapshot, extra: true }), null);
  let getterRan = false;
  const getter = structuredClone(snapshot);
  Object.defineProperty(getter, "consent", { enumerable: true, get() { getterRan = true; return snapshot.consent; } });
  assert.equal(snapshotApproval(getter), null);
  assert.equal(getterRan, false);
});
