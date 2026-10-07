// Offline support. The app shell is served from cache and refreshed in the background;
// recipe data is network-first with the cache as a fallback.

// Bump this with every change to the app's files: a changed sw.js is how phones learn there's a
// new version (they then show "Recipe Box was updated · Reload").
const SHELL = "rb-shell-v10";
// Every file the app needs. A test checks this list against js/ so a missing file can't break
// offline installs.
const SHELL_FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/parser.js", "js/titles.js", "js/durations.js", "js/units.js", "js/store.js", "js/timers.js", "js/ui.js", "js/lifecycle.js", "js/cookbook.js",
  "js/views/shared.js", "js/views/recipe.js", "js/views/cook.js", "js/views/form.js", "js/views/settings.js",
  "js/views/timer-tray.js", "js/views/home.js", "js/views/chapter.js", "js/views/search.js", "js/views/sort.js",
  "js/views/tiles.js", "js/views/hero.js", "js/views/tabbar.js",
  "js/views/scale.js", "js/views/timers-tab.js", "js/views/tools.js", "js/views/shopping.js", "js/shopping.js",
  "js/tools/index.js", "js/tools/kit.js", "js/tools/salts.js", "js/tools/pasta.js", "js/tools/salt.js", "js/tools/convert.js",
  "icons/apple-touch-icon.png", "icons/icon-192.png",
];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache, so a new version caches new files, not old ones.
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map((f) => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rb-shell-") && k !== SHELL).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  if (url.pathname.includes("/recipes/")) {
    // Data: store.js keeps its own offline copy, so just go to the network.
    return;
  }

  // Shell: stale-while-revalidate.
  e.respondWith(caches.open(SHELL).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached ?? fresh;
  }));
});
