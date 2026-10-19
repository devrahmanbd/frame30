/**
 * Every live `/ph/songoskriti/…` reference must resolve to a shipped asset,
 * and no retired filename may survive in live source. Retired names are
 * built by concatenation so this file never carries a literal that looks
 * like a stale reference.
 *
 * The suite also proves the RENAME was complete: every file the rename
 * touched (the escalated tests, the frozen snapshot and the tracked scratch
 * captures) must carry the new `.jpg` name and none of the retired `.png`
 * ones. Those files are outside every scan root, so the live-source rule
 * above cannot see them.
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

/**
 * The files the rename touched, and the asset bases each of them named with
 * the retired `.png` extension. The bases are the ones that existed at the
 * pre-rename commit (`b5d81fba`) — spec §9.3's test and snapshot rows plus
 * the three tracked scratch captures. They are stored WITHOUT the extension
 * so this file never carries a literal that looks like a stale reference;
 * the extension is concatenated at use.
 */
const RENAME_COMPLETENESS: { file: string; bases: string[] }[] = [
  {
    file: "src/lib/phase3-section.test.ts",
    bases: ["cat-men", "edit-festive-main", "ugc-1", "ugc-2"],
  },
  {
    file: "src/lib/theme-asset-url.test.ts",
    bases: ["cat-men", "hero-festive"],
  },
  {
    file: "src/components/store/CollectionView.test.tsx",
    bases: ["hero-festive"],
  },
  {
    file: "src/components/store/ProductView.test.tsx",
    bases: ["hero-artisans"],
  },
  {
    file: "src/components/builder/songoskriti.test.tsx",
    bases: ["cat-men"],
  },
  {
    file: "src/components/builder/songoskriti-debrand.test.tsx",
    bases: ["ugc-1"],
  },
  {
    file: "src/components/builder/songoskriti-snapshots.test.tsx",
    bases: ["cat-men", "hero-festive", "ugc-1", "ugc-2"],
  },
  {
    file: "src/components/builder/__snapshots__/songoskriti-snapshots.test.tsx.snap",
    bases: ["cat-men", "hero-festive", "ugc-1", "ugc-2"],
  },
  {
    file: "men.html",
    bases: [
      "cat-kids",
      "cat-men",
      "hero-artisans",
      "hero-festive",
      "hero-weaves",
    ],
  },
  {
    file: "women.html",
    bases: [
      "cat-kids",
      "cat-men",
      "hero-artisans",
      "hero-festive",
      "hero-weaves",
    ],
  },
  {
    file: "preview_out.html",
    bases: ["cat-kids", "cat-men", "hero-artisans", "hero-festive"],
  },
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

  it("every renamed file names the new asset and none of the retired ones", () => {
    // The rename touched files that live outside every scan root — the
    // escalated tests, the frozen snapshot and the tracked scratch captures
    // — so the live-source rule above cannot police them. For each of them
    // the retired `<base>.png` string must be gone and the corresponding
    // `<base>.jpg` string must be present.
    const problems: string[] = [];
    for (const { file, bases } of RENAME_COMPLETENESS) {
      const path = resolve(ROOT, file);
      if (!existsSync(path)) {
        problems.push(`${file}: the file does not exist`);
        continue;
      }
      const text = readFileSync(path, "utf8");
      for (const base of bases) {
        const retired = `${base}.png`;
        const current = `${base}.jpg`;
        if (text.includes(retired))
          problems.push(`${file}: still names ${retired}`);
        if (!text.includes(current)) {
          problems.push(`${file}: does not name ${current}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
