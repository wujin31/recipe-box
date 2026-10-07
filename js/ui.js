// Shared UI pieces: the h() DOM helper, icons, toasts, error messages, nav bar.

import { canWrite, getSettings, isPreview } from "./store.js";

// ---------- tiny DOM helper ----------

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === false && k in el && typeof el[k] === "boolean") { el[k] = false; continue; }
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k in el && (typeof v !== "string" || k === "value")) el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// replaceChildren/append turn null into the text "null"; skip empty slots like h() does.
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

export const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1"/>',
  cart: '<circle cx="9" cy="20" r="1.4"/><circle cx="17.5" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.5a1.5 1.5 0 0 0 1.5-1.1L21 7.5H6.2"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  pin: '<path d="M9 3h6l-1 6 4 4H6l4-4z"/><path d="M12 13v8"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/><path d="M9 7h6"/>',
  tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.8-.4-.4-2.8z"/>',
};

export const icon = (name, cls = "") =>
  h("span", { class: `icon ${cls}`, "aria-hidden": "true", html: `<svg viewBox="0 0 24 24">${ICONS[name]}</svg>` });

export const iconButton = (name, label, onClick, cls = "") =>
  h("button", { class: `icon-btn ${cls}`, "aria-label": label, title: label, onClick }, icon(name));

// A short message at the top. `action` adds a button ({ label, onClick }), e.g. Undo.
export function toast(message, kind = "", action = null) {
  document.querySelectorAll(".toast").forEach((t) => t.remove());
  const close = () => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); };
  const el = h("div", { class: `toast ${kind} ${action ? "has-action" : ""}`, role: "status" }, message,
    action ? h("button", { class: "toast-action", onClick: () => { close(); action.onClick(); } }, action.label) : null);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("show"));
  if (!action?.sticky) setTimeout(close, action ? 6000 : kind === "error" ? 5000 : 2500); // sticky waits for the tap
}

export function errorMessage(e) {
  if (e.name === "TypeError" || e.name === "AbortError") {
    return navigator.onLine === false ? "You're offline. Try again when you're connected." : "Couldn't reach GitHub. Check your connection and try again.";
  }
  if (e.status >= 500) return `GitHub is having trouble (${e.status}). Try again in a moment.`;
  if (e.readOnly || (e.status === 403 && /personal access token/i.test(e.detail ?? ""))) {
    const { owner, repo } = getSettings();
    return `The token can read but not save. On GitHub, edit the token: Repository access must include ${owner}/${repo}, and Repository permissions → Contents must be “Read and write”.`;
  }
  if (e.status === 401) return "GitHub rejected the token. Check it in Settings.";
  if (e.status === 403 || e.status === 404) return `GitHub said no (${e.status}${e.detail ? `: ${e.detail}` : ""}). Check the repo and token in Settings.`;
  return e.message || String(e);
}

export const navbar = (left, title, right) =>
  h("header", { class: "nav" }, h("div", { class: "nav-side" }, left), h("div", { class: "nav-title" }, title ?? ""), h("div", { class: "nav-side right" }, right));

export const backButton = (to = "#/") => iconButton("back", "Back", () => (location.hash = to));

// ---------- rendering helpers ----------

export const displayName = (r) => r.englishName || r.name;
// The dish's own-script name (滷肉飯, 닭죽), or "" when it only has Latin-script names.
export const nativeOf = (r) => (r.nativeName && !/^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(r.nativeName) ? r.nativeName : "");
export const subName = (r) => [r.nativeName, r.romanized].filter(Boolean).join(" · ");

export function segmented(options, value, onChange) {
  return h("div", { class: "segmented", role: "radiogroup" },
    options.map(([v, label]) => h("button", {
      role: "radio", "aria-checked": String(v === value), class: v === value ? "on" : "",
      onClick: () => onChange(v),
    }, label)));
}

export const splitTags = (s) => [...new Set(s.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];

export function normalize(s) {
  return (s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export async function copyText(text, done = "Copied") {
  try { await navigator.clipboard.writeText(text); toast(done); } catch { toast("Couldn't copy", "error"); }
}

export function requireWrite() {
  if (canWrite()) return true;
  toast(isPreview() ? "This is a read-only preview, so nothing saves." : "Connect GitHub in Settings to save changes.", "error");
  return false;
}

// The note on screens that can't work without a token.
export function notConnected(what) {
  return isPreview()
    ? h("p", { class: "card warn small" }, `This is a read-only preview, so ${what} can't be saved here.`)
    : h("p", { class: "card warn small" }, `GitHub isn't connected yet, so ${what} can't be saved. `, h("a", { href: "#/settings" }, "Open Settings"));
}
