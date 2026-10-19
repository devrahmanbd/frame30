/**
 * Vitest-side asset checks: the ones that need this repo's TypeScript
 * modules (node cannot import `theme-fonts.ts`, the TSX icon module or
 * `themes.server.ts`).
 *
 * Each function returns a list of findings; an empty list is green.
 *
 * TEST-SIDE MODULE: it imports `node:fs` (through the CLI gate) and a
 * server module (`@/lib/themes.server`), so app code must never import it —
 * that would pull `node:fs` into the client bundle. Only the test suite
 * imports it.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import {
  FONT_FAMILIES,
  FONT_ORIGINS,
  coversScript,
  fontStylesheetUrl,
  themeFamilies,
  type FontPreload,
} from "@/lib/theme-fonts";
import { tokensToCss, type ThemeTokens } from "@/lib/builder-ast";
import { FONT_PRELOAD } from "@/lib/web-vitals";
import { findPackageRefs } from "@/lib/theme-asset-url";
import { registryPackage } from "@/lib/themes.server";
import { SONGOSKRITI_TOKENS } from "@/lib/themes/songoskriti/tokens";
import * as tabler from "@/components/icons/tabler";
// The CLI gate is plain, dependency-free JS. The packaging suite REUSES its
// duplicate predicate instead of writing a second copy of the digest scan:
// one implementation, two suites.
import { checkSongoskritiAssets } from "../../../scripts/songoskriti-assets-check.mjs";

export type AssetFinding = { code: string; path: string; message: string };

/**
 * The world the CLI gate and the packaging suite run against. The CLI's
 * entry point is untyped JS, so the shape the packaging suite actually reads
 * is spelled out here; everything else is passed straight through.
 */
export type SongoskritiAssetWorld = {
  repoRoot: string;
  assetDir: string;
  publicDir: string;
  migrationsRoot: string;
  buildRoots: string[];
  manifest: unknown;
  expectation: unknown;
  scanRoots: unknown;
};

/** The official theme's package object. */
export type SongoskritiPackage = Record<string, unknown>;

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
 * a resolved stack names faces like "Playfair Display Fallback". Those are
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

/** The CSS custom properties the theme actually emits. */
function emittedStacks(tokens: ThemeTokens): { role: string; stack: string }[] {
  const css = tokensToCss(tokens);
  return [
    { role: "display", stack: css["--theme-font-display"] ?? "" },
    { role: "body", stack: css["--theme-font-body"] ?? "" },
  ];
}

/**
 * The quoted family names of an emitted stack. The unquoted generic tail
 * (`system-ui`, `sans-serif`, `serif`) is exempt — the spec validates it
 * through the existing `src/lib/phase3-fonts.test.ts` lock.
 */
function quotedFamilies(stack: string): string[] {
  return [...stack.matchAll(/"([^"]+)"/g)].map((match) => match[1]!);
}

/**
 * The theme's typography against the closed font catalogue.
 *
 * The rule reads the EMITTED stacks (`tokensToCss`), not the resolver's
 * output: `resolveFontStack` silently drops a family that is not in the
 * catalogue, so a resolved stack can never show one. The emitted stack
 * quotes the theme's family verbatim, so it can.
 */
export function checkSongoskritiFonts(
  tokens: ThemeTokens = SONGOSKRITI_TOKENS,
  preload: FontPreload = FONT_PRELOAD,
): AssetFinding[] {
  const findings: AssetFinding[] = [];
  const unknownFamilies = new Set<string>();
  let bengaliCapable = false;

  for (const { stack } of emittedStacks(tokens)) {
    for (const family of quotedFamilies(stack)) {
      if (!CATALOGUE_FAMILIES.has(family)) unknownFamilies.add(family);
      if (coversScript(family, "bengali")) bengaliCapable = true;
    }
  }
  // The theme's own pairing must not name a face the catalogue closed.
  for (const family of themeFamilies(tokens)) {
    if (!CATALOGUE_FAMILIES.has(family)) unknownFamilies.add(family);
  }
  for (const family of unknownFamilies) {
    findings.push({
      code: "font.unknown_family",
      path: "src/lib/themes/songoskriti/tokens.ts",
      message: `${family} is not in the font catalogue`,
    });
  }
  if (!bengaliCapable) {
    findings.push({
      code: "font.theme_stack_not_bengali",
      path: "src/lib/themes/songoskriti/tokens.ts",
      message: "the theme's emitted font stacks name no Bengali-capable family",
    });
  }
  const url = fontStylesheetUrl(tokens);
  if (!FONT_ORIGINS.some((origin) => url.startsWith(origin))) {
    findings.push({
      code: "font.bad_origin",
      path: "src/lib/theme-fonts.ts",
      message: `stylesheet URL is not on an approved origin: ${url}`,
    });
  }
  const preloadUrl = preload.stylesheet;
  if (
    !preloadUrl.includes("Noto+Sans+Bengali") ||
    !preloadUrl.includes("subset=latin,bengali")
  ) {
    findings.push({
      code: "font.bengali_not_loaded",
      path: "src/lib/web-vitals.ts",
      message:
        "FONT_PRELOAD does not load Noto Sans Bengali with the bengali subset",
    });
  }
  if (!FONT_ORIGINS.some((origin) => preloadUrl.startsWith(origin))) {
    findings.push({
      code: "font.bad_origin",
      path: "src/lib/web-vitals.ts",
      message: `preload stylesheet is not on an approved origin: ${preloadUrl}`,
    });
  }
  return findings;
}

/**
 * A URL value that names an icon file or an icon sprite instead of naming
 * the icon component.
 *
 * The module path `@/components/icons/tabler` is NOT a URL reference, so the
 * rule reads URL values rather than the raw source text — a raw-text scan
 * would flag every file that imports the icon module.
 */
const ICON_URL_VALUE =
  /(?:\/icons?\/|\/sprite[/.]|#icon-|icon[-_][\w-]*\.svg\b)/i;

/**
 * The module specifiers a source file imports. A module path is not a URL
 * reference: `@/components/icons/tabler` contains `/icons/` but names the
 * icon MODULE, not an icon file.
 */
function importSpecifiers(text: string): Set<string> {
  const specs = new Set<string>();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) specs.add(match[1]);
  }
  return specs;
}

/**
 * Every URL-ish value a source file names: URL attributes (quoted or inside
 * a JSX expression), `url(…)` contents and standalone string literals.
 */
function urlValues(text: string): string[] {
  const specs = importSpecifiers(text);
  const values = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value) return;
    if (specs.has(value)) return;
    values.add(value);
  };
  const attributes =
    /\b(?:src|href|xlinkHref|poster|srcSet)\s*=\s*(?:\{\s*)?["']([^"']*)["']/g;
  for (const match of text.matchAll(attributes)) add(match[1]);
  for (const match of text.matchAll(/url\(\s*["']?([^"')]*)["']?\s*\)/g)) {
    add(match[1]);
  }
  // A bare string literal that names an icon is a URL reference too: the
  // value can be handed to `src={…}` or to a style at runtime.
  for (const match of text.matchAll(/"([^"\\\n]*)"/g)) add(match[1]);
  for (const match of text.matchAll(/'([^'\\\n]*)'/g)) add(match[1]);
  for (const match of text.matchAll(/`([^`$\n]*)`/g)) add(match[1]);
  return [...values];
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

/** The keys an official package must never carry: a manifest or a payload. */
const PACKAGE_PAYLOAD_KEYS = ["assets", "files", "filesBase64"];

/** Whether a repo-relative path lies inside a repo-relative directory. */
function isInsideDir(dir: string, path: string): boolean {
  if (path === dir) return true;
  return path.startsWith(dir.endsWith("/") ? dir : `${dir}/`);
}

/**
 * The packaging boundary of the official theme.
 *
 * The duplicate predicate is the CLI's, not a second implementation: the CLI
 * gate runs against the same world and its `asset.duplicate` findings are
 * re-reported here under this suite's own codes.
 */
export function checkSongoskritiPackaging(
  world: SongoskritiAssetWorld,
  pkg: SongoskritiPackage = registryPackage("songoskriti"),
): AssetFinding[] {
  const findings: AssetFinding[] = [];
  if (Object.hasOwn(pkg, "assetManifest")) {
    findings.push({
      code: "pkg.asset_manifest",
      path: "src/lib/themes.server.ts",
      message: "the official package carries an assetManifest",
    });
  }
  const payloadKey = PACKAGE_PAYLOAD_KEYS.find((key) =>
    Object.hasOwn(pkg, key),
  );
  if (payloadKey) {
    findings.push({
      code: "pkg.asset_manifest",
      path: "src/lib/themes.server.ts",
      message: `the official package carries an embedded asset payload (${payloadKey})`,
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

  // The duplicate predicate, re-evaluated through the CLI's own gate: a
  // theme raster copied under `public/` OUTSIDE the theme's own directory.
  const assetDir = relative(world.repoRoot, world.assetDir);
  const cli = checkSongoskritiAssets(world);
  for (const finding of cli.findings) {
    if (finding.code !== "asset.duplicate") continue;
    if (isInsideDir(assetDir, finding.path)) continue;
    findings.push({
      code: "pkg.asset_copy",
      path: finding.path,
      message: finding.message,
    });
  }

  for (const root of world.buildRoots) {
    if (!existsSync(root)) continue;
    // The file arm: a packaged theme artifact.
    for (const entry of readdirSync(root, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!entry.isFile()) continue;
      const path = resolve(entry.parentPath ?? root, entry.name);
      if (!path.endsWith(".songoskriti.zip")) continue;
      findings.push({
        code: "pkg.official_zip",
        path: relative(world.repoRoot, path),
        message: "packaged theme artifact exists",
      });
    }
    // The directory arm: a packaged theme directory (`themes/songoskriti*`).
    const themesDir = resolve(root, "themes");
    if (!existsSync(themesDir)) continue;
    for (const entry of readdirSync(themesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("songoskriti")) continue;
      const path = resolve(themesDir, entry.name);
      findings.push({
        code: "pkg.official_zip",
        path: relative(world.repoRoot, path),
        message: "packaged theme directory exists",
      });
    }
  }
  return findings;
}
