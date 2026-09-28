// Sorting: give unsorted recipes a chapter, one at a time. Each tap saves in the background so
// you can keep going; the app's own guess is highlighted.

import { UNSORTED, chapterOf, guessChapter } from "../cookbook.js";
import { refreshRecipe } from "../parser.js";
import { canWrite, getChapters, getRecipe, listRecipes, updateRecipe } from "../store.js";
import { displayName, errorMessage, fill, h, notConnected, toast } from "../ui.js";
import { chapterClass } from "./tiles.js";

const isLatin = (s) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(s);

export async function viewSort(root) {
  const counter = h("span", { class: "muted small" });
  const stage = h("div", { class: "sort-stage" }, h("p", { class: "muted pad" }, "Loading…"));
  root.append(
    h("header", { class: "nav" },
      h("div", { class: "nav-side" }, h("a", { class: "link", href: "#/" }, "Done")),
      h("div", { class: "nav-title" }),
      h("div", { class: "nav-side right" }, counter)),
    h("h1", { class: "large-title" }, "Sort your recipes"),
    stage);

  if (!canWrite()) {
    fill(stage, notConnected("chapters"));
    return;
  }
  let recipes, chapters;
  try {
    [recipes, chapters] = await Promise.all([listRecipes({ fresh: true }), getChapters()]);
  } catch (e) {
    fill(stage, h("p", { class: "muted pad" }, errorMessage(e)));
    return;
  }
  if (!root.isConnected) return;

  const queue = recipes.filter((r) => chapterOf(r, chapters) === UNSORTED.id);
  const total = queue.length;
  let saving = Promise.resolve();
  let sorted = 0;

  async function next() {
    if (!root.isConnected) return;
    const summary = queue.shift();
    if (!summary) {
      counter.textContent = "";
      fill(stage, h("div", { class: "empty" },
        h("p", {}, sorted ? `All sorted. ${sorted} recipe${sorted === 1 ? "" : "s"} now have a chapter.` : "Nothing left to sort."),
        h("a", { class: "button primary", href: "#/" }, "Back to the cookbook")));
      return;
    }
    counter.textContent = `${total - queue.length} of ${total}`;
    let r;
    try { r = refreshRecipe(await getRecipe(summary.id)); } catch { r = { ...summary, ingredients: [], steps: [] }; }
    if (!root.isConnected) return;
    const guess = guessChapter(r, chapters);
    const native = r.nativeName && !isLatin(r.nativeName) ? r.nativeName : "";

    const choose = (chapterId) => {
      sorted++;
      const name = displayName(r);
      saving = saving.then(() => updateRecipe(r.id, `Sort: ${name} → ${chapters.find((c) => c.id === chapterId).name}`, (cur) => ({ ...cur, chapter: chapterId })))
        .catch((e) => { sorted--; toast(`Couldn't save ${name}: ${errorMessage(e)}`, "error"); });
      next();
    };

    fill(stage,
      h("article", { class: "sort-card card" },
        h("div", { class: "eyebrow" }, ["Unsorted", summary.cuisine].filter(Boolean).join(" · ")),
        native ? h("p", { class: "hero-native" }, native) : null,
        h("h2", { class: "sort-title serif" }, displayName(r)),
        r.description ? h("p", { class: "muted sort-desc" }, r.description) : null,
        h("p", { class: "muted small" }, `${r.ingredients?.length ?? 0} ingredients · ${r.steps?.length ?? 0} steps`)),
      h("div", { class: "picker", role: "group", "aria-label": "Chapter" },
        [...chapters].sort((a, b) => (b.id === guess) - (a.id === guess)).map((c) => h("button", {
          class: `pick ${chapterClass(c.id, chapters)} ${c.id === guess ? "guess" : ""}`,
          onClick: () => choose(c.id),
        }, h("span", {}, c.name), c.id === guess ? h("span", { class: "guess-label" }, "Guess") : null)),
        h("button", { class: "pick skip", onClick: next }, "Skip for now")));
  }
  next();
}
