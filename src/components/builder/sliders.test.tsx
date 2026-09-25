/**
 * Sliders lane contracts — price/size selectors, quantity steppers and the
 * product image slider.
 *
 * Static-markup assertions: native range inputs with bilingual labels,
 * radiogroup semantics with 44px targets, stepper group labelling, and gallery
 * prev/next controls with a polite position announcement. Behaviour (URL math,
 * arrow-key roving) is covered by asserting the wiring exists in the markup
 * plus unit tests of the pure helpers.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import {
  WIDGET_COMPONENTS,
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "./widgets";
import { QtyStepper } from "./primitives/QtyStepper";

function ctxFor(
  section: Section,
  locale: "en" | "bn" = "en",
  rows?: WidgetRow[],
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    data: rows ? { rows, pending: false } : undefined,
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function render(
  Cmp: WidgetComponent,
  section: Section,
  locale: "en" | "bn" = "en",
  rows?: WidgetRow[],
): string {
  return renderToStaticMarkup(createElement(Cmp, ctxFor(section, locale, rows)));
}

function row(
  id: string,
  options: string,
  extra: Partial<WidgetRow> = {},
): WidgetRow {
  return { id, title: options, options, ...extra };
}

describe("price facet dual range", () => {
  it("renders two native range inputs with bilingual labels", () => {
    const en = render(WIDGET_COMPONENTS.facet_sidebar, newSection("facet_sidebar"), "en");
    expect(en).toContain('type="range"');
    expect(en).toContain('aria-label="Minimum price"');
    expect(en).toContain('aria-label="Maximum price"');
    const bn = render(WIDGET_COMPONENTS.facet_sidebar, newSection("facet_sidebar"), "bn");
    expect(bn).toContain('aria-label="সর্বনিম্ন দাম"');
    expect(bn).toContain('aria-label="সর্বোচ্চ দাম"');
  });

  it("announces localized money values and keeps the numeric fields", () => {
    const html = render(WIDGET_COMPONENTS.facet_sidebar, newSection("facet_sidebar"), "en");
    expect(html).toContain("aria-valuetext");
    expect(html).toContain('id="fq-facet-min"');
    expect(html).toContain('id="fq-facet-max"');
  });
});

describe("size selector", () => {
  const rows = [row("s", "S"), row("m", "M"), row("l", "L", { inStock: false })];

  it("renders a radiogroup with 44px radio options", () => {
    const html = render(WIDGET_COMPONENTS.size_selector, newSection("size_selector"), "en", rows);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
  });

  it("marks out-of-stock sizes for screen readers, bilingually", () => {
    const en = render(WIDGET_COMPONENTS.size_selector, newSection("size_selector"), "en", rows);
    expect(en).toContain("out of stock");
    // Authored headings win over locale twins by design; clear it to
    // exercise the Bengali fallback.
    const bare = { ...newSection("size_selector"), props: {} };
    const bn = render(WIDGET_COMPONENTS.size_selector, bare, "bn", rows);
    expect(bn).toContain("স্টক নেই");
    expect(bn).toContain("সাইজ");
  });
});

describe("variant picker", () => {
  const rows = [row("red-m", "Red / M"), row("blue-m", "Blue / M")];

  it("chip mode renders keyboard-navigable radios", () => {
    const html = render(WIDGET_COMPONENTS.variant_picker, newSection("variant_picker"), "en", rows);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('role="radio"');
    expect(html).toContain("aria-checked");
  });
});

describe("quantity steppers", () => {
  it("QtyStepper renders a labelled group with a real number input", () => {
    const html = renderToStaticMarkup(
      createElement(QtyStepper, {
        value: 2,
        max: 5,
        label: "Quantity for Test",
        locale: "en",
        onChange: () => {},
      }),
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Quantity for Test"');
    expect(html).toContain('type="number"');
    expect(html).toContain('aria-label="Decrease quantity"');
    expect(html).toContain('aria-label="Increase quantity"');
  });

  it("buy box stepper is a labelled group with bilingual buttons", () => {
    const rows = [row("v1", "Default", { priceMinor: 99000, inStock: true })];
    const en = render(WIDGET_COMPONENTS.buy_box, newSection("buy_box"), "en", rows);
    expect(en).toContain('aria-label="Quantity"');
    expect(en).toContain('aria-label="Decrease quantity"');
    const bn = render(WIDGET_COMPONENTS.buy_box, newSection("buy_box"), "bn", rows);
    expect(bn).toContain('aria-label="পরিমাণ"');
    expect(bn).toContain('aria-label="কমান"');
  });
});

describe("product gallery slider", () => {
  function mediaSection(): Section {
    const section = newSection("product_media");
    section.props = {
      ...section.props,
      image1: "https://example.com/1.jpg",
      image2: "https://example.com/2.jpg",
      showThumbnails: true,
      zoom: true,
    };
    return section;
  }

  it("renders prev/next steppers, a live position and thumbnails", () => {
    const html = render(WIDGET_COMPONENTS.product_media, mediaSection(), "en");
    expect(html).toContain('aria-label="Previous image"');
    expect(html).toContain('aria-label="Next image"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-label="Thumbnails"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-roledescription="slide"');
  });

  it("keeps bilingual labels", () => {
    const html = render(WIDGET_COMPONENTS.product_media, mediaSection(), "bn");
    expect(html).toContain('aria-label="আগের ছবি"');
    expect(html).toContain('aria-label="পরের ছবি"');
    expect(html).toContain('aria-label="থাম্বনেইল"');
  });

  it("zoom animation is gated behind motion-safe", () => {
    const html = render(WIDGET_COMPONENTS.product_media, mediaSection(), "en");
    expect(html).not.toContain("object-cover scale-150");
    expect(html).toContain("motion-safe:transition-transform");
  });
});
