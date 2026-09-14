import { describe, expect, it } from "vitest";
import {
  ITEM_CONDITIONS,
  aggregateRating,
  astJsonLd,
  collectJsonLd,
  graphIssues,
  jsonLdIssues,
  returnPolicyNode,
  reviewNodes,
  sectionJsonLd,
  shippingDetailsNode,
} from "./structured-data";
import { buildProductHead, priceString } from "./theme-seo";
import { flattenAst, lintTemplate, newSection, parseAst, type Section } from "./builder-ast";
import { THEME_PRESETS } from "./theme-presets";
import { parseTemplates } from "./builder-ast";

const ctx = { storeName: "Rong", url: "https://shop.test/store/rong" };
const node = (type: string, props: Record<string, string>): Section => ({
  ...newSection(type as never),
  props: { ...newSection(type as never).props, ...props },
});
const ld = (head: ReturnType<typeof buildProductHead>) =>
  head.scripts.map((s) => JSON.parse(s.children.replace(/\\u003c/g, "<")));

describe("Phase 7.2 — widget-emitted schema", () => {
  it("turns an authored FAQ widget into a valid FAQPage", () => {
    const out = sectionJsonLd(node("faq", { q1: "Delivery time?", a1: "1-3 days.", q2: "Returns?", a2: "7 days." }), ctx)!;
    expect(out["@type"]).toBe("FAQPage");
    expect((out["mainEntity"] as unknown[]).length).toBe(2);
    expect(jsonLdIssues(out)).toEqual([]);
  });

  it("stays silent on half-authored widgets rather than shipping hollow nodes", () => {
    expect(sectionJsonLd(node("faq", { q1: "Only a question" }), ctx)).toBeNull();
    expect(sectionJsonLd(node("how_to_use", { s1Title: "One", s1Body: "step" }), ctx)).toBeNull();
    expect(sectionJsonLd(node("video", { src: "https://youtu.be/x" }), ctx)).toBeNull();
    expect(sectionJsonLd(node("store_locator", {}), ctx)).toBeNull();
  });

  it("emits HowTo, VideoObject and LocalBusiness from their widgets", () => {
    const how = sectionJsonLd(
      node("how_to_use", { s1Title: "Wash", s1Body: "Rinse.", s2Title: "Dry", s2Body: "Air dry." }),
      ctx,
    )!;
    expect(how["@type"]).toBe("HowTo");
    expect(jsonLdIssues(how)).toEqual([]);

    const video = sectionJsonLd(node("video", { src: "https://youtu.be/x", title: "Fabric care" }), ctx)!;
    expect(video).toMatchObject({ "@type": "VideoObject", embedUrl: "https://youtu.be/x" });
    expect(jsonLdIssues(video)).toEqual([]);

    const local = sectionJsonLd(
      node("store_locator", { s1Name: "Banani", s1Address: "Road 11, Dhaka", s1Phone: "+8801700000000" }),
      ctx,
    )!;
    expect(local).toMatchObject({ "@type": "LocalBusiness", telephone: "+8801700000000" });
    expect(jsonLdIssues(local)).toEqual([]);
  });

  it("groups multiple outlets into one @graph and validates each", () => {
    const local = sectionJsonLd(
      node("store_locator", { s1Name: "A", s1Address: "Dhaka", s2Name: "B", s2Address: "Chattogram" }),
      ctx,
    )!;
    expect((local["@graph"] as unknown[]).length).toBe(2);
    expect(jsonLdIssues(local)).toEqual([]);
  });

  it("drops a duplicate page-level type when collecting a template", () => {
    const sections = [
      node("faq", { q1: "A", a1: "B" }),
      node("faq", { q1: "C", a1: "D" }),
      node("video", { src: "https://v", title: "T" }),
    ];
    const nodes = collectJsonLd(sections, ctx);
    expect(nodes.filter((n) => n["@type"] === "FAQPage")).toHaveLength(1);
    expect(nodes).toHaveLength(2);
  });

  it("walks a whole AST", () => {
    const ast = parseAst({ main: [node("faq", { q1: "A", a1: "B" })] });
    expect(astJsonLd(ast, ctx, flattenAst)).toHaveLength(1);
    expect(astJsonLd(null, ctx, flattenAst)).toEqual([]);
  });
});

describe("Phase 7.2 — offers", () => {
  const reviews = [
    { author: "Rumi", rating: 5, body: "Great" },
    { author: "Ayesha", rating: 4, title: "Good" },
    { author: "Bot", rating: 9 },
  ];

  it("averages only valid ratings", () => {
    const rating = aggregateRating(reviews)!;
    expect(rating).toMatchObject({ ratingValue: "4.5", reviewCount: 2 });
    expect(aggregateRating([])).toBeNull();
    expect(jsonLdIssues({ "@context": "https://schema.org", ...rating })).toEqual([]);
  });

  it("caps and shapes individual reviews", () => {
    const nodes = reviewNodes(reviews);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ "@type": "Review", author: { "@type": "Person", name: "Rumi" } });
    expect(reviewNodes(reviews, 1)).toHaveLength(1);
  });

  it("builds a finite return window and skips it when returns are off", () => {
    expect(returnPolicyNode({ days: 7 })).toMatchObject({
      "@type": "MerchantReturnPolicy",
      applicableCountry: "BD",
      merchantReturnDays: 7,
    });
    expect(returnPolicyNode({ days: 0 })).toBeNull();
  });

  it("quotes shipping from minor units, never floats", () => {
    const shipping = shippingDetailsNode(
      { flatMinor: 6000, currency: "BDT", freeThresholdMinor: 200000 },
      priceString,
    );
    expect((shipping["shippingRate"] as Record<string, string>)["value"]).toBe("60.00");
    expect(String(shipping["description"])).toContain("2000.00");
  });

  it("attaches rating, reviews, condition, returns and shipping to the Product head", () => {
    const head = buildProductHead({
      origin: "https://shop.test",
      path: "/store/rong/p/kurta",
      storePath: "/store/rong",
      storeName: "Rong",
      product: { title: "Kurta", slug: "kurta", sku: "K-1" },
      currency: "BDT",
      priceMinor: 189900,
      inStock: true,
      reviews,
      returnPolicy: { days: 7 },
      shipping: { flatMinor: 6000 },
    });
    const product = ld(head).find((n) => n["@type"] === "Product")!;
    const offer = product["offers"] as Record<string, unknown>;
    expect(offer["price"]).toBe("1899.00");
    expect(offer["itemCondition"]).toBe(ITEM_CONDITIONS.new);
    expect(offer["hasMerchantReturnPolicy"]).toBeTruthy();
    expect(offer["shippingDetails"]).toBeTruthy();
    expect(product["aggregateRating"]).toBeTruthy();
    expect(graphIssues(ld(head))).toEqual([]);
  });

  it("omits the enrichment entirely when the merchant has no data", () => {
    const head = buildProductHead({
      origin: "https://shop.test",
      path: "/store/rong/p/kurta",
      storePath: "/store/rong",
      storeName: "Rong",
      product: { title: "Kurta", slug: "kurta" },
      currency: "BDT",
      priceMinor: 100,
      inStock: false,
    });
    const product = ld(head).find((n) => n["@type"] === "Product")!;
    expect(product["aggregateRating"]).toBeUndefined();
    expect(product["review"]).toBeUndefined();
    expect(graphIssues(ld(head))).toEqual([]);
  });
});

describe("Phase 7.2 — validation gate", () => {
  it("reports missing required properties, including nested ones", () => {
    expect(jsonLdIssues({ "@context": "https://schema.org", "@type": "Product", name: "X" })[0]).toMatch(
      /missing required property "offers"/,
    );
    const nested = jsonLdIssues({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "X",
      offers: { "@type": "Offer", price: 19.99, priceCurrency: "BDT", availability: "InStock" },
    });
    expect(nested.some((m) => /price must be a string/.test(m))).toBe(true);
    expect(nested.some((m) => /availability must be a schema.org URL/.test(m))).toBe(true);
  });

  it("rejects a bad context, a missing type and impossible ratings", () => {
    expect(jsonLdIssues({ "@context": "https://example.com", "@type": "Organization", name: "X" })[0]).toMatch(
      /@context/,
    );
    expect(jsonLdIssues({ "@context": "https://schema.org", name: "X" })[0]).toMatch(/@type is required/);
    expect(
      jsonLdIssues({ "@context": "https://schema.org", "@type": "AggregateRating", ratingValue: "9", reviewCount: 0 }),
    ).toHaveLength(2);
    expect(jsonLdIssues("nope")[0]).toMatch(/must be an object/);
  });

  it("blocks publish when a template emits two FAQ graphs", () => {
    const ast = parseAst({
      main: [
        { ...node("faq", { q1: "A", a1: "B" }), id: "f1" },
        { ...node("faq", { q1: "C", a1: "D" }), id: "f2" },
      ],
    });
    const issues = lintTemplate(ast, "index");
    expect(issues.some((i) => i.level === "error" && /second FAQPage/.test(i.message))).toBe(true);
  });

  it("keeps every official preset's schema valid", () => {
    for (const preset of THEME_PRESETS) {
      const parsed = parseTemplates(preset.templates);
      for (const [key, ast] of Object.entries(parsed)) {
        const nodes = astJsonLd(ast, ctx, flattenAst);
        expect(graphIssues(nodes), `${preset.key}/${key}`).toEqual([]);
      }
    }
  });
});
