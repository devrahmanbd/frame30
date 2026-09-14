#!/usr/bin/env node
/** Phase 7 release gate: storefront imports, render-read contracts and admin chunks. */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const ENTRIES = [
  "src/routes/store.$slug.index.tsx",
  "src/routes/store.$slug.p.$productSlug.tsx",
  "src/routes/store.$slug.pages.$pageSlug.tsx",
  "src/routes/store.$slug.search.tsx",
];
const FORBIDDEN = ["seo-analysis", "seo-analysis.worker", "seo-weight", "cms-lint", "content-health", "seo-publish-gate", "blog-editor", "recharts", "@/components/admin"];
const READS = [
  ["src/lib/seo.server.ts", "resolveSeo"],
  ["src/lib/seo.server.ts", "loadStoreRobotsPolicy"],
  ["src/lib/seo.server.ts", "loadSitemapByKind"],
  ["src/lib/seo.server.ts", "loadStoreLlmsSummary"],
  ["src/lib/template-seo.server.ts", "loadTemplateSeoMap"],
  ["src/lib/url-lifecycle.server.ts", "loadRedirectMap"],
  ["src/lib/custom-code.server.ts", "publishedCustomCode"],
];
const ADMIN_BUDGET = {
  "src/routes/_authenticated/admin/marketing/seo.tsx": 280 * 1024,
  "src/routes/_authenticated/admin/marketing/articles.tsx": 320 * 1024,
};
const failures = [];
const warnings = [];
const source = (file) => readFileSync(join(ROOT, file), "utf8");
const imports = (text) => [...text.matchAll(/(?:^|\n)\s*(?:import\s+(?:[^'\"]*?from\s*)?|export\s+(?:\*|\{[^}]*\})\s*from\s*)["']([^"']+)["']/g)].map((m) => m[1]);

function resolveImport(specifier, from) {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return null;
  const base = specifier.startsWith("@/") ? join(ROOT, "src", specifier.slice(2)) : resolve(ROOT, dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return normalize(relative(ROOT, candidate));
  }
  return null;
}

for (const entry of ENTRIES) {
  if (!existsSync(join(ROOT, entry))) continue;
  const queue = [[entry, [entry]]];
  const seen = new Set([entry]);
  while (queue.length) {
    const [file, chain] = queue.shift();
    for (const specifier of imports(source(file))) {
      const forbidden = FORBIDDEN.find((needle) => specifier === needle || specifier.includes(`/${needle}`) || specifier.startsWith(needle));
      if (forbidden) failures.push(`${entry}: forbidden ${forbidden} via ${[...chain, specifier].join(" -> ")}`);
      const target = resolveImport(specifier, file);
      if (target && !seen.has(target) && chain.length < 24) { seen.add(target); queue.push([target, [...chain, target]]); }
    }
  }
}

function functionBody(text, name) {
  const match = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*[(<]`).exec(text);
  if (!match) return null;
  // Return types may themselves contain object braces. For this source gate the
  // declaration-to-next-export slice is safer than pretending to parse TS.
  const next = text.indexOf("\nexport ", match.index + match[0].length);
  return text.slice(match.index, next === -1 ? text.length : next);
}
for (const [file, fn] of READS) {
  const body = functionBody(source(file), fn);
  if (!body) { failures.push(`${file}: missing declared render read ${fn}`); continue; }
  if (!body.includes("renderRead(") && !body.includes("renderRead<")) failures.push(`${file}:${fn} bypasses renderRead`);
  if (!/fallback\s*:/.test(body)) failures.push(`${file}:${fn} has no deterministic fallback`);
  if (!/key\s*:/.test(body) || !body.includes("|")) failures.push(`${file}:${fn} has no tenant-segmented cache key`);
  for (const match of body.matchAll(/\.limit\(\s*([\d_]+)\s*\)/g)) if (Number(match[1].replaceAll("_", "")) > 5000) failures.push(`${file}:${fn} exceeds the 5000-row render limit`);
}

const workerImporters = ["src/hooks/use-seo-analysis.ts", "src/routes/_authenticated/admin/marketing/seo.tsx"];
for (const file of workerImporters) if (existsSync(join(ROOT, file)) && imports(source(file)).some((x) => /seo-analysis\.worker(?:\.ts)?$/.test(x))) failures.push(`${file}: analysis worker is eagerly imported`);

function findManifest(root) {
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const name of readdirSync(dir)) {
      const file = join(dir, name);
      if (name === "manifest.json") return file;
      if (statSync(file).isDirectory() && stack.length < 200) stack.push(file);
    }
  }
  return null;
}
const manifestPath = findManifest(join(ROOT, "dist"));
if (manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const assetRoot = dirname(manifestPath).endsWith(".vite") ? dirname(dirname(manifestPath)) : dirname(manifestPath);
  const gz = (name) => { const file = join(assetRoot, name); return existsSync(file) ? gzipSync(readFileSync(file)).byteLength : 0; };
  const walk = (key, seen = new Set()) => { if (!manifest[key] || seen.has(key)) return 0; seen.add(key); const item = manifest[key]; return (item.file?.endsWith(".js") ? gz(item.file) : 0) + (item.imports ?? []).reduce((n, child) => n + walk(child, seen), 0); };
  for (const [route, budget] of Object.entries(ADMIN_BUDGET)) {
    const key = Object.keys(manifest).find((item) => item === route || item.endsWith(route));
    if (!key) { warnings.push(`${route}: no manifest chunk found`); continue; }
    const bytes = walk(key);
    if (bytes > budget) failures.push(`${route}: ${(bytes / 1024).toFixed(1)}KB gz JS exceeds ${(budget / 1024).toFixed(0)}KB`);
  }
} else warnings.push("dist manifest absent; source contracts ran, admin chunk check requires a completed build");

for (const warning of warnings) console.warn(`seo-weight warning: ${warning}`);
if (failures.length) { console.error("seo-weight gate FAILED:\n" + failures.map((x) => `  • ${x}`).join("\n")); process.exit(1); }
console.log("seo-weight gate OK — storefront imports and render reads satisfy Phase 7.");