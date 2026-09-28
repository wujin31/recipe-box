// Robustness and security: search, stray "null" text, bad ids, unsafe links, framing,
// a misspelled branch, small screens, dark mode.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./harness.mjs";

let app, page;
before(async () => { app = await startApp(); page = app.page; });
after(async () => { await app.close(); });

test("search matches ingredients, cuisines and non-Latin names, and highlights them", async () => {
  await app.goto("#/search");
  await page.waitForSelector(".result");
  await page.fill('input[type="search"]', "evaporated milk");
  assert.equal(await page.locator(".result").count(), 1);
  assert.deepEqual(await page.locator(".result mark").allTextContents(), ["evaporated", "milk"]);
  await page.fill('input[type="search"]', "ข้าวหมก");
  assert.equal(await page.locator(".result").count(), 1);
  await page.fill('input[type="search"]', "닭죽");
  assert.equal(await page.locator(".result").count(), 1);
  await page.fill('input[type="search"]', "korean");
  assert.equal(await page.locator(".result").count(), 2, "cuisine is searchable");
  await page.fill('input[type="search"]', "pizza");
  assert.match(await page.textContent(".results"), /No matches/);
  await page.fill('input[type="search"]', "");
});

test("chapters show as shelves; chapter pages filter", async () => {
  // Give the seeded recipes chapters, as sorting would.
  const chapters = { "khao-mok-kai": "rice", "mu-bap": "rice", "dak-juk": "breakfast", "creamy-spicy-vodka-penne-with-hot-italian-sausage": "rice" };
  const idx = app.repo.json("recipes/index.json");
  idx.recipes = idx.recipes.map((r) => ({ ...r, chapter: chapters[r.id] }));
  app.repo.commitFromElsewhere({ "recipes/index.json": JSON.stringify(idx) });
  await app.goto("#/tools"); // leave and come back so home reloads the index
  await app.goto("#/");
  await page.waitForSelector(".shelf-section");
  assert.deepEqual(await page.locator(".shelf-section h2").allTextContents(), ["Breakfast & Brunch1", "Rice & Noodles3"]);
  assert.equal(await page.locator(".sort-banner").count(), 0);
  await page.click('.toc-row:has-text("Rice & Noodles")');
  await page.waitForSelector(".grid .tile");
  assert.equal(await page.locator(".grid .tile").count(), 3);
  await page.click('.chip:has-text("Korean")');
  assert.equal(await page.locator(".grid .tile").count(), 1);
  await app.shot("chapter");
});

test("tab bar navigates and hides in cooking mode", async () => {
  await app.goto("#/");
  await page.click('.tabbar a[aria-label="Search"]');
  await page.waitForSelector('.tabbar a[aria-label="Search"][aria-current="page"]');
  await app.goto("#/r/dak-juk/cook");
  await page.waitForSelector(".cook-step");
  assert.equal(await page.isVisible(".tabbar"), false);
});

test("no null / undefined / NaN on any screen", async () => {
  for (const route of ["#/", "#/c/rice", "#/c/unsorted", "#/search", "#/timers", "#/tools", "#/r/creamy-spicy-vodka-penne-with-hot-italian-sausage", "#/r/dak-juk", "#/r/dak-juk/cook", "#/import", "#/settings"]) {
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
  await page.click('form button[type="submit"]');
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
  for (const route of ["#/", "#/c/rice", "#/search", "#/r/khao-mok-kai", "#/import"]) {
    await app.goto(route);
    await page.waitForTimeout(500);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 320, `${route} is ${w}px wide`);
  }
  await page.setViewportSize({ width: 393, height: 852 });
});

test("text follows the system text size (rem-based type)", async () => {
  await app.goto("#/r/khao-mok-kai");
  await page.waitForSelector(".recipe-title");
  const size = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".ingredients li button")).fontSize));
  const normal = await size();
  await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  assert.ok(await size() > normal * 1.3, "ingredient text grows with the root size");
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("dark mode renders", async () => {
  await page.emulateMedia({ colorScheme: "dark" });
  await app.goto("#/r/khao-mok-kai");
  await page.waitForSelector(".recipe-title");
  await app.shot("dark");
  await page.emulateMedia({ colorScheme: "light" });
});

test("no console errors", () => app.assertNoErrors());
