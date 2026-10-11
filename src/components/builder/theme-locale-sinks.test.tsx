/**
 * Theme locale-string sinks — hostile `templates/*.json` copy must render inert.
 *
 * Chain under test (no mocks of the render path):
 *   raw templates JSON → `parseTemplates` (`src/lib/builder-ast.ts`, the same
 *   gate every lane runs: studio autosave/publish in `themes.server.ts`,
 *   storefront reads in `publishedTheme`, listing installs in
 *   `marketplace-install.server.ts`) → `widgetReader`/`resolveDynamicProps`
 *   → the real widget component → `renderToStaticMarkup`.
 *
 * Note on `locales/*.json`: those files are never parsed into the render
 * tree — `templatesOf` (`package-install.server.ts:300`) reads only
 * `templates/*.json` into draft/version rows, and no module reads a locale
 * asset's content (they are stored version assets served as
 * `application/json` + `nosniff` via `/pkg/`, with zero fetch consumers).
 * The strings that actually reach the DOM are the bilingual props
 * (`key` + `key_bn`) inside `templates/*.json`. That is what this file pins.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseTemplates, templateOf, type Section } from "@/lib/builder-ast";
import type { Locale } from "@/lib/bitext";
import { resolveDynamicProps } from "@/lib/dynamic-tags";
import { HERITAGE_WIDGETS } from "./heritage";
import { WIDGET_COMPONENTS, widgetReader, type WidgetCtx } from "./widgets";
import { SectionRenderer } from "./SectionRenderer";
import "@/lib/themes/songoskriti/footer-proof-presentation";

function ctxFor(section: Section, locale: Locale): WidgetCtx {
  // Dynamic tags resolve before any widget reads the node — the same order
  // `SectionRenderer` uses — so `{{…}}` output below is the real behavior.
  const props = resolveDynamicProps(section.props, {});
  const resolved = props === section.props ? section : { ...section, props };
  return {
    section: resolved,
    ...widgetReader(resolved, undefined, locale),
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

function sectionOf(
  templateJson: unknown,
  slot: "header" | "main" | "footer" = "main",
): Section {
  const templates = parseTemplates({ index: templateJson });
  const section = templateOf(templates, "index")[slot][0];
  if (!section) throw new Error("expected one section");
  return section;
}

function renderWidget(
  type: keyof typeof HERITAGE_WIDGETS,
  section: Section,
  locale: Locale,
): string {
  const Cmp = HERITAGE_WIDGETS[type];
  if (!Cmp) throw new Error(`no heritage widget: ${String(type)}`);
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
}

describe("theme locale sinks: hostile copy renders inert", () => {
  it("department_grid: hostile titles render as escaped text nodes", () => {
    const section = sectionOf({
      header: [],
      footer: [],
      main: [
        {
          id: "d1",
          type: "department_grid",
          props: {
            columns: 4,
            departments: [
              {
                title: "<script>alert(1)</script>",
                href: "/c/ok",
                image: "/ph/a.jpg",
              },
              {
                title: '"><img src=x onerror=alert(2)>',
                href: "/c/ok2",
                image: "/ph/b.jpg",
              },
            ],
          },
        },
      ],
    });
    const html = renderWidget("department_grid", section, "en");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=");
    // House behavior: script/style blocks are removed with their content at
    // parse; tag residue that survives is escaped by React as a text node.
    expect(html).toContain('href="/c/ok"');
    expect(html).toContain("&quot;");
    const bn = renderWidget("department_grid", section, "bn");
    expect(bn).not.toContain("onerror=");
    expect(bn).toContain("&quot;");
  });

  it("department_grid: a javascript: row href never reaches the anchor", () => {
    const section = sectionOf({
      header: [],
      footer: [],
      main: [
        {
          id: "d1",
          type: "department_grid",
          props: {
            columns: 4,
            departments: [
              {
                title: "Evil",
                href: "javascript:alert(3)",
                image: "/ph/a.jpg",
              },
              {
                title: "Mixed case",
                href: "  \n JaVaScRiPt:alert(4)",
                image: "/ph/b.jpg",
              },
            ],
          },
        },
      ],
    });
    // Parse gate: the `url` field kind rejects non-allowlisted schemes.
    const rows = section.props["departments"];
    expect(Array.isArray(rows)).toBe(true);
    for (const row of rows as Record<string, unknown>[]) {
      expect(typeof row["href"] === "string" ? row["href"] : "").not.toMatch(
        /javascript:/i,
      );
    }
    const html = renderWidget("department_grid", section, "en");
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("hero_carousel: hostile bitext + template syntax render inert in both locales", () => {
    const section = sectionOf({
      header: [],
      footer: [],
      main: [
        {
          id: "h1",
          type: "hero_carousel",
          props: {
            slides: [
              {
                image: "/ph/x.jpg",
                headline: "<script>alert(1)</script>",
                headline_bn: '"><svg onload=alert(2)>',
                subhead: "{{evil.key}} and {{product.title}}",
                ctaLabel: "javascript:alert(3)",
                ctaUrl: "/c/festive",
              },
            ],
          },
        },
      ],
    });
    for (const locale of ["en", "bn"] as const) {
      const html = renderWidget("hero_carousel", section, locale);
      expect(html, locale).not.toContain("<script>");
      expect(html, locale).not.toContain("onload=");
      // Unknown tags resolve to their fallback ("") — shoppers never see braces.
      expect(html, locale).not.toContain("{{");
      expect(html, locale).not.toContain("}}");
    }
    const en = renderWidget("hero_carousel", section, "en");
    // The sanitiser removes the script block with its content at parse, so
    // the headline element renders empty — never a script element.
    expect(en).toContain("data-hero-headline");
    // A javascript: string in *copy* is inert link text, never a link.
    expect(en).toContain(">javascript:alert(3)<");
    expect(en).toContain('href="/c/festive"');
    const bn = renderWidget("hero_carousel", section, "bn");
    expect(bn).not.toContain("onload=");
    expect(bn).toContain("&quot;");
  });

  it("sticky_bar: a javascript: button link is rejected by the url field kind", () => {
    const section = sectionOf(
      {
        header: [
          {
            id: "s1",
            type: "sticky_bar",
            props: {
              text: "Sale",
              ctaLabel: "Shop",
              ctaHref: "javascript:alert(1)",
              position: "bottom",
            },
          },
        ],
        footer: [],
        main: [],
      },
      "header",
    );
    // `sticky_bar` renders `href={str("ctaHref")}` raw (no `link()` wrap),
    // so the parse-time `url` kind is the gate — pin it.
    expect(section.props["ctaHref"]).toBe("");
    const Cmp = WIDGET_COMPONENTS["sticky_bar"];
    const html = renderToStaticMarkup(
      createElement(
        Cmp as (p: WidgetCtx) => React.ReactElement,
        ctxFor(section, "en"),
      ),
    );
    expect(html.toLowerCase()).not.toContain("javascript:");
  });

  it("footer_sitemap: hostile Label|javascript: links are neutralised by link()", () => {
    const section = sectionOf(
      {
        header: [],
        main: [],
        footer: [
          {
            id: "f1",
            type: "footer_sitemap",
            props: {
              c1Title: "Shop",
              c1Links: "Evil|javascript:alert(1)\nOk|/c/ok",
              c2Title: "",
              c2Links: "",
              c3Title: "",
              c3Links: "",
              c4Title: "",
              c4Links: "",
            },
          },
        ],
      },
      "footer",
    );
    // Full host path: SectionRenderer builds the real `link()` (scheme gate
    // + linkBase rebase), so this pins the production neutralisation:
    // `javascript:` becomes the inert same-origin path `/javascript:…`.
    const html = renderToStaticMarkup(
      createElement(SectionRenderer, {
        section,
        themeKey: "songoskriti",
        locale: "en" as Locale,
      }),
    );
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).toContain('href="/javascript:alert(1)"');
    expect(html.toLowerCase()).toContain("evil");
    expect(html).toContain("/c/ok");
  });
});
