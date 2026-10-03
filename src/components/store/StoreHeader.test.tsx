/**
 * Phase 1b — StoreHeader wishlist count contract.
 *
 * Replaces the dead wishlist <button> with a real <Link> to the account
 * wishlist tab + live count badge from the shared ["customer","wishlist"]
 * cache. Mirrors the cart badge precedent.
 *
 * Vitest env node — NO jsdom/testing-library/renderHook. Static markup
 * via renderToStaticMarkup + source asserts.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Router mock: hoisted pathname drives custom vs store variant; Link renders
// a plain <a> capturing to/params/search for assertions.
const mockPathname = vi.hoisted(() => ({ current: "/store/demo" }));

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: mockPathname.current } }),
    Link: ({
      to,
      params,
      search,
      children,
      ...rest
    }: {
      to: string;
      params?: unknown;
      search?: unknown;
      children?: React.ReactNode;
    }) => (
      <a
        data-link-to={to}
        data-link-params={JSON.stringify(params ?? null)}
        data-link-search={JSON.stringify(search ?? null)}
        {...rest}
      >
        {children}
      </a>
    ),
  };
});

import { MinimalCheckoutHeader, StoreHeader } from "./StoreHeader";
import type { StoreMenuSwap } from "./StoreHeader";
import { themeChromeFor } from "./theme-chrome";
import { songoskritiMenuLabel } from "@/lib/themes/songoskriti/header-fallback";
import type { MenuNode, StoreMenus } from "@/lib/menus/menu";
import { LanguageProvider } from "@/lib/i18n";

const HEADER_SRC = () =>
  readFileSync("src/components/store/StoreHeader.tsx", "utf8");

function dbNode(
  over: Partial<MenuNode> & Pick<MenuNode, "id" | "label" | "url">,
): MenuNode {
  return {
    parentId: null,
    position: 0,
    kind: "custom",
    refId: null,
    titleAttr: "",
    newTab: false,
    cssClass: "",
    depth: 0,
    children: [],
    ...over,
  };
}

function renderHeader({
  slug = "demo",
  name = "Demo",
  themeKey,
  wishlistItems,
  pathname = "/store/demo",
  menus,
  initialLang = "en",
  menuSwap,
}: {
  slug?: string;
  name?: string;
  themeKey?: string | null;
  wishlistItems?: Array<{ variantId: string }>;
  pathname?: string;
  menus?: Pick<StoreMenus, "header" | "mobile">;
  initialLang?: "en" | "bn";
  menuSwap?: StoreMenuSwap;
} = {}) {
  mockPathname.current = pathname;
  const client = new QueryClient();
  if (wishlistItems) {
    client.setQueryData(["customer", "wishlist"], {
      currency: "BDT",
      items: wishlistItems.map((item, i) => ({
        id: `w-${i}`,
        variantId: item.variantId,
      })),
    });
  }
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <LanguageProvider initialLang={initialLang}>
        <StoreHeader
          slug={slug}
          name={name}
          menus={menus}
          themeKey={themeKey}
          menuSwap={menuSwap}
        />
      </LanguageProvider>
    </QueryClientProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("StoreHeader wishlist link", () => {
  it("guest (no seed) links to the store account wishlist tab with zero count and no badge", () => {
    const html = renderHeader();
    expect(html).toContain('data-link-to="/store/$slug/account"');
    expect(html).toContain(
      'data-link-search="{&quot;tab&quot;:&quot;wishlist&quot;}"',
    );
    expect(html).toContain('aria-label="Wishlist, 0"');
    expect(html).not.toContain("fq-badge-pop");
  });

  it("seeded 2 items shows the count badge with pop animation and count in the label", () => {
    const html = renderHeader({
      wishlistItems: [{ variantId: "v1" }, { variantId: "v2" }],
    });
    expect(html).toContain('aria-label="Wishlist, 2"');
    expect(html).toContain("fq-badge-pop");
    expect(html).toContain("motion-safe");
    // Badge renders the live count.
    expect(html).toMatch(/>2</);
  });

  it("custom host links to /account wishlist tab", () => {
    const html = renderHeader({ pathname: "/" });
    expect(html).toContain('data-link-to="/account"');
    expect(html).toContain(
      'data-link-search="{&quot;tab&quot;:&quot;wishlist&quot;}"',
    );
  });

  it("sources the live count from the shared wishlist cache (no dead button)", () => {
    const src = HEADER_SRC();
    expect(src).toContain("useWishlistHeader");
    expect(src).not.toMatch(/<button[^>]*Wishlist/);
    expect(src).toContain("key={wishlistCount}");
    expect(src).toContain("motion-safe:animate-[fq-badge-pop");
    expect(src).toContain('to="/account"');
    expect(src).toContain('to="/store/$slug/account"');
    expect(src).toContain('search={{ tab: "wishlist" }}');
    expect(src).toContain('t("Wishlist", "উইশলিস্ট")');
  });

  it("wishlist-card exposes a header hook gated on sign-in; styles define the pop keyframes", () => {
    const cardSrc = readFileSync("src/lib/wishlist-card.ts", "utf8");
    expect(cardSrc).toContain("useWishlistHeader");
    expect(cardSrc).toMatch(/enabled:\s*signedIn\s*===\s*true/);
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain("@keyframes fq-badge-pop");
  });
});

describe("StoreHeader songoskriti data-driven menus (REPORT-THEMES §4/§7.1)", () => {
  it("falls back to the hardcoded tree for songoskriti-shaped stores with no dashboard menu", () => {
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).toContain("Women");
    expect(html).toContain("/store/songoskriti/c/women");
    expect(html).toContain("New Arrivals");
  });

  it("dashboard header menus win over the fallback on songoskriti stores", () => {
    const menus = {
      header: [
        dbNode({ id: "db-1", label: "Dashboard Custom", url: "/c/custom" }),
      ],
      mobile: [],
    };
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
      menus,
    });
    expect(html).toContain("Dashboard Custom");
    expect(html).toContain("/store/songoskriti/c/custom");
    // Fallback top-level entries are gone once a location is claimed.
    expect(html).not.toContain("/store/songoskriti/c/women");
    expect(html).not.toContain("Jewellery");
  });

  it("generic stores render nothing when no menu claims the location", () => {
    const html = renderHeader({ slug: "demo", name: "Demo" });
    expect(html).not.toContain("/c/women");
    expect(html).not.toContain("Women");
  });

  it("generic stores render dashboard menus as-authored, even in বাংলা", () => {
    const menus = {
      header: [dbNode({ id: "db-men", label: "Men", url: "/c/men" })],
      mobile: [],
    };
    const html = renderHeader({
      slug: "demo",
      name: "Demo",
      menus,
      initialLang: "bn",
    });
    // The বাংলা fallback table must never leak into generic stores.
    expect(html).toContain(">Men<");
    expect(html).not.toContain("পুরুষ");
  });

  it("dashboard nodes on songoskriti stores render as-authored in বাংলা", () => {
    const menus = {
      header: [dbNode({ id: "db-men", label: "Men", url: "/c/men" })],
      mobile: [],
    };
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
      menus,
      initialLang: "bn",
    });
    expect(html).toContain(">Men<");
    expect(html).not.toContain("পুরুষ");
  });

  it("fallback tree localizes in বাংলা (bn/en everywhere)", () => {
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
      initialLang: "bn",
    });
    expect(html).toContain("মহিলা");
    expect(html).toContain("পুরুষ");
  });

  it("songoskritiMenuLabel resolves twins and falls back to English", () => {
    expect(songoskritiMenuLabel("Women", (en) => en)).toBe("Women");
    expect(songoskritiMenuLabel("Women", (en, bn) => (bn ? bn : en))).toBe(
      "মহিলা",
    );
    // Missing keys fall back to English, never blank.
    expect(
      songoskritiMenuLabel("Unmapped Label", (en, bn) => (bn ? bn : en)),
    ).toBe("Unmapped Label");
  });

  it("keeps the luxury chrome: announcement bar, image panel, mobile accordion, 44px targets", () => {
    // Brand copy lives in the theme-owned header-fallback module; the
    // shared header resolves it through key-driven config.
    const fallbackSrc = readFileSync(
      "src/lib/themes/songoskriti/header-fallback.ts",
      "utf8",
    );
    expect(fallbackSrc).toContain("EASY 7-DAY EXCHANGE");
    const src = HEADER_SRC();
    expect(src).toContain("expandedMobileMenu");
    expect(src).toContain("min-h-[44px]");
    expect(src).toContain("motion-safe:");
    expect(src).toContain("motion-reduce:transition-none");
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).toContain("EASY 7-DAY EXCHANGE");
    // Header fallback renders the mega panel affordance for entries with children.
    expect(html).toContain("Shop Women");
    const bnHtml = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
      initialLang: "bn",
    });
    expect(bnHtml).toContain("কেনাকাটা");
  });
});

function renderMinimal({
  slug = "demo",
  name = "Demo",
  themeKey,
  pathname = "/store/demo",
  initialLang = "en",
}: {
  slug?: string;
  name?: string;
  themeKey?: string | null;
  pathname?: string;
  initialLang?: "en" | "bn";
} = {}) {
  mockPathname.current = pathname;
  const client = new QueryClient();
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <LanguageProvider initialLang={initialLang}>
        <MinimalCheckoutHeader slug={slug} name={name} themeKey={themeKey} />
      </LanguageProvider>
    </QueryClientProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("StoreHeader songoskriti chrome resolves through themeChromeFor", () => {
  it("themeChromeFor returns the theme-owned logo + announcement for the songoskriti key", () => {
    const chrome = themeChromeFor("songoskriti");
    expect(chrome).not.toBeNull();
    expect(chrome!.logo).toEqual({
      src: "/ph/songoskriti/logo-lockup.svg",
      alt: "Songoskriti",
    });
    expect(chrome!.announcement).toEqual({
      left: "EASY 7-DAY EXCHANGE",
      center: "Free delivery across Bangladesh on orders over BDT 5000",
      center_bn: "৫০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
    });
    expect(chrome!.fallbackMenu.length).toBeGreaterThan(0);
  });

  it("renders the announcement copy + logo lockup from themeChromeFor (not hardcoded)", () => {
    const chrome = themeChromeFor("songoskriti")!;
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    // Values flow through the key-driven lookup: assert the resolved
    // values, so a theme copy change fails here instead of silently
    // passing against stale literals.
    expect(html).toContain(chrome.logo.src);
    expect(html).toContain(`alt="${chrome.logo.alt}"`);
    expect(html).toContain(chrome.announcement.left);
    expect(html).toContain(chrome.announcement.center);
    const bnHtml = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
      initialLang: "bn",
    });
    expect(bnHtml).toContain(chrome.logo.src);
    expect(bnHtml).toContain(chrome.announcement.center_bn);
  });

  it("generic slugs get null chrome and render the text wordmark", () => {
    expect(themeChromeFor("demo")).toBeNull();
    const html = renderHeader({ slug: "demo", name: "Demo" });
    expect(html).toContain("Demo");
    expect(html).not.toContain("logo-lockup");
    expect(html).not.toContain("EASY 7-DAY EXCHANGE");
  });
});

describe("themeChromeFor identity edge — key-driven, never slug or name", () => {
  it("key match wins regardless of slug or display name", () => {
    expect(themeChromeFor("songoskriti")).not.toBeNull();
    const html = renderHeader({
      slug: "renamed-slug",
      name: "Anything Else",
      themeKey: "songoskriti",
    });
    expect(html).toContain("/ph/songoskriti/logo-lockup.svg");
  });

  it("a theme-named slug with a foreign key stays generic", () => {
    // The old slug-sniff dressed any "songoskriti"-slugged store in theme
    // chrome even with a foreign theme installed. Key-driven resolution
    // ends that: brand follows the installed theme key, not the slug.
    expect(themeChromeFor("bazaar")).toBeNull();
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "bazaar",
    });
    expect(html).not.toContain("logo-lockup");
    expect(html).toContain("Songoskriti");
  });

  it("lookalike keys and missing keys stay generic", () => {
    expect(themeChromeFor("songoskriti-2")).toBeNull();
    expect(themeChromeFor("Songoskriti")).toBeNull();
    expect(themeChromeFor("demo")).toBeNull();
    expect(themeChromeFor(null)).toBeNull();
    expect(themeChromeFor(undefined)).toBeNull();
  });

  it("MinimalCheckoutHeader renders the lockup only for the theme key", () => {
    const themed = renderMinimal({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(themed).toContain("/ph/songoskriti/logo-lockup.svg");
    expect(themed).toContain("Return to cart");
    const lookalike = renderMinimal({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "demo",
    });
    expect(lookalike).not.toContain("logo-lockup");
    expect(lookalike).toContain("Songoskriti");
  });
});

describe("StoreHeader menu swap — TRACK M review gate (fail-open, logged)", () => {
  const base = {
    slug: "songoskriti",
    name: "Songoskriti",
    themeKey: "songoskriti" as const,
  };
  const approvedClaim = {
    pluginId: "nav-pro",
    slot: "menu_bar" as const,
    entry: "framique.mount(document.createTextNode('nav'))",
    reviewApproved: true,
  };
  const pluginRows = [dbNode({ id: "plug-1", label: "Plugin Nav", url: "/c/plug" })];

  it("an unapproved swap renders byte-identical markup to no swap", () => {
    const plain = renderHeader(base);
    const gated = renderHeader({
      ...base,
      menuSwap: {
        claims: [{ ...approvedClaim, reviewApproved: false }],
        grantedScopes: ["render_storefront", "replace_menus"],
        pluginRows,
      },
    });
    expect(gated).toBe(plain);
    expect(gated).toContain("Women");
    expect(gated).not.toContain("Plugin Nav");
  });

  it("an approved swap without the replace_menus scope keeps the theme default", () => {
    const plain = renderHeader(base);
    const gated = renderHeader({
      ...base,
      menuSwap: {
        claims: [approvedClaim],
        grantedScopes: ["render_storefront"],
        pluginRows,
      },
    });
    expect(gated).toBe(plain);
    expect(gated).not.toContain("Plugin Nav");
  });

  it("an approved + scoped swap substitutes rows through engine markup", () => {
    const html = renderHeader({
      ...base,
      menuSwap: {
        claims: [approvedClaim],
        grantedScopes: ["render_storefront", "replace_menus"],
        pluginRows,
      },
    });
    expect(html).toContain("Plugin Nav");
    expect(html).toContain("/store/songoskriti/c/plug");
    // The theme fallback tree is gone once the swap wins the slot.
    expect(html).not.toContain("/store/songoskriti/c/women");
  });

  it("a throwing plugin renderer falls back to the theme default and reports", () => {
    const onError = vi.fn();
    const html = renderHeader({
      ...base,
      menuSwap: {
        claims: [approvedClaim],
        grantedScopes: ["render_storefront", "replace_menus"],
        renderRows: () => {
          throw new Error("renderer down");
        },
        onError,
      },
    });
    // Fail-open: shoppers still get navigation, never a crash.
    expect(html).toContain("Women");
    expect(html).toContain("/store/songoskriti/c/women");
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]![0] as Error).message).toBe(
      "renderer down",
    );
  });

  it("dashboard rows still win over an unapproved swap on generic stores", () => {
    const menus = {
      header: [dbNode({ id: "db-1", label: "Dashboard Custom", url: "/c/custom" })],
      mobile: [],
    };
    const plain = renderHeader({ slug: "demo", name: "Demo", menus });
    const gated = renderHeader({
      slug: "demo",
      name: "Demo",
      menus,
      menuSwap: {
        claims: [{ ...approvedClaim, reviewApproved: false }],
        grantedScopes: ["render_storefront", "replace_menus"],
        pluginRows,
      },
    });
    expect(gated).toBe(plain);
    expect(gated).toContain("Dashboard Custom");
  });
});
