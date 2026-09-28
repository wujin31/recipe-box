// Cooking mode.

import { onLeave, pageSignal } from "../lifecycle.js";
import { loadLocal, saveLocal } from "../store.js";
import { keepAwake, shortDuration, startTimer } from "../timers.js";
import { backButton, displayName, fill, h, icon, iconButton, navbar } from "../ui.js";
import { formatIngredient } from "../units.js";
import { getView, loadRecipeOr404, renderStep } from "./shared.js";

// ---------- cooking mode ----------

export async function viewCook(root, id) {
  const r = await loadRecipeOr404(root, id);
  if (!r || !root.isConnected) return; // navigated away while loading
  if (!r.steps.length) {
    root.append(navbar(backButton(`#/r/${id}`), ""), h("div", { class: "empty" }, h("p", {}, "This recipe has no steps to cook through."), h("a", { class: "button", href: `#/r/${id}` }, "Back to the recipe")));
    return;
  }
  const { factor, units } = getView(id);
  // Pick up where you left off, unless that was more than 12 hours ago.
  const resume = loadLocal(`step:${id}`, null);
  let i = resume && Date.now() - resume.at < 12 * 3600e3 ? Math.min(resume.i, r.steps.length - 1) : 0;
  keepAwake(true);
  onLeave(() => keepAwake(false));
  document.body.classList.add("cooking");
  onLeave(() => document.body.classList.remove("cooking"));

  const stage = h("div", { class: "cook-stage" });
  const progress = h("div", { class: "progress" }, h("div"));
  const counter = h("div", { class: "nav-title" });
  const prev = h("button", { class: "button big", onClick: () => go(i - 1) }, "Back");
  const next = h("button", { class: "button primary big", onClick: () => (i < r.steps.length - 1 ? go(i + 1) : finish()) });

  root.append(
    h("header", { class: "nav cook-nav" },
      h("div", { class: "nav-side" }, iconButton("close", "Close cooking mode", () => (location.hash = `#/r/${id}`))),
      counter,
      h("div", { class: "nav-side right" })),
    progress, stage,
    h("footer", { class: "cook-foot" }, prev, next));

  function go(n) {
    i = Math.max(0, Math.min(r.steps.length - 1, n));
    saveLocal(`step:${id}`, { i, at: Date.now() });
    draw();
    window.scrollTo(0, 0);
  }

  function finish() {
    saveLocal(`step:${id}`, null);
    location.replace(`#/r/${id}?log=1`); // Back from the recipe shouldn't land in cooking mode again
  }

  function draw() {
    const step = r.steps[i];
    counter.textContent = `Step ${i + 1} of ${r.steps.length}`;
    progress.firstChild.style.width = `${((i + 1) / r.steps.length) * 100}%`;
    prev.disabled = i === 0;
    next.textContent = i === r.steps.length - 1 ? "Done" : "Next";
    const refs = step.ingredientRefs ?? [];
    fill(stage,
      h("p", { class: "cook-step" }, renderStep(step, r, factor, units, `${displayName(r)} · step ${i + 1}`)),
      refs.length ? h("div", { class: "cook-ings card" },
        h("h3", {}, "For this step"),
        h("ul", {}, refs.map((k) => h("li", {}, formatIngredient(r.ingredients[k], factor, units))))) : null,
      step.timers?.length ? h("div", { class: "cook-timers" }, step.timers.map((t) =>
        h("button", { class: "button big timer-big", onClick: () => startTimer(`${displayName(r)} · step ${i + 1}`, t.seconds) },
          icon("timer"), `Start ${shortDuration(t.seconds)}`))) : null,
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
    if (e.key === "ArrowRight") go(i + 1);
    if (e.key === "ArrowLeft") go(i - 1);
  }, { signal: pageSignal() });
  draw();
}
