/**
 * Heritage wedding-shop + gift-finder widgets — TDD: catalogue, render, links.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { APPAREL_WIDGETS } from "./apparel";
import { widgetReader, type WidgetCtx } from "./widgets";

function ctxFor(section: Section, locale: "en" | "bn" = "en"): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test-store",
    data: undefined,
    renderChildren: () => null,
  };
}

describe("wedding_shop widget", () => {
  it("is registered with collection defaults", () => {
    const section = newSection("wedding_shop");
    expect(section.props["heading"]).toBeTruthy();
    expect(section.props["c1Name"]).toBeTruthy();
    expect(section.props["c1Href"]).toBeTruthy();
  });

  it("renders heading, collections and CTA links", () => {
    const section = {
      ...newSection("wedding_shop"),
      props: {
        heading: "The Wedding Shop",
        c1Name: "Bridal Sarees",
        c1Href: "/c/bridal",
        c2Name: "Groom Panjabis",
        c2Href: "/c/groom",
        buttonLabel: "Shop all wedding",
        buttonHref: "/c/wedding",
      },
    };
    const Cmp = APPAREL_WIDGETS["wedding_shop"];
    expect(Cmp).toBeTruthy();
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    for (const needle of [
      "The Wedding Shop",
      "Bridal Sarees",
      "/c/bridal",
      "Shop all wedding",
    ]) {
      expect(html, needle).toContain(needle);
    }
  });
});

describe("gift_finder widget", () => {
  it("is registered with occasion defaults", () => {
    const section = newSection("gift_finder");
    expect(section.props["heading"]).toBeTruthy();
    expect(section.props["o1Label"]).toBeTruthy();
    expect(section.props["o1Query"]).toBeTruthy();
  });

  it("renders occasion links into store search", () => {
    const section = {
      ...newSection("gift_finder"),
      props: {
        heading: "Find the perfect gift",
        o1Label: "For Her",
        o1Query: "saree",
        o2Label: "For Him",
        o2Query: "panjabi",
        buttonLabel: "Browse all gifts",
      },
    };
    const Cmp = APPAREL_WIDGETS["gift_finder"];
    expect(Cmp).toBeTruthy();
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section),
      ),
    );
    expect(html).toContain("Find the perfect gift");
    expect(html).toContain("/search");
    expect(html).toContain("saree");
  });
});
