// The recipe screen.

import { pageSignal } from "../lifecycle.js";
import { recipeToText } from "../parser.js";
import { canWrite, deleteRecipe, safeUrl, updateRecipe } from "../store.js";
import { backButton, copyText, displayName, errorMessage, fill, h, icon, iconButton, navbar, requireWrite, segmented, subName, toast } from "../ui.js";
import { UNITS, formatIngredient } from "../units.js";
import { cookLogSection, getView, loadRecipeOr404, openLogSheet, renderStep, setView, shareRecipe } from "./shared.js";

export async function viewRecipe(root, id, query) {
  let r = await loadRecipeOr404(root, id);
  if (!r || !root.isConnected) return; // navigated away while loading
  let view = getView(id);

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
      if (!requireWrite() || !confirm(`Delete “${displayName(r)}”? Its cook log goes too.`)) return;
      try { await deleteRecipe(id); toast("Deleted"); location.hash = "#/"; } catch (e) { toast(errorMessage(e), "error"); }
    } }, "Delete"),
  );
  const more = iconButton("more", "More", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener("click", () => (menu.hidden = true), { once: false, signal: pageSignal() });

  const body = h("div", { class: "recipe" });
  root.append(navbar(backButton(), "", h("div", { class: "menu-anchor" }, star, more, menu)), body);

  function draw() {
    const { factor, units } = view;
    const checked = new Set(view.checked);
    const isChecked = (ing) => checked.has(ing.text);
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

    const groups = [];
    r.ingredients.forEach((ing, i) => {
      const g = ing.group ?? "";
      if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, items: [] });
      groups[groups.length - 1].items.push([ing, i]);
    });

    fill(body,
      h("h1", { class: "recipe-title" }, displayName(r)),
      subName(r) ? h("p", { class: "recipe-sub" }, subName(r)) : null,
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
        factor !== 1 ? h("button", { class: "link small", onClick: () => setFactor(1) }, "Reset amounts") : null,
      ),

      h("a", { class: "button primary big", href: `#/r/${id}/cook` }, "Get cooking"),

      h("section", {},
        h("div", { class: "section-head" },
          h("h2", {}, "Ingredients"),
          checked.size ? h("button", { class: "link small", onClick: () => { view.checked = []; setView(id, { checked: [] }); draw(); } }, "Clear checks") : null),
        groups.map((g) => [
          g.name ? h("h3", {}, g.name) : null,
          h("ul", { class: "ingredients" }, g.items.map(([ing, i]) => h("li", {},
            h("button", {
              class: `check ${isChecked(ing) ? "done" : ""}`, role: "checkbox", "aria-checked": String(isChecked(ing)),
              onClick: () => {
                isChecked(ing) ? checked.delete(ing.text) : checked.add(ing.text);
                view.checked = [...checked]; setView(id, { checked: view.checked }); draw();
              },
            }, h("span", { class: "box" }, icon("check")), h("span", {}, formatIngredient(ing, factor, units)))))),
        ])),

      h("section", {},
        h("h2", {}, "Steps"),
        h("ol", { class: "steps" }, r.steps.map((s, i) => h("li", {},
          h("span", { class: "num" }, i + 1),
          h("p", {}, renderStep(s, r, factor, units, `${displayName(r)} · step ${i + 1}`)))))),

      r.notes ? h("section", {}, h("h2", {}, "Notes"), h("p", { class: "notes" }, r.notes)) : null,

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
