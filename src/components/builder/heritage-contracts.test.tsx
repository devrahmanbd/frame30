/**
 * Heritage contract dual-read — TDD: blueprint aliases must render.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { HERITAGE_WIDGETS } from "./heritage";
import { widgetReader, type WidgetCtx } from "./widgets";

function ctxFor(section: Section): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, "en"),
    link: (href: string) => href,
    Heading: "h2",
    primary: false,
    editing: false,
    locale: "en",
    storeSlug: "test",
    data: undefined,
    renderChildren: () => null,
  };
}

describe("heritage contract dual-read", () => {
  it("heritage_story reads heading/cta aliases", () => {
    const base = newSection("heritage_story");
    const section = {
      ...base,
      props: {
        ...base.props,
        heading: "Tangail & Jamdani",
        body: "Woven craft",
        ctaLabel: "Read the story",
        ctaHref: "/blog/x",
      },
    };
    const Cmp = HERITAGE_WIDGETS["heritage_story"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Tangail &amp; Jamdani");
    expect(html).toContain("Read the story");
  });

  it("textile_showcase reads items[]", () => {
    const base = newSection("textile_showcase");
    const section = {
      ...base,
      props: {
        ...base.props,
        headline: "Our textiles",
        items: [
          {
            image: "/api/public/ph/a.svg",
            title: "Jamdani",
            subtitle: "Royal drape",
          },
        ],
      },
    };
    const Cmp = HERITAGE_WIDGETS["textile_showcase"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Jamdani");
  });

  it("editorial_banner reads heading/body aliases", () => {
    const base = newSection("editorial_banner");
    const section = {
      ...base,
      props: {
        ...base.props,
        heading: "Silk panjabi",
        body: "Breathable fibers",
        ctaLabel: "See collection",
        ctaHref: "/c/x",
      },
    };
    const Cmp = HERITAGE_WIDGETS["editorial_banner"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Silk panjabi");
  });

  it("marquee_strip reads label fallback", () => {
    const base = newSection("marquee_strip");
    const section = {
      ...base,
      props: { ...base.props, label: "Handloom · Fair Trade" },
    };
    const Cmp = HERITAGE_WIDGETS["marquee_strip"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Handloom");
  });

  it("hero_carousel renders a warm atmosphere layer", () => {
    const base = newSection("hero_carousel");
    const section = {
      ...base,
      props: {
        ...base.props,
        slides: [{ headline: "Festive Drop" }],
      },
    };
    const Cmp = HERITAGE_WIDGETS["hero_carousel"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("fq-theme-aurora");
    expect(html).toContain("pointer-events-none");
  });

  it("hero_carousel omits the wash when atmosphere is none", () => {
    const base = newSection("hero_carousel");
    const section = {
      ...base,
      props: {
        ...base.props,
        atmosphere: "none",
        slides: [{ headline: "Festive Drop" }],
      },
    };
    const Cmp = HERITAGE_WIDGETS["hero_carousel"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).not.toContain("fq-theme-aurora");
    expect(html).not.toContain("fq-heritage-aurora");
  });

  it("hero_carousel banner renders scrim + overlay parts, no wash", () => {
    const base = newSection("hero_carousel");
    const section = {
      ...base,
      props: {
        ...base.props,
        skin: "banner",
        slides: [
          {
            headline: "Festive Drop",
            subhead: "Cotton sarees.",
            ctaLabel: "Shop festive",
            ctaUrl: "/c/festive",
            caption: "New season",
          },
          {
            headline: "Second drop",
            subhead: "",
            ctaLabel: "",
            ctaUrl: "",
            caption: "",
          },
        ],
      },
    };
    const Cmp = HERITAGE_WIDGETS["hero_carousel"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("bg-gradient-to-t");
    expect(html).toContain("data-hero-eyebrow");
    expect(html).toContain("data-hero-headline");
    expect(html).toContain("data-hero-sub");
    expect(html).toContain("data-hero-cta");
    expect(html).toContain("translateX(-0%)");
    expect(html).not.toContain("fq-theme-aurora");
  });

  it("editorial_banner applies glass surface when surface is glass", () => {
    const base = newSection("editorial_banner");
    const section = {
      ...base,
      props: {
        ...base.props,
        heading: "Silk panjabi",
        surface: "glass",
      },
    };
    const Cmp = HERITAGE_WIDGETS["editorial_banner"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("fq-theme-glass");
  });
});
