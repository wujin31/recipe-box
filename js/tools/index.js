// The kitchen tools. Each is { id, emoji, name, blurb, render({ recipe }) -> Element }; recipe is
// the recipe the tool was opened from (the 🧰 drawer), or null on the Tools tab.
// Adding a tool: write js/tools/<id>.js, list it here and in sw.js.

import { loadLocal, saveLocal } from "../store.js";
import { convertTool } from "./convert.js";
import { pastaTool } from "./pasta.js";
import { saltTool } from "./salt.js";

export const TOOLS = [
  { id: "pasta", emoji: "🍝", name: "Pasta water & salt", blurb: "Water and salt for any amount of pasta", render: pastaTool },
  { id: "salt", emoji: "🧂", name: "Salt %", blurb: "Dry brines, brines, ferments", render: saltTool },
  { id: "convert", emoji: "⚖️", name: "Cups ↔ grams", blurb: "Cup weights, °F/°C, gas marks", render: convertTool },
];

export const toolById = (id) => TOOLS.find((t) => t.id === id) ?? null;

// Pinned tools come first on the Tools tab and are what the 🧰 drawer shows. All start pinned.
export function pinnedIds() {
  const saved = loadLocal("pinnedTools", null);
  return Array.isArray(saved) ? saved.filter((id) => toolById(id)) : TOOLS.map((t) => t.id);
}
export function setPinned(id, on) {
  const now = pinnedIds().filter((x) => x !== id);
  saveLocal("pinnedTools", on ? [...now, id] : now);
}
