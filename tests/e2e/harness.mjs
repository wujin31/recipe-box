// Browser test harness: serves the app, fakes the GitHub API with an in-memory git repo, and
// opens an iPhone-sized page. Each call to startApp() gets a fresh repo, so test files are
// independent. The library is seeded from tests/fixtures, never from the live recipes/ folder.
//
//   const app = await startApp();
//   await app.page.goto(app.base);
//   app.repo.files()             current files on the fake branch
//   app.repo.commitFromElsewhere({ path: text })   simulate another device saving
//   app.repo.dropNextPatchReply = true             lose the reply to the next branch update
//   await app.close();

import { chromium } from "playwright";
import http from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FIXTURES = join(ROOT, "tests/fixtures");
export const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");

const { parseRecipeInput } = await import(join(ROOT, "js/parser.js"));
const { summarize } = await import(join(ROOT, "js/store.js"));

// The seed library: real cards from tests/fixtures.
export const SEED = [
  { file: "khao-mok-kai.txt", servings: 4, tags: ["thai", "rice-cooker", "chicken", "dinner"] },
  { file: "vodka-penne.txt", servings: 4, tags: [] },
  { file: "dak-juk.txt", tags: ["zojirushi"] },
  { file: "mu-bap.txt", tags: ["zojirushi"] },
];

export function seedFiles(seed = SEED) {
  const files = {};
  const summaries = [];
  seed.forEach((s, i) => {
    const parsed = parseRecipeInput(fixture(s.file));
    const id = s.id ?? s.file.replace(/\.txt$/, "").replace("vodka-penne", "creamy-spicy-vodka-penne-with-hot-italian-sausage");
    const at = new Date(Date.UTC(2026, 8, 20 + i)).toISOString();
    const r = { id, ...parsed, servings: s.servings ?? parsed.servings ?? null, tags: s.tags ?? [], chatUrl: null, favorite: false, log: [], createdAt: at, updatedAt: at, ...(s.extra ?? {}) };
    files[`recipes/${id}/recipe.json`] = JSON.stringify(r, null, 2) + "\n";
    files[`recipes/${id}/source.txt`] = fixture(s.file).trim() + "\n";
    summaries.push(summarize(r));
  });
  files["recipes/index.json"] = JSON.stringify({ version: 2, recipes: summaries.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + "\n";
  return files;
}

// ---------- fake GitHub ----------

class FakeRepo {
  constructor(files) {
    this.n = 0;
    this.trees = { t0: files };
    this.commits = { c0: { sha: "c0", tree: { sha: "t0" }, parents: [] } };
    this.head = "c0";
    this.calls = [];
    this.dropNextPatchReply = false;
  }
  // Files at a commit or at "main"; null for anything else (e.g. a misspelled branch).
  files(ref = "main") {
    const commit = this.commits[ref === "main" ? this.head : ref];
    return commit ? this.trees[commit.tree.sha] : null;
  }
  json(path) { const f = this.files()[path]; return f == null ? null : JSON.parse(f); }
  commitFromElsewhere(changes) {
    const tree = `t${++this.n}`, sha = `c${++this.n}`;
    this.trees[tree] = { ...this.files(), ...changes };
    this.commits[sha] = { sha, tree: { sha: tree }, parents: [this.head] };
    this.head = sha;
  }

  async handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/repos\/me\/recipes/, "");
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    const auth = req.headers().authorization;
    const reply = (status, data, raw = false) => route.fulfill({
      status,
      headers: { "access-control-allow-origin": "*", "content-type": raw ? "text/plain" : "application/json" },
      body: raw ? data : JSON.stringify(data),
    });
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    }
    if (auth === "Bearer read-token" && req.method() !== "GET") return reply(403, { message: "Resource not accessible by personal access token" });
    if (auth !== "Bearer test-token" && auth !== "Bearer read-token") return reply(401, { message: "Bad credentials" });
    this.calls.push(`${req.method()} ${path}`);

    if (path === "") return reply(200, { full_name: "me/recipes", permissions: { push: true } });
    if (path === "/git/ref/heads/main") return reply(200, { object: { sha: this.head } });
    let m;
    if ((m = path.match(/^\/git\/commits\/(\w+)$/))) return reply(200, this.commits[m[1]]);
    if ((m = path.match(/^\/contents\/(.+)$/))) {
      const f = this.files(url.searchParams.get("ref"))?.[decodeURIComponent(m[1])];
      return f == null ? reply(404, { message: "Not Found" }) : reply(200, f, true);
    }
    if (path === "/git/blobs") return reply(201, { sha: `blob${++this.n}` });
    if (path === "/git/trees") {
      const next = { ...this.trees[body.base_tree] };
      for (const e of body.tree) {
        if (e.sha === null) {
          if (!(e.path in next)) return reply(422, { message: "no such path" });
          delete next[e.path];
        } else next[e.path] = e.content;
      }
      const id = `t${++this.n}`;
      this.trees[id] = next;
      return reply(201, { sha: id });
    }
    if (path === "/git/commits") {
      const id = `c${++this.n}`;
      this.commits[id] = { sha: id, tree: { sha: body.tree }, parents: body.parents, message: body.message };
      return reply(201, { sha: id });
    }
    if (path === "/git/refs/heads/main") {
      if (this.commits[body.sha].parents[0] !== this.head) return reply(422, { message: "not fast-forward" });
      this.head = body.sha;
      if (this.dropNextPatchReply) { this.dropNextPatchReply = false; return route.abort("connectionreset"); }
      return reply(200, { object: { sha: this.head } });
    }
    return reply(404, { message: `unhandled ${path}` });
  }
}

// ---------- static server ----------

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };

function serve() {
  const server = http.createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---------- app ----------

// Console noise that tests cause on purpose (bad tokens, dropped connections).
const EXPECTED = /status of 40[134]|ERR_CONNECTION_RESET/;

export async function startApp({ seed = SEED, files = null, viewport = { width: 393, height: 852 }, colorScheme = "light" } = {}) {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const repo = new FakeRepo(files ?? seedFiles(seed));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("https://api.github.com/**", (r) => repo.handle(r));
  // The Pages copy of recipes/ is whatever the fake repo holds now.
  await ctx.route(`${base}recipes/**`, (route) => {
    const path = new URL(route.request().url()).pathname.slice(1);
    const f = repo.files()[path];
    return f == null ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ status: 200, contentType: "application/json", body: f });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if ((m.type() === "error" || /Content Security Policy/i.test(m.text())) && !EXPECTED.test(m.text())) errors.push(m.text());
  });

  const app = {
    base, page, ctx, repo, errors,
    async goto(hash = "") { await page.goto(base + hash); },
    async clipboard(text) { await page.evaluate((t) => navigator.clipboard.writeText(t), text); },
    async readClipboard() { return page.evaluate(() => navigator.clipboard.readText()); },
    async shot(name) {
      if (process.env.SHOTS) await page.screenshot({ path: join(process.env.SHOTS, `${name}.png`) });
    },
    // Settings → GitHub, with the fake repo's owner/repo and the given token.
    async connect(token = "test-token") {
      await page.goto(`${base}#/settings`);
      for (const [label, value] of [["Owner", "me"], ["Repository", "recipes"], ["Token", token]]) {
        await page.fill(`label:has-text("${label}") input`, value);
        await page.press(`label:has-text("${label}") input`, "Tab");
      }
    },
    assertNoErrors() { assert.deepEqual(errors, [], "no console errors"); },
    async close() { await browser.close(); server.close(); },
  };
  return app;
}
