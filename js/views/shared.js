// Pieces shared by the recipe and cooking screens: per-device view state, step rendering, the cook log.

import { recipeToText, refreshRecipe, timerAction } from "../parser.js";
import { getRecipe, getSettings, loadLocal, saveLocal, updateRecipe } from "../store.js";
import { shortDuration, startTimer } from "../timers.js";
import { backButton, copyText, displayName, errorMessage, h, icon, navbar, requireWrite, toast } from "../ui.js";
import { convertTemperatures, formatIngredient } from "../units.js";

// ---------- per-recipe view state (this device only) ----------

export const viewKey = (id) => `view:${id}`;
export function getView(id) {
  return { factor: 1, units: getSettings().units, checked: [], ...loadLocal(viewKey(id), {}) };
}
export function setView(id, patch) {
  // Only what was changed here, so defaults (like Settings → Units) still apply to the rest.
  saveLocal(viewKey(id), { ...loadLocal(viewKey(id), {}), ...patch });
}

// Step text with each referenced ingredient replaced by its scaled/converted amount and each
// time turned into a tap-to-start timer.
export function renderStep(recipe, stepIndex, factor, units) {
  const step = recipe.steps[stepIndex];
  const text = step.text;
  const marks = [];
  const refs = [...(step.ingredientRefs ?? [])].sort((a, b) => recipe.ingredients[b].text.length - recipe.ingredients[a].text.length);
  const overlaps = (s, e) => marks.some((m) => s < m.end && e > m.start);
  for (const i of refs) {
    const ing = recipe.ingredients[i];
    let from = 0;
    for (;;) {
      const at = text.indexOf(ing.text, from);
      if (at < 0) break;
      const end = at + ing.text.length;
      if (!overlaps(at, end)) marks.push({ start: at, end, kind: "ing", ing });
      from = end;
    }
  }
  const unplaced = [];
  for (const t of step.timers ?? []) {
    const at = t.text ? text.indexOf(t.text) : -1;
    if (at >= 0 && !overlaps(at, at + t.text.length)) marks.push({ start: at, end: at + t.text.length, kind: "timer", t });
    else unplaced.push(t);
  }
  marks.sort((a, b) => a.start - b.start);

  const out = [];
  let pos = 0;
  for (const m of marks) {
    out.push(convertTemperatures(text.slice(pos, m.start), units));
    if (m.kind === "ing") out.push(h("span", { class: "ing-ref" }, formatIngredient(m.ing, factor, units)));
    else {
      // Keep "." or "," after a chip on the chip's line.
      const tail = text.slice(m.end).match(/^[.,;:!?)]+/)?.[0] ?? "";
      out.push(h("span", { class: "nowrap" }, timerChip(m.t, timerInfo(recipe, stepIndex, m.t), m.t.text), tail));
      m.end += tail.length;
    }
    pos = m.end;
  }
  out.push(convertTemperatures(text.slice(pos), units));
  for (const t of unplaced) out.push(" ", timerChip(t, timerInfo(recipe, stepIndex, t)));
  return out;
}

// What a step's timer shows while it runs: "Braise undisturbed", from "Lǔròufàn · step 6", linking back.
export function timerInfo(recipe, stepIndex, t) {
  return {
    label: timerAction(recipe.steps[stepIndex].text, t, recipe.ingredients) || `Step ${stepIndex + 1}`,
    sub: `${displayName(recipe)} · step ${stepIndex + 1}`,
    href: `#/r/${encodeURIComponent(recipe.id)}/cook?step=${stepIndex}`,
  };
}

export function timerChip(t, info, text) {
  return h("button", {
    class: "timer-chip",
    onClick: (e) => { e.stopPropagation(); startTimer(info, t.seconds); },
    "aria-label": `Start a ${shortDuration(t.seconds)} timer: ${info.label}`,
  }, icon("timer"), text ?? shortDuration(t.seconds));
}

// The ingredients as a checklist (the recipe page and cooking mode's first step share the checks).
export function ingredientChecklist(r, factor, units, onChange = () => {}) {
  const checked = new Set(getView(r.id).checked);
  const groups = [];
  r.ingredients.forEach((ing) => {
    const g = ing.group ?? "";
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, items: [] });
    groups[groups.length - 1].items.push(ing);
  });
  return groups.map((g) => [
    g.name ? h("h3", {}, g.name) : null,
    h("ul", { class: "ingredients" }, g.items.map((ing) => {
      const button = h("button", {
        class: `check ${checked.has(ing.text) ? "done" : ""}`, role: "checkbox", "aria-checked": String(checked.has(ing.text)),
        onClick: () => {
          checked.has(ing.text) ? checked.delete(ing.text) : checked.add(ing.text);
          button.classList.toggle("done", checked.has(ing.text));
          button.setAttribute("aria-checked", String(checked.has(ing.text)));
          setView(r.id, { checked: [...checked] });
          onChange(checked);
        },
      }, h("span", { class: "box" }, icon("check")), h("span", {}, formatIngredient(ing, factor, units)));
      return h("li", {}, button);
    })),
  ]);
}

export async function loadRecipeOr404(root, id) {
  root.append(navbar(backButton(), ""), h("p", { class: "muted pad" }, "Loading…"));
  let r;
  try { r = await getRecipe(id); } catch (e) { r = null; toast(errorMessage(e), "error"); }
  if (r) r = refreshRecipe(r);
  root.replaceChildren();
  if (!r) {
    const why = navigator.onLine === false ? "You're offline, and this recipe hasn't been opened on this device yet." : "Recipe not found.";
    root.append(navbar(backButton(), ""), h("div", { class: "empty" }, h("p", {}, why), h("a", { class: "button", href: "#/" }, "Back to recipes")));
    return null;
  }
  return r;
}


export function cookLogSection(r, onSaved) {
  const log = [...(r.log ?? [])].reverse();
  return h("section", {},
    h("div", { class: "section-head" },
      h("h2", {}, "Cook log"),
      h("button", { class: "button small", onClick: () => openLogSheet(r, onSaved) }, "Log a cook")),
    log.length
      ? h("ul", { class: "log" }, log.map((e) => h("li", { class: "card" },
        h("div", { class: "log-head" },
          h("strong", {}, new Date(e.date + "T12:00").toLocaleDateString(undefined, { dateStyle: "medium" })),
          e.rating ? h("span", { class: "stars", "aria-label": `${e.rating} of 5` }, "★".repeat(e.rating) + "☆".repeat(5 - e.rating)) : null,
          e.scale && e.scale !== 1 ? h("span", { class: "muted small" },
            r.servings ? `${Math.round(r.servings * e.scale * 10) / 10} servings` : `×${Math.round(e.scale * 100) / 100}`) : null),
        e.variables ? h("p", {}, h("span", { class: "label" }, "Variables "), e.variables) : null,
        e.notes ? h("p", {}, e.notes) : null)))
      : h("p", { class: "muted" }, "Track what you changed and how it came out, so the next cook is better."),
  );
}

export function openLogSheet(r, onSaved) {
  if (!requireWrite()) return;
  const last = r.log?.[r.log.length - 1];
  let rating = 0;
  const stars = h("div", { class: "star-input" });
  const drawStars = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
    h("button", { type: "button", class: n <= rating ? "on" : "", "aria-pressed": String(n <= rating), "aria-label": `${n} star${n > 1 ? "s" : ""}`, onClick: () => { rating = rating === n ? 0 : n; drawStars(); } }, "★")));
  drawStars();
  const date = h("input", { type: "date", value: new Date().toLocaleDateString("en-CA"), required: true });
  const variables = h("textarea", { rows: 2, placeholder: last?.variables ? `Last time: ${last.variables}` : "e.g. liquid 540 ml, bottom scorched slightly" });
  const notes = h("textarea", { rows: 3, placeholder: "How did it turn out? What to change next time?" });
  const save = h("button", { class: "button primary", type: "submit" }, "Save");

  const dialog = h("dialog", { class: "sheet" },
    h("form", {
      method: "dialog",
      onSubmit: async (e) => {
        e.preventDefault();
        save.disabled = true; save.textContent = "Saving…";
        const entry = { date: date.value, rating, variables: variables.value.trim(), notes: notes.value.trim(), scale: Math.round(getView(r.id).factor * 1000) / 1000 };
        try {
          const next = await updateRecipe(r.id, `Log cook: ${displayName(r)}`, (cur) => ({ ...cur, log: [...(cur.log ?? []), entry] }));
          dialog.close(); toast("Logged"); onSaved(next);
        } catch (err) {
          toast(errorMessage(err), "error"); save.disabled = false; save.textContent = "Save";
        }
      },
    },
    h("div", { class: "sheet-head" },
      h("button", { type: "button", class: "link", onClick: () => dialog.close() }, "Cancel"),
      h("strong", {}, "Log a cook"), save),
    h("label", {}, "Date", date),
    h("div", { class: "field", role: "group", "aria-label": "Rating" }, h("span", {}, "Rating"), stars),
    h("label", {}, "Variables", variables),
    h("label", {}, "Notes", notes)));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}

export function openTweaksSheet(r, onSaved) {
  if (!requireWrite()) return;
  const text = h("textarea", { rows: 6, value: r.tweaks ?? "", placeholder: "e.g. Use 400 ml water in the Zojirushi. Half the chili for kids." });
  const save = h("button", { class: "button primary", type: "submit" }, "Save");
  const dialog = h("dialog", { class: "sheet" },
    h("form", {
      method: "dialog",
      onSubmit: async (e) => {
        e.preventDefault();
        save.disabled = true; save.textContent = "Saving…";
        const tweaks = text.value.trim();
        try {
          const next = await updateRecipe(r.id, `Tweaks: ${displayName(r)}`, (cur) => {
            const { tweaks: _old, ...rest } = cur;
            return tweaks ? { ...rest, tweaks } : rest;
          });
          dialog.close(); toast("Saved"); onSaved(next);
        } catch (err) {
          toast(errorMessage(err), "error"); save.disabled = false; save.textContent = "Save";
        }
      },
    },
    h("div", { class: "sheet-head" },
      h("button", { type: "button", class: "link", onClick: () => dialog.close() }, "Cancel"),
      h("strong", {}, "My tweaks"), save),
    h("label", {}, "Your changes to this recipe", text)));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  text.focus();
}

export async function shareRecipe(r) {
  const text = recipeToText(r);
  if (navigator.share) {
    try { await navigator.share({ title: displayName(r), text }); } catch { /* cancelled */ }
  } else copyText(text);
}
