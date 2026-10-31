/**
 * Post-build step: computes the CSP hashes of the inline scripts.
 *
 * Next.js injects the React Server Components payload as inline scripts in
 * the prerendered HTML. A `script-src` without `'unsafe-inline'` blocks
 * them, and React never hydrates: the whole site stays on its loading
 * state.
 *
 * The inline scripts are deterministic for a given build, so the browser
 * can be told to accept exactly those, and nothing else, with a hash. The
 * hashes are computed here, after `next build`, and written next to the
 * build output; the middleware reads them and serves the CSP of the page.
 *
 * Usage: node scripts/build-csp.mjs [--dir .next]
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const dirIndex = args.indexOf("--dir");
const buildDir = resolve(dirIndex >= 0 ? args[dirIndex + 1] : ".next");

const APP_DIR = join(buildDir, "server", "app");
const OUTPUT = join(buildDir, "csp-hashes.json");
// The middleware runs on the Edge runtime and cannot read a file: the
// hashes are therefore generated as a module it imports statically.
const MODULE = resolve("src", "lib", "csp-hashes.generated.ts");

/** The inline scripts of a page: no `src` attribute. */
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

/** The route of a prerendered page, from its file name. */
function routeOf(fileName) {
  if (fileName === "index.html") return "/";
  if (fileName === "_not-found.html") return "/_not-found";
  if (fileName === "_global-error.html") return "/_global-error";
  return `/${fileName.replace(/\.html$/, "")}`;
}

/** Every prerendered page of the build. */
function prerenderedPages(dir) {
  const found = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(current, entry);
      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(full);
        continue;
      }
      // Only the top level of app/ holds the HTML of the routes; the
      // .segments directories hold the streamed variants.
      if (entry.endsWith(".html") && current === APP_DIR) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

function main() {
  const pages = prerenderedPages(APP_DIR);
  if (pages.length === 0) {
    console.error(
      `Aucun HTML prerendu dans ${APP_DIR}. La CSP a-hash ne peut pas etre calculee.`,
    );
    process.exit(1);
  }

  const manifest = {};
  for (const page of pages) {
    const html = readFileSync(page, "utf8");
    const hashes = [];
    for (const match of html.matchAll(INLINE_SCRIPT)) {
      const body = match[1];
      if (body.trim() === "") continue;
      const digest = createHash("sha256").update(body, "utf8").digest("base64");
      hashes.push(`'sha256-${digest}'`);
    }
    if (hashes.length === 0) {
      console.warn(`  ${relative(APP_DIR, page)} : aucun script inline, page sans hash.`);
      continue;
    }
    manifest[routeOf(page.split(/[\\/]/).pop())] = hashes;
  }

  const routes = Object.keys(manifest);
  writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2), "utf8");

  // The module imported by the middleware.
  const module = `/**
 * GENERATED FILE - do not edit.
 *
 * Written by scripts/build-csp.mjs after \`next build\`. It holds the
 * CSP hashes of the inline scripts of each prerendered page, so the
 * middleware can serve a strict \`script-src\` without reading a file.
 */

/** The CSP hashes of the inline scripts, by route. */
export const CSP_HASHES: Record<string, readonly string[]> = ${JSON.stringify(
    manifest,
    null,
    2,
  )};
`;
  writeFileSync(MODULE, module, "utf8");

  const total = routes.reduce((sum, route) => sum + manifest[route].length, 0);
  console.log(
    `CSP a-hash : ${routes.length} page(s), ${total} script(s) inline hache(s) -> ` +
      `${relative(process.cwd(), MODULE)}`,
  );
}

main();
