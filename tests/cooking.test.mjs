import { test } from "node:test";
import assert from "node:assert/strict";
import { findTimers, parseDuration, timerAction } from "../js/parser.js";
import { factorFor, parseIngredientLine, unitsFor } from "../js/units.js";

const label = (text, ingredients = []) => timerAction(text, findTimers(text)[0], ingredients);

test("a timer's label is the action it times", () => {
  assert.equal(label("Braise 1 hr 45 min undisturbed."), "Braise undisturbed");
  assert.equal(label("Rinse the rice until the water is mostly clear, then drain for 20 minutes."), "Drain");
  assert.equal(label("Fill to the Sushi line, select White/Sushi and start (about 55 minutes)."), "Select White/Sushi and start");
  assert.equal(label("Melt the butter in a stainless pan over medium heat and brown the thighs skin-side down, about 5 minutes."), "Brown the thighs skin-side down");
  assert.equal(label("Let the meat rest for at least 10 minutes."), "Let the meat rest");
  const range = "Simmer 1 hr 30 min to 2 hr until spoon-tender.";
  assert.deepEqual(findTimers(range).map((t) => timerAction(range, t)), ["Simmer until spoon-tender", "Simmer until spoon-tender"]);
});

test("ingredients in a label are shortened to their names", () => {
  const ings = ["2 tbsp neutral oil, divided", "300 g yellow onion (1 cm wedges)"].map(parseIngredientLine);
  assert.equal(label("Add 2 tbsp neutral oil, divided and 300 g yellow onion (1 cm wedges); cook 8 minutes.", ings), "Cook");
  assert.equal(label("Fry 300 g yellow onion (1 cm wedges) for 8 minutes.", ings), "Fry yellow onion");
});

test("a clause that only remarks on the time gives no label", () => {
  assert.equal(label("That's 3 minutes total."), "");
});

test("typed timer durations", () => {
  assert.equal(parseDuration("12"), 720);
  assert.equal(parseDuration("1:30"), 90);
  assert.equal(parseDuration("1:05:00"), 3900);
  assert.equal(parseDuration("0"), null);
  assert.equal(parseDuration("abc"), null);
  assert.equal(parseDuration("5000"), null, "over 48 hours");
});

test("scale to what you have", () => {
  const chicken = parseIngredientLine("25 oz bone-in chicken thighs");
  assert.equal(+factorFor(chicken, 1, "kg").toFixed(3), 1.411);
  assert.equal(factorFor(chicken, 50, "oz"), 2);
  assert.equal(factorFor(chicken, 1, "cup"), null, "weight vs volume");
  assert.deepEqual(unitsFor(chicken), ["oz", "g", "kg", "lb"]);
  const eggs = parseIngredientLine("3 large eggs");
  assert.equal(factorFor(eggs, 2, ""), 2 / 3);
  assert.deepEqual(unitsFor(eggs), [""]);
  assert.equal(factorFor(parseIngredientLine("salt to taste"), 5), null);
  assert.equal(factorFor(parseIngredientLine("800–1200 g pork belly"), 1200, "g"), 1.5, "a range scales from its low end");
});
