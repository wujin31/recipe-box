// Cooking mode: a gather step (everything you need, as a checklist), then one step at a time.

import { onLeave, pageSignal } from "../lifecycle.js";
import { loadLocal, saveLocal } from "../store.js";
import { keepAwake, shortDuration, startTimer } from "../timers.js";
import { backButton, fill, h, icon, iconButton, navbar } from "../ui.js";
import { formatIngredient } from "../units.js";
import { getView, ingredientChecklist, loadRecipeOr404, renderStep, timerInfo } from "./shared.js";
import { openToolDrawer } from "./tools.js";

// ---------- cooking mode ----------

export async function viewCook(root, id, query = new URLSearchParams()) {
  const r = await loadRecipeOr404(root, id);
  if (!r || !root.isConnected) return; // navigated away while loading
  if (!r.steps.length) {
    root.append(navbar(backButton(`#/r/${id}`), ""), h("div", { class: "empty" }, h("p", {}, "This recipe has no steps to cook through."), h("a", { class: "button", href: `#/r/${id}` }, "Back to the recipe")));
    return;
  }
  const { factor, units } = getView(id);
  // Step -1 is gathering the ingredients (when there are any).
  const first = r.ingredients.length ? -1 : 0;
  const last = r.steps.length - 1;
  const clamp = (n) => Math.max(first, Math.min(last, n));
  // A timer's link opens its step; otherwise pick up where you left off, unless that was more
  // than 12 hours ago.
  const resume = loadLocal(`step:${id}`, null);
  let i = first;
  if (query.get("step") != null && Number.isInteger(Number(query.get("step")))) {
    i = clamp(Number(query.get("step")));
    history.replaceState(history.state, "", `#/r/${encodeURIComponent(id)}/cook`);
  } else if (resume && Date.now() - resume.at < 12 * 3600e3) i = clamp(resume.i);
  keepAwake(true);
  onLeave(() => keepAwake(false));
  document.body.classList.add("cooking");
  onLeave(() => document.body.classList.remove("cooking"));

  const stage = h("div", { class: "cook-stage" });
  const progress = h("div", { class: "progress" }, h("div"));
  const counter = h("div", { class: "nav-title" });
  const prev = h("button", { class: "button big", onClick: () => go(i - 1) }, "Back");
  const next = h("button", { class: "button primary big", onClick: () => (i < last ? go(i + 1) : finish()) });

  root.append(
    h("header", { class: "nav cook-nav" },
      h("div", { class: "nav-side" }, iconButton("close", "Close cooking mode", () => (location.hash = `#/r/${id}`))),
      counter,
      h("div", { class: "nav-side right" }, iconButton("tools", "Kitchen tools", () => openToolDrawer(r)))),
    progress, stage,
    h("footer", { class: "cook-foot" }, prev, next));

  function go(n) {
    i = clamp(n);
    saveLocal(`step:${id}`, { i, at: Date.now() });
    draw();
    window.scrollTo(0, 0);
  }

  function finish() {
    saveLocal(`step:${id}`, null);
    location.replace(`#/r/${id}?log=1`); // Back from the recipe shouldn't land in cooking mode again
  }

  function drawGather() {
    const total = r.ingredients.length;
    const count = h("span", { class: "muted small" });
    const showCount = (checked) => {
      const got = r.ingredients.filter((ing) => checked.has(ing.text)).length;
      count.textContent = got === total ? "Everything's out ✓" : `${got} of ${total} out`;
    };
    showCount(new Set(getView(id).checked));
    fill(stage,
      h("div", { class: "gather" },
        h("div", { class: "section-head" }, h("h2", { class: "flush" }, "Get everything out"), count),
        ingredientChecklist(r, factor, units, showCount)));
  }

  function draw() {
    const steps = r.steps.length - first;
    counter.textContent = i < 0 ? "Gather" : `Step ${i + 1} of ${r.steps.length}`;
    progress.firstChild.style.width = `${((i - first + 1) / steps) * 100}%`;
    prev.disabled = i === first;
    next.textContent = i < 0 ? "Start cooking" : i === last ? "Done" : "Next";
    if (i < 0) { drawGather(); return; }
    const step = r.steps[i];
    const refs = step.ingredientRefs ?? [];
    fill(stage,
      h("p", { class: "cook-step" }, renderStep(r, i, factor, units)),
      refs.length ? h("div", { class: "cook-ings card" },
        h("h3", {}, "For this step"),
        h("ul", {}, refs.map((k) => h("li", {}, formatIngredient(r.ingredients[k], factor, units))))) : null,
      step.timers?.length ? h("div", { class: "cook-timers" }, step.timers.map((t) => {
        const info = timerInfo(r, i, t);
        return h("button", { class: "button big timer-big", onClick: () => startTimer(info, t.seconds) },
          icon("timer"), `${shortDuration(t.seconds)} · ${info.label}`);
      })) : null,
    );
  }

  // Swipe between steps.
  let x0 = null, y0 = null;
  stage.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(i + (dx < 0 ? 1 : -1));
    x0 = null;
  });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, select, textarea, dialog")) return; // typing in a tool, not turning pages
    if (e.key === "ArrowRight") go(i + 1);
    if (e.key === "ArrowLeft") go(i - 1);
  }, { signal: pageSignal() });
  draw();
}
