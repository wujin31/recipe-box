// Settings.

import { getSettings, setSettings, testConnection } from "../store.js";
import { backButton, errorMessage, h, navbar, segmented } from "../ui.js";

// ---------- settings ----------

export function viewSettings(root) {
  const s = getSettings();
  const field = (label, key, attrs = {}, help) => h("label", {}, label,
    h("input", { value: s[key] ?? "", autocapitalize: "off", autocomplete: "off", spellcheck: false, ...attrs, onChange: (e) => setSettings({ [key]: e.target.value.trim() }) }),
    help ? h("span", { class: "help" }, help) : null);
  const status = h("p", { class: "small" });

  root.append(
    navbar(backButton(), ""),
    h("div", { class: "form" },
      h("h1", { class: "large-title flush" }, "Settings"),

      h("h2", {}, "GitHub"),
      h("p", { class: "muted small" }, "Recipes are saved as files in your GitHub repo. The token stays on this device."),
      field("Owner", "owner"),
      field("Repository", "repo"),
      field("Branch", "branch", {}, "The branch GitHub Pages publishes from."),
      field("Token", "token", { type: "password", placeholder: "github_pat_…" },
        "Fine-grained token, only this repository, permission Contents: Read and write."),
      h("button", { class: "button", onClick: async () => {
        status.textContent = "Checking…"; status.className = "small";
        try { status.textContent = `Connected to ${await testConnection()} ✓`; status.className = "small ok-text"; }
        catch (e) { status.textContent = errorMessage(e); status.className = "small warn-text"; }
      } }, "Test connection"),
      status,

      h("h2", {}, "Units"),
      segmented([["original", "As written"], ["us", "US"], ["metric", "Metric"]], s.units, (u) => { setSettings({ units: u }); root.replaceChildren(); viewSettings(root); }),
      h("p", { class: "muted small" }, "Default for recipes you haven't changed yourself."),

      h("h2", {}, "Timers"),
      segmented([["app", "In the app"], ["clock", "iOS Clock"]], s.timerMode, (m) => { setSettings({ timerMode: m }); root.replaceChildren(); viewSettings(root); }),
      s.timerMode === "clock"
        ? [field("Shortcut name", "clockShortcut"),
          h("p", { class: "muted small" },
            "Timers go to the Clock app so they ring even with this app closed. Make a shortcut with that name in the Shortcuts app: ",
            h("b", {}, "Receive Text input → Get Numbers from Shortcut Input → Start Timer for Numbers seconds"), ".")]
        : h("p", { class: "muted small" }, "In-app timers chime while the app is open. The screen stays on in cooking mode."),
    ));
}
