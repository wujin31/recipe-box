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
import { DEFAULT_CHAPTERS, guessChapter } from "../js/cookbook.js";

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
  files["recipes/cookbook.json"] = existsSync(join(dir, "cookbook.json"))
    ? readFileSync(join(dir, "cookbook.json"), "utf8")
    : JSON.stringify({ chapters: DEFAULT_CHAPTERS }, null, 2) + "\n";
  files["recipes/index.json"] = JSON.stringify({ version: 2, recipes: summaries.sort((a, b) => a.id.localeCompare(b.id)) }, null, 2) + "\n";
  return files;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: preview.mjs <out-dir> [--guess]");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  // No sw.js: a preview shouldn't install offline caching wherever it's hosted.
  for (const f of ["styles.css", "manifest.webmanifest", "js", "icons"]) {
    if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(out, f), { recursive: true });
  }
  if (process.argv.includes("--artifact")) {
    // For a host that wraps the page in its own <html>/<head> and sets its own security rules.
    writeFileSync(join(out, "index.html"), [
      "<title>Recipe Box Preview</title>",
      '<meta name="recipe-box-preview" content="true">',
      '<link rel="stylesheet" href="styles.css">',
      '<main id="app"></main>',
      '<script type="module" src="js/app.js"></script>',
      "",
    ].join("\n"));
  } else {
    const html = readFileSync(join(ROOT, "index.html"), "utf8").replace('<html lang="en">', '<html lang="en" data-preview="true">');
    if (!html.includes('data-preview="true"')) throw new Error("couldn't mark index.html as a preview");
    writeFileSync(join(out, "index.html"), html);
  }
  for (const [path, text] of Object.entries(snapshotFiles({ guess: process.argv.includes("--guess") }))) {
    mkdirSync(join(out, path, ".."), { recursive: true });
    writeFileSync(join(out, path), text);
  }
  console.log(`Preview written to ${out}`);
}
