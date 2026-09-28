import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { guessChapter, guessCuisine, guessEquipment, recipeTime, formatTime, chaptersFrom, chapterOf, DEFAULT_CHAPTERS } from "../js/cookbook.js";
import { parseRecipeInput, parseTitle } from "../js/parser.js";

const r = (name, extra = {}) => ({ name, ...parseTitleLike(name), ingredients: [], steps: [], description: "", ...extra });
function parseTitleLike(name) { return { englishName: name, nativeName: "", romanized: "" }; }

test("chapter guesses for real recipe titles", () => {
  const cases = {
    "Korean Chicken Porridge": "breakfast",
    "Xīméndīng Spam Qǐsī Dàn Bǐng": "breakfast",
    "Sopa de Fideo con Pollo": "soups",
    "Kimchi Jjigae": "soups",
    "Chili Garlic Spam Fried Rice": "rice",
    "Spicy Braised Bolognese with Penne": "rice",
    "Seared Chicken Thigh Rice Bowl with Fried-Shallot Soy Jus": "rice",
    "Beef Sukiyaki Bowl": "rice",
    "Greek Salad Bowl": "salads",
    "Italian Sausage Rigatoni": "rice",
    "Ribeye with Garlic Butter Pan Sauce, Roasted Yukon Golds": "mains",
    "Smashed Cucumber Salad": "salads",
    "Lemon Bars": "desserts",
    "Banana Bread": "desserts",
    "Jay's Sauce": "sauces",
    "Sushi Rice": "sauces",
  };
  for (const [title, ch] of Object.entries(cases)) assert.equal(guessChapter(r(title)), ch, title);
  assert.equal(guessChapter({ ...r("滷肉飯 (lǔròufàn) Oven Braise"), romanized: "lǔròufàn" }), "rice");
});

test("cuisine from script, keywords, and the title's own words", () => {
  assert.equal(guessCuisine({ nativeName: "닭죽", englishName: "Korean Chicken Porridge" }), "Korean");
  assert.equal(guessCuisine({ nativeName: "ข้าวหมกไก่", englishName: "Thai Chicken Biryani" }), "Thai");
  assert.equal(guessCuisine({ nativeName: "ハヤシライス", englishName: "Hayashi Rice" }), "Japanese");
  assert.equal(guessCuisine({ nativeName: "紅燒肉", englishName: "Red-Braised Pork Belly" }), "Chinese");
  assert.equal(guessCuisine({ englishName: "Taiwanese Beef Rice" }), "Taiwanese");
  assert.equal(guessCuisine({ englishName: "Spicy Braised Bolognese with Penne" }), "Italian");
  assert.equal(guessCuisine({ englishName: "Sushi Rice" }), "Japanese");
  assert.equal(guessCuisine({ englishName: "DTF Cucumber Salad" }), "Taiwanese");
  assert.equal(guessCuisine({ englishName: "Anything", cuisine: "Filipino" }), "Filipino", "an explicit cuisine wins");
  assert.equal(guessCuisine({ englishName: "Jay's Toast" }), null);
});

test("equipment from the steps", () => {
  const dak = parseRecipeInput(readFileSync(new URL("./fixtures/dak-juk.txt", import.meta.url), "utf8"));
  assert.deepEqual(guessEquipment(dak), ["Rice cooker"]);
  assert.deepEqual(guessEquipment({ steps: [{ text: "Bake at 180°C for 20 minutes." }] }), ["Oven"]);
  assert.deepEqual(guessEquipment({ steps: [{ text: "Sprinkle roasted sesame seeds." }] }), []);
  assert.deepEqual(guessEquipment({ steps: [{ text: "Heat oil in a Dutch oven over medium-high." }] }), []);
  assert.deepEqual(guessEquipment({ steps: [{ text: "Stir in the roasted garlic." }] }), []);
  assert.deepEqual(guessEquipment({ steps: [{ text: "Roast at 425°F until golden." }] }), ["Oven"]);
});

test("time splits cooking from long waits", () => {
  const t = recipeTime({ steps: [{ timers: [{ seconds: 86400 }] }, { timers: [{ seconds: 600 }, { seconds: 1200 }] }, { timers: [] }] });
  assert.deepEqual(t, { cook: 1200, wait: 86400 });
  assert.equal(formatTime(t), "20 min + 24 hr wait");
  assert.equal(formatTime({ cook: 6300, wait: 0 }), "1 hr 45 min");
});

test("chapter list from cookbook.json, with fallbacks", () => {
  assert.deepEqual(chaptersFrom(null), DEFAULT_CHAPTERS);
  const custom = chaptersFrom({ chapters: [{ id: "weeknight", name: "Weeknight" }, { id: "unsorted", name: "x" }, { bad: 1 }] });
  assert.deepEqual(custom, [{ id: "weeknight", name: "Weeknight" }]);
  assert.equal(chapterOf({ chapter: "weeknight" }, custom), "weeknight");
  assert.equal(chapterOf({ chapter: "gone" }, custom), "unsorted");
  assert.equal(chapterOf({}, custom), "unsorted");
});

test("every fixture card gets some chapter guess", () => {
  const dir = new URL("./fixtures/synthetic/", import.meta.url);
  const misses = readdirSync(dir).filter((f) => !guessChapter(parseRecipeInput(readFileSync(new URL(f, dir), "utf8"))));
  assert.ok(misses.length <= 3, `no guess for: ${misses.join(", ")}`);
});

test("real title shapes split into English, native, romanized, subtitle", () => {
  const cases = [
    ["Beef Pepper Rice (ビーフペッパーライス / Bīfu Peppā Raisu) — Pepper Lunch Dupe", "Beef Pepper Rice", "ビーフペッパーライス", "Bīfu Peppā Raisu", "Pepper Lunch Dupe"],
    ["Black Vinegar Lacquered Spam Donburi (黒酢スパム丼 / kurozu supamu-don)", "Black Vinegar Lacquered Spam Donburi", "黒酢スパム丼", "kurozu supamu-don"],
    ["Carne Asada Norteña — Citrus Marinade, Stainless Stovetop (v2)", "Carne Asada Norteña", "", "", "Citrus Marinade, Stainless Stovetop (v2)"],
    ["Gyū Suki-don 牛すき丼 — Beef Sukiyaki Bowl", "Beef Sukiyaki Bowl", "牛すき丼", "Gyū Suki-don"],
    ["Sumeshi 酢飯 (Sushi Rice)", "Sushi Rice", "酢飯", "Sumeshi"],
    ["滷肉飯 (lǔròufàn) Oven Braise, 1.25 lb", "Lǔròufàn Oven Braise, 1.25 lb", "滷肉飯", "lǔròufàn"],
    ["牛肉燥飯 (niúròu zào fàn) — Taiwanese Beef Rice, v2", "Taiwanese Beef Rice, v2", "牛肉燥飯", "niúròu zào fàn"],
    ["蒜蓉辣椒 Spam 炒飯 (Suànróng Làjiāo Spam Chǎofàn) — Chili Garlic Spam Fried Rice", "Chili Garlic Spam Fried Rice", "蒜蓉辣椒 Spam 炒飯", "Suànróng Làjiāo Spam Chǎofàn"],
    ["西門町 Spam 起司蛋餅 (Xīméndīng Spam Qǐsī Dàn Bǐng)", "Xīméndīng Spam Qǐsī Dàn Bǐng", "西門町 Spam 起司蛋餅", "Xīméndīng Spam Qǐsī Dàn Bǐng"],
    ["Bibimbap (비빔밥) · Mixed Rice", "Mixed Rice", "비빔밥", "Bibimbap"],
    ["Mapo Tofu · 麻婆豆腐", "Mapo Tofu", "麻婆豆腐", ""],
    ["Cinnamon Rolls · With Cream Cheese Glaze", "Cinnamon Rolls", "", "", "With Cream Cheese Glaze"],
    ["Chicken (Thai style)", "Chicken (Thai style)", "", ""],
  ];
  for (const [title, englishName, nativeName, romanized, subtitle] of cases) {
    const t = parseTitle(title);
    assert.deepEqual([t.englishName, t.nativeName, t.romanized, t.subtitle], [englishName, nativeName, romanized, subtitle], title);
  }
});
