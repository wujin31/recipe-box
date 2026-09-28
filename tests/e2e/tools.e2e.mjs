// Kitchen tools: the Tools tab and pinning, each tool's numbers, and the 🧰 drawer reading a recipe.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./harness.mjs";

let app, page;
before(async () => { app = await startApp(); page = app.page; });
after(async () => { await app.close(); });

const text = (sel) => page.textContent(sel);

test("Tools tab lists the tools; unpinning moves one to the end", async () => {
  await app.goto("#/tools");
  await page.waitForSelector(".tool-row");
  assert.deepEqual(await page.locator(".tool-row strong").allTextContents(), ["Pasta water & salt", "Salt %", "Cups ↔ grams"]);
  await page.click('button[aria-label="Unpin Pasta water & salt"]');
  assert.deepEqual(await page.locator(".tool-row strong").allTextContents(), ["Salt %", "Cups ↔ grams", "Pasta water & salt"]);
  await page.click('button[aria-label="Pin Pasta water & salt"]');
});

test("pasta water & salt", async () => {
  await app.goto("#/tools/pasta");
  await page.waitForSelector(".tool");
  await page.fill('input[aria-label="Pasta"]', "500");
  assert.match(await text(".big-figures"), /Water\s*5 L.*Salt\s*50 g\s*1% of the water/);
  assert.match(await text(".salt-table"), /Table or fine sea salt\s*2 tbsp \+ 2 1\/4 tsp/);
  await page.click('.choice-btn:has-text("Light")');
  assert.match(await text(".big-figures"), /0\.7% of the water/);
  await page.click('.choice-btn:has-text("Standard")');
  await page.click('.choice-btn:has-text("Less water")');
  assert.match(await text(".big-figures"), /2\.5 L.*25 g/);
  await page.fill('input[aria-label="Pasta"]', "100");
  assert.match(await text(".big-figures"), /2 L/, "never under 2 litres");
});

test("salt %: dry brine, then equilibrium brine counting the water", async () => {
  await app.goto("#/tools/salt");
  await page.waitForSelector(".tool");
  await page.fill('input[aria-label="Food"]', "2");
  await page.selectOption('select[aria-label="Food unit"]', "lb");
  assert.match(await text(".big-figures"), /9\.1 g\s*1% of 907 g/);
  await page.click('.choice-btn:has-text("Equilibrium")');
  await page.fill('input[aria-label="Water"]', "1");
  await page.selectOption('select[aria-label="Water unit"]', "l");
  assert.match(await text(".big-figures"), /28\.5 g\s*1\.5% of 1907 g \(food \+ water\)/);
  await page.click('.choice-btn:has-text("Wet brine")');
  assert.equal(await page.isVisible('input[aria-label="Food"]'), false);
  assert.match(await text(".big-figures"), /50 g\s*5% of 1000 g/);
});

test("cups, grams and oven temperatures", async () => {
  await app.goto("#/tools/convert");
  await page.waitForSelector(".tool");
  await page.fill('input[aria-label="Amount"]', "2");
  assert.equal(await text(".tool-line"), "≈ 240 g");
  await page.selectOption('select[aria-label="Amount unit"]', "g");
  await page.fill('input[aria-label="Amount"]', "100");
  assert.equal(await text(".tool-line"), "100 g ≈ 7/8 cup");
  await page.fill('input[aria-label="Amount"]', "5");
  assert.equal(await text(".tool-line"), "5 g ≈ 2 tsp");
  await page.fill('input[aria-label="Amount"]', "1,500");
  assert.equal(await text(".tool-line"), "1500 g ≈ 12 1/2 cups");
  await page.fill('input[aria-label="Fahrenheit"]', "350");
  assert.equal(await page.inputValue('input[aria-label="Celsius"]'), "177");
  await page.fill('input[aria-label="Celsius"]', "-18");
  assert.equal(await page.inputValue('input[aria-label="Fahrenheit"]'), "0");
  assert.match(await text(".gas"), /4\s*350\s*180/);
});

test("the 🧰 drawer opens pinned tools with the recipe's amounts", async () => {
  await app.goto("#/r/creamy-spicy-vodka-penne-with-hot-italian-sausage");
  await page.waitForSelector(".recipe-title");
  await page.click('button[aria-label="Kitchen tools"]');
  await page.waitForSelector("dialog.drawer[open] .tool-row");
  await page.click('dialog.drawer .tool-row:has-text("Pasta water & salt")');
  assert.equal(await page.inputValue('dialog input[aria-label="Pasta"]'), "454", "prefilled from the recipe's penne");
  assert.match(await text("dialog .big-figures"), /4\.5 L.*45 g/);
  await page.click('dialog button:has-text("Tools")');
  await page.click('dialog.drawer .tool-row:has-text("Cups ↔ grams")');
  assert.match(await text("dialog .conversions"), /296 ml heavy cream\s*≈ 300 g/);
  await page.click('dialog button:has-text("Done")');
  await page.waitForSelector("dialog.drawer", { state: "detached" });
});

test("the drawer is in cooking mode too, and typing in it doesn't turn the page", async () => {
  await app.goto("#/r/creamy-spicy-vodka-penne-with-hot-italian-sausage/cook");
  await page.waitForSelector(".cook-foot");
  const before = await text(".nav-title");
  await page.click('button[aria-label="Kitchen tools"]');
  await page.click('dialog.drawer .tool-row:has-text("Salt %")');
  assert.equal(await page.evaluate(() => document.activeElement.closest("dialog") != null), true, "focus stays in the drawer");
  assert.equal(await page.inputValue('dialog input[aria-label="Food"]'), "454", "prefilled with the sausage");
  assert.deepEqual(await page.locator("dialog .chip").allTextContents(), ["454 g hot Italian sausage", "115 g baby spinach"], "no pasta, cream or oil");
  await page.press('dialog input[aria-label="Food"]', "ArrowRight");
  await page.click('dialog button:has-text("Done")');
  assert.equal(await text(".nav-title"), before);
});
