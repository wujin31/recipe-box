// The library screen.

import { listRecipes, loadLocal, saveLocal } from "../store.js";
import { displayName, errorMessage, h, icon, iconButton, navbar, normalize, subName } from "../ui.js";

// ---------- library ----------

export const libraryState = { query: "", filter: "all", sort: loadLocal("sort", "recent"), shown: 100 };


export function matches(r, terms) {
  const hay = normalize([r.name, r.englishName, r.nativeName, r.romanized, (r.tags ?? []).join(" "), r.items].join(" "));
  return terms.every((t) => hay.includes(t));
}

export async function viewLibrary(root) {
  const list = h("div", { class: "list" }, h("p", { class: "muted pad" }, "Loading…"));
  const chips = h("div", { class: "chips" });
  const search = h("input", {
    type: "search", placeholder: "Search", value: libraryState.query,
    autocomplete: "off", "aria-label": "Search",
    onInput: (e) => { libraryState.query = e.target.value; libraryState.shown = 100; draw(); },
  });
  const sort = h("select", {
    "aria-label": "Sort",
    onChange: (e) => { libraryState.sort = e.target.value; saveLocal("sort", e.target.value); draw(); },
  }, [["recent", "Newest"], ["cooked", "Last cooked"], ["az", "A–Z"]].map(([v, l]) =>
    h("option", { value: v, selected: v === libraryState.sort }, l)));

  root.append(
    navbar(iconButton("gear", "Settings", () => (location.hash = "#/settings")), "", iconButton("plus", "Add recipe", () => (location.hash = "#/import"), "accent")),
    h("h1", { class: "large-title" }, "Recipes"),
    h("div", { class: "search-row" }, h("label", { class: "search" }, icon("search"), search), sort),
    chips,
    list,
  );

  let recipes = [];
  try {
    recipes = await listRecipes({ fresh: true });
  } catch (e) {
    list.replaceChildren(h("p", { class: "muted pad" }, "Couldn't load recipes. ", errorMessage(e)));
    return;
  }

  function draw() {
    const counts = new Map();
    recipes.forEach((r) => (r.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    const tags = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
    const filters = [["all", "All"], ["fav", "★ Favorites"], ...tags.map((t) => [`tag:${t}`, t])];
    if (!filters.some(([v]) => v === libraryState.filter)) libraryState.filter = "all"; // its tag is gone
    chips.replaceChildren(...filters.map(([v, l]) => h("button", {
      class: `chip ${libraryState.filter === v ? "on" : ""}`, "aria-pressed": String(libraryState.filter === v),
      onClick: () => { libraryState.filter = libraryState.filter === v ? "all" : v; draw(); },
    }, l)));

    const terms = normalize(libraryState.query).split(/\s+/).filter(Boolean);
    let rows = recipes.filter((r) => matches(r, terms));
    if (libraryState.filter === "fav") rows = rows.filter((r) => r.favorite);
    else if (libraryState.filter.startsWith("tag:")) rows = rows.filter((r) => (r.tags ?? []).includes(libraryState.filter.slice(4)));
    const by = {
      recent: (a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      cooked: (a, b) => (b.lastCooked ?? "").localeCompare(a.lastCooked ?? "") || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      az: (a, b) => displayName(a).localeCompare(displayName(b)),
    }[libraryState.sort];
    rows.sort(by);

    if (!recipes.length) {
      list.replaceChildren(h("div", { class: "empty" },
        h("p", {}, "No recipes yet."),
        h("p", { class: "muted" }, "Copy a recipe card in Claude, then tap + to paste it in."),
        h("a", { class: "button primary", href: "#/import" }, "Add your first recipe")));
      return;
    }
    if (!rows.length) {
      list.replaceChildren(h("p", { class: "muted pad" }, "No matches."));
      return;
    }
    list.replaceChildren(
      ...rows.slice(0, libraryState.shown).map((r) => h("a", { class: "row", href: `#/r/${r.id}` },
        h("div", { class: "row-main" },
          h("div", { class: "row-title" }, displayName(r), r.favorite ? h("span", { class: "fav-dot", "aria-label": "Favorite" }, "★") : null),
          subName(r) ? h("div", { class: "row-sub" }, subName(r)) : null,
          h("div", { class: "row-meta" },
            (r.tags ?? []).slice(0, 4).map((t) => h("span", { class: "tag" }, t)),
            r.cookCount ? h("span", { class: "muted" }, `Cooked ${r.cookCount}×`) : null)),
        h("span", { class: "chev", "aria-hidden": "true" }, "›"))),
      rows.length > libraryState.shown
        ? h("button", { class: "button subtle more", onClick: () => { libraryState.shown += 200; draw(); } }, `Show more (${rows.length - libraryState.shown})`)
        : h("p", { class: "muted pad center small" }, `${rows.length} recipe${rows.length === 1 ? "" : "s"}`),
    );
  }
  draw();
}
