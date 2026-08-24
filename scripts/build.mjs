#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { transform } from "esbuild";

const DIST = "dist";
const BABEL_CDN = /\s*<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/babel-standalone\/[^"]+"><\/script>/;
const JSX_BLOCK = /\s*<script type="text\/babel">([\s\S]*?)<\/script>/;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

async function compilePage(htmlFile, bundleFile) {
  const html = readFileSync(htmlFile, "utf8");
  const match = html.match(JSX_BLOCK);
  if (!match) throw new Error(`${htmlFile} has no text/babel block`);

  const compiled = await transform(match[1], {
    loader: "jsx",
    target: "es2020",
    minify: true,
    legalComments: "none",
    sourcefile: htmlFile,
  });
  const builtHtml = html
    .replace(BABEL_CDN, "")
    .replace(JSX_BLOCK, `\n  <script src="/${bundleFile}" defer></script>`);

  writeFileSync(`${DIST}/${htmlFile}`, builtHtml);
  writeFileSync(`${DIST}/${bundleFile}`, compiled.code);
  return { source: match[1].length, output: compiled.code.length };
}

const app = await compilePage("index.html", "app.js");
const admin = await compilePage("admin.html", "admin.js");

for (const file of ["monoko-ui.css", "course-trail-meta.js"]) cpSync(file, `${DIST}/${file}`);
cpSync("assets", `${DIST}/assets`, { recursive: true });

console.log(`Built ${DIST}/: app ${app.source} -> ${app.output} bytes; admin ${admin.source} -> ${admin.output} bytes; browser Babel removed.`);
