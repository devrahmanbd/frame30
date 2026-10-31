/**
 * Theme-independence isolation guard (theme-remediation Task 1).
 *
 * (a) No prod file under `src/lib/themes/<A>/` may import from
 *     `src/lib/themes/<B>/` (tests may cross-reference, so `*.test.*`
 *     files are excluded from the walk).
 * (b) The songoskriti catalog is its own object, not the marketplace alias.
 *     The heritage-silk marker scan stays owned by the Songoskriti asset
 *     suites (not duplicated here); this guard only pins identity + content.
 * (c) Shared chrome holds zero per-theme literals: neither
 *     `src/components/store/StoreHeader.tsx` nor
 *     `src/components/builder/chrome.tsx` may mention `songoskriti` in any
 *     casing. The key-driven registration inside
 *     `src/components/store/theme-chrome.ts` (and the Task 2 lookup in
 *     `src/components/store/theme-chrome.ts`) is config, not theme code,
 *     so those files are deliberately NOT scanned. Theme-owned fallback
 *     data lives under `src/lib/themes/<theme>/` and reaches shared
 *     chrome only through that config.
 * (d) The `?focus=` contract + generic fallback are pinned by the existing
 *     ThemePreviewFrame / theme-preview-nav suites — run, not duplicated.
 * (e) No shared renderer/store file may carry an UNGATED brand-asset
 *     literal: every prod file under `src/components/store/` or
 *     `src/components/builder/` that mentions `/ph/songoskriti` must also
 *     contain a theme-key gate marker (`isSongoskriti` / `themeKey ===`), so the
 *     CollectionView-hero / ProductView-craft-story class (brand art
 *     rendered for foreign themes) trips this guard before it ships.
 *     Theme-owned data (`src/lib/themes/<theme>/`, demo catalogs) is
 *     out of scope — themes own their own asset paths.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DEMO_CATALOGS } from "@/lib/demo-catalog";

const ROOT = process.cwd();
const THEMES_DIR = join(ROOT, "src/lib/themes");

function walk(path: string): string[] {
  const stats = statSync(path);
  if (stats.isFile()) return /\.tsx?$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}

/** Theme dirs: immediate subdirectories of src/lib/themes. */
function themeDirs(): string[] {
  return readdirSync(THEMES_DIR).filter((entry) => {
    try {
      return statSync(join(THEMES_DIR, entry)).isDirectory();
    } catch {
      return false;
    }
  });
}

function prodFiles(theme: string): string[] {
  return walk(join(THEMES_DIR, theme)).filter(
    (f) => !/\.test\.[jt]sx?$/.test(f),
  );
}

function importSpecifiers(src: string): string[] {
  return [...src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map(
    (m) => m[1]!,
  );
}

/**
 * Resolve a specifier to a repo-relative path when it points inside
 * src/lib/themes, else null. Handles `@/` aliases and relative imports.
 */
function themesTarget(
  importerFile: string,
  spec: string,
): { theme: string } | null {
  let abs: string | null = null;
  if (spec.startsWith("@/")) {
    abs = join(ROOT, "src", spec.slice(2));
  } else if (spec.startsWith(".")) {
    abs = resolve(dirname(importerFile), spec);
  } else {
    return null;
  }
  const rel = abs.replace(ROOT + "/", "");
  const m = rel.match(/^src\/lib\/themes\/([^/]+)(\/|$)/);
  return m ? { theme: m[1]! } : null;
}

describe("theme isolation", () => {
  const themes = themeDirs();

  it("finds the songoskriti theme dir and no retired theme dirs", () => {
    expect(themes).toContain("songoskriti");
    expect(themes).not.toContain("somvabona");
  });

  it("walks prod files in every theme dir", () => {
    for (const theme of themes) {
      expect(prodFiles(theme).length).toBeGreaterThan(0);
    }
  });

  it("no prod theme file imports another theme dir", () => {
    const offenders: string[] = [];
    for (const theme of themes) {
      for (const file of prodFiles(theme)) {
        const src = readFileSync(file, "utf8");
        for (const spec of importSpecifiers(src)) {
          const target = themesTarget(file, spec);
          if (target && target.theme !== theme) {
            offenders.push(
              `${file.replace(ROOT + "/", "")} → ${spec} (themes/${target.theme})`,
            );
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("songoskriti catalog is its own object, not the marketplace alias", () => {
    expect(DEMO_CATALOGS.songoskriti).not.toBe(DEMO_CATALOGS.marketplace);
    expect(DEMO_CATALOGS.songoskriti.products.length).toBeGreaterThan(0);
    const titles = new Set(DEMO_CATALOGS.songoskriti.products.map((p) => p.title));
    expect(titles.size).toBe(DEMO_CATALOGS.songoskriti.products.length);
  });

  it("shared chrome holds zero per-theme literals", () => {
    const chromeFiles = [
      "src/components/builder/chrome.tsx",
      "src/components/store/StoreHeader.tsx",
    ];
    const offenders: string[] = [];
    for (const rel of chromeFiles) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const hits = src.match(/songoskriti/gi) ?? [];
      if (hits.length > 0) offenders.push(`${rel}: ${hits.length} hit(s)`);
    }
    expect(offenders).toEqual([]);
  });

  it("shared renderers hold no ungated brand-asset literals", () => {
    const sharedDirs = ["src/components/store", "src/components/builder"];
    const assetRe = /\/ph\/(songoskriti)/;
    const gateRe = /isSongoskriti|themeKey ===/;
    const offenders: string[] = [];
    for (const dir of sharedDirs) {
      const files = walk(join(ROOT, dir)).filter(
        (f) => !/\.test\.[jt]sx?$/.test(f),
      );
      for (const file of files) {
        const src = readFileSync(file, "utf8");
        if (assetRe.test(src) && !gateRe.test(src)) {
          offenders.push(
            `${file.replace(ROOT + "/", "")}: brand-asset literal without theme-key gate`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
