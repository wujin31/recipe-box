#!/usr/bin/env node
// Rebuilds docs/screenshots.png: five iPhone-size screens side by side, from a read-only preview
// of the current recipes (with guessed chapters). Needs Playwright's Chromium.
//
//   node scripts/screenshots.mjs

import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = new URL("..", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "rb-shots-"));
execFileSync("node", [join(ROOT, "scripts/preview.mjs"), dir, "--guess"]);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  try { res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "text/html" }); res.end(readFileSync(join(dir, path === "/" ? "index.html" : path))); }
  catch { res.writeHead(404); res.end(); }
}).listen(0);
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const shots = [];
const phone = async (scheme, steps) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, colorScheme: scheme });
  await steps(page);
  await page.waitForTimeout(500);
  // The preview badge is for the read-only preview, not for pictures of the app.
  await page.evaluate(() => document.querySelector(".preview-badge")?.remove());
  shots.push((await page.screenshot()).toString("base64"));
  await page.close();
};
const go = (page, hash) => page.goto(base + hash).then(() => page.waitForTimeout(700));

await phone("light", (p) => go(p, "#/"));
await phone("light", (p) => go(p, "#/r/luroufan-stovetop-1-25-lb"));
await phone("light", async (p) => {
  await go(p, "#/r/bifu-peppa-raisu/cook?step=6");
  await p.click(".cook-timers button");
});
await phone("light", async (p) => { await go(p, "#/tools/pasta"); await p.fill('input[aria-label="Pasta"]', "450"); });
await phone("dark", (p) => go(p, "#/c/rice"));

const sheet = await browser.newPage({ viewport: { width: 5 * 300 + 6 * 18, height: 600 + 36 }, deviceScaleFactor: 1 });
await sheet.setContent(`<body style="margin:0;background:#efe9df;display:flex;gap:18px;padding:18px">${
  shots.map((b) => `<img src="data:image/png;base64,${b}" style="width:300px;height:600px;border-radius:26px;box-shadow:0 6px 20px rgb(0 0 0/.18)">`).join("")}</body>`);
await sheet.screenshot({ path: join(ROOT, "docs/screenshots.png") });
await browser.close();
server.close();
rmSync(dir, { recursive: true, force: true });
console.log("Wrote docs/screenshots.png");
