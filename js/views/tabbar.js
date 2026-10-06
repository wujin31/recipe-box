// The bottom tab bar: Cookbook · Search · + · Timers · Tools. Hidden in cooking mode.

import { getTimers, onTimersChange } from "../timers.js";
import { h, icon } from "../ui.js";

const TABS = [
  ["#/", "book", "Cookbook", (p) => !p[0] || p[0] === "c" || p[0] === "r" || p[0] === "sort" || p[0] === "list"],
  ["#/search", "search", "Search", (p) => p[0] === "search"],
  ["#/import", "plus", "Add recipe", (p) => p[0] === "import", "add"],
  ["#/timers", "timer", "Timers", (p) => p[0] === "timers"],
  ["#/tools", "tools", "Tools", (p) => p[0] === "tools"],
];

export function mountTabBar() {
  const bar = h("nav", { class: "tabbar", "aria-label": "Sections" });
  document.body.append(bar);
  // Running timers, as a count on the Timers tab.
  const running = () => getTimers().filter((t) => !t.done).length;
  let count = running();
  const draw = () => {
    const parts = (location.hash.slice(1) || "/").split("?")[0].split("/").filter(Boolean);
    const hidden = parts[0] === "r" && parts[2] === "cook";
    bar.hidden = hidden;
    document.body.classList.toggle("has-tabbar", !hidden);
    bar.replaceChildren(...TABS.map(([href, name, label, active, kind]) => {
      const badge = href === "#/timers" && count ? h("span", { class: "badge" }, count) : null;
      return h("a", {
        href, class: `tab ${kind ?? ""} ${active(parts) ? "on" : ""}`,
        "aria-label": badge ? `${label}, ${count} running` : label,
        "aria-current": active(parts) ? "page" : null,
      }, kind === "add" ? h("span", { class: "plus" }, icon(name)) : [h("span", { class: "tab-icon" }, icon(name), badge), h("span", { class: "tab-label" }, label)]);
    }));
  };
  window.addEventListener("hashchange", draw);
  onTimersChange(() => { if (running() !== count) { count = running(); draw(); } });
  draw();
}
