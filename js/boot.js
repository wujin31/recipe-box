// Runs as a plain script in <head>, before the page draws, so it opens in the reader's colors
// instead of flashing the default ones. reading.js changes these settings later.
(function () {
  var s = {};
  try { s = JSON.parse(localStorage.getItem("rb:reading")) || {}; } catch (e) { /* storage unavailable */ }
  var root = document.documentElement;
  var media = function (q) { return !!(window.matchMedia && window.matchMedia(q).matches); };
  // First visit: dark (indigo cloth), or high contrast when the system asks for more contrast.
  root.setAttribute("data-theme", s.theme || (media("(prefers-contrast: more)") ? "contrast" : "dark"));
  if (s.text) root.setAttribute("data-text", s.text);
  if (s.motion === "reduce") root.setAttribute("data-motion", "reduce");
})();
