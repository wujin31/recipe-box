// Pasta water & salt: how much water for your pasta, and how much salt for that water.

import { fill, h } from "../ui.js";
import { UNITS } from "../units.js";
import { amountField, choices, fromRecipe, toGrams, weighedIngredients } from "./kit.js";
import { grams, saltBySpoon } from "./salts.js";

const PASTA = /pasta|spaghetti|penne|fettuccine|linguine|rigatoni|tagliatelle|bucatini|macaroni|orzo|fusilli|farfalle|noodle|ziti|orecchiette|paccheri|udon|soba|ramen|fideo/i;

// Litres of water per 100 g of pasta.
const WATER = [
  [1, "Classic", "1 L per 100 g"],
  [0.5, "Less water", "starchier, boils sooner"],
];
// Salt as a share of the water's weight.
const SALT = [
  [0.007, "Light", "0.7%, for salty sauces"],
  [0.01, "Standard", "1%, 10 g per litre"],
  [0.015, "Bold", "1.5%, plain sauces"],
];

export function pastaTool({ recipe }) {
  const out = h("div", { class: "tool-result", "aria-live": "polite" });
  const draw = () => {
    const pasta = toGrams(amount.get());
    if (!pasta) { fill(out, h("p", { class: "muted" }, "Enter how much pasta you're cooking.")); return; }
    if (pasta > 10000) { fill(out, h("p", { class: "muted" }, "That's more than 10 kg of pasta. Check the unit?")); return; }
    // At least 2 L, so the pot doesn't stop boiling when the pasta goes in.
    const ratio = Math.round((pasta / 100) * water.get() * 4) / 4;
    const litres = Math.max(2, ratio);
    const pct = +(saltLevel.get() * 100).toFixed(1);
    const salt = litres * 1000 * saltLevel.get();
    const quarts = litres / 0.946353;
    fill(out,
      h("div", { class: "big-figures" },
        h("div", {}, h("span", { class: "label" }, "Water"), h("strong", {}, `${litres} L`), h("span", {}, `${Math.round(quarts * 4) / 4} qt`)),
        h("div", {}, h("span", { class: "label" }, "Salt"), h("strong", {}, grams(salt)), h("span", {}, `${pct}% of the water`))),
      ratio < 2 ? h("p", { class: "muted small" }, "At least 2 L, so the water keeps boiling when the pasta goes in.") : null,
      h("table", { class: "salt-table" },
        h("tbody", {}, saltBySpoon(salt).map((s) => h("tr", {}, h("th", {}, s.name), h("td", {}, s.spoons))))),
      h("p", { class: "muted small" }, "Salt the water once it's boiling. Taste it: it should taste pleasantly seasoned, not like the sea."));
  };
  const amount = amountField("Pasta", ["g", "oz", "lb", "kg"], { value: "", unit: "g", onChange: draw });
  const water = choices("Water", WATER, 1, draw);
  const saltLevel = choices("Salt", SALT, 0.01, draw);

  // Prefill from the recipe's pasta, if it has some by weight.
  const pasta = weighedIngredients(recipe).find((i) => PASTA.test(i.item ?? i.text));
  if (pasta) { amount.input.value = String(pasta.qty); amount.select.value = pasta.unit; }
  const picks = recipe ? fromRecipe(recipe, (r) => weighedIngredients(r).filter((i) => PASTA.test(i.item ?? i.text) && i !== pasta),
    (ing) => amount.set(String(ing.qty), UNITS[ing.unit] ? ing.unit : "g")) : null;
  draw();
  return h("div", { class: "tool" }, amount.el, picks, water.el, saltLevel.el, out);
}
