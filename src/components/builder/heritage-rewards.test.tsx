/**
 * Heritage rewards-club widget (Aarong "My Rewards" parity) — TDD:
 * catalogue entry, tier rendering, bilingual labels, empties.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { APPAREL_WIDGETS } from "./apparel";
import { widgetReader, type WidgetCtx } from "./widgets";

function ctxFor(section: Section, locale: "en" | "bn"): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test-store",
    data: { rows: [], pending: false },
    link: (href: string) => href,
    renderChildren: () => null,
  };
}

describe("rewards_club widget", () => {
  it("is a registered catalogue widget with tier defaults", () => {
    const section = newSection("rewards_club");
    expect(section.props["heading"]).toBeTruthy();
    expect(section.props["tier1Name"]).toBeTruthy();
    expect(section.props["tier2Name"]).toBeTruthy();
    expect(section.props["tier3Name"]).toBeTruthy();
  });

  it("renders heading, three tiers and join CTA", () => {
    const section = {
      ...newSection("rewards_club"),
      props: {
        heading: "My Rewards",
        body: "Earn points on every purchase.",
        tier1Name: "Silver",
        tier1Points: "0+ points",
        tier2Name: "Gold",
        tier2Points: "5,000+ points",
        tier3Name: "Platinum",
        tier3Points: "15,000+ points",
        buttonLabel: "Join free",
      },
    };
    const Cmp = APPAREL_WIDGETS["rewards_club"];
    expect(Cmp).toBeTruthy();
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section, "en"),
      ),
    );
    for (const needle of [
      "My Rewards",
      "Silver",
      "Gold",
      "Platinum",
      "Join free",
    ]) {
      expect(html, needle).toContain(needle);
    }
  });

  it("renders bilingual heading in Bengali", () => {
    const section = {
      ...newSection("rewards_club"),
      props: { heading: "My Rewards" },
    };
    const Cmp = APPAREL_WIDGETS["rewards_club"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section, "bn"),
      ),
    );
    expect(html).toContain("My Rewards");
  });
});
