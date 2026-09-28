// Salt by the spoon. Brands differ a lot by volume, because of crystal shape, not saltiness:
//   Morton coarse kosher: 1/4 tsp = 1.2 g on Morton's own label -> 4.8 g per tsp.
//   Diamond Crystal kosher: 1 tbsp = 8 g on King Arthur's weight chart -> about 2.8 g per tsp.
//   Table salt (and fine sea salt): about 6 g per tsp (18 g per tbsp).
// So 1 tsp table salt is about 1 1/4 tsp Morton kosher or 2 tsp Diamond Crystal.

import { formatFraction } from "../units.js";

export const SALTS = [
  { id: "diamond", name: "Diamond Crystal kosher", gPerTsp: 2.8 },
  { id: "morton", name: "Morton kosher", gPerTsp: 4.8 },
  { id: "table", name: "Table or fine sea salt", gPerTsp: 6 },
];

// A spoon measure for a number of teaspoons: "3/4 tsp", "1 1/2 tbsp", "1/4 cup + 1 tbsp".
export function spoons(tsp) {
  if (!(tsp > 0)) return "0";
  if (tsp < 0.1) return "a pinch";
  // Measures a spoon set has: eighths under 1/2 tsp, quarters above.
  if (tsp < 3) return `${formatFraction(tsp < 0.5 ? Math.round(tsp * 8) / 8 : Math.round(tsp * 4) / 4)} tsp`;
  const tbsp = tsp / 3;
  if (tbsp < 8) { // tablespoons up to 1/2 cup, and the rest in teaspoons: "2 tbsp + 1 1/4 tsp"
    let whole = Math.floor(tbsp);
    let rest = Math.round((tsp - whole * 3) * 4) / 4;
    if (rest >= 3) { whole += 1; rest = 0; }
    return rest ? `${whole} tbsp + ${formatFraction(rest)} tsp` : `${whole} tbsp`;
  }
  const cups = tbsp / 16;
  return `${formatFraction(Math.round(cups * 8) / 8)} cup${cups > 1.06 ? "s" : ""}`;
}

// "12 g" and what that is by the spoon, per salt.
export function grams(g) {
  if (g < 0.1) return "under 0.1 g";
  return g >= 100 ? `${Math.round(g)} g` : g >= 10 ? `${Math.round(g * 2) / 2} g` : `${Math.round(g * 10) / 10} g`;
}
export const saltBySpoon = (g) => SALTS.map((s) => ({ ...s, spoons: spoons(g / s.gPerTsp) }));
