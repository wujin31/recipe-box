// The cookbook's contents: continue cooking, a shelf per chapter, and the chapter list.

import { UNSORTED, chapterOf } from "../cookbook.js";
import { canWrite, getChapters, listRecipes, loadLocal, saveLocal } from "../store.js";
import { getTimers } from "../timers.js";
import { displayName, errorMessage, fill, h, iconButton } from "../ui.js";
import { chapterClass, miniTile, tile } from "./tiles.js";

const SHELF_SIZE = 12;

// Newest and favorite first: what you're likely to want from a shelf.
export const byInterest = (a, b) =>
  Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) ||
  (b.lastCooked ?? b.createdAt ?? "").localeCompare(a.lastCooked ?? a.createdAt ?? "");

// The recipe you were cooking in the last 12 hours, if any.
function inProgress(recipes) {
  let best = null;
  for (const r of recipes) {
    const at = loadLocal(`step:${r.id}`, null);
    if (at?.at && Date.now() - at.at < 12 * 3600e3 && (!best || at.at > best.at.at)) best = { r, at };
  }
  return best;
}

export function groupByChapter(recipes, chapters) {
  const groups = new Map([...chapters, UNSORTED].map((c) => [c.id, []]));
  for (const r of recipes) groups.get(chapterOf(r, chapters)).push(r);
  return groups;
}

export async function viewHome(root) {
  const body = h("div", { class: "home" }, h("p", { class: "muted pad" }, "Loading…"));
  root.append(
    h("header", { class: "nav" }, h("div", { class: "nav-side" }), h("div", { class: "nav-title" }),
      h("div", { class: "nav-side right" }, iconButton("gear", "Settings", () => (location.hash = "#/settings")))),
    h("h1", { class: "large-title" }, "Cookbook"),
    body);

  let recipes, chapters;
  try {
    [recipes, chapters] = await Promise.all([listRecipes({ fresh: true }), getChapters()]);
  } catch (e) {
    fill(body, h("p", { class: "muted pad" }, "Couldn't load recipes. ", errorMessage(e)));
    return;
  }
  if (!root.isConnected) return;

  if (!recipes.length) {
    fill(body, h("div", { class: "empty" },
      h("p", {}, "Your cookbook is empty."),
      h("p", { class: "muted" }, "Copy a recipe card in Claude, then tap + to paste it in."),
      h("a", { class: "button primary", href: "#/import" }, "Add your first recipe")));
    return;
  }

  const groups = groupByChapter(recipes, chapters);
  const used = chapters.filter((c) => groups.get(c.id).length);
  const unsorted = groups.get(UNSORTED.id);
  // The first time the cookbook opens with nothing in a chapter yet (recipes saved before there
  // were chapters), go straight to sorting them. Once only; after that the banner offers it.
  if (unsorted.length === recipes.length && recipes.length > 1 && canWrite() && !loadLocal("sortOffered", false)) {
    saveLocal("sortOffered", true);
    location.replace("#/sort");
    return;
  }
  const cooking = inProgress(recipes);
  const favorites = recipes.filter((r) => r.favorite).sort(byInterest);
  const shelf = (title, list, { href, cls, count = list.length } = {}) => h("section", { class: "shelf-section" },
    h("div", { class: "section-head" },
      h("h2", {}, cls ? h("span", { class: `dot ${cls}`, "aria-hidden": "true" }) : null, title, h("span", { class: "count" }, count)),
      href ? h("a", { class: "see-all", href }, "See all") : null),
    h("div", { class: "shelf", role: "list" }, list.slice(0, SHELF_SIZE).map((r) => tile(r, chapters))));

  fill(body, 
    h("p", { class: "sub" }, `${recipes.length} recipe${recipes.length === 1 ? "" : "s"} · ${used.length} chapter${used.length === 1 ? "" : "s"}`),

    cooking ? h("a", { class: "continue card", href: `#/r/${cooking.r.id}/cook` },
      miniTile(cooking.r, chapters),
      h("span", { class: "continue-text" },
        h("span", { class: "eyebrow" }, "Continue cooking"),
        h("strong", {}, displayName(cooking.r)),
        h("span", { class: "muted small" },
          `Step ${cooking.at.i + 1}${cooking.r.stepCount ? ` of ${cooking.r.stepCount}` : ""}`,
          getTimers().some((t) => !t.done) ? ` · ${getTimers().filter((t) => !t.done).length} timer running` : ""),
        cooking.r.stepCount ? h("span", { class: "progress" }, progressBar((cooking.at.i + 1) / cooking.r.stepCount)) : null)) : null,

    unsorted.length ? h("a", { class: "sort-banner card", href: "#/sort" },
      h("span", {}, h("strong", {}, `${unsorted.length} recipe${unsorted.length === 1 ? "" : "s"} to sort`),
        h("span", { class: "muted small" }, "Give each one a chapter")),
      h("span", { class: "pill" }, "Sort now")) : null,

    favorites.length ? shelf("★ Favorites", favorites) : null,
    used.map((c) => shelf(c.name, groups.get(c.id).sort(byInterest), { href: `#/c/${c.id}`, cls: chapterClass(c.id, chapters) })),
    unsorted.length ? shelf("Unsorted", unsorted.sort(byInterest), { href: `#/c/${UNSORTED.id}`, cls: "pal-unsorted" }) : null,

    h("section", {},
      h("div", { class: "section-head" }, h("h2", {}, "All chapters")),
      h("nav", { class: "toc", "aria-label": "Chapters" },
        [...chapters, ...(unsorted.length ? [UNSORTED] : [])].map((c) => h("a", {
          class: `toc-row ${groups.get(c.id).length ? "" : "empty-chapter"}`, href: `#/c/${c.id}`,
        },
        h("span", { class: `dot ${chapterClass(c.id, chapters)}`, "aria-hidden": "true" }),
        h("span", { class: "toc-name" }, c.name),
        h("span", { class: "toc-count" }, groups.get(c.id).length || "—"))))),
  );
}

// A progress bar whose width is set through the CSSOM (inline style attributes are blocked by CSP).
export function progressBar(fraction) {
  const bar = h("span", { class: "progress-fill" });
  bar.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
  return bar;
}
