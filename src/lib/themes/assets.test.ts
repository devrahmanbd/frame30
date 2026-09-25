import { describe, expect, it } from "vitest";
import {
  assetKindFromName,
  assetsForTheme,
  assetSummary,
  cleanAssetName,
  combineThemeCss,
  cssStats,
  filterSkinCss,
  formatAssetBytes,
  isCssSafe,
  parseTokenOverrides,
  sanitiseThemeCss,
  skinKeyForAssetName,
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
    expect(tokensToCss({ "color-primary": "#000" })).toBe(
      ":root{--color-primary:#000}",
    );
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
        asset({
          id: "3",
          kind: "font",
          name: "Inter.woff2",
          url: "/f/Inter.woff2",
        }),
        asset({
          id: "4",
          kind: "css",
          themeId: "other",
          content: ".b{color:blue}",
        }),
        asset({
          id: "5",
          kind: "css",
          enabled: false,
          content: ".c{color:green}",
        }),
      ],
      "mine",
    );
    expect(css.indexOf("--color-primary")).toBeLessThan(
      css.indexOf("@font-face"),
    );
    expect(css.indexOf("@font-face")).toBeLessThan(
      css.indexOf(".a{color:red}"),
    );
    expect(css).not.toContain(".b{color:blue}");
    expect(css).not.toContain(".c{color:green}");
  });

  it("sanitises stored css on the way out", () => {
    const css = combineThemeCss(
      [asset({ content: "@import 'x'; .a{color:red}" })],
      null,
    );
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
    expect(assetsForTheme(list, "t1").map((a) => a.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
  });

  it("formats sizes and summaries", () => {
    expect(formatAssetBytes(512)).toBe("512 B");
    expect(formatAssetBytes(2048)).toBe("2.0 KB");
    expect(formatAssetBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    expect(
      assetSummary(asset({ bytes: 1024, themeId: "t1", enabled: false })),
    ).toBe("This theme · 1.0 KB · off");
  });
});

describe("skin asset names (lane B2-1)", () => {
  it("keys skin-<type>-<skin>.css to type:skin", () => {
    expect(skinKeyForAssetName("skin-product_rail-minimal.css")).toBe(
      "product_rail:minimal",
    );
    expect(skinKeyForAssetName("skin-hero_carousel-split.css")).toBe(
      "hero_carousel:split",
    );
    expect(skinKeyForAssetName("  skin-testimonials-wall.css  ")).toBe(
      "testimonials:wall",
    );
  });

  it("fails open: non-skin names return null and combine like ordinary css", () => {
    for (const name of [
      "custom.css",
      "skin.css",
      "skin-minimal.css",
      "skin-a-b.css.map",
      "skin-.css",
      "",
      "   ",
      "skin-a/b.css",
    ])
      expect(skinKeyForAssetName(name), name).toBeNull();
    expect(skinKeyForAssetName(null)).toBeNull();
    expect(skinKeyForAssetName(undefined)).toBeNull();
  });
});

describe("combineThemeCss with used skins (lane B2-1)", () => {
  const skin = (name: string, content: string, id = name) =>
    asset({ id, kind: "css", name, content });
  const list = () => [
    skin("skin-product_rail-minimal.css", ".minimal{color:red}", "skin"),
    skin("skin-hero_carousel-split.css", ".split{color:blue}", "skin2"),
    asset({ id: "base", kind: "css", name: "custom.css", content: ".base{}" }),
    asset({
      id: "tokens",
      kind: "tokens",
      name: "tokens.json",
      content: JSON.stringify({ "color-primary": "#111" }),
    }),
  ];

  it("omitted list keeps today's behavior: every scoped asset combines", () => {
    for (const used of [undefined, null] as const) {
      const css = combineThemeCss(list(), null, used);
      expect(css).toContain(".minimal{color:red}");
      expect(css).toContain(".split{color:blue}");
      expect(css).toContain(".base{}");
      expect(css).toContain("--color-primary");
    }
  });

  it("includes only the skin assets the page uses", () => {
    const css = combineThemeCss(list(), null, ["product_rail:minimal"]);
    expect(css).toContain(".minimal{color:red}");
    expect(css).not.toContain(".split{color:blue}");
    expect(css).toContain(".base{}");
    expect(css).toContain("--color-primary");
  });

  it("an empty used list drops skin assets but keeps everything else", () => {
    const css = combineThemeCss(list(), null, []);
    expect(css).not.toContain(".minimal{color:red}");
    expect(css).not.toContain(".split{color:blue}");
    expect(css).toContain(".base{}");
    expect(css).toContain("--color-primary");
  });

  it("still honours theme scope and enabled flags", () => {
    const css = combineThemeCss(
      [
        skin("skin-product_rail-minimal.css", ".minimal{}", "s1"),
        asset({
          id: "s2",
          kind: "css",
          name: "skin-product_rail-minimal.css",
          content: ".other-theme{}",
          themeId: "other",
        }),
        asset({
          id: "s3",
          kind: "css",
          name: "skin-product_rail-minimal.css",
          content: ".disabled{}",
          enabled: false,
        }),
      ],
      "mine",
      ["product_rail:minimal"],
    );
    expect(css).toContain(".minimal{}");
    expect(css).not.toContain(".other-theme{}");
    expect(css).not.toContain(".disabled{}");
  });

  it("non-css assets named like skins are never filtered", () => {
    const css = combineThemeCss(
      [
        asset({
          id: "t",
          kind: "tokens",
          name: "skin-product_rail-minimal.json",
          content: JSON.stringify({ "color-primary": "#222" }),
        }),
      ],
      null,
      [],
    );
    expect(css).toContain("--color-primary");
  });
});

describe("filterSkinCss (lane B2-1)", () => {
  const SHEET = [
    ".base{color:black}",
    '[data-widget="product_rail"][data-skin="minimal"]{color:red}',
    '[data-widget="product_rail"][data-skin="editorial"]{color:green}',
    '[data-widget="hero_carousel"][data-skin="split"] h2{color:blue}',
  ].join("\n");

  it("returns css without skin selectors byte-identical", () => {
    const css = ".a{color:red}\n:root{--x:1}";
    expect(filterSkinCss(css, [])).toBe(css);
    expect(filterSkinCss(css, ["product_rail:minimal"])).toBe(css);
  });

  it("keeps used skins plus ordinary rules, drops unused skins", () => {
    const css = filterSkinCss(SHEET, ["product_rail:minimal"]);
    expect(css).toContain(".base{color:black}");
    expect(css).toContain('[data-skin="minimal"]');
    expect(css).not.toContain('[data-skin="editorial"]');
    expect(css).not.toContain('[data-skin="split"]');
  });

  it("an empty used list drops every skin rule and keeps the rest", () => {
    const css = filterSkinCss(SHEET, []);
    expect(css).toContain(".base{color:black}");
    expect(css).not.toContain("data-skin=");
  });

  it("an undefined used list fails open to the input unchanged", () => {
    expect(filterSkinCss(SHEET, undefined)).toBe(SHEET);
    expect(filterSkinCss(SHEET, null)).toBe(SHEET);
  });

  it("empty input stays empty", () => {
    expect(filterSkinCss("", [])).toBe("");
    expect(filterSkinCss(null, [])).toBe("");
    expect(filterSkinCss(undefined, [])).toBe("");
  });

  it("recurses into @media: keeps wrappers with used inners, drops emptied ones", () => {
    const css = [
      "@media (max-width:767px){",
      '[data-widget="product_rail"][data-skin="minimal"] ul{grid:none}',
      '[data-widget="product_rail"][data-skin="editorial"] ul{grid:none}',
      "}",
      "@media (prefers-reduced-motion: reduce){",
      '[data-widget="product_rail"][data-skin="editorial"] *{animation:none}',
      "}",
      ".keep{color:black}",
    ].join("\n");
    const out = filterSkinCss(css, ["product_rail:minimal"]);
    expect(out).toContain("max-width:767px");
    expect(out).toContain('[data-skin="minimal"]');
    expect(out).not.toContain('[data-skin="editorial"]');
    expect(out).not.toContain("prefers-reduced-motion");
    expect(out).toContain(".keep{color:black}");
  });

  it("keeps generic [data-widget][data-skin] rules while any skin is used", () => {
    const css = [
      "[data-widget][data-skin]{--gap:12px}",
      '[data-widget="product_rail"][data-skin="minimal"]{color:red}',
    ].join("\n");
    expect(filterSkinCss(css, ["product_rail:minimal"])).toContain("--gap");
    const dropped = filterSkinCss(css, []);
    expect(dropped).not.toContain("--gap");
    expect(dropped).not.toContain("data-skin=");
  });

  it("keeps mixed selector lists that mention any neutral selector", () => {
    const css = [
      '[data-widget="product_rail"][data-skin="editorial"], .promo{color:red}',
      "[data-widget=\"testimonials\"][data-skin='wall']{color:blue}",
    ].join("\n");
    const out = filterSkinCss(css, ["product_rail:minimal"]);
    expect(out).toContain(".promo");
    expect(out).not.toContain("[data-skin='wall']");
  });

  it("keeps @font-face and other at-rule blocks whole", () => {
    const css = [
      '@font-face{font-family:"X";src:url("/x.woff2")}',
      '[data-widget="product_rail"][data-skin="editorial"]{color:green}',
    ].join("\n");
    const out = filterSkinCss(css, []);
    expect(out).toContain("@font-face");
    expect(out).not.toContain('[data-skin="editorial"]');
  });

  it("fails open on unbalanced or stray input", () => {
    const broken = ".a{color:red";
    expect(filterSkinCss(broken, [])).toBe(broken);
    const stray = ".a{color:red}}";
    expect(filterSkinCss(stray, [])).toBe(stray);
    const braceInString = '.a{content:"{"}';
    expect(filterSkinCss(braceInString, [])).toBe(braceInString);
  });

  it("ignores skin-looking text inside comments", () => {
    const css = [
      '/* [data-widget="product_rail"][data-skin="editorial"] note */',
      ".real{color:black}",
    ].join("\n");
    expect(filterSkinCss(css, [])).toBe(css);
  });
});
