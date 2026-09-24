/**
 * Beauty homepage gap widgets — discount_badge, combo_card, concern_rail,
 * ingredient_rail. TDD: render output, badge math, bilingual labels, empties.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { BEAUTY_HOME_WIDGETS, discountParts } from "./beauty-home";
import { widgetReader, type WidgetCtx } from "./widgets";

function ctxFor(
  section: Section,
  locale: "en" | "bn",
  data?: { rows?: WidgetRow[]; pending: boolean },
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test-store",
    data,
    renderChildren: () => null,
  };
}

function sectionOf(
  type: Section["type"],
  props: Record<string, string | number | boolean>,
  locale: "en" | "bn" = "en",
): WidgetCtx {
  const section = { ...newSection(type), props };
  return ctxFor(section, locale, { rows: [], pending: false });
}

const rows: WidgetRow[] = [
  {
    id: "p1",
    title: "Acne clear serum",
    subtitle: "acne",
    options: "oily skin",
    priceMinor: 80000,
    compareAtMinor: 100000,
    currency: "BDT",
    inStock: true,
  },
  {
    id: "p2",
    title: "Niacinamide 10% toner",
    subtitle: "Niacinamide brightening",
    priceMinor: 120000,
    currency: "BDT",
    inStock: true,
  },
];

describe("discountParts (display-only badge math)", () => {
  it("returns the saving amount and percent", () => {
    expect(discountParts(80000, 100000)).toEqual({
      amountMinor: 20000,
      percent: 20,
    });
  });

  it("returns null when there is no saving", () => {
    expect(discountParts(100000, 100000)).toBeNull();
    expect(discountParts(120000, 100000)).toBeNull();
    expect(discountParts(80000, undefined)).toBeNull();
    expect(discountParts(undefined, 100000)).toBeNull();
  });
});

describe("discount_badge", () => {
  it("renders the TK saving and percent in English", () => {
    const ctx = sectionOf("discount_badge", {
      priceMinor: 80000,
      compareAtMinor: 100000,
    });
    const html = renderToStaticMarkup(
      <>{BEAUTY_HOME_WIDGETS.discount_badge(ctx)}</>,
    );
    expect(html).toContain("20");
    expect(html).toContain("off");
  });

  it("renders bilingual labels in Bangla", () => {
    const ctx = sectionOf(
      "discount_badge",
      { priceMinor: 80000, compareAtMinor: 100000 },
      "bn",
    );
    const html = renderToStaticMarkup(
      <>{BEAUTY_HOME_WIDGETS.discount_badge(ctx)}</>,
    );
    expect(html).toContain("ছাড়");
  });

  it("renders nothing when there is no saving", () => {
    const ctx = sectionOf("discount_badge", {
      priceMinor: 100000,
      compareAtMinor: 100000,
    });
    const html = renderToStaticMarkup(
      <>{BEAUTY_HOME_WIDGETS.discount_badge(ctx)}</>,
    );
    expect(html).toBe("");
  });
});

describe("concern_rail", () => {
  it("shows taxonomy chips and matching products", () => {
    const section = {
      ...newSection("concern_rail"),
      props: { heading: "Shop by concern", terms: "acne,dark-spots" },
    };
    const html = renderToStaticMarkup(
      <>
        {BEAUTY_HOME_WIDGETS.concern_rail(
          ctxFor(section, "en", { rows, pending: false }),
        )}
      </>,
    );
    expect(html).toContain("Acne clear serum");
    expect(html).toContain("Acne");
    expect(html).not.toContain("Niacinamide 10% toner");
  });

  it("labels chips in Bangla", () => {
    const section = {
      ...newSection("concern_rail"),
      props: { heading: "সমস্যা অনুযায়ী", terms: "acne" },
    };
    const html = renderToStaticMarkup(
      <>
        {BEAUTY_HOME_WIDGETS.concern_rail(
          ctxFor(section, "bn", { rows, pending: false }),
        )}
      </>,
    );
    expect(html).toContain("ব্রণ");
  });

  it("shows a bilingual empty state when nothing matches", () => {
    const section = {
      ...newSection("concern_rail"),
      props: { heading: "Shop by concern", terms: "pores" },
    };
    const html = renderToStaticMarkup(
      <>
        {BEAUTY_HOME_WIDGETS.concern_rail(
          ctxFor(section, "en", { rows: [], pending: false }),
        )}
      </>,
    );
    expect(html.length).toBeGreaterThan(0);
  });
});

describe("ingredient_rail", () => {
  it("keeps ingredient names Latin with a Bangla gloss", () => {
    const section = {
      ...newSection("ingredient_rail"),
      props: {
        heading: "Shop by ingredient",
        i1Name: "Niacinamide",
        i1Gloss: "দাগ হালকা করে",
      },
    };
    const html = renderToStaticMarkup(
      <>
        {BEAUTY_HOME_WIDGETS.ingredient_rail(
          ctxFor(section, "bn", { rows, pending: false }),
        )}
      </>,
    );
    expect(html).toContain("Niacinamide");
    expect(html).toContain("Niacinamide 10% toner");
    expect(html).toContain('dir="ltr"');
  });

  it("renders nothing when no ingredients are authored", () => {
    const section = { ...newSection("ingredient_rail"), props: {} };
    const html = renderToStaticMarkup(
      <>
        {BEAUTY_HOME_WIDGETS.ingredient_rail(
          ctxFor(section, "en", { rows, pending: false }),
        )}
      </>,
    );
    expect(html).toBe("");
  });
});

describe("combo_card", () => {
  it("renders the pack items with a bilingual CTA", () => {
    const section = {
      ...newSection("combo_card"),
      props: {
        heading: "Glow combo",
        buttonLabel: "Add combo",
        i1VariantId: "v-1",
        i2VariantId: "v-2",
      },
    };
    const html = renderToStaticMarkup(
      createElement(
        BEAUTY_HOME_WIDGETS.combo_card,
        ctxFor(section, "en", { rows, pending: false }),
      ),
    );
    expect(html).toContain("Glow combo");
    expect(html).toContain("Acne clear serum");
    expect(html).toContain("Add combo");
  });

  it("renders nothing with no items", () => {
    const section = { ...newSection("combo_card"), props: {} };
    const html = renderToStaticMarkup(
      createElement(
        BEAUTY_HOME_WIDGETS.combo_card,
        ctxFor(section, "en", { rows: [], pending: false }),
      ),
    );
    expect(html).toBe("");
  });
});
