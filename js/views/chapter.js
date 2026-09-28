// A chapter: every recipe in it as a grid of tiles, with quick filters.

import { UNSORTED, chapterOf } from "../cookbook.js";
import { getChapters, listRecipes } from "../store.js";
import { backButton, displayName, errorMessage, fill, h, navbar } from "../ui.js";
import { tile } from "./tiles.js";

const QUICK = 45 * 60;

export async function viewChapter(root, id) {
  const grid = h("div", { class: "grid" });
  const chips = h("div", { class: "chips" });
  const head = h("div", { class: "chapter-head" });
  root.append(navbar(backButton("#/"), ""), head, chips, grid);

  let recipes, chapters;
  try {
    [recipes, chapters] = await Promise.all([listRecipes(), getChapters()]);
  } catch (e) {
    fill(grid, h("p", { class: "muted pad" }, "Couldn't load recipes. ", errorMessage(e)));
    return;
  }
  if (!root.isConnected) return;

  const index = chapters.findIndex((c) => c.id === id);
  const chapter = id === UNSORTED.id ? UNSORTED : chapters[index];
  if (!chapter) {
    fill(head, h("div", { class: "empty" }, h("p", {}, "No such chapter."), h("a", { class: "button", href: "#/" }, "Back to the cookbook")));
    return;
  }
  const mine = recipes.filter((r) => chapterOf(r, chapters) === id).sort((a, b) => displayName(a).localeCompare(displayName(b)));
  fill(head, 
    h("div", { class: "eyebrow" }, id === UNSORTED.id ? "Not in a chapter yet" : `Chapter ${index + 1}`),
    h("h1", { class: "large-title serif" }, chapter.name),
    id === UNSORTED.id && mine.length ? h("a", { class: "button primary", href: "#/sort" }, "Sort these") : null);

  // Filters: cuisines present in this chapter, favorites, quick.
  const cuisines = [...new Set(mine.map((r) => r.cuisine).filter(Boolean))].sort();
  const filters = [
    ["all", `All ${mine.length}`, () => true],
    ...(mine.some((r) => r.favorite) ? [["fav", "★ Favorites", (r) => r.favorite]] : []),
    ...(mine.some((r) => r.cookSeconds && r.cookSeconds <= QUICK) ? [["quick", "Under 45 min", (r) => r.cookSeconds && r.cookSeconds <= QUICK]] : []),
    ...(cuisines.length > 1 ? cuisines.map((c) => [`c:${c}`, c, (r) => r.cuisine === c]) : []),
  ];
  let on = "all";
  function draw() {
    fill(chips, ...(filters.length > 1 ? filters : []).map(([key, label]) => h("button", {
      class: `chip ${on === key ? "on" : ""}`, "aria-pressed": String(on === key),
      onClick: () => { on = on === key ? "all" : key; draw(); },
    }, label)));
    const test = filters.find(([key]) => key === on)?.[2] ?? (() => true);
    const list = mine.filter(test);
    fill(grid, ...(list.length ? list.map((r) => tile(r, chapters)) : [h("p", { class: "muted pad" }, mine.length ? "Nothing matches that filter." : "No recipes in this chapter yet.")]));
  }
  draw();
}
