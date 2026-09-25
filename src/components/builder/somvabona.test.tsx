/**
 * Somvabona widget pack contracts — TDD for the five new widgets.
 *
 * Per-widget: builder catalog entry, studio def, controls parity, SSR
 * render (populated + bilingual), and fail-closed cases (no data renders
 * nothing on the storefront — never fabricated numbers, prices or ratings).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  catalogEntry,
  newSection,
  type Section,
  type SectionType,
} from "@/lib/builder-ast";
import { WIDGET_BY_KEY } from "@/lib/studio/catalog";
import { SOMVABONA_WIDGETS } from "./somvabona";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "./widgets";
import type { WidgetRow } from "@/lib/widget-data";

const PACK = [
  "trust_marquee",
  "price_buckets",
  "occasion_matrix",
  "urgency_rail",
  "rating_stars",
] as const satisfies readonly SectionType[];

function ctxFor(
  section: Section,
  locale: "en" | "bn" = "en",
  editing = false,
  data?: { rows?: WidgetRow[]; pending: boolean },
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing,
    locale,
    storeSlug: "test",
    link: (href: string) => href,
    data,
    renderChildren: () => null,
  };
}

function render(
  Cmp: WidgetComponent,
  section: Section,
  locale: "en" | "bn" = "en",
  editing = false,
  data?: { rows?: WidgetRow[]; pending: boolean },
) {
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale, editing, data),
    ),
  );
}

const ROWS: WidgetRow[] = [
  {
    id: "p1",
    title: "Cotton Panjabi",
    href: "/p/cotton-panjabi",
    priceMinor: 199900,
    compareAtMinor: 249900,
    currency: "BDT",
    inStock: true,
    count: 3,
    rating: 4.5,
    reviewCount: 12,
  },
  {
    id: "p2",
    title: "Jamdani Saree",
    href: "/p/jamdani-saree",
    priceMinor: 899900,
    currency: "BDT",
    inStock: true,
    rating: 5,
    reviewCount: 4,
  },
];

describe("somvabona pack wiring", () => {
  for (const type of PACK) {
    it(`${type} has a builder entry and renderer`, () => {
      expect(catalogEntry(type)).toBeDefined();
      expect(SOMVABONA_WIDGETS[type]).toBeDefined();
      expect(typeof WIDGET_COMPONENTS[type]).toBe("function");
    });

    it(`${type} defaults instantiate and SSR without throwing`, () => {
      const section = newSection(type);
      const Cmp = WIDGET_COMPONENTS[type];
      expect(() => render(Cmp, section)).not.toThrow();
      expect(() => render(Cmp, section, "bn", true)).not.toThrow();
    });
  }

  // Studio-twin parity (WIDGET_BY_KEY defs + controls ⊆ defaults) lands
  // with the Batch 3 studio catalog/controls entries and is pinned by the
  // shared `ported theme widgets` suite in studio/catalog.test.ts. RED by
  // design until that batch — flip to `it` when the defs land.
  it.fails("studio defs resolve for the pack (Batch 3)", () => {
    for (const type of PACK) {
      expect(WIDGET_BY_KEY[type]).toBeDefined();
    }
  });
});

describe("trust_marquee", () => {
  const Cmp = () => SOMVABONA_WIDGETS["trust_marquee"];

  it("renders null on the storefront for items: [], never throws", () => {
    const section = { ...newSection("trust_marquee"), props: { items: [] } };
    expect(render(Cmp(), section)).toBe("");
  });

  it("renders an editing placeholder for items: []", () => {
    const section = { ...newSection("trust_marquee"), props: { items: [] } };
    expect(render(Cmp(), section, "en", true)).toContain("Trust marquee");
  });

  it("loops badge copy and freezes motion for reduced-motion users", () => {
    const section = {
      ...newSection("trust_marquee"),
      props: {
        items: [
          {
            icon: "cod",
            title: "Cash on delivery",
            title_bn: "ক্যাশ অন ডেলিভারি",
            body: "Pay at your door",
            body_bn: "দরজায় পেমেন্ট",
          },
        ],
        speed: "normal",
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("Cash on delivery");
    expect(html).toContain("motion-reduce:animate-none");
    expect(render(Cmp(), section, "bn")).toContain("ক্যাশ অন ডেলিভারি");
  });
});

describe("price_buckets", () => {
  const Cmp = () => SOMVABONA_WIDGETS["price_buckets"];

  it("renders null on the storefront for buckets: []", () => {
    const section = { ...newSection("price_buckets"), props: { buckets: [] } };
    expect(render(Cmp(), section)).toBe("");
  });

  it("renders bucket bounds as links, never computed prices", () => {
    const section = {
      ...newSection("price_buckets"),
      props: {
        heading: "Shop by budget",
        heading_bn: "বাজেট অনুযায়ী কিনুন",
        buckets: [
          {
            label: "Under ৳999",
            label_bn: "৯৯৯ টাকার নিচে",
            maxPrice: 99900,
            href: "/search?max=99900",
            image: "",
          },
        ],
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("Under ৳999");
    expect(html).toContain("/search?max=99900");
  });

  it("omits buckets with no bound or label (fail-closed)", () => {
    const section = {
      ...newSection("price_buckets"),
      props: {
        buckets: [
          {
            label: "",
            label_bn: "",
            maxPrice: 99900,
            href: "/search",
            image: "",
          },
          {
            label: "Under ৳999",
            label_bn: "৯৯৯ টাকার নিচে",
            maxPrice: 99900,
            href: "/search?max=99900",
            image: "",
          },
        ],
      },
    };
    const html = render(Cmp(), section);
    expect(html).not.toContain('href="/search"');
    expect(html).toContain("/search?max=99900");
  });
});

describe("occasion_matrix", () => {
  const Cmp = () => SOMVABONA_WIDGETS["occasion_matrix"];

  it("renders null on the storefront when empty", () => {
    const section = {
      ...newSection("occasion_matrix"),
      props: { occasions: [], collections: [] },
    };
    expect(render(Cmp(), section)).toBe("");
  });

  it("renders occasion links and collection tiles bilingually", () => {
    const section = {
      ...newSection("occasion_matrix"),
      props: {
        heading: "Dress for the occasion",
        heading_bn: "উপলক্ষের সাজ",
        occasions: [
          { label: "Wedding", label_bn: "বিয়ে", href: "/c/wedding" },
        ],
        collections: [
          { title: "Women", title_bn: "নারী", href: "/c/women", image: "" },
        ],
      },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("/c/wedding");
    expect(html).toContain("/c/women");
    expect(render(Cmp(), section, "bn")).toContain("বিয়ে");
  });
});

describe("urgency_rail", () => {
  const Cmp = () => SOMVABONA_WIDGETS["urgency_rail"];

  it("renders null for an empty rail, skeleton while pending", () => {
    const section = newSection("urgency_rail");
    expect(
      render(Cmp(), section, "en", false, { rows: [], pending: false }),
    ).toBe("");
    const pending = render(Cmp(), section, "en", false, { pending: true });
    expect(pending.length).toBeGreaterThan(0);
  });

  it("computes % off from real prices, never typed values", () => {
    const section = newSection("urgency_rail");
    const html = render(Cmp(), section, "en", false, {
      rows: ROWS,
      pending: false,
    });
    // (249900-199900)/249900 = 20%.
    expect(html).toContain("20");
    expect(html).toContain("Cotton Panjabi");
  });

  it("shows a real stock hint only from inventory flags", () => {
    const section = newSection("urgency_rail");
    const html = render(Cmp(), section, "en", false, {
      rows: ROWS,
      pending: false,
    });
    expect(html).toContain("Only 3 left");
    // The row without a count carries no hint.
    expect(html.match(/Only \d+ left/g)).toHaveLength(1);
  });
});

describe("rating_stars", () => {
  const Cmp = () => SOMVABONA_WIDGETS["rating_stars"];

  it("renders nothing with no aggregate (never fake 4.8s)", () => {
    const section = { ...newSection("rating_stars"), props: {} };
    expect(render(Cmp(), section)).toBe("");
    const zero = {
      ...newSection("rating_stars"),
      props: { rating: 4.8, reviewCount: 0 },
    };
    expect(render(Cmp(), zero)).toBe("");
  });

  it("renders the real aggregate with a review count", () => {
    const section = {
      ...newSection("rating_stars"),
      props: { rating: 4.5, reviewCount: 12 },
    };
    const html = render(Cmp(), section);
    expect(html).toContain("12");
    expect(html).toContain("4.5");
  });
});
