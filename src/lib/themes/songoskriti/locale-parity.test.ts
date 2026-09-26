import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import { SONGOSKRITI_WIDGETS } from "@/components/builder/songoskriti";
import type { WidgetCtx } from "@/components/builder/widgets";
import { widgetReader } from "@/components/builder/widgets";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";

/**
 * Songoskriti locale parity (theme-independence Task 1).
 *
 * Every non-empty user-facing string prop in emitted header/homepage/footer
 * sections must carry a non-empty `_bn` twin. The renderer (`widgetReader`
 * `str()` + `readBn`) resolves the twin automatically when the key exists,
 * with bn→en fallback — so a missing twin means বাংলা shoppers see English.
 *
 * DOCUMENTED EXEMPTIONS (brand literals / proper nouns — never translated):
 * - `testimonials[].author` — personal names (Nusrat Rahman, …). Roles and
 *   quote bodies ARE twinned; names stay in Latin script by convention.
 * - `payment_icons.marks` — payment brand literals ("bKash, Nagad, Rocket,
 *   Visa, Mastercard, Cash on Delivery"). Brand marks render as-is in both
 *   locales, exactly like the footer payment row.
 * Non-text config (hrefs/urls/images/layout/skin/limits/icons/counts) is not
 * user copy and is skipped by key shape, not by value.
 */

const NON_TEXT_EXACT = new Set([
  "limit",
  "columns",
  "autoAdvanceMs",
  "atmosphere",
  "skin",
  "layout",
  "icon",
  "source",
  "collection",
  "cardVariant",
  "showRating",
  "scrim",
  // comma-separated asset URLs, not copy
  "images",
  // tailwind positioning classes, not copy
  "advClass",
]);

const NON_TEXT_SUFFIX = ["Href", "href", "Url", "Image", "image"];

/** Brand-literal / proper-noun keys exempted with reasons above. */
const EXEMPT_KEYS = new Set(["author", "marks"]);

function isNonTextKey(key: string): boolean {
  if (key.endsWith("_bn")) return true; // the twin itself, not a source
  if (NON_TEXT_EXACT.has(key)) return true;
  // strip numeric disambiguators (ctaUrl2, o1Href) before shape matching
  const base = key.replace(/\d+$/, "");
  return NON_TEXT_SUFFIX.some((s) => base.endsWith(s));
}

type Gap = string;

function checkBag(
  bag: Record<string, unknown>,
  path: string,
  gaps: Gap[],
): void {
  for (const [key, value] of Object.entries(bag)) {
    if (typeof value !== "string" || !value.trim()) continue;
    if (isNonTextKey(key)) continue;
    if (EXEMPT_KEYS.has(key)) continue;
    const twin = bag[`${key}_bn`];
    if (typeof twin !== "string" || !twin.trim()) {
      gaps.push(`${path}.${key} = ${JSON.stringify(value)}`);
    }
  }
}

const ROW_ARRAY_KEYS = new Set([
  "slides",
  "departments",
  "testimonials",
  "collections",
  "items",
]);

function checkSection(
  section: { type: string; props: Record<string, unknown> },
  origin: string,
  gaps: Gap[],
): void {
  const path = `${origin}.${section.type}`;
  checkBag(section.props, path, gaps);
  for (const [key, value] of Object.entries(section.props)) {
    if (!ROW_ARRAY_KEYS.has(key) || !Array.isArray(value)) continue;
    value.forEach((row, i) => {
      if (row && typeof row === "object") {
        checkBag(row as Record<string, unknown>, `${path}.${key}[${i}]`, gaps);
      }
    });
  }
}

describe("songoskriti locale parity", () => {
  it("every user-facing string prop in emitted sections has a non-empty _bn twin", () => {
    const s = (type: string, props: Record<string, unknown> = {}) =>
      ({ id: type, type, props }) as never;
    const sections = [
      ...buildHeaderMain(s as never),
      ...buildHomepageMain(s as never),
      ...buildFooterMain(s as never),
    ] as unknown as { type: string; props: Record<string, unknown> }[];
    expect(sections.length).toBeGreaterThan(0);
    const gaps: Gap[] = [];
    for (const section of sections) checkSection(section, "songoskriti", gaps);
    expect(gaps).toEqual([]);
  });
});

function emittedSection(type: keyof typeof SONGOSKRITI_WIDGETS): Section {
  const s = (t: string, props: Record<string, unknown> = {}) =>
    ({ id: t, type: t, props }) as unknown as Section;
  const all = [
    ...buildHeaderMain(s as never),
    ...buildHomepageMain(s as never),
    ...buildFooterMain(s as never),
  ];
  const found = all.find((n) => n.type === type);
  if (!found) throw new Error(`emitted sections carry no ${type}`);
  return found;
}

function htmlFor(
  type: keyof typeof SONGOSKRITI_WIDGETS,
  section: Section,
  locale: Locale,
): string {
  const Cmp = SONGOSKRITI_WIDGETS[type] as unknown as (
    p: WidgetCtx,
  ) => React.ReactElement;
  const ctx: WidgetCtx = {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    renderChildren: () => null,
  };
  return renderToStaticMarkup(createElement(Cmp, ctx));
}

describe("songoskriti bn render proof", () => {
  it("bn renders twins for testimonials, trust items, finder labels and split ctas", () => {
    const t = emittedSection("testimonials");
    const trust = emittedSection("trust_footer");
    const finder = emittedSection("finder_row");
    const split = emittedSection("split_feature");
    const bnHtml =
      htmlFor("testimonials", t, "bn") +
      htmlFor("trust_footer", trust, "bn") +
      htmlFor("finder_row", finder, "bn") +
      htmlFor("split_feature", split, "bn");
    for (const twin of [
      "অপূর্ব",
      "খাঁটি কারুকাজ",
      "ঈদ ও উৎসব",
      "সব উপলক্ষ দেখুন",
      "নারীর সংগ্রহ",
    ]) {
      expect(bnHtml, `bn must render ${twin}`).toContain(twin);
    }
    for (const en of [
      "AUTHENTIC CRAFT",
      "EID &amp; FESTIVE",
      "BROWSE ALL OCCASIONS",
      "SHOP WOMEN",
    ]) {
      expect(bnHtml, `bn must not leak ${en}`).not.toContain(en);
    }
  });

  it("bn renders the product rail promise twin once rows resolve", () => {
    const rail = emittedSection("product_rail");
    const withRows: Section = {
      ...rail,
      props: { ...rail.props },
    };
    const bnHtml = renderToStaticMarkup(
      createElement(
        SONGOSKRITI_WIDGETS["product_rail"] as unknown as (
          p: WidgetCtx,
        ) => React.ReactElement,
        {
          section: withRows,
          ...widgetReader(withRows, undefined, "bn"),
          Heading: "h2",
          primary: false,
          editing: false,
          locale: "bn" as Locale,
          storeSlug: "test",
          renderChildren: () => null,
          data: {
            rows: [
              {
                id: "1",
                title: "Test Saree",
                href: "/p/1",
                imageUrl: "/ph/x.png",
                priceMinor: 100000,
              },
            ],
            pending: false,
          },
        } as unknown as WidgetCtx,
      ),
    );
    expect(bnHtml).toContain("ফ্রি ডেলিভারি");
    expect(bnHtml).toContain("হাতে বোনা");
  });

  it("never renders a blank node: bn without any twin falls back to en", () => {
    const base = newSection("trust_footer");
    const section: Section = {
      ...base,
      props: {
        ...base.props,
        items: [{ icon: "secure", title: "Only English", body: "" }],
      },
    };
    expect(htmlFor("trust_footer", section, "bn")).toContain("Only English");
  });
});
