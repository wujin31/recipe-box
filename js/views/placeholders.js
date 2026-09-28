// The Tools tab. A placeholder until phase 3 fills it in.

import { h } from "../ui.js";

export function viewTools(root) {
  const tools = [
    ["🍝", "Pasta water & salt"], ["🧂", "Salt %"], ["⚖️", "Cups ↔ grams"],
  ];
  root.append(
    h("h1", { class: "large-title tab-title" }, "Tools"),
    h("p", { class: "muted" }, "Small kitchen utilities are coming here soon:"),
    h("div", { class: "tools-grid" }, tools.map(([e, n]) => h("div", { class: "tool card" }, h("span", { class: "tool-emoji" }, e), h("strong", {}, n)))));
}
