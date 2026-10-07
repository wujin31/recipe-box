// Recipe titles: Claude writes them in many shapes, and they split into the dish's own-script
// name, its romanization, an English name and (sometimes) a subtitle.

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
  // A version mark ("v3") belongs with the words before it.
  const kinds = tokens.map((t, i, all) => (/^v\d+$/i.test(t) && i ? hasNative(all[i - 1]) : hasNative(t)));
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
  // "그린빈 마늘볶음 v3 / Geurinbin Maneul-bokkeum v3": a slash between a native name and its
  // romanization, outside any parentheses, works like "·".
  const slash = title.replace(/\([^)]*\)/g, (m) => m.replace(/\//g, "\u0001")).split(/\s+\/\s+/).map((s) => s.replace(/\u0001/g, "/"));
  let left = title, right = "", kind = "";
  if (dot.length === 2) [left, right, kind] = [dot[0], dot[1], "dot"];
  else if (dash.length === 2) [left, right, kind] = [dash[0], dash[1], "dash"];
  else if (slash.length === 2 && hasNative(slash[0]) && !hasNative(slash[1])) [left, right, kind] = [slash[0], slash[1], "dot"];

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
  // "台式擔擔麵 (Taiwanese Dan Dan Mian) — all-sesame, celery version": a right side in lower case
  // is a note, not a name, so the parentheses held the English name.
  if (kind === "dash" && L.native && /^[a-z]/.test(right.trim())) {
    const english = L.english || L.romanized;
    const pinyin = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(english);
    return { nativeName: L.native, romanized: pinyin ? english : "", englishName: english, subtitle: right.trim() };
  }
  // "native side — English", "native (romanized) · English", "Bibimbap (비빔밥) · Mixed Rice",
  // "romanized · English": the right side is the English name.
  if (L.native || (kind === "dot" && !/^(with|and|in|on)\b/i.test(right))) {
    return { nativeName: L.native, romanized: L.romanized || L.english, englishName: right.trim() };
  }
  // "English — subtitle" (and "Cinnamon Rolls · With Cream Cheese Glaze").
  return { nativeName: "", romanized: "", englishName: L.english || left.trim(), subtitle: right.trim() };
}
