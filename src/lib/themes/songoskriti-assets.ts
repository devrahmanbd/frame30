/**
 * Vitest-side asset checks: the ones that need this repo's TypeScript
 * modules (node cannot import `theme-fonts.ts`, the TSX icon module or
 * `themes.server.ts`).
 *
 * Each function returns a list of findings; an empty list is green.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FONT_FAMILIES,
  FONT_ORIGINS,
  fontStackCss,
  fontStylesheetUrl,
  themeFamilies,
} from "@/lib/theme-fonts";
import { FONT_PRELOAD } from "@/lib/web-vitals";
import { findPackageRefs } from "@/lib/theme-asset-url";
import { registryPackage } from "@/lib/themes.server";
import { SONGOSKRITI_TOKENS } from "@/lib/themes/songoskriti/tokens";
import * as tabler from "@/components/icons/tabler";

export type AssetFinding = { code: string; path: string; message: string };

const ICON_MODULE = resolve(
  import.meta.dirname,
  "..",
  "..",
  "components",
  "icons",
  "tabler.tsx",
);

/** Theme-owned files whose tabler imports must resolve. */
const ICON_CONSUMERS = [
  "src/lib/themes/songoskriti/header-presentation.tsx",
  "src/components/builder/songoskriti.tsx",
];

/**
 * The closed catalogue, keyed by family, plus the metric-matched fallback
 * face every family declares.
 *
 * `resolveFontStack` appends each family's `fallback` face to the stack, so
 * the resolved stack names faces like "Playfair Display Fallback". Those are
 * catalogue members in their own right: `FONT_FAMILIES` declares them and
 * `src/styles.css` declares the matching `@font-face` for each (asserted by
 * `src/lib/phase3-fonts.test.ts`). Treating them as unknown would flag every
 * correctly-resolved theme, so the membership test has to know them — while
 * still rejecting a face that neither the catalogue nor one of its fallback
 * declarations names.
 */
const CATALOGUE_FAMILIES = new Set<string>([
  ...Object.keys(FONT_FAMILIES),
  ...Object.values(FONT_FAMILIES).map((meta) => meta.fallback),
]);

export function checkSongoskritiFonts(): AssetFinding[] {
  const findings: AssetFinding[] = [];
  // Both roles the theme names, resolved for বাংলা — the locale that
  // appends the script fallback, so the stack is at its widest.
  for (const role of ["fontDisplay", "fontBody"] as const) {
    const stack = fontStackCss(SONGOSKRITI_TOKENS[role], "bn");
    // Only quoted family names are checked; the generic tail is exempt.
    for (const match of stack.matchAll(/"([^"]+)"/g)) {
      const family = match[1];
      if (!CATALOGUE_FAMILIES.has(family)) {
        findings.push({
          code: "font.unknown_family",
          path: "src/lib/themes/songoskriti/tokens.ts",
          message: `${family} is not in the font catalogue`,
        });
      }
    }
  }
  const url = fontStylesheetUrl(SONGOSKRITI_TOKENS);
  if (!url.startsWith("https://fonts.googleapis.com/")) {
    findings.push({
      code: "font.bad_origin",
      path: "src/lib/theme-fonts.ts",
      message: `stylesheet URL is not on an approved origin: ${url}`,
    });
  }
  for (const family of themeFamilies(SONGOSKRITI_TOKENS)) {
    if (!FONT_FAMILIES[family]) {
      findings.push({
        code: "font.unknown_family",
        path: "src/lib/themes/songoskriti/tokens.ts",
        message: `${family} is not in the font catalogue`,
      });
    }
  }
  const preload = FONT_PRELOAD.stylesheet;
  if (
    !preload.includes("Noto+Sans+Bengali") ||
    !preload.includes("subset=latin,bengali")
  ) {
    findings.push({
      code: "font.bengali_not_loaded",
      path: "src/lib/web-vitals.ts",
      message:
        "FONT_PRELOAD does not load Noto Sans Bengali with the bengali subset",
    });
  }
  if (!FONT_ORIGINS.some((origin) => preload.startsWith(origin))) {
    findings.push({
      code: "font.bad_origin",
      path: "src/lib/web-vitals.ts",
      message: `preload stylesheet is not on an approved origin: ${preload}`,
    });
  }
  return findings;
}

/**
 * A URL value that names an icon file or an icon sprite instead of naming
 * the icon component.
 *
 * The module path `@/components/icons/tabler` is NOT a URL reference, so the
 * rule reads URL attributes (`src`, `href`, `poster`, `srcSet`) and `url(…)`
 * values rather than the raw source text — a raw-text scan would flag every
 * file that imports the icon module.
 */
const ICON_URL_VALUE =
  /(?:\/icons?\/|\/sprite[/.]|#icon-|icon[-_][\w-]*\.svg\b)/i;

/** Every URL-ish value a source file names: URL attributes and `url(…)`. */
function urlValues(text: string): string[] {
  const values: string[] = [];
  for (const match of text.matchAll(
    /\b(?:src|href|xlinkHref|poster|srcSet)\s*=\s*["']([^"']*)["']/g,
  )) {
    values.push(match[1]);
  }
  for (const match of text.matchAll(/url\(\s*["']?([^"')]*)["']?\s*\)/g)) {
    values.push(match[1]);
  }
  return values;
}

/** Every tabler icon the theme imports must exist in the generated module. */
export function checkSongoskritiIcons(repoRoot: string): AssetFinding[] {
  const findings: AssetFinding[] = [];
  const exported = new Set(Object.keys(tabler));
  for (const rel of ICON_CONSUMERS) {
    const path = resolve(repoRoot, rel);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const block of text.matchAll(
      /import\s*\{([^}]*)\}\s*from\s*"@\/components\/icons\/tabler"/g,
    )) {
      for (const raw of block[1].split(",")) {
        const name = raw
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (!name) continue;
        if (!exported.has(name)) {
          findings.push({
            code: "icon.unknown",
            path: rel,
            message: `${name} is not exported by ${ICON_MODULE}`,
          });
        }
      }
    }
    for (const value of urlValues(text)) {
      if (!ICON_URL_VALUE.test(value)) continue;
      findings.push({
        code: "icon.url_ref",
        path: rel,
        message: `icon referenced as a URL instead of an inline component: ${value}`,
      });
    }
  }
  return findings;
}

export function checkSongoskritiPackaging(world: {
  repoRoot: string;
  publicDir: string;
  buildRoots: string[];
}): AssetFinding[] {
  const findings: AssetFinding[] = [];
  const pkg = registryPackage("songoskriti");
  const blob = JSON.stringify(pkg);
  if (/"assetManifest"/.test(blob)) {
    findings.push({
      code: "pkg.asset_manifest",
      path: "src/lib/themes.server.ts",
      message: "the official package carries an assetManifest",
    });
  }
  const packageRefs = findPackageRefs(pkg.templates);
  if (packageRefs.length > 0) {
    findings.push({
      code: "pkg.package_ref",
      path: "src/lib/themes.server.ts",
      message: `package-form refs in official templates: ${packageRefs.join(", ")}`,
    });
  }
  for (const root of world.buildRoots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!entry.isFile()) continue;
      const path = resolve(entry.parentPath ?? root, entry.name);
      if (path.endsWith(".songoskriti.zip")) {
        findings.push({
          code: "pkg.official_zip",
          path,
          message: "packaged theme artifact exists",
        });
      }
    }
  }
  return findings;
}
