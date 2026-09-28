import { test } from "node:test";
import assert from "node:assert/strict";
import { SALTS, spoons } from "../js/tools/salts.js";
import { DENSITIES, cToF, fToC, recipeConversions } from "../js/tools/convert.js";
import { toGrams } from "../js/tools/kit.js";
import { parseIngredientLine } from "../js/units.js";

test("salt by the spoon uses each brand's weight", () => {
  const g = (id) => SALTS.find((s) => s.id === id).gPerTsp;
  assert.equal(g("morton"), 4.8, "Morton's label: 1/4 tsp = 1.2 g");
  assert.ok(g("diamond") < g("morton") && g("morton") < g("table"));
  assert.equal(spoons(10 / g("table")), "1 3/4 tsp");
  assert.equal(spoons(20 / g("diamond")), "2 1/2 tbsp", "20 g is 2.38 tbsp");
  assert.equal(spoons(0.05), "a pinch");
  assert.equal(spoons(96), "2 cups");
});

test("weights from amounts", () => {
  assert.equal(toGrams({ value: 1, unit: "lb" }), 453.592);
  assert.equal(toGrams({ value: 2, unit: "l" }), 2000);
  assert.equal(toGrams({ value: 0, unit: "g" }), null);
});

test("cup weights match the right ingredient", () => {
  const d = (text) => DENSITIES.find((x) => x.match.test(text))?.name;
  assert.equal(d("light brown sugar"), "Brown sugar, packed");
  assert.equal(d("granulated sugar"), "Granulated sugar");
  assert.equal(d("unsalted butter, softened"), "Butter");
  assert.equal(d("creamy peanut butter"), undefined);
  assert.equal(d("jasmine rice"), "Long-grain rice, raw");
  const conv = recipeConversions({ ingredients: ["2 cups all-purpose flour", "1 tbsp sugar", "3 eggs", "200 g butter"].map(parseIngredientLine) });
  assert.deepEqual(conv.map((c) => Math.round(c.grams)), [240, 12]);
});

test("temperatures", () => {
  assert.equal(Math.round(fToC(350)), 177);
  assert.equal(cToF(200), 392);
});
