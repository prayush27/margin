// Sanity checks run in CI: the manifest parses and every file it references exists,
// every JS module's relative imports resolve, and the bundled data is well-formed.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";

const root = join(dirname(new URL(import.meta.url).pathname), "..");
const problems = [];
const need = (path, why) => {
  if (!existsSync(join(root, path))) problems.push(`missing ${path} (${why})`);
};

// Manifest
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) problems.push("manifest_version must be 3");
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version)) problems.push(`bad version ${manifest.version}`);
Object.values(manifest.icons || {}).forEach((p) => need(p, "icon"));
Object.values(manifest.action?.default_icon || {}).forEach((p) => need(p, "action icon"));
need(manifest.action?.default_popup, "popup");
need(manifest.background?.service_worker, "service worker");
for (const cs of manifest.content_scripts || []) cs.js?.forEach((p) => need(p, "content script"));

// Relative imports in every module
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
for (const file of walk(join(root, "src")).filter((f) => /\.(m?js)$/.test(f))) {
  const code = readFileSync(file, "utf8");
  for (const [, spec] of code.matchAll(/(?:import|export)\s[^"'`]*?from\s+["'](\.{1,2}\/[^"']+)["']/g)) {
    if (!existsSync(join(dirname(file), spec))) problems.push(`${relative(root, file)} imports missing ${spec}`);
  }
  for (const [, spec] of code.matchAll(/import\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g)) {
    if (!existsSync(join(dirname(file), spec))) problems.push(`${relative(root, file)} dynamically imports missing ${spec}`);
  }
}

// HTML pages reference existing scripts and styles
for (const file of walk(join(root, "src")).filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(file, "utf8");
  for (const [, ref] of html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|mjs|css))"/g)) {
    const target = ref.startsWith("/") ? join(root, ref) : join(dirname(file), ref);
    if (!existsSync(target)) problems.push(`${relative(root, file)} references missing ${ref}`);
  }
}

// Bundled data
const books = JSON.parse(readFileSync(join(root, "data/openstax/books.json"), "utf8"));
if (!Array.isArray(books) || books.length < 10) problems.push("data/openstax/books.json looks empty");
let entries = 0;
for (const name of readdirSync(join(root, "data/openstax")).filter((n) => n !== "books.json" && n.endsWith(".json"))) {
  const shard = JSON.parse(readFileSync(join(root, "data/openstax", name), "utf8"));
  for (const [key, list] of Object.entries(shard)) {
    for (const [bi, def] of list) {
      entries++;
      if (!books[bi] || typeof def !== "string" || !def) problems.push(`bad OpenStax entry "${key}" in ${name}`);
    }
  }
}
const dads = JSON.parse(readFileSync(join(root, "data/nist-dads.json"), "utf8"));
if (Object.keys(dads).length < 500) problems.push("data/nist-dads.json looks empty");

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join("\n"));
  process.exit(1);
}
console.log(`✓ manifest v${manifest.version}, all references resolve, ${books.length} OpenStax books / ${entries} entries, ${Object.keys(dads).length} NIST terms`);
