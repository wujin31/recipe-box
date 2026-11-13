// The recipe page's header: where the recipe sits in the cookbook, its names, and quick facts.

import { UNSORTED, chapterOf, formatTime, guessCuisine, guessEquipment, recipeTime, timerCount } from "../cookbook.js";
import { displayName, h, nativeOf } from "../ui.js";
import { WIDE, chapterBand } from "./tiles.js";

export function recipeHero(r, chapters) {
  const chapterId = chapterOf(r, chapters);
  const chapter = chapters.find((c) => c.id === chapterId) ?? UNSORTED;
  const cuisine = guessCuisine(r);
  const equipment = guessEquipment(r);
  const native = nativeOf(r);
  const time = formatTime(recipeTime(r));
  const timers = timerCount(r);
  const cooked = r.log?.length ?? 0;
  const facts = [
    r.servings ? `${r.servings} serving${r.servings === 1 ? "" : "s"}` : null,
    time || null,
    timers ? `${timers} timer${timers === 1 ? "" : "s"}` : null,
    cooked ? `Cooked ${cooked}×` : null,
  ].filter(Boolean);
  const sep = () => h("span", { class: "sep", "aria-hidden": "true" }, "·");
  // The romanization, unless the English name already contains it ("Lǔròufàn Oven Braise").
  const romanized = r.romanized && !displayName(r).toLowerCase().includes(r.romanized.toLowerCase()) ? r.romanized : null;

  // A band in the chapter's color, with the dish's first character (or the chapter's) cropped huge
  // behind it. The character and the vertical chapter name are decoration, hidden from screen readers.
  const band = chapterBand(chapterId, chapters);
  const mark = [...native].find((c) => WIDE.test(c)) ?? band.hanzi;
  return h("header", { class: `hero band band-${band.tone}` },
    h("span", { class: "band-hanzi", "aria-hidden": "true" }, mark),
    h("div", { class: "band-inner" },
      band.tc ? h("span", { class: "band-v", lang: "zh-Hant-TW", "aria-hidden": "true" }, band.tc) : h("span"),
      h("div", {},
        h("div", { class: "eyebrow hero-eyebrow" },
          h("a", { href: `#/c/${chapter.id}` }, chapter.name),
          cuisine ? [sep(), h("a", { href: `#/search?cuisine=${encodeURIComponent(cuisine)}` }, cuisine)] : null,
          equipment.map((e) => [sep(), h("span", {}, e)])),
        native ? h("p", { class: "hero-native" }, native) : null,
        h("h1", { class: "recipe-title" }, displayName(r)),
        romanized || r.subtitle ? h("p", { class: "recipe-sub" }, [romanized, r.subtitle].filter(Boolean).join(" · ")) : null,
        facts.length ? h("div", { class: "facts" }, facts.map((f) => h("span", { class: "fact" }, f))) : null)));
}
