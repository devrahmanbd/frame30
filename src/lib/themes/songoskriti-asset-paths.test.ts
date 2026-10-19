/**
 * Every live `/ph/songoskriti/…` reference must resolve to a shipped asset,
 * and no retired filename may survive in live source. Retired names are
 * built by concatenation so this file never carries a literal that looks
 * like a stale reference.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ASSETS } from "../../../scripts/songoskriti-assets-manifest.mjs";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");
const ASSET_DIR = resolve(ROOT, "public/ph/songoskriti");

/** Live code that may reference theme art. */
const SCAN_ROOTS = [
  "src/lib/themes/songoskriti",
  "src/components/builder/songoskriti.tsx",
  "src/components/builder/songoskriti-motion.ts",
  "src/lib/demo-catalog.ts",
  "src/lib/header-copy.ts",
  "src/components/store",
  "src/routes",
];

/** The nine files whose bytes are JPEG and whose name must end `.jpg`. */
const RENAMED = [
  "campaign-men",
  "cat-kids",
  "cat-men",
  "edit-festive-main",
  "hero-artisans",
  "hero-festive",
  "hero-weaves",
  "ugc-1",
  "ugc-2",
];

function filesUnder(rel: string): string[] {
  const abs = resolve(ROOT, rel);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => resolve(d.parentPath, d.name));
}

describe("songoskriti asset paths", () => {
  it("ships exactly the manifest's assets", () => {
    const onDisk = readdirSync(ASSET_DIR).sort();
    expect(onDisk).toEqual(ASSETS.map((a) => a.name).sort());
  });

  it("every live reference resolves to a shipped asset", () => {
    const shipped = new Set(readdirSync(ASSET_DIR));
    const unknown: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of filesUnder(root)) {
        if (file.includes(".test.")) continue;
        const text = readFileSync(file, "utf8");
        for (const m of text.matchAll(
          /\/ph\/songoskriti\/([A-Za-z0-9._-]+)/g,
        )) {
          if (!shipped.has(m[1])) unknown.push(`${file}: ${m[1]}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it("no retired filename survives in live source", () => {
    const retired = RENAMED.map((n) => `${n}.png`);
    const hits: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of filesUnder(root)) {
        if (file.includes(".test.")) continue;
        const text = readFileSync(file, "utf8");
        for (const name of retired) {
          if (text.includes(name)) hits.push(`${file}: ${name}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
