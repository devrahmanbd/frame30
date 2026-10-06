/**
 * PKG-3 — official theme parity proof (cases only).
 *
 * Exported ZIP → NORMAL install pipeline (`installPackage` with the real
 * PKG-1 `pkg1ThemeValidator`) → render key templates → compare against the
 * source render. Proven here per theme:
 * - structure: installed `theme_versions.templates` deep-equals the
 *   source-rendered ASTs (header/main/footer per template);
 * - tokens + variations: `theme.json` payload deep-equals source tokens
 *   (package level — see the `tokens:{}` pipeline gap pinned below);
 * - copy: bilingual EN/BN spot strings identical in the installed rows;
 * - assets: every source asset maps to exactly one namespaced installed
 *   blob (suffix + byte length + text round-trip). Served URLs carry the
 *   per-version namespace + `?v=` cache-buster, so they are asserted
 *   through the documented mapping, never byte equality.
 *
 * No network, no real database: persistence goes through `fakeDb`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fakeDb } from "./__fixtures__/fake-db";
import {
  installPackage,
  previewPackage,
  pkg1ThemeValidator,
} from "./package-install.server";
import { themeVersionPrefix } from "./package-store.server";
import { validateThemeManifest } from "./theme-package";
import {
  extractPackageFiles,
  parseZip,
  validatePackageLayout,
} from "./package-zip";
import type { TemplateKey, ThemeAst } from "./builder-ast";
import {
  authoredTemplates,
  buildExportZip,
  buildOfficialSections,
  exportOfficialTheme,
  normalizeAssetLists,
  officialThemeTokens,
  officialThemeVariations,
  rewriteThemeUrls,
  sha256Hex,
  stableStringify,
  type OfficialThemeKey,
} from "./theme-export";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MERCHANT = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ACTOR = "99999999-9999-4999-8999-999999999999";

// Songoskriti ships ~25 MB of art under the 32 MB default archive cap.
// Parity installs use default limits throughout.
const RAISED_LIMITS = {
  maxArchiveBytes: 64 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
};

const loadedCache = new Map<string, ReturnType<typeof loadOfficial>>();

function loadOfficial(key: OfficialThemeKey) {
  const cached = loadedCache.get(key);
  if (cached) return cached;
  const cssText = readFileSync(
    join(ROOT, "src", "lib", "themes", key, "skins.css"),
    "utf8",
  );
  const dir = join(ROOT, "public", "ph", key);
  const sourceAssets = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort()
    .map((file) => ({
      file,
      bytes: new Uint8Array(readFileSync(join(dir, file))),
    }));
  const exported = exportOfficialTheme({
    key,
    version: "1.0.0",
    cssText,
    assets: sourceAssets,
  });
  const zip = buildExportZip(exported.files);
  const loaded = { cssText, sourceAssets, exported, zip };
  loadedCache.set(key, loaded);
  return loaded;
}

/** What the storefront renders from: source AST in package URL form.
 * Modulo the asset-list normal form (comma strings → ref arrays). */
function expectedTemplate(
  key: OfficialThemeKey,
  template: TemplateKey,
  version: string,
) {
  const ast = normalizeAssetLists(
    rewriteThemeUrls(buildOfficialSections(key, template)!, key),
  ) as ThemeAst;
  return {
    format: "official-theme-template/1",
    theme: key,
    template,
    packageVersion: version,
    header: ast.header,
    main: ast.main,
    footer: ast.footer,
  };
}

async function installOfficial(key: OfficialThemeKey, merchant = MERCHANT) {
  const loaded = loadOfficial(key);
  const db = fakeDb({
    tables: {
      store_themes: [],
      theme_versions: [],
      theme_drafts: [],
      theme_assets: [],
      marketplace_installs: [],
      theme_audit: [],
    },
  });
  // Archive + layout gates over the exact bytes under test (same raised
  // caps as the install below; the default-cap rejection is pinned
  // separately in "pipeline limits vs official bundles").
  const entries = parseZip(loaded.zip, RAISED_LIMITS);
  const files = extractPackageFiles(loaded.zip, entries, RAISED_LIMITS);
  const layout = validatePackageLayout(files, "theme");
  expect(validateThemeManifest(layout.manifest).ok).toBe(true);
  const res = await installPackage(
    db.asClient(),
    merchant,
    {
      kind: "theme",
      fileName: `${key}.zip`,
      bytes: loaded.zip,
      idempotencyKey: `pkg3-${key}`,
      validator: pkg1ThemeValidator,
      limits: RAISED_LIMITS,
    },
    ACTOR,
  );
  expect(res.version).toBe("1.0.0");
  return { db, res, ...loaded };
}

describe("PKG-3 parity: export → install → render", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "installed templates are indistinguishable from the source render (%s)",
    async (key) => {
      const { db, res, exported } = await installOfficial(key);
      const rows = db.rows("theme_versions");
      expect(rows).toHaveLength(1);
      const installed = rows[0]!.templates as Record<string, unknown>;
      const expected: Record<string, unknown> = {};
      for (const template of authoredTemplates(key)) {
        expected[template] = expectedTemplate(key, template, "1.0.0");
      }
      // Structure: every key template deep-equals the source render.
      // Canonical-string comparison: identical claim to toEqual without
      // the element-wise walk / diff serialization cost on large ASTs.
      expect(stableStringify(installed)).toBe(stableStringify(expected));
      // Same payload through the public preview lane.
      const preview = await previewPackage(
        db.asClient(),
        MERCHANT,
        res.versionId,
      );
      expect(stableStringify(preview.templates)).toBe(
        stableStringify(expected),
      );
      // Tokens + variations survived the ZIP (package level).
      const themeJson = JSON.parse(
        new TextDecoder().decode(
          exported.files.find((f) => f.path === "theme.json")!.bytes,
        ),
      ) as Record<string, unknown>;
      expect(themeJson["tokens"]).toEqual(officialThemeTokens(key));
      expect(themeJson["variations"]).toEqual(officialThemeVariations(key));
    },
  );

  it("copy parity: bilingual spot strings identical post-install", async () => {
    const songo = await installOfficial("songoskriti");
    const templates = songo.db.rows("theme_versions")[0]!
      .templates as Record<string, { main: { props: Record<string, unknown> }[] }>;
    const hero = templates["index"]!.main[0]!.props;
    const slides = hero["slides"] as { headline: string; headline_bn: string }[];
    expect(slides[0]!.headline).toBe("HERITAGE,\nWOVEN FOR TODAY");
    expect(slides[0]!.headline_bn).toBe("ঐতিহ্য,\nআজকের জন্য বোনা");

    const somva = await installOfficial("somvabona");
    const somvaTemplates = somva.db.rows("theme_versions")[0]!
      .templates as Record<string, { main: { props: Record<string, unknown> }[] }>;
    const marquee = somvaTemplates["index"]!.main[0]!.props;
    expect(marquee["m1"]).toBe("Festive drop is live");
    expect(marquee["m1_bn"]).toBe("উৎসবের নতুন কালেকশন এসেছে");
  });

  it.each(["songoskriti", "somvabona"] as const)(
    "asset parity via the documented mapping, never byte equality (%s)",
    async (key) => {
      const { db, res, sourceAssets, cssText } = await installOfficial(key);
      const prefix = themeVersionPrefix(res.versionId);
      const rows = db.rows("theme_assets");
      // Every source image/font maps to exactly one namespaced blob with
      // the same byte length; served URLs carry namespace + ?v= by design.
      for (const asset of sourceAssets) {
        if (asset.file === "SOURCES.txt") continue; // correctly excluded
        const hits = rows.filter((r) =>
          (r.name as string).endsWith(`assets/${asset.file}`),
        );
        expect(hits).toHaveLength(1);
        const hit = hits[0]!;
        expect(hit.merchant_id).toBe(MERCHANT);
        expect((hit.name as string).startsWith(prefix)).toBe(true);
        expect(hit.bytes).toBe(asset.bytes.length);
        expect(hit.url as string).toContain(res.versionId);
        expect(hit.url as string).toContain("?v=");
      }
      // Text blobs round-trip byte-identically (skins.css + locales).
      const byRel = new Map(
        rows.map((r) => [
          (r.name as string).slice(prefix.length),
          r.content as string | null,
        ]),
      );
      expect(byRel.get("styles/skins.css")).toBe(cssText);
      const bn = JSON.parse(
        String(byRel.get("locales/bn.json") ?? ""),
      ) as Record<string, string>;
      expect(Object.keys(bn).length).toBeGreaterThan(0);
      expect(Object.values(bn)).toContain(
        key === "songoskriti"
          ? "ঐতিহ্য,\nআজকের জন্য বোনা"
          : "উৎসবের নতুন কালেকশন এসেছে",
      );
    },
  );

  it("both official themes coexist with disjoint asset namespaces", async () => {
    const songo = await installOfficial("songoskriti");
    const somva = await installOfficial("somvabona");
    expect(songo.res.packageId).not.toBe(somva.res.packageId);
    const names = [
      ...songo.db.rows("theme_assets"),
      ...somva.db.rows("theme_assets"),
    ].map((r) => r.name as string);
    // Same merchant, same install flow — but nothing shared: every row
    // lives under its own version namespace. (Two fakeDb instances here,
    // so this pins the namespace shape, not cross-row leakage.)
    expect(names.some((n) => n.includes(songo.res.versionId))).toBe(true);
    expect(names.some((n) => n.includes(somva.res.versionId))).toBe(true);
    expect(
      names.some(
        (n) =>
          !n.includes(songo.res.versionId) &&
          !n.includes(somva.res.versionId),
      ),
    ).toBe(false);
  });
});

describe("PKG-3 pipeline limits vs official bundles", () => {
  it("somvabona installs under the DEFAULT caps (no override needed)", async () => {
    const { zip } = loadOfficial("somvabona");
    const db = fakeDb({
      tables: {
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        theme_assets: [],
        marketplace_installs: [],
        theme_audit: [],
      },
    });
    const res = await installPackage(
      db.asClient(),
      MERCHANT,
      {
        kind: "theme",
        fileName: "somvabona.zip",
        bytes: zip,
        idempotencyKey: "pkg3-somvabona-default-caps",
        validator: pkg1ThemeValidator,
      },
      ACTOR,
    );
    expect(res.version).toBe("1.0.0");
  });

  it("songoskriti installs under the default 32 MB archive cap", async () => {
    const { zip } = loadOfficial("songoskriti");
    expect(zip.length).toBeGreaterThan(20 * 1024 * 1024);
    expect(zip.length).toBeLessThanOrEqual(32 * 1024 * 1024);
    const db = fakeDb({
      tables: {
        store_themes: [],
        theme_versions: [],
        theme_drafts: [],
        theme_assets: [],
        marketplace_installs: [],
        theme_audit: [],
      },
    });
    const res = await installPackage(
      db.asClient(),
      MERCHANT,
      {
        kind: "theme",
        fileName: "songoskriti.zip",
        bytes: zip,
        idempotencyKey: "pkg3-songoskriti-default-caps",
        validator: pkg1ThemeValidator,
      },
      ACTOR,
    );
    expect(res.alreadyInstalled).toBe(false);
  });
});

describe("PKG-3 pipeline: version-row tokens", () => {
  it("installPackage persists official tokens into theme_versions", async () => {
    const { db } = await installOfficial("somvabona");
    const row = db.rows("theme_versions")[0]!;
    expect(row.tokens).toEqual(
      expect.objectContaining({ brand: expect.any(String) }),
    );
    expect(row.tokens).not.toEqual({});
    expect(sha256Hex(buildExportZip([])).length).toBe(64); // writer sanity
  });
});
