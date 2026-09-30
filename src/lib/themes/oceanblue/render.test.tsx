/**
 * Oceanblue SSR render smoke — every authored homepage + footer section
 * resolves to a renderer through the legacy closed map (the unkeyed
 * studio/test path) and renders to static markup in EN + BN without
 * throwing. Theme-specific renderers are never required: Oceanblue
 * composes generic engine widgets only.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Locale } from "@/lib/bitext";
import type { Section } from "@/lib/builder-ast";
import {
  widgetReader,
  WIDGET_COMPONENTS,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { oceanbluePreviewSource } from "./preview";

let n = 0;
const s = (type: string, props: Record<string, unknown> = {}) =>
  ({
    id: `${type}-${n++}`,
    type,
    props,
  }) as unknown as Section;

function ctxFor(section: Section, locale: Locale): WidgetCtx {
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
    link: (href: string) => href,
  };
}

function render(section: Section, locale: Locale): string {
  const Cmp: WidgetComponent | undefined = (
    WIDGET_COMPONENTS as Record<string, WidgetComponent>
  )[section.type];
  expect(Cmp, `${section.type} must resolve a renderer`).toBeDefined();
  return renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
}

describe("oceanblue SSR render", () => {
  it("renders every homepage + footer section in EN and BN", () => {
    const sections = [...buildHomepageMain(s as never), ...buildFooterMain(s as never)];
    expect(sections.length).toBeGreaterThan(0);
    for (const section of sections) {
      for (const locale of ["en", "bn"] as const) {
        expect(
          () => render(section, locale),
          `${section.type} [${locale}] must render`,
        ).not.toThrow();
      }
    }
  });

  it("hero claims the H1 copy and rails carry headings", () => {
    const en = new Map<string, string[]>();
    for (const section of buildHomepageMain(s as never)) {
      for (const locale of ["en", "bn"] as const) {
        const html = render(section, locale);
        if (!en.has(locale)) en.set(locale, []);
        en.get(locale)!.push(html);
      }
    }
    const joined = en.get("en")!.join("\n");
    expect(joined).toContain("NEW SEASON");
    expect(joined).toContain("MOST LOVED");
    expect(joined).toContain("Shop by Color");
    const bn = en.get("bn")!.join("\n");
    expect(bn).toContain("নতুন সিজন");
    expect(bn).toContain("সবচেয়ে জনপ্রিয়");
  });

  it("preview bodies render without throwing", () => {
    const source = oceanbluePreviewSource();
    let m = 0;
    const ps = (type: string, props: Record<string, unknown> = {}) =>
      ({
        id: `${type}-${m++}`,
        type,
        props,
      }) as unknown as Section;
    for (const template of [
      "index",
      "collection",
      "product",
      "page",
      "blog",
      "search",
      "cart",
      "checkout",
      "account",
    ] as const) {
      const sections = [
        ...source.header(template, ps as never),
        ...(source.main(template, ps as never) ?? []),
        ...source.footer(template, ps as never),
      ];
      for (const section of sections) {
        expect(
          () => render(section, "en"),
          `${template}/${section.type} must render`,
        ).not.toThrow();
      }
    }
  });
});
