/**
 * Hero locale gating — TDD: the hero headline renders ONE locale, never both.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { HERITAGE_WIDGETS } from "./heritage";
import { widgetReader, type WidgetCtx } from "./widgets";
import type { Locale } from "@/lib/bitext";

function ctxForLocale(section: Section, locale: Locale): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    data: undefined,
    renderChildren: () => null,
  };
}

const SLIDE = {
  image: "/ph/x.jpg",
  headline: "Festive wear, ready to ship",
  headline_bn: "উৎসবের পোশাক, এখনই ডেলিভারি",
  subhead: "Cotton sarees.",
  subhead_bn: "সুতি শাড়ি।",
  ctaLabel: "Shop festive",
  ctaUrl: "/c/festive",
  caption: "Festive drop",
};

function heroHtml(locale: Locale): string {
  const base = newSection("hero_carousel");
  const section = { ...base, props: { ...base.props, slides: [SLIDE] } };
  const Cmp = HERITAGE_WIDGETS["hero_carousel"];
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxForLocale(section, locale),
    ),
  );
}

describe("hero_carousel locale gating", () => {
  it("en renders only the English headline", () => {
    const html = heroHtml("en");
    expect(html).toContain("Festive wear, ready to ship");
    expect(html).not.toContain("উৎসবের পোশাক");
  });

  it("bn renders only the Bangla headline", () => {
    const html = heroHtml("bn");
    expect(html).toContain("উৎসবের পোশাক");
    expect(html).not.toContain(">Festive wear, ready to ship<");
  });

  it("bn falls back to English when headline_bn is missing", () => {
    const base = newSection("hero_carousel");
    const section = {
      ...base,
      props: { ...base.props, slides: [{ headline: "Only English" }] },
    };
    const Cmp = HERITAGE_WIDGETS["hero_carousel"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxForLocale(section, "bn"),
      ),
    );
    expect(html).toContain("Only English");
  });
});
