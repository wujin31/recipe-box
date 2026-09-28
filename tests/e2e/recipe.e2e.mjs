// Recipe page and cooking mode: scaling, units, check-offs, timers, cooking steps.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./harness.mjs";

let app, page;
before(async () => { app = await startApp(); page = app.page; });
after(async () => { await app.close(); });

const text = (sel) => page.textContent(sel);

test("home shows the seeded recipes (all unsorted until given chapters)", async () => {
  await app.goto();
  await page.waitForSelector(".tile");
  assert.equal(await page.locator(".tile").count(), 4);
  assert.match(await text(".sort-banner"), /4 recipes to sort/);
  await app.shot("home");
});

test("recipe header shows its names and facts", async () => {
  await page.click('.tile[aria-label="Thai Chicken Biryani"]');
  await page.waitForSelector(".recipe-title");
  assert.match(await text(".hero-native"), /ข้าวหมกไก่/);
  assert.equal(await text(".recipe-title"), "Thai Chicken Biryani");
  assert.match(await text(".hero-eyebrow"), /Unsorted.*Thai/);
  assert.match(await text(".facts"), /4 servings/);
});

test("servings stepper, units, and scaled amounts inside steps", async () => {
  assert.equal(await text(".stepper-value strong"), "4");
  for (let i = 0; i < 3; i++) await page.click('button[aria-label="More servings"]');
  assert.equal(await text(".stepper-value strong"), "7");
  await page.click('button[aria-label="Fewer servings"]');
  await page.click('button[aria-label="More servings"]');
  await page.click('button[aria-label="More servings"]');
  assert.match(await text(".ingredients li >> nth=0"), /50 oz/);
  await page.click('.segmented button:has-text("Metric")');
  assert.match(await text(".ingredients li >> nth=0"), /1\.4 kg/);
  const step1 = await text(".steps li >> nth=0");
  assert.ok(step1.includes("160 g plain yogurt") && step1.includes("4 tsp Thai curry powder"), step1);
});

test("check-offs, servings and units survive a reload", async () => {
  await page.click(".ingredients li >> nth=1 >> button");
  assert.equal(await page.locator(".check.done").count(), 1);
  await page.reload();
  await page.waitForSelector(".recipe-title");
  assert.equal(await page.locator(".check.done").count(), 1);
  assert.equal(await text(".stepper-value strong"), "8");
  await app.shot("recipe");
});

test("timer chips start timers; the tray doesn't rebuild every tick", async () => {
  await page.click('.timer-chip:has-text("20 minutes")');
  await page.waitForSelector(".timer");
  assert.match(await text(".timer strong"), /^(20:00|19:5\d)$/);
  const btn = await page.$(".timer button.link");
  await page.waitForTimeout(2200);
  assert.ok(await btn.evaluate((b) => b.isConnected));
});

test("cooking mode steps through and lists each step's ingredients", async () => {
  await page.click('a:has-text("Get cooking")');
  await page.waitForSelector(".cook-step");
  assert.match(await text(".nav-title"), /Step 1 of 7/);
  for (let i = 0; i < 3; i++) await page.click('.cook-foot button:has-text("Next")');
  assert.match(await text(".nav-title"), /Step 4 of 7/);
  assert.equal(await page.locator(".cook-ings li").count(), 1);
  await app.shot("cook");
  await page.click('button[aria-label="Close cooking mode"]');
  await page.waitForSelector(".recipe-title");
  await page.click('.timer button[aria-label="Cancel timer"]');
});

test("metric view: spoons back from ml, real ml kept, °F converted, word timers found", async () => {
  await app.goto("#/r/creamy-spicy-vodka-penne-with-hot-italian-sausage");
  await page.waitForSelector(".recipe-title");
  await page.click('.segmented button:has-text("Metric")');
  const ings = await text(".ingredients");
  assert.ok(ings.includes("1 tsp olive oil") && ings.includes("2 tbsp tomato paste") && ings.includes("296 ml heavy cream"), ings);
  const steps = await text(".steps");
  assert.ok(steps.includes("71°C") && !steps.includes("160°F"));
  assert.equal(await page.locator(".steps li >> nth=8 >> .timer-chip").count(), 1, "'for a minute' is a timer");
});

test("no console errors", () => app.assertNoErrors());
