/**
 * PKG-3 — official theme exporter suite (cases only).
 *
 * Covers `src/lib/theme-export.ts` against the REAL theme sources:
 * determinism (identical input → identical bytes), manifest correctness
 * (the PKG-1 gate accepts `theme.json`), layout-gate acceptance, asset
 * completeness (every template ref shipped, every manifest digest exact,
 * no `/ph/` leftovers), locale extraction, and the fail-closed edges
 * (missing asset throws, non-image inputs skip with a warning).
 *
 * On-disk inputs only (`skins.css`, `public/ph/<theme>/*`); the exporter
 * itself stays pure. The install round-trip lives in
 * `theme-export-parity.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATE_KEYS, type TemplateKey } from "./builder-ast";
import { WIDGET_TYPES } from "./widget-registry";
import { validateThemeManifest } from "./theme-package";
import {
  collectBrokenAssetRefs,
  validatePackageLayout,
  type PackageFile,
} from "./package-zip";
import {
  authoredTemplates,
  buildExportZip,
  buildOfficialSections,
  collectSourceAssetRefs,
  exportOfficialTheme,
  normalizeAssetLists,
  officialThemeTokens,
  officialThemeVariations,
  rewriteThemeUrls,
  sha256Hex,
  type ExportOfficialThemeInput,
  type OfficialThemeKey,
} from "./theme-export";
import { SONGOSKRITI_WIDGET_DEFAULTS } from "./themes/songoskriti/skins";
import { SOMVABONA_WIDGET_DEFAULTS } from "./themes/somvabona/skins";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

const inputCache = new Map<OfficialThemeKey, ExportOfficialThemeInput>();

function themeInputs(key: OfficialThemeKey): ExportOfficialThemeInput {
  const cached = inputCache.get(key);
  if (cached) return cached;
  const cssText = readFileSync(
    join(ROOT, "src", "lib", "themes", key, "skins.css"),
    "utf8",
  );
  const dir = join(ROOT, "public", "ph", key);
  const assets = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort()
    .map((file) => ({ file, bytes: readBytes(join(dir, file)) }));
  const input = { key, version: "1.0.0", cssText, assets };
  inputCache.set(key, input);
  return input;
}

function packageFilesOf(
  input: ExportOfficialThemeInput,
): PackageFile[] {
  const exported = exportOfficialTheme(input);
  return exported.files.map((f) => ({ path: f.path, bytes: f.bytes }));
}

describe("PKG-3 authored template coverage", () => {
  it("songoskriti authors every template key", () => {
    expect(authoredTemplates("songoskriti")).toEqual([
      ...TEMPLATE_KEYS,
    ] as TemplateKey[]);
  });

  it("somvabona authors index/product/collection only (engine synthesizes the rest)", () => {
    // TEMPLATE_KEYS order is index, product, collection — filter preserves it.
    expect(authoredTemplates("somvabona")).toEqual([
      "index",
      "product",
      "collection",
    ]);
  });

  it("section ids are deterministic across renders", () => {
    for (const key of ["songoskriti", "somvabona"] as const) {
      for (const template of authoredTemplates(key)) {
        const first = buildOfficialSections(key, template);
        const second = buildOfficialSections(key, template);
        expect(second).toEqual(first);
      }
    }
  });
});

describe("PKG-3 export determinism", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "identical input yields identical bytes for %s",
    (key) => {
      const input = themeInputs(key);
      const first = exportOfficialTheme(input);
      const second = exportOfficialTheme(input);
      const zipA = buildExportZip(first.files);
      const zipB = buildExportZip(second.files);
      // Digest comparison: vitest deep-equality walks multi-MB buffers
      // element-wise (minutes + worker OOM on the 25 MB theme), while
      // length + sha256 is the same identity claim in milliseconds.
      expect(zipA.length).toBe(zipB.length);
      expect(sha256Hex(zipA)).toBe(sha256Hex(zipB));
      const digestOf = (files: { path: string; bytes: Uint8Array }[]) =>
        files.map((f) => `${f.path}:${f.bytes.length}:${sha256Hex(f.bytes)}`);
      expect(digestOf(second.files)).toEqual(digestOf(first.files));
      // Stable ordering: files sorted by path in both the list and the zip.
      const paths = first.files.map((f) => f.path);
      expect(paths).toEqual([...paths].sort());
    },
  );
});

describe("PKG-3 manifest correctness (PKG-1 gate)", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "theme.json passes validateThemeManifest for %s",
    (key) => {
      const exported = exportOfficialTheme(themeInputs(key));
      const verdict = validateThemeManifest(exported.manifest);
      expect(verdict.ok).toBe(true);
      if (!verdict.ok) return;
      expect(verdict.manifest.templates).toEqual(authoredTemplates(key));
      expect(verdict.manifest.capabilities).toContain("render_storefront");
      expect(verdict.manifest.api).toBe("^3.0.0");
      expect(verdict.manifest.locales).toEqual(["en", "bn"]);
      // Closed widgets only, sorted, no dupes.
      const catalog = new Set<string>(WIDGET_TYPES as readonly string[]);
      for (const w of verdict.manifest.supportedWidgets) {
        expect(catalog.has(w)).toBe(true);
      }
      const sorted = [...verdict.manifest.supportedWidgets].sort();
      expect(verdict.manifest.supportedWidgets).toEqual(sorted);
    },
  );

  it("assetManifest is sorted with exact lowercase digests for every blob", () => {
    for (const key of ["songoskriti", "somvabona"] as const) {
      const exported = exportOfficialTheme(themeInputs(key));
      const manifest = exported.manifest as {
        assetManifest: { path: string; sha256: string }[];
      };
      const paths = manifest.assetManifest.map((a) => a.path);
      expect(paths).toEqual([...paths].sort());
      expect(new Set(paths).size).toBe(paths.length);
      const byPath = new Map(exported.files.map((f) => [f.path, f.bytes]));
      for (const entry of manifest.assetManifest) {
        expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
        const bytes = byPath.get(entry.path);
        expect(bytes).toBeDefined();
        expect(entry.sha256).toBe(
          createHash("sha256").update(bytes!).digest("hex"),
        );
      }
      // Every shipped blob is manifested (assets + skin sheet).
      for (const f of exported.files) {
        if (f.path.startsWith("assets/") || f.path === "styles/skins.css") {
          expect(paths).toContain(f.path);
        }
      }
    }
  });

  it("theme.json carries source truth (tokens + variations + presentation)", () => {
    for (const key of ["songoskriti", "somvabona"] as const) {
      const exported = exportOfficialTheme(themeInputs(key));
      expect(exported.manifest["tokens"]).toEqual(officialThemeTokens(key));
      expect(exported.manifest["variations"]).toEqual(
        officialThemeVariations(key),
      );
      const presentation = exported.manifest["presentation"] as {
        surfaces: string[];
        claims: { surface: string; widget: string }[];
        skinDefaults: Record<string, unknown>;
      };
      expect(presentation.surfaces).toEqual([
        "widget",
        "header",
        "menu",
        "announcement",
        "footer",
      ]);
      expect(presentation.claims).toEqual([
        { surface: "announcement", widget: "announcement_bar" },
        { surface: "menu", widget: "mega_menu" },
        { surface: "header", widget: "mega_menu" },
        { surface: "footer", widget: "footer_sitemap" },
      ]);
      expect(presentation.skinDefaults).toEqual(
        key === "songoskriti"
          ? SONGOSKRITI_WIDGET_DEFAULTS
          : SOMVABONA_WIDGET_DEFAULTS,
      );
    }
  });
});

describe("PKG-3 layout gate + URL hygiene", () => {
  it.each(["songoskriti", "somvabona"] as const)(
    "package passes validatePackageLayout with no broken refs (%s)",
    (key) => {
      const files = packageFilesOf(themeInputs(key));
      const layout = validatePackageLayout(files, "theme");
      expect(layout.manifest["key"]).toBe(key);
      expect(collectBrokenAssetRefs(files)).toEqual([]);
      // No literal presentation/ area (claims ride in theme.json).
      expect(files.some((f) => f.path.startsWith("presentation/"))).toBe(
        false,
      );
    },
  );

  it("no /ph/ source URLs survive in templates or locales", () => {
    for (const key of ["songoskriti", "somvabona"] as const) {
      const exported = exportOfficialTheme(themeInputs(key));
      for (const f of exported.files) {
        if (
          f.path.startsWith("templates/") ||
          f.path.startsWith("locales/")
        ) {
          const text = new TextDecoder().decode(f.bytes);
          expect(text.includes("/ph/")).toBe(false);
        }
      }
    }
  });

  it("referenced set matches the source scan (rewrite loses nothing)", () => {
    for (const key of ["songoskriti", "somvabona"] as const) {
      const expected = new Set<string>();
      for (const template of authoredTemplates(key)) {
        const ast = buildOfficialSections(key, template)!;
        for (const ref of collectSourceAssetRefs(ast, key)) {
          expected.add(ref);
        }
      }
      const exported = exportOfficialTheme(themeInputs(key));
      expect(new Set(exported.referencedAssets)).toEqual(expected);
      const shipped = new Set(
        exported.files
          .filter((f) => f.path.startsWith("assets/"))
          .map((f) => f.path.slice("assets/".length)),
      );
      for (const ref of expected) expect(shipped.has(ref)).toBe(true);
    }
  });
});

describe("PKG-3 locales (bn strings)", () => {
  it("bn.json is non-empty and every value is a non-empty string", () => {
    for (const key of ["songoskriti", "somvabona"] as const) {
      const exported = exportOfficialTheme(themeInputs(key));
      const bn = JSON.parse(
        new TextDecoder().decode(
          exported.files.find((f) => f.path === "locales/bn.json")!.bytes,
        ),
      ) as Record<string, string>;
      expect(Object.keys(bn).length).toBeGreaterThan(0);
      for (const v of Object.values(bn)) {
        expect(typeof v).toBe("string");
        expect(v.length).toBeGreaterThan(0);
      }
    }
  });

  it("spot-checks bilingual copy made it into the package", () => {
    const songo = exportOfficialTheme(themeInputs("songoskriti"));
    const indexText = new TextDecoder().decode(
      songo.files.find((f) => f.path === "templates/index.json")!.bytes,
    );
    expect(indexText).toContain("HERITAGE,\\nWOVEN FOR TODAY");
    expect(indexText).toContain("ঐতিহ্য");
    const bn = JSON.parse(
      new TextDecoder().decode(
        songo.files.find((f) => f.path === "locales/bn.json")!.bytes,
      ),
    ) as Record<string, string>;
    expect(Object.values(bn)).toContain("ঐতিহ্য,\nআজকের জন্য বোনা");

    const somva = exportOfficialTheme(themeInputs("somvabona"));
    const somvaIndex = new TextDecoder().decode(
      somva.files.find((f) => f.path === "templates/index.json")!.bytes,
    );
    expect(somvaIndex).toContain("Festive drop is live");
    expect(somvaIndex).toContain("উৎসবের নতুন কালেকশন এসেছে");
  });
});

describe("PKG-3 fail-closed edges", () => {
  function somvabonaInput(
    assets: ExportOfficialThemeInput["assets"],
  ): ExportOfficialThemeInput {
    const full = themeInputs("somvabona");
    return { ...full, assets };
  }

  it("throws theme-export.missing_asset when a referenced file is absent", () => {
    let code = "no_throw";
    try {
      exportOfficialTheme(somvabonaInput([]));
    } catch (e) {
      code = (e as { code?: string }).code ?? "threw";
    }
    expect(code).toBe("theme-export.missing_asset");
  });

  it("skips non-image inputs (SOURCES.txt) with a warning, keeps the export green", () => {
    const full = themeInputs("somvabona");
    const exported = exportOfficialTheme(full);
    expect(exported.warnings).toContain("asset.skipped:SOURCES.txt");
    expect(
      exported.files.some((f) => f.path.includes("SOURCES")),
    ).toBe(false);
    expect(validateThemeManifest(exported.manifest).ok).toBe(true);

    const filtered = somvabonaInput(
      full.assets.filter((a) => a.file !== "SOURCES.txt"),
    );
    expect(exportOfficialTheme(filtered).warnings).toEqual([]);
  });

  it("refuses unsafe asset basenames", () => {
    let code = "no_throw";
    try {
      exportOfficialTheme(
        somvabonaInput([{ file: "../evil.png", bytes: new Uint8Array([1]) }]),
      );
    } catch (e) {
      code = (e as { code?: string }).code ?? "threw";
    }
    expect(code).toBe("theme-export.unsafe_asset");
  });

  it("rewrite is a pure prefix swap (source render untouched)", () => {
    const ast = buildOfficialSections("songoskriti", "index")!;
    const rewritten = rewriteThemeUrls(ast, "songoskriti");
    expect(JSON.stringify(ast)).toContain("/ph/songoskriti/");
    expect(JSON.stringify(rewritten).includes("/ph/")).toBe(false);
    expect(JSON.stringify(rewritten)).toContain("assets/hero-festive.png");
  });

  it("asset-list normal form: comma strings become ref arrays, singles stay strings", () => {
    expect(
      normalizeAssetLists("assets/a.png, assets/b.png,assets/c.png"),
    ).toEqual(["assets/a.png", "assets/b.png", "assets/c.png"]);
    expect(normalizeAssetLists("assets/a.png")).toBe("assets/a.png");
    expect(normalizeAssetLists("bKash, Nagad, Rocket")).toBe(
      "bKash, Nagad, Rocket",
    );
    // Mixed copy never splits (every part must be an assets/ ref).
    expect(normalizeAssetLists("see assets/a.png, sale ends soon")).toBe(
      "see assets/a.png, sale ends soon",
    );
    // The real multi-image props ship as arrays of resolvable refs.
    const exported = exportOfficialTheme(themeInputs("songoskriti"));
    const index = JSON.parse(
      new TextDecoder().decode(
        exported.files.find((f) => f.path === "templates/index.json")!.bytes,
      ),
    ) as {
      main: { type: string; props: Record<string, unknown> }[];
    };
    const ugc = index.main.find((s) => s.type === "ugc_gallery")!;
    expect(ugc.props["images"]).toEqual([
      "assets/ugc-1.png",
      "assets/ugc-2.png",
      "assets/ugc-3.png",
      "assets/ugc-4.png",
      "assets/ugc-5.jpg",
      "assets/ugc-6.jpg",
    ]);
  });
});
