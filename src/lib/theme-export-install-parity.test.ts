/**
 * O1 — official-ZIP-through-installPackage parity proof (cases only).
 *
 * Exported official ZIP (`exportOfficialTheme` + `buildExportZip`) installs
 * through the REAL `installPackage` pipeline (`pkg1ThemeValidator`, DEFAULT
 * caps — no overrides) and the installed rows render byte-identically to the
 * source render. Per theme (`songoskriti`, `somvabona`):
 * - structure: `theme_versions.templates` digest-equals the source-rendered
 *   ASTs (all authored templates, package URL form + asset-list normal form);
 * - render lane: `previewPackage` templates digest-equal the same expectation;
 * - tokens: version-row `tokens` strict-equals source tokens; `variations`
 *   strict-equal at the `theme.json` package level (they ride inertly there);
 * - copy: bilingual EN/BN spot strings identical post-install;
 * - assets: every source blob maps to exactly one namespaced installed row
 *   (suffix + byte length); served URLs carry namespace + `?v=` by design and
 *   are asserted through the mapping, never byte equality.
 *
 * No network, no real database: persistence goes through `fakeDb`. The
 * install pipeline is used read-only (no edits to pipeline modules here).
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

/** Source render in package URL form + asset-list normal form, with envelope. */
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

function digestOf(value: unknown): string {
  return sha256Hex(new TextEncoder().encode(stableStringify(value)));
}

async function installOfficial(key: OfficialThemeKey) {
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
  // DEFAULT caps throughout: no limit overrides. Official bundles must
  // install zero-config (songoskriti ~25 MB < 32 MB archive cap).
  const res = await installPackage(
    db.asClient(),
    MERCHANT,
    {
      kind: "theme",
      fileName: `${key}.zip`,
      bytes: loaded.zip,
      idempotencyKey: `o1-install-parity-${key}`,
      validator: pkg1ThemeValidator,
    },
    ACTOR,
  );
  expect(res.version).toBe("1.0.0");
  expect(res.alreadyInstalled).toBe(false);
  return { db, res, ...loaded };
}

describe("O1 official ZIP install parity (default caps)", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "installed rows render byte-identically to the source render (%s)",
    async (key) => {
      const { db, res, exported, sourceAssets, cssText } =
        await installOfficial(key);

      // Expectation: every authored template, source render, package form.
      const expected: Record<string, unknown> = {};
      for (const template of authoredTemplates(key)) {
        expected[template] = expectedTemplate(key, template, "1.0.0");
      }

      // Structure: stored templates digest-equal the source render.
      // Digest comparison (length + sha256) is the same identity claim as
      // deep-equality without the element-wise walk on multi-MB ASTs.
      const rows = db.rows("theme_versions");
      expect(rows).toHaveLength(1);
      const installed = rows[0]!.templates as Record<string, unknown>;
      expect(digestOf(installed)).toBe(digestOf(expected));

      // Render lane: public preview serves the identical payload.
      const preview = await previewPackage(
        db.asClient(),
        MERCHANT,
        res.versionId,
      );
      expect(digestOf(preview.templates)).toBe(digestOf(expected));

      // Tokens: version row strict-equals source tokens (not just shaped).
      expect(rows[0]!.tokens).toEqual(officialThemeTokens(key));
      // Variations ride inertly in theme.json (package level).
      const themeJson = JSON.parse(
        new TextDecoder().decode(
          exported.files.find((f) => f.path === "theme.json")!.bytes,
        ),
      ) as Record<string, unknown>;
      expect(themeJson["tokens"]).toEqual(officialThemeTokens(key));
      expect(themeJson["variations"]).toEqual(
        officialThemeVariations(key),
      );

      // Copy: bilingual spot strings identical post-install.
      if (key === "songoskriti") {
        const templates = installed as Record<
          string,
          { main: { props: Record<string, unknown> }[] }
        >;
        const hero = templates["index"]!.main[0]!.props;
        const slides = hero["slides"] as {
          headline: string;
          headline_bn: string;
        }[];
        expect(slides[0]!.headline).toBe("HERITAGE,\nWOVEN FOR TODAY");
        expect(slides[0]!.headline_bn).toBe("ঐতিহ্য,\nআজকের জন্য বোনা");
      } else {
        const templates = installed as Record<
          string,
          { main: { props: Record<string, unknown> }[] }
        >;
        const marquee = templates["index"]!.main[0]!.props;
        expect(marquee["m1"]).toBe("Festive drop is live");
        expect(marquee["m1_bn"]).toBe("উৎসবের নতুন কালেকশন এসেছে");
      }

      // Asset mapping: every source blob → exactly one namespaced row with
      // the same byte length; served URLs carry namespace + ?v= by design.
      const prefix = themeVersionPrefix(res.versionId);
      const assetRows = db.rows("theme_assets");
      for (const asset of sourceAssets) {
        if (asset.file === "SOURCES.txt") continue; // correctly excluded
        const hits = assetRows.filter((r) =>
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
      // Text blobs round-trip byte-identically (skins.css + bn locales).
      const byRel = new Map(
        assetRows.map((r) => [
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
    120_000,
  );
});
