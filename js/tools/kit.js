// Small pieces the kitchen tools share: an amount-and-unit field, segmented choices, a result
// block, and reading amounts from the recipe a tool was opened from.

import { h } from "../ui.js";
import { UNITS, parseNumber } from "../units.js";

// "600", "1 1/2", "1,5" -> number (or NaN).
export const readNumber = (s) => parseNumber(String(s).trim().replace(/^(\d+),(\d+)$/, "$1.$2"));

// Amount + unit, calling onChange on every edit. Returns the element, and get() -> { value, unit }.
export function amountField(label, units, { value = "", unit = units[0], onChange }) {
  const input = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", value, "aria-label": label, placeholder: "0" });
  const select = h("select", { "aria-label": `${label} unit` }, units.map((u) => h("option", { value: u }, u)));
  select.value = unit;
  input.addEventListener("input", onChange);
  select.addEventListener("change", onChange);
  const el = h("div", { class: "field" }, h("span", {}, label), h("div", { class: "have" }, input, select));
  return {
    el, input, select,
    get: () => ({ value: readNumber(input.value), unit: select.value }),
    set: (v, u) => { input.value = v; if (u) select.value = u; onChange(); },
  };
}

// A row of choices; onPick(value) on tap. Returns the element and get().
export function choices(label, options, current, onPick) {
  let value = current;
  const buttons = options.map(([v, text, note]) => h("button", {
    type: "button", class: `choice-btn ${v === value ? "on" : ""}`, "aria-pressed": String(v === value),
    onClick: () => {
      value = v;
      buttons.forEach((b, i) => { b.classList.toggle("on", options[i][0] === v); b.setAttribute("aria-pressed", String(options[i][0] === v)); });
      onPick(v);
    },
  }, h("strong", {}, text), note ? h("span", {}, note) : null));
  return { el: h("div", { class: "field" }, h("span", {}, label), h("div", { class: "choice-row", role: "group", "aria-label": label }, buttons)), get: () => value };
}

// Grams from an amount in a weight unit (or ml of a water-like liquid).
export function toGrams({ value, unit }) {
  if (!(value > 0)) return null;
  if (unit === "qt") return value * 946.353;
  if (!UNITS[unit]) return null;
  return value * UNITS[unit].toBase; // g for weights, ml (as g of water) for volumes
}

// The recipe's ingredients measured by weight, for "use this" chips.
export const weighedIngredients = (recipe) =>
  (recipe?.ingredients ?? []).filter((i) => i.qty > 0 && UNITS[i.unit]?.kind === "mass");

// Chips that fill a field from the recipe's own amounts.
export function fromRecipe(recipe, pickable, onPick, label = "From this recipe") {
  const list = pickable(recipe);
  if (!list.length) return null;
  return h("div", { class: "field" }, h("span", {}, label),
    h("div", { class: "chips wrap" }, list.map((ing) => h("button", { type: "button", class: "chip", onClick: () => onPick(ing) }, ing.text.split(/,|\s\(/)[0]))));
}
