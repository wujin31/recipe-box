// The running-timers tray.

import { addTime, cancelTimer, formatDuration, getTimers, onTimersChange } from "../timers.js";
import { h, iconButton } from "../ui.js";

// ---------- timer tray ----------

export function mountTimerTray() {
  const tray = h("div", { class: "timer-tray", "aria-live": "polite" });
  document.body.append(tray);
  let shape = null;
  const remaining = (t) => (t.done ? "Done!" : formatDuration((t.endsAt - Date.now()) / 1000));
  const draw = (timers) => {
    // Only rebuild when timers are added, removed or finish; otherwise just tick the clocks,
    // so buttons aren't replaced under your finger.
    const next = timers.map((t) => `${t.id}:${t.done}:${t.endsAt}`).join("|");
    if (next === shape) {
      timers.forEach((t, i) => { tray.children[i].querySelector("strong").textContent = remaining(t); });
      return;
    }
    shape = next;
    tray.hidden = !timers.length;
    tray.replaceChildren(...timers.map((t) => h("div", { class: `timer ${t.done ? "done" : ""}` },
      h("div", { class: "timer-info" },
        h("strong", {}, remaining(t)),
        h("span", {}, t.label)),
      t.done ? null : h("button", { class: "link small", onClick: () => addTime(t.id, 60) }, "+1 min"),
      iconButton("close", t.done ? "Dismiss" : "Cancel timer", () => cancelTimer(t.id)))));
  };
  onTimersChange(draw);
  draw(getTimers());
  // Pages pad their bottom by the tray's height so nothing ends up underneath it.
  const measure = () => document.documentElement.style.setProperty("--tray-h", `${tray.hidden ? 0 : tray.offsetHeight + 12}px`);
  new ResizeObserver(measure).observe(tray);
  onTimersChange(measure);
}
