/**
 * Oceanblue-v2 SSR render smoke — every authored homepage + footer section
 * resolves to a renderer through the themed storefront path
 * (`resolveWidgetComponent("oceanblue-v2", …)`) and renders non-empty
 * static markup in EN + BN without throwing. Resolving via the legacy
 * unkeyed map would hide a themed miss (a section resolving to undefined
 * renders null on the storefront). Theme-specific renderers are never
 * required: Oceanblue-v2 composes generic engine widgets only.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Locale } from "@/lib/bitext";
import type { Section } from "@/lib/builder-ast";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import { resolveWidgetComponent } from "@/components/builder/theme-widgets";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";
import { buildHomepageMain } from "./homepage";
import { oceanblueV2PreviewSource } from "./preview";

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
  const Cmp = resolveWidgetComponent(
    "oceanblue-v2",
    section.type as Parameters<typeof resolveWidgetComponent>[1],
  ) as WidgetComponent | undefined;
  expect(Cmp, `${section.type} must resolve a renderer`).toBeDefined();
  const html = renderToStaticMarkup(
    createElement(
      Cmp as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
  expect(
    html.trim().length,
    `${section.type} must render markup`,
  ).toBeGreaterThan(0);
  return html;
}

describe("oceanblue-v2 SSR render", () => {
  it("renders every homepage + footer section in EN and BN", () => {
    const sections = [
      ...buildHomepageMain(s as never),
      ...buildFooterMain(s as never),
    ];
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
    const source = oceanblueV2PreviewSource();
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
