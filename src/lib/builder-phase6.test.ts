import { describe, expect, it } from "vitest";
import {
  ADVANCED_FIELDS,
  advancedAttrs,
  advancedCssFor,
  isAdvancedKey,
  scopedCss,
} from "./builder-advanced";
import {
  DYNAMIC_TAGS,
  dynamicTag,
  hasDynamicTag,
  resolveDynamicProps,
  resolveDynamicText,
} from "./dynamic-tags";
import {
  DEFAULT_GLOBALS,
  globalRef,
  globalRefId,
  globalsToCss,
  parseGlobals,
} from "./theme-globals";
import {
  DEFAULT_TOKENS,
  TEMPLATE_KEYS,
  lintTemplate,
  parseTokens,
  tokensToCss,
} from "./builder-ast";
import type { Section } from "./builder-ast";

const node = (id: string, props: Record<string, unknown>): Section =>
  ({ id, type: "heading", props }) as unknown as Section;

describe("advanced controls", () => {
  it("exposes one field per advanced key, all on the advanced panel", () => {
    expect(ADVANCED_FIELDS.every((field) => field.panel === "advanced")).toBe(
      true,
    );
    expect(ADVANCED_FIELDS.every((field) => isAdvancedKey(field.key))).toBe(
      true,
    );
    expect(new Set(ADVANCED_FIELDS.map((f) => f.key)).size).toBe(
      ADVANCED_FIELDS.length,
    );
  });

  it("clamps spacing and stacking so a widget cannot escape the page", () => {
    const attrs = advancedAttrs({
      advMarginTop: 9999,
      advZIndex: 100000,
      advPadX: -50,
    });
    expect(attrs.style["marginTop"]).toBe("240px");
    expect(attrs.style["zIndex"]).toBe("999");
    expect(attrs.style["paddingInline"]).toBe("0px");
  });

  it("strips anything unsafe out of custom classes and ids", () => {
    const attrs = advancedAttrs({
      advClass: 'promo" onload=x hero',
      advId: "1bad id",
    });
    expect(attrs.className).toBe("promo onloadx hero");
    expect(attrs.className).not.toContain('"');
    expect(attrs.id).toBeUndefined();
  });

  it("falls back to no animation for an unknown value", () => {
    expect(advancedAttrs({ advAnimation: "explode" }).animation).toBe("none");
    expect(advancedAttrs({ advAnimation: "zoom" }).animation).toBe("zoom");
  });

  it("scopes custom CSS to the node, however it was written", () => {
    expect(scopedCss("abc", "selector{color:red}")).toBe(
      '[data-fq-node="abc"]{color:red}',
    );
    expect(scopedCss("abc", "color:red")).toBe(
      '[data-fq-node="abc"]{color:red}',
    );
    // A rule that names some other selector is still confined to this node.
    expect(scopedCss("abc", "body{display:none}")).toContain(
      '[data-fq-node="abc"]',
    );
    expect(scopedCss("abc", "body{display:none}")).not.toMatch(/^body/);
  });

  it("drops imports, scripts and javascript urls from custom CSS", () => {
    const css = scopedCss(
      "abc",
      "@import url(evil.css); selector{background:url(javascript:alert(1))}",
    );
    expect(css).not.toContain("@import");
    expect(css).not.toContain("javascript:");
  });

  it("caps the page stylesheet so one node cannot bloat every response", () => {
    const sections = Array.from({ length: 200 }, (_, i) =>
      node(`n${i}`, {
        advCss: `selector{color:#${(i % 9) + 1}00000;padding:${i}px}`,
      }),
    );
    expect(advancedCssFor(sections).length).toBeLessThanOrEqual(24_100);
  });
});

describe("dynamic tags", () => {
  it("resolves a known tag from context", () => {
    expect(
      resolveDynamicText("Buy {{product.title}}", {
        product: { title: "Saree" },
      }),
    ).toBe("Buy Saree");
  });

  it("uses the fallback, never the raw braces, when data is missing", () => {
    expect(resolveDynamicText("{{product.sku|No SKU}}", {})).toBe("No SKU");
    expect(resolveDynamicText("{{product.sku}}", {})).toBe("");
    expect(resolveDynamicText("{{nope.thing|—}}", {})).toBe("—");
  });

  it("never leaves template syntax on the page for any known tag", () => {
    for (const tag of DYNAMIC_TAGS) {
      expect(resolveDynamicText(dynamicTag(tag.value, "x"), {})).not.toContain(
        "{{",
      );
    }
  });

  it("detects tags and leaves plain copy untouched by identity", () => {
    expect(hasDynamicTag("{{site.title}}")).toBe(true);
    expect(hasDynamicTag("plain")).toBe(false);
    const props = { text: "plain" };
    expect(resolveDynamicProps(props, {})).toBe(props);
  });

  it("resolves repeater rows one level deep", () => {
    const out = resolveDynamicProps(
      { rows: [{ label: "{{product.title}}" }] as never },
      { product: { title: "Panjabi" } },
    );
    expect((out["rows"] as unknown as { label: string }[])[0]!.label).toBe(
      "Panjabi",
    );
  });
});

describe("global styles", () => {
  it("round-trips a binding reference", () => {
    expect(globalRefId(globalRef("primary"))).toBe("primary");
    expect(globalRefId("#ff0000")).toBeNull();
    expect(globalRefId(globalRef("heading", "font"), "font")).toBe("heading");
    // A colour binding is not a font binding.
    expect(globalRefId(globalRef("heading", "font"), "color")).toBeNull();
  });

  it("rejects malformed globals and keeps the defaults", () => {
    const parsed = parseGlobals({
      colors: [{ id: "Bad Id!", value: "red" }],
      fonts: [],
    });
    expect(parsed.colors).toEqual(DEFAULT_GLOBALS.colors);
  });

  it("emits one custom property per global", () => {
    const css = globalsToCss(DEFAULT_GLOBALS);
    expect(css["--fq-g-primary"]).toBe("#0F766E");
    expect(css["--fq-gf-heading"]).toContain("Noto Sans Bengali");
  });

  it("puts globals on the theme surface alongside the tokens", () => {
    const css = tokensToCss(DEFAULT_TOKENS);
    expect(css["--fq-g-primary"]).toBe("#0F766E");
  });

  it("survives a tokens round-trip", () => {
    const tokens = parseTokens({
      ...DEFAULT_TOKENS,
      globals: {
        colors: [{ id: "brandx", name: "Brand", value: "#123456" }],
        fonts: [],
      },
    });
    expect(tokens.globals.colors[0]!.value).toBe("#123456");
  });
});

describe("search template", () => {
  it("is a first-class template part", () => {
    expect(TEMPLATE_KEYS).toContain("search");
  });
});

describe("advanced props persist through parse", () => {
  it("keeps adv* props on parseAst round-trip", async () => {
    const { parseAst } = await import("./builder-ast");
    const ast = parseAst({
      header: [],
      main: [
        {
          id: "s1",
          type: "heading",
          props: {
            text: "Hello",
            advAnimation: "zoom",
            advMarginTop: 24,
            advId: "hero-title",
          },
        },
      ],
      footer: [],
    });
    const props = (ast.main[0] as { props: Record<string, unknown> }).props;
    expect(props["advAnimation"]).toBe("zoom");
    expect(props["advMarginTop"]).toBe(24);
    expect(props["advId"]).toBe("hero-title");
  });

  it("drops unknown adv impostors and coerces out-of-range values", async () => {
    const { parseAst } = await import("./builder-ast");
    const ast = parseAst({
      header: [],
      main: [
        {
          id: "s1",
          type: "heading",
          props: { text: "Hi", advAnimation: "explode", advEvil: "x" },
        },
      ],
      footer: [],
    });
    const props = (ast.main[0] as { props: Record<string, unknown> }).props;
    expect(props).not.toHaveProperty("advAnimation");
    expect(props).not.toHaveProperty("advEvil");
  });
});

describe("per-device overrides persist through parse", () => {
  it("keeps bp layers for responsive fields, drops them for fixed fields", async () => {
    const { parseAst } = await import("./builder-ast");
    const ast = parseAst({
      header: [],
      main: [
        {
          id: "s1",
          type: "product_rail",
          props: { heading: "Rail", limit: 10 },
          bp: { mobile: { limit: 4, heading: "Tiny" } },
        },
      ],
      footer: [],
    });
    const sec = ast.main[0] as {
      props: Record<string, unknown>;
      bp?: Record<string, Record<string, unknown>>;
    };
    expect(sec.props["limit"]).toBe(10);
    expect(sec.bp?.["mobile"]?.["limit"]).toBe(4);
    expect(sec.bp?.["mobile"]?.["heading"]).toBeUndefined();
  });
});

describe("theme-motion manifest", () => {
  it("resolves known effects and collapses unknown to none", async () => {
    const { motionEffectOf, isEntranceEffect } = await import(
      "./builder-advanced"
    );
    expect(motionEffectOf("stagger-grid")).toBe("stagger-grid");
    expect(motionEffectOf("marquee")).toBe("marquee");
    expect(motionEffectOf("line-reveal")).toBe("line-reveal");
    expect(motionEffectOf("explode")).toBe("none");
    expect(motionEffectOf(undefined)).toBe("none");
    expect(isEntranceEffect("stagger-grid")).toBe(true);
    expect(isEntranceEffect("marquee")).toBe(false);
    expect(isEntranceEffect("none")).toBe(false);
  });

  it("keeps advMotion through parseAst round-trip", async () => {
    const { parseAst } = await import("./builder-ast");
    const ast = parseAst({
      header: [],
      main: [
        {
          id: "s1",
          type: "heading",
          props: { text: "Hi", advMotion: "stagger-grid" },
        },
      ],
      footer: [],
    });
    const props = (ast.main[0] as { props: Record<string, unknown> }).props;
    expect(props["advMotion"]).toBe("stagger-grid");
  });
});
