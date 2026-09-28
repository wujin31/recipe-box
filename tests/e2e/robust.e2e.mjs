// Robustness and security: search, stray "null" text, bad ids, unsafe links, framing,
// a misspelled branch, small screens, dark mode.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./harness.mjs";

let app, page;
before(async () => { app = await startApp(); page = app.page; });
after(async () => { await app.close(); });

test("search matches ingredients and non-Latin names", async () => {
  await app.goto();
  await page.waitForSelector(".row");
  await page.fill('input[type="search"]', "evaporated milk");
  assert.equal(await page.locator(".row").count(), 1);
  await page.fill('input[type="search"]', "ข้าวหมก");
  assert.equal(await page.locator(".row").count(), 1);
  await page.fill('input[type="search"]', "닭죽");
  assert.equal(await page.locator(".row").count(), 1);
  await page.fill('input[type="search"]', "pizza");
  assert.match(await page.textContent(".list"), /No matches/);
  await page.fill('input[type="search"]', "");
});

test("no null / undefined / NaN on any screen", async () => {
  for (const route of ["#/", "#/r/creamy-spicy-vodka-penne-with-hot-italian-sausage", "#/r/dak-juk", "#/r/dak-juk/cook", "#/import", "#/settings"]) {
    await app.goto(route);
    await page.waitForTimeout(600);
    assert.doesNotMatch(await page.evaluate(() => document.body.innerText), /\bnull\b|undefined|NaN/, route);
  }
});

test("path-like and malformed recipe links show 'not found'", async () => {
  for (const hash of ["#/r/..%2F..%2Findex", "#/r/%"]) {
    await app.goto(hash);
    await page.waitForSelector(".empty");
    assert.match(await page.textContent(".empty"), /Recipe not found/);
  }
});

test("javascript: chat links are refused before saving", async () => {
  await app.connect();
  await app.goto("#/import");
  await app.clipboard("Toast · Toast\n\nIngredients\n• 1 slice bread\n\nSteps\n1. Toast 1 slice bread.");
  await page.click('button:has-text("Paste")');
  await page.waitForFunction(() => document.querySelector(".preview")?.textContent.includes("Toast"));
  await page.fill('label:has-text("Claude chat link") input', "javascript:alert(document.domain)");
  const calls = app.repo.calls.length;
  await page.click('button:has-text("Save recipe")');
  await page.waitForFunction(() => document.querySelector(".toast.error")?.textContent.includes("https://"));
  assert.equal(app.repo.calls.length, calls);
});

test("refuses to run inside another site's frame", async () => {
  const framed = await app.ctx.newPage();
  await framed.setContent(`<iframe src="${app.base}" width="400" height="400"></iframe>`);
  await framed.waitForTimeout(1500);
  assert.match(await framed.frames()[1].textContent("#app"), /Open Recipe Box directly/);
  await framed.close();
});

test("a misspelled branch shows an error, not an empty library", async () => {
  await page.goto(`${app.base}#/settings`);
  await page.fill('label:has-text("Branch") input', "mian");
  await page.press('label:has-text("Branch") input', "Tab");
  await app.goto("#/");
  await page.waitForFunction(() => /no branch “mian”/.test(document.body.innerText));
  await page.goto(`${app.base}#/settings`);
  await page.fill('label:has-text("Branch") input', "main");
  await page.press('label:has-text("Branch") input', "Tab");
});

test("no sideways scrolling at 320 px", async () => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const route of ["#/", "#/r/khao-mok-kai", "#/import"]) {
    await app.goto(route);
    await page.waitForTimeout(500);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 320, `${route} is ${w}px wide`);
  }
  await page.setViewportSize({ width: 393, height: 852 });
});

test("dark mode renders", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await app.goto("#/r/khao-mok-kai");
  await page.waitForSelector(".recipe-title");
  await app.shot("dark");
  await page.emulateMedia({ colorScheme: "light" });
});

test("no console errors", () => app.assertNoErrors());
