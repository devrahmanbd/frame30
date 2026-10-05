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
import {
  CanonicalDropdownMenu,
  CanonicalMobileDrawer,
  HeaderAnnouncementBar,
  HeaderDesktopNav,
  ThemeHeaderRenderer,
  assembleHeaderData,
  useHeaderBehavior,
} from "./StoreHeader";
import type { StoreMenuSwap } from "./StoreHeader";
import { themeChromeFor } from "./theme-chrome";
import { songoskritiMenuLabel } from "@/lib/themes/songoskriti/header-fallback";
import type {
  CanonicalMenuItem,
  MenuNode,
  StoreMenus,
} from "@/lib/menus/menu";
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

describe("StoreHeader theme-token chrome (T1.1 — no raw hex)", () => {
  it("sources chrome colors from var(--theme-*) tokens only", () => {
    const src = HEADER_SRC();
    expect(src).toContain("var(--theme-ink)");
    expect(src).toContain("var(--theme-surface)");
    expect(src).toContain("var(--theme-border)");
    expect(src).toContain("var(--theme-muted)");
    // No raw-hex color literals remain in header class strings.
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,}/);
  });

  it("preserves opacity modifiers on token colors", () => {
    const src = HEADER_SRC();
    expect(src).toContain("text-[var(--theme-ink)]/70");
    expect(src).toContain("text-[var(--theme-ink)]/60");
    expect(src).toContain("text-[var(--theme-ink)]/80");
  });

  it("renders token classes in static markup (luxury chrome)", () => {
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).toContain("bg-[var(--theme-surface)]");
    expect(html).toContain("text-[var(--theme-ink)]");
    expect(html).not.toMatch(/#1a1a1a|#FAF9F7|#eaeaea|#f0f0f0/);
  });
});

describe("StoreHeader T3.1 layer boundaries (HeaderData + Behavior + Renderer)", () => {
  const enT = (en: string) => en;
  const bnT = (en: string, bn?: string) => bn ?? en;

  it("HeaderData: dashboard header rows win over the theme fallback", () => {
    const menus = {
      header: [dbNode({ id: "db-1", label: "Dashboard Custom", url: "/c/custom" })],
      mobile: [],
    };
    const data = assembleHeaderData({
      slug: "songoskriti",
      menus,
      themeKey: "songoskriti",
      pathname: "/store/songoskriti",
      t: enT,
    });
    expect(data.headerMenu.map((n) => n.label)).toEqual(["Dashboard Custom"]);
    expect(data.headerFallback).toBe(false);
    expect(data.isLuxury).toBe(true);
  });

  it("HeaderData: theme fallback covers luxury stores with no dashboard menu", () => {
    const data = assembleHeaderData({
      slug: "songoskriti",
      menus: { header: [], mobile: [] },
      themeKey: "songoskriti",
      pathname: "/store/songoskriti",
      t: enT,
    });
    expect(data.headerMenu.length).toBeGreaterThan(0);
    expect(data.headerFallback).toBe(true);
    expect(data.mobileFallback).toBe(true);
  });

  it("HeaderData: generic stores assemble empty menus and never localize", () => {
    const data = assembleHeaderData({
      slug: "demo",
      menus: { header: [], mobile: [] },
      themeKey: null,
      pathname: "/store/demo",
      t: bnT,
    });
    expect(data.headerMenu).toEqual([]);
    expect(data.mobileMenu).toEqual([]);
    expect(data.isLuxury).toBe(false);
    expect(data.headerFallback).toBe(false);
    expect(data.fallbackLabel("Men")).toBe("Men");
  });

  it("HeaderData: routing base follows the custom-host path, chrome follows the key", () => {
    const storeBase = assembleHeaderData({
      slug: "demo",
      menus: null,
      themeKey: null,
      pathname: "/store/demo",
      t: enT,
    });
    expect(storeBase.custom).toBe(false);
    expect(storeBase.base).toBe("/store/demo");
    const customBase = assembleHeaderData({
      slug: "demo",
      menus: null,
      themeKey: null,
      pathname: "/",
      t: enT,
    });
    expect(customBase.custom).toBe(true);
    expect(customBase.base).toBe("");
    // Key-driven chrome: a theme-named slug with a foreign key stays generic.
    const foreign = assembleHeaderData({
      slug: "songoskriti",
      menus: { header: [], mobile: [] },
      themeKey: "bazaar",
      pathname: "/store/songoskriti",
      t: enT,
    });
    expect(foreign.headerChrome).toBeNull();
    expect(foreign.headerMenu).toEqual([]);
    // Same slug with the theme key gets the fallback tree.
    const keyed = assembleHeaderData({
      slug: "renamed-slug",
      menus: { header: [], mobile: [] },
      themeKey: "songoskriti",
      pathname: "/store/renamed-slug",
      t: enT,
    });
    expect(keyed.headerChrome).not.toBeNull();
    expect(keyed.headerMenu.length).toBeGreaterThan(0);
  });

  it("HeaderBehavior: hook owns scroll, drawer, and accordion state", () => {
    expect(typeof useHeaderBehavior).toBe("function");
    const src = HEADER_SRC();
    expect(src).toContain("useHeaderBehavior");
    expect(src).toContain("mobileOpen");
    expect(src).toContain("setMobileOpen");
    expect(src).toContain("expandedMobileMenu");
    expect(src).toContain("window.scrollY > 40");
    expect(src).toContain("document.body.style.overflow");
  });

  it("split design: three layers with one parameterized renderer, no slug checks", () => {
    const src = HEADER_SRC();
    expect(src).toContain("assembleHeaderData");
    expect(src).toContain("useHeaderBehavior");
    expect(src).toContain("ThemeHeaderRenderer");
    expect(src).toContain("HeaderDesktopNav");
    expect(src).toContain("HeaderUtilityIcons");
    expect(src).toContain("HeaderMobileDrawer");
    expect(src).toContain("HeaderAnnouncementBar");
    // No theme slug or name sniffing anywhere in the header.
    expect(src).not.toMatch(/slug\s*===?\s*["']/);
    expect(src).not.toMatch(/name\s*===?\s*["']/);
    expect(src).not.toContain('"songoskriti"');
    expect(src).not.toContain("'songoskriti'");
    // Single top-level renderer: one ThemeHeaderRenderer definition and no
    // per-theme header duplication (minimal checkout + shared header only).
    expect(src.match(/export function ThemeHeaderRenderer/g)?.length).toBe(1);
    expect(src.match(/<header/g)?.length).toBe(2);
  });

  it("ThemeHeaderRenderer: luxury mega geometry vs generic dropdown geometry", () => {
    const chrome = themeChromeFor("songoskriti")!;
    const luxuryParent = chrome.fallbackMenu.find(
      (n) => n.children && n.children.length > 0,
    )!;
    expect(luxuryParent).toBeDefined();
    const luxuryHtml = renderToStaticMarkup(
      <HeaderDesktopNav
        headerMenu={[luxuryParent]}
        base="/store/songoskriti"
        headerFallback
        fallbackLabel={(label) => chrome.labelFor(label, (en) => en)}
        isLuxury
        t={(en) => en}
      />,
    );
    expect(luxuryHtml).toContain("fixed left-0 w-full top-full");
    expect(luxuryHtml).toContain("grid-cols-4");
    const genericParent = dbNode({ id: "g-1", label: "Shop", url: "/c/shop" });
    (genericParent as unknown as { children: MenuNode[] }).children = [
      dbNode({ id: "g-2", label: "Sub", url: "/c/sub" }),
    ];
    const genericHtml = renderToStaticMarkup(
      <HeaderDesktopNav
        headerMenu={[genericParent]}
        base="/store/demo"
        headerFallback={false}
        fallbackLabel={(label) => label}
        isLuxury={false}
        t={(en) => en}
      />,
    );
    expect(genericHtml).toContain("absolute left-1/2 -translate-x-1/2");
    expect(genericHtml).not.toContain("fixed left-0 w-full top-full");
  });

  it("ThemeHeaderRenderer: announcement bar renders only for luxury chrome", () => {
    const chrome = themeChromeFor("songoskriti")!;
    const luxuryHtml = renderToStaticMarkup(
      <HeaderAnnouncementBar
        headerChrome={chrome}
        scrolled={false}
        t={(en) => en}
      />,
    );
    expect(luxuryHtml).toContain(chrome.announcement.left);
    expect(luxuryHtml).toContain(chrome.announcement.center);
    const genericHtml = renderToStaticMarkup(
      <HeaderAnnouncementBar headerChrome={null} scrolled={false} t={enT} />,
    );
    expect(genericHtml).toBe("");
    expect(ThemeHeaderRenderer).toBeDefined();
  });
});

describe("T4.1 canonical presentation modes", () => {
  const canonicalItems: CanonicalMenuItem[] = [
    {
      id: "shop",
      label: "Shop",
      label_bn: "কেনাকাটা",
      href: "/c/shop",
      badge: "New",
      children: [
        {
          id: "sarees",
          label: "Sarees",
          label_bn: "শাড়ি",
          href: "/c/sarees",
          children: [
            {
              id: "jamdani",
              label: "Jamdani",
              label_bn: "জামদানি",
              href: "/c/jamdani",
            },
          ],
        },
      ],
      promo: {
        image: "/ph/promo.jpg",
        href: "/c/festive",
        title: "Festive",
        title_bn: "উৎসব",
      },
    },
    { id: "about", label: "About", href: "/pages/about" },
  ];

  it("dropdown renders nested children with rebased hrefs", () => {
    const html = renderToStaticMarkup(
      <CanonicalDropdownMenu items={canonicalItems} base="/store/demo" />,
    );
    expect(html).toContain(">Shop<");
    expect(html).toContain(">Sarees<");
    expect(html).toContain(">Jamdani<");
    expect(html).toContain('href="/store/demo/c/shop"');
    expect(html).toContain('href="/store/demo/c/sarees"');
    expect(html).toContain('href="/store/demo/c/jamdani"');
    expect(html).toContain('href="/store/demo/pages/about"');
  });

  it("dropdown renders বাংলা labels, badge and the promo ref", () => {
    const html = renderToStaticMarkup(
      <CanonicalDropdownMenu
        items={canonicalItems}
        base="/store/demo"
        locale="bn"
      />,
    );
    expect(html).toContain("কেনাকাটা");
    expect(html).toContain("শাড়ি");
    expect(html).toContain("জামদানি");
    expect(html).toContain("New");
    expect(html).toContain('src="/ph/promo.jpg"');
    expect(html).toContain("উৎসব");
    expect(html).toContain('href="/store/demo/c/festive"');
  });

  it("dropdown renders nothing for an empty menu", () => {
    expect(renderToStaticMarkup(<CanonicalDropdownMenu items={[]} />)).toBe(
      "",
    );
  });

  it("drawer hides nested children and the promo until expanded", () => {
    const html = renderToStaticMarkup(
      <CanonicalMobileDrawer items={canonicalItems} base="/store/demo" />,
    );
    expect(html).toContain(">Shop<");
    expect(html).toContain(">About<");
    expect(html).not.toContain(">Jamdani<");
    expect(html).not.toContain("/ph/promo.jpg");
    expect(html).toContain('aria-expanded="false"');
  });

  it("drawer shows nested children, badge and promo for the open panel", () => {
    const html = renderToStaticMarkup(
      <CanonicalMobileDrawer
        items={canonicalItems}
        base="/store/demo"
        defaultExpandedId="shop"
      />,
    );
    expect(html).toContain(">Sarees<");
    expect(html).toContain(">Jamdani<");
    expect(html).toContain('href="/store/demo/c/jamdani"');
    expect(html).toContain("New");
    expect(html).toContain('src="/ph/promo.jpg"');
    expect(html).toContain(">Festive<");
    expect(html).toContain('aria-expanded="true"');
  });

  it("drawer renders বাংলা labels and promo titles", () => {
    const html = renderToStaticMarkup(
      <CanonicalMobileDrawer
        items={canonicalItems}
        base="/store/demo"
        locale="bn"
        defaultExpandedId="shop"
      />,
    );
    expect(html).toContain("কেনাকাটা");
    expect(html).toContain("শাড়ি");
    expect(html).toContain("জামদানি");
    expect(html).toContain("উৎসব");
  });

  it("drawer renders nothing for an empty menu", () => {
    expect(renderToStaticMarkup(<CanonicalMobileDrawer items={[]} />)).toBe(
      "",
    );
  });
});
