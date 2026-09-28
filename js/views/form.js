// Add and edit: the recipe form.

import { EXPORT_PROMPT, parseRecipeInput, recipeToText, slugify } from "../parser.js";
import { canWrite, createRecipe, getChapters, listRecipes, loadLocal, safeUrl, saveLocal, updateRecipe } from "../store.js";
import { chaptersFrom, guessChapter, guessCuisine, guessEquipment } from "../cookbook.js";
import { backButton, copyText, displayName, errorMessage, fill, h, icon, navbar, normalize, notConnected, requireWrite, splitTags, subName, toast } from "../ui.js";
import { loadRecipeOr404, setView } from "./shared.js";
import { chapterClass } from "./tiles.js";

// "Bulgogi 100g, v2" and "Bulgogi 100g" are the same dish: compare names without version marks.
const baseName = (s) => normalize(s ?? "").replace(/[,(\s-]*\bv(?:ersion)?\s*\d+\)?\s*$/i, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// An existing recipe this paste looks like a new version of.
export function findExisting(parsed, recipes) {
  const slug = slugify(parsed).replace(/-v\d+$/, "");
  const name = baseName(displayName(parsed));
  return recipes.find((r) => r.id === slug || r.id.replace(/-v\d+$/, "") === slug || (name && baseName(r.englishName || r.name) === name)) ?? null;
}

export function recipeForm({ title, text = "", draftKey = null, editing = false, servings = "", tags = "", chatUrl = "", chapter = null, recipeId = null, submitLabel, onSubmit }) {
  const source = h("textarea", {
    class: "source", rows: 10, value: text, spellcheck: false,
    placeholder: "Paste a Claude recipe card here.\n\nIn Claude: tap the recipe card's copy button (or select all and copy), then come back and tap Paste.",
  });
  // Copying a card drops its timer chips; the export prompt gets Claude to send them as JSON.
  const exportHelp = editing ? null : h("details", { class: "card helper" },
    h("summary", {}, "Keep the card's timers"),
    h("p", { class: "small" }, "Copying a card leaves out its timer buttons. To keep them, send this prompt to Claude in the same chat as the recipe, then copy Claude's whole reply and paste it here."),
    h("button", { type: "button", class: "button small", onClick: () => copyText(EXPORT_PROMPT, "Prompt copied. Send it to Claude.") }, "Copy prompt for Claude"));
  const preview = h("div", { class: "preview" });
  let servingsTouched = Boolean(servings);
  const servingsIn = h("input", { type: "number", inputmode: "decimal", min: "0", step: "any", value: servings, placeholder: "e.g. 4", onInput: () => { servingsTouched = true; } });
  const tagsIn = h("input", { type: "text", value: tags, placeholder: "e.g. weeknight, meal prep", autocapitalize: "off" });
  const chatIn = h("input", { type: "url", value: chatUrl, placeholder: "https://claude.ai/chat/…", autocapitalize: "off" });
  const submit = h("button", { class: "button primary big", type: "submit" }, submitLabel);
  let parsed = null;

  // Chapter: one per recipe. The guess is picked until you choose.
  let chapters = chaptersFrom(null);
  let recipes = [];
  let chosen = chapter;
  let guess = null;
  const picker = h("div", { class: "picker", role: "radiogroup", "aria-label": "Chapter" });
  const current = () => chosen ?? guess;
  const drawPicker = () => fill(picker, chapters.map((c) => h("button", {
    type: "button", role: "radio", "aria-checked": String(c.id === current()),
    class: `pick ${chapterClass(c.id, chapters)} ${c.id === current() ? "on" : ""}`,
    onClick: () => { chosen = c.id; drawPicker(); drawSubmit(); },
  }, h("span", {}, c.name), !chosen && c.id === guess ? h("span", { class: "guess-label" }, "Guess") : null)));

  // Re-importing: offer to update the recipe you already have instead of adding a copy.
  let existing = null;
  let mode = "update";
  const existingBox = h("div", { class: "existing" });
  const drawExisting = () => fill(existingBox, existing ? h("fieldset", { class: "card choice" },
    h("legend", {}, `You already have “${displayName(existing)}”`),
    [["update", "Update it", "Keeps your cook log, favorite and tweaks"], ["new", "Save as a new recipe", "Keep both"]].map(([value, label, help]) =>
      h("label", { class: "radio" },
        h("input", { type: "radio", name: "mode", value, checked: mode === value, onChange: () => { mode = value; drawSubmit(); } }),
        h("span", {}, h("strong", {}, label), h("span", { class: "muted small" }, help))))) : null);

  const drawSubmit = () => {
    if (editing || submit.disabled) return;
    const c = chapters.find((x) => x.id === current());
    submit.textContent = mode === "update" && existing ? `Update “${displayName(existing)}”` : c ? `Save to ${c.name}` : submitLabel;
  };

  function update() {
    if (draftKey) saveLocal(draftKey, source.value);
    parsed = null;
    if (!source.value.trim()) {
      preview.replaceChildren(); submit.disabled = true; existing = null;
      drawPicker(); drawExisting(); submit.textContent = submitLabel;
      return;
    }
    try {
      parsed = parseRecipeInput(source.value);
      if (parsed.servings && !servingsTouched) servingsIn.value = parsed.servings;
      guess = guessChapter(parsed, chapters);
      existing = editing ? null : findExisting(parsed, recipes);
      const timers = parsed.steps.reduce((n, s) => n + s.timers.length, 0);
      const fromJson = /^\s*(```|[[{])/.test(source.value);
      const noQty = parsed.ingredients.filter((i) => i.qty == null).length;
      const us = parsed.ingredients.filter((i) => ["oz", "lb", "cup", "tbsp", "tsp", "fl oz"].includes(i.unit)).length;
      const metric = parsed.ingredients.filter((i) => ["g", "kg", "ml", "l"].includes(i.unit)).length;
      const facets = [guessCuisine(parsed), ...guessEquipment(parsed)].filter(Boolean);
      fill(preview, h("div", { class: "card ok" },
        h("strong", {}, displayName(parsed)),
        subName(parsed) ? h("div", { class: "muted" }, subName(parsed)) : null,
        facets.length ? h("div", { class: "small muted" }, facets.join(" · ")) : null,
        h("div", { class: "small" }, `${parsed.ingredients.length} ingredients · ${parsed.steps.length} steps · ${timers} timer${timers === 1 ? "" : "s"}`),
        noQty ? h("div", { class: "small muted" }, `${noQty} ingredient${noQty === 1 ? "" : "s"} without an amount (won't scale)`) : null,
        us > metric ? h("div", { class: "small hint" }, "Tip: switch the card to Metric in Claude before copying. Grams are exact; the ounce conversions are rounded.") : null,
        exportHelp && !fromJson && timers < parsed.steps.length / 3
          ? h("div", { class: "small hint" }, "Few or no timers found in the text. If the card showed timers, use “Keep the card's timers” above.")
          : null));
      submit.disabled = false;
    } catch (e) {
      preview.replaceChildren(h("div", { class: "card warn small" }, e.message));
      submit.disabled = true;
      existing = null;
    }
    drawPicker(); drawExisting(); drawSubmit();
  }
  let pending = null;
  source.addEventListener("input", () => { clearTimeout(pending); pending = setTimeout(update, 150); });

  Promise.all([getChapters(), editing ? [] : listRecipes()]).then(([c, r]) => {
    chapters = c;
    recipes = r.filter((x) => x.id !== recipeId);
    update();
  }).catch(() => {});

  const paste = h("button", { type: "button", class: "button", onClick: async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) { toast("The clipboard is empty"); return; }
      source.value = t; update();
    } catch { toast("Couldn't read the clipboard. Long-press the box and choose Paste.", "error"); source.focus(); }
  } }, icon("paste"), "Paste");

  const form = h("form", {
    class: "form",
    onSubmit: async (e) => {
      e.preventDefault();
      clearTimeout(pending);
      update(); // the preview may be a keystroke behind
      if (!parsed || !requireWrite()) return;
      if (chatIn.value.trim() && !safeUrl(chatIn.value.trim())) { toast("The chat link must start with https://", "error"); return; }
      submit.disabled = true; const label = submit.textContent; submit.textContent = "Saving…";
      try {
        await onSubmit(parsed, source.value, {
          servings: servingsIn.value ? Number(servingsIn.value) : null,
          tags: splitTags(tagsIn.value),
          chatUrl: safeUrl(chatIn.value.trim()),
          chapter: current() ?? undefined,
        }, mode === "update" && existing ? existing : null);
      } catch (err) {
        toast(errorMessage(err), "error");
        submit.disabled = false; submit.textContent = label;
      }
    },
  },
  h("div", { class: "section-head" }, h("h1", { class: "large-title flush" }, title), paste),
  exportHelp,
  source,
  editing ? h("p", { class: "help small muted" }, "To add a timer to a step, end it with ⏱ 10 min or [timer 10 min].") : null,
  preview,
  existingBox,
  h("div", { class: "field" }, h("span", { class: "field-label" }, "Chapter"), picker),
  h("label", {}, "Servings", servingsIn, h("span", { class: "help" }, "Copied card text doesn't include servings; set it so the amounts scale by servings.")),
  h("label", {}, "Tags (optional)", tagsIn, h("span", { class: "help" }, "Cuisine and equipment are added for you.")),
  h("label", {}, "Claude chat link (optional)", chatIn),
  canWrite() ? null : notConnected("this"),
  submit);
  update();
  return form;
}

export function viewImport(root, query) {
  root.append(
    navbar(backButton(), ""),
    recipeForm({
      title: "Add recipe",
      // Keep what was pasted if you leave to fix Settings and come back.
      text: query.get("text") ?? loadLocal("draft:import", ""),
      draftKey: "draft:import",
      submitLabel: "Save recipe",
      onSubmit: async (parsed, text, extra, existing) => {
        let saved;
        if (existing) {
          // An updated card: new text, same recipe. Log, favorite, tweaks and tags stay.
          saved = await updateRecipe(existing.id, `Update recipe: ${displayName(parsed)}`, (cur) => ({
            ...cur, ...parsed,
            servings: extra.servings ?? cur.servings ?? null,
            tags: extra.tags.length ? extra.tags : cur.tags ?? [],
            chatUrl: extra.chatUrl ?? cur.chatUrl ?? null,
            chapter: extra.chapter ?? cur.chapter,
          }), { source: text });
          setView(existing.id, { factor: 1, checked: [] });
        } else {
          saved = await createRecipe(parsed, text, extra);
        }
        saveLocal("draft:import", "");
        toast(existing ? "Updated" : "Saved");
        location.replace(`#/r/${saved.id}`);
      },
    }));
}

export async function viewEdit(root, id) {
  const r = await loadRecipeOr404(root, id);
  if (!r || !root.isConnected) return; // navigated away while loading
  root.append(
    navbar(backButton(`#/r/${id}`), ""),
    recipeForm({
      title: "Edit recipe",
      text: recipeToText(r, { servings: false }),
      editing: true,
      servings: r.servings ?? "",
      tags: (r.tags ?? []).join(", "),
      chatUrl: r.chatUrl ?? "",
      chapter: r.chapter ?? null,
      recipeId: id,
      submitLabel: "Save changes",
      onSubmit: async (parsed, _text, extra) => {
        await updateRecipe(id, `Edit recipe: ${displayName(parsed)}`, (cur) => ({ ...cur, ...parsed, ...extra }));
        if ((extra.servings ?? null) !== (r.servings ?? null)) setView(id, { factor: 1 }); // new base amount
        toast("Saved");
        location.replace(`#/r/${id}`);
      },
    }));
}
