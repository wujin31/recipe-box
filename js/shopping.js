// The shopping list: turning a recipe's ingredients into things to buy, combining them across
// recipes, and sorting them by store aisle. The list is kept on this device.
//
// Stored as entries, one per ingredient a recipe added, so a recipe can be taken off the list
// again; the list you see merges entries with the same key ("garlic" from three recipes).

import { loadLocal, saveLocal } from "./store.js";
import { UNITS, formatFraction, formatMeasure } from "./units.js";

// ---------- names ----------

const NATIVE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/u;
const NATIVE_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]+(?:\s[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]+)*/u;
const LATIN_WORD = /[A-Za-zÀ-ɏ]{2}/;
// Words that say how much or how it's prepared, not what to buy: "large eggs" are eggs.
const LEAD = /^(?:(?:extra[- ])?large|medium|small|big|fresh|whole|warm|hot|cold|cooked|raw|thin|thick|very|ripe|homemade|low-sodium|grated|minced|chopped|crushed|crumbled|shredded|thin slices|slices|sheets?|strips?|pieces? of)\s+/i;
// "3 garlic cloves" is 3 cloves of garlic; "2 celery stalks" is 2 stalks of celery.
const PIECES = { cloves: "clove", clove: "clove", stalks: "stalk", stalk: "stalk", ribs: "stalk", rib: "stalk", sprigs: "sprig", sprig: "sprig", heads: "head", head: "head", slices: "slice", slice: "slice", ears: "ear", ear: "ear" };
// "coarse or flaky salt": the first word only describes the second.
const DESCRIBING = /^(?:coarse|flaky|fine|low-sodium|reduced-sodium|homemade|light|dark|white|red|yellow|green|unsalted|salted|fresh|dried|toasted|regular|plain|sweet|hot|mild)$/i;

// Same thing, different words. Keys and values are cleaned, lower-case names.
const SAME = {
  "toasted sesame oil": "sesame oil", "kosher salt": "salt", "fine salt": "salt", "fine sea salt": "salt",
  "sea salt": "salt", "flaky salt": "salt", "coarse salt": "salt", "table salt": "salt", "flaky sea salt": "salt",
  "diamond crystal kosher salt": "salt", "morton kosher salt": "salt",
  "granulated sugar": "sugar", "white granulated sugar": "sugar", "white sugar": "sugar",
  "coarse black pepper": "black pepper", "black peppercorns": "black pepper", "coarsely cracked black pepper": "black pepper",
  "neutral high-smoke-point oil": "neutral oil", "vegetable oil": "neutral oil", "canola oil": "neutral oil", "neutral oil or olive oil": "neutral oil",
  "low-sodium chicken stock": "chicken stock", "chicken broth": "chicken stock", "low-sodium or homemade chicken stock": "chicken stock",
  "hon-mirin": "mirin", "scallion greens": "scallion", "scallion whites": "scallion", "green onion": "scallion", "spring onion": "scallion",
  "egg yolk": "egg", "egg white": "egg", "taiwanese rice wine": "rice wine", "japanese short-grain rice": "short-grain rice",
  "short-grain japanese rice": "short-grain rice", "chinkiang black vinegar": "black vinegar", "zhenjiang vinegar": "black vinegar",
  "fresh ginger": "ginger", "fried shallot crisps": "fried shallots", "unsalted butter": "butter", "salted butter": "butter",
  "dried shiitake mushroom": "dried shiitake", "toasted sesame seed": "sesame seed", "toasted white sesame seed": "sesame seed",
  "white sesame seed": "sesame seed", "totole mushroom bouillon powder": "totole mushroom bouillon", "mushroom bouillon": "totole mushroom bouillon",
  "lkk chili garlic sauce": "chili garlic sauce", "lee kum kee chili garlic sauce": "chili garlic sauce", "pre-fried shallot": "fried shallot",
  "korean chili flake": "gochugaru", "frozen thin-sliced beef roll": "frozen thin-sliced beef", "skin-on pork belly": "pork belly",
  "hon mirin": "mirin", "green serrano pepper": "serrano chile", "serrano chili": "serrano chile", "serrano pepper": "serrano chile",
  "parmigiano-reggiano": "parmesan", "parmigiano reggiano": "parmesan", "grated parmesan": "parmesan",
  "dried thin noodle": "dried knife-cut noodle", "pure rice vinegar": "rice vinegar", "fuji apple": "apple", "anchovy fish sauce": "fish sauce",
  "lemon juice": "lemon", "lemon zest": "lemon", "lime juice": "lime", "lime zest": "lime", "house blend oil": "neutral oil",
  "lard or reserved pork fat": "lard",
};

// Things bought by the piece but measured in recipes: "2 tbsp lemon juice" is part of a lemon.
// ml (or g) a piece gives, by the name as written.
const PER_PIECE = {
  "lemon juice": { ml: 45 }, "lemon zest": { ml: 15 }, "lime juice": { ml: 30 }, "lime zest": { ml: 10 },
  garlic: { ml: 5, g: 5, unit: "clove" }, "minced garlic": { ml: 5, g: 5, unit: "clove" },
  "pinto bean": { ml: 355, unit: "can" }, "black bean": { ml: 355, unit: "can" }, "kidney bean": { ml: 355, unit: "can" },
};
// Bought by weight but measured by volume: grams per ml.
const DENSITY = {
  butter: 0.96, "short-grain rice": 0.85, "jasmine rice": 0.8, "long-grain rice": 0.8, rice: 0.8, "white rice": 0.8,
  "cooked rice": 0.65, parmesan: 0.42, "all-purpose flour": 0.51, flour: 0.51, "brown sugar": 0.9,
};
// Herbs come in bunches, however the recipe measures them.
const BUNCH = /^(?:cilantro|flat-leaf parsley|parsley|mint|basil|thai basil|dill|chive|tarragon|shiso|perilla)(?: lea(?:f|ve))?$/;

// What's never bought: water, and what the recipe makes or keeps along the way.
const NOT_BOUGHT = /^(?:hot |cold |warm |boiling |drinking |cold drinking )?water(?!\s*(?:chestnut|cress|melon|spinach))\b|\breserved\b|\bfrom the .*\bjar\b|\bshallot oil\b|^ice\b/i;

const singular = (w) => ({ chilies: "chili", chillies: "chili", chiles: "chile" })[w.toLowerCase()] ?? w
  .replace(/ies$/i, "y").replace(/(ch|sh|ss|x|o)es$/i, "$1").replace(/leaves$/i, "leaf")
  .replace(/(?<![su])s$/i, "");

// "soy sauce 醬油 (jiàngyóu), Taiwanese if possible" -> { name: "soy sauce", native: "醬油" }.
export function shoppingName(text) {
  let s = String(text ?? "").trim();
  // Cooked rice is made from rice, not bought with it: keep it apart so it isn't added to raw rice.
  if (/\bcooked\b[^,(]*\brice\b/i.test(s)) return { name: "cooked rice", native: "" };
  // A parenthetical's English, for names that are all native script: "肉鬆 (ròusōng, pork floss)".
  const inner = [...s.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]);
  const natives = [];
  s = s.replace(/\s*\([^)]*\)/g, " ")          // asides
    .replace(/\s+[—–-]\s+.*$/, "")              // "— optional", "— spoon from the bottom"
    .replace(/^((?:bone-in|boneless|skin-on|skinless)),\s*/i, "$1 "); // "bone-in, skin-on chicken thighs"
  // "A or B": buy A ("black vinegar or rice vinegar"), unless A only describes B ("coarse or
  // flaky salt", "low-sodium or homemade chicken stock") or isn't in English ("關廟麵 or dried noodles").
  const or = s.split(/\s+or\s+/i);
  if (or.length > 1) {
    const [a, b] = [or[0], or.slice(1).join(" or ").split(",")[0]];
    if (!LATIN_WORD.test(a)) { natives.push(a.trim()); s = b; }
    else if (DESCRIBING.test(a.trim())) s = b;
    else s = a;
  }
  // Slash alternatives: keep the first Latin one, note a native one.
  const parts = s.split(/\s*\/\s*/);
  for (const p of parts) if (NATIVE.test(p) && !LATIN_WORD.test(p.split(NATIVE_RUN)[0])) natives.push(p.match(NATIVE_RUN)[0]);
  s = parts.find((p) => LATIN_WORD.test(p.replace(/[^\x00-ɏ]/g, ""))) ?? "";
  // Native words inside the Latin part: "toasted sesame oil 참기름".
  const words = s.split(/\s+/);
  for (const w of words) if (NATIVE.test(w)) natives.push(w.replace(/[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}]/gu, ""));
  s = words.filter((w) => !NATIVE.test(w)).join(" ");
  s = s.split(",")[0].replace(/\s+for\b.*$/i, "").replace(/[^\p{L}\p{N}&'’ -]/gu, " ").replace(/\s+/g, " ").trim();
  if (!LATIN_WORD.test(s)) {
    // All native: the English in the parentheses, if any ("yóucōng sū / fried shallot crisps").
    const english = inner.flatMap((x) => x.split(/[\/,]/)).map((x) => x.trim())
      .filter((x) => LATIN_WORD.test(x) && !/[āáǎàēéěèīíǐìōóǒòūúǔù]/i.test(x) && !NATIVE.test(x)).pop();
    s = english ?? "";
  }
  for (let prev; prev !== s;) { prev = s; s = s.replace(LEAD, ""); }
  return { name: s, native: natives.filter(Boolean)[0] ?? "" };
}

// The merge key and the counting unit for one ingredient: "3 garlic cloves" -> key "garlic", unit "clove".
export function shoppingKey(ing) {
  const { name, native } = shoppingName(ing.item ?? ing.text);
  let words = name.toLowerCase().split(" ").filter(Boolean);
  let unit = ing.unit ?? "";
  const last = words[words.length - 1];
  if (!unit && words.length > 1 && PIECES[last]) { unit = PIECES[last]; words = words.slice(0, -1); }
  let key = words.join(" ");
  const ws = key.split(" ");
  ws[ws.length - 1] = singular(ws[ws.length - 1] ?? "");
  const written = ws.join(" "); // before merging synonyms, for piece sizes ("lemon juice" vs "lemon zest")
  key = SAME[key] ?? SAME[written] ?? written;
  key = key.replace(/(\S+)$/, (w) => singular(w)); // "fried shallots" from the table is "fried shallot"
  // Garlic counted without a unit ("5 garlic") is cloves.
  if (key === "garlic" && !unit) unit = "clove";
  // Scallion whites and greens are the same scallions: don't count them twice.
  const part = /^scallion (?:white|green)s?$/.test(name.toLowerCase()) ? "scallion" : null;
  // Display name: the cleaned name with the counting word taken off ("garlic", not "garlic cloves").
  const display = PIECES[last] && unit === PIECES[last] && name.split(" ").length > 1 ? name.split(" ").slice(0, -1).join(" ") : name;
  return { key, name: display ? display.charAt(0).toUpperCase() + display.slice(1) : "", native, unit, per: PER_PIECE[written] ?? PER_PIECE[key] ?? null, part };
}

export const isBought = (ing) => !NOT_BOUGHT.test(shoppingName(ing.item ?? ing.text).name) && Boolean(shoppingKey(ing).key);

// ---------- staples ----------

export const DEFAULT_STAPLES = ["salt", "black pepper", "white pepper", "neutral oil", "sugar", "soy sauce"];
export const getStaples = () => loadLocal("staples", DEFAULT_STAPLES);
export const setStaples = (list) => saveLocal("staples", list);
export const isStaple = (key, staples = getStaples()) => staples.some((s) => {
  const k = shoppingKey({ item: s }).key;
  return k && (key === k || (k === "pepper" && /pepper$/.test(key) && !/bell|chil/.test(key)));
});

// ---------- aisles ----------

export const AISLES = ["Produce", "Meat & Seafood", "Dairy & Eggs", "Asian pantry", "Pantry & Spices", "Frozen", "Bakery", "Other"];

// First match wins, so the specific comes before the general ("sesame oil" before "oil",
// "egg noodles" before "egg", "green beans" before "beans").
const AISLE_WORDS = [
  ["Frozen", /^frozen\b|\bfish ball|\bfish tofu|\bdumpling/],
  ["Pantry & Spices", /\begg (?:noodle|fettuccine|pasta)|\bpasta\b|penne|spaghetti|fettuccine|linguine|rigatoni|fideo|macaroni|orzo|\bflour\b(?! tortilla)|baking (?:soda|powder)|\byeast\b/],
  ["Asian pantry", /soy sauce|soy paste|oyster sauce|fish sauce|sesame (?:oil|paste|seed)|\bmirin\b|\bsake\b|rice wine|shaoxing|black vinegar|rice vinegar|gochujang|gochugaru|chili flakes?|doenjang|\bmiso\b|kombu|\bnori\b|\blaver\b|hondashi|dashi|totole|mushroom bouillon|\bmsg\b|five[- ]spice|star anise|dried shiitake|shiitake mushroom|chili crisp|lao gan ma|chili oil|chili garlic sauce|sichuan|fermented black bean|fried shallot|pork floss|dried anchov|knife-cut noodle|dried (?:thin )?noodle|\bnoodle|udon|ramen|soba|short-grain rice|japanese rice|white pepper|shichimi|togarashi|\bshiso|kimchi|tofu|pickled|furikake|bonito|beni shoga/],
  ["Produce", /\bonion|garlic|ginger|scallion|shallot|celery|carrot|cucumber|tomatillo|(?<!sun-dried )tomato(?! (?:paste|pur|sauce|bouillon))|chil(?:i|e)(?!.*(?:flake|powder|oil|crisp|sauce))|cilantro|parsley|basil|mint|dill|thyme|rosemary|\blime|lemon(?! juice)|lemon juice|orange juice|\borange|avocado|\bpear\b|\bapple|\bcorn\b|green bean|potato|bok choy|spinach|cabbage|lettuce|radish|\bmu\b|daikon|mushroom|shimeji|enoki|zucchini|eggplant|bell pepper|jalape|serrano|fresno|bean sprout|herb|leek|kale|banana|berr(?:y|ie)|grape(?!seed)|melon|peach|plum|mango|pineapple|kiwi|cherr|fruit|arugula|broccoli|cauliflower|asparagus|squash|pumpkin|sweet potato|\byam|\bpeas?\b|salad/],
  ["Meat & Seafood", /\bbeef|\bpork|chicken(?! (?:stock|broth|bouillon))|\bsteak|ribeye|chuck|short rib|sausage|bacon|\blamb|shrimp|prawn|salmon|\bfish\b|\bcod\b|tuna|\bham\b|turkey|duck|\bbelly\b|\bskin\b|tallow|\blard/],
  ["Dairy & Eggs", /\begg|\bmilk|cream|crema|butter|cheese|queso|parmesan|parmigiano|pecorino|mozzarella|cheddar|kraft single|yogurt|ghee/],
  ["Bakery", /\bbread|tortilla|\bbun|bagel|pita/],
  ["Pantry & Spices", /salt|pepper|sugar|honey|\boil\b|vinegar|stock|broth|bouillon|tomato (?:paste|pur)|passata|cumin|bay lea|cinnamon|paprika|oregano|spice|^ground |turmeric|coriander|curry|cardamom|nutmeg|clove|garam masala|chili powder|vanilla|cocoa|\brice\b|\bbeans?\b|peanut|\bnut|wine|maggi|ketchup|mustard|mayo|sauce|\bcan\b|spam/],
];

export function aisleFor(key, overrides = loadLocal("aisles", {})) {
  if (overrides[key]) return overrides[key];
  for (const [aisle, re] of AISLE_WORDS) if (re.test(key)) return aisle;
  return "Other";
}
export function setAisle(key, aisle) {
  const all = loadLocal("aisles", {});
  saveLocal("aisles", { ...all, [key]: aisle });
}

// ---------- amounts ----------

// Totals per kind: every weight in grams, every volume in ml, each counting unit on its own.
// Measured amounts of things bought by the piece become pieces (2 tbsp lemon juice: 2/3 of a
// lemon; 12 ml minced garlic: 3 cloves), and of things bought by weight become grams.
export function totals(entries) {
  const out = new Map();
  const add = (unit, qty) => out.set(unit, (out.get(unit) ?? 0) + qty);
  const parts = new Map(); // recipe -> { white, green } scallions
  for (const e of entries) {
    if (e.qty == null) continue;
    const u = UNITS[e.unit];
    const per = e.per;
    if (u && per && per[u.kind === "mass" ? "g" : "ml"]) add(per.unit ?? "", (e.qty * u.toBase) / per[u.kind === "mass" ? "g" : "ml"]);
    else if (u?.kind === "volume" && DENSITY[e.key]) add("g", e.qty * u.toBase * DENSITY[e.key]);
    else if (u?.kind === "mass") add("g", e.qty * u.toBase);
    else if (u?.kind === "volume") add("ml", e.qty * u.toBase);
    else if (e.part) {
      const p = parts.get(e.recipeId) ?? { white: 0, green: 0 };
      p[/green/i.test(e.text) ? "green" : "white"] += e.qty;
      parts.set(e.recipeId, p);
    } else add(e.unit ?? "", e.qty);
  }
  for (const p of parts.values()) add("", Math.max(p.white, p.green));
  return out;
}

const COUNT_PLURAL = { bunch: "bunches", ear: "ears", clove: "cloves", stalk: "stalks", sprig: "sprigs", head: "heads", can: "cans", slice: "slices", piece: "pieces", bunch: "bunches", pinch: "pinches", stick: "sticks", handful: "handfuls", dash: "dashes" };

// "567 g (1 1/4 lb)", "9 cloves", "3", "5 tbsp", "1 bunch": what to buy, in the chosen units.
// `key` says what it is: herbs come by the bunch, and a spoonful of produce is "a little".
export function formatAmounts(map, system = "metric", key = "") {
  const sys = system === "us" ? "us" : "metric";
  const parts = [];
  if (BUNCH.test(key)) {
    const ml = (map.get("ml") ?? 0) + (map.get("g") ?? 0) * 4; // about 4 ml of chopped herbs to a gram
    map = new Map([...map].filter(([u]) => u !== "ml" && u !== "g"));
    if (ml) map.set("bunch", (map.get("bunch") ?? 0) + Math.max(1, Math.ceil(ml / 500)));
  }
  const produce = aisleFor(key, {}) === "Produce";
  for (const [unit, qty] of map) {
    if (!(qty > 0)) continue;
    if (unit === "ml" && produce && qty < 60) parts.push("a little");
    else if (unit === "ml" && qty < 60) parts.push(formatMeasure(qty, "ml", "us")); // spoons, in any system
    else if (unit === "g" || unit === "ml") {
      const main = formatMeasure(qty, unit, sys);
      // Weights also in the other system, since stores label both ways.
      const other = unit === "g" ? formatMeasure(qty, unit, sys === "us" ? "metric" : "us") : "";
      parts.push(other && other !== main ? `${main} (${other})` : main);
    } else if (unit === "clove") {
      const n = Math.ceil(qty - 0.05);
      // A head of garlic is about 10 cloves.
      parts.push(`${n} ${n === 1 ? "clove" : "cloves"}${n > 12 ? ` (about ${Math.ceil(n / 10)} heads)` : ""}`);
    } else {
      // You buy whole ones: half an onion is an onion, 2/3 of a lemon's juice is a lemon.
      const n = Math.max(1, Math.ceil(qty - 0.05));
      parts.push(unit ? `${n} ${n > 1 ? COUNT_PLURAL[unit] ?? unit : unit}` : String(n));
    }
  }
  return parts.join(" + ");
}

// ---------- the list ----------

const EMPTY = { entries: [], extras: [], checked: [] };
export const getList = () => ({ ...EMPTY, ...loadLocal("shopping", {}) });
const listeners = new Set();
const saveList = (list) => { saveLocal("shopping", list); listeners.forEach((fn) => fn(list)); };
export const onListChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// What a recipe's ingredient becomes on the list, at a scale.
export function entryFor(recipe, ing, factor = 1) {
  const { key, name, native, unit, per, part } = shoppingKey(ing);
  return {
    recipeId: recipe.id, recipeName: recipe.englishName || recipe.name || recipe.id,
    key, name, native, unit: unit || null, qty: ing.qty != null ? ing.qty * factor : null, text: ing.text, per, part,
  };
}

// Put a recipe's chosen ingredients on the list, replacing what it added before.
// With `keep`, the recipe's earlier entries stay and these are added (cooking mode's "missing
// something?" adds to what the recipe already put on the list).
export function addRecipe(recipe, ingredients, factor = 1, { keep = false } = {}) {
  const list = getList();
  const adding = new Set(ingredients.map((ing) => ing.text));
  const entries = list.entries.filter((e) => e.recipeId !== recipe.id || (keep && !adding.has(e.text)));
  entries.push(...ingredients.map((ing) => entryFor(recipe, ing, factor)));
  // Something already ticked off and needed again goes back on.
  const keys = new Set(ingredients.map((ing) => shoppingKey(ing).key));
  saveList({ ...list, entries, checked: list.checked.filter((k) => !keys.has(k)) });
}

export function removeRecipe(recipeId) {
  const list = getList();
  saveList({ ...list, entries: list.entries.filter((e) => e.recipeId !== recipeId) });
}

export function addExtra(text) {
  const t = String(text).trim().slice(0, 120);
  if (!t) return;
  const list = getList();
  const key = `extra:${t.toLowerCase()}`;
  if (list.extras.some((x) => x.key === key)) return;
  saveList({ ...list, extras: [...list.extras, { key, name: t }] });
}

export function toggle(key) {
  const list = getList();
  const checked = list.checked.includes(key) ? list.checked.filter((k) => k !== key) : [...list.checked, key];
  saveList({ ...list, checked });
}

// Drop everything ticked off (and the recipes with nothing left to buy).
export function clearChecked() {
  const list = getList();
  const done = new Set(list.checked);
  saveList({ entries: list.entries.filter((e) => !done.has(e.key)), extras: list.extras.filter((x) => !done.has(x.key)), checked: [] });
}

export function removeItem(key) {
  const list = getList();
  saveList({ entries: list.entries.filter((e) => e.key !== key), extras: list.extras.filter((x) => x.key !== key), checked: list.checked.filter((k) => k !== key) });
}

export const clearAll = () => saveList({ ...EMPTY });

// A merged item's name: the recipes' own words when they agree, else the plain name ("Eggs" for
// eggs and egg yolks, "Salt" for kosher and fine salt), never one recipe's particular version.
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);
function itemName(it) {
  const names = [...new Set(it.entries.map((e) => e.name))];
  if (names.length === 1) return names[0];
  const plain = names.find((n) => singular(n.toLowerCase().split(" ").pop()) === it.key.split(" ").pop() && n.toLowerCase().split(" ").length === it.key.split(" ").length);
  if (plain) return plain;
  const counted = it.entries.some((e) => !e.unit || COUNT_PLURAL[e.unit]) && !/s$/.test(it.key);
  return titleCase(counted && !UNITS[it.entries[0].unit] ? `${it.key}s` : it.key);
}
// The native name, only when every recipe that gives one gives the same one (滷蛋 is braised eggs,
// not eggs; 다진 마늘 is minced garlic).
function itemNative(it) {
  const natives = new Set(it.entries.map((e) => e.native).filter(Boolean));
  return natives.size === 1 && it.entries.every((e) => e.native) ? [...natives][0] : "";
}

// The list as shown: one item per key, with its amounts, the recipes it's for, its aisle.
export function items(list = getList(), system = "metric") {
  const byKey = new Map();
  for (const e of list.entries) {
    const it = byKey.get(e.key) ?? { key: e.key, entries: [], sources: [] };
    it.entries.push(e);
    if (!it.sources.includes(e.recipeName)) it.sources.push(e.recipeName);
    byKey.set(e.key, it);
  }
  const out = [...byKey.values()].map((it) => ({
    ...it, name: itemName(it), native: itemNative(it),
    amount: formatAmounts(totals(it.entries), system, it.key), aisle: aisleFor(it.key), checked: list.checked.includes(it.key),
  }));
  // Your own items are sorted by what they say ("bananas" → Produce), or moved by hand.
  const moved = loadLocal("aisles", {});
  for (const x of list.extras) {
    const aisle = moved[x.key] ?? aisleFor(shoppingKey({ item: x.name }).key, {});
    out.push({ key: x.key, name: x.name, native: "", amount: "", sources: [], entries: [], aisle, checked: list.checked.includes(x.key), extra: true });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const recipesOnList = (list = getList()) => {
  const seen = new Map();
  for (const e of list.entries) if (!seen.has(e.recipeId)) seen.set(e.recipeId, e.recipeName);
  return [...seen].map(([id, name]) => ({ id, name }));
};

export const remaining = (list = getList()) => items(list).filter((it) => !it.checked).length;

// Plain text for Messages or Reminders: aisles as headings, one item a line.
export function listText(list = getList(), system = "metric") {
  const all = items(list, system).filter((it) => !it.checked);
  const lines = ["Shopping list"];
  for (const aisle of AISLES) {
    const here = all.filter((it) => it.aisle === aisle);
    if (!here.length) continue;
    lines.push("", aisle);
    for (const it of here) lines.push(`- ${[it.name, it.native ? `(${it.native})` : "", it.amount ? `— ${it.amount}` : ""].filter(Boolean).join(" ")}`);
  }
  return lines.join("\n");
}
