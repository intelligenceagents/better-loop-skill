// Deterministic local browser QA for an explicitly selected generated private HTML view.
// Does not alter journey state, follow remote links, call a model or open the user's browser.
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
const [input, ...extra] = process.argv.slice(2);
assert.ok(input && !extra.length && /\.html?$/i.test(input), "Provide one explicit generated local HTML file.");
const browser = await chromium.launch({ headless: true, channel: process.env.BETTER_LOOP_BROWSER_CHANNEL ?? "chromium" });
const requests = [], errors = [], checks = [];
try {
  const page = await browser.newPage();
  await page.route(/^https?:/, route => { requests.push(route.request().url()); return route.abort(); });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(pathToFileURL(resolve(input)).href);
  assert.equal(await page.locator("script,iframe,object,embed,form,img,link").count(), 0);
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
  assert.equal(await page.locator(".next-card h2").count(), 1);
  assert.equal(await page.locator(".practice-card").count(), 3);
  for (const width of [1440, 1024, 768, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}`);
    assert.equal(await page.locator(".next-card").evaluate(e => getComputedStyle(e).backgroundColor), "rgb(25, 51, 47)", "CSP must allow the exact style");
    checks.push(`layout_${width}`);
  }
  for (const selector of [".history-entry summary", "#scope summary", ".prompt-box summary"]) {
    const summary = page.locator(selector).first();
    await summary.focus(); await page.keyboard.press("Enter");
    assert.equal(await summary.evaluate(e => e.parentElement.open), true);
    await page.keyboard.press("Enter");
    assert.equal(await summary.evaluate(e => e.parentElement.open), false);
  }
  await page.locator(".prompt-box summary").first().click();
  const copy = page.locator("textarea").first();
  await copy.focus();
  assert.equal(await copy.getAttribute("readonly"), "");
  const text = await copy.inputValue();
  assert.match(text, /already selected local state/);
  assert.doesNotMatch(text, /&quot;|\\\$better/);
  await page.locator('a[href="#history"]').first().click();
  assert.equal(new URL(page.url()).hash, "#history");
  assert.deepEqual(requests, []); assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => performance.getEntriesByType("resource").length), 0);
  console.log(JSON.stringify({ passed: true, checks: [...checks, "keyboard_details", "literal_copy_text", "history_anchor", "zero_scripts_external_resources_requests_console_errors"], state_mutated: false, model_calls: 0 }));
} finally { await browser.close(); }
