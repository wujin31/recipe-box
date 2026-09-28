// Recipe tiles and chapter colors, shared by home, chapter pages and search.

import { UNSORTED, formatTotal } from "../cookbook.js";
import { h, displayName } from "../ui.js";

// Chapters are colored by position (7 palettes, then they repeat); Unsorted is neutral.
export function chapterClass(id, chapters) {
  if (id === UNSORTED.id) return "pal-unsorted";
  const i = chapters.findIndex((c) => c.id === id);
  return `pal-${(i < 0 ? 0 : i) % 7}`;
}

const isLatin = (s) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(s);

// The big title shrinks with length so it always fits.
function bigSize(text, latin) {
  const n = [...text].length;
  if (latin) return n <= 12 ? 1.35 : n <= 24 ? 1.18 : n <= 36 ? 1 : 0.9;
  return n <= 3 ? 2 : n <= 5 ? 1.65 : n <= 8 ? 1.35 : 1.12;
}

export const recipeTime = (r) => formatTotal(r.cookSeconds ?? 0);

export function tileMeta(r) {
  return [r.cuisine, recipeTime(r)].filter(Boolean).join(" · ");
}

// A tile: the dish's own-script name large (or its English name when it has none).
export function tile(r, chapters, { chapter = r.chapter } = {}) {
  const native = r.nativeName && !isLatin(r.nativeName) ? r.nativeName : "";
  const big = native || displayName(r);
  const latin = !native;
  return h("a", { class: `tile ${chapterClass(chapter, chapters)}`, href: `#/r/${r.id}`, "aria-label": displayName(r) },
    r.favorite ? h("span", { class: "tile-fav", "aria-label": "Favorite" }, "★") : null,
    h("span", { class: `tile-big ${latin ? "latin" : "native"}`, "data-size": bigSize(big, latin) }, big),
    h("span", { class: "tile-foot" },
      native ? h("span", { class: "tile-en" }, displayName(r)) : null,
      tileMeta(r) ? h("span", { class: "tile-meta" }, tileMeta(r)) : null));
}

// CSP forbids inline style attributes, so sizes are applied through the CSSOM.
export function sizeTiles(root) {
  root.querySelectorAll(".tile-big[data-size]").forEach((el) => { el.style.fontSize = `${el.dataset.size}rem`; });
}

// A small square used in lists (search results, continue cooking).
export function miniTile(r, chapters) {
  const native = r.nativeName && !isLatin(r.nativeName) ? r.nativeName : "";
  const text = [...(native || displayName(r))].slice(0, native ? 2 : 1).join("");
  return h("span", { class: `mini ${chapterClass(r.chapter, chapters)}`, "aria-hidden": "true" }, text);
}
