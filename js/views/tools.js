// The Tools tab (#/tools), one tool full-page (#/tools/<id>), and the 🧰 drawer that opens tools
// over a recipe or cooking mode, where they can use that recipe's amounts.

import { TOOLS, pinnedIds, setPinned, toolById } from "../tools/index.js";
import { backButton, fill, h, icon, navbar, openSheet } from "../ui.js";

export function viewTools(root, id) {
  if (id) {
    const tool = toolById(id);
    root.append(navbar(backButton("#/tools"), ""));
    root.append(tool
      ? h("div", { class: "tool-page" }, h("h1", { class: "large-title" }, `${tool.emoji} ${tool.name}`), tool.render({ recipe: null }))
      : h("div", { class: "empty" }, h("p", {}, "No such tool."), h("a", { class: "button", href: "#/tools" }, "All tools")));
    return;
  }
  const list = h("div", { class: "tool-list" });
  const draw = () => {
    const pinned = pinnedIds();
    const order = [...TOOLS].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));
    fill(list, order.map((t) => {
      const on = pinned.includes(t.id);
      return h("div", { class: "tool-row card" },
        h("a", { class: "tool-open", href: `#/tools/${t.id}` },
          h("span", { class: "tool-emoji", "aria-hidden": "true" }, t.emoji),
          h("span", { class: "tool-text" }, h("strong", {}, t.name), h("span", { class: "muted small" }, t.blurb))),
        h("button", {
          class: `pin ${on ? "on" : ""}`, "aria-pressed": String(on), "aria-label": `${on ? "Unpin" : "Pin"} ${t.name}`,
          title: on ? "In the 🧰 drawer" : "Not in the 🧰 drawer",
          onClick: () => { setPinned(t.id, !on); draw(); },
        }, icon("pin")));
    }));
  };
  draw();
  root.append(
    h("h1", { class: "large-title tab-title" }, "Tools"),
    h("p", { class: "muted small" }, "Pinned tools are in the 🧰 drawer on every recipe and in cooking mode, where they use that recipe's amounts."),
    list);
}

// The 🧰 drawer: the pinned tools (all of them if none are pinned), then the chosen tool.
export function openToolDrawer(recipe) {
  const body = h("div", { class: "drawer-body" });
  const back = h("button", { type: "button", class: "link", onClick: () => showList() }, "Tools");
  const { dialog, close, title } = openSheet({ title: "Kitchen tools", left: back, body, cls: "drawer" });

  function showList() {
    title.textContent = "Kitchen tools";
    back.hidden = true;
    const pinned = pinnedIds();
    const tools = pinned.length ? pinned.map(toolById) : TOOLS;
    fill(body,
      pinned.length ? null : h("p", { class: "muted small" }, "Nothing's pinned, so here's every tool. Pin favorites on the Tools tab."),
      tools.map((t) => h("button", { type: "button", class: "tool-row card", onClick: () => showTool(t) },
        h("span", { class: "tool-emoji", "aria-hidden": "true" }, t.emoji),
        h("span", { class: "tool-text" }, h("strong", {}, t.name), h("span", { class: "muted small" }, t.blurb)))),
      h("a", { class: "link small", href: "#/tools", onClick: close }, "All tools and pinning"));
    title.focus(); // the tapped button is gone; keep focus in the drawer
  }
  function showTool(t) {
    title.textContent = t.name;
    back.hidden = false;
    fill(body, t.render({ recipe }));
    body.scrollTop = 0;
    title.focus();
  }
  showList();
  return dialog;
}
