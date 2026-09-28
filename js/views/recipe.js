// The recipe screen.

import { pageSignal } from "../lifecycle.js";
import { recipeToText } from "../parser.js";
import { canWrite, deleteRecipe, getChapters, restoreRecipe, safeUrl, updateRecipe } from "../store.js";
import { chaptersFrom } from "../cookbook.js";
import { backButton, copyText, displayName, errorMessage, fill, h, icon, iconButton, navbar, requireWrite, segmented, subName, toast } from "../ui.js";
import { UNITS } from "../units.js";
import { recipeHero } from "./hero.js";
import { cookLogSection, getView, ingredientChecklist, loadRecipeOr404, openLogSheet, openTweaksSheet, renderStep, setView, shareRecipe } from "./shared.js";
import { openScaleSheet } from "./scale.js";
import { openToolDrawer } from "./tools.js";

export async function viewRecipe(root, id, query) {
  let r = await loadRecipeOr404(root, id);
  if (!r || !root.isConnected) return; // navigated away while loading
  let view = getView(id);
  const chapters = await getChapters().catch(() => chaptersFrom(null));
  if (!root.isConnected) return;

  // Taps flip the wish right away; saves run one at a time and always save the latest wish.
  let wantFavorite = Boolean(r.favorite);
  let saving = Promise.resolve();
  const star = iconButton("star", "Favorite", () => {
    if (!requireWrite()) return;
    wantFavorite = !wantFavorite;
    star.classList.toggle("on", wantFavorite);
    star.setAttribute("aria-pressed", String(wantFavorite));
    saving = saving.then(async () => {
      const favorite = wantFavorite;
      if (Boolean(r.favorite) === favorite) return;
      try { r = await updateRecipe(id, `${favorite ? "Favorite" : "Unfavorite"}: ${displayName(r)}`, (cur) => ({ ...cur, favorite })); }
      catch (e) { wantFavorite = Boolean(r.favorite); star.classList.toggle("on", wantFavorite); toast(errorMessage(e), "error"); }
    });
  }, r.favorite ? "star on" : "star");
  star.setAttribute("aria-pressed", String(wantFavorite));

  const menu = h("div", { class: "menu", hidden: true },
    h("button", { onClick: () => shareRecipe(r) }, "Share…"),
    h("button", { onClick: () => copyText(recipeToText(r)) }, "Copy as text"),
    h("a", { href: `#/r/${id}/edit` }, "Edit"),
    safeUrl(r.chatUrl) ? h("a", { href: safeUrl(r.chatUrl), target: "_blank", rel: "noopener noreferrer" }, "Open Claude chat") : null,
    h("button", { class: "danger", onClick: async () => {
      // No "are you sure?": the toast offers Undo instead.
      if (!requireWrite()) return;
      try {
        const deleted = await deleteRecipe(id);
        location.hash = "#/";
        toast(`Deleted “${displayName(r)}”`, "", { label: "Undo", onClick: async () => {
          try { await restoreRecipe(deleted); toast("Restored"); location.hash = `#/r/${id}`; } catch (e) { toast(errorMessage(e), "error"); }
        } });
      } catch (e) { toast(errorMessage(e), "error"); }
    } }, "Delete"),
  );
  const more = iconButton("more", "More", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener("click", () => (menu.hidden = true), { once: false, signal: pageSignal() });

  const body = h("div", { class: "recipe" });
  const tools = iconButton("tools", "Kitchen tools", () => openToolDrawer(r));
  root.append(navbar(backButton(), "", h("div", { class: "menu-anchor" }, tools, star, more, menu)), body);

  function draw() {
    const { factor, units } = view;
    const checked = new Set(view.checked);
    const servingsNow = r.servings ? Math.round(r.servings * factor * 10) / 10 : null;
    const stepFactor = (dir) => {
      if (r.servings) {
        const next = Math.max(1, Math.round(servingsNow) + dir);
        return next / r.servings;
      }
      const steps = [0.25, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10];
      const i = steps.findIndex((s) => s >= factor - 1e-9);
      return steps[Math.min(steps.length - 1, Math.max(0, (i < 0 ? steps.length - 1 : i) + dir))];
    };
    const setFactor = (f) => { view = { ...view, factor: f }; setView(id, { factor: f }); draw(); };
    const hasConvertible = r.ingredients.some((i) => i.unit && UNITS[i.unit]);
    const scalable = r.ingredients.some((i) => i.qty != null);

    fill(body,
      recipeHero(r, chapters),
      r.description ? h("p", { class: "description" }, r.description) : null,
      r.tags?.length ? h("div", { class: "row-meta" }, r.tags.map((t) => h("a", { class: "tag", href: `#/search?q=${encodeURIComponent(t)}` }, t))) : null,

      h("div", { class: "controls card" },
        h("div", { class: "stepper" },
          h("button", { "aria-label": r.servings ? "Fewer servings" : "Smaller batch", onClick: () => setFactor(stepFactor(-1)) }, "−"),
          h("div", { class: "stepper-value" },
            r.servings ? h("strong", {}, servingsNow) : h("strong", {}, `×${+factor.toFixed(2)}`),
            h("span", {}, r.servings ? (servingsNow === 1 ? "serving" : "servings") : "batch")),
          h("button", { "aria-label": r.servings ? "More servings" : "Bigger batch", onClick: () => setFactor(stepFactor(1)) }, "+")),
        hasConvertible ? segmented([["original", "Original"], ["us", "US"], ["metric", "Metric"]], units, (u) => {
          view = { ...view, units: u }; setView(id, { units: u }); draw();
        }) : null,
        h("div", { class: "controls-links" },
          scalable ? h("button", { class: "link small", onClick: () => openScaleSheet(r, setFactor) }, "Scale to what I have") : null,
          factor !== 1 ? h("button", { class: "link small", onClick: () => setFactor(1) }, "Reset amounts") : null),
      ),

      h("a", { class: "button primary big", href: `#/r/${id}/cook` }, "Get cooking"),

      h("section", {},
        h("div", { class: "section-head" },
          h("h2", {}, "Ingredients"),
          checked.size ? h("button", { class: "link small", onClick: () => { view.checked = []; setView(id, { checked: [] }); draw(); } }, "Clear checks") : null),
        ingredientChecklist(r, factor, units, (now) => {
          const had = view.checked.length;
          view.checked = [...now];
          if (!had !== !now.size) draw(); // show or hide "Clear checks"
        })),

      h("section", {},
        h("h2", {}, "Steps"),
        h("ol", { class: "steps" }, r.steps.map((s, i) => h("li", {},
          h("span", { class: "num" }, i + 1),
          h("p", {}, renderStep(r, i, factor, units)))))),

      r.notes ? h("section", {}, h("h2", {}, "Notes"), h("p", { class: "notes" }, r.notes)) : null,

      // Your own changes, kept apart from Claude's notes so re-importing the card never touches them.
      h("section", { class: "tweaks" },
        h("div", { class: "section-head" },
          h("h2", {}, "My tweaks"),
          h("button", { class: "button small", onClick: () => openTweaksSheet(r, (next) => { r = next; draw(); }) }, r.tweaks ? "Edit" : "Add")),
        r.tweaks ? h("p", { class: "notes card" }, r.tweaks) : h("p", { class: "muted small" }, "Your changes to this recipe, like “use 400 ml water”. Re-importing the card keeps them.")),

      cookLogSection(r, (next) => { r = next; draw(); }),

      h("p", { class: "muted small center pad" },
        r.createdAt && !isNaN(new Date(r.createdAt)) ? `Added ${new Date(r.createdAt).toLocaleDateString()}` : null,
        safeUrl(r.chatUrl) ? [" · ", h("a", { href: safeUrl(r.chatUrl), target: "_blank", rel: "noopener noreferrer" }, "Claude chat")] : null),
    );
  }
  draw();
  if (query.get("log") === "1" && canWrite()) {
    history.replaceState(null, "", `#/r/${id}`);
    openLogSheet(r, (next) => { r = next; draw(); });
  }
}
