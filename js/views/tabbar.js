// The bottom tab bar: Cookbook · Search · + · Timers · Tools. Hidden in cooking mode.

import { h, icon } from "../ui.js";

const TABS = [
  ["#/", "book", "Cookbook", (p) => !p[0] || p[0] === "c" || p[0] === "r" || p[0] === "sort"],
  ["#/search", "search", "Search", (p) => p[0] === "search"],
  ["#/import", "plus", "Add recipe", (p) => p[0] === "import", "add"],
  ["#/timers", "timer", "Timers", (p) => p[0] === "timers"],
  ["#/tools", "tools", "Tools", (p) => p[0] === "tools"],
];

export function mountTabBar() {
  const bar = h("nav", { class: "tabbar", "aria-label": "Sections" });
  document.body.append(bar);
  const draw = () => {
    const parts = (location.hash.slice(1) || "/").split("?")[0].split("/").filter(Boolean);
    const hidden = parts[0] === "r" && parts[2] === "cook";
    bar.hidden = hidden;
    document.body.classList.toggle("has-tabbar", !hidden);
    bar.replaceChildren(...TABS.map(([href, name, label, active, kind]) => h("a", {
      href, class: `tab ${kind ?? ""} ${active(parts) ? "on" : ""}`, "aria-label": label,
      "aria-current": active(parts) ? "page" : null,
    }, kind === "add" ? h("span", { class: "plus" }, icon(name)) : [icon(name), h("span", { class: "tab-label" }, label)])));
  };
  window.addEventListener("hashchange", draw);
  draw();
}
