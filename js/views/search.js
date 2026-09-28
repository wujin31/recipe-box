// Search: every recipe, grouped by chapter, with matches highlighted.

import { UNSORTED, chapterOf } from "../cookbook.js";
import { getChapters, listRecipes } from "../store.js";
import { displayName, errorMessage, fill, h, icon, normalize } from "../ui.js";
import { groupByChapter } from "./home.js";
import { miniTile, tileMeta } from "./tiles.js";

const state = { query: "", filter: "all" };
const QUICK = 45 * 60;

// Words a cook means more broadly: "pasta" finds penne, "soup" finds sopa and juk.
const PASTA = ["pasta", "spaghetti", "penne", "fettuccine", "linguine", "rigatoni", "macaroni", "orzo", "tagliatelle", "bucatini", "fideo"];
const SYNONYMS = {
  pasta: PASTA,
  noodle: [...PASTA, "ramen", "udon", "soba", "mian", "麵", "面", "국수", "lo mein", "chow mein", "pho"],
  soup: ["soup", "sopa", "stew", "broth", "juk", "congee", "粥", "汤", "湯", "죽", "chowder", "caldo", "pho", "ramen"],
  stew: ["stew", "braise", "guiso", "jjigae", "찌개"],
};

// A term and what it also finds: its singular ("noodles" → "noodle") and its synonyms.
export function expand(term) {
  const single = term.length > 3 ? term.replace(/e?s$/, "") : term;
  const forms = new Set([term, single, term.replace(/s$/, "")]);
  return [...forms, ...[...forms].flatMap((f) => SYNONYMS[f] ?? []).map(normalize)];
}

function haystack(r, chapters) {
  const chapter = [...chapters, UNSORTED].find((c) => c.id === chapterOf(r, chapters));
  return normalize([r.name, r.englishName, r.nativeName, r.romanized, r.cuisine, chapter?.name, (r.equipment ?? []).join(" "), (r.tags ?? []).join(" "), r.items].join(" "));
}

// Wraps each search term found in text in <mark>, ignoring case and accents ("luroufan" marks "Lǔròufàn").
export function highlight(text, terms) {
  if (!terms.length || !text) return text;
  // The folded text, with where each of its characters came from in the original.
  let folded = "";
  const from = [], to = [];
  for (let i = 0; i < text.length;) {
    const ch = String.fromCodePoint(text.codePointAt(i));
    for (const c of normalize(ch)) { folded += c; from.push(i); to.push(i + ch.length); }
    i += ch.length;
  }
  const spans = [];
  for (const t of terms) {
    for (let at = folded.indexOf(t); at >= 0; at = folded.indexOf(t, at + t.length)) spans.push([from[at], to[at + t.length - 1]]);
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
  const missing = terms.filter((t) => !expand(t).some((f) => name.includes(f)));
  if (!missing.length) return null;
  return (r.items ?? "").split(" · ").find((item) => missing.some((t) => expand(t).some((f) => normalize(item).includes(f)))) ?? null;
}

export async function viewSearch(root, query) {
  if (query.get("q") != null) state.query = query.get("q");
  if (query.get("cuisine")) { state.query = ""; state.filter = `c:${query.get("cuisine")}`; }
  const clear = h("button", {
    class: "search-clear", type: "button", "aria-label": "Clear search",
    onClick: () => { input.value = ""; state.query = ""; draw(); input.focus(); },
  }, icon("close"));
  const input = h("input", {
    type: "search", placeholder: "Recipes, ingredients, cuisines", value: state.query, autocomplete: "off",
    "aria-label": "Search", enterkeyhint: "search",
    onInput: (e) => { state.query = e.target.value; draw(); },
  });
  const chips = h("div", { class: "chips" });
  const results = h("div", { class: "results" }, h("p", { class: "muted pad" }, "Loading…"));
  root.append(
    h("h1", { class: "large-title tab-title" }, "Search"),
    h("label", { class: "search" }, icon("search"), input, clear),
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
  const hays = new Map(recipes.map((r) => [r.id, haystack(r, chapters)]));

  function draw() {
    clear.hidden = !state.query;
    // Keep the query in the address, so Back and a reload return to it.
    const hash = state.query ? `#/search?q=${encodeURIComponent(state.query)}` : "#/search";
    if (location.hash !== hash && root.isConnected) history.replaceState(history.state, "", hash);
    fill(chips, ...filters.map(([key, label]) => h("button", {
      class: `chip ${state.filter === key ? "on" : ""}`, "aria-pressed": String(state.filter === key),
      onClick: () => { state.filter = state.filter === key ? "all" : key; draw(); },
    }, label)));
    const terms = normalize(state.query).split(/\s+/).filter(Boolean);
    const test = filters.find(([k]) => k === state.filter)?.[2] ?? (() => true);
    const hits = recipes.filter((r) => test(r) && terms.every((t) => expand(t).some((f) => hays.get(r.id).includes(f))));
    if (!hits.length) {
      fill(results, h("p", { class: "muted pad" }, recipes.length ? "No matches." : "No recipes yet."));
      return;
    }
    const groups = groupByChapter(hits, chapters);
    fill(results, ...[...chapters, UNSORTED].filter((c) => groups.get(c.id).length).map((c) => h("section", {},
      h("div", { class: "group-label" }, h("span", {}, c.name), h("span", {}, groups.get(c.id).length)),
      groups.get(c.id).sort((a, b) => displayName(a).localeCompare(displayName(b))).map((r) => {
        const hit = ingredientHit(r, terms);
        // The romanized name, when that's what matched and it isn't already on show.
        const roman = r.romanized && terms.some((t) => normalize(r.romanized).includes(t)) &&
          !terms.every((t) => normalize(displayName(r)).includes(t)) ? r.romanized : null;
        const sub = [r.nativeName, roman, tileMeta(r)].filter(Boolean);
        return h("a", { class: "result", href: `#/r/${r.id}` },
          miniTile({ ...r, chapter: chapterOf(r, chapters) }, chapters),
          h("span", { class: "result-text" },
            h("strong", {}, highlight(displayName(r), terms)),
            h("span", { class: "muted small" },
              sub.flatMap((s, i) => [i ? " · " : "", highlight(s, terms)]),
              hit ? [" · ", highlight(hit, terms)] : null)));
      }))));
  }
  draw();
  if (!state.query) setTimeout(() => input.focus({ preventScroll: true }), 50);
}
