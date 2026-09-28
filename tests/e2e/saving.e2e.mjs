// Saving to GitHub: connecting, importing (text and JSON), editing, the cook log, favorites,
// concurrent saves from another device, deleting, and saves whose reply is lost.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, fixture } from "./harness.mjs";

let app, page;
before(async () => { app = await startApp(); page = app.page; });
after(async () => { await app.close(); });

const text = (sel) => page.textContent(sel);
const index = () => app.repo.json("recipes/index.json").recipes;
const paste = async (card, expect) => {
  await app.clipboard(card);
  await page.click('button:has-text("Paste")');
  await page.waitForFunction((t) => document.querySelector(".preview")?.textContent.includes(t), expect);
};

test("Test connection reports bad and read-only tokens", async () => {
  await app.connect("wrong");
  await page.click('button:has-text("Test connection")');
  await page.waitForSelector(".warn-text");
  assert.match(await text(".warn-text"), /rejected the token/);
  await app.connect("read-token");
  await page.click('button:has-text("Test connection")');
  await page.waitForFunction(() => document.querySelector(".warn-text")?.textContent.includes("can read but not save"));
});

test("a read-only save explains the fix, and the paste survives a trip to Settings", async () => {
  await app.goto("#/import");
  await paste("Draft Test · Draft\n\nIngredients\n• 1 egg\n\nSteps\n1. Boil 1 egg for 7 minutes.", "Draft");
  await page.click('form button[type="submit"]');
  await page.waitForFunction(() => document.querySelector(".toast.error")?.textContent.includes("Contents must be"));
  await app.connect("test-token");
  await app.goto("#/import");
  assert.match(await page.inputValue("textarea.source"), /^Draft Test/);
  await app.connect("test-token");
  await page.click('button:has-text("Test connection")');
  await page.waitForSelector(".ok-text");
  assert.match(await text(".ok-text"), /me\/recipes/);
});

test("import a card: preview, save, files committed", async () => {
  const start = index().length;
  await app.goto("#/import");
  await paste(fixture("pad-kra-pao-gai.txt"), "Thai Basil");
  assert.match(await text(".preview"), /8 ingredients · 4 steps · 3 timers/);
  await page.fill('label:has-text("Servings") input', "2");
  await page.fill('label:has-text("Tags") input', "Thai, quick");
  await page.click('form button[type="submit"]');
  await page.waitForURL(/#\/r\/pad-kra-pao-gai$/);
  await page.waitForSelector(".recipe-title");
  assert.ok(app.repo.json("recipes/pad-kra-pao-gai/recipe.json"));
  assert.equal(index().length, start + 1);
  assert.deepEqual(index().find((r) => r.id === "pad-kra-pao-gai").tags, ["thai", "quick"]);
  assert.match(app.repo.files()["recipes/pad-kra-pao-gai/source.txt"], /^Pad Kra Pao Gai/);
});

test("log a cook", async () => {
  await page.click('button:has-text("Log a cook")');
  await page.click('.star-input button[aria-label="4 stars"]');
  await page.fill('dialog label:has-text("Variables") textarea', "extra chili");
  await page.fill('dialog label:has-text("Notes") textarea', "Great, crispier egg next time");
  await page.click('dialog button:has-text("Save")');
  await page.waitForSelector(".log li");
  const saved = app.repo.json("recipes/pad-kra-pao-gai/recipe.json");
  assert.equal(saved.log.length, 1);
  assert.equal(saved.log[0].rating, 4);
  assert.equal(saved.log[0].variables, "extra chili");
  assert.equal(index().find((r) => r.id === "pad-kra-pao-gai").cookCount, 1);
});

test("Done in cooking mode opens the log sheet", async () => {
  await app.goto("#/r/khao-mok-kai/cook");
  await page.waitForSelector(".cook-foot");
  for (let k = 0; k < 9 && !(await text(".cook-foot button >> nth=1")).includes("Done"); k++) await page.click(".cook-foot button >> nth=1");
  await page.click('.cook-foot button:has-text("Done")');
  await page.waitForSelector("dialog.sheet[open]");
  assert.ok(page.url().endsWith("#/r/khao-mok-kai"));
  await page.click('dialog button:has-text("Cancel")');
});

test("favorite after another device saved: rebuilt on the new head", async () => {
  await app.goto("#/r/pad-kra-pao-gai");
  await page.waitForSelector(".recipe-title");
  app.repo.commitFromElsewhere({ "recipes/other.txt": "x" });
  await page.click('button[aria-label="Favorite"]');
  await page.waitForFunction(() => document.querySelector(".icon-btn.star.on"));
  await page.waitForTimeout(500);
  assert.equal(app.repo.json("recipes/pad-kra-pao-gai/recipe.json").favorite, true);
  assert.equal(app.repo.files()["recipes/other.txt"], "x");
});

test("delete removes the files and the index entry", async () => {
  const start = index().length;
  page.once("dialog", (d) => d.accept());
  await page.click('button[aria-label="More"]');
  await page.click('.menu button:has-text("Delete")');
  await page.waitForURL(/#\/$/);
  assert.equal(app.repo.files()["recipes/pad-kra-pao-gai/recipe.json"], undefined);
  assert.equal(index().length, start - 1);
});

test("JSON from the export prompt keeps timers and servings; edit and copy keep them too", async () => {
  await app.goto("#/import");
  await page.click("summary:has-text(\"Keep the card's timers\")");
  await page.click('button:has-text("Copy prompt for Claude")');
  assert.match(await app.readClipboard(), /^Export the recipe card above[\s\S]*"timers"/);
  const reply = "Sure:\n```json\n" + JSON.stringify({
    title: "ハヤシライス (Hayashi Raisu / Hayashi Rice)", description: "Yōshoku style.", servings: 4,
    ingredients: ["300 g yellow onion, 1 cm wedges", "10 g neutral oil", "200 ml dry red wine"],
    steps: [{ text: "Add 10 g neutral oil and the 300 g yellow onion, 1 cm wedges; leave them alone.", timers: [8] },
      { text: "Add 200 ml dry red wine and reduce.", timers: [4] }, { text: "Serve.", timers: [] }],
    notes: "",
  }) + "\n```";
  await paste(reply, "Hayashi Rice");
  assert.match(await text(".preview"), /3 ingredients · 3 steps · 2 timers/);
  assert.equal(await page.inputValue('label:has-text("Servings") input'), "4");
  await page.click('form button[type="submit"]');
  await page.waitForURL(/#\/r\/hayashi-raisu$/);
  await page.waitForSelector(".recipe-title");
  assert.equal(await text(".recipe-title"), "Hayashi Rice");
  assert.equal(await page.locator(".steps .timer-chip").count(), 2);
  const saved = app.repo.json("recipes/hayashi-raisu/recipe.json");
  assert.equal(saved.steps[0].timers[0].seconds, 480);
  assert.equal(saved.servings, 4);

  await app.goto("#/r/hayashi-raisu/edit");
  await page.waitForSelector("textarea.source");
  const editText = await page.inputValue("textarea.source");
  assert.ok(editText.includes("⏱ 8 min") && !editText.includes("Serves"));
  await page.fill("textarea.source", editText.replace("3. Serve.", "3. Serve. ⏱ 1 min"));
  await page.click('button:has-text("Save changes")');
  await page.waitForURL(/#\/r\/hayashi-raisu$/);
  await page.waitForSelector(".recipe-title");
  assert.equal(await page.locator(".steps .timer-chip").count(), 3);
  await page.click('button[aria-label="More"]');
  await page.click('.menu button:has-text("Copy as text")');
  const exported = await app.readClipboard();
  assert.ok(exported.includes("Serves 4") && exported.includes("⏱ 8 min") && exported.includes("⏱ 1 min"));
});

test("a save whose reply is lost doesn't duplicate, and saving the same paste again reuses it", async () => {
  const before = index().length;
  const card = "Lost Reply Soup\n\nIngredients\n• 1 l water\n\nSteps\n1. Boil 1 l water for 5 minutes.";
  await app.goto("#/import");
  await paste(card, "Lost Reply Soup");
  app.repo.dropNextPatchReply = true;
  await page.click('form button[type="submit"]');
  await page.waitForURL(/#\/r\/lost-reply-soup$/, { timeout: 10000 });
  assert.equal(index().length, before + 1);
  await app.goto("#/import");
  await paste(card, "Lost Reply Soup");
  await page.click('form button[type="submit"]');
  await page.waitForURL(/#\/r\/lost-reply-soup$/, { timeout: 10000 });
  assert.equal(app.repo.files()["recipes/lost-reply-soup-2/recipe.json"], undefined);
});

test("no console errors", () => app.assertNoErrors());
