// Timers and Tools tabs. Placeholders until phases 2 and 3 fill them in.

import { getTimers, formatDuration } from "../timers.js";
import { onLeave } from "../lifecycle.js";
import { fill, h } from "../ui.js";

export function viewTimers(root) {
  const list = h("div");
  const draw = () => {
    const running = getTimers();
    fill(list, running.length
      ? h("ul", { class: "plain-list" }, running.map((t) => h("li", { class: "card" },
        h("strong", {}, t.done ? "Done!" : formatDuration((t.endsAt - Date.now()) / 1000)), " ", h("span", { class: "muted" }, t.label))))
      : h("p", { class: "muted" }, "No timers running. Start one from any step in a recipe."));
  };
  draw();
  const tick = setInterval(draw, 1000);
  onLeave(() => clearInterval(tick));
  root.append(
    h("h1", { class: "large-title tab-title" }, "Timers"),
    list,
    h("p", { class: "muted small pad" }, "Kitchen timers of your own, with presets, are coming here soon."));
}

export function viewTools(root) {
  const tools = [
    ["🍝", "Pasta water & salt"], ["🧂", "Salt %"], ["⚖️", "Cups ↔ grams"],
  ];
  root.append(
    h("h1", { class: "large-title tab-title" }, "Tools"),
    h("p", { class: "muted" }, "Small kitchen utilities are coming here soon:"),
    h("div", { class: "tools-grid" }, tools.map(([e, n]) => h("div", { class: "tool card" }, h("span", { class: "tool-emoji" }, e), h("strong", {}, n)))));
}
