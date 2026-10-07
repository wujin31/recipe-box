// Cups ↔ grams for common ingredients, °F ↔ °C, and gas marks.

import { h } from "../ui.js";
import { UNITS, formatDecimal, formatFraction } from "../units.js";
import { amountField, readNumber } from "./kit.js";
import { spoons } from "./salts.js";

// Grams per US cup. Flours and sugars as King Arthur Baking weighs them (spooned into the cup and
// levelled; scooping packs more in); liquids by density. A cup is 236.6 ml.
export const DENSITIES = [
  { name: "All-purpose flour", g: 120, match: /\b(?:all[- ]purpose|plain) flour\b|^flour\b/i },
  { name: "Bread flour", g: 120, match: /\bbread flour\b/i },
  { name: "Whole wheat flour", g: 113, match: /\bwhole[- ]wheat flour\b/i },
  // The first match wins, so the specific sugars come before plain sugar.
  { name: "Brown sugar, packed", g: 213, match: /\bbrown sugar\b/i },
  { name: "Powdered sugar", g: 113, match: /\b(?:powdered|confectioners'?|icing) sugar\b/i },
  { name: "Granulated sugar", g: 198, match: /\b(?:granulated |white )?sugar\b(?! snap)/i },
  { name: "Butter", g: 227, match: /(?<!peanut |nut |apple )\bbutter\b/i },
  { name: "Water", g: 237, match: /\bwater\b|\bstock\b|\bbroth\b/i },
  { name: "Milk", g: 242, match: /\bmilk\b/i },
  { name: "Heavy cream", g: 238, match: /\b(?:heavy|whipping|double) cream\b/i },
  { name: "Neutral oil", g: 218, match: /\b(?:vegetable|canola|neutral|olive|sunflower) oil\b/i },
  { name: "Honey", g: 336, match: /\bhoney\b/i },
  { name: "Rolled oats", g: 89, match: /\boats\b/i },
  { name: "Cocoa powder", g: 84, match: /\bcocoa\b/i },
  { name: "Cornstarch", g: 112, match: /\bcorn ?starch\b/i },
  { name: "Long-grain rice, raw", g: 185, match: /\b(?:jasmine|basmati|long[- ]grain|white) rice\b/i },
  { name: "Short-grain rice, raw", g: 200, match: /\b(?:short[- ]grain|sushi|japanese) rice\b/i },
  { name: "Grated Parmesan", g: 100, match: /\bparmesan|parmigiano|pecorino\b/i },
];

// UK gas marks (the standard conversion table).
const GAS = [["¼", 225, 110], ["½", 250, 120], ["1", 275, 140], ["2", 300, 150], ["3", 325, 170], ["4", 350, 180],
  ["5", 375, 190], ["6", 400, 200], ["7", 425, 220], ["8", 450, 230], ["9", 475, 240]];

export const fToC = (f) => ((f - 32) * 5) / 9;
export const cToF = (c) => (c * 9) / 5 + 32;

// Under 1/4 cup, spoons: "5 g flour" is "1 3/4 tsp", not "0 cups".
const cupsText = (cups) => (cups < 0.23 ? spoons(cups * 48) : `${formatFraction(Math.round(cups * 8) / 8)} cup${cups > 1.06 ? "s" : ""}`);

// The recipe's ingredients measured in cups or spoons that we know a weight for.
export function recipeConversions(recipe) {
  return (recipe?.ingredients ?? []).flatMap((ing) => {
    if (!(ing.qty > 0) || UNITS[ing.unit]?.kind !== "volume") return [];
    const d = DENSITIES.find((x) => x.match.test(ing.item ?? ing.text));
    if (!d) return [];
    const cups = (ing.qty * UNITS[ing.unit].toBase) / UNITS.cup.toBase;
    return [{ ing, d, grams: cups * d.g }];
  });
}

export function convertTool({ recipe }) {
  // Cups ↔ grams
  const which = h("select", { "aria-label": "Ingredient" }, DENSITIES.map((d, i) => h("option", { value: i }, d.name)));
  const result = h("p", { class: "tool-line", "aria-live": "polite" });
  const draw = () => {
    const d = DENSITIES[Number(which.value)];
    const { value, unit } = amount.get();
    if (!(value > 0)) { result.textContent = `1 cup ≈ ${d.g} g`; return; }
    if (value > 10000) { result.textContent = "That's a lot. Check the unit?"; return; }
    if (unit === "g") result.textContent = `${value} g ≈ ${cupsText(value / d.g)}`;
    else {
      const cups = (value * UNITS[unit].toBase) / UNITS.cup.toBase;
      result.textContent = `≈ ${formatDecimal(cups * d.g)} g`;
    }
  };
  which.addEventListener("change", draw);
  const amount = amountField("Amount", ["cup", "tbsp", "tsp", "g"], { unit: "cup", onChange: draw });
  draw();

  const mine = recipeConversions(recipe);

  // Temperatures, both ways.
  // A full keyboard, not a number pad: iOS number pads have no minus sign for -18 °C.
  const f = h("input", { type: "text", autocomplete: "off", placeholder: "350", "aria-label": "Fahrenheit" });
  const c = h("input", { type: "text", autocomplete: "off", placeholder: "180", "aria-label": "Celsius" });
  const temp = (s) => { const t = s.trim().replace(/^[−–]/, "-"); const n = t.startsWith("-") ? -readNumber(t.slice(1)) : readNumber(t); return Math.abs(n) < 2000 ? n : NaN; };
  f.addEventListener("input", () => { const v = temp(f.value); c.value = Number.isFinite(v) ? String(Math.round(fToC(v))) : ""; });
  c.addEventListener("input", () => { const v = temp(c.value); f.value = Number.isFinite(v) ? String(Math.round(cToF(v))) : ""; });

  return h("div", { class: "tool" },
    mine.length ? h("section", {},
      h("h3", {}, "This recipe by weight"),
      h("ul", { class: "plain-list conversions" }, mine.map(({ ing, d, grams }) =>
        h("li", {}, h("span", {}, ing.text.split(/,|\s\(/)[0]), h("strong", {}, `≈ ${formatDecimal(grams)} g`), h("span", { class: "muted small" }, d.name))))) : null,
    h("h3", {}, "Cups ↔ grams"),
    h("label", { class: "field" }, h("span", {}, "Ingredient"), which),
    amount.el, result,
    h("p", { class: "muted small" }, "Spoon flour into the cup and level it; a scooped cup can weigh 20% more."),
    h("h3", {}, "Oven temperature"),
    h("div", { class: "temps" },
      h("label", { class: "field" }, h("span", {}, "°F"), f), h("span", { class: "eq", "aria-hidden": "true" }, "="),
      h("label", { class: "field" }, h("span", {}, "°C"), c)),
    h("table", { class: "salt-table gas" },
      h("thead", {}, h("tr", {}, h("th", {}, "Gas mark"), h("th", {}, "°F"), h("th", {}, "°C"))),
      h("tbody", {}, GAS.map(([g, fv, cv]) => h("tr", {}, h("td", {}, g), h("td", {}, fv), h("td", {}, cv))))),
    h("p", { class: "muted small" }, "Fan (convection) ovens: about 20 °C / 25 °F lower."));
}
