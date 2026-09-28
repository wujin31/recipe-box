// The service worker's offline file list must match the app's files: a missing entry means the
// app breaks offline, and a stale one (a deleted file) makes the whole offline install fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const listed = JSON.parse(readFileSync(join(ROOT, "sw.js"), "utf8").match(/const SHELL_FILES = (\[[\s\S]*?\]);/)[1].replace(/,\s*\]/, "]"));

function jsFiles(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? jsFiles(join(dir, d.name)) : d.name.endsWith(".js") ? [join(dir, d.name)] : []);
}

test("every listed shell file exists", () => {
  for (const f of listed.filter((f) => f !== "./")) assert.ok(existsSync(join(ROOT, f)), `sw.js lists missing ${f}`);
});

test("every app module is in the shell list", () => {
  for (const f of jsFiles("js").map((f) => relative(ROOT, join(ROOT, f)))) assert.ok(listed.includes(f), `sw.js doesn't list ${f}`);
});
