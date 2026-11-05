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
import { HEADER_FALLBACK_MENU } from "@/lib/header-copy";

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
  deriveCollectionHierarchy,
  extractWeaveFacets,
  filterCollectionProducts,
  sortCollectionProducts,
  resolveProductPricingAndStock,
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

  it("renders desktop filter toolbar markup and visible result count", () => {
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

  it("dynamically derives collection sub-navigation hierarchy without hardcoded third-party routes", () => {
    // Menu with Women -> Sarees, Salwar Kameez, Panjabi (no Taaga Fusion)
    const customMenu = [
      {
        id: "m-1",
        label: "Women",
        label_bn: "নারী",
        url: "/c/women",
        children: [
          { id: "m-1-1", label: "Sarees", label_bn: "শাড়ি", url: "/c/sarees" },
          { id: "m-1-2", label: "Salwar Kameez", label_bn: "সালোয়ার কামিজ", url: "/c/salwar-kameez" },
        ],
      },
      {
        id: "m-2",
        label: "Men",
        label_bn: "পুরুষ",
        url: "/c/men",
        children: [
          { id: "m-2-1", label: "Panjabi", label_bn: "পাঞ্জাবি", url: "/c/panjabi" },
        ],
      },
    ];

    // When viewing parent 'women', pills should be its children (Sarees, Salwar Kameez)
    const womenHierarchy = deriveCollectionHierarchy({
      collectionSlug: "women",
      menuTree: customMenu as any,
    });
    expect(womenHierarchy.parent).toBeUndefined();
    expect(womenHierarchy.pills.map((p) => p.slug)).toEqual(["women", "sarees", "salwar-kameez"]);
    expect(womenHierarchy.pills[0].label).toBe("All Women");
    expect(womenHierarchy.pills.map((p) => p.slug)).not.toContain("taaga-fusion");

    // When viewing child 'sarees', parent should be Women and pills should be sibling subcategories
    const sareesHierarchy = deriveCollectionHierarchy({
      collectionSlug: "sarees",
      menuTree: customMenu as any,
    });
    expect(sareesHierarchy.parent?.slug).toBe("women");
    expect(sareesHierarchy.pills.map((p) => p.slug)).toEqual(["sarees", "salwar-kameez"]);
  });

  it("accurately filters multi-variant products if ANY variant matches the price range", () => {
    const multiVariantProduct = {
      id: "mv-1",
      title: "Handloom Muslin Saree with Silver Zari",
      slug: "muslin-saree-zari",
      tags: ["muslin", "saree"],
      product_variants: [
        { id: "v-cheap", price_amount_minor_int: 350000, stock_quantity: 2 }, // BDT 3,500 (under 5k)
        { id: "v-luxe", price_amount_minor_int: 750000, stock_quantity: 1 },  // BDT 7,500 (5k-10k)
      ],
    } as unknown as CollectionProduct;

    // Matches under_5000 via v-cheap
    const under5k = filterCollectionProducts([multiVariantProduct], {
      availability: "all",
      price: "under_5000",
      tags: [],
    });
    expect(under5k).toHaveLength(1);

    // Matches 5000_10000 via v-luxe
    const midRange = filterCollectionProducts([multiVariantProduct], {
      availability: "all",
      price: "5000_10000",
      tags: [],
    });
    expect(midRange).toHaveLength(1);

    // Does NOT match above_10000
    const above10k = filterCollectionProducts([multiVariantProduct], {
      availability: "all",
      price: "above_10000",
      tags: [],
    });
    expect(above10k).toHaveLength(0);

    // Matches custom BDT min/max price range (v-cheap: 3500)
    const customMatch = filterCollectionProducts([multiVariantProduct], {
      availability: "all",
      price: "all",
      minPriceBDT: 3000,
      maxPriceBDT: 4000,
      tags: [],
    });
    expect(customMatch).toHaveLength(1);

    // Matches custom BDT min/max price range (v-luxe: 7500)
    const customMatchLuxe = filterCollectionProducts([multiVariantProduct], {
      availability: "all",
      price: "all",
      minPriceBDT: 7000,
      maxPriceBDT: 9000,
      tags: [],
    });
    expect(customMatchLuxe).toHaveLength(1);

    // Crucial variant-invariance test: range [4000, 7000] falls between v-cheap (3500) and v-luxe (7500)
    // Neither variant satisfies BOTH min and max simultaneously, so product must NOT match!
    const customNoVariantInRange = filterCollectionProducts([multiVariantProduct], {
      availability: "all",
      price: "all",
      minPriceBDT: 4000,
      maxPriceBDT: 7000,
      tags: [],
    });
    expect(customNoVariantInRange).toHaveLength(0);

    const customNoMatch = filterCollectionProducts([multiVariantProduct], {
      availability: "all",
      price: "all",
      minPriceBDT: 10000,
      maxPriceBDT: 20000,
      tags: [],
    });
    expect(customNoMatch).toHaveLength(0);

    // Test product without variants: falls back to top-level price_amount_minor_int
    const singlePriceProduct = {
      id: "sp-1",
      title: "Handmade Brass Jhumka",
      slug: "brass-jhumka",
      tags: ["jewelry", "brass"],
      price_amount_minor_int: 250000, // 2,500 BDT
      product_variants: [],
    } as unknown as CollectionProduct;

    const singleMatch = filterCollectionProducts([singlePriceProduct], {
      availability: "all",
      price: "under_5000",
      tags: [],
    });
    expect(singleMatch).toHaveLength(1);

    const singleNoMatch = filterCollectionProducts([singlePriceProduct], {
      availability: "all",
      price: "5000_10000",
      tags: [],
    });
    expect(singleNoMatch).toHaveLength(0);
  });
});

describe("Simple products and collection navigation integrity", () => {
  it("resolves pricing and stock correctly for simple products without variants", () => {
    // 1. Simple product with price and positive stock
    const pInStock = {
      id: "sp-in",
      title: "Handmade Ceramic Cup",
      price_amount_minor_int: 45000, // 450 BDT
      stock_quantity: 5,
      product_variants: [],
    } as unknown as CollectionProduct;
    const resIn = resolveProductPricingAndStock(pInStock);
    expect(resIn.hasPrice).toBe(true);
    expect(resIn.priceMinMinor).toBe(45000);
    expect(resIn.priceMaxMinor).toBe(45000);
    expect(resIn.isPriceRange).toBe(false);
    expect(resIn.inStock).toBe(true);
    expect(resIn.isOutOfStock).toBe(false);

    // 2. Simple product with stock_quantity = 0
    const pOutOfStock = {
      id: "sp-out-1",
      title: "Silk Scarf",
      price_amount_minor_int: 120000,
      stock_quantity: 0,
      product_variants: [],
    } as unknown as CollectionProduct;
    const resOut1 = resolveProductPricingAndStock(pOutOfStock);
    expect(resOut1.inStock).toBe(false);
    expect(resOut1.isOutOfStock).toBe(true);

    // 3. Simple product with stock_status = "out_of_stock"
    const pOutOfStockStatus = {
      id: "sp-out-2",
      title: "Embroidered Kurti",
      price_amount_minor_int: 180000,
      stock_status: "out_of_stock",
      product_variants: [],
    } as unknown as CollectionProduct;
    const resOut2 = resolveProductPricingAndStock(pOutOfStockStatus);
    expect(resOut2.inStock).toBe(false);
    expect(resOut2.isOutOfStock).toBe(true);

    // 4. Simple product with is_in_stock = false
    const pIsInStockFalse = {
      id: "sp-out-3",
      title: "Cotton Dupatta",
      price_amount_minor_int: 65000,
      is_in_stock: false,
      product_variants: [],
    } as unknown as CollectionProduct;
    const resOut3 = resolveProductPricingAndStock(pIsInStockFalse);
    expect(resOut3.inStock).toBe(false);
    expect(resOut3.isOutOfStock).toBe(true);

    // 5. Simple product active with no inventory metadata defaults to in-stock
    const pDefaultActive = {
      id: "sp-active",
      title: "Silver Anklet",
      price_amount_minor_int: 300000,
      product_variants: [],
    } as unknown as CollectionProduct;
    const resDefault = resolveProductPricingAndStock(pDefaultActive);
    expect(resDefault.inStock).toBe(true);
    expect(resDefault.isOutOfStock).toBe(false);
  });

  it("sorts mixed collections of simple and multi-variant products reliably without Infinity", () => {
    const mixedProducts: CollectionProduct[] = [
      {
        id: "mv-mid",
        title: "Tangail Taant Saree",
        product_variants: [{ price_amount_minor_int: 385000, stock_quantity: 5 }],
      } as unknown as CollectionProduct,
      {
        id: "sp-cheap",
        title: "Terracotta Earrings",
        price_amount_minor_int: 150000, // 1,500 BDT
        stock_quantity: 10,
        product_variants: [],
      } as unknown as CollectionProduct,
      {
        id: "mv-expensive",
        title: "Dhakai Muslin Jamdani",
        product_variants: [{ price_amount_minor_int: 2500000, stock_quantity: 2 }],
      } as unknown as CollectionProduct,
    ];

    const sortedAsc = sortCollectionProducts(mixedProducts, "price_asc");
    expect(sortedAsc.map((p) => p.id)).toEqual(["sp-cheap", "mv-mid", "mv-expensive"]);

    const sortedDesc = sortCollectionProducts(mixedProducts, "price_desc");
    expect(sortedDesc.map((p) => p.id)).toEqual(["mv-expensive", "mv-mid", "sp-cheap"]);
  });

  it("filters simple products by stock availability accurately", () => {
    const products: CollectionProduct[] = [
      {
        id: "sp-in-1",
        title: "In Stock Simple",
        price_amount_minor_int: 100000,
        stock_quantity: 3,
        product_variants: [],
      } as unknown as CollectionProduct,
      {
        id: "sp-out-1",
        title: "Out of Stock Simple",
        price_amount_minor_int: 100000,
        stock_quantity: 0,
        product_variants: [],
      } as unknown as CollectionProduct,
    ];

    const inStockOnly = filterCollectionProducts(products, {
      availability: "in_stock",
      price: "all",
      tags: [],
    });
    expect(inStockOnly.map((p) => p.id)).toEqual(["sp-in-1"]);

    const outOfStockOnly = filterCollectionProducts(products, {
      availability: "out_of_stock",
      price: "all",
      tags: [],
    });
    expect(outOfStockOnly.map((p) => p.id)).toEqual(["sp-out-1"]);
  });

  it("deriveCollectionHierarchy rejects non-collection routes and logs diagnostics", () => {
    const menuWithMixedLinks = [
      {
        id: "m-parent",
        label: "About Us",
        url: "/pages/about",
        children: [
          { id: "m-c1", label: "Contact", url: "/pages/contact" },
          { id: "m-c2", label: "Heritage Blog", url: "/blog/jamdani" },
          { id: "m-c3", label: "Festive Sarees", url: "/c/festive-sarees" },
          { id: "m-c4", label: "Silk Sarees", url: "/c/silk-sarees" },
        ],
      },
    ];

    const hierarchy = deriveCollectionHierarchy({
      collectionSlug: "festive-sarees",
      menuTree: menuWithMixedLinks as any,
    });

    // Parent is /pages/about which is not a collection, so parent should be undefined
    expect(hierarchy.parent).toBeUndefined();

    // Pills should only contain valid collection slugs, never /pages/contact or /blog/jamdani
    const pillSlugs = hierarchy.pills.map((p) => p.slug);
    expect(pillSlugs).toEqual(["festive-sarees", "silk-sarees"]);
    expect(pillSlugs).not.toContain("pages/contact");
    expect(pillSlugs).not.toContain("contact");
    expect(pillSlugs).not.toContain("blog/jamdani");

    // Diagnostics should report non-collection destinations
    expect(hierarchy.diagnostics).toBeDefined();
    const diagnostics = hierarchy.diagnostics ?? [];
    expect(diagnostics.length).toBeGreaterThan(0);
    const nonColl = diagnostics.filter((d) => d.code === "non_collection_destination");
    expect(nonColl.length).toBeGreaterThanOrEqual(2);
    expect(nonColl.map((d) => d.url)).toEqual(
      expect.arrayContaining(["/pages/contact", "/blog/jamdani"]),
    );
  });

  it("deriveCollectionHierarchy rejects unpublished or stale collection URLs against publishedCollectionSlugs", () => {
    const menuWithStaleLinks = [
      {
        id: "m-parent",
        label: "Women",
        url: "/c/women",
        children: [
          { id: "m-c1", label: "Signature Sarees", url: "/c/sarees" },
          { id: "m-c2", label: "Old Stale Collection", url: "/c/stale-collection" },
          { id: "m-c3", label: "Dhakai Jamdani", url: "/c/jamdani" },
          { id: "m-c4", label: "Deleted Draft", url: "/c/draft-collection" },
        ],
      },
    ];

    // Only sarees, jamdani and women are published
    const publishedSlugs = ["women", "sarees", "jamdani"];

    const hierarchy = deriveCollectionHierarchy({
      collectionSlug: "women",
      menuTree: menuWithStaleLinks as any,
      publishedCollectionSlugs: publishedSlugs,
    });

    const pillSlugs = hierarchy.pills.map((p) => p.slug);
    // Should include "women" (All Women), "sarees", "jamdani"
    expect(pillSlugs).toContain("women");
    expect(pillSlugs).toContain("sarees");
    expect(pillSlugs).toContain("jamdani");

    // Stale/unpublished collections MUST be excluded
    expect(pillSlugs).not.toContain("stale-collection");
    expect(pillSlugs).not.toContain("draft-collection");

    // Diagnostics should record the unpublished collections
    const staleDiags = (hierarchy.diagnostics ?? []).filter(
      (d) => d.code === "unpublished_or_stale_collection",
    );
    expect(staleDiags).toHaveLength(2);
    expect(staleDiags.map((d) => d.url)).toEqual(
      expect.arrayContaining(["/c/stale-collection", "/c/draft-collection"]),
    );
  });

  it("falls back to fallbackMenu when collection is not in custom menuTree", () => {
    const customMenuTree = [
      { id: "1", label: "Women", url: "/c/women", children: [] },
      { id: "2", label: "Men", url: "/c/men", children: [] },
    ];
    const hierarchy = deriveCollectionHierarchy({
      collectionSlug: "kids",
      menuTree: customMenuTree,
      fallbackMenu: HEADER_FALLBACK_MENU,
      publishedCollectionSlugs: ["women", "men", "kids", "living"],
    });

    const pillSlugs = hierarchy.pills.map((p) => p.slug);
    expect(pillSlugs).toContain("kids");
  });
});
