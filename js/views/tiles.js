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

const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー]/u;
const ems = (s) => [...s].reduce((n, c) => n + (WIDE.test(c) ? 1 : c === " " ? 0.3 : 0.64), 0); // bold serif Latin runs wide

// Lines the words take when a line holds `room` ems, breaking only between words.
function lineCount(words, room) {
  let lines = 1, used = 0;
  for (const w of words) {
    const width = ems(w);
    if (used && used + 0.3 + width <= room) used += 0.3 + width;
    else if (used) { lines++; used = width; } else used = width;
  }
  return lines;
}

// The big title's size as a share of the tile's width (tiles are all 7:9, so height follows):
// every word on one line (a long unspaced CJK name splits in two), all lines within the space
// above the tile's footer.
export function bigSize(text) {
  const words = text.split(/\s+/).filter(Boolean).flatMap((w) => {
    const chars = [...w];
    if (!WIDE.test(w) || chars.length <= 6) return [w];
    const half = Math.ceil(chars.length / 2);
    return [chars.slice(0, half).join(""), chars.slice(half).join("")];
  });
  const TEXT = 0.88, HEIGHT = 0.8; // the title's width and height, as shares of the tile's inner width
  let share = TEXT / Math.max(1, ...words.map(ems));
  const fits = (lines) => lines <= 4 && lines * 1.1 * share <= HEIGHT; // 4: the CSS line clamp
  while (!fits(lineCount(words, TEXT / share))) share *= 0.95;
  return +(share * 100).toFixed(1);
}

// "1h 45m": short enough that "Taiwanese · 3h 4m" fits a tile.
export function shortTime(seconds) {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60} hr`;
}

export const recipeTime = (r) => formatTotal(r.cookSeconds ?? 0);

export function tileMeta(r, { short = false } = {}) {
  return [r.cuisine, short ? shortTime(r.cookSeconds ?? 0) : recipeTime(r)].filter(Boolean).join(" · ");
}

// A tile's English title: the part before the first comma ("Ribeye with Garlic Butter Pan Sauce").
export const tileName = (r) => displayName(r).split(/,\s/)[0];

// A tile: the dish's own-script name large (or its English name when it has none).
export function tile(r, chapters, { chapter = r.chapter } = {}) {
  const native = r.nativeName && !isLatin(r.nativeName) ? r.nativeName : "";
  const big = native || tileName(r);
  const title = h("span", { class: `tile-big ${native ? "native" : "latin"}` }, big);
  // CSSOM: inline style attributes are blocked by CSP. cqi is % of the tile's inner width.
  title.style.fontSize = `min(${native ? 2 : 1.35}rem, ${bigSize(big)}cqi)`;
  return h("a", { class: `tile ${chapterClass(chapter, chapters)}`, href: `#/r/${r.id}`, "aria-label": displayName(r) },
    r.favorite ? h("span", { class: "tile-fav", "aria-label": "Favorite" }, "★") : null,
    title,
    h("span", { class: "tile-foot" },
      native ? h("span", { class: "tile-en" }, tileName(r)) : null,
      tileMeta(r) ? h("span", { class: "tile-meta" }, tileMeta(r, { short: true })) : null));
}

// A small square used in lists (search results, continue cooking): the name's first character.
export function miniTile(r, chapters) {
  const native = r.nativeName && !isLatin(r.nativeName) ? r.nativeName : "";
  const text = [...(native || displayName(r))][0] ?? "";
  return h("span", { class: `mini ${chapterClass(r.chapter, chapters)}`, "aria-hidden": "true" }, text);
}
