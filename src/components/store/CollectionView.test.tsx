/**
 * Theme-remediation fix round — CollectionView hero images.
 *
 * The department/campaign hero block assigned `/ph/songoskriti/*` brand
 * assets purely on collection slug, so every non-songoskriti store on a
 * `women`/`men`/`festive` collection rendered songoskriti brand imagery.
 * Brand follows the installed theme key: non-songoskriti keys render zero
 * songoskriti paths; the songoskriti key keeps its heroes (pinned below so
 * the gate can't over-correct into a blank theme page).
 *
 * Vitest env node — NO jsdom/testing-library/renderHook. Static markup
 * via renderToStaticMarkup + router stub (StoreHeader.test.tsx precedent).
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

const mockPathname = vi.hoisted(() => ({ current: "/store/demo/c/women" }));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: mockPathname.current } }),
    Link: ({
      to,
      params,
      children,
      ...rest
    }: {
      to: string;
      params?: unknown;
      children?: React.ReactNode;
    }) => (
      <a
        data-link-to={to}
        data-link-params={JSON.stringify(params ?? null)}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

import { CollectionView, type CollectionPayload } from "./CollectionView";
import { LanguageProvider } from "@/lib/i18n";

function payload({
  themeKey,
  collectionSlug,
  collectionName,
}: {
  themeKey: string | null;
  collectionSlug: string;
  collectionName: string;
}): CollectionPayload {
  return {
    merchant: {
      id: "m-demo",
      name: "Demo Store",
      slug: "demo",
      currency_code: "BDT",
    },
    collection: {
      id: "c-1",
      name: collectionName,
      slug: collectionSlug,
      description: null,
    },
    products: [],
    settings: null,
    seo: null,
    siteKit: null,
    menus: { header: [], mobile: [] },
    installedPlugins: [],
    ast: { header: [], main: [], footer: [] },
    tokens: null,
    themeKey,
    origin: "https://example.com",
  } as unknown as CollectionPayload;
}

function renderCollection(args: {
  themeKey: string | null;
  collectionSlug: string;
  collectionName: string;
}) {
  mockPathname.current = `/store/demo/c/${args.collectionSlug}`;
  const ui: ReactElement = (
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider initialLang="en">
        <CollectionView data={payload(args)} />
      </LanguageProvider>
    </QueryClientProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("CollectionView hero images follow the theme key, never the slug", () => {
  it.each(["women", "men", "festive"])(
    "non-songoskriti key + %s slug renders zero /ph/songoskriti paths",
    (slug) => {
      const html = renderCollection({
        themeKey: "bazaar",
        collectionSlug: slug,
        collectionName: slug,
      });
      expect(html).not.toContain("/ph/songoskriti");
    },
  );

  it("null themeKey + women slug renders zero /ph/songoskriti paths", () => {
    const html = renderCollection({
      themeKey: null,
      collectionSlug: "women",
      collectionName: "Women",
    });
    expect(html).not.toContain("/ph/songoskriti");
  });

  it("songoskriti key keeps its heroes (gate must not blank the theme page)", () => {
    // Static markup can't observe the theme hero: an empty theme AST is
    // always filled by the theme-owned archetype (islands hydrate
    // client-side), and the theme product_grid override renders its own
    // body instead of the host slot. So preservation is pinned at the
    // source gate plus a render pin that the theme page still serves the
    // collection — the leak regression above is the render pin.
    const src = readFileSync("src/components/store/CollectionView.tsx", "utf8");
    expect(src).toMatch(/if \(isSongoskriti\) \{\s*\n\s*showHero = true;/);
    expect(src).toContain("/ph/songoskriti/songoskriti-hero.jpg");
    expect(src).toContain("/ph/songoskriti/hero-festive.png");
    const html = renderCollection({
      themeKey: "songoskriti",
      collectionSlug: "women",
      collectionName: "Women",
    });
    expect(html).toContain("Women");
  });
});

describe("CollectionView header-fallback de-theming (HEADER DE-THEMING lane)", () => {
  it("resolves the fallback menu through the neutral copy module, never a theme import", () => {
    // Extends the theme-chrome.test.ts no-theme-import scan to this shared
    // renderer: the only header-fallback edge allowed here is the neutral
    // `@/lib/header-copy` path. (The archetypes edge on line 14 is owned by
    // the archetype lane and is deliberately out of scope here.)
    const src = readFileSync("src/components/store/CollectionView.tsx", "utf8");
    expect(src).toContain("@/lib/header-copy");
    expect(src).not.toContain("themes/songoskriti/header-fallback");
    expect(src).not.toContain("themes/somvabona/header-fallback");
    expect(src).not.toContain("SONGOSKRITI_MEGA_MENU");
  });

  it("prod preview entries activate both header presentations for live rendering", async () => {
    // This file never imports a header-presentation module directly, so a
    // defined resolution here proves the prod import graph reaches
    // registration: preview-sources → theme preview entries →
    // header-presentation side effects (storefront routes dynamically
    // import preview-sources in prod).
    await import("@/lib/preview-sources");
    const { resolveThemePresentation } = await import(
      "@/lib/theme-presentations"
    );
    expect(
      resolveThemePresentation("songoskriti", "mega_menu"),
      "songoskriti mega_menu must be registered via the prod graph",
    ).toBeDefined();
    expect(
      resolveThemePresentation("somvabona", "mega_menu"),
      "somvabona mega_menu must be registered via the prod graph",
    ).toBeDefined();
  });
});
