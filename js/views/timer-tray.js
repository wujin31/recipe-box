// The running-timers tray.

import { addTime, cancelTimer, formatDuration, getTimers, onTimersChange } from "../timers.js";
import { h, iconButton } from "../ui.js";

// A timer's time and what it's for; a recipe step's timer links back to its step.
export function timerInfo(t, time) {
  const text = [h("strong", {}, time), h("span", {}, [t.label, t.sub].filter(Boolean).join(" · "))];
  return t.href
    ? h("a", { class: "timer-info", href: t.href }, text)
    : h("div", { class: "timer-info" }, text);
}

// ---------- timer tray ----------

export function mountTimerTray() {
  const tray = h("div", { class: "timer-tray", "aria-live": "polite" });
  document.body.append(tray);
  let shape = null;
  const remaining = (t) => (t.done ? "Done!" : formatDuration((t.endsAt - Date.now()) / 1000));
  const SHOWN = 2; // more would cover the page; the rest are a tap away on the Timers tab
  const draw = (all) => {
    // Finished timers first, then the ones ending soonest.
    const timers = [...all].sort((a, b) => Number(b.done) - Number(a.done) || a.endsAt - b.endsAt).slice(0, SHOWN);
    const more = all.length - timers.length;
    // Only rebuild when timers are added, removed or finish; otherwise just tick the clocks,
    // so buttons aren't replaced under your finger.
    const next = `${timers.map((t) => `${t.id}:${t.done}:${t.endsAt}`).join("|")}+${more}`;
    if (next === shape) {
      timers.forEach((t, i) => { tray.children[i].querySelector("strong").textContent = remaining(t); });
      return;
    }
    shape = next;
    tray.hidden = !timers.length;
    tray.replaceChildren(...timers.map((t) => h("div", { class: `timer ${t.done ? "done" : ""}` },
      timerInfo(t, remaining(t)),
      t.done ? null : h("button", { class: "link small", onClick: () => addTime(t.id, 60) }, "+1 min"),
      iconButton("close", t.done ? "Dismiss" : "Cancel timer", () => cancelTimer(t.id)))),
    more ? h("a", { class: "timer-more", href: "#/timers" }, `+${more} more timer${more === 1 ? "" : "s"}`) : "");
  };
  onTimersChange(draw);
  draw(getTimers());
  // Pages pad their bottom by the tray's height so nothing ends up underneath it.
  const measure = () => document.documentElement.style.setProperty("--tray-h", `${tray.hidden ? 0 : tray.offsetHeight + 12}px`);
  new ResizeObserver(measure).observe(tray);
  onTimersChange(measure);
}
