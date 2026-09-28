// Turns a Claude recipe card into a recipe object. Two inputs are understood:
//
// 1. The card's copied text (or the text of a PDF printed from it):
//      <native name> (<romanized>) · <English name>
//      <description>
//      Ingredients
//      • <ingredient>            (bullets are missing in PDF text)
//      Steps
//      1. <step>                 (PDF text wraps steps across lines)
//      Notes
//      <notes>
//    Copying a card drops its timer chips, so timers only come from times written in the steps,
//    plus explicit "⏱ 8 min" markers (which this app writes when exporting).
//
// 2. JSON, from the export prompt (EXPORT_PROMPT) or schema.org Recipe data. This keeps the
//    card's timers and servings.

import { parseIngredientLine, normalizeFractions, NUMBER_RE, parseNumber } from "./units.js";

const SECTION_WORDS = [
  ["ingredients", "ingredients"],
  ["steps", "steps"], ["instructions", "steps"], ["directions", "steps"], ["method", "steps"], ["preparation", "steps"],
  ["notes", "notes"], ["note", "notes"], ["chef's notes", "notes"], ["tips", "notes"],
];

// "Ingredients", "## Steps", "**Method:**", "Ingredients (makes 16)", "Chef’s Notes".
// Returns { section, servings } or null.
function sectionOf(line) {
  const plain = line.replace(/^#+\s*/, "").replace(/\*\*|__/g, "").replace(/’/g, "'").trim();
  const m = plain.match(/^([a-z' ]+?)\s*(?:\(([^)]*)\))?\s*:?$/i);
  if (!m) return null;
  const hit = SECTION_WORDS.find(([word]) => word === m[1].toLowerCase());
  if (!hit) return null;
  const serves = m[2]?.match(/(?:serves|makes|for)\s+(\d+)/i);
  return { section: hit[1], servings: serves ? Number(serves[1]) : null };
}

const BULLET_RE = /^\s*(?:[•●◦▪·▢☐○]\s*|[-*–]\s+)/;
const STEP_NUM_RE = /^\s*(?:step\s*)?(\d+)\s*[.):]\s*/i;
const NUMBERED_ITEM_RE = /^\s*\d+[.)]\s+(?=\S)/; // "1. 2 eggs" in an ingredient list
const SERVES_RE = /^(?:serves|servings|yield|yields|makes)\s*:?\s*(\d+(?:\.\d+)?)\b/i;
const PAGE_FOOTER_RE = /^(?:page\s+)?\d+\s*(?:of|\/)\s*\d+$/i;

// "For the sauce:", "For the filling", "**For the glaze**": a sub-heading, not an ingredient.
function groupHeading(text) {
  const plain = text.replace(/\*\*|__/g, "").trim();
  if (/\d/.test(plain)) return null;
  if (/:$/.test(plain) || /^for\s+(?:the\s+)?\S/i.test(plain)) return plain.replace(/:$/, "").trim();
  return null;
}

function joinWrapped(prev, next) {
  return /[-–]$/.test(prev) ? prev + next : prev + " " + next;
}

const isLatin = (s) => /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(s);

// Claude titles recipes in many shapes; all of these split into native name, romanization,
// English name and (sometimes) a subtitle:
//   "ข้าวหมกไก่ (Khao Mok Kai) · Thai Chicken Biryani"      native (romanized) · English
//   "ハヤシライス (Hayashi Raisu / Hayashi Rice)"             native (romanized / English)
//   "Black Vinegar Spam Donburi (黒酢スパム丼 / kurozu supamu-don)"   English (native / romanized)
//   "牛肉燥飯 (niúròu zào fàn) — Taiwanese Beef Rice, v2"    native side — English
//   "Carne Asada Norteña — Citrus Marinade (v2)"             English — subtitle
//   "Gyū Suki-don 牛すき丼 — Beef Sukiyaki Bowl"              romanized native — English
//   "滷肉飯 (lǔròufàn) Oven Braise, 1.25 lb"                 native (romanized) more words
//   "Sumeshi 酢飯 (Sushi Rice)"  "Pad Kra Pao · Thai Basil Chicken"  "Pancakes"
const hasNative = (s) => /[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(s);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// "Gyū Suki-don 牛すき丼" -> ["Gyū Suki-don", "牛すき丼"]; interleaved text ("蒜蓉辣椒 Spam 炒飯") stays whole.
function splitMixed(s) {
  const tokens = s.trim().split(/\s+/);
  const kinds = tokens.map(hasNative);
  const flips = kinds.filter((k, i) => i && k !== kinds[i - 1]).length;
  if (flips !== 1) return hasNative(s) ? { native: s.trim(), latin: "" } : { native: "", latin: s.trim() };
  const cut = kinds.findIndex((k) => k !== kinds[0]);
  const a = tokens.slice(0, cut).join(" "), b = tokens.slice(cut).join(" ");
  return kinds[0] ? { native: a, latin: b } : { native: b, latin: a };
}

// One side of a title: "native (romanized)", "English (native / romanized)", "native (romanized) rest".
function parseSide(side) {
  const m = side.match(/^(.*?)\s*\(([^)]*)\)\s*(.*)$/);
  if (!m) {
    const { native, latin } = splitMixed(side);
    return { native, romanized: native ? latin : "", english: native ? "" : latin };
  }
  const [, outside, inner, rest] = m;
  const segs = inner.split(/\s+\/\s+/).map((x) => x.trim()).filter(Boolean);
  const nativeSeg = segs.find(hasNative) ?? "";
  const latinSegs = segs.filter((x) => !hasNative(x));
  const out = splitMixed(outside);
  if (!out.native && !nativeSeg) return { native: "", romanized: "", english: side.trim() }; // "Chicken (Thai style)"
  if (out.native) {
    // native outside: the parentheses hold the romanization, then maybe the English name.
    const romanized = out.latin || latinSegs[0] || "";
    const english = out.latin ? latinSegs[0] ?? "" : latinSegs[1] ?? "";
    return { native: out.native, romanized, english: english || (rest ? `${cap(romanized)} ${rest}`.trim() : "") };
  }
  // English outside, native (and romanization) in the parentheses.
  return { native: nativeSeg, romanized: latinSegs[0] ?? "", english: [out.latin, rest].filter(Boolean).join(" ") };
}

export function parseTitle(title) {
  title = title.trim();
  const plain = { nativeName: "", romanized: "", englishName: title };
  if (title.length > 200) return plain; // not a real title
  const dot = title.split(/\s+[·•|]\s+/);
  const dash = title.split(/\s+[—–]\s+/);
  let left = title, right = "", kind = "";
  if (dot.length === 2) [left, right, kind] = [dot[0], dot[1], "dot"];
  else if (dash.length === 2) [left, right, kind] = [dash[0], dash[1], "dash"];

  const L = parseSide(left);
  if (!right) {
    return { nativeName: L.native, romanized: L.romanized, englishName: L.english || (L.native ? L.romanized : title) };
  }
  if (hasNative(right) && !hasNative(left)) {
    return { nativeName: right.trim(), romanized: "", englishName: left.trim() }; // "Mapo Tofu · 麻婆豆腐"
  }
  // "Beef Pepper Rice (ビーフペッパーライス / …) — Pepper Lunch Dupe": English already on the left.
  if (kind === "dash" && L.native && L.english) {
    return { nativeName: L.native, romanized: L.romanized, englishName: L.english, subtitle: right.trim() };
  }
  // "native side — English", "native (romanized) · English", "Bibimbap (비빔밥) · Mixed Rice",
  // "romanized · English": the right side is the English name.
  if (L.native || (kind === "dot" && !/^(with|and|in|on)\b/i.test(right))) {
    return { nativeName: L.native, romanized: L.romanized || L.english, englishName: right.trim() };
  }
  // "English — subtitle" (and "Cinnamon Rolls · With Cream Cheese Glaze").
  return { nativeName: "", romanized: "", englishName: L.english || left.trim(), subtitle: right.trim() };
}

// ---------- timers ----------

const WORD_NUMBERS = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, "twenty-five": 25, thirty: 30,
  forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90,
};
const WORDS = Object.keys(WORD_NUMBERS).sort((a, b) => b.length - a.length).join("|");
const NUM = String.raw`(?:${NUMBER_RE}|\b(?:${WORDS})\b)`;
const UNIT = String.raw`(hours?|hrs?|h|minutes?|mins?|seconds?|secs?)\b`;
// 1: "half an hour"  2-4: amount, range end, unit  5-6: second part ("1 hr 15 min")
// 7: "or two" ("a minute or two")  8: "and a half"
const DURATION = String.raw`\b(half an? hour)\b|(${NUM})(?:\s*(?:-|–|to|or)\s*(${NUM}))?(?:\s*|-)${UNIT}(?:,?\s*(?:and\s+)?(${NUM})\s*${UNIT})?(?:\s+or\s+(two|three))?(\s+and\s+a\s+half)?`;
const TIMER_RE = new RegExp(DURATION, "gi");

const unitSeconds = (u) => (/^h/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);
const amount = (s) => {
  const w = WORD_NUMBERS[s.toLowerCase()];
  return w ?? parseNumber(s);
};

function durationSeconds(m) {
  if (m[1]) return 1800;
  const unit = unitSeconds(m[4]);
  // "a second batch" is not a one-second timer.
  if (unit === 1 && !m[3] && WORD_NUMBERS[m[2].toLowerCase()] != null) return 0;
  let n = amount(m[3] ?? m[2]);
  if (m[7]) n = Math.max(n, WORD_NUMBERS[m[7].toLowerCase()]);
  if (m[8]) n += 0.5;
  let seconds = n * unit;
  if (m[5] && unitSeconds(m[6]) < unit) seconds += amount(m[5]) * unitSeconds(m[6]);
  return Math.round(seconds);
}

// Times written in a step ("about 20 minutes", "for a minute", "1 hr 15 min").
// Times that aren't something to time: an interval ("every 20 minutes"), a moment ("at the
// 15-minute mark"), a comparison ("2 minutes less than the package says"), a limit ("up to 24
// hours", "don't go past 2 hours"), a change of plan ("stop at 4 minutes instead"), or a remark
// on the total ("that's 3 minutes total"; "50 minutes total" beside the step's own timers).
const NOT_BEFORE = /\b(?:every|each|at the|up to|past|beyond|no (?:more|longer) than|more than|longer than|at most|stop at|that's|that is)\s+(?:about\s+|around\s+|roughly\s+)?$/i;
const NOT_AFTER = /^[\s-]*(?:mark\b|(?:less|more|longer|shorter)\s+than\b|short of\b|instead\b)/i;
const TOTAL = /^\s*(?:total|in all|altogether)\b/i;

export function findTimers(text) {
  const s = normalizeFractions(text);
  const found = [];
  const re = new RegExp(TIMER_RE.source, "gi");
  for (let m; (m = re.exec(s));) {
    // "9 minutes, 2 minutes less…" is two times, not one: a second part must be a smaller unit.
    if (m[5] && unitSeconds(m[6]) >= unitSeconds(m[4])) {
      const cut = m[0].toLowerCase().indexOf(m[4].toLowerCase(), m[0].indexOf(m[3] ?? m[2]) + 1) + m[4].length;
      const first = Object.assign([m[0].slice(0, cut), m[1], m[2], m[3], m[4]], { index: m.index });
      re.lastIndex = m.index + cut;
      m = first;
    }
    const seconds = durationSeconds(m);
    const before = s.slice(0, m.index), after = s.slice(m.index + m[0].length);
    if (seconds > 0 && !NOT_BEFORE.test(before) && !NOT_AFTER.test(after)) found.push({ text: m[0], seconds, total: TOTAL.test(after) });
  }
  // A total is a timer only when the step has no others.
  const timers = found.some((t) => !t.total) ? found.filter((t) => !t.total) : found;
  return timers.map(({ text, seconds }) => ({ text, seconds }));
}

// Where each of a step's timers sits in its text, in order (-1 for a timer from a ⏱ marker or
// the card's JSON). Two "1 minute" timers are the first and the second "1 minute", and "5 minutes"
// is never found inside "4–5 minutes".
export function timerPositions(text, timers) {
  let from = 0;
  return timers.map((t) => {
    if (!t.text) return -1;
    for (let at = text.indexOf(t.text, from); at >= 0; at = text.indexOf(t.text, at + 1)) {
      if (/[\d.\/–-]\s*$/.test(text.slice(Math.max(0, at - 2), at)) && /^\d/.test(t.text)) continue; // inside a range
      from = at + t.text.length;
      return at;
    }
    return -1;
  });
}

// What a timer is for, in a few words from its step: "Braise 1 hr 15 min covered" -> "Braise covered",
// "…, select White/Sushi and start (about 55 minutes)." -> "Select White/Sushi and start".
const TIMER_SLOT = "\u0000"; // stands in for the timer's own words while the step is trimmed
const LEAD = /^(?:and|then|or|but|so|now|also|just)\s+/i;
const BEFORE = /\s*\b(?:for|about|around|roughly|approximately|approx\.?|at least|another|a further|over|in|within|~)\s*$/i;
const AFTER = /^\s*(?:more|longer|total|or so|or until\b.*)\b/i;
const RANGE_BEFORE = new RegExp(String.raw`(?:${DURATION})\s*(?:to|or|-|–)\s*$`, "i");
const RANGE_AFTER = new RegExp(String.raw`^\s*(?:to|or|-|–)\s*(?:${DURATION})`, "i");
// A label starts with something to do. Clauses that don't ("turning once", "per side", "lidded")
// give way to the clause before them.
const VERBS = new Set(`add adjust arrange assemble bake baste beat blanch blend blister bloom boil braise bring brown
  brush caramelize char check chill chop coat combine cook cool cover crack crisp crush cure cut deglaze dip
  dissolve drain drizzle drop dry finish flip fluff fold freeze fry garnish give glaze grate grill heat hold
  keep knead lay leave let lift lower marinate mash melt microwave mix move nestle open pat place poach pound
  pour preheat press prove proof pull put reduce refrigerate reheat remove render repeat rest return rinse rise
  roast roll rub run salt saute sauté scatter scrape sear season select serve set shake shape simmer sit skim
  slice smash soak soften spoon spread sprinkle squeeze stand start steam steep stew stir stir-fry strain submerge
  swirl take taste thaw tip toast top toss transfer trim turn uncover wait warm whisk wipe wrap`.split(/\s+/));
const STOP = /\s+(?:of|a|an|the|to|in|on|with|and|for|at|into|onto|over|from|your|until|so|by|as|\d\S*)$/i;
const startsWithVerb = (s) => VERBS.has(s.split(/[\s,]/)[0].toLowerCase());

export function timerAction(text, t, ingredients = [], at = timerPositions(text, [t])[0]) {
  // The timer's words become one marker, at the timer's own place in the step.
  let s = at >= 0 ? text.slice(0, at) + TIMER_SLOT + text.slice(at + t.text.length) : text;
  // Ingredients by name only: "15 ml light soy sauce, divided" -> "light soy sauce".
  for (const ing of [...ingredients].sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0))) {
    if (!ing.text || !s.includes(ing.text)) continue;
    const name = (ing.item || ing.text).split(/,|\s\(/)[0].trim();
    s = s.split(ing.text).join(name);
  }
  // A bracketed aside holding the timer becomes the marker; other asides go.
  s = s.replace(/\s*[(\[][^)\]]*[)\]]/g, (m) => (m.includes(TIMER_SLOT) ? ` ${TIMER_SLOT}` : ""));
  // The sentence with the timer (a ⏱ marker's timer belongs to the step's last sentence), cut into clauses.
  const sentences = s.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [s];
  const sentence = sentences.find((x) => x.includes(TIMER_SLOT)) ?? sentences[sentences.length - 1];
  const clauses = sentence.split(/[,;:]\s+|\s+(?:and\s+)?then\s+|\s+[—–]\s+/i);
  let k = clauses.findIndex((c) => c.includes(TIMER_SLOT));
  if (k < 0) k = clauses.length - 1;

  const clean = (c) => {
    let [before, after = ""] = c.split(TIMER_SLOT);
    // "Simmer 1 hr 30 min to 2 hr": each end is its own timer; neither label keeps the other end.
    before = before.replace(RANGE_BEFORE, "");
    after = after.replace(RANGE_AFTER, "");
    for (let prev; prev !== before;) { prev = before; before = before.replace(BEFORE, ""); }
    after = after.replace(AFTER, "");
    // "Melt the butter in a pan over medium heat and brown the thighs": the time is for the last action.
    if (`${before} ${after}`.replace(LEAD, "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().split(/\s+/).length > 6) {
      const parts = before.split(" and ");
      const last = parts[parts.length - 1].trim();
      if (parts.length > 1 && startsWithVerb(last)) before = last;
    }
    return `${before} ${after}`.replace(/\s+/g, " ").replace(LEAD, "").trim().replace(/[.,;:!?…]+$/, "").trim();
  };
  // The timer's clause if it says what to do, else the nearest clause before it that does.
  let action = "";
  for (let j = k; j >= 0 && !action; j--) {
    const c = clean(clauses[j]);
    if (startsWithVerb(c)) action = c;
  }
  if (!action) return "";
  const words = action.split(" ");
  if (words.length > 7) {
    let cut = words.slice(0, 6).join(" ");
    for (let prev; prev !== cut;) { prev = cut; cut = cut.replace(STOP, ""); }
    action = `${cut}…`;
  }
  return action.charAt(0).toUpperCase() + action.slice(1);
}

// A timer you type: "12" is minutes, "1:30" minutes and seconds, "1:05:00" adds hours. Up to 48 hours.
export function parseDuration(s) {
  const parts = String(s).trim().split(":").map((p) => p.trim());
  if (!parts[0] || parts.length > 3 || parts.some((p) => !/^\d+(?:\.\d+)?$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.slice(1).some((x) => x >= 60)) return null; // "1:75" is a typo, not 2:15
  const seconds = n.length === 1 ? n[0] * 60 : n.length === 2 ? n[0] * 60 + n[1] : n[0] * 3600 + n[1] * 60 + n[2];
  return seconds > 0 && seconds <= 48 * 3600 ? Math.round(seconds) : null;
}

export function formatDurationText(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h && `${h} hr`, m && `${m} min`, s && `${s} sec`].filter(Boolean).join(" ") || "0 sec";
}

// "⏱ 8 min" or "[timer 8 min]" in a step: a timer that isn't part of the sentence.
const MARKER_RE = new RegExp(String.raw`\s*(?:⏱️?\s*|\[timer:?\s*)(${DURATION})\]?`, "gi");

function takeMarkers(text) {
  const timers = [];
  const clean = text.replace(MARKER_RE, (_, dur) => {
    const t = findTimers(dur)[0];
    if (t) timers.push({ text: null, seconds: t.seconds });
    return "";
  }).trim();
  return { text: clean, timers };
}

// Timers written in the text win; extra timers are kept unless the text already has that time.
function mergeTimers(found, extra) {
  const out = [...found];
  for (const t of extra) if (!out.some((f) => f.seconds === t.seconds)) out.push(t);
  return out;
}

// Find which ingredients a step mentions verbatim (the card pastes full ingredient text into
// steps). Longer texts claim their span first, so "5 ml sesame oil" isn't found inside
// "15 ml sesame oil (for the sauce)", and a match can't start in the middle of a number.
export function findIngredientRefs(stepText, ingredients) {
  const order = ingredients.map((ing, i) => i).filter((i) => ingredients[i].text)
    .sort((a, b) => ingredients[b].text.length - ingredients[a].text.length);
  const taken = [];
  const refs = new Set();
  for (const i of order) {
    const needle = ingredients[i].text;
    for (let at = stepText.indexOf(needle); at >= 0; at = stepText.indexOf(needle, at + 1)) {
      const end = at + needle.length;
      if (/[\d.,/]/.test(stepText[at - 1] ?? "") && /^\d/.test(needle)) continue;
      if (/\w/.test(stepText[end] ?? "") && /\w$/.test(needle)) continue;
      if (taken.some(([s, e]) => at < e && end > s)) continue;
      taken.push([at, end]);
      refs.add(i);
    }
  }
  return [...refs].sort((a, b) => a - b);
}

function finishSteps(recipe) {
  recipe.steps = recipe.steps.map((step) => {
    const { text, timers: marked } = takeMarkers(step.text);
    return {
      text,
      ingredientRefs: findIngredientRefs(text, recipe.ingredients),
      timers: mergeTimers(findTimers(text), [...marked, ...(step.timers ?? [])]),
    };
  });
  return recipe;
}

// Re-derive what the parser computes (amounts, ingredient links, timers) from a saved recipe's
// text, so parser improvements reach recipes saved earlier. Timers that aren't in the text
// (from the export prompt or ⏱ markers) are kept.
export function refreshRecipe(r) {
  const ingredients = r.ingredients.map((ing) => ({ ...parseIngredientLine(ing.text), ...(ing.group ? { group: ing.group } : {}) }));
  const steps = r.steps.map((s) => ({ text: s.text, timers: (s.timers ?? []).filter((t) => !t.text) }));
  const { subtitle, ...names } = parseTitle(r.name ?? "");
  const out = finishSteps({ ...r, ...names, ingredients, steps });
  if (subtitle) out.subtitle = subtitle; else delete out.subtitle;
  return out;
}

// ---------- card text ----------

export function parseRecipeText(raw) {
  const lines = String(raw ?? "").replace(/\r\n?/g, "\n").replace(/[​-‍﻿]/g, "")
    .split("\n").map((l) => l.replace(/ /g, " ").trim())
    .filter((l) => !PAGE_FOOTER_RE.test(l));
  const first = lines.findIndex((l) => l);
  if (first < 0) throw new Error("Nothing to import — the text is empty.");

  // A paste that starts at "Ingredients" has no title line.
  const startsWithSection = sectionOf(lines[first]);
  const title = startsWithSection ? "Untitled recipe" : lines[first].replace(/^#+\s*/, "").replace(/\*\*|__/g, "").trim();
  const recipe = {
    name: title,
    ...parseTitle(title),
    description: "",
    ingredients: [],
    steps: [],
    notes: "",
  };

  let section = null;
  let group = null;
  let blank = false;
  let numberedSteps = false;
  let prevLength = 0;
  for (const line of lines.slice(startsWithSection ? first : first + 1)) {
    if (!line) { blank = true; continue; }
    const afterBlank = blank;
    const wrapped = prevLength >= 60; // the previous line was long enough to have been wrapped
    blank = false;
    prevLength = line.length;
    const heading = sectionOf(line);
    if (heading) {
      section = heading.section;
      group = null;
      if (heading.servings && !recipe.servings) recipe.servings = heading.servings;
      continue;
    }

    if (section === null) {
      const serves = line.match(SERVES_RE);
      if (serves) recipe.servings = Number(serves[1]);
      else recipe.description = !recipe.description ? line : afterBlank ? `${recipe.description}\n\n${line}` : joinWrapped(recipe.description, line);
    } else if (section === "ingredients") {
      const bulleted = BULLET_RE.test(line);
      const text = line.replace(BULLET_RE, "").replace(NUMBERED_ITEM_RE, "");
      const sub = groupHeading(text);
      if (sub) { group = sub; continue; }
      const prev = recipe.ingredients[recipe.ingredients.length - 1];
      // A PDF line break inside an ingredient: a long line, then one starting lowercase, no bullet.
      if (!bulleted && !afterBlank && wrapped && prev && /^[a-z(]/.test(text)) {
        Object.assign(prev, parseIngredientLine(joinWrapped(prev.text, text)));
        continue;
      }
      const ing = parseIngredientLine(text);
      if (group) ing.group = group;
      recipe.ingredients.push(ing);
    } else if (section === "steps") {
      const numbered = STEP_NUM_RE.test(line);
      const bulleted = BULLET_RE.test(line);
      if (numbered) numberedSteps = true;
      const text = line.replace(numbered ? STEP_NUM_RE : BULLET_RE, "");
      // New step: a number, a bullet, or (in steps written without numbers) a new paragraph.
      if (numbered || bulleted || !recipe.steps.length || (afterBlank && !numberedSteps)) {
        recipe.steps.push({ text });
      } else {
        const last = recipe.steps[recipe.steps.length - 1];
        last.text = joinWrapped(last.text, text);
      }
    } else if (section === "notes") {
      const text = BULLET_RE.test(line) ? `• ${line.replace(BULLET_RE, "")}` : line;
      if (!recipe.notes) recipe.notes = text;
      else if (afterBlank || text.startsWith("• ")) recipe.notes += (afterBlank ? "\n\n" : "\n") + text;
      else recipe.notes = joinWrapped(recipe.notes, text);
    }
  }

  // "…Serves 4." at the end of the description (the card has no servings field of its own).
  if (!recipe.servings) {
    const m = recipe.description.match(/\b(?:serves|servings:?|makes)\s+(\d+(?:\.\d+)?)\b/i);
    if (m) recipe.servings = Number(m[1]);
  }

  if (!recipe.ingredients.length) {
    throw new Error("Couldn't find an Ingredients list. Paste the whole recipe card, starting from its title.");
  }
  if (!recipe.steps.length) {
    throw new Error("Couldn't find any Steps. Paste the whole recipe card, including its steps.");
  }
  return finishSteps(recipe);
}

// ---------- JSON (export prompt or schema.org) ----------

export const EXPORT_PROMPT = `Export the recipe card above for my recipe app. Reply with only a JSON code block, no other text, in exactly this shape:

{
  "title": "<the card's title, exactly as shown>",
  "description": "<the card's description>",
  "servings": <number of servings the amounts are for>,
  "ingredients": ["<one string per ingredient, exactly as shown on the card>"],
  "steps": [
    { "text": "<the step, exactly as shown>", "timers": [<minutes for each timer the card shows on this step>] }
  ],
  "notes": "<the card's notes>"
}

Use the card's current wording, amounts and units. Put every timer the card shows for a step in that step's "timers" as minutes (decimals are fine, e.g. 0.5), and use [] when a step has no timer.`;

// "PT1H15M" -> 4500
function isoDurationSeconds(s) {
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(String(s).trim());
  if (!m) return 0;
  const [, d = 0, h = 0, min = 0, sec = 0] = m;
  return Math.round(d * 86400 + h * 3600 + min * 60 + Number(sec));
}

function jsonTimer(t) {
  if (typeof t === "number") return t * 60;
  if (typeof t === "string") return isoDurationSeconds(t) || (findTimers(t)[0]?.seconds ?? Number(t) * 60) || 0;
  if (t && typeof t === "object") {
    if (t.seconds != null) return Number(t.seconds);
    if (t.minutes != null) return Number(t.minutes) * 60;
    if (t.duration != null) return jsonTimer(t.duration);
  }
  return 0;
}

const textOf = (v) => (typeof v === "string" ? v : v?.text ?? v?.name ?? "");

function jsonSteps(list, out = []) {
  for (const s of [list].flat()) {
    if (!s) continue;
    if (s.itemListElement) { jsonSteps(s.itemListElement, out); continue; } // HowToSection
    const text = textOf(s).trim();
    if (!text) continue;
    const raw = [...[s.timers ?? []].flat(), s.timer, s.timer_minutes, s.timeRequired, s.performTime].filter((t) => t != null && t !== "");
    const timers = raw.map(jsonTimer).filter((sec) => sec > 0).map((seconds) => ({ text: null, seconds: Math.round(seconds) }));
    out.push({ text, timers });
  }
  return out;
}

function jsonIngredients(list) {
  const out = [];
  for (const item of [list].flat()) {
    if (!item) continue;
    if (Array.isArray(item.items)) {
      for (const sub of item.items) out.push({ ...parseIngredientLine(textOf(sub)), ...(item.group || item.name ? { group: item.group ?? item.name } : {}) });
      continue;
    }
    const text = textOf(item).trim();
    if (!text) continue;
    const ing = parseIngredientLine(text);
    if (item.group) ing.group = item.group;
    out.push(ing);
  }
  return out;
}

function findRecipeObject(data) {
  if (Array.isArray(data)) return data.map(findRecipeObject).find(Boolean) ?? null;
  if (!data || typeof data !== "object") return null;
  if (data["@graph"]) return findRecipeObject(data["@graph"]);
  const type = [data["@type"]].flat().join(" ");
  if (/Recipe/.test(type) || data.ingredients || data.recipeIngredient || data.steps || data.recipeInstructions) return data;
  return findRecipeObject(data.recipe);
}

export function parseRecipeJson(data) {
  const o = findRecipeObject(data);
  if (!o) throw new Error("That JSON doesn't look like a recipe.");
  const title = String(o.title ?? o.name ?? "Untitled recipe").trim();
  const recipe = {
    name: title,
    ...parseTitle(title),
    description: String(o.description ?? "").trim(),
    ingredients: jsonIngredients(o.ingredients ?? o.recipeIngredient ?? []),
    steps: jsonSteps(o.steps ?? o.recipeInstructions ?? []),
    notes: [o.notes ?? o.tips ?? ""].flat().join(" ").trim(),
  };
  const servings = parseFloat([o.servings ?? o.recipeYield ?? ""].flat()[0]);
  if (servings > 0) recipe.servings = servings;
  if (!recipe.ingredients.length && !recipe.steps.length) throw new Error("That JSON has no ingredients or steps.");
  return finishSteps(recipe);
}

// Card text, PDF text, or JSON (optionally in a ```json code block, as Claude replies).
export function parseRecipeInput(raw) {
  raw = String(raw ?? "");
  // A code block, or the start of one when the copy cut off before the closing fence.
  const fenced = raw.match(/```(?:json)?\s*\n([\s\S]*?)(?:\n\s*```|$)/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  if (/^[[{]/.test(candidate)) {
    let data;
    try { data = JSON.parse(candidate); } catch {
      throw new Error("That looks like JSON but it's incomplete. Copy Claude's whole reply.");
    }
    return parseRecipeJson(data);
  }
  return parseRecipeText(raw);
}

// ---------- back to text ----------

// Card text that parses back to the same recipe. Timers that aren't written in a step's
// sentence are kept as "⏱ 8 min" markers; `servings: false` leaves out the "Serves" line.
export function recipeToText(r, { servings = true } = {}) {
  const out = [r.name, ""];
  if (r.description) out.push(r.description, "");
  if (servings && r.servings) out.push(`Serves ${r.servings}`, "");
  out.push("Ingredients");
  let group = null;
  for (const ing of r.ingredients) {
    if (ing.group && ing.group !== group) { group = ing.group; out.push(`${group}:`); }
    out.push(`• ${ing.text}`);
  }
  out.push("", "Steps");
  r.steps.forEach((s, i) => {
    const inText = findTimers(s.text).map((t) => t.seconds);
    const markers = (s.timers ?? []).filter((t) => !inText.includes(t.seconds)).map((t) => ` ⏱ ${formatDurationText(t.seconds)}`);
    out.push(`${i + 1}. ${s.text}${markers.join("")}`);
  });
  if (r.notes) out.push("", "Notes", r.notes);
  return out.join("\n");
}

export function slugify(r) {
  const base = (r.romanized || r.englishName || r.name || "recipe")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return base.slice(0, 60) || "recipe";
}
