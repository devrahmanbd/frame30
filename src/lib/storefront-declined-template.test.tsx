/**
 * F1 — the STOREFRONT payload for a template the theme does not author.
 *
 * Review 4 found that the Task 4 wave's change to `loadPublished` returned
 * `null` for an absent template, and a `null` payload nulls the WHOLE theme:
 * the store's header, its footer, the theme's design tokens and the theme's
 * widget presentations all disappeared — on `/search`, `/cart`, `/checkout`,
 * `/account`, `/page` and `/blog` for every theme that declines that
 * template. The official built-in `somvabona` authors only three of the ten
 * templates (`src/lib/themes/somvabona/preview.test.ts:50-64`).
 *
 * **The rule this suite pins.** An `absent` template means an empty BODY,
 * never "no theme": the route's own platform surface renders INSIDE the
 * theme's chrome, wearing the theme's tokens and the theme's presentations.
 *
 * The proof is a RENDER: the storefront host is rendered with the payload a
 * declining theme produces, and the store's navigation, the theme's design
 * tokens and the theme's own widget presentation are all asserted to be
 * there — next to the named declined frame.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "node:fs";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => () => undefined,
    useRouterState: () => ({
      location: { pathname: "/store/somvabona/search" },
    }),
    Link: ({
      to,
      id,
      params,
      search,
      children,
      ...rest
    }: {
      to: string;
      id?: string;
      params?: unknown;
      search?: unknown;
      children?: React.ReactNode;
    }) =>
      createElement(
        "a",
        { href: to, id, params, search, ...rest } as Record<string, unknown>,
        children,
      ),
  };
});

import { ThemeChrome } from "@/components/store/ThemeChrome";
import { publishedTemplatePayload } from "@/lib/storefront.server";
import { somvabonaPreviewSource } from "@/lib/themes/somvabona/preview";
import { somvabonaTokensFor } from "@/lib/themes/somvabona/variations";
import type {
  Section,
  SectionBuilder,
  TemplateKey,
  ThemeAst,
  ThemeTemplates,
} from "@/lib/builder-ast";

/** The theme's own builder, with stable ids. */
function build(): SectionBuilder {
  let n = 0;
  return (type, props = {}) => ({
    id: `${type}-${n++}`,
    type,
    props: { ...props },
  });
}

/**
 * The published map of a theme that authors ONLY the home template — the
 * `somvabona` shape (`src/lib/themes/somvabona/preview.ts:52-95`: every
 * template but `index`, `collection` and `product` is absent).
 */
function decliningThemeMap(): ThemeTemplates {
  const source = somvabonaPreviewSource();
  const s = build();
  return {
    index: {
      header: source.header("index", s),
      main: source.main("index", s) ?? [],
      footer: source.footer("index", s),
    },
  };
}

const TEMPLATES: TemplateKey[] = ["search", "cart", "checkout", "account"];

describe("F1 — a theme that declines a template still renders the store's chrome", () => {
  it("the payload keeps the theme's chrome and drops only the body", () => {
    const templates = decliningThemeMap();
    const payload = publishedTemplatePayload({
      templates,
      template: "search",
      tenant: "merchant-1",
    });
    // The theme does NOT author the search template.
    expect(payload.authored).toBe(false);
    // …and the payload is still the THEME's: its header and its footer.
    expect(payload.ast.header).toEqual(templates.index?.header);
    expect(payload.ast.footer).toEqual(templates.index?.footer);
    // …and the BODY is empty — the route's own platform surface renders.
    expect(payload.ast.main).toEqual([]);
    // The payload is NEVER null: a declining theme is not "no theme".
    expect(payload.ast).not.toBeNull();
  });

  it("a theme that authors the template keeps its own body", () => {
    const templates = decliningThemeMap();
    const payload = publishedTemplatePayload({
      templates,
      template: "index",
      tenant: "merchant-1",
    });
    expect(payload.authored).toBe(true);
    expect(payload.ast.main).toEqual(templates.index?.main);
  });

  it("RENDERS the store's navigation, the theme's tokens and the theme's presentation", () => {
    const templates = decliningThemeMap();
    const payload = publishedTemplatePayload({
      templates,
      template: "search",
      tenant: "merchant-1",
    });
    const tokens = somvabonaTokensFor(undefined);
    const markup = renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "search",
        ast: payload.ast,
        tokens,
        themeKey: "somvabona",
        storeSlug: "somvabona",
        storeName: "Somvabona",
        fallback: createElement("div", null, "PLATFORM-SEARCH-LISTING"),
      }),
    );

    // 1. The STORE'S NAVIGATION renders — the theme's own header chrome.
    expect(markup).toContain('data-fq-node="mega_menu-0"');
    // 2. The theme's WIDGET PRESENTATION renders — the theme's own nav
    //    markup, not the platform's generic mega menu.
    expect(markup).toContain('data-header-presentation="somvabona"');
    // 3. The theme's DESIGN TOKENS render — the token stylesheet is inlined
    //    and the brand colour reaches the surface.
    expect(markup).toContain("--theme-brand");
    expect(markup).toContain(tokens.brand);
    // 4. The route's own platform surface renders — INSIDE the theme's
    //    chrome, inside the named declined frame.
    expect(markup).toContain('data-fq-theme-state="declined-template"');
    expect(markup).toContain('data-fq-template="search"');
    expect(markup).toContain("PLATFORM-SEARCH-LISTING");
    // 5. The store's footer (the policy links) renders too.
    expect(markup).toContain('data-fq-node="footer_sitemap-');
  });

  it("every declining template keeps the chrome — the store never loses its navigation", () => {
    const templates = decliningThemeMap();
    for (const template of TEMPLATES) {
      const payload = publishedTemplatePayload({
        templates,
        template,
        tenant: "merchant-1",
      });
      expect(payload.authored, `${template} is declined`).toBe(false);
      expect(payload.ast.header.length, `${template} keeps the header`).toBe(
        (templates.index?.header ?? []).length,
      );
      expect(payload.ast.footer.length, `${template} keeps the footer`).toBe(
        (templates.index?.footer ?? []).length,
      );
      expect(payload.ast.main, `${template} has no body`).toEqual([]);
    }
  });

  it("the theme's own chrome is NOT taken from the declining body — it is the HOME's", () => {
    const templates = decliningThemeMap();
    const home = templates.index as ThemeAst;
    const payload = publishedTemplatePayload({
      templates,
      template: "cart",
      tenant: "merchant-1",
    });
    expect(payload.ast.header).toBe(home.header);
    expect(payload.ast.footer).toBe(home.footer);
  });

  it("THE REGRESSION: a null payload is what loses the store's navigation", () => {
    // What the wave did: `if (!ast) return null` — the whole theme payload
    // nulled. Rendered, the store's navigation, the theme's design tokens
    // and the theme's own presentation all disappear. This case is the
    // regression's own shape, asserted, so the fix can never be undone by
    // accident.
    const broken = renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "search",
        ast: null,
        tokens: null,
        themeKey: null,
        storeSlug: "somvabona",
        storeName: "Somvabona",
        fallback: createElement("div", null, "PLATFORM-SEARCH-LISTING"),
      }),
    );
    expect(broken).not.toContain('data-fq-node="mega_menu-0"');
    expect(broken).not.toContain('data-header-presentation="somvabona"');
    expect(broken).not.toContain("--theme-brand");

    // …and the FIXED payload restores all three.
    const templates = decliningThemeMap();
    const payload = publishedTemplatePayload({
      templates,
      template: "search",
      tenant: "merchant-1",
    });
    const fixed = renderToStaticMarkup(
      createElement(ThemeChrome, {
        template: "search",
        ast: payload.ast,
        tokens: somvabonaTokensFor(undefined),
        themeKey: "somvabona",
        storeSlug: "somvabona",
        storeName: "Somvabona",
        fallback: createElement("div", null, "PLATFORM-SEARCH-LISTING"),
      }),
    );
    expect(fixed).toContain('data-fq-node="mega_menu-0"');
    expect(fixed).toContain('data-header-presentation="somvabona"');
    expect(fixed).toContain("--theme-brand");
  });

  it("WIRING: the storefront host serves this payload and never nulls a declined template", () => {
    // The behavioural cases above pin WHAT the payload is; this case pins
    // that the host serves it (the wave's `if (!ast) return null` is gone).
    const src = readFileSync(
      new URL("./storefront.server.ts", import.meta.url),
      "utf8",
    );
    expect(src).toContain("publishedTemplatePayload({");
    expect(src).not.toContain("if (!ast) return null;");
  });
});
