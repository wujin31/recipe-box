import { test } from "node:test";
import assert from "node:assert/strict";
import { findTimers, parseDuration, timerAction, timerPositions } from "../js/parser.js";
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

test("times that aren't something to time aren't timers", () => {
  const secs = (text) => findTimers(text).map((t) => t.seconds);
  assert.deepEqual(secs("Simmer, scraping the base every 20–30 minutes."), []);
  assert.deepEqual(secs("Turn the eggs over at the 15-minute mark."), []);
  assert.deepEqual(secs("Boil 9 minutes, 2 minutes less than the package time."), [540]);
  assert.deepEqual(secs("Cook about 1 minute short of the package time."), []);
  assert.deepEqual(secs("Marinate 2 hours, or up to 24 hours."), [7200]);
  assert.deepEqual(secs("Marinate at least 1 hour; don't go past 2 hours."), [3600]);
  assert.deepEqual(secs("If thin, stop at 4 minutes instead."), []);
  assert.deepEqual(secs("Sear 2 minutes, flip, sear 1 minute. That's 3 minutes total."), [120, 60]);
  assert.deepEqual(secs("Roast 25 minutes, flip, roast 25 minutes more, about 50 minutes total."), [1500, 1500]);
  assert.deepEqual(secs("Cook 10 minutes total, stirring."), [600], "a total alone is still the step's time");
});

test("two timers with the same time get their own labels", () => {
  const text = "Let the skillet sit off the heat 1 minute. Cook the shallot 1 minute, then add the garlic and stir 1 minute.";
  const timers = findTimers(text);
  const at = timerPositions(text, timers);
  assert.deepEqual(timers.map((t, k) => timerAction(text, t, [], at[k])), ["Let the skillet sit off the heat", "Cook the shallot", "Add the garlic and stir"]);
  const range = "Cook 4–5 minutes until 175°F. Rest 5 minutes.";
  const rt = findTimers(range);
  assert.deepEqual(timerPositions(range, rt), [5, range.indexOf("5 minutes.")], "\"5 minutes\" isn't the end of \"4–5 minutes\"");
});

test("a label starts with something to do", () => {
  assert.equal(label("Sear 2 minutes per side, turning once."), "Sear per side");
  assert.equal(label("Sear the steak, turning once, 3 minutes."), "Sear the steak");
  assert.deepEqual(findTimers("That's 3 minutes."), []);
});

test("typed timer durations", () => {
  assert.equal(parseDuration("12"), 720);
  assert.equal(parseDuration("1:30"), 90);
  assert.equal(parseDuration("1:05:00"), 3900);
  assert.equal(parseDuration("0"), null);
  assert.equal(parseDuration("1:75"), null);
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
