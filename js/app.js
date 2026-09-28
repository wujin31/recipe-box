// Recipe Box: router and startup.

import { h } from "./ui.js";
import { isPreview } from "./store.js";
import { leavePage, onLeave } from "./lifecycle.js";
import { mountTimerTray } from "./views/timer-tray.js";
import { viewCook } from "./views/cook.js";
import { viewEdit, viewImport } from "./views/form.js";
import { viewHome } from "./views/home.js";
import { viewChapter } from "./views/chapter.js";
import { viewSearch } from "./views/search.js";
import { viewSort } from "./views/sort.js";
import { viewTools } from "./views/placeholders.js";
import { viewTimers } from "./views/timers-tab.js";
import { mountTabBar } from "./views/tabbar.js";
import { viewRecipe } from "./views/recipe.js";
import { viewSettings } from "./views/settings.js";

// ---------- router ----------

const scrollMemo = new Map();
let lastKey = "";

async function route() {
  leavePage();

  const [path, qs] = (location.hash.slice(1) || "/").split("?");
  const query = new URLSearchParams(qs);
  const parts = path.split("/").filter(Boolean);
  // Each route renders into its own element. A view still loading when you navigate away
  // finds its element detached and stops, instead of drawing over the new page.
  const root = h("div");
  document.getElementById("app").replaceChildren(root);
  window.scrollTo(0, 0);

  const key = location.hash || "#/";
  const cameFrom = lastKey;
  lastKey = key;
  const isLibrary = !parts.length;
  if (isLibrary) onLeave(() => scrollMemo.set(key, window.scrollY));

  if (parts[0] === "r" && parts[1]) {
    let id = "";
    try { id = decodeURIComponent(parts[1]); } catch { /* malformed: shows "not found" */ }
    if (parts[2] === "cook") await viewCook(root, id, query);
    else if (parts[2] === "edit") await viewEdit(root, id);
    else await viewRecipe(root, id, query);
  } else if (parts[0] === "c" && parts[1]) await viewChapter(root, parts[1]);
  else if (parts[0] === "search") await viewSearch(root, query);
  else if (parts[0] === "sort") await viewSort(root);
  else if (parts[0] === "timers") viewTimers(root);
  else if (parts[0] === "tools") viewTools(root);
  else if (parts[0] === "import") viewImport(root, query);
  else if (parts[0] === "settings") viewSettings(root);
  else await viewHome(root);

  // Coming back from a recipe or chapter returns to where you were; the Cookbook tab starts at the top.
  if (isLibrary && root.isConnected && scrollMemo.has(key) && /^#\/[rc]\//.test(cameFrom)) window.scrollTo(0, scrollMemo.get(key));
}

// Refuse to run inside another site's frame (clickjacking); the token lives on this origin.
// The read-only preview has no token and is meant to be shown in a frame.
if (window.top !== window.self && !isPreview()) {
  document.getElementById("app").textContent = "Open Recipe Box directly, not inside another page.";
  throw new Error("framed");
}

if (isPreview()) document.body.prepend(h("div", { class: "preview-badge", role: "note" }, "Preview · read-only"));

window.addEventListener("hashchange", route);
mountTimerTray();
mountTabBar();
route();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
