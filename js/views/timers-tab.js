// The Timers tab: running timers (a recipe step's link back to its step), one-tap presets, and a
// timer of your own with a label.

import { onLeave } from "../lifecycle.js";
import { parseDuration } from "../parser.js";
import { loadLocal, saveLocal } from "../store.js";
import { addTime, cancelTimer, formatDuration, getTimers, onTimersChange, shortDuration, startTimer } from "../timers.js";
import { fill, h, iconButton } from "../ui.js";
import { timerInfo } from "./timer-tray.js";

const PRESETS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 45, 60].map((m) => m * 60);

export function viewTimers(root) {
  // The tray would repeat this page's list.
  document.body.classList.add("timers-page");
  onLeave(() => document.body.classList.remove("timers-page"));

  const running = h("div", { class: "timer-list" });
  let shape = null;
  const remaining = (t) => (t.done ? "Done!" : formatDuration((t.endsAt - Date.now()) / 1000));
  const draw = (timers) => {
    const next = timers.map((t) => `${t.id}:${t.done}:${t.endsAt}`).join("|");
    if (next === shape) { // just tick the clocks, so buttons aren't replaced under your finger
      timers.forEach((t, i) => { running.querySelectorAll(".timer strong")[i].textContent = remaining(t); });
      return;
    }
    shape = next;
    fill(running, timers.length
      ? timers.map((t) => h("div", { class: `timer ${t.done ? "done" : ""}` },
        timerInfo(t, remaining(t)),
        t.done ? null : h("button", { class: "link small", onClick: () => addTime(t.id, 60) }, "+1 min"),
        iconButton("close", t.done ? "Dismiss" : "Cancel timer", () => cancelTimer(t.id))))
      : h("p", { class: "muted" }, "No timers running. Tap a time in any recipe step, or start one here."));
  };
  onLeave(onTimersChange(draw));
  draw(getTimers());

  // A timer of your own.
  const recent = () => loadLocal("recentTimers", []);
  const time = h("input", { type: "text", inputmode: "numeric", placeholder: "Minutes, or 1:30", autocomplete: "off", "aria-label": "How long" });
  const label = h("input", { type: "text", placeholder: "What for (optional)", autocomplete: "off", maxlength: 60, "aria-label": "What it's for" });
  const hint = h("p", { class: "small warn-text", hidden: true }, "Enter minutes (like 12) or minutes:seconds (like 1:30).");
  const recentList = h("div", { class: "chips wrap" });
  const drawRecent = () => fill(recentList, recent().map((r) => h("button", {
    class: "chip", type: "button", onClick: () => startTimer(r.label || `${shortDuration(r.seconds)} timer`, r.seconds),
  }, r.label ? `${r.label} · ${shortDuration(r.seconds)}` : shortDuration(r.seconds))));
  drawRecent();

  const start = (e) => {
    e.preventDefault();
    const seconds = parseDuration(time.value);
    hint.hidden = Boolean(seconds);
    if (!seconds) return;
    const what = label.value.trim();
    startTimer(what || `${shortDuration(seconds)} timer`, seconds);
    saveLocal("recentTimers", [{ label: what, seconds }, ...recent().filter((r) => r.label !== what || r.seconds !== seconds)].slice(0, 6));
    time.value = ""; label.value = "";
    drawRecent();
  };

  root.append(
    h("h1", { class: "large-title tab-title" }, "Timers"),
    running,
    h("h2", {}, "Quick timers"),
    h("div", { class: "presets" }, PRESETS.map((s) => h("button", {
      class: "preset", type: "button", "aria-label": `Start a ${shortDuration(s)} timer`,
      onClick: () => startTimer(`${shortDuration(s)} timer`, s),
    }, s < 3600 ? h("span", {}, h("strong", {}, s / 60), " min") : h("strong", {}, "1 hr")))),
    h("h2", {}, "Your own"),
    h("form", { class: "own-timer", onSubmit: start },
      h("div", { class: "have" }, time, h("button", { class: "button primary", type: "submit" }, "Start")),
      label, hint),
    recentList);
}
