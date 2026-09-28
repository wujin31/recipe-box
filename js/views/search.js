// Search: every recipe, grouped by chapter, with matches highlighted.

import { UNSORTED, chapterOf } from "../cookbook.js";
import { getChapters, listRecipes } from "../store.js";
import { displayName, errorMessage, fill, h, icon, normalize } from "../ui.js";
import { groupByChapter } from "./home.js";
import { miniTile, tileMeta } from "./tiles.js";

const state = { query: "", filter: "all" };
const QUICK = 45 * 60;

function matches(r, terms) {
  const hay = normalize([r.name, r.englishName, r.nativeName, r.romanized, r.cuisine, (r.equipment ?? []).join(" "), (r.tags ?? []).join(" "), r.items].join(" "));
  return terms.every((t) => hay.includes(t));
}

// Wraps each search term found in text in <mark> (case-insensitive; accents must match).
export function highlight(text, terms) {
  if (!terms.length || !text) return text;
  const lower = text.toLowerCase();
  const spans = [];
  for (const t of terms) {
    for (let at = lower.indexOf(t); at >= 0; at = lower.indexOf(t, at + t.length)) spans.push([at, at + t.length]);
  }
  if (!spans.length) return text;
  spans.sort((a, b) => a[0] - b[0]);
  const out = [];
  let pos = 0;
  for (const [s, e] of spans) {
    if (s < pos) continue;
    out.push(text.slice(pos, s), h("mark", {}, text.slice(s, e)));
    pos = e;
  }
  out.push(text.slice(pos));
  return out;
}

// The ingredient that matched, when the name didn't: "… chicken thighs, sliced".
function ingredientHit(r, terms) {
  const name = normalize([r.name, r.englishName, r.nativeName, r.romanized].join(" "));
  const missing = terms.filter((t) => !name.includes(t));
  if (!missing.length) return null;
  return (r.items ?? "").split(" · ").find((item) => missing.some((t) => normalize(item).includes(t))) ?? null;
}

export async function viewSearch(root, query) {
  if (query.get("q") != null) state.query = query.get("q");
  const input = h("input", {
    type: "search", placeholder: "Recipes, ingredients, cuisines", value: state.query, autocomplete: "off",
    "aria-label": "Search", enterkeyhint: "search",
    onInput: (e) => { state.query = e.target.value; draw(); },
  });
  const chips = h("div", { class: "chips" });
  const results = h("div", { class: "results" }, h("p", { class: "muted pad" }, "Loading…"));
  root.append(
    h("h1", { class: "large-title tab-title" }, "Search"),
    h("label", { class: "search" }, icon("search"), input),
    chips, results);

  let recipes, chapters;
  try {
    [recipes, chapters] = await Promise.all([listRecipes(), getChapters()]);
  } catch (e) {
    fill(results, h("p", { class: "muted pad" }, "Couldn't load recipes. ", errorMessage(e)));
    return;
  }
  if (!root.isConnected) return;

  const count = (key) => recipes.filter(key).length;
  const cuisines = [...new Set(recipes.map((r) => r.cuisine).filter(Boolean))].sort();
  const equipment = [...new Set(recipes.flatMap((r) => r.equipment ?? []))].sort();
  const filters = [
    ["all", "All", () => true],
    ...(count((r) => r.favorite) ? [["fav", "★ Favorites", (r) => r.favorite]] : []),
    ...(count((r) => r.cookSeconds && r.cookSeconds <= QUICK) ? [["quick", "Under 45 min", (r) => r.cookSeconds && r.cookSeconds <= QUICK]] : []),
    ...cuisines.map((c) => [`c:${c}`, c, (r) => r.cuisine === c]),
    ...equipment.map((e) => [`e:${e}`, e, (r) => (r.equipment ?? []).includes(e)]),
  ];
  if (!filters.some(([k]) => k === state.filter)) state.filter = "all";

  function draw() {
    fill(chips, ...filters.map(([key, label]) => h("button", {
      class: `chip ${state.filter === key ? "on" : ""}`, "aria-pressed": String(state.filter === key),
      onClick: () => { state.filter = state.filter === key ? "all" : key; draw(); },
    }, label)));
    const terms = normalize(state.query).split(/\s+/).filter(Boolean);
    const rawTerms = state.query.toLowerCase().split(/\s+/).filter(Boolean);
    const test = filters.find(([k]) => k === state.filter)?.[2] ?? (() => true);
    const hits = recipes.filter((r) => test(r) && matches(r, terms));
    if (!hits.length) {
      fill(results, h("p", { class: "muted pad" }, recipes.length ? "No matches." : "No recipes yet."));
      return;
    }
    const groups = groupByChapter(hits, chapters);
    fill(results, ...[...chapters, UNSORTED].filter((c) => groups.get(c.id).length).map((c) => h("section", {},
      h("div", { class: "group-label" }, h("span", {}, c.name), h("span", {}, groups.get(c.id).length)),
      groups.get(c.id).sort((a, b) => displayName(a).localeCompare(displayName(b))).map((r) => {
        const hit = ingredientHit(r, terms);
        return h("a", { class: "result", href: `#/r/${r.id}` },
          miniTile({ ...r, chapter: chapterOf(r, chapters) }, chapters),
          h("span", { class: "result-text" },
            h("strong", {}, highlight(displayName(r), rawTerms)),
            h("span", { class: "muted small" },
              [r.nativeName, tileMeta(r)].filter(Boolean).join(" · "),
              hit ? [" · ", highlight(hit, rawTerms)] : null)));
      }))));
  }
  draw();
  if (!state.query) setTimeout(() => input.focus({ preventScroll: true }), 50);
}
