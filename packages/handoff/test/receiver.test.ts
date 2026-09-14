import assert from "node:assert/strict";
import { test } from "node:test";
import { receiveHandoff } from "../src/browser.js";
import { HANDOFF_PROTOCOL } from "../src/protocol.js";
import { fixture } from "./fixture.js";

const nonce = "n".repeat(43);
const origin = "http://127.0.0.1:43210";
type Listener = (event: MessageEvent) => void;
class BrowserWindow {
  sent: Array<{ value: any; target: string; hashAtSend: string }> = [];
  listeners = new Map<string, Set<Listener>>();
  location = {
    hash: "#" + new URLSearchParams({ bl_handoff: nonce, bl_origin: origin }).toString(),
    pathname: "/share", search: "", origin: "http://127.0.0.1:3100",
  };
  opener: any = { postMessage: (value: unknown, target: string) => {
    this.sent.push({ value, target, hashAtSend: this.location.hash });
  } };
  history = { replaceState: (_state: unknown, _title: string, path: string) => {
    assert.equal(path, this.location.pathname + this.location.search);
    this.location.hash = "";
  } };
  addEventListener(name: string, listener: Listener) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(listener);
  }
  removeEventListener(name: string, listener: Listener) { this.listeners.get(name)?.delete(listener); }
  send(data: unknown, eventOrigin = origin, source = this.opener) {
    for (const listener of this.listeners.get("message") ?? [])
      listener({ data, origin: eventOrigin, source } as MessageEvent);
  }
}
function install() {
  const prior = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browser = new BrowserWindow();
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  return { browser, restore() {
    if (prior) Object.defineProperty(globalThis, "window", prior);
    else Reflect.deleteProperty(globalThis, "window");
  } };
}

test("receiver strips fragment before ready, validates exact origin/source/nonce, resolves once and acknowledges exact digest", async t => {
  const approval = await fixture();
  const { browser, restore } = install(); t.after(restore);
  const receiver = receiveHandoff({ timeoutMs: 1_000 })!; t.after(receiver.cancel);
  assert.equal(browser.location.hash, "");
  assert.deepEqual(browser.sent, [{
    value: { protocol: HANDOFF_PROTOCOL, type: "ready", nonce }, target: origin, hashAtSend: "",
  }]);
  const payload = { protocol: HANDOFF_PROTOCOL, type: "payload", nonce, expires_at: Date.now() + 1_000, approval };
  browser.send(payload, "http://127.0.0.1:43211");
  browser.send(payload, origin, {});
  browser.send({ ...payload, nonce: "x".repeat(43) });
  browser.send({ ...payload, extra: true });
  assert.equal(browser.sent.length, 1);
  browser.send(payload);
  const imported = await receiver.result;
  assert.deepEqual(imported, approval);
  approval.consent.community_learning = true;
  assert.equal(imported.consent.community_learning, false);
  assert.deepEqual(browser.sent[1]!.value, {
    protocol: HANDOFF_PROTOCOL, type: "ack", nonce, digest: imported.preview_digest,
  });
  browser.send(payload);
  assert.equal(browser.sent.length, 2);
  assert.equal(browser.listeners.get("message")!.size, 0);
});
test("no rendezvous is a no-op, malformed fragments are removed before rejection", async t => {
  const { browser, restore } = install(); t.after(restore);
  browser.location.hash = "#section";
  assert.equal(receiveHandoff(), null);
  assert.equal(browser.location.hash, "#section");
  const valid = new URLSearchParams({ bl_handoff: nonce, bl_origin: origin }).toString();
  for (const hash of [
    "#bl_handoff=short", "#" + valid + "&extra=yes", "#" + valid + "&bl_handoff=" + nonce,
    "#" + new URLSearchParams({ bl_handoff: nonce, bl_origin: "http://localhost:43210" }).toString(),
  ]) {
    browser.location.hash = hash;
    const receiver = receiveHandoff()!;
    assert.equal(browser.location.hash, "");
    await assert.rejects(receiver.result, /invalid_handoff_rendezvous/);
  }
  assert.equal(browser.sent.length, 0);
});
test("receiver rejects missing opener, wrong page/target and invalid timeout without sending ready", async t => {
  const { browser, restore } = install(); t.after(restore);
  const reset = () => {
    browser.location.hash = "#" + new URLSearchParams({ bl_handoff: nonce, bl_origin: origin });
  };
  const originalOpener = browser.opener;
  browser.opener = null; reset();
  await assert.rejects(receiveHandoff()!.result, /invalid_handoff_rendezvous/);
  browser.opener = originalOpener;
  browser.location.pathname = "/account"; reset();
  await assert.rejects(receiveHandoff()!.result, /invalid_handoff_rendezvous/);
  browser.location.pathname = "/share"; browser.location.origin = "https://elsewhere.test"; reset();
  await assert.rejects(receiveHandoff()!.result, /invalid_handoff_rendezvous/);
  browser.location.origin = "http://127.0.0.1:3100"; reset();
  await assert.rejects(receiveHandoff({ timeoutMs: 300_001 })!.result, /invalid_handoff_rendezvous/);
  assert.equal(browser.sent.length, 0);
});
test("expired or implausibly far future payload fails with no acknowledgement", async t => {
  const approval = await fixture();
  const { browser, restore } = install(); t.after(restore);
  for (const expires_at of [Date.now() - 1, Date.now() + 400_000]) {
    browser.location.hash = "#" + new URLSearchParams({ bl_handoff: nonce, bl_origin: origin });
    const receiver = receiveHandoff()!;
    browser.send({ protocol: HANDOFF_PROTOCOL, type: "payload", nonce, expires_at, approval });
    await assert.rejects(receiver.result, /handoff_expired/);
  }
  assert.equal(browser.sent.filter(item => item.value.type === "ack").length, 0);
});
test("changed payload, unknown fields and malformed sizes cannot resolve; cancellation/timeout removes listeners", async t => {
  const approval = await fixture();
  const { browser, restore } = install(); t.after(restore);
  const receiver = receiveHandoff({ timeoutMs: 25 })!;
  const payload = { protocol: HANDOFF_PROTOCOL, type: "payload", nonce, expires_at: Date.now() + 1_000, approval };
  const changed = structuredClone(payload);
  changed.approval.consent.candidate_discovery = true;
  browser.send(changed);
  browser.send({ ...payload, extra: "unexpected" });
  browser.send({ ...payload, approval: { ...approval, extra: "x".repeat(40_000) } });
  await assert.rejects(receiver.result, /handoff_timeout/);
  assert.equal(browser.sent.length, 1);
  assert.equal(browser.listeners.get("message")!.size, 0);
  browser.location.hash = "#" + new URLSearchParams({ bl_handoff: nonce, bl_origin: origin });
  const cancelled = receiveHandoff()!;
  cancelled.cancel();
  await assert.rejects(cancelled.result, /handoff_cancelled/);
  browser.send(payload);
  assert.equal(browser.sent.length, 2);
});
