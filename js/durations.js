// Times written in recipe steps: finding them ("simmer 20 minutes", "1 hr 15 min", "a minute or
// two"), telling a timer from a time that isn't one ("every 20 minutes"), saying what each timer
// is for ("Braise undisturbed"), and timers typed in by hand ("1:30").

import { NUMBER_RE, normalizeFractions, parseNumber } from "./units.js";


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

export function takeMarkers(text) {
  const timers = [];
  const clean = text.replace(MARKER_RE, (_, dur) => {
    const t = findTimers(dur)[0];
    if (t) timers.push({ text: null, seconds: t.seconds });
    return "";
  }).trim();
  return { text: clean, timers };
}

// Timers written in the text win; extra timers are kept unless the text already has that time.
export function mergeTimers(found, extra) {
  const out = [...found];
  for (const t of extra) if (!out.some((f) => f.seconds === t.seconds)) out.push(t);
  return out;
}
