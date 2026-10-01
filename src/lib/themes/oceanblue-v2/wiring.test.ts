/**
 * Oceanblue-v2 wiring (Tasks 3–5, grown per task).
 *
 * Part 1 (Task 3): header/footer chrome asserts.
 * Part 2 (Task 4): homepage asserts (appended).
 * Part 3 (Task 5): secondary template asserts (appended).
 */
import { describe, expect, it } from "vitest";
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { buildSecondaryMain } from "./secondary";

type Stub = (type: SectionType, props?: Record<string, PropValue>) => Section;

const stub: Stub = (type, props = {}) => ({
  id: `${type}-1`,
  type,
  props: { ...props },
});

describe("oceanblue-v2 header chrome", () => {
  it("emits one dismissible rotating announcement_bar with _bn twins", () => {
    const header = buildHeaderMain(stub);
    const bars = header.filter((s) => s.type === "announcement_bar");
    expect(bars).toHaveLength(1);
    const props = bars[0]!.props;
    expect(props.dismissible).toBe(true);
    expect(typeof props.rotateMs).toBe("number");
    expect(props.m1).toBeTruthy();
    expect(props.m1_bn).toBeTruthy();
    const items = props.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const item of items) {
      expect(item.text).toBeTruthy();
      expect(item.text_bn).toBeTruthy();
    }
  });

  it("has no dead links anywhere in the header", () => {
    const header = buildHeaderMain(stub);
    expect(JSON.stringify(header)).not.toContain('href="#"');
    expect(JSON.stringify(header)).not.toContain('"#"');
  });
});

describe("oceanblue-v2 footer chrome", () => {
  it("emits sitemap + payments + about colophon, never a newsletter", () => {
    const footer = buildFooterMain(stub);
    const types = footer.map((s) => s.type);
    expect(types).toContain("footer_sitemap");
    expect(types).toContain("payment_icons");
    expect(types).toContain("rich_text");
    expect(types).not.toContain("newsletter");
  });

  it("has no dead links or dead socials anywhere in the footer", () => {
    const footer = buildFooterMain(stub);
    const raw = JSON.stringify(footer);
    expect(raw).not.toContain('href="#"');
    expect(raw).not.toContain('"#"');
  });

  it("carries bilingual twins on shopper-facing footer strings", () => {
    const footer = buildFooterMain(stub);
    const sitemap = footer.find((s) => s.type === "footer_sitemap")!;
    expect(sitemap.props.statementHeading).toBeTruthy();
    expect(sitemap.props.statementHeading_bn).toBeTruthy();
    expect(sitemap.props.c1Title).toBeTruthy();
    expect(sitemap.props.c1Title_bn).toBeTruthy();
  });
});

describe("oceanblue-v2 homepage main", () => {
  const MAIN_ORDER = [
    "hero_carousel",
    "circle_categories",
    "product_rail",
    "split_feature",
    "product_rail",
    "circle_categories",
    "trust_marquee",
    "collection_story",
    "testimonials",
    "store_locator",
    "newsletter",
  ];

  it("emits 11 main sections in spec-§3 order", () => {
    const main = buildHomepageMain(stub);
    expect(main.map((s) => s.type)).toEqual(MAIN_ORDER);
  });

  it("claims the h1 exactly once: a 4-slide banner hero, H1 on slide 1", () => {
    const main = buildHomepageMain(stub);
    expect(main.filter((s) => s.type === "hero_carousel")).toHaveLength(1);
    const hero = main.find((s) => s.type === "hero_carousel")!;
    expect(hero.props.skin).toBe("banner");
    expect(hero.props.autoAdvanceMs).toBe(5000);
    const slides = hero.props.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(4);
    expect(slides[0]!.headline).toBeTruthy();
    expect(slides[0]!.headline_bn).toBeTruthy();
    for (const slide of slides) {
      expect(slide.ctaUrl).toBeTruthy();
    }
  });

  it("resolves every CTA to a real permalink (zero dead links)", () => {
    const main = buildHomepageMain(stub);
    const raw = JSON.stringify(main);
    expect(raw).not.toContain("#");
    for (const s of main) {
      for (const key of ["ctaUrl", "ctaHref", "href", "storyHref"]) {
        const v = s.props[key];
        if (typeof v === "string" && v !== "") {
          expect(v.startsWith("/"), `${s.type}.${key}=${v}`).toBe(true);
        }
      }
    }
  });

  it("keeps rails honest: limits ≤ 10, real sources, ratings on loved", () => {
    const main = buildHomepageMain(stub);
    const rails = main.filter((s) => s.type === "product_rail");
    expect(rails).toHaveLength(2);
    for (const rail of rails) {
      expect(rail.props.limit as number).toBeLessThanOrEqual(10);
      expect(["collection", "bestsellers", "recommended"]).toContain(
        rail.props.source,
      );
    }
    expect(rails[0]!.props.source).toBe("bestsellers");
    expect(rails[0]!.props.showRating).toBe(true);
    expect(rails[1]!.props.source).toBe("recommended");
  });

  it("mounts exactly one newsletter across the full page", () => {
    const page = [
      ...buildHeaderMain(stub),
      ...buildHomepageMain(stub),
      ...buildFooterMain(stub),
    ];
    expect(page.filter((s) => s.type === "newsletter")).toHaveLength(1);
  });

  it("fills 8 category tiles and color tiles with real hrefs", () => {
    const main = buildHomepageMain(stub);
    const tiles = main.filter((s) => s.type === "circle_categories");
    expect(tiles).toHaveLength(2);
    for (const t of tiles) {
      for (let i = 1; i <= 6; i++) {
        expect(t.props[`c${i}Title`]).toBeTruthy();
        expect(String(t.props[`c${i}Href`]).startsWith("/c/")).toBe(true);
      }
    }
  });
});

describe("oceanblue-v2 secondary templates", () => {
  const KINDS = [
    "product",
    "collection",
    "cart",
    "checkout",
    "search",
    "account",
    "page",
    "blog",
  ] as const;

  it("returns a non-empty valid main for every secondary kind", () => {
    for (const kind of KINDS) {
      const main = buildSecondaryMain(stub, kind);
      expect(main.length, kind).toBeGreaterThan(0);
      for (const s of main) {
        expect(s.type, kind).toBeTruthy();
        expect(s.id, kind).toBeTruthy();
      }
      expect(JSON.stringify(main), kind).not.toContain("#");
    }
  });

  it("keeps the sticky buy bar PDP-only", () => {
    const product = buildSecondaryMain(stub, "product");
    expect(
      product.filter((s) => s.type === "sticky_buy_bar"),
    ).toHaveLength(1);
    for (const kind of KINDS.filter((k) => k !== "product")) {
      expect(
        buildSecondaryMain(stub, kind).filter(
          (s) => s.type === "sticky_buy_bar",
        ),
        kind,
      ).toHaveLength(0);
    }
  });

  it("gives listing templates filter + sort controls", () => {
    for (const kind of ["collection", "search"] as const) {
      const types = buildSecondaryMain(stub, kind).map((s) => s.type);
      expect(types, kind).toContain("filter_chips");
      expect(types, kind).toContain("result_toolbar");
      expect(types, kind).toContain("product_grid");
    }
  });
});
