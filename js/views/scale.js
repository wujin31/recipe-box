// "Scale to what I have": pick an ingredient, say how much you have, and the recipe scales to it.

import { displayName, h } from "../ui.js";
import { UNITS, factorFor, formatIngredient, parseNumber, unitsFor } from "../units.js";

// The ingredient you most likely have a set amount of: the first one by weight (the meat, the
// rice), else the first with an amount.
const likely = (ings) => Math.max(0, ings.findIndex((i) => UNITS[i.unit]?.kind === "mass"));

export function openScaleSheet(r, apply) {
  const ings = r.ingredients.filter((i) => i.qty != null && i.qty > 0);
  if (!ings.length) return;
  const pick = h("select", { "aria-label": "Ingredient" },
    ings.map((ing, i) => h("option", { value: i }, formatIngredient(ing, 1, "original"))));
  pick.value = String(likely(ings));
  const amount = h("input", { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "e.g. 600", "aria-label": "Amount you have" });
  const unit = h("select", { "aria-label": "Unit" });
  const result = h("p", { class: "scale-result", "aria-live": "polite" });
  const save = h("button", { class: "button primary", type: "submit", disabled: true }, "Scale");

  let factor = null;
  const fillUnits = () => {
    const ing = ings[Number(pick.value)];
    unit.replaceChildren(...unitsFor(ing).map((u) => h("option", { value: u }, u || "whole")));
    unit.hidden = unit.options.length < 2 && !unit.value;
  };
  const update = () => {
    const ing = ings[Number(pick.value)];
    factor = factorFor(ing, parseNumber(amount.value.replace(",", ".")), unit.value);
    save.disabled = !factor;
    if (!amount.value.trim()) result.textContent = `The recipe uses ${formatIngredient(ing, 1, "original")}.`;
    else if (!factor) result.textContent = "Enter an amount, like 600 or 1 1/2.";
    else {
      const servings = r.servings ? ` · ${Math.round(r.servings * factor * 10) / 10} servings` : "";
      result.textContent = `×${+factor.toFixed(2)}${servings}`;
    }
  };
  pick.addEventListener("change", () => { fillUnits(); update(); });
  amount.addEventListener("input", update);
  unit.addEventListener("change", update);
  fillUnits(); update();

  const dialog = h("dialog", { class: "sheet", "aria-label": `Scale ${displayName(r)}` },
    h("form", {
      method: "dialog",
      onSubmit: (e) => {
        e.preventDefault();
        if (!factor) return;
        apply(Math.round(factor * 1000) / 1000);
        dialog.close();
      },
    },
    h("div", { class: "sheet-head" },
      h("button", { type: "button", class: "link", onClick: () => dialog.close() }, "Cancel"),
      h("strong", {}, "Scale to what I have"), save),
    h("label", {}, "Ingredient", pick),
    h("div", { class: "field" }, h("span", {}, "I have"), h("div", { class: "have" }, amount, unit)),
    result));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  amount.focus();
}
