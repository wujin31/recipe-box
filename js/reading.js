// Reading settings: color theme, text size and motion. Kept on this device; boot.js applies them
// before the first paint, and this module changes them while the app runs.

import { loadLocal, saveLocal } from "./store.js";

export const THEMES = [["dark", "Dark"], ["light", "Light"], ["contrast", "High contrast"], ["calm", "Calm"]];
export const TEXT_SIZES = [["default", "Default"], ["large", "Large"], ["larger", "Larger"]];

const reducedBySystem = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function getReading() {
  const s = loadLocal("reading", {});
  const root = document.documentElement;
  return {
    theme: s.theme || root.dataset.theme || "dark",
    text: s.text || "default",
    // Until the reader chooses, motion follows the system setting.
    motion: s.motion || (reducedBySystem() ? "reduce" : "full"),
  };
}

export function setReading(patch) {
  const next = { ...loadLocal("reading", {}), ...patch };
  saveLocal("reading", next);
  applyReading();
}

export function applyReading() {
  const { theme, text, motion } = getReading();
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (text === "default") delete root.dataset.text; else root.dataset.text = text;
  if (motion === "reduce") root.dataset.motion = "reduce"; else delete root.dataset.motion;
  // The status bar and browser chrome take the page's ground color.
  const ground = getComputedStyle(root).getPropertyValue("--surface").trim();
  if (ground) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", ground);
}
