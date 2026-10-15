#!/usr/bin/env node
/**
 * Build a reviewed developer-theme bundle (Level B).
 *
 *   node scripts/build-dev-theme.mjs --src <theme-dir> --out <dir>
 *     [--vendor-dir <dir>] [--allow-host <host>]... [--allow-hosts a,b]
 *
 * Stages (fail closed — any refusal exits non-zero and writes nothing):
 *   1. Read `<src>/dev.theme.json` + every file under `<src>` (symlinks are
 *      never followed; a symlinked entry is passed through as a symlink
 *      marker so the bundle gate refuses it with `bundle.symlink`).
 *   2. Validate the manifest (`parseDevThemeManifest`) and the bundle
 *      (`validateDevThemeBundle`: executable allowlist, no server code /
 *      secrets, dep pins incl. integrity shape, traversal / symlink /
 *      oversize, unknown capabilities) — reused from
 *      `src/lib/dev-theme-manifest.ts` / `src/lib/dev-theme-bundle.ts` via
 *      `src/lib/dev-theme-bundle-assemble.ts`, never reimplemented here.
 *   3. When `--vendor-dir` is given, verify every manifest dependency pin
 *      against the pre-vendored bytes in that directory (digest comparison
 *      only). The directory is an INPUT: nothing is ever fetched.
 *   4. Write deterministic outputs to `<out>`: root files verbatim,
 *      area files as `name.<sha8>.<ext>` (sha8 = first 8 hex of sha256),
 *      plus `release.json` = the exact `{manifest, files, fingerprint}`
 *      shape `fingerprintDevThemeRelease` hashes. Entries sort by path;
 *      no timestamps appear in any hashed content.
 *
 * Exit codes: 0 built; 1 validation/build failure (reasons on stderr);
 * 2 usage error.
 *
 * What this pipeline does NOT do: registry writes, review transitions
 * (submit/review/publish live in `dev-theme-review.ts`), activation or
 * rendering, network fetch of any kind, or timestamp/version stamping.
 *
 * Plain-`node` note: the reused gates are TypeScript. Type stripping is on
 * by default in this runtime, but extensionless relative imports
 * (`./custom-code`) need a resolver shim, registered below from a data URL
 * (no new files, no dependencies) before the first TS import.
 */
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { register } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const ASSEMBLE_URL = new URL(
  "../src/lib/dev-theme-bundle-assemble.ts",
  import.meta.url,
).href;
const BUNDLE_URL = new URL("../src/lib/dev-theme-bundle.ts", import.meta.url)
  .href;

function usage() {
  return [
    "usage: node scripts/build-dev-theme.mjs --src <theme-dir> --out <dir>",
    "       [--vendor-dir <dir>] [--allow-host <host>]... [--allow-hosts a,b]",
    "",
    "Builds a deterministic, content-hashed Level B theme bundle.",
    "See the file header for stages, exit codes, and explicit non-goals.",
  ].join("\n");
}

function failUsage(message) {
  console.error(`build-dev-theme: ${message}\n${usage()}`);
  process.exit(2);
}

function failBuild(reasons) {
  console.error("build-dev-theme: FAILED — no files written.");
  for (const reason of reasons.slice(0, 20)) console.error(`  • ${reason}`);
  if (reasons.length > 20) console.error(`  … +${reasons.length - 20} more`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { src: null, out: null, vendorDir: null, allowHosts: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--src" || arg === "--out" || arg === "--vendor-dir") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) failUsage(`${arg} needs a value.`);
      i++;
      if (arg === "--src") out.src = value;
      else if (arg === "--out") out.out = value;
      else out.vendorDir = value;
    } else if (arg === "--allow-host") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--"))
        failUsage("--allow-host needs a value.");
      i++;
      out.allowHosts.push(value);
    } else if (arg === "--allow-hosts") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--"))
        failUsage("--allow-hosts needs a value.");
      i++;
      for (const host of value.split(",")) {
        const trimmed = host.trim();
        if (trimmed) out.allowHosts.push(trimmed);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      failUsage(`unknown argument: ${arg}`);
    }
  }
  if (!out.src) failUsage("--src <theme-dir> is required.");
  if (!out.out) failUsage("--out <dir> is required.");
  return out;
}

/**
 * Mirror of the bundle gate's path posture (authoritative check stays in
 * `validateDevThemeBundle`; this only guards the ingest walk itself).
 */
function isUnsafeRel(rel) {
  if (!rel || rel.includes("\0") || rel.includes("\\")) return true;
  if (/^[A-Za-z]:/.test(rel)) return true;
  if (rel.startsWith("/") || rel.startsWith("~")) return true;
  for (const seg of rel.split("/")) {
    if (seg === "" || seg === "." || seg === ".." || seg === "__MACOSX")
      return true;
  }
  return false;
}

/**
 * Collect every entry under root without following symlinks. Symlinked
 * entries keep a marker so the bundle gate refuses them (`bundle.symlink`)
 * instead of the walk resolving attacker-chosen targets.
 */
function collectEntries(root) {
  const entries = [];
  const stack = [];
  for (const name of readdirSync(root)) stack.push(name);
  while (stack.length > 0) {
    const rel = stack.pop();
    const abs = join(root, rel);
    const st = lstatSync(abs);
    const posix = rel.split(sep).join("/");
    if (st.isSymbolicLink()) {
      entries.push({
        rel: posix,
        abs,
        symlink: true,
        bytes: new Uint8Array(0),
      });
      continue;
    }
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) stack.push(`${rel}/${name}`);
      continue;
    }
    if (!st.isFile()) continue;
    entries.push({ rel: posix, abs, symlink: false, bytes: null });
  }
  return entries;
}

function isDir(path) {
  try {
    return lstatSync(path).isDirectory() && !lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith("/"));
}

// The extensionless-import shim: try the normal resolver first, then fall
// back to explicit TypeScript extensions for relative specifiers.
register(
  "data:text/javascript,export async function resolve(spec, ctx, next){ try { return await next(spec, ctx); } catch (err) { if (typeof spec === 'string' && (spec.startsWith('./') || spec.startsWith('../'))) { const { existsSync } = await import('node:fs'); const target = new URL(spec, ctx.parentURL).pathname; for (const cand of [target + '.ts', target + '.tsx', target + '/index.ts']) { if (existsSync(cand)) return { url: 'file://' + cand, shortCircuit: true }; } } throw err; } }",
  import.meta.url,
);

const args = parseArgs(process.argv.slice(2));
const srcDir = resolve(args.src);
const outDir = resolve(args.out);
const vendorDir = args.vendorDir ? resolve(args.vendorDir) : null;

if (!isDir(srcDir)) failUsage(`--src is not a directory: ${args.src}`);
if (vendorDir !== null && !isDir(vendorDir)) {
  failUsage(`--vendor-dir is not a directory: ${args.vendorDir}`);
}
if (inside(srcDir, outDir) || inside(outDir, srcDir)) {
  failUsage("--out must not equal or overlap --src.");
}
if (
  vendorDir !== null &&
  (inside(vendorDir, outDir) || inside(outDir, vendorDir))
) {
  failUsage("--out must not equal or overlap --vendor-dir.");
}

const { assembleDevThemeBundle } = await import(ASSEMBLE_URL); // sast-allow: dynamic-import -- ASSEMBLE_URL is a fixed relative module URL (same-dir lib file), not user input
const { fingerprintDevThemeRelease } = await import(BUNDLE_URL); // sast-allow: dynamic-import -- BUNDLE_URL is a fixed relative module URL (same-dir lib file), not user input

// --- ingest: every file under --src becomes a bundle entry. ---
const walked = collectEntries(srcDir);
const manifestEntry = walked.find((e) => e.rel === "dev.theme.json");
let manifestJson;
if (!manifestEntry || manifestEntry.symlink) {
  manifestJson = undefined;
} else {
  let raw;
  try {
    raw = readFileSync(manifestEntry.abs, "utf8");
  } catch (err) {
    failBuild([`build.read:dev.theme.json:${err.message.slice(0, 120)}`]);
  }
  try {
    manifestJson = JSON.parse(raw);
  } catch (err) {
    failBuild([
      `manifest: dev.theme.json is not valid JSON (${err.message.slice(0, 120)})`,
    ]);
  }
}

const files = [];
for (const entry of walked) {
  if (isUnsafeRel(entry.rel)) {
    // Keep the claimed path so the gate reports `bundle.unsafe_path`
    // instead of the walk silently dropping it.
    files.push({
      path: entry.rel,
      bytes: new Uint8Array(0),
      symlink: entry.symlink ? true : undefined,
    });
    continue;
  }
  if (entry.symlink) {
    files.push({ path: entry.rel, bytes: entry.bytes, symlink: true });
    continue;
  }
  let bytes;
  try {
    bytes = new Uint8Array(readFileSync(entry.abs));
  } catch (err) {
    failBuild([
      `build.read:${entry.rel.slice(0, 80)}:${err.message.slice(0, 120)}`,
    ]);
  }
  files.push({ path: entry.rel, bytes });
}

// --- vendor input (optional): pre-vendored bytes + optional pins. ---
let vendorFiles;
let vendorDependencies;
if (vendorDir !== null) {
  vendorFiles = [];
  for (const entry of collectEntries(vendorDir)) {
    if (entry.rel === "dependencies.json" && !entry.symlink) continue;
    if (isUnsafeRel(entry.rel)) {
      failBuild([`bundle.unsafe_path:vendor ${entry.rel.slice(0, 80)}`]);
    }
    if (entry.symlink) {
      failBuild([`bundle.vendor_symlink:${entry.rel.slice(0, 80)}`]);
    }
    vendorFiles.push({
      path: entry.rel,
      bytes: new Uint8Array(readFileSync(entry.abs)),
    });
  }
  const pinsAbs = join(vendorDir, "dependencies.json");
  try {
    const pinsRaw = readFileSync(pinsAbs, "utf8");
    try {
      vendorDependencies = JSON.parse(pinsRaw);
    } catch (err) {
      failBuild([
        `vendor: dependencies.json is not valid JSON (${err.message.slice(0, 120)})`,
      ]);
    }
  } catch (err) {
    if (err.code !== "ENOENT") {
      failBuild([
        `build.read:vendor dependencies.json:${err.message.slice(0, 120)}`,
      ]);
    }
  }
}

// --- validate + assemble (in memory; nothing written yet). ---
const verdict = assembleDevThemeBundle({
  manifestJson,
  files,
  dependencies: vendorDependencies,
  allowedNetworkHosts: args.allowHosts,
  vendorFiles,
});
if (!verdict.ok) failBuild(verdict.errors);

// --- deterministic write: sorted entries, no timestamps. ---
mkdirSync(outDir, { recursive: true });
for (const output of verdict.outputs) {
  const abs = join(outDir, output.path);
  if (!inside(outDir, abs)) {
    failBuild([`build.internal:output_escape:${output.path.slice(0, 80)}`]);
  }
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, output.bytes);
}
writeFileSync(join(outDir, "release.json"), verdict.releaseJson, "utf8");

// --- self-check: the shipped payload hashes to its own fingerprint. ---
const shipped = JSON.parse(readFileSync(join(outDir, "release.json"), "utf8"));
if (
  fingerprintDevThemeRelease(shipped.manifest, shipped.files) !==
  verdict.fingerprint
) {
  failBuild(["build.internal:fingerprint_drift"]);
}

console.log(
  `build-dev-theme: ok fingerprint=${verdict.fingerprint} files=${verdict.files.length} out=${relative(ROOT, outDir) || outDir}`,
);
