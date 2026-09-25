#!/usr/bin/env node
/**
 * Songoskriti asset gate — spec §4 manifest check.
 *
 * Asserts all 15 files under public/ph/songoskriti/ exist with minimum
 * dimensions. PNG geometry is decoded from the IHDR header (no deps);
 * the hand-built logo-lockup.svg is existence-checked only.
 *
 * Usage:
 *   node scripts/songoskriti-assets-check.mjs
 *
 * Exit 0 when GREEN, exit 1 listing every missing/undersized file (RED).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "..");
const DIR = resolve(ROOT, "public/ph/songoskriti");

/** [relative path, min width, min height] — null dims = existence only. */
export const MANIFEST = [
  // Heroes — 1600x900
  ["hero-festive.png", 1600, 900],
  ["hero-weaves.png", 1600, 900],
  ["hero-artisans.png", 1600, 900],
  // Category circles — 800x800
  ["cat-women.png", 800, 800],
  ["cat-men.png", 800, 800],
  ["cat-kids.png", 800, 800],
  ["cat-living.png", 800, 800],
  ["cat-jewelry.png", 800, 800],
  ["cat-newin.png", 800, 800],
  // Product rails — 900x1200
  ["prod-panjabi.png", 900, 1200],
  ["prod-saree.png", 900, 1200],
  ["prod-kurta.png", 900, 1200],
  ["prod-kantha.png", 900, 1200],
  ["prod-necklace.png", 900, 1200],
  // Hand-built SVG logo lockup — existence only
  ["logo-lockup.svg", null, null],
];

/** Decode PNG width/height from the IHDR chunk; null when not a PNG. */
export function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function checkAssets(root = DIR) {
  const problems = [];
  for (const [name, minW, minH] of MANIFEST) {
    const path = resolve(root, name);
    if (!existsSync(path)) {
      problems.push(`missing: ph/songoskriti/${name}`);
      continue;
    }
    if (minW === null) continue; // SVG: existence only
    const size = pngSize(path);
    if (!size) {
      problems.push(`unreadable (not a PNG): ph/songoskriti/${name}`);
      continue;
    }
    if (size.width < minW || size.height < minH) {
      problems.push(
        `undersized: ph/songoskriti/${name} is ${size.width}x${size.height}, need >= ${minW}x${minH}`,
      );
    }
  }
  return problems;
}

const cliArg = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (import.meta.url === cliArg) {
  const problems = checkAssets();
  if (problems.length > 0) {
    console.error(
      `songoskriti asset gate RED — ${problems.length}/${MANIFEST.length} problems:`,
    );
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `songoskriti asset gate GREEN — all ${MANIFEST.length} files present with minimum dimensions.`,
  );
}
