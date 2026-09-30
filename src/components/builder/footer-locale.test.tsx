/**
 * Footer locale parity — TDD: sitemap link labels switch with locale and
 * every theme fallback column authors the _bn twin with identical hrefs.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import { CHROME_WIDGETS } from "./chrome";
import { widgetReader, type WidgetCtx } from "./widgets";
import type { Locale } from "@/lib/bitext";
import { parseLinkList } from "./chrome";
import { FALLBACK_COLUMNS as SONGOSKRITI_COLUMNS } from "@/lib/themes/songoskriti/footer";

function ctxForLocale(section: Section, locale: Locale): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "test",
    link: (href: string) => href,
    data: undefined,
    renderChildren: () => null,
  };
}

function sitemapHtml(locale: Locale): string {
  const base = newSection("footer_sitemap");
  const section = {
    ...base,
    props: {
      ...base.props,
      c1Title: "Collections",
      c1Title_bn: "সংগ্রহ",
      c1Links: "New arrivals|/c/new-in",
      c1Links_bn: "নতুন এসেছে|/c/new-in",
    },
  };
  const Cmp = CHROME_WIDGETS["footer_sitemap"];
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxForLocale(section, locale),
    ),
  );
}

const hrefs = (raw: string): string[] => parseLinkList(raw).map((l) => l.href);

describe("footer_sitemap locale parity", () => {
  it("bn renders the _bn link labels", () => {
    const html = sitemapHtml("bn");
    expect(html).toContain("নতুন এসেছে");
    expect(html).not.toContain(">New arrivals<");
  });

  it("en renders the English link labels", () => {
    const html = sitemapHtml("en");
    expect(html).toContain(">New arrivals<");
  });

  it("bn renders items-row _bn twins when menus claim the footer", () => {
    const base = newSection("footer_sitemap");
    const section = {
      ...base,
      props: {
        ...base.props,
        items: [
          {
            title: "Shop",
            title_bn: "কেনাকাটা",
            links: "New in|/c/new-in",
            links_bn: "নতুন এসেছে|/c/new-in",
          },
        ],
      },
    };
    const Cmp = CHROME_WIDGETS["footer_sitemap"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxForLocale(section, "bn"),
      ),
    );
    expect(html).toContain("কেনাকাটা");
    expect(html).toContain("নতুন এসেছে");
    expect(html).not.toContain(">New in<");
  });

  it.each([["songoskriti", SONGOSKRITI_COLUMNS]])(
    "%s fallback columns author links_bn with identical hrefs",
    (_name, cols) => {
      for (const col of cols) {
        const linksBn = (col as { links_bn?: string }).links_bn;
        expect(linksBn, `${col.title} links_bn missing`).toBeTruthy();
        expect(hrefs(linksBn as string)).toEqual(hrefs(col.links));
      }
    },
  );
});
