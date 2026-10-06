import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

// The list lives in localStorage; Node has none, so give it a plain in-memory one.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { shoppingName, shoppingKey, isBought, isStaple, aisleFor, totals, formatAmounts, addRecipe, removeRecipe, addExtra,
  toggle, clearChecked, items, recipesOnList, remaining, listText, DEFAULT_STAPLES } = await import("../js/shopping.js");
const { parseIngredientLine } = await import("../js/units.js");

const ing = (line) => parseIngredientLine(line);
beforeEach(() => mem.clear());

test("names to shop by", () => {
  assert.deepEqual(shoppingName("soy sauce 醬油 (jiàngyóu), Taiwanese if possible"), { name: "soy sauce", native: "醬油" });
  assert.deepEqual(shoppingName("油蔥酥 (yóucōng sū) fried shallot crisps"), { name: "fried shallot crisps", native: "油蔥酥" });
  assert.deepEqual(shoppingName("肉鬆 (ròusōng, pork floss) — optional, one roll only"), { name: "pork floss", native: "肉鬆" });
  assert.deepEqual(shoppingName("toasted sesame oil / 참기름 (chamgireum), to finish"), { name: "toasted sesame oil", native: "참기름" });
  assert.equal(shoppingName("bone-in, skin-on chicken thighs").name, "bone-in skin-on chicken thighs");
  assert.equal(shoppingName("large eggs for 滷蛋 (lǔdàn)").name, "eggs");
  assert.equal(shoppingName("lard or reserved pork fat").name, "lard");
  assert.equal(shoppingName("coarse or flaky salt (searing)").name, "flaky salt");
  assert.equal(shoppingName("關廟麵 or dried thin noodles (陽春麵)").name, "dried thin noodles");
});

test("keys merge the same thing written differently", () => {
  const key = (line) => shoppingKey(ing(line)).key;
  assert.equal(key("3 garlic cloves, minced"), "garlic");
  assert.equal(shoppingKey(ing("3 garlic cloves, minced")).unit, "clove");
  assert.equal(key("12 ml garlic, minced"), "garlic");
  for (const l of ["1 tsp kosher salt", "2 g fine sea salt (salsa)", "1 pinch flaky salt", "2.5 ml Diamond Crystal kosher salt (halve if Morton)"]) assert.equal(key(l), "salt", l);
  assert.equal(key("15 ml toasted sesame oil 참기름 (chamgireum)"), key("1 tbsp sesame oil"));
  assert.equal(key("2 scallion greens, sliced"), key("3 scallions, finely chopped"));
  assert.equal(key("2 egg yolks"), key("3 large eggs"));
  assert.equal(key("2 fresh red chilies, thinly sliced"), "red chili");
});

test("water and what the recipe makes itself aren't bought", () => {
  for (const l of ["15 ml water", "237 ml reserved noodle water", "15 ml oil from the fried-shallot jar (or neutral oil)", "1 cup hot water, for soaking shiitake"]) assert.equal(isBought(ing(l)), false, l);
  assert.equal(isBought(ing("2 l water chestnuts")), true);
});

test("staples you probably have", () => {
  for (const k of ["salt", "black pepper", "white pepper", "neutral oil", "sugar", "soy sauce"]) assert.ok(isStaple(k, DEFAULT_STAPLES), k);
  for (const k of ["soup soy sauce", "brown sugar", "sesame oil", "bell pepper"]) assert.ok(!isStaple(k, DEFAULT_STAPLES), k);
});

test("aisles", () => {
  const a = (k) => aisleFor(k, {});
  assert.equal(a("garlic"), "Produce");
  assert.equal(a("green bean"), "Produce");
  assert.equal(a("pinto bean"), "Pantry & Spices");
  assert.equal(a("sesame oil"), "Asian pantry");
  assert.equal(a("neutral oil"), "Pantry & Spices");
  assert.equal(a("egg fettuccine"), "Pantry & Spices");
  assert.equal(a("egg"), "Dairy & Eggs");
  assert.equal(a("pork belly"), "Meat & Seafood");
  assert.equal(a("chicken stock"), "Pantry & Spices");
  assert.equal(a("frozen thin-sliced beef"), "Frozen");
  assert.equal(a("fish sauce"), "Asian pantry");
  assert.equal(a("gochugaru"), "Asian pantry");
});

test("every ingredient in the real recipes gets a name and an aisle", () => {
  const dir = new URL("../recipes/", import.meta.url).pathname;
  let n = 0;
  for (const d of readdirSync(dir)) {
    const p = `${dir}${d}/recipe.json`;
    if (!existsSync(p)) continue;
    for (const i of JSON.parse(readFileSync(p, "utf8")).ingredients) {
      if (!isBought(i)) continue;
      const k = shoppingKey(i);
      assert.ok(k.key && k.name && !/[()/]/.test(k.name), `${i.text} -> ${JSON.stringify(k)}`);
      assert.ok(aisleFor(k.key, {}), i.text);
      n++;
    }
  }
  assert.ok(n > 200);
});

test("amounts add up across units", () => {
  const e = (line) => ({ ...shoppingKey(ing(line)), qty: ing(line).qty, unit: shoppingKey(ing(line)).unit || null });
  assert.equal(formatAmounts(totals([e("1 lb pork belly"), e("100 g pork belly")])), "555 g (1 1/4 lb)");
  assert.equal(formatAmounts(totals([e("3 garlic cloves"), e("12 ml garlic, minced")])), "6 cloves", "minced garlic counts as cloves");
  assert.equal(formatAmounts(totals([e("1/2 onion"), e("100 g onion")])), "1/2 + 100 g (3 1/2 oz)");
  assert.equal(formatAmounts(totals([e("2 limes"), e("1 lime")])), "3");
  assert.equal(formatAmounts(totals([e("2 tbsp mirin"), e("30 ml mirin")]), "us"), "1/4 cup");
});

test("the list: add, merge, tick, clear, take a recipe off", () => {
  const a = { id: "a", englishName: "Dish A", ingredients: ["3 garlic cloves, minced", "200 g ground pork", "1 tbsp soy sauce"].map(ing) };
  const b = { id: "b", englishName: "Dish B", ingredients: ["2 garlic cloves", "2 scallions, sliced"].map(ing) };
  addRecipe(a, a.ingredients, 2);
  addRecipe(b, b.ingredients);
  const garlic = items().find((it) => it.key === "garlic");
  assert.equal(garlic.amount, "8 cloves", "6 from A at double, 2 from B");
  assert.deepEqual(garlic.sources, ["Dish A", "Dish B"]);
  assert.equal(items().find((it) => it.key === "ground pork").amount, "400 g (14 oz)");
  assert.deepEqual(recipesOnList().map((r) => r.id), ["a", "b"]);
  addExtra("paper towels");
  assert.equal(remaining(), 5);
  toggle("garlic");
  toggle("extra:paper towels");
  assert.equal(remaining(), 3);
  assert.doesNotMatch(listText(), /garlic|paper towels/i, "ticked items are left out of the shared text");
  assert.match(listText(), /Produce\n- Scallions — 2/);
  clearChecked();
  assert.equal(items().some((it) => it.key === "garlic" || it.extra), false);
  removeRecipe("a");
  assert.deepEqual(items().map((it) => it.key), ["scallion"]);
  // Adding a recipe again replaces its earlier entries, and un-ticks what it needs.
  addRecipe(b, b.ingredients);
  toggle("scallion");
  addRecipe(b, b.ingredients);
  assert.equal(items().find((it) => it.key === "scallion").amount, "2");
  assert.equal(items().find((it) => it.key === "scallion").checked, false);
});
