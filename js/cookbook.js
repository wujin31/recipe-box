// The cookbook's structure: chapters (one per recipe) and details derived from a recipe's text
// (cuisine, equipment, total time) so they never have to be tagged by hand.

export const DEFAULT_CHAPTERS = [
  { id: "breakfast", name: "Breakfast & Brunch" },
  { id: "mains", name: "Mains" },
  { id: "soups", name: "Soups & Stews" },
  { id: "rice", name: "Rice & Noodles" },
  { id: "salads", name: "Salads & Sides" },
  { id: "desserts", name: "Desserts & Baking" },
  { id: "sauces", name: "Sauces & Basics" },
];
export const UNSORTED = { id: "unsorted", name: "Unsorted" };

// recipes/cookbook.json can rename, reorder or add chapters; unknown ids fall back to Unsorted.
export function chaptersFrom(cookbook) {
  const list = Array.isArray(cookbook?.chapters) && cookbook.chapters.length ? cookbook.chapters : DEFAULT_CHAPTERS;
  return list.filter((c) => c && typeof c.id === "string" && typeof c.name === "string" && c.id !== UNSORTED.id);
}

export const chapterOf = (r, chapters) => (chapters.some((c) => c.id === r.chapter) ? r.chapter : UNSORTED.id);

// ---------- guessing a chapter ----------

// Words that point at a chapter. Title words count triple.
const CHAPTER_WORDS = {
  breakfast: ["breakfast", "brunch", "pancake", "waffle", "omelet", "omelette", "frittata", "shakshuka", "granola",
    "oatmeal", "porridge", "congee", "juk", "jook", "dan bing", "danbing", "egg crepe", "french toast", "hash", "benedict",
    "egg", "bagel", "cinnamon roll"],
  soups: ["soup", "stew", "jjigae", "jjim", "guk", "tang", "sopa", "pho", "phở", "broth", "chili", "chowder", "bisque",
    "gumbo", "pozole", "caldo", "ramen", "hot pot", "hotpot", "nabe", "curry soup"],
  rice: ["rice", "fried rice", "chaofan", "chao fan", "fan", "luroufan", "lurou", "zao fan", "raisu", "bap", "bibimbap", "don", "donburi", "biryani", "risotto",
    "paella", "noodle", "noodles", "mian", "mein", "udon", "soba", "pasta", "penne", "fettuccine", "spaghetti",
    "linguine", "rigatoni", "orzo", "gnocchi", "lasagna", "mac and cheese", "pad thai", "japchae", "fideo", "bolognese", "carbonara", "alfredo", "aglio e olio"],
  salads: ["salad", "slaw", "cucumber", "pickle", "banchan", "garlic bread", "side", "roasted vegetables",
    "potatoes", "fries", "greens", "namul", "coleslaw", "beans"],
  desserts: ["dessert", "cake", "cookie", "cookies", "brownie", "pie", "tart", "pudding", "ice cream", "bars", "muffin",
    "scone", "bread", "loaf", "sourdough", "cheesecake", "custard", "mochi", "cobbler", "crumble", "donut", "doughnut",
    "roll", "glaze", "frosting"],
  sauces: ["sauce", "dressing", "marinade", "paste", "stock", "vinaigrette", "salsa", "chutney", "jam", "spice mix",
    "seasoning", "oil", "dip", "gravy", "aioli", "sushi rice", "guacamole", "hummus", "pesto"],
  mains: ["chicken", "beef", "pork", "steak", "ribeye", "lamb", "fish", "salmon", "shrimp", "tofu", "sausage", "asada",
    "bulgogi", "sukiyaki", "katsu", "teriyaki", "roast", "braise", "braised", "curry", "taco", "burger", "spam", "rib",
    "short rib", "chop", "masala", "paneer", "chana", "dal", "kabsa", "moussaka", "meatball", "stir fry"],
};
// Phrases that settle it outright ("sushi rice" is a basic, not a rice dish).
const OVERRIDES = [["sushi rice", "sauces"], ["fried rice", "rice"], ["rice bowl", "rice"], ["noodle soup", "soups"], ["garlic bread", "salads"]];

// Lowercase, accents off ("lǔròufàn" -> "lurou fan" still needs its own entry), punctuation to spaces.
const words = (s) => ` ${String(s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
// Occurrences of a word or phrase, including a simple plural ("pancake" finds "pancakes").
const count = (hay, w) => {
  const n = (x) => hay.split(` ${x} `).length - 1;
  return n(w) + (w.endsWith("s") ? 0 : n(`${w}s`) + n(`${w}es`));
};

export function guessChapter(r, chapters = DEFAULT_CHAPTERS) {
  // "Ribeye with Garlic Butter Pan Sauce": what comes after "with" is a side, and counts less.
  const [head, side = ""] = words(r.englishName || r.name).split(" with ");
  const title = words([head, r.romanized, r.englishName ? "" : r.name].join(" "));
  const extra = words(side);
  const body = words([r.description, ...(r.ingredients ?? []).map((i) => i.item ?? i.text)].join(" "));
  for (const [phrase, ch] of OVERRIDES) if (words(r.englishName || r.name).includes(` ${phrase} `)) return chapters.some((c) => c.id === ch) ? ch : null;
  let best = null, bestScore = 0;
  for (const c of chapters) {
    const list = CHAPTER_WORDS[c.id] ?? words(c.name).trim().split(" ");
    let score = 0;
    for (const w of list) score += count(title, w) * 3 + count(extra, w) + Math.min(count(body, w), 2) * 0.5;
    if (c.id === "mains") score *= 0.8; // the catch-all: a more specific chapter wins a tie
    if (score > bestScore) { best = c.id; bestScore = score; }
  }
  return best;
}

// ---------- cuisine ----------

const SCRIPTS = [
  [/\p{Script=Hangul}/u, "Korean"],
  [/\p{Script=Thai}/u, "Thai"],
  [/[\p{Script=Hiragana}\p{Script=Katakana}]/u, "Japanese"],
  [/\p{Script=Devanagari}/u, "Indian"],
  [/\p{Script=Arabic}/u, "Middle Eastern"],
  [/\p{Script=Greek}/u, "Greek"],
  [/\p{Script=Hebrew}/u, "Middle Eastern"],
];

const CUISINE_WORDS = {
  Korean: ["gochujang", "gochugaru", "doenjang", "kimchi", "bulgogi", "jjigae", "bap", "juk", "banchan", "galbi", "japchae"],
  Japanese: ["miso", "dashi", "mirin", "donburi", "don", "sukiyaki", "teriyaki", "katsu", "furikake", "udon", "soba", "ramen", "kurozu", "sushi", "raisu", "pepper lunch"],
  Taiwanese: ["lurou", "luroufan", "ximending", "dan bing", "danbing", "gua bao", "niurou zao fan"],
  Chinese: ["chaofan", "chao fan", "doubanjiang", "shaoxing", "mian", "banmian", "mapo", "hongshao", "suanrong", "suanxiang", "niurou"],
  Thai: ["nam pla", "pad thai", "khao", "gaeng", "tom yum", "kra pao"],
  Vietnamese: ["pho", "phở", "banh", "nuoc cham", "bun"],
  Italian: ["penne", "fettuccine", "spaghetti", "rigatoni", "alfredo", "bolognese", "parmesan", "risotto", "pasta", "marinara", "vodka sauce"],
  Mexican: ["asada", "tortilla", "salsa", "chipotle", "norteña", "nortena", "fideo", "carnitas", "pozole", "tacos", "sopa"],
  Indian: ["masala", "paneer", "dal", "tikka", "biryani", "garam"],
  American: ["ribeye", "mac and cheese", "brisket", "cornbread", "biscuits"],
};

export function guessCuisine(r) {
  if (r.cuisine) return r.cuisine;
  const native = r.nativeName ?? "";
  for (const [re, name] of SCRIPTS) if (re.test(native)) return name;
  const title = words([r.name, r.englishName, r.romanized].join(" "));
  const body = words([r.description, ...(r.ingredients ?? []).map((i) => i.item ?? i.text)].join(" "));
  let best = null, bestScore = 0;
  for (const [name, list] of Object.entries(CUISINE_WORDS)) {
    let score = count(title, name.toLowerCase()) * 10; // "Taiwanese Beef Rice" says so outright
    for (const w of list) score += count(title, w) * 3 + Math.min(count(body, w), 2);
    if (score > bestScore) { best = name; bestScore = score; }
  }
  // Han characters alone (no kana) are most likely Chinese.
  if (!best && /\p{Script=Han}/u.test(native)) return "Chinese";
  return best;
}

// ---------- equipment ----------

const EQUIPMENT = [
  ["Rice cooker", /rice[- ]cooker|inner pan|zojirushi|select (?:\w+ ){0,2}(?:and|&) start|keep warm/i],
  ["Oven", /\boven\b|\bbake\b|\bbaking\b|\broast(?:ed|ing)?\b(?! (?:sesame|seaweed|laver))|\bbroil/i],
  ["Pressure cooker", /pressure cook|instant pot/i],
  ["Air fryer", /air[- ]fr/i],
  ["Grill", /\bgrill(?:ed|ing)?\b/i],
  ["Slow cooker", /slow cooker|crock ?pot/i],
];

export function guessEquipment(r) {
  const hay = [r.description, ...(r.steps ?? []).map((s) => s.text)].join(" ");
  return EQUIPMENT.filter(([, re]) => re.test(hay)).map(([name]) => name);
}

// ---------- time ----------

// Rough time from the steps' timers (each step's longest), split into cooking time and long
// waits (marinating, brining, overnight rests of 3 hours or more). Doesn't count prep.
const LONG_WAIT = 3 * 3600;
export function recipeTime(r) {
  let cook = 0, wait = 0;
  for (const s of r.steps ?? []) {
    const t = Math.max(0, ...(s.timers ?? []).map((x) => x.seconds));
    if (t >= LONG_WAIT) wait += t; else cook += t;
  }
  return { cook, wait };
}
export const totalSeconds = (r) => { const { cook, wait } = recipeTime(r); return cook + wait; };

export const timerCount = (r) => (r.steps ?? []).reduce((n, s) => n + (s.timers?.length ?? 0), 0);

// "45 min", "1 hr 45 min + 24 hr wait"
export function formatTime({ cook, wait }) {
  const parts = [formatTotal(cook), wait ? `${formatTotal(wait)} wait` : ""].filter(Boolean);
  return parts.join(" + ");
}

export function formatTotal(seconds) {
  if (!seconds) return "";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), rest = m % 60;
  return rest ? `${h} hr ${rest} min` : `${h} hr`;
}
