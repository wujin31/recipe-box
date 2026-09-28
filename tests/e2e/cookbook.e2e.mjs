// Cookbook organisation: choosing a chapter when adding, sorting unsorted recipes, updating a
// recipe by re-importing its card, tweaks, and undoing a delete.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startApp, fixture } from "./harness.mjs";

let app, page;
before(async () => { app = await startApp(); page = app.page; await app.connect(); });
after(async () => { await app.close(); });

const recipe = (id) => app.repo.json(`recipes/${id}/recipe.json`);
const paste = async (card, expect) => {
  await app.clipboard(card);
  await page.click('button:has-text("Paste")');
  await page.waitForFunction((t) => document.querySelector(".preview")?.textContent.includes(t), expect);
};

test("the first open with nothing in a chapter goes straight to sorting, once", async () => {
  await app.goto("#/");
  await page.waitForSelector(".sort-card");
  assert.match(await page.evaluate(() => location.hash), /#\/sort$/);
  await page.click('a:has-text("Done")');
  await page.waitForSelector(".sort-banner");
  await app.goto("#/");
  await page.waitForSelector(".sort-banner");
  assert.match(await page.evaluate(() => location.hash), /^#?\/?$/, "not again");
});

test("the whole cookbook is kept offline, including recipes never opened", async () => {
  await page.waitForFunction(() => Object.keys(JSON.parse(localStorage.getItem("rb:offlineCopies") ?? "{}")).length === 4, null, { timeout: 10000 });
  await app.ctx.setOffline(true);
  try {
    await page.evaluate(() => { location.hash = "#/r/mu-bap"; });
    await page.waitForSelector(".recipe-title");
    assert.match(await page.textContent(".recipe-title"), /Korean Radish Rice/);
  } finally { await app.ctx.setOffline(false); }
});

test("adding a recipe: the chapter guess is picked, and can be changed", async () => {
  await app.goto("#/import");
  await paste(fixture("pad-kra-pao-gai.txt"), "Thai Basil");
  await page.waitForSelector('.pick.on:has-text("Mains")');
  assert.match(await page.textContent(".pick.on"), /Guess/);
  assert.match(await page.textContent(".preview"), /Thai/, "cuisine shown");
  assert.match(await page.textContent('button[type="submit"]'), /Save to Mains/);
  await page.click('.pick:has-text("Rice & Noodles")');
  assert.match(await page.textContent('button[type="submit"]'), /Save to Rice & Noodles/);
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/r\/pad-kra-pao-gai$/);
  assert.equal(recipe("pad-kra-pao-gai").chapter, "rice");
  assert.equal(app.repo.json("recipes/index.json").recipes.find((r) => r.id === "pad-kra-pao-gai").chapter, "rice");
  await page.waitForSelector(".hero-eyebrow");
  assert.match(await page.textContent(".hero-eyebrow"), /Rice & Noodles/);
});

test("sorting: each tap files a recipe and moves on", async () => {
  await app.goto("#/");
  await page.waitForSelector(".sort-banner");
  assert.match(await page.textContent(".sort-banner"), /4 recipes to sort/);
  await page.click(".sort-banner");
  await page.waitForSelector(".sort-card");
  assert.match(await page.textContent(".nav"), /1 of 4/);
  const first = await page.textContent(".sort-title");
  await page.click('.pick:has-text("Soups & Stews")');
  await page.waitForFunction((t) => document.querySelector(".sort-title")?.textContent !== t, first);
  await page.click(".pick.skip");
  for (let i = 0; i < 2; i++) {
    const t = await page.textContent(".sort-title");
    await page.click(".pick.guess");
    await page.waitForFunction((x) => document.querySelector(".sort-title")?.textContent !== x || document.querySelector(".empty"), t);
  }
  await page.waitForSelector(".empty");
  assert.match(await page.textContent(".empty"), /3 recipes now have a chapter/);
  await page.waitForTimeout(800); // saves finish in the background
  const unsorted = app.repo.json("recipes/index.json").recipes.filter((r) => !r.chapter);
  assert.equal(unsorted.length, 1, "one was skipped");
  await app.goto("#/");
  await page.waitForSelector(".sort-banner");
  assert.match(await page.textContent(".sort-banner"), /1 recipe to sort/);
});

test("re-importing an updated card updates the recipe and keeps log, favorite, tweaks", async () => {
  const id = "dak-juk";
  app.repo.commitFromElsewhere({
    [`recipes/${id}/recipe.json`]: JSON.stringify({ ...recipe(id), favorite: true, tweaks: "less salt", log: [{ date: "2026-09-01", rating: 5 }] }),
  });
  const card = fixture("dak-juk.txt").replace("Top each bowl", "Top each warm bowl");
  await app.goto("#/import");
  await paste(card, "Korean Chicken Porridge");
  await page.waitForSelector(".choice");
  assert.match(await page.textContent(".choice legend"), /You already have “Korean Chicken Porridge”/);
  assert.match(await page.textContent('button[type="submit"]'), /Update “Korean Chicken Porridge”/);
  const count = app.repo.json("recipes/index.json").recipes.length;
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/r\/dak-juk$/);
  const r = recipe(id);
  assert.match(r.steps.at(-1).text, /Top each warm bowl/);
  assert.equal(r.favorite, true);
  assert.equal(r.tweaks, "less salt");
  assert.equal(r.log.length, 1);
  assert.match(app.repo.files()[`recipes/${id}/source.txt`], /Top each warm bowl/);
  assert.equal(app.repo.json("recipes/index.json").recipes.length, count, "no duplicate");
});

test("a v2 card matches the original, and 'Save as a new recipe' keeps both", async () => {
  await app.goto("#/import");
  await paste(fixture("mu-bap.txt").replace("· Korean Radish Rice with Beef", "· Korean Radish Rice with Beef, v2"), "v2");
  await page.waitForSelector(".choice");
  await page.check('input[value="new"]');
  assert.match(await page.textContent('button[type="submit"]'), /Save to/);
  await page.click('button[type="submit"]');
  await page.waitForURL(/#\/r\/mu-bap-2$|#\/r\/mu-bap-v2$/);
  assert.ok(recipe("mu-bap"), "original kept");
});

test("my tweaks: add and edit", async () => {
  await app.goto("#/r/khao-mok-kai");
  await page.waitForSelector(".tweaks");
  await page.click('.tweaks button:has-text("Add")');
  await page.fill("dialog textarea", "Use 400 ml stock.");
  await page.click('dialog button:has-text("Save")');
  await page.waitForSelector('.tweaks .notes:has-text("Use 400 ml stock.")');
  assert.equal(recipe("khao-mok-kai").tweaks, "Use 400 ml stock.");
});

test("delete, then Undo puts it back", async () => {
  const before = recipe("khao-mok-kai");
  await page.click('button[aria-label="More"]');
  await page.click('.menu button:has-text("Delete")');
  await page.waitForSelector(".toast .toast-action");
  assert.equal(recipe("khao-mok-kai"), null);
  await page.click(".toast .toast-action");
  await page.waitForURL(/#\/r\/khao-mok-kai$/);
  await page.waitForSelector(".recipe-title");
  assert.deepEqual(recipe("khao-mok-kai").tweaks, before.tweaks);
  assert.ok(app.repo.json("recipes/index.json").recipes.some((r) => r.id === "khao-mok-kai"));
  assert.ok(app.repo.files()["recipes/khao-mok-kai/source.txt"]);
});

test("editing can move a recipe to another chapter", async () => {
  await app.goto("#/r/khao-mok-kai/edit");
  await page.waitForSelector(".picker .pick");
  await page.click('.pick:has-text("Mains")');
  await page.click('button:has-text("Save changes")');
  await page.waitForURL(/#\/r\/khao-mok-kai$/);
  assert.equal(recipe("khao-mok-kai").chapter, "mains");
});

test("no console errors", () => app.assertNoErrors());
