#!/usr/bin/env node
/**
 * Songoskriti asset acceptance gate — design spec §5.4.
 *
 * One pure function compares three things:
 *
 *   - the shared manifest    what the generator plans  (songoskriti-assets-manifest.mjs)
 *   - the frozen expectation what was approved         (songoskriti-assets-expected.json)
 *   - the tree               what is actually shipped  (public/ph/songoskriti + live code)
 *
 *   checkSongoskritiAssets(world) -> { findings, notes }
 *
 * `findings` are defects and fail the gate (exit 1). `notes` are observations
 * — advisory migration references and references that cannot be resolved
 * statically — and are printed and counted, but never fail the gate.
 *
 * The gate never mutates the tree, except in the explicit
 * `--bless-expectation` mode, which rewrites the expectation file from the
 * tree and prints the paths it touched.
 *
 * Usage:
 *   node scripts/songoskriti-assets-check.mjs [--json] [--bless-expectation]
 *
 * Exit codes: 0 green · 1 findings · 2 harness error (never a pass).
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { ASSETS, ASSET_DIR, BUDGETS } from "./songoskriti-assets-manifest.mjs";
import { fileInfo, imageInfo, sha256 } from "./songoskriti-assets-image.mjs";

/** The theme whose public asset namespace this gate owns. */
export const THEME = "songoskriti";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const EXPECTATION_PATH = resolve(
  import.meta.dirname,
  "songoskriti-assets-expected.json",
);

/** The deterministic local placeholder endpoint lane (spec §5.3). */
const PLACEHOLDER_LANE = "/api/public/ph/";

/** Source extensions the reference scanner reads. */
const SCAN_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/** Directories that hold build output or fixtures — never live references. */
const EXCLUDED_DIRS = new Set([
  ".artifacts",
  ".git",
  ".output",
  ".output-snapshots",
  "__snapshots__",
  "dist",
  "node_modules",
]);

/** Video extensions resolved under the theme namespace. */
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".m4v"];

/** The sentinel that marks the current asset-path migration (spec §5.4). */
const MIGRATION_SENTINEL = "-- songoskriti-asset-paths: current";

/** A path-shaped reference inside a string literal. */
const REFERENCE_PATTERN = /\/ph\/([a-z0-9-]+)\/([A-Za-z0-9._-]+)/g;

/** A package-form asset path (`assets/…`) — never a public URL. */
const PACKAGE_FORM_PATTERN =
  /(?:^|\/)assets\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

/** The formats the manifest and the expectation may declare. */
const KNOWN_FORMATS = new Set(["png", "jpeg", "svg"]);

/**
 * Legacy manifest shape (`[name, minWidth, minHeight]`), kept so the
 * generator's import keeps working until it is rewired to the shared
 * manifest.
 */
export const MANIFEST = ASSETS.map((entry) => [
  entry.name,
  entry.minWidth,
  entry.minHeight,
]);

/** Decode PNG width/height from the IHDR chunk; null when not a PNG. */
export function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** A malformed manifest or expectation is a harness error, never a pass. */
export class HarnessError extends Error {
  constructor(message) {
    super(message);
    this.name = "HarnessError";
  }
}

/** The format a file NAME claims — the claim, not the truth about the bytes. */
export function formatFromName(name) {
  const dot = name.lastIndexOf(".");
  const extension = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "png") return "png";
  if (extension === "svg") return "svg";
  return null;
}

/**
 * The world the gate runs against: the repo paths, the shared manifest and
 * the frozen expectation. Derived from `import.meta.dirname` — never from
 * `process.cwd()` — so the CLI and the vitest suite exercise the same tree.
 */
export function defaultWorld() {
  return {
    repoRoot: REPO_ROOT,
    assetDir: resolve(REPO_ROOT, ASSET_DIR),
    publicDir: resolve(REPO_ROOT, "public"),
    scanRoots: [
      { path: resolve(REPO_ROOT, "src/lib/themes/songoskriti"), kind: "owned" },
      {
        path: resolve(REPO_ROOT, "src/components/builder/songoskriti.tsx"),
        kind: "owned",
      },
      {
        path: resolve(
          REPO_ROOT,
          "src/components/builder/songoskriti-motion.ts",
        ),
        kind: "owned",
      },
      { path: resolve(REPO_ROOT, "src/lib/demo-catalog.ts"), kind: "shared" },
      { path: resolve(REPO_ROOT, "src/lib/header-copy.ts"), kind: "shared" },
      { path: resolve(REPO_ROOT, "src/components/store"), kind: "shared" },
      { path: resolve(REPO_ROOT, "src/routes"), kind: "shared" },
    ],
    migrationsRoot: resolve(REPO_ROOT, "supabase/migrations"),
    buildRoots: [
      resolve(REPO_ROOT, "dist"),
      resolve(REPO_ROOT, ".output"),
      resolve(REPO_ROOT, ".vinxi"),
    ],
    manifest: ASSETS,
    expectation: JSON.parse(readFileSync(EXPECTATION_PATH, "utf8")),
  };
}

/**
 * Compare the manifest, the frozen expectation and the tree.
 *
 * @param {object} world the world shape produced by `defaultWorld()`
 * @returns {{findings: {code: string, path: string, message: string}[], notes: {code: string, path: string, message: string}[]}}
 */
export function checkSongoskritiAssets(world) {
  const findings = [];
  const notes = [];
  const manifest = validateManifest(world.manifest);
  const expectation = validateExpectation(world.expectation);
  const manifestNames = new Set(manifest.map((entry) => entry.name));

  // --- the tree: the files under the theme's asset directory ----------
  const disk = readAssetDir(world.assetDir);
  const diskByName = new Map(disk.map((file) => [file.name, file]));

  // --- manifest entries: existence, identity, floors, budgets ---------
  for (const entry of manifest) {
    const file = diskByName.get(entry.name);
    if (!file) {
      findings.push({
        code: "asset.missing",
        path: relativePath(world.repoRoot, join(world.assetDir, entry.name)),
        message: "the manifest entry has no file on disk",
      });
      continue;
    }
    checkAssetFile(world, entry, file, findings);
  }

  // --- orphan files: the disk must be a subset of the manifest --------
  for (const file of disk) {
    if (manifestNames.has(file.name)) continue;
    findings.push({
      code: "asset.unexpected",
      path: relativePath(world.repoRoot, file.path),
      message: "the file is not in the manifest (orphan or stale copy)",
    });
  }

  // --- the theme directory as a whole ---------------------------------
  const totalBytes = disk.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > BUDGETS.maxTotalBytes) {
    findings.push({
      code: "asset.total_size",
      path: relativePath(world.repoRoot, world.assetDir),
      message: `the theme directory is ${totalBytes} bytes, over the ${BUDGETS.maxTotalBytes} byte budget`,
    });
  }

  // --- duplicate copies ------------------------------------------------
  findings.push(...findDuplicateAssets(world, disk));

  // --- references in live code -----------------------------------------
  const scan = scanLiveCode(world, manifestNames);
  findings.push(...scan.findings);
  notes.push(...scan.notes);

  // --- every manifest file must be referenced by live code --------------
  for (const entry of manifest) {
    if (scan.referenced.has(entry.name)) continue;
    findings.push({
      code: "asset.unreferenced",
      path: relativePath(world.repoRoot, join(world.assetDir, entry.name)),
      message: "no live reference points at this asset",
    });
  }

  // --- the frozen expectation is the anchor ----------------------------
  findings.push(...checkExpectation(world, manifest, expectation));

  // --- advisory: the sentinel migration --------------------------------
  notes.push(...collectMigrationNotes(world, manifestNames));

  return { findings: sortByCode(findings), notes: sortByCode(notes) };
}

/**
 * Rewrite the expectation file from the tree and return the paths it
 * touched. The result must land as a reviewed diff.
 */
export function blessExpectation(world) {
  const records = readAssetDir(world.assetDir).map((file) => ({
    name: file.name,
    format: file.format,
    width: file.width,
    height: file.height,
    sha256: file.sha256,
  }));
  writeFileSync(
    EXPECTATION_PATH,
    `${JSON.stringify({ assets: records }, null, 2)}\n`,
  );
  return records.map((record) => record.name);
}

/* ------------------------------------------------------------------ *
 * checks
 * ------------------------------------------------------------------ */

/**
 * Check one manifest entry against the file that ships under its name:
 * the format the bytes have, the format the name claims, the format the
 * manifest declares, the manifest's floors and the size budgets.
 */
function checkAssetFile(world, entry, file, findings) {
  const path = relativePath(world.repoRoot, file.path);
  const claimed = formatFromName(entry.name);
  const declared = entry.format;
  let identityIsConsistent = true;

  if (declared === "svg") {
    if (!isParseableSvg(file.path)) {
      findings.push({
        code: "asset.invalid_svg",
        path,
        message: "the brand SVG is not a parseable <svg> document",
      });
      identityIsConsistent = false;
    }
  } else {
    if (claimed === null) {
      findings.push({
        code: "asset.extension_mismatch",
        path,
        message: "the file name claims no known format",
      });
      identityIsConsistent = false;
    } else if (file.format !== claimed) {
      findings.push({
        code: "asset.format_mismatch",
        path,
        message: `the bytes are ${file.format ?? "unreadable"} but the name says ${claimed}`,
      });
      identityIsConsistent = false;
    }
    if (claimed !== null && claimed !== declared) {
      findings.push({
        code: "asset.extension_mismatch",
        path,
        message: `the name says ${claimed} but the manifest declares ${declared}`,
      });
      identityIsConsistent = false;
    }
  }

  // The floors describe the asset the manifest names. When the file's own
  // identity is inconsistent (bytes vs name, name vs manifest) the entry
  // does not describe this file, so its floors are not measured against it.
  if (identityIsConsistent && declared !== "svg") {
    const short = [];
    if (
      entry.minWidth != null &&
      file.width != null &&
      file.width < entry.minWidth
    ) {
      short.push(`width ${file.width} < ${entry.minWidth}`);
    }
    if (
      entry.minHeight != null &&
      file.height != null &&
      file.height < entry.minHeight
    ) {
      short.push(`height ${file.height} < ${entry.minHeight}`);
    }
    if (short.length > 0) {
      findings.push({
        code: "asset.undersized",
        path,
        message: `below the manifest floor (${short.join(", ")})`,
      });
    }
  }

  if (file.bytes > BUDGETS.maxFileBytes) {
    findings.push({
      code: "asset.oversized",
      path,
      message: `${file.bytes} bytes, over the ${BUDGETS.maxFileBytes} byte budget`,
    });
  }

  const pixels =
    file.width != null && file.height != null ? file.width * file.height : null;
  const budget = BUDGETS.maxBytesPerPixel[file.format];
  if (pixels && budget && file.bytes / pixels > budget) {
    findings.push({
      code: "asset.density",
      path,
      message: `${(file.bytes / pixels).toFixed(2)} bytes per pixel, over the ${budget} byte per pixel budget`,
    });
  }
}

/**
 * The duplicate rule (spec §5.4): identical sha256 twice inside the theme
 * directory, or a theme raster's sha256 found elsewhere under `public/`
 * outside the theme directory (build outputs excluded).
 */
function findDuplicateAssets(world, disk) {
  const findings = [];

  const byDigest = new Map();
  for (const file of disk) {
    const group = byDigest.get(file.sha256) ?? [];
    group.push(file);
    byDigest.set(file.sha256, group);
  }
  for (const group of byDigest.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    findings.push({
      code: "asset.duplicate",
      path: relativePath(world.repoRoot, first.path),
      message: `identical bytes also ship as ${rest
        .map((file) => relativePath(world.repoRoot, file.path))
        .join(", ")}`,
    });
  }

  const themeDigests = new Map();
  const themeSizes = new Set();
  for (const file of disk) {
    if (!themeDigests.has(file.sha256)) themeDigests.set(file.sha256, file);
    themeSizes.add(file.bytes);
  }
  for (const path of listFiles(world.publicDir)) {
    if (isInside(world.assetDir, path)) continue;
    if (!themeSizes.has(statSync(path).size)) continue;
    const original = themeDigests.get(sha256(readFileSync(path)));
    if (!original) continue;
    findings.push({
      code: "asset.duplicate",
      path: relativePath(world.repoRoot, path),
      message: `identical bytes ship as ${relativePath(world.repoRoot, original.path)}`,
    });
  }

  return findings;
}

/**
 * The expectation is the anchor: the approved set must equal the planned
 * set, and every approved artifact must be in the tree, unchanged.
 */
function checkExpectation(world, manifest, expectation) {
  const findings = [];
  const manifestNames = new Set(manifest.map((entry) => entry.name));
  const expectedNames = new Set(
    expectation.assets.map((record) => record.name),
  );

  for (const name of manifestNames) {
    if (expectedNames.has(name)) continue;
    findings.push({
      code: "asset.expectation_drift",
      path: relativePath(world.repoRoot, join(world.assetDir, name)),
      message: "the manifest entry has no approved record",
    });
  }
  for (const name of expectedNames) {
    if (manifestNames.has(name)) continue;
    findings.push({
      code: "asset.expectation_drift",
      path: relativePath(world.repoRoot, join(world.assetDir, name)),
      message: "the approved record has no manifest entry",
    });
  }

  for (const record of expectation.assets) {
    const path = relativePath(
      world.repoRoot,
      join(world.assetDir, record.name),
    );
    const info = fileInfo(join(world.assetDir, record.name));
    if (!info) {
      findings.push({
        code: "asset.expectation_drift",
        path,
        message: "the approved artifact is not in the tree",
      });
      continue;
    }
    const differences = [];
    if (info.format !== record.format) {
      differences.push(`format ${info.format} != ${record.format}`);
    }
    if (info.width !== record.width || info.height !== record.height) {
      differences.push(
        `geometry ${info.width}x${info.height} != ${record.width}x${record.height}`,
      );
    }
    if (info.sha256 !== record.sha256) differences.push("digest differs");
    if (differences.length === 0) continue;
    findings.push({
      code: "asset.expectation_drift",
      path,
      message: `the tree differs from the approved artifact (${differences.join(", ")})`,
    });
  }

  return findings;
}

/**
 * Scan the live code for references, URL forms and unresolvable computed
 * references. Owned roots get the full rule set; shared roots are scoped to
 * the theme's own namespace (spec §5.4).
 */
function scanLiveCode(world, manifestNames) {
  const findings = [];
  const notes = [];
  const referenced = new Set();

  for (const file of collectScanFiles(world.scanRoots)) {
    const text = readText(file.path);
    if (text === null) continue;
    const path = relativePath(world.repoRoot, file.path);

    for (const literal of extractLiterals(text)) {
      const value = literal.value;
      if (value === "") continue;
      const at = `${path}:${literal.line}`;

      if (literal.computed) {
        if (value.includes("/ph/") || value.includes(PLACEHOLDER_LANE)) {
          notes.push({
            code: "note.computed_ref",
            path: at,
            message: "a computed reference cannot be resolved statically",
          });
        }
        continue;
      }

      // The placeholder lane is an endpoint, not a file: it is exempt from
      // the URL rules and it is never reference-extracted.
      if (value.startsWith(PLACEHOLDER_LANE)) {
        const segments = value.slice(PLACEHOLDER_LANE.length).split("/");
        if (file.kind === "owned" && segments.includes(THEME)) {
          findings.push({
            code: "url.wrong_form",
            path: at,
            message: `the placeholder lane does not own theme files (${value})`,
          });
        }
        continue;
      }

      if (file.kind === "owned" && PACKAGE_FORM_PATTERN.test(value)) {
        findings.push({
          code: "url.wrong_form",
          path: at,
          message: `a package-form path is not a public URL (${value})`,
        });
      }

      let matched = false;
      for (const match of value.matchAll(REFERENCE_PATTERN)) {
        matched = true;
        const theme = match[1];
        const name = match[2];

        if (isVideoName(name)) {
          if (theme === THEME && !manifestNames.has(name)) {
            findings.push({
              code: "video.missing",
              path: at,
              message: `the video "${match[0]}" does not resolve under /${THEME}/`,
            });
          }
          continue;
        }

        if (theme === THEME) {
          if (!manifestNames.has(name)) {
            const onDisk = existsSync(join(world.assetDir, name));
            findings.push({
              code: "ref.unknown",
              path: at,
              message: `"${match[0]}" is not in the manifest${
                onDisk ? "" : " and is not on disk"
              }`,
            });
          }
          referenced.add(name);
          continue;
        }

        if (file.kind === "owned") {
          findings.push({
            code: "url.cross_theme",
            path: at,
            message: `"${match[0]}" points at another theme's assets`,
          });
        }
      }

      if (
        !matched &&
        (value.includes("/ph/") || value.includes(PLACEHOLDER_LANE))
      ) {
        notes.push({
          code: "note.computed_ref",
          path: at,
          message: `"${value}" is a path prefix that cannot be resolved statically`,
        });
      }
    }

    // An absolute URL in an asset slot is never an approved source. A
    // `href` on a non-asset element (a social profile, a page link) is out
    // of scope, so only `src`, `poster`, `srcSet`, `backgroundImage` and
    // the `href` of an <img>/<source> are inspected.
    if (file.kind !== "owned") continue;
    for (const value of collectAssetSlotLiterals(text)) {
      if (!/^(?:https?:)?\/\//.test(value)) continue;
      findings.push({
        code: "url.wrong_form",
        path,
        message: `an absolute URL in an asset slot is not an approved source (${value})`,
      });
    }
  }

  return { findings, notes, referenced };
}

/**
 * The advisory migration rule: the newest migration carrying the sentinel
 * is read, and a retired `/ph/songoskriti/…` path inside it is a note.
 * Migrations are history — they never fail the gate and never feed
 * `asset.unreferenced`.
 */
function collectMigrationNotes(world, manifestNames) {
  const notes = [];
  const dir = world.migrationsRoot;
  if (!dir || !existsSync(dir)) return notes;

  let sentinel = null;
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".sql")) continue;
    const text = readText(join(dir, name));
    if (text === null) continue;
    if (text.includes(MIGRATION_SENTINEL)) sentinel = { name, text };
  }
  if (!sentinel) return notes;

  for (const match of sentinel.text.matchAll(REFERENCE_PATTERN)) {
    if (match[1] !== THEME || manifestNames.has(match[2])) continue;
    notes.push({
      code: "note.migration_ref",
      path: relativePath(world.repoRoot, join(dir, sentinel.name)),
      message: `the retired path "${match[0]}" is still in the sentinel migration`,
    });
  }
  return notes;
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function validateManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new HarnessError("the manifest is empty or is not an array");
  }
  const seen = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry.name !== "string" || entry.name === "") {
      throw new HarnessError("a manifest entry has no name");
    }
    if (!KNOWN_FORMATS.has(entry.format)) {
      throw new HarnessError(
        `manifest entry "${entry.name}" declares the unknown format "${entry.format}"`,
      );
    }
    if (seen.has(entry.name)) {
      throw new HarnessError(
        `manifest entry "${entry.name}" is declared twice`,
      );
    }
    seen.add(entry.name);
  }
  return manifest;
}

function validateExpectation(expectation) {
  if (!expectation || !Array.isArray(expectation.assets)) {
    throw new HarnessError("the expectation has no assets array");
  }
  for (const record of expectation.assets) {
    if (!record || typeof record.name !== "string" || record.name === "") {
      throw new HarnessError("an expectation record has no name");
    }
    if (!KNOWN_FORMATS.has(record.format)) {
      throw new HarnessError(
        `expectation record "${record.name}" declares the unknown format "${record.format}"`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(String(record.sha256 ?? ""))) {
      throw new HarnessError(
        `expectation record "${record.name}" has no sha256 digest`,
      );
    }
  }
  return expectation;
}

/** The files under the theme's asset directory, with their byte facts. */
function readAssetDir(assetDir) {
  if (!existsSync(assetDir)) return [];
  const files = [];
  for (const name of readdirSync(assetDir).sort()) {
    const path = join(assetDir, name);
    if (!statSync(path).isFile()) continue;
    const info = fileInfo(path);
    if (!info) continue;
    files.push({ name, path, ...info });
  }
  return files;
}

/**
 * The live source files of the scan roots. A file that sits under an owned
 * root AND a shared root is owned — the owned rules are the stricter ones.
 */
function collectScanFiles(scanRoots) {
  const byPath = new Map();
  for (const root of scanRoots ?? []) {
    const kind = root.kind === "owned" ? "owned" : "shared";
    for (const path of listFiles(root.path, SCAN_EXTENSIONS)) {
      if (!isLiveSource(path)) continue;
      const known = byPath.get(path);
      if (!known) {
        byPath.set(path, { path, kind });
        continue;
      }
      if (known.kind !== "owned" && kind === "owned") known.kind = "owned";
    }
  }
  return [...byPath.values()];
}

/** List the files under a path; directories are walked, build output is not. */
function listFiles(target, extensions = null) {
  if (!target || !existsSync(target)) return [];
  if (!statSync(target).isDirectory()) return [target];
  const files = [];
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      files.push(...listFiles(join(target, entry.name), extensions));
      continue;
    }
    if (!entry.isFile()) continue;
    if (extensions && !extensions.includes(extensionOf(entry.name))) continue;
    files.push(join(target, entry.name));
  }
  return files;
}

/** Test fixtures are not live references. */
function isLiveSource(path) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name);
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function isVideoName(name) {
  return VIDEO_EXTENSIONS.includes(extensionOf(name));
}

function isParseableSvg(path) {
  const buffer = readFileSync(path);
  if (imageInfo(buffer).format !== "svg") return false;
  return /<svg[\s>]/i.test(buffer.toString("utf8", 0, 2048));
}

function isInside(dir, path) {
  const rel = relative(dir, path);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith("/");
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function relativePath(repoRoot, path) {
  const rel = relative(repoRoot, path);
  return rel === "" ? "." : rel;
}

function sortByCode(items) {
  return [...items].sort((a, b) =>
    a.code === b.code
      ? a.path.localeCompare(b.path)
      : a.code.localeCompare(b.code),
  );
}

/**
 * Extract the string literals of a source file. Comments are skipped: a
 * reference is a path-shaped token inside a literal, not prose. A template
 * literal with an interpolation is marked `computed` — it cannot be
 * resolved statically.
 */
function extractLiterals(text) {
  const literals = [];
  let index = 0;
  let line = 1;
  while (index < text.length) {
    const char = text[index];

    if (char === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      index += 2;
      while (
        index < text.length &&
        !(text[index] === "*" && text[index + 1] === "/")
      ) {
        if (text[index] === "\n") line += 1;
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char !== '"' && char !== "'" && char !== "`") {
      index += 1;
      continue;
    }

    const quote = char;
    const startLine = line;
    index += 1;
    let value = "";
    let computed = false;
    while (index < text.length) {
      const current = text[index];
      if (current === "\\") {
        value += text[index + 1] ?? "";
        index += 2;
        continue;
      }
      if (current === "\n") {
        if (quote !== "`") break;
        line += 1;
        value += current;
        index += 1;
        continue;
      }
      if (current === quote) {
        index += 1;
        break;
      }
      if (quote === "`" && current === "$" && text[index + 1] === "{") {
        computed = true;
        index += 2;
        let depth = 1;
        while (index < text.length && depth > 0) {
          if (text[index] === "{") depth += 1;
          else if (text[index] === "}") depth -= 1;
          else if (text[index] === "\n") line += 1;
          index += 1;
        }
        continue;
      }
      value += current;
      index += 1;
    }
    literals.push({ value, line: startLine, computed });
  }
  return literals;
}

/**
 * The literals that sit in an asset slot: `src`, `poster`, `srcSet`,
 * `backgroundImage`, and the `href` of an `<img>` or `<source>` element.
 */
function collectAssetSlotLiterals(text) {
  const values = [];
  const attributes =
    /\b(?:src|srcSet|poster|backgroundImage)\s*=\s*(["'])([\s\S]*?)\1/g;
  for (const match of text.matchAll(attributes)) values.push(match[2]);
  for (const tag of text.matchAll(/<(?:img|source)\b[^>]*>/gi)) {
    for (const match of tag[0].matchAll(/\bhref\s*=\s*(["'])([\s\S]*?)\1/g)) {
      values.push(match[2]);
    }
  }
  return values;
}

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

function printReport(result) {
  const { findings, notes } = result;
  if (findings.length === 0) {
    console.log(
      `songoskriti asset gate GREEN — 0 findings, ${notes.length} note(s).`,
    );
  } else {
    console.error(
      `songoskriti asset gate RED — ${findings.length} finding(s):`,
    );
    for (const finding of findings) {
      console.error(
        `  - ${finding.code.padEnd(24)} ${finding.path} — ${finding.message}`,
      );
    }
  }
  if (notes.length === 0) return;
  console.log(`notes (${notes.length}) — advisory, they never fail the gate:`);
  for (const note of notes) {
    console.log(`  - ${note.code.padEnd(24)} ${note.path} — ${note.message}`);
  }
}

function runCli(argv) {
  if (argv.includes("--bless-expectation")) {
    try {
      const touched = blessExpectation(defaultWorld());
      for (const name of touched) console.log(`blessed ${name}`);
      console.log(
        `songoskriti expectation blessed — ${touched.length} record(s).`,
      );
    } catch (error) {
      console.error(`songoskriti asset gate ERROR — ${error.message}`);
      process.exitCode = 2;
    }
    return;
  }

  let result;
  try {
    result = checkSongoskritiAssets(defaultWorld());
  } catch (error) {
    console.error(`songoskriti asset gate ERROR — ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }
  process.exitCode = result.findings.length > 0 ? 1 : 0;
}

const cliArg = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === cliArg) {
  runCli(process.argv.slice(2));
}
