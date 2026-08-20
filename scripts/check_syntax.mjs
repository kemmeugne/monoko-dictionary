#!/usr/bin/env node
/**
 * Parse index.html's <script type="text/babel"> block and fail on a syntax error.
 *
 * WHY THIS EXISTS
 * The frontend is a single file with no build step: the JSX is transpiled in the
 * browser by Babel standalone at load. So a stray bracket is not a build failure
 * and not a test failure — `npm test` slices individual engine sections out and
 * evaluates those, which means a syntax error anywhere in the ~4,000 lines of
 * React it does NOT slice passes every gate and ships a blank page.
 *
 * The parser is oxc, already on disk as rolldown's native binding (a vitest
 * dependency), so this adds nothing to install.
 *
 *     node scripts/check_syntax.mjs
 *
 * Exits non-zero with file:line on the first errors found.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));

let binding;
try {
  binding = require("@rolldown/binding-darwin-arm64/rolldown-binding.darwin-arm64.node");
} catch {
  // Other platforms ship a differently-named binding; resolve whichever is here.
  const { globSync } = await import("node:fs");
  const [found] = globSync("node_modules/@rolldown/binding-*/*.node", { cwd: root })
    .map((p) => join(root, p));
  if (!found) {
    console.error("check_syntax: no rolldown binding found — run `npm install` first.");
    process.exit(2);
  }
  binding = require(found);
}

const html = readFileSync(join(root, "index.html"), "utf8");
const open = html.indexOf('<script type="text/babel">');
if (open < 0) {
  console.error("check_syntax: no <script type=\"text/babel\"> block in index.html.");
  process.exit(2);
}
const start = html.indexOf(">", open) + 1;
const end = html.indexOf("</script>", start);
const code = html.slice(start, end);

// Line offset so reported lines match index.html, not the extracted block.
const offset = html.slice(0, start).split("\n").length - 1;

const { errors = [] } = binding.parseSync("index.jsx", code, { sourceType: "module", lang: "jsx" });

if (errors.length) {
  console.error(`index.html — ${errors.length} syntax error(s):\n`);
  for (const e of errors.slice(0, 20)) {
    const line = e.labels?.[0]?.start != null
      ? code.slice(0, e.labels[0].start).split("\n").length + offset
      : null;
    console.error(`  index.html${line ? `:${line}` : ""}  ${e.message || JSON.stringify(e)}`);
  }
  process.exit(1);
}

console.log(`index.html — babel block parses clean (${code.split("\n").length} lines of JSX).`);
