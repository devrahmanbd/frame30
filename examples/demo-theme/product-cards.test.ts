/**
 * Demo theme fixture — bespoke product cards proof (section 3 of 3).
 *
 * Fixture: `examples/demo-theme/product-cards.ts` fed only by `commerce.ts`
 * plus shopper variant choices; every action leaves through the
 * `buildVariantSelectEnvelope` / `buildCartAddEnvelope` builders that the
 * bridge suite (`commerce-bridge.test.ts`) authorizes against the real
 * bridge v2 validators.
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md` §2/§5.
 *
 * Run: `npx vitest run --config examples/demo-theme/vitest.config.ts`
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { demoCommerceFixture } from "./fixture-bundles";
import {
  buildCardsSection,
  buildCartAddEnvelope,
  buildVariantSelectEnvelope,
  CARDS_COMPONENT_NAME,
  CARDS_SECTION_KEY,
  CARDS_SECTION_SLOT,
  coerceCardsSettings,
  renderProductCards,
  resolveSelectedVariant,
} from "./product-cards";

const here = dirname(fileURLToPath(import.meta.url));
/** Theme source under test — docs and tests are deliberately excluded. */
const THEME_SOURCE_FILES = [
  "dev.theme.json",
  "manifest.ts",
  "commerce.ts",
  "shared.ts",
  "story-block.ts",
  "media-carousel.ts",
  "product-cards.ts",
  "fixture-bundles.ts",
];
const themeSource = () =>
  THEME_SOURCE_FILES.map((file) => ({
    file,
    text: readFileSync(join(here, file), "utf8"),
  }));

describe("product cards — merchant settings render", () => {
  it("renders the heading and the merchant product rail", () => {
    const out = renderProductCards({
      settings: { heading: "Autumn picks" },
      products: ["prod-1", "prod-3"],
      commerce: demoCommerceFixture(),
    });
    expect(out.heading).toBe("Autumn picks");
    expect(out.html).toContain("Autumn picks");
    expect(out.products.map((product) => product.id)).toEqual([
      "prod-1",
      "prod-3",
    ]);
    expect(out.html).toContain("River Clay Vase");
    expect(out.html).toContain("Hill Tea Set");
  });

  it("renders a variant selector per card with readiness notes", () => {
    const out = renderProductCards({
      settings: {},
      products: ["prod-1"],
      commerce: demoCommerceFixture(),
    });
    expect(out.html).toContain('data-variant-select="prod-1"');
    expect(out.html).toContain('value="var-1a"');
    expect(out.html).toContain('value="var-1b"');
    expect(out.html).toContain("Available");
  });

  it("honours the shopper selection on render", () => {
    const out = renderProductCards({
      settings: {},
      products: ["prod-1"],
      commerce: demoCommerceFixture(),
      selection: { "prod-1": "var-1b" },
    });
    expect(out.html).toContain('value="var-1b" selected="selected"');
    expect(out.html).toContain('data-cart-add="var-1b"');
  });

  it("renders copy escaped (merchant text is copy only, never markup)", () => {
    const out = renderProductCards({
      settings: { heading: "<img src=x onerror=alert(1)>" },
      products: ["prod-1"],
      commerce: demoCommerceFixture(),
    });
    expect(out.html).not.toContain("<img src=x");
    expect(out.html).toContain("&lt;img");
  });

  it("skips unknown product ids instead of failing", () => {
    const out = renderProductCards({
      settings: {},
      products: ["missing-id", "prod-2"],
      commerce: demoCommerceFixture(),
    });
    expect(out.products.map((product) => product.id)).toEqual(["prod-2"]);
    expect(out.html).not.toContain("missing-id");
  });

  it("an empty catalogue renders an empty note, never a crash", () => {
    for (const products of [[], ["ghost-id"], undefined]) {
      const out = renderProductCards({
        settings: {},
        products,
        commerce: demoCommerceFixture(),
      });
      expect(out.products).toEqual([]);
      expect(out.html).toContain('data-empty="cards"');
    }
  });

  it("maps merchant settings onto the host Section shape", () => {
    const section = buildCardsSection("cards-1", {
      heading: "Hello",
      products: ["prod-1"],
    });
    expect(section).toMatchObject({
      id: "cards-1",
      type: CARDS_SECTION_KEY,
      props: { heading: "Hello", products: ["prod-1"] },
    });
    expect(CARDS_SECTION_KEY).toBe("curated-cards");
    expect(CARDS_COMPONENT_NAME).toBe("CuratedCards");
    expect(CARDS_SECTION_SLOT).toBe("main");
  });

  it("resolves variants: exact, then ready, then first, then null", () => {
    const commerce = demoCommerceFixture();
    const vase = commerce.products[0]!;
    expect(resolveSelectedVariant(vase, "var-1b")?.id).toBe("var-1b");
    expect(resolveSelectedVariant(vase, "ghost")?.id).toBe("var-1a");
    expect(resolveSelectedVariant(vase, undefined)?.id).toBe("var-1a");
    const bare = { ...vase, variants: [] };
    expect(resolveSelectedVariant(bare, "var-1a")).toBeNull();
  });

  it("clamps merchant input and falls back on weak values", () => {
    expect(coerceCardsSettings({ gap: 999 }).gap).toBe(64);
    expect(coerceCardsSettings({}).heading).toBe("Handpicked for you");
    expect(coerceCardsSettings({ motion: "hyperdrive" }).motion).toBe(
      "standard",
    );
  });
});

describe("product cards — envelope builders (bridge-shaped only)", () => {
  it("builds a variant.select envelope with references only", () => {
    expect(buildVariantSelectEnvelope("e-1", { variantId: "var-1a" })).toEqual({
      v: 2,
      id: "e-1",
      method: "variant.select",
      params: { variantId: "var-1a" },
    });
    expect(buildVariantSelectEnvelope("e-2", { productId: "prod-1" })).toEqual({
      v: 2,
      id: "e-2",
      method: "variant.select",
      params: { productId: "prod-1" },
    });
  });

  it("builds a cart.add envelope with variant + quantity (+ promo)", () => {
    expect(
      buildCartAddEnvelope("e-3", { variantId: "var-3a", quantity: 2 }),
    ).toEqual({
      v: 2,
      id: "e-3",
      method: "cart.add",
      params: { variantId: "var-3a", quantity: 2 },
    });
    const promo = buildCartAddEnvelope("e-4", {
      variantId: "var-3a",
      quantity: 1,
      promoCode: "WELCOME10",
    });
    expect(promo.params).toEqual({
      variantId: "var-3a",
      quantity: 1,
      promoCode: "WELCOME10",
    });
  });

  it("envelope params carry no other keys, ever", () => {
    const select = buildVariantSelectEnvelope("e-5", {
      variantId: "var-1a",
      productId: "prod-1",
    });
    expect(
      Object.keys(select.params as Record<string, unknown>).sort(),
    ).toEqual(["productId", "variantId"]);
    const add = buildCartAddEnvelope("e-6", {
      variantId: "var-1a",
      quantity: 1,
    });
    expect(Object.keys(add.params as Record<string, unknown>).sort()).toEqual([
      "quantity",
      "variantId",
    ]);
  });

  it("the builders throw on weak input instead of emitting", () => {
    expect(() => buildVariantSelectEnvelope("", { variantId: "v" })).toThrow();
    expect(() => buildVariantSelectEnvelope("e", {})).toThrow();
    expect(() =>
      buildCartAddEnvelope("e", { variantId: "", quantity: 1 }),
    ).toThrow();
    for (const quantity of [0, 100, 1.5, "2", NaN]) {
      expect(() =>
        buildCartAddEnvelope("e", { variantId: "v", quantity }),
      ).toThrow();
    }
  });
});

describe("product cards — commerce-context purity (source scan)", () => {
  it("theme source contains no figure/readiness/identity literals", () => {
    const banned: RegExp[] = [
      /\bprices?\b/i,
      /\bstocks?\b/i,
      /\btenants?\b/i,
      /\binventor(y|ies)\b/i,
      /\bpayment\w*\b/i,
      /\bdiscounts?\b/i,
      /\bcurrenc(y|ies)\b/i,
      /amount_minor/,
      /\bamounts?\b/i,
      /\btotals?\b/i,
      /\bsubtotals?\b/i,
      /\bshop_?ids?\b/i,
      /\bstore_?ids?\b/i,
      /৳/,
      /\bBDT\s*\d/i,
      /\$\s*\d/,
    ];
    for (const { file, text } of themeSource()) {
      for (const pattern of banned) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("the single-engine policy holds: no static gsap import, dynamic only", () => {
    for (const { file, text } of themeSource()) {
      expect(text, `${file} must not statically import gsap`).not.toMatch(
        /^\s*import\s+(?!type\b).*from\s*["']gsap["']/m,
      );
      expect(text, `${file} must not require gsap`).not.toMatch(
        /require\(\s*["']gsap["']\s*\)/,
      );
    }
    const story = themeSource().find(
      (entry) => entry.file === "story-block.ts",
    )!;
    expect(story.text).toMatch(/await\s+import\(\s*["']gsap["']\s*\)/);
  });

  it("theme source performs no network access", () => {
    const banned: RegExp[] = [
      /\bfetch\s*\(/,
      /from\s+["']https?:/,
      /import\(\s*["']https?:/,
      /XMLHttpRequest/,
      /WebSocket/,
    ];
    for (const { file, text } of themeSource()) {
      for (const pattern of banned) {
        expect(text, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("only the expected fixture files exist (no stray sources to audit)", () => {
    const files = readdirSync(here).sort();
    expect(files).toEqual(
      [
        "README.md",
        "commerce-bridge.test.ts",
        "commerce.ts",
        "demo-manifest.test.ts",
        "dev.theme.json",
        "fixture-bundles.ts",
        "manifest.ts",
        "media-carousel.test.ts",
        "media-carousel.ts",
        "product-cards.test.ts",
        "product-cards.ts",
        "shared.ts",
        "story-block.test.ts",
        "story-block.ts",
        "tsconfig.json",
        "vitest.config.ts",
      ].sort(),
    );
  });
});
