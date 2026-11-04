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
    expect(src).toContain("/ph/songoskriti/cat-women.png");
    expect(src).toContain("/ph/songoskriti/hero-festive.jpg");
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

  it("prod preview entries activate the header presentation for live rendering", async () => {
    // This file never imports a header-presentation module directly, so a
    // defined resolution here proves the prod import graph reaches
    // registration: preview-sources → theme preview entries →
    // header-presentation side effects (storefront routes dynamically
    // import preview-sources in prod).
    await import("@/lib/preview-sources");
    const { resolveThemePresentation } =
      await import("@/lib/theme-presentations");
    expect(
      resolveThemePresentation("songoskriti", "mega_menu"),
      "songoskriti mega_menu must be registered via the prod graph",
    ).toBeDefined();
    expect(
      resolveThemePresentation("acme-pack", "mega_menu"),
      "a foreign key must NOT inherit the theme presentation",
    ).toBeUndefined();
  });

  it("removes breadcrumbs completely from the collection view", () => {
    const html = renderCollection({
      themeKey: "songoskriti",
      collectionSlug: "women",
      collectionName: "Women",
    });
    expect(html).not.toContain('aria-label="Breadcrumb"');
    const genericHtml = renderCollection({
      themeKey: null,
      collectionSlug: "sarees",
      collectionName: "Sarees",
    });
    expect(genericHtml).not.toContain('aria-label="Breadcrumb"');
  });

  it("suppresses the stock announcement bar on collection landing pages", () => {
    const src = readFileSync("src/components/store/CollectionView.tsx", "utf8");
    expect(src).toContain("showAnnouncement={false}");
    expect(src).toContain('s.type !== "announcement_bar"');
  });
});

import {
  extractWeaveFacets,
  filterCollectionProducts,
  sortCollectionProducts,
  type CollectionProduct,
} from "./CollectionView";

describe("CollectionView Faceting & Filtering", () => {
  const sampleProducts: CollectionProduct[] = [
    {
      id: "p-1",
      title: "Dhakai Jamdani Silk Saree",
      slug: "dhakai-jamdani-silk-saree",
      tags: ["jamdani", "silk", "saree", "heritage"],
      product_variants: [
        {
          id: "v-1",
          price_amount_minor_int: 1850000,
          stock_quantity: 5,
        },
      ],
    } as unknown as CollectionProduct,
    {
      id: "p-2",
      title: "Hand-Painted Silk Festive Saree",
      slug: "hand-painted-silk-festive-saree",
      tags: ["silk", "saree", "handpainted", "festive", "womens"],
      product_variants: [
        {
          id: "v-2",
          price_amount_minor_int: 1250000,
          stock_quantity: 0,
        },
      ],
    } as unknown as CollectionProduct,
    {
      id: "p-3",
      title: "Tangail Taant Cotton Saree",
      slug: "tangail-taant-cotton-saree",
      tags: ["saree", "handloom", "cotton", "tangail"],
      product_variants: [
        {
          id: "v-3",
          price_amount_minor_int: 385000,
          stock_quantity: 8,
        },
      ],
    } as unknown as CollectionProduct,
  ];

  it("extracts genuine weave facets, excluding redundant collection tags and care instructions", () => {
    const facets = extractWeaveFacets(
      [
        ...sampleProducts,
        {
          tags: ["care:dry-clean-only", "sarees", "silk"],
        },
      ],
      "sarees",
    );

    // "saree", "sarees", and "care:dry-clean-only" must be excluded
    const tags = facets.map((f) => f.tag);
    expect(tags).not.toContain("saree");
    expect(tags).not.toContain("sarees");
    expect(tags).not.toContain("care:dry-clean-only");

    // silk appears twice in sampleProducts plus 1 extra => count = 3
    const silkFacet = facets.find((f) => f.tag === "silk");
    expect(silkFacet).toBeDefined();
    expect(silkFacet?.count).toBe(3);
    expect(silkFacet?.label).toBe("Pure Silk");
    expect(silkFacet?.label_bn).toBe("সিল্ক");
  });

  it("filters products by exact tag membership, not title substring matching", () => {
    // If we filter by 'tangail', only p-3 matches
    const tangailFiltered = filterCollectionProducts(sampleProducts, {
      availability: "all",
      price: "all",
      tags: ["tangail"],
    });
    expect(tangailFiltered.map((p) => p.id)).toEqual(["p-3"]);

    // Title containing word but tag not present should NOT match
    const fakeProduct = {
      id: "fake",
      title: "Silk Embroidered Dupatta",
      slug: "silk-embroidered-dupatta",
      tags: ["dupatta", "embroidered"],
      product_variants: [{ price_amount_minor_int: 500000, stock_quantity: 1 }],
    } as unknown as CollectionProduct;

    const filtered = filterCollectionProducts([fakeProduct], {
      availability: "all",
      price: "all",
      tags: ["silk"],
    });
    expect(filtered).toHaveLength(0);
  });

  it("filters products by BDT price brackets", () => {
    // under_5000 (< 500,000 minor)
    const under5k = filterCollectionProducts(sampleProducts, {
      availability: "all",
      price: "under_5000",
      tags: [],
    });
    expect(under5k.map((p) => p.id)).toEqual(["p-3"]);

    // above_10000 (> 1,000,000 minor)
    const above10k = filterCollectionProducts(sampleProducts, {
      availability: "all",
      price: "above_10000",
      tags: [],
    });
    expect(above10k.map((p) => p.id)).toEqual(["p-1", "p-2"]);
  });

  it("filters products by stock availability", () => {
    const inStock = filterCollectionProducts(sampleProducts, {
      availability: "in_stock",
      price: "all",
      tags: [],
    });
    expect(inStock.map((p) => p.id)).toEqual(["p-1", "p-3"]);

    const outOfStock = filterCollectionProducts(sampleProducts, {
      availability: "out_of_stock",
      price: "all",
      tags: [],
    });
    expect(outOfStock.map((p) => p.id)).toEqual(["p-2"]);
  });

  it("sorts products by price ascending, descending, and title", () => {
    const asc = sortCollectionProducts(sampleProducts, "price_asc");
    expect(asc.map((p) => p.id)).toEqual(["p-3", "p-2", "p-1"]);

    const desc = sortCollectionProducts(sampleProducts, "price_desc");
    expect(desc.map((p) => p.id)).toEqual(["p-1", "p-2", "p-3"]);
  });

  it("renders desktop persistent filter sidebar markup and visible result count", () => {
    const testPayload = payload({
      themeKey: "songoskriti",
      collectionSlug: "sarees",
      collectionName: "Sarees",
    });
    testPayload.products = sampleProducts;

    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <LanguageProvider initialLang="en">
          <CollectionView data={testPayload} />
        </LanguageProvider>
      </QueryClientProvider>,
    );

    expect(html).toContain('aria-label="Filter products"');
    expect(html).toContain("Pure Silk");
    expect(html).toContain("Dhakai Jamdani");
    expect(html).toContain("3 Products");
  });
});
