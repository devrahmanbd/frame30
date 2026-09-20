/**
 * Rupaboti vibrant redesign — voiced shells render smoke test.
 *
 * Every homepage-scope beauty widget must render without throwing under both
 * locales, merchant copy must survive the redesign verbatim, and the shade
 * finder must expose the single gsap moment's targets.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import type { WidgetRow } from "@/lib/widget-data";
import { BEAUTY_WIDGETS } from "./beauty";
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
    storeSlug: "rupaboti-beauty",
    data,
    renderChildren: () => null,
  };
}

function renderWidget(
  type: keyof typeof BEAUTY_WIDGETS,
  ctx: WidgetCtx,
): string {
  // createElement (not a direct call) so hookful widgets get a dispatcher.
  return renderToStaticMarkup(
    createElement(
      BEAUTY_WIDGETS[type] as (props: WidgetCtx) => null,
      ctx as never,
    ),
  );
}

const HOMEPAGE_TYPES: Section["type"][] = [
  "shade_finder",
  "skin_quiz",
  "claim_chips",
  "before_after",
  "texture_strip",
  "routine_builder",
  "sample_picker",
  "ingredient_glossary",
  "loyalty_strip",
  "consult_cta",
];

describe("rupaboti voiced shells", () => {
  for (const type of HOMEPAGE_TYPES) {
    it(`${type} renders without throwing in en and bn`, () => {
      for (const locale of ["en", "bn"] as const) {
        const section = { ...newSection(type), props: {} };
        const ctx = ctxFor(section, locale, { rows: [], pending: false });
        expect(() =>
          renderWidget(type as keyof typeof BEAUTY_WIDGETS, ctx),
        ).not.toThrow();
      }
    });
  }

  it("shade finder mounts the single motion moment root (swatches cascade on entry)", () => {
    const section = { ...newSection("shade_finder"), props: {} };
    const html = renderWidget(
      "shade_finder",
      ctxFor(section, "en", { rows: [], pending: false }),
    );
    // The moment root scopes the gsap cascade; swatch targets render once
    // the shopper finishes the two questions (results state).
    expect(html).toContain("data-rupaboti-moment");
  });

  it("merchant copy is preserved verbatim through the voiced shells", () => {
    const section = {
      ...newSection("skin_quiz"),
      props: {
        heading: "Two-minute skin quiz",
        body: "Four questions, one routine.",
      },
    };
    const html = renderWidget(
      "skin_quiz",
      ctxFor(section, "en", { rows: [], pending: false }),
    );
    expect(html).toContain("Two-minute skin quiz");
    expect(html).toContain("Four questions, one routine.");
  });

  it("no voiced shell emits an all-caps eyebrow label", () => {
    for (const type of HOMEPAGE_TYPES) {
      const section = { ...newSection(type), props: {} };
      const html = renderWidget(
        type as keyof typeof BEAUTY_WIDGETS,
        ctxFor(section, "en", { rows: [], pending: false }),
      );
      expect(html, type).not.toMatch(
        /tracking-\[0\.18em\]|tracking-\[0\.22em\]/,
      );
    }
  });
});
