import { describe, expect, it } from "vitest";
import {
  assetKindFromName,
  assetsForTheme,
  assetSummary,
  cleanAssetName,
  combineThemeCss,
  cssStats,
  formatAssetBytes,
  isCssSafe,
  parseTokenOverrides,
  sanitiseThemeCss,
  sortAssets,
  tokensToCss,
  validateCss,
  validateTokens,
  type ThemeAsset,
} from "./assets";

const asset = (over: Partial<ThemeAsset>): ThemeAsset => ({
  id: over.id ?? "a1",
  themeId: over.themeId ?? null,
  kind: over.kind ?? "css",
  name: over.name ?? "custom.css",
  content: over.content ?? null,
  url: over.url ?? null,
  bytes: over.bytes ?? 0,
  enabled: over.enabled ?? true,
  updatedAt: over.updatedAt ?? "2026-01-01T00:00:00Z",
});

describe("naming", () => {
  it("maps extensions to kinds", () => {
    expect(assetKindFromName("main.css")).toBe("css");
    expect(assetKindFromName("tokens.json")).toBe("tokens");
    expect(assetKindFromName("Inter.woff2")).toBe("font");
    expect(assetKindFromName("hero.PNG")).toBe("image");
    expect(assetKindFromName("readme")).toBe("css");
  });

  it("cleans names and never returns empty", () => {
    expect(cleanAssetName("  my   file.css ")).toBe("my file.css");
    expect(cleanAssetName("   ")).toBe("Untitled asset");
  });
});

describe("css sanitiser", () => {
  it("strips imports, script vectors and style tags", () => {
    const result = sanitiseThemeCss(
      '@import url("//evil"); a{background:url(javascript:alert(1))} </style><script>',
    );
    expect(result.css).not.toContain("@import");
    expect(result.css).not.toContain("javascript:");
    expect(result.css).not.toContain("</style>");
    expect(result.removed.length).toBeGreaterThanOrEqual(3);
  });

  it("leaves ordinary css untouched", () => {
    const css = ".fq-hero{padding:32px;color:#111}";
    expect(sanitiseThemeCss(css).css).toBe(css);
    expect(isCssSafe(css)).toBe(true);
    expect(isCssSafe("@import 'x';")).toBe(false);
  });

  it("counts rules and rejects unbalanced or oversized css", () => {
    const stats = cssStats("a{color:red}\nb{color:blue}");
    expect(stats.rules).toBe(2);
    expect(stats.lines).toBe(2);
    expect(stats.overLimit).toBe(false);
    expect(validateCss("a{color:red}")).toBeNull();
    expect(validateCss("a{color:red")).toBe("css.unbalanced");
    expect(validateCss(`a{${"x".repeat(100_001)}}`)).toBe("css.too_large");
  });
});

describe("token overrides", () => {
  it("keeps safe names and values only", () => {
    const tokens = parseTokenOverrides(
      JSON.stringify({
        "--color-primary": "#1877f2",
        "Bad Name": "red",
        "color-danger": "red;}body{display:none",
        "radius-md": "12px",
        nested: { a: 1 },
      }),
    );
    expect(tokens).toEqual({ "color-primary": "#1877f2", "radius-md": "12px" });
  });

  it("survives bad json", () => {
    expect(parseTokenOverrides("{nope")).toEqual({});
    expect(parseTokenOverrides(null)).toEqual({});
    expect(validateTokens("{nope")).toBe("tokens.json");
    expect(validateTokens("[]")).toBe("tokens.shape");
    expect(validateTokens("")).toBeNull();
  });

  it("projects tokens into custom properties", () => {
    expect(tokensToCss({ "color-primary": "#000" })).toBe(":root{--color-primary:#000}");
    expect(tokensToCss({})).toBe("");
  });
});

describe("combining", () => {
  it("orders tokens, fonts then css and honours scope", () => {
    const css = combineThemeCss(
      [
        asset({ id: "1", kind: "css", content: ".a{color:red}" }),
        asset({
          id: "2",
          kind: "tokens",
          content: JSON.stringify({ "color-primary": "#111" }),
        }),
        asset({ id: "3", kind: "font", name: "Inter.woff2", url: "/f/Inter.woff2" }),
        asset({ id: "4", kind: "css", themeId: "other", content: ".b{color:blue}" }),
        asset({ id: "5", kind: "css", enabled: false, content: ".c{color:green}" }),
      ],
      "mine",
    );
    expect(css.indexOf("--color-primary")).toBeLessThan(css.indexOf("@font-face"));
    expect(css.indexOf("@font-face")).toBeLessThan(css.indexOf(".a{color:red}"));
    expect(css).not.toContain(".b{color:blue}");
    expect(css).not.toContain(".c{color:green}");
  });

  it("sanitises stored css on the way out", () => {
    const css = combineThemeCss([asset({ content: "@import 'x'; .a{color:red}" })], null);
    expect(css).not.toContain("@import");
    expect(css).toContain(".a{color:red}");
  });
});

describe("listing helpers", () => {
  it("sorts by kind then name and filters by theme", () => {
    const list = [
      asset({ id: "1", kind: "image", name: "b.png" }),
      asset({ id: "2", kind: "css", name: "z.css" }),
      asset({ id: "3", kind: "css", name: "a.css", themeId: "t1" }),
      asset({ id: "4", kind: "css", name: "x.css", themeId: "t2" }),
    ];
    expect(sortAssets(list).map((a) => a.id)).toEqual(["3", "4", "2", "1"]);
    expect(assetsForTheme(list, "t1").map((a) => a.id)).toEqual(["3", "2", "1"]);
  });

  it("formats sizes and summaries", () => {
    expect(formatAssetBytes(512)).toBe("512 B");
    expect(formatAssetBytes(2048)).toBe("2.0 KB");
    expect(formatAssetBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(assetSummary(asset({ bytes: 1024, themeId: "t1", enabled: false }))).toBe(
      "This theme · 1.0 KB · off",
    );
  });
});
