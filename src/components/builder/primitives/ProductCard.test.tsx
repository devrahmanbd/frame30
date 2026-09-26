/**
 * Phase1-T1 contract tests — ProductCard motion phase 1.
 *
 * Covers the full brief contract: staggered hover crossfade, Quick View
 * dialog trigger, wishlist heart with optimistic count badge, merch badges
 * (sale-ribbon precedence, online-exclusive, low-stock), data plumbing
 * (handle / variantId / stockCount / tags / imageUrls), and the null-image
 * placeholder contract shared with ProductTileArt.test.tsx.
 *
 * No jsdom/testing-library in this repo — static markup + source asserts.
 * Source-asserted files are read fresh from disk so the asserts document
 * the intended wiring without depending on render-time module graphs.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import type { Locale } from "@/lib/bitext";
import type { WidgetRow } from "@/lib/widget-data";
import { StoreSlugContext } from "@/lib/store-slug-context";
import { placeholderSeed } from "@/lib/placeholder";
import { ProductCard, savePercent } from "./ProductCard";

// Quick View mounts useServerFn only when opened, but the wishlist heart
// wires its mutation at mount — both read the TanStack router, which the
// bare render path here does not provide. Stub the hooks they use.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/store/demo" } }),
    useRouter: () => ({
      stores: { location: { get: () => ({ pathname: "/store/demo" }) } },
    }),
  };
});

const CARD_SRC = readFileSync(
  "src/components/builder/primitives/ProductCard.tsx",
  "utf8",
);
const WIDGET_SRC = readFileSync("src/lib/widget-data.ts", "utf8");
const SERVER_SRC = readFileSync("src/lib/widget-data.server.ts", "utf8");
const RENDERER_SRC = readFileSync(
  "src/components/builder/SectionRenderer.tsx",
  "utf8",
);
const WISHLIST_CARD_PATH = "src/lib/wishlist-card.ts";
const WISHLIST_CARD_SRC = existsSync(WISHLIST_CARD_PATH)
  ? readFileSync(WISHLIST_CARD_PATH, "utf8")
  : "";

const ROW_ID = "e0ba0000-0000-4000-8000-000000000401";
const VARIANT_A = "e0ba0000-0000-4000-8000-0000000004aa";
const VARIANT_B = "e0ba0000-0000-4000-8000-0000000004bb";

const BASE_ROW = {
  id: ROW_ID,
  title: "Jamdani Handloom Saree",
  href: "/store/demo/product/jamdani",
  imageUrl: "https://cdn.example.com/img-1.jpg",
  priceMinor: 249900,
  compareAtMinor: 312500,
  currency: "BDT",
  inStock: true,
};

function renderCard(
  ui: ReactElement,
  {
    storeSlug = "demo",
    wishlist,
  }: { storeSlug?: string | null; wishlist?: string[] } = {},
) {
  const client = new QueryClient();
  if (wishlist) {
    client.setQueryData(["customer", "wishlist"], {
      currency: "BDT",
      items: wishlist.map((variantId, i) => ({
        id: `w-${i}`,
        variantId,
        stockAlert: 5,
        title: "Saved item",
        slug: "saved-item",
        variantName: null,
        priceMinor: 100,
      })),
    });
  }
  const body =
    storeSlug === null ? (
      ui
    ) : (
      <StoreSlugContext.Provider value={storeSlug}>
        {ui}
      </StoreSlugContext.Provider>
    );
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>{body}</QueryClientProvider>,
  );
}

function renderBody(
  Body: (props: {
    storeSlug: string;
    handle: string;
    locale: Locale;
  }) => ReactElement,
  locale: Locale = "en",
) {
  const client = new QueryClient();
  client.setQueryData(["store", "product", "demo", "jamdani"], {
    merchant: { currency_code: "BDT" },
    product: {
      title: "Jamdani Handloom Saree",
      slug: "jamdani",
      image_url: "https://cdn.example.com/img-1.jpg",
      product_variants: [
        {
          id: VARIANT_A,
          name: "Small",
          price_amount_minor_int: 249900,
          stock_quantity: 4,
        },
        {
          id: VARIANT_B,
          name: "Large",
          price_amount_minor_int: 269900,
          stock_quantity: 4,
        },
      ],
    },
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Body storeSlug="demo" handle="jamdani" locale={locale} />
    </QueryClientProvider>,
  );
}

describe("ProductCard staggered crossfade", () => {
  it("renders two stacked secondary layers for a multi-image row", () => {
    const html = renderCard(
      <ProductCard
        row={{
          ...BASE_ROW,
          imageUrls: [
            "https://cdn.example.com/img-2.jpg",
            "https://cdn.example.com/img-3.jpg",
          ],
        }}
        locale="en"
      />,
    );
    expect(html).toContain("https://cdn.example.com/img-2.jpg");
    expect(html).toContain("https://cdn.example.com/img-3.jpg");
    const decorative = html.match(/<img[^>]*alt=""[^>]*>/g) ?? [];
    expect(decorative).toHaveLength(2);
    expect(html).toContain("opacity-0 group-hover:opacity-100");
    expect(html).toContain("duration-[250ms]");
    expect(html).toContain("delay-[250ms]");
    expect(html).toContain("delay-[500ms]");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("renders no crossfade layers for a single-image row", () => {
    const html = renderCard(<ProductCard row={BASE_ROW} locale="en" />);
    expect(html).not.toContain("delay-[250ms]");
    expect(html).not.toContain("img-2.jpg");
  });

  it("keeps the primary zoom on group hover", () => {
    const html = renderCard(<ProductCard row={BASE_ROW} locale="en" />);
    expect(html).toContain("group");
    expect(html).toContain("group-hover:scale-[1.04]");
  });

  it("retires the dead hoverImageUrl JS mechanism", () => {
    expect(CARD_SRC).not.toContain("hoverImageUrl");
    expect(CARD_SRC).not.toContain("setHovered");
    expect(CARD_SRC).not.toContain("onMouseEnter");
    expect(CARD_SRC).not.toContain("duration-700");
    expect(CARD_SRC).toContain("duration-[250ms]");
  });
});

describe("ProductCard quick view", () => {
  it("hides the trigger without a store context", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, handle: "jamdani" }} locale="en" />,
      { storeSlug: null },
    );
    expect(html).not.toContain('data-part="quick-view"');
  });

  it("hides the trigger when the row has no handle", () => {
    const html = renderCard(<ProductCard row={BASE_ROW} locale="en" />);
    expect(html).not.toContain('data-part="quick-view"');
  });

  it("renders a dialog trigger with the canonical English label", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, handle: "jamdani" }} locale="en" />,
    );
    expect(html).toContain('data-part="quick-view"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-label="Quick View"');
    expect(html).toContain("[@media(hover:none)]:opacity-100");
    expect(html).toContain("group-focus-within:opacity-100");
  });

  it("renders the Bengali label for bn locale", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, handle: "jamdani" }} locale="bn" />,
    );
    expect(html).toContain('aria-label="কুইক ভিউ"');
  });

  it("never owns aria-modal — the overlay host does, when opened", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, handle: "jamdani" }} locale="en" />,
    );
    expect(html).not.toContain("aria-modal");
    expect(CARD_SRC).not.toContain("aria-modal");
    expect(CARD_SRC).toContain("OverlayHost");
  });

  it("wires the dialog body to the product fetch, the cart and the stepper", () => {
    expect(CARD_SRC).toContain("getStoreProduct");
    expect(CARD_SRC).toContain("QtyStepper");
    expect(CARD_SRC).toContain("useCart(storeSlug)");
    expect(CARD_SRC).toContain("add(variant.id, qty)");
  });

  it("renders the opened dialog body with pressed size buttons, the stepper and add-to-cart", async () => {
    const mod = await import("./ProductCard");
    expect(typeof mod.QuickViewBody).toBe("function");
    const html = renderBody(mod.QuickViewBody);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Small</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Large</);
    expect(html).toContain('aria-label="Quantity"');
    expect(html).toContain('aria-label="Decrease quantity"');
    expect(html).toContain('aria-label="Increase quantity"');
    expect(html).toContain("Add to cart");
  });
});

describe("ProductCard wishlist heart", () => {
  it("hides the heart when the row has no variantId", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, handle: "jamdani" }} locale="en" />,
    );
    expect(html).not.toContain('data-part="wishlist"');
  });

  it("hides the heart without a store context", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, variantId: VARIANT_A }} locale="en" />,
      { storeSlug: null },
    );
    expect(html).not.toContain('data-part="wishlist"');
  });

  it("renders an unsaved heart with aria-pressed=false", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, variantId: VARIANT_A }} locale="en" />,
    );
    expect(html).toContain('data-part="wishlist"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Save to wishlist"');
    expect(html).not.toContain('data-part="wishlist-count"');
  });

  it("renders the saved state and count badge from the cached wishlist", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, variantId: VARIANT_A }} locale="en" />,
      { wishlist: [VARIANT_A] },
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Saved to wishlist"');
    expect(html).toMatch(/data-part="wishlist-count"[^>]*>1</);
  });

  it("marks a variant unsaved when the cache holds a different variant", () => {
    const html = renderCard(
      <ProductCard row={{ ...BASE_ROW, variantId: VARIANT_A }} locale="en" />,
      { wishlist: ["e0ba0000-0000-4000-8000-0000000004bb"] },
    );
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Save to wishlist"');
    expect(html).toMatch(/data-part="wishlist-count"[^>]*>1</);
  });

  it("renders the Bengali labels", () => {
    const unsaved = renderCard(
      <ProductCard row={{ ...BASE_ROW, variantId: VARIANT_A }} locale="bn" />,
    );
    expect(unsaved).toContain('aria-label="উইশলিস্টে সংরক্ষণ করুন"');
    const saved = renderCard(
      <ProductCard row={{ ...BASE_ROW, variantId: VARIANT_A }} locale="bn" />,
      { wishlist: [VARIANT_A] },
    );
    expect(saved).toContain('aria-label="উইশলিস্টে সংরক্ষিত"');
  });

  it("wires the server fn, cache key, optimistic update and guest redirect", () => {
    expect(WISHLIST_CARD_SRC).toContain("accountToggleWishlistFn");
    expect(WISHLIST_CARD_SRC).toContain("customerWishlistFn");
    expect(WISHLIST_CARD_SRC).toContain('["customer", "wishlist"]');
    expect(WISHLIST_CARD_SRC).toContain("setQueryData");
    expect(WISHLIST_CARD_SRC).toContain("/auth?redirect=");
    expect(WISHLIST_CARD_SRC).toContain("mode=signin");
    expect(CARD_SRC).toContain("useWishlistCard");
  });
});

describe("ProductCard merch badges", () => {
  it("puts the sale ribbon top-left and moves the rank badge to bottom-left", () => {
    const html = renderCard(
      <ProductCard row={BASE_ROW} locale="en" rank={3} />,
    );
    expect(html).toMatch(/left-3 top-3[^>]*>[^<]*−20%/);
    expect(html).toMatch(/left-3 bottom-3[^>]*>[^<]*3</);
    expect(html).not.toMatch(/left-3 top-3[^>]*>[^<]*3</);
  });

  it("keeps the rank badge top-left when there is no sale", () => {
    const html = renderCard(
      <ProductCard
        row={{ ...BASE_ROW, compareAtMinor: undefined }}
        locale="en"
        rank={3}
      />,
    );
    expect(html).toMatch(/left-3 top-3[^>]*>[^<]*3</);
  });

  it("renders the online-exclusive badge from tags, bilingually", () => {
    const en = renderCard(
      <ProductCard
        row={{ ...BASE_ROW, tags: ["online-exclusive"] }}
        locale="en"
      />,
    );
    expect(en).toContain("Online exclusive");
    const bn = renderCard(
      <ProductCard
        row={{ ...BASE_ROW, tags: ["online-exclusive"] }}
        locale="bn"
      />,
    );
    expect(bn).toContain("অনলাইন একচেটিয়া");
    const none = renderCard(<ProductCard row={BASE_ROW} locale="en" />);
    expect(none).not.toContain("Online exclusive");
  });

  it("renders the low-stock badge at the default threshold, bilingually", () => {
    const en = renderCard(
      <ProductCard row={{ ...BASE_ROW, stockCount: 5 }} locale="en" />,
    );
    expect(en).toContain("Only 5 left");
    const bn = renderCard(
      <ProductCard row={{ ...BASE_ROW, stockCount: 5 }} locale="bn" />,
    );
    expect(bn).toContain("মাত্র ৫ টি বাকি");
  });

  it("hides low stock outside the threshold (0, 6, absent, row.count only)", () => {
    for (const row of [
      { ...BASE_ROW, stockCount: 0 },
      { ...BASE_ROW, stockCount: 6 },
      BASE_ROW,
      { ...BASE_ROW, stockCount: undefined, count: 3 },
    ]) {
      const html = renderCard(<ProductCard row={row} locale="en" />);
      expect(html).not.toContain("Only");
      expect(html).not.toContain("বাকি");
    }
  });

  it("never reads row.count for the low-stock badge", () => {
    expect(CARD_SRC).toContain("row.stockCount");
    expect(CARD_SRC).not.toMatch(/row\.count\b/);
  });

  it("renders badgeLabel exactly once when a sale ribbon is present", () => {
    const html = renderCard(
      <ProductCard row={BASE_ROW} locale="en" badgeLabel="New Season" />,
    );
    expect(html.split("New Season").length - 1).toBe(1);
    expect(html).toMatch(/left-3 top-3[^>]*>[^<]*New Season −20%/);
  });
});

describe("ProductCard data plumbing", () => {
  it("WidgetRow carries the new card fields", () => {
    expect(WIDGET_SRC).toMatch(/handle\?:/);
    expect(WIDGET_SRC).toMatch(/variantId\?:/);
    expect(WIDGET_SRC).toMatch(/stockCount\?:/);
    expect(WIDGET_SRC).toMatch(/tags\?:/);
    expect(WIDGET_SRC).toMatch(/imageUrls\?:/);
  });

  it("the collection loader maps handle, stockCount, tags and variantId", () => {
    expect(SERVER_SRC).toContain("handle: p.slug");
    expect(SERVER_SRC).toContain("stockCount:");
    expect(SERVER_SRC).toContain("tags:");
    expect(SERVER_SRC).toContain("variantId:");
    expect(SERVER_SRC).toContain("variantId: undefined");
  });

  it("SectionRenderer provides the store slug context to cards", () => {
    expect(RENDERER_SRC).toContain("StoreSlugContext");
    expect(RENDERER_SRC).toContain(".Provider");
  });
});

describe("ProductCard preserved contracts", () => {
  it("a null image renders the deterministic placeholder img, never a void", () => {
    const html = renderCard(
      <ProductCard
        row={{
          id: ROW_ID,
          title: "GlowLab Vitamin C Serum 20% 30ml",
          imageUrl: null,
        }}
        locale="en"
      />,
    );
    expect(html).toContain("GlowLab Vitamin C Serum");
    expect(html).toContain(`<img`);
    expect(html).toContain(`/api/public/ph/${placeholderSeed(ROW_ID)}`);
    expect(html).not.toContain("bg-muted");
  });

  it("keeps the data-part hooks skins.css depends on", () => {
    const html = renderCard(
      <ProductCard
        row={BASE_ROW}
        locale="en"
        promise="Free delivery across Bangladesh"
      />,
    );
    expect(html).toContain('data-part="title"');
    expect(html).toContain("Jamdani Handloom Saree");
    expect(html).toContain('data-part="price"');
    expect(html).toContain('data-part="promise"');
    expect(html).toContain("Free delivery across Bangladesh");
  });

  it("gives both overlay buttons a 44px hit target", () => {
    const html = renderCard(
      <ProductCard
        row={{ ...BASE_ROW, handle: "jamdani", variantId: VARIANT_A }}
        locale="en"
      />,
    );
    const targets = html.match(/h-11 w-11/g) ?? [];
    expect(targets).toHaveLength(2);
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("keeps the savePercent helper intact", () => {
    expect(savePercent(200, 250)).toBe(20);
    expect(savePercent(250, 200)).toBeNull();
    expect(savePercent(undefined, 100)).toBeNull();
  });

  it("gates the title color transition behind motion-reduce", () => {
    expect(CARD_SRC).toContain(
      "transition-colors duration-300 motion-reduce:transition-none",
    );
  });
});
