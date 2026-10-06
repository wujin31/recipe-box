// The shopping list: adding recipes (staples left off), combining them, ticking things off,
// your own items, taking a recipe off, sharing, and adding what's missing from cooking mode.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./harness.mjs";

let app, page;
before(async () => { app = await startApp(); page = app.page; });
after(async () => { await app.close(); });

const text = (sel) => page.textContent(sel);
const PENNE = "creamy-spicy-vodka-penne-with-hot-italian-sausage";

async function addFrom(id) {
  await app.goto(`#/r/${id}`);
  await page.waitForSelector(".recipe-title");
  await page.click('button:has-text("Add to shopping list")');
  await page.waitForSelector("dialog.add-sheet[open]");
}

test("adding a recipe ticks what to buy and leaves off staples", async () => {
  await addFrom("khao-mok-kai");
  const row = (t) => page.locator(`dialog .add-row:has-text("${t}") input`);
  assert.equal(await row("kosher salt (for dipping sauce)").isChecked(), false, "salt is a staple");
  assert.match(await text('dialog .add-row:has-text("2 tsp sugar")'), /you probably have this/);
  assert.equal(await row("garlic cloves").isChecked(), true);
  assert.equal(await row("jasmine rice").isChecked(), true);
  await row("jasmine rice").uncheck();
  assert.match(await text('dialog button[type="submit"]'), /^Add \d+$/);
  await page.click('dialog button[type="submit"]');
  await page.waitForSelector("dialog.add-sheet", { state: "detached" });
  assert.match(await text(".toast"), /Added \d+ to the list/);
});

test("a second recipe's garlic is added to the first's", async () => {
  await addFrom(PENNE);
  await page.click('dialog button[type="submit"]');
  await app.goto("#/list");
  await page.waitForSelector(".shop-item");
  const garlic = page.locator('.shop-item:has-text("Garlic")');
  assert.match(await garlic.textContent(), /8 cloves · for Thai Chicken Biryani, .*Penne/);
  assert.deepEqual((await page.locator(".aisle h3").allTextContents()).slice(0, 3), ["Produce", "Meat & Seafood", "Dairy & Eggs"]);
  assert.equal(await page.locator('.shop-item:has-text("Jasmine rice")').count(), 0, "unticked in the sheet, so not added");
  assert.equal(await page.locator('.shop-item:has-text("Sugar")').count(), 0);
});

test("the cookbook's 🛒 shows how many things are left", async () => {
  const n = await page.locator(".shopping .aisle:not(.got) .shop-item").count();
  await app.goto("#/");
  await page.waitForSelector(".cart-btn");
  assert.equal(await text(".cart-btn .badge"), String(n));
  await page.click(".cart-btn");
  await page.waitForSelector(".shop-item");
});

test("ticking moves things to Got it; Clear ticked removes them", async () => {
  await page.click('.shop-item:has-text("Garlic") .check');
  await page.waitForSelector('.aisle.got .shop-item:has-text("Garlic")');
  assert.match(await text(".aisle.got h3"), /Got it · 1/);
  await page.reload();
  await page.waitForSelector('.aisle.got .shop-item:has-text("Garlic")'); // kept on this device
  await page.click('button:has-text("Clear ticked")');
  await page.waitForSelector(".aisle.got", { state: "detached" });
  assert.equal(await page.locator('.shop-item:has-text("Garlic")').count(), 0);
});

test("your own items, and taking a recipe off", async () => {
  await page.fill('input[aria-label="Add an item"]', "paper towels");
  await page.press('input[aria-label="Add an item"]', "Enter");
  await page.waitForSelector('.shop-item:has-text("paper towels")');
  await page.fill('input[aria-label="Add an item"]', "bananas");
  await page.press('input[aria-label="Add an item"]', "Enter");
  await page.waitForSelector('.aisle:has(h3:text("Produce")) .shop-item:has-text("bananas")');
  await page.click(`button[aria-label^="Take Creamy"]`);
  await page.waitForFunction(() => !document.body.textContent.includes("Penne"));
  assert.equal(await page.locator('.shop-item:has-text("Heavy cream")').count(), 0);
  assert.equal(await page.locator('.shop-item:has-text("Plain yogurt")').count(), 1, "the other recipe stays");
});

test("an item can move aisles", async () => {
  await page.click('button[aria-label="Options for paper towels"]');
  await page.click('dialog .pick:has-text("Pantry & Spices")');
  await page.waitForSelector('.aisle:has(h3:text("Pantry & Spices")) .shop-item:has-text("paper towels")');
});

test("sharing copies the list as text when there's no share sheet", async () => {
  await page.evaluate(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.click('button[aria-label="Share the list"]');
  await page.waitForFunction(() => document.querySelector(".toast")?.textContent.includes("copied"));
  const copied = await app.readClipboard();
  assert.match(copied, /^Shopping list\n\nProduce\n- /);
  assert.match(copied, /- Persian cucumbers — 2/);
  assert.match(copied, /Pantry & Spices\n(?:- .*\n)*- paper towels/);
});

test("cooking mode adds what isn't out yet", async () => {
  await app.goto("#/r/mu-bap/cook");
  await page.waitForSelector(".gather");
  await page.click(".gather .ingredients li >> nth=0 >> button");
  await page.click('button:has-text("Missing something?")');
  await page.waitForSelector("dialog.add-sheet[open]");
  assert.equal(await page.locator("dialog .add-row >> nth=0 >> input").isChecked(), false, "the first one is out");
  assert.ok(await page.locator("dialog .add-row input:checked").count() > 0);
  await page.click('dialog button:has-text("Cancel")');
  app.assertNoErrors();
});
