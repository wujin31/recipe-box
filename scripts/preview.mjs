#!/usr/bin/env node
// Builds a read-only preview of the app: the app files plus a snapshot of recipes/, re-parsed
// with the current rules and (with --guess) each unsorted recipe given its guessed chapter.
//
//   node scripts/preview.mjs out/preview --guess
//
// The preview has no token, so it only reads; nothing in the real repo changes.

import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { refreshRecipe } from "../js/parser.js";
import { summarize } from "../js/store.js";
import { guessChapter } from "../js/cookbook.js";

const ROOT = new URL("..", import.meta.url).pathname;

// recipes/ as a { path: text } map, optionally with guessed chapters.
export function snapshotFiles({ guess = false } = {}) {
  const files = {};
  const summaries = [];
  const dir = join(ROOT, "recipes");
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || !existsSync(join(dir, d.name, "recipe.json"))) continue;
    let r = refreshRecipe(JSON.parse(readFileSync(join(dir, d.name, "recipe.json"), "utf8")));
    if (guess && !r.chapter) r = { ...r, chapter: guessChapter(r) ?? undefined };
    files[`recipes/${d.name}/recipe.json`] = JSON.stringify(r, null, 2) + "\n";
    if (existsSync(join(dir, d.name, "source.txt"))) files[`recipes/${d.name}/source.txt`] = readFileSync(join(dir, d.name, "source.txt"), "utf8");
    summaries.push(summarize(r));
  }
  files["recipes/index.json"] = JSON.stringify({ version: 2, recipes: summaries.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + "\n";
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: preview.mjs <out-dir> [--guess]");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const f of ["index.html", "styles.css", "manifest.webmanifest", "sw.js", ".nojekyll", "js", "icons"]) {
    if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(out, f), { recursive: true });
  }
  for (const [path, text] of Object.entries(snapshotFiles({ guess: process.argv.includes("--guess") }))) {
    mkdirSync(join(out, path, ".."), { recursive: true });
    writeFileSync(join(out, path), text);
  }
  console.log(`Preview written to ${out}`);
}
