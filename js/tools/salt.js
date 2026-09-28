// Salt %: salt as a share of weight, for dry brines, wet brines, equilibrium brines and ferments.

import { fill, h } from "../ui.js";
import { amountField, choices, fromRecipe, readNumber, toGrams, weighedIngredients } from "./kit.js";
import { grams, saltBySpoon } from "./salts.js";

// id, label, note, default %, what the % is of.
const MODES = {
  dry: { label: "Dry brine", note: "salt on the food", pct: 1, of: "food", help: "1% of the meat's weight seasons it through. Rest uncovered in the fridge, 1 hour to 2 days." },
  wet: { label: "Wet brine", note: "food soaks in it", pct: 5, of: "water", help: "5% of the water's weight for a few hours; use 3% for an overnight soak." },
  equilibrium: { label: "Equilibrium", note: "can't over-salt", pct: 1.5, of: "both", help: "The food ends up at exactly this saltiness however long it sits: salt is a share of food and water together." },
  ferment: { label: "Ferment", note: "kraut, kimchi", pct: 2, of: "food", help: "2% of the vegetables' weight for sauerkraut; 2–5% for pickles in brine (use Equilibrium, counting the water)." },
};

export function saltTool({ recipe }) {
  let mode = "dry";
  const out = h("div", { class: "tool-result", "aria-live": "polite" });
  const pct = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", value: "1", "aria-label": "Salt percent" });
  const help = h("p", { class: "muted small" });

  const draw = () => {
    const m = MODES[mode];
    food.el.hidden = m.of === "water";
    water.el.hidden = m.of === "food";
    if (picks) picks.hidden = m.of === "water";
    help.textContent = m.help;
    const p = readNumber(pct.value);
    const base = (m.of !== "water" ? toGrams(food.get()) ?? 0 : 0) + (m.of !== "food" ? toGrams(water.get()) ?? 0 : 0);
    if (!(p > 0) || !(p < 30)) { fill(out, h("p", { class: "muted" }, "Enter a percentage, like 1 or 2.5.")); return; }
    if (!base) { fill(out, h("p", { class: "muted" }, m.of === "water" ? "Enter how much water." : "Enter the weight.")); return; }
    const salt = (base * p) / 100;
    fill(out,
      h("div", { class: "big-figures" },
        h("div", {}, h("span", { class: "label" }, "Salt"), h("strong", {}, grams(salt)),
          h("span", {}, `${p}% of ${grams(base)}${m.of === "both" ? " (food + water)" : ""}`))),
      h("table", { class: "salt-table" },
        h("tbody", {}, saltBySpoon(salt).map((s) => h("tr", {}, h("th", {}, s.name), h("td", {}, s.spoons))))));
  };

  const food = amountField("Food", ["g", "kg", "oz", "lb"], { unit: "g", onChange: draw });
  const water = amountField("Water", ["ml", "l", "cup", "qt"], { unit: "ml", onChange: draw });
  pct.addEventListener("input", draw);
  const modes = choices("For", Object.entries(MODES).map(([id, m]) => [id, m.label, m.note]), mode, (v) => {
    mode = v; pct.value = String(MODES[v].pct); draw();
  });
  const picks = recipe ? fromRecipe(recipe, weighedIngredients, (ing) => food.set(String(ing.qty), ing.unit)) : null;
  draw();
  return h("div", { class: "tool" },
    modes.el,
    food.el, picks, water.el,
    h("label", { class: "field" }, h("span", {}, "Salt %"), h("div", { class: "have pct" }, pct, h("span", { class: "suffix" }, "%"))),
    help, out);
}
