/**
 * PKG-1 — theme package manifest validation (cases only).
 *
 * Covers `validateThemeManifest` (`src/lib/theme-package.ts`): one valid
 * accept (full + minimal shapes), every rejection reason code, and the
 * boundary values of each closed vocabulary / length rule. Data-only:
 * no DB, no network, no React.
 */
import { describe, expect, it } from "vitest";
import {
  THEME_CAPABILITIES,
  validateThemeManifest,
} from "./theme-package";

const SHA256_EMPTY =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function validManifest() {
  return {
    key: "songoskriti-lite",
    name: "Songoskriti Lite",
    nameBn: "সংস্কৃতি লাইট",
    version: "1.0.0",
    api: "^3.0.0",
    author: "Framique",
    description: "Heritage storefront theme.",
    descriptionBn: "হেরিটেজ স্টোরফ্রন্ট থিম।",
    templates: ["index", "product", "collection"],
    supportedWidgets: [
      "hero",
      "product_grid",
      "footer_sitemap",
      "announcement_bar",
    ],
    pluginDependencies: [
      { ref: "plugin:loyalty-lite/points_bar", version: "^1.0.0" },
    ],
    presentationSurfaces: ["widget", "header", "menu", "announcement", "footer"],
    locales: ["en", "bn"],
    assetManifest: [{ path: "images/hero.webp", sha256: SHA256_EMPTY }],
    capabilities: [
      "read_shop",
      "read_products",
      "read_menus",
      "render_storefront",
    ],
  };
}

function errorsOf(input: unknown): string[] {
  const verdict = validateThemeManifest(input);
  expect(verdict.ok).toBe(false);
  if (verdict.ok) return [];
  return verdict.errors;
}

describe("validateThemeManifest accept paths", () => {
  it("accepts a well-formed manifest and normalises it", () => {
    const verdict = validateThemeManifest(validManifest());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.warnings).toEqual([]);
    expect(verdict.manifest).toMatchObject({
      key: "songoskriti-lite",
      name: "Songoskriti Lite",
      version: "1.0.0",
      api: "^3.0.0",
      templates: ["index", "product", "collection"],
      locales: ["en", "bn"],
    });
    // normalizeScopes sorts (same as plugin permissions).
    expect(verdict.manifest.capabilities).toEqual([
      "read_menus",
      "read_products",
      "read_shop",
      "render_storefront",
    ]);
    expect(verdict.manifest.assetManifest).toEqual([
      { path: "images/hero.webp", sha256: SHA256_EMPTY },
    ]);
  });

  it("accepts the minimal shape (optionals default to empty)", () => {
    const verdict = validateThemeManifest({
      key: "minimal",
      name: "Minimal",
      nameBn: "মিনিমাল",
      version: "0.1.0",
      api: ">=3.0.0 <4.0.0",
      templates: ["index"],
      presentationSurfaces: ["widget"],
      locales: ["en"],
      capabilities: ["render_storefront"],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.supportedWidgets).toEqual([]);
    expect(verdict.manifest.pluginDependencies).toEqual([]);
    expect(verdict.manifest.assetManifest).toEqual([]);
    expect(verdict.manifest.author).toBeUndefined();
  });

  it("accepts a whole-plugin dependency ref and normalises key case", () => {
    const verdict = validateThemeManifest({
      ...validManifest(),
      key: "  My-Theme  ",
      pluginDependencies: [{ ref: "plugin:loyalty-lite", version: "1.2.0" }],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.key).toBe("my-theme");
    expect(verdict.manifest.pluginDependencies).toEqual([
      { ref: "plugin:loyalty-lite", version: "1.2.0" },
    ]);
  });

  it("warns (not rejects) when descriptionBn is missing", () => {
    const { descriptionBn: _drop, ...rest } = validManifest();
    const verdict = validateThemeManifest(rest);
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.warnings).toContain("description.bn_missing");
  });

  it("normalises uppercase sha256 to lowercase hex", () => {
    const verdict = validateThemeManifest({
      ...validManifest(),
      assetManifest: [
        { path: "fonts/body.woff2", sha256: SHA256_EMPTY.toUpperCase() },
      ],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.manifest.assetManifest[0].sha256).toBe(SHA256_EMPTY);
  });
});

describe("validateThemeManifest malformed input (never throws)", () => {
  it.each([null, undefined, "theme", 42, [], ["x"]])(
    "rejects %p as manifest.invalid",
    (input) => {
      expect(() => validateThemeManifest(input)).not.toThrow();
      expect(errorsOf(input)).toEqual(["manifest.invalid"]);
    },
  );

  it("degrades a throwing-shape input to manifest.invalid", () => {
    const evil = {};
    Object.defineProperty(evil, "key", {
      get() {
        throw new Error("boom");
      },
    });
    expect(() => validateThemeManifest(evil)).not.toThrow();
    expect(errorsOf(evil)).toEqual(["manifest.invalid"]);
  });
});

describe("validateThemeManifest identity fields", () => {
  it("rejects bad keys", () => {
    expect(errorsOf({ ...validManifest(), key: "" })).toContain("key");
    expect(errorsOf({ ...validManifest(), key: "my theme!" })).toContain(
      "key",
    );
    expect(errorsOf({ ...validManifest(), key: "ab-" })).toContain("key");
    expect(errorsOf({ ...validManifest(), key: "a".repeat(61) })).toContain(
      "key",
    );
  });

  it("accepts key length boundaries 1 and 60", () => {
    for (const key of ["a", "a".repeat(60)]) {
      const verdict = validateThemeManifest({ ...validManifest(), key });
      expect(verdict.ok).toBe(true);
    }
  });

  it("rejects missing/overlong names", () => {
    expect(errorsOf({ ...validManifest(), name: "" })).toContain("name");
    const { nameBn: _bn, ...noBn } = validManifest();
    expect(errorsOf(noBn)).toContain("nameBn");
    expect(errorsOf({ ...validManifest(), name: "n".repeat(81) })).toContain(
      "name.too_long",
    );
    const ok = validateThemeManifest({
      ...validManifest(),
      name: "n".repeat(80),
    });
    expect(ok.ok).toBe(true);
  });

  it("rejects a bad semver version", () => {
    expect(errorsOf({ ...validManifest(), version: "1.0" })).toContain(
      "version",
    );
    expect(errorsOf({ ...validManifest(), version: "v1.0.0" })).toContain(
      "version",
    );
  });

  it("rejects missing/malformed/incompatible api ranges", () => {
    const { api: _api, ...noApi } = validManifest();
    expect(errorsOf(noApi)).toContain("api");
    expect(errorsOf({ ...validManifest(), api: "later" })).toContain(
      "api_range_invalid",
    );
    expect(errorsOf({ ...validManifest(), api: "~3.0.0" })).toContain(
      "api_range_invalid",
    );
    expect(errorsOf({ ...validManifest(), api: "^4.0.0" })).toContain(
      "api_incompatible",
    );
    expect(errorsOf({ ...validManifest(), api: "^2.5.0" })).toContain(
      "api_incompatible",
    );
    expect(errorsOf({ ...validManifest(), api: ">=4.0.0 <5.0.0" })).toContain(
      "api_incompatible",
    );
  });

  it("rejects bad author/description shapes", () => {
    expect(errorsOf({ ...validManifest(), author: 42 })).toContain("author");
    expect(errorsOf({ ...validManifest(), author: "a".repeat(121) })).toContain(
      "author.too_long",
    );
    expect(
      errorsOf({ ...validManifest(), description: "d".repeat(501) }),
    ).toContain("description.too_long");
    expect(errorsOf({ ...validManifest(), descriptionBn: "" })).toContain(
      "descriptionBn",
    );
  });
});

describe("validateThemeManifest executable-content ban (data-only format)", () => {
  it("rejects executable content in free-text fields", () => {
    expect(
      errorsOf({
        ...validManifest(),
        name: "<script>alert(1)</script>",
      }),
    ).toContain("name.executable");
    expect(
      errorsOf({
        ...validManifest(),
        description: "see javascript:alert(1)",
      }),
    ).toContain("description.executable");
    expect(
      errorsOf({ ...validManifest(), author: "x eval('y')" }),
    ).toContain("author.executable");
  });

  it("rejects executable asset extensions at the boundary", () => {
    expect(
      errorsOf({
        ...validManifest(),
        assetManifest: [{ path: "js/bundle.js", sha256: SHA256_EMPTY }],
      }),
    ).toContain("assetManifest[0].path.executable");
    expect(
      errorsOf({
        ...validManifest(),
        assetManifest: [{ path: "views/page.html", sha256: SHA256_EMPTY }],
      }),
    ).toContain("assetManifest[0].path.executable");
  });
});

describe("validateThemeManifest templates + widgets", () => {
  it("rejects missing/empty/unknown/duplicate templates", () => {
    const { templates: _t, ...noTemplates } = validManifest();
    expect(errorsOf(noTemplates)).toContain("templates");
    expect(
      errorsOf({ ...validManifest(), templates: [] }),
    ).toContain("templates");
    expect(
      errorsOf({ ...validManifest(), templates: ["index", "checkout2"] }),
    ).toContain("templates:checkout2");
    expect(
      errorsOf({ ...validManifest(), templates: ["index", "index"] }),
    ).toContain("templates.duplicate:index");
  });

  it("rejects unknown/duplicate supportedWidgets", () => {
    expect(
      errorsOf({
        ...validManifest(),
        supportedWidgets: ["hero", "mega_banner_xyz"],
      }),
    ).toContain("supportedWidgets:mega_banner_xyz");
    expect(
      errorsOf({ ...validManifest(), supportedWidgets: ["hero", "hero"] }),
    ).toContain("supportedWidgets.duplicate:hero");
    expect(
      errorsOf({ ...validManifest(), supportedWidgets: "hero" }),
    ).toContain("supportedWidgets");
  });
});

describe("validateThemeManifest plugin dependencies", () => {
  it("rejects bad refs, bad versions and duplicate refs", () => {
    expect(
      errorsOf({
        ...validManifest(),
        pluginDependencies: [{ ref: "loyalty-lite", version: "^1.0.0" }],
      }),
    ).toContain("dependencies[0].ref");
    expect(
      errorsOf({
        ...validManifest(),
        pluginDependencies: [{ ref: "plugin:ab", version: "^1.0.0" }],
      }),
    ).toContain("dependencies[0].ref");
    expect(
      errorsOf({
        ...validManifest(),
        pluginDependencies: [
          { ref: "plugin:loyalty-lite/points_bar", version: "later" },
        ],
      }),
    ).toContain("dependencies[0].version");
    expect(
      errorsOf({
        ...validManifest(),
        pluginDependencies: [
          { ref: "plugin:loyalty-lite", version: "^1.0.0" },
          { ref: "plugin:loyalty-lite", version: "^1.1.0" },
        ],
      }),
    ).toContain("dependencies.duplicate:plugin:loyalty-lite");
    expect(
      errorsOf({ ...validManifest(), pluginDependencies: {} }),
    ).toContain("pluginDependencies");
  });
});

describe("validateThemeManifest surfaces + locales", () => {
  it("rejects missing/unknown/duplicate presentation surfaces", () => {
    const { presentationSurfaces: _s, ...noSurfaces } = validManifest();
    expect(errorsOf(noSurfaces)).toContain("presentationSurfaces");
    expect(
      errorsOf({ ...validManifest(), presentationSurfaces: [] }),
    ).toContain("presentationSurfaces");
    expect(
      errorsOf({
        ...validManifest(),
        presentationSurfaces: ["widget", "sidebar"],
      }),
    ).toContain("presentationSurfaces:sidebar");
    expect(
      errorsOf({
        ...validManifest(),
        presentationSurfaces: ["widget", "widget"],
      }),
    ).toContain("presentationSurfaces.duplicate:widget");
  });

  it("rejects missing/unknown/duplicate locales", () => {
    const { locales: _l, ...noLocales } = validManifest();
    expect(errorsOf(noLocales)).toContain("locales");
    expect(errorsOf({ ...validManifest(), locales: [] })).toContain("locales");
    expect(
      errorsOf({ ...validManifest(), locales: ["en", "fr"] }),
    ).toContain("locales:fr");
    expect(errorsOf({ ...validManifest(), locales: ["en", "en"] })).toContain(
      "locales.duplicate:en",
    );
  });
});

describe("validateThemeManifest assets", () => {
  it("rejects bad paths, bad digests and duplicate paths", () => {
    expect(
      errorsOf({
        ...validManifest(),
        assetManifest: [{ path: "/abs/hero.webp", sha256: SHA256_EMPTY }],
      }),
    ).toContain("assetManifest[0].path");
    expect(
      errorsOf({
        ...validManifest(),
        assetManifest: [{ path: "a/../../etc/passwd", sha256: SHA256_EMPTY }],
      }),
    ).toContain("assetManifest[0].path");
    expect(
      errorsOf({
        ...validManifest(),
        assetManifest: [{ path: "images/hero.webp", sha256: "zzz" }],
      }),
    ).toContain("assetManifest[0].sha256");
    expect(
      errorsOf({
        ...validManifest(),
        assetManifest: [
          { path: "images/hero.webp", sha256: SHA256_EMPTY },
          { path: "images/hero.webp", sha256: SHA256_EMPTY },
        ],
      }),
    ).toContain("assetManifest.duplicate:images/hero.webp");
  });
});

describe("validateThemeManifest capabilities (closed allowlist)", () => {
  it("exposes exactly the documented read-only subset", () => {
    expect([...THEME_CAPABILITIES].sort()).toEqual([
      "read_menus",
      "read_products",
      "read_shop",
      "render_storefront",
    ]);
  });

  it("rejects unknown, forbidden and storefront-less grants", () => {
    const { capabilities: _c, ...noCaps } = validManifest();
    expect(errorsOf(noCaps)).toContain("capabilities");
    expect(
      errorsOf({ ...validManifest(), capabilities: ["drain_wallet"] }),
    ).toContain("capabilities:drain_wallet");
    expect(
      errorsOf({ ...validManifest(), capabilities: ["write_products"] }),
    ).toContain("capabilities.forbidden:write_products");
    expect(
      errorsOf({ ...validManifest(), capabilities: ["read_customers"] }),
    ).toContain("capabilities.forbidden:read_customers");
    expect(errorsOf({ ...validManifest(), capabilities: ["read_shop"] })).toContain(
      "capabilities.render_storefront_required",
    );
  });
});
