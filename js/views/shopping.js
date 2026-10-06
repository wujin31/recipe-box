// The shopping list (#/list), the sheet that adds a recipe to it, and the 🛒 button with its count.

import { onLeave } from "../lifecycle.js";
import { getSettings } from "../store.js";
import { keepAwake } from "../timers.js";
import { copyText, displayName, fill, h, icon, iconButton, navbar, toast } from "../ui.js";
import { formatIngredient } from "../units.js";
import {
  AISLES, addExtra, addRecipe, clearAll, clearChecked, getList, getStaples, isBought, isStaple, items, listText,
  onListChange, recipesOnList, remaining, removeItem, removeRecipe, setAisle, setStaples, shoppingKey, toggle,
} from "../shopping.js";
import { getView } from "./shared.js";

const system = () => (getSettings().units === "us" ? "us" : "metric");

// ---------- the 🛒 button ----------

// For nav bars: the list, with how many things are left to get.
export function cartButton() {
  const badge = h("span", { class: "badge" });
  const button = iconButton("cart", "Shopping list", () => (location.hash = "#/list"), "cart-btn");
  button.append(badge);
  const draw = () => {
    const n = remaining();
    badge.textContent = n || "";
    badge.hidden = !n;
    button.setAttribute("aria-label", n ? `Shopping list, ${n} to get` : "Shopping list");
  };
  draw();
  onLeave(onListChange(draw));
  return button;
}

// ---------- adding a recipe ----------

// Every ingredient with a box: ticked if you need to buy it. Staples, water, and what you've
// already checked off on the recipe page start unticked. `need` overrides that (cooking mode
// passes the ingredients you haven't got out yet).
export function openAddSheet(r, { factor = getView(r.id).factor, units = getView(r.id).units, need = null } = {}) {
  const staples = getStaples();
  const have = new Set(getView(r.id).checked);
  const onList = recipesOnList().some((x) => x.id === r.id);
  const rows = r.ingredients.map((ing) => {
    const bought = isBought(ing);
    const staple = bought && isStaple(shoppingKey(ing).key, staples);
    const want = need ? need.includes(ing) && bought && !staple : bought && !staple && !have.has(ing.text);
    const box = h("input", { type: "checkbox", checked: want });
    return { ing, box, row: h("label", { class: `add-row ${bought ? "" : "muted"}` }, box,
      h("span", {}, formatIngredient(ing, factor, units),
        staple ? h("span", { class: "add-note" }, "you probably have this") :
        !bought ? h("span", { class: "add-note" }, "not something to buy") :
        have.has(ing.text) ? h("span", { class: "add-note" }, "checked off: you have it") : null)) };
  });
  const save = h("button", { class: "button primary", type: "submit" });
  const count = () => {
    const n = rows.filter((x) => x.box.checked).length;
    save.textContent = n ? `Add ${n}` : onList ? "Remove" : "Add";
    save.disabled = !n && !onList;
  };
  rows.forEach((x) => x.box.addEventListener("change", count));
  count();

  const dialog = h("dialog", { class: "sheet add-sheet", "aria-label": `Add ${displayName(r)} to the shopping list` },
    h("form", {
      method: "dialog",
      onSubmit: (e) => {
        e.preventDefault();
        const chosen = rows.filter((x) => x.box.checked).map((x) => x.ing);
        if (chosen.length) addRecipe(r, chosen, factor);
        else removeRecipe(r.id);
        dialog.close();
        toast(chosen.length ? `Added ${chosen.length} to the shopping list` : "Taken off the shopping list", "",
          chosen.length ? { label: "View", onClick: () => (location.hash = "#/list") } : null);
      },
    },
    h("div", { class: "sheet-head" },
      h("button", { type: "button", class: "link", onClick: () => dialog.close() }, "Cancel"),
      h("strong", {}, "Shopping list"), save),
    h("p", { class: "muted small" }, onList ? "Already on your list; this replaces what it added. " : "",
      "Tick what you need to buy."),
    h("div", { class: "add-rows" }, rows.map((x) => x.row))));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

// ---------- the list ----------

export function viewList(root) {
  keepAwake(true); // you're holding the phone in a store
  onLeave(() => keepAwake(false));
  const share = iconButton("share", "Share the list", async () => {
    const text = listText(getList(), system());
    if (navigator.share) { try { await navigator.share({ title: "Shopping list", text }); } catch { /* cancelled */ } }
    else copyText(text, "List copied");
  });
  const body = h("div", { class: "shopping" });
  root.append(navbar(iconButton("back", "Back", () => (history.length > 1 ? history.back() : (location.hash = "#/"))), "", share),
    h("h1", { class: "large-title" }, "Shopping list"), body);

  const extra = h("input", { type: "text", placeholder: "Add something else", autocomplete: "off", "aria-label": "Add an item", maxlength: 120 });
  const addForm = h("form", { class: "add-extra", onSubmit: (e) => { e.preventDefault(); addExtra(extra.value); extra.value = ""; extra.focus(); } },
    extra, h("button", { class: "button", type: "submit" }, "Add"));

  const row = (it) => h("li", { class: `shop-item ${it.checked ? "done" : ""}` },
    h("button", { class: "check", role: "checkbox", "aria-checked": String(it.checked), onClick: () => toggle(it.key) },
      h("span", { class: "box" }, icon("check")),
      h("span", { class: "shop-text" },
        h("span", { class: "shop-name" }, it.name, it.native ? h("span", { class: "native" }, ` ${it.native}`) : null),
        it.sources.length ? h("span", { class: "shop-for" }, `for ${it.sources.join(", ")}`) : null),
      it.amount ? h("span", { class: "shop-amount" }, it.amount) : null),
    iconButton("more", `Options for ${it.name}`, () => itemSheet(it), "shop-more"));

  function draw() {
    const list = getList();
    const all = items(list, system());
    const onList = recipesOnList(list);
    if (!all.length) {
      fill(body,
        h("div", { class: "empty" },
          h("p", {}, "Nothing on your list."),
          h("p", { class: "muted" }, "On a recipe, tap 🛒 Add to shopping list. What you need from each recipe lands here, combined and sorted by aisle.")),
        addForm, staplesNote());
      return;
    }
    const left = all.filter((it) => !it.checked);
    const got = all.filter((it) => it.checked);
    fill(body,
      onList.length ? h("div", { class: "chips wrap on-list", "aria-label": "Recipes on this list" },
        onList.map((r) => h("span", { class: "chip" }, h("a", { href: `#/r/${encodeURIComponent(r.id)}` }, r.name),
          h("button", { class: "chip-x", "aria-label": `Take ${r.name} off the list`, onClick: () => removeRecipe(r.id) }, "×")))) : null,
      addForm,
      left.length ? AISLES.map((aisle) => {
        const here = left.filter((it) => it.aisle === aisle);
        return here.length ? h("section", { class: "aisle" }, h("h3", {}, aisle), h("ul", { class: "shop-list" }, here.map(row))) : null;
      }) : h("p", { class: "all-got pad" }, "Got everything ✓"),
      got.length ? h("section", { class: "aisle got" },
        h("div", { class: "section-head" }, h("h3", {}, `Got it · ${got.length}`),
          h("button", { class: "link small", onClick: () => clearChecked() }, "Clear ticked")),
        h("ul", { class: "shop-list" }, got.map(row))) : null,
      staplesNote(),
      h("button", { class: "button subtle", onClick: () => {
        if (confirm("Clear the whole shopping list?")) clearAll();
      } }, "Clear the whole list"));
  }

  // One item's options: move it to another aisle, or take it off.
  function itemSheet(it) {
    const dialog = h("dialog", { class: "sheet", "aria-label": it.name },
      h("form", { method: "dialog" },
        h("div", { class: "sheet-head" }, h("span"), h("strong", {}, it.name),
          h("button", { type: "button", class: "link", onClick: () => dialog.close() }, "Done")),
        it.entries.length ? h("ul", { class: "plain-list small muted" }, it.entries.map((e) => h("li", {}, `${e.recipeName}: ${e.text}`))) : null,
        h("div", { class: "field" }, h("span", {}, "Aisle"),
          h("div", { class: "picker" }, AISLES.map((a) => h("button", {
            type: "button", class: `pick ${a === it.aisle ? "on" : ""}`, "aria-pressed": String(a === it.aisle),
            onClick: () => { setAisle(it.key, a); dialog.close(); draw(); },
          }, a)))),
        h("button", { type: "button", class: "button", onClick: () => { removeItem(it.key); dialog.close(); } }, "Take it off the list")));
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  function staplesNote() {
    return h("p", { class: "muted small staples" }, "Left off unless you tick them: ", getStaples().join(", "), ". ",
      h("button", { class: "link small", onClick: editStaples }, "Edit"));
  }

  function editStaples() {
    const text = h("textarea", { rows: 4, value: getStaples().join(", ") });
    const dialog = h("dialog", { class: "sheet", "aria-label": "Staples" },
      h("form", { method: "dialog", onSubmit: (e) => {
        e.preventDefault();
        setStaples(text.value.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean));
        dialog.close(); draw();
      } },
        h("div", { class: "sheet-head" }, h("button", { type: "button", class: "link", onClick: () => dialog.close() }, "Cancel"),
          h("strong", {}, "Staples"), h("button", { class: "button primary", type: "submit" }, "Save")),
        h("label", {}, "Things you always have, so recipes don't add them (you can still tick them)", text)));
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  onLeave(onListChange(draw));
  draw();
}
