import assert from "node:assert/strict";
import { after, before, test, type TestContext } from "node:test";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { build } from "esbuild";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { computeContributionDigest, type ContributionApproval } from "@better-loop/evidence";
import { startHandoff, type LocalHandoff } from "../src/index.js";
import { fixture } from "./fixture.js";

let browser: Browser;
let receiverScript: string;
before(async () => {
  const result = await build({
    entryPoints: ["src/browser.ts"], bundle: true, write: false, format: "iife",
    globalName: "Handoff", platform: "browser", target: "es2022",
  });
  receiverScript = result.outputFiles[0]!.text;
  const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  browser = await chromium.launch({
    headless: true,
    ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
    args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"],
  });
});
after(async () => { await browser?.close(); });

interface Harness {
  local: LocalHandoff; context: BrowserContext; preview: Page; approval: ContributionApproval;
  requests: Array<{ url: string; method: string }>; blocked: string[];
}
async function harness(t: TestContext, options: { auto?: boolean; ttlMs?: number; alteredClaim?: boolean } = {}): Promise<Harness> {
  const approval = await fixture();
  const local = await startHandoff(approval, { targetOrigin: "http://127.0.0.1:3100", ttlMs: options.ttlMs ?? 10_000 });
  t.after(local.close);
  const context = await browser.newContext();
  t.after(() => context.close());
  const requests: Harness["requests"] = [], blocked: string[] = [];
  const targetHtml = `<!doctype html><html><head><meta charset="utf-8"></head><body><p id="result">Memory-only receiver test</p>
<script nonce="test-handoff">${receiverScript}</script><script nonce="test-handoff">
window.messages=[];window.importCount=0;window.beforeFragment=location.hash;
addEventListener("message",event=>{window.messages.push(event.data);});
window.beginReceive=()=>{
 const handoff=Handoff.receiveHandoff({timeoutMs:1500});
 if(handoff) handoff.result.then(approval=>{
  window.imported=approval;window.importCount++;document.getElementById("result").textContent="Imported locally";
 },error=>{window.receiverError=error.message;});
};
${options.auto === false ? "" : "window.beginReceive();"}
</script></body></html>`;
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    requests.push({ url: request.url(), method: request.method() });
    if (url.origin === local.origin) {
      if (options.alteredClaim && url.pathname.startsWith("/claim/")) {
        const changed = structuredClone(approval);
        changed.consent.candidate_discovery = true;
        changed.preview_digest = computeContributionDigest(changed.contribution, changed.consent);
        await route.fulfill({
          status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(changed),
        });
      } else await route.continue();
      return;
    }
    // Never contact the running app. These origins are fulfilled with isolated synthetic pages.
    if (url.origin === "http://127.0.0.1:3100" || url.origin === "http://127.0.0.1:3101") {
      await route.fulfill({
        status: 200, contentType: "text/html", body: targetHtml,
        headers: { "Content-Security-Policy": "default-src 'none'; script-src 'nonce-test-handoff'; base-uri 'none'; form-action 'none'" },
      });
      return;
    }
    blocked.push(request.url());
    await route.abort();
  });
  const preview = await context.newPage();
  await preview.goto(local.url);
  return { local, context, preview, approval, requests, blocked };
}
async function openWebsite(preview: Page) {
  const popup = preview.waitForEvent("popup");
  await preview.getByRole("button", { name: "Open website to review sharing" }).click();
  const website = await popup;
  await website.waitForLoadState("domcontentloaded");
  return website;
}

test("actual browser: exact preview, user click, fragment cleanup, one transfer and ack under CSP with no external requests", async t => {
  const h = await harness(t);
  const errors: string[] = [];
  h.preview.on("pageerror", error => errors.push(error.message));
  assert.equal(h.preview.url(), h.local.origin + "/handoff");
  assert.deepEqual(JSON.parse(await h.preview.locator("#approval").innerText()), h.approval);
  assert.equal(h.requests.filter(request => request.method === "POST").length, 0);
  assert.equal(h.requests.filter(request => request.url.startsWith("http://127.0.0.1:3100")).length, 0);
  // A scripted click is not the user's explicit gesture.
  await h.preview.locator("#open-website").evaluate((button: HTMLButtonElement) => button.click());
  assert.equal(h.context.pages().length, 1);
  const website = await openWebsite(h.preview);
  await website.waitForFunction(() => (window as any).importCount === 1);
  await h.preview.waitForFunction(() => document.getElementById("status")!.textContent!.startsWith("Imported into"));
  assert.equal(website.url(), "http://127.0.0.1:3100/share");
  assert.deepEqual(await website.evaluate(() => (window as any).imported), h.approval);
  assert.equal(await h.preview.locator("#approval").innerText(), "");
  assert.equal(h.requests.filter(request => request.method === "POST").length, 1);
  assert.ok(h.requests.filter(request => request.method === "POST")[0]!.url.startsWith(h.local.origin + "/claim/"));
  const posted = await website.evaluate(() => (window as any).messages);
  assert.equal(posted.filter((message: any) => message.type === "payload").length, 1);
  await website.evaluate(() => {
    const params = new URLSearchParams((window as any).beforeFragment.slice(1));
    window.opener.postMessage({
      protocol: "bl-handoff-0.1", type: "ready", nonce: params.get("bl_handoff"),
    }, params.get("bl_origin")!);
  });
  await delay(50);
  assert.equal(h.requests.filter(request => request.method === "POST").length, 1);
  assert.equal(await website.evaluate(() => (window as any).messages.filter((m: any) => m.type === "payload").length), 1);
  assert.deepEqual(h.blocked, []);
  assert.deepEqual(errors, []);
});
test("actual browser: no payload before known ready; wrong source/origin/nonce and extra fields do not claim", async t => {
  const h = await harness(t, { auto: false });
  const website = await openWebsite(h.preview);
  const originalUrl = website.url();
  const params = new URLSearchParams(new URL(originalUrl).hash.slice(1));
  const ready = { protocol: "bl-handoff-0.1", type: "ready", nonce: params.get("bl_handoff") };
  await h.preview.evaluate(({ data, target }) => {
    // Correct claimed origin but wrong source window.
    dispatchEvent(new MessageEvent("message", { data, origin: target, source: window }));
  }, { data: ready, target: "http://127.0.0.1:3100" });
  await website.goto("http://127.0.0.1:3101/probe");
  await website.evaluate(({ data, origin }) => window.opener.postMessage(data, origin), { data: ready, origin: h.local.origin });
  await website.goto(originalUrl);
  await website.evaluate(({ data, origin }) => {
    window.opener.postMessage({ ...data, nonce: "x".repeat(43) }, origin);
    window.opener.postMessage({ ...data, extra: true }, origin);
  }, { data: ready, origin: h.local.origin });
  await delay(50);
  assert.equal(h.requests.filter(request => request.method === "POST").length, 0);
  assert.equal(await website.evaluate(() => (window as any).messages.length), 0);
  await website.evaluate(() => (window as any).beginReceive());
  await website.waitForFunction(() => (window as any).importCount === 1);
  assert.equal(h.requests.filter(request => request.method === "POST").length, 1);
  assert.deepEqual(h.blocked, []);
});
test("actual browser: host close before ready blocks transfer from an already displayed preview", async t => {
  const h = await harness(t, { auto: false });
  const website = await openWebsite(h.preview);
  await h.local.close();
  await website.evaluate(() => (window as any).beginReceive());
  await h.preview.waitForFunction(() => document.getElementById("status")!.textContent!.includes("could not complete"));
  assert.equal(await website.evaluate(() => (window as any).importCount), 0);
  assert.equal(await website.evaluate(() => (window as any).messages.length), 0);
  assert.equal(await h.preview.locator("#approval").innerText(), "");
});
test("actual browser: preview expiry clears display, disables transfer and never opens the website", async t => {
  const h = await harness(t, { ttlMs: 1_000 });
  await h.preview.waitForFunction(() => document.getElementById("status")!.textContent!.includes("expired"));
  assert.equal(await h.preview.locator("#open-website").isDisabled(), true);
  assert.equal(await h.preview.locator("#approval").innerText(), "");
  assert.equal(h.requests.filter(request => request.url.startsWith("http://127.0.0.1:3100")).length, 0);
  assert.equal(h.requests.filter(request => request.method === "POST").length, 0);
});
test("actual browser: a changed claim with a recomputed valid digest cannot replace the previewed approval", async t => {
  const h = await harness(t, { alteredClaim: true });
  const website = await openWebsite(h.preview);
  await h.preview.waitForFunction(() => document.getElementById("status")!.textContent!.includes("could not complete"));
  assert.equal(await website.evaluate(() => (window as any).importCount), 0);
  assert.equal(await website.evaluate(() => (window as any).messages.length), 0);
});
