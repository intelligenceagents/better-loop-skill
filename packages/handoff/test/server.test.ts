import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { get } from "node:http";
import { computeContributionDigest } from "@better-loop/evidence";
import { startHandoff } from "../src/index.js";
import { fixture } from "./fixture.js";

function config(html: string): { nonce: string; origin: string; claimPath: string; expiresAt: number; digest: string } {
  return JSON.parse(html.match(/<script type="application\/json" id="handoff-config">([^<]+)<\/script>/)![1]!);
}
test("invalid targets/TTL and invalid approvals fail before exposing a server", async () => {
  const approval = await fixture();
  for (const targetOrigin of ["https://better-loop.com/", "https://evil.test", "http://localhost:3100"])
    await assert.rejects(startHandoff(approval, { targetOrigin }), /invalid_handoff_target/);
  for (const ttlMs of [0, 999, 300_001, Infinity, 1.5])
    await assert.rejects(startHandoff(approval, { targetOrigin: "http://127.0.0.1:3100", ttlMs }), /invalid_handoff_ttl/);
  await assert.rejects(startHandoff({ ...approval, extra: true } as never, { targetOrigin: "https://better-loop.com" }), /invalid_handoff_approval/);
});
test("tokenized preview is local, detached, no-store, escaped, and cannot be claimed from other origins", async t => {
  const approval = await fixture();
  // Structural validation is not privacy clearance. Exercise escaping with a hostile synthetic string.
  approval.contribution.candidate.story.lesson = '</pre><script>globalThis.syntheticLeak=true</script>&"';
  approval.preview_digest = computeContributionDigest(approval.contribution, approval.consent);
  const local = await startHandoff(approval, { targetOrigin: "http://127.0.0.1:3100" });
  t.after(local.close);
  approval.consent.community_learning = true;
  assert.match(local.url, /^http:\/\/127\.0\.0\.1:\d+\/preview\/[A-Za-z0-9_-]{43}$/);
  assert.equal(local.url.includes(approval.preview_digest), false);
  const response = await fetch(local.url);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.match(response.headers.get("content-security-policy")!, /default-src 'none'/);
  assert.doesNotMatch(response.headers.get("content-security-policy")!, /unsafe-inline|unsafe-eval/);
  assert.ok(html.includes("&lt;/pre&gt;&lt;script&gt;globalThis.syntheticLeak=true&lt;/script&gt;"));
  assert.equal(html.includes('</pre><script>globalThis.syntheticLeak=true</script>'), false);
  const rendezvous = config(html);
  assert.equal((await fetch(local.origin + "/preview/wrong")).status, 404);
  const wrongHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(local.url, { headers: { Host: "untrusted.test" } }, result => {
      result.resume(); resolve(result.statusCode);
    }).on("error", reject);
  });
  assert.equal(wrongHostStatus, 403);
  const request = (body: unknown, origin = local.origin) => fetch(local.origin + rendezvous.claimPath, {
    method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  assert.equal((await request({ nonce: rendezvous.nonce }, "https://better-loop.com")).status, 403);
  assert.equal((await request({ nonce: "wrong" })).status, 400);
  assert.equal((await request({ nonce: rendezvous.nonce, extra: true })).status, 400);
  const claims = await Promise.all([request({ nonce: rendezvous.nonce }), request({ nonce: rendezvous.nonce })]);
  assert.deepEqual(claims.map(result => result.status).sort(), [200, 410]);
  const received = await claims.find(result => result.status === 200)!.json();
  assert.equal(received.consent.community_learning, false);
  assert.equal(received.preview_digest, rendezvous.digest);
  assert.equal((await fetch(local.url)).status, 410);
  assert.equal((await request({ nonce: rendezvous.nonce })).status, 410);
});
test("explicit close is idempotent and makes a displayed preview unclaimable", async () => {
  const local = await startHandoff(await fixture(), { targetOrigin: "http://127.0.0.1:3100" });
  const rendezvous = config(await (await fetch(local.url)).text());
  await Promise.all([local.close(), local.close()]);
  await assert.rejects(fetch(local.origin + rendezvous.claimPath, {
    method: "POST", headers: { Origin: local.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ nonce: rendezvous.nonce }),
  }));
});
test("TTL expiration closes the listener and prevents a late claim", async t => {
  const local = await startHandoff(await fixture(), { targetOrigin: "http://127.0.0.1:3100", ttlMs: 1_000 });
  t.after(local.close);
  await fetch(local.url);
  await delay(1_080);
  await assert.rejects(fetch(local.url));
});
