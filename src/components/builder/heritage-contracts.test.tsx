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
});
