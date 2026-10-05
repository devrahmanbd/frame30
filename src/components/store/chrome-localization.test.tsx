/**
 * T3.4 — localization structural tests (test-only lane).
 *
 * StoreHeader.test.tsx covers bn strings + 44px targets but nothing
 * structural. This suite pins the localization contracts for English +
 * Bengali long-label rendering across header / menu / footer / widgets
 * without overlap, clipping, hidden labels, broken menus, or page
 * overflow — via STRUCTURAL assertions only.
 *
 * jsdom has NO layout engine (getBoundingClientRect returns zeros), so this
 * file never asserts geometry. It uses renderToStaticMarkup (vitest env
 * node, same as StoreHeader.test.tsx) + source asserts:
 *   - long en/bn labels render verbatim (never blank, never dropped)
 *   - nav containers carry no fixed widths (flex-1 + min-w-0, flex-wrap)
 *   - overflow guards present (overflow-hidden / overflow-y-auto + max-h caps)
 *   - compact-state switching exists (scroll-driven heights + drawer offset)
 *   - min touch targets + mobile reachability (min-h-[44px], drawer fallback)
 *   - bn strings render in header, footer, and widget chrome
 *   - footer grid + slice caps keep long menus from breaking the page
 *   - widget bubbles wrap (max-w-[85%] + whitespace-pre-line), feed scrolls,
 *     composer cannot force overflow (min-w-0 flex-1)
 *   - page containers are max-w-bounded with gutters, never fixed px widths
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

// Router mock: hoisted pathname drives custom vs store variant; Link renders
// a plain <a> capturing to/params/search for assertions. Mirrors
// StoreHeader.test.tsx so header + footer renders stay deterministic.
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

import { StoreHeader } from "./StoreHeader";
import { StoreFooterMenus } from "./StoreFooterMenus";
import { SupportWidget, getInitialGreeting } from "./SupportWidget";
import { LanguageToggle } from "@/components/LanguageToggle";
import { LanguageProvider } from "@/lib/i18n";
import type { MenuNode, StoreMenus } from "@/lib/menus/menu";

const HEADER_SRC = () =>
  readFileSync("src/components/store/StoreHeader.tsx", "utf8");
const FOOTER_SRC = () =>
  readFileSync("src/components/store/StoreFooterMenus.tsx", "utf8");
const WIDGET_SRC = () =>
  readFileSync("src/components/store/SupportWidget.tsx", "utf8");
const CHROME_SRC = () =>
  readFileSync("src/components/store/ThemeChrome.tsx", "utf8");
const PAGE_SRC = () =>
  readFileSync("src/components/store/StorefrontPage.tsx", "utf8");
const TOGGLE_SRC = () =>
  readFileSync("src/components/LanguageToggle.tsx", "utf8");

// Long labels that must survive rendering in both locales: a fixed-width or
// nowrap nav container would clip/overlap these, so verbatim presence is the
// structural proxy for "no clipping" under a layout-less renderer.
const LONG_EN =
  "Extraordinarily Long Navigation Label That Must Never Clip Or Overlap";
const LONG_BN =
  "অত্যন্ত দীর্ঘ বাংলা নেভিগেশন লেবেল যা কখনোই কাটা বা ঢাকা পড়া উচিত নয়";

function dbNode(
  over: Partial<MenuNode> & Pick<MenuNode, "id" | "label" | "url">,
  children: MenuNode[] = [],
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
    children,
    ...over,
  };
}

function renderHeader({
  slug = "demo",
  name = "Demo",
  themeKey,
  pathname = "/store/demo",
  menus,
  initialLang = "en",
}: {
  slug?: string;
  name?: string;
  themeKey?: string | null;
  pathname?: string;
  menus?: Pick<StoreMenus, "header" | "mobile">;
  initialLang?: "en" | "bn";
} = {}) {
  mockPathname.current = pathname;
  const client = new QueryClient();
  const ui: ReactElement = (
    <QueryClientProvider client={client}>
      <LanguageProvider initialLang={initialLang}>
        <StoreHeader slug={slug} name={name} menus={menus} themeKey={themeKey} />
      </LanguageProvider>
    </QueryClientProvider>
  );
  return renderToStaticMarkup(ui);
}

function renderFooter({
  slug = "demo",
  nodes,
  pathname = "/store/demo",
  initialLang = "en",
}: {
  slug?: string;
  nodes: MenuNode[];
  pathname?: string;
  initialLang?: "en" | "bn";
}) {
  mockPathname.current = pathname;
  const ui: ReactElement = (
    <LanguageProvider initialLang={initialLang}>
      <StoreFooterMenus slug={slug} nodes={nodes} />
    </LanguageProvider>
  );
  return renderToStaticMarkup(ui);
}

function renderWidget({
  slug = "demo",
  initialLang = "en",
}: {
  slug?: string;
  initialLang?: "en" | "bn";
} = {}) {
  const ui: ReactElement = (
    <LanguageProvider initialLang={initialLang}>
      <SupportWidget slug={slug} />
    </LanguageProvider>
  );
  return renderToStaticMarkup(ui);
}

function renderToggle({ initialLang = "en" }: { initialLang?: "en" | "bn" } = {}) {
  const ui: ReactElement = (
    <LanguageProvider initialLang={initialLang}>
      <LanguageToggle />
    </LanguageProvider>
  );
  return renderToStaticMarkup(ui);
}

const BN_RE = /[\u0980-\u09FF]/;

describe("chrome-localization: header long-label rendering (en + bn)", () => {
  const longMenus = (label: string) => ({
    header: [dbNode({ id: "long-1", label, url: "/c/long-label" })],
    mobile: [],
  });

  it("renders an extra-long English dashboard label verbatim with a rebased href", () => {
    const html = renderHeader({ menus: longMenus(LONG_EN) });
    expect(html).toContain(LONG_EN);
    expect(html).toContain("/store/demo/c/long-label");
  });

  it("renders an extra-long Bengali dashboard label verbatim (as-authored, never blank)", () => {
    const html = renderHeader({
      menus: longMenus(LONG_BN),
      initialLang: "bn",
    });
    expect(html).toContain(LONG_BN);
    expect(html).toContain("/store/demo/c/long-label");
  });

  it("anchors carry their long labels as content (labels never hidden from their links)", () => {
    const en = renderHeader({ menus: longMenus(LONG_EN) });
    const bn = renderHeader({ menus: longMenus(LONG_BN), initialLang: "bn" });
    // Label text sits inside its own anchor: no empty menu link, no
    // label rendered outside (or without) its hit target.
    expect(en).toContain(`>${LONG_EN}</a>`);
    expect(bn).toContain(`>${LONG_BN}</a>`);
  });

  it("localizes the desktop nav landmark in both locales", () => {
    const en = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(en).toContain('aria-label="Store menu"');
    const bn = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
      initialLang: "bn",
    });
    expect(bn).toContain('aria-label="স্টোর মেনু"');
  });

  it("renders the fallback tree + announcement Bengali strings (no clipping of bn copy)", () => {
    const bn = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
      initialLang: "bn",
    });
    expect(bn).toContain("মহিলা");
    expect(bn).toContain("পুরুষ");
    expect(bn).toContain("কেনাকাটা");
    expect(bn).toContain("৫০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি");
    expect(BN_RE.test(bn)).toBe(true);
  });
});

describe("chrome-localization: header structural guards (no fixed widths, wrap, overflow)", () => {
  it("desktop nav container is fluid (flex-1 + min-w-0) with a wrapping nav list", () => {
    const src = HEADER_SRC();
    const centerLine = src.split("\n").find((l) => l.includes("hidden md:flex"));
    expect(centerLine).toBeDefined();
    expect(centerLine!).toContain("flex-1");
    expect(centerLine!).toContain("min-w-0");
    expect(centerLine!).not.toMatch(/w-\[\d+px\]/);
    const navUlLine = src
      .split("\n")
      .find((l) => l.includes("flex-wrap gap-x-4"));
    expect(navUlLine).toBeDefined();
    expect(navUlLine!).toContain("flex-wrap");
    expect(navUlLine!).not.toMatch(/w-\[\d+px\]/);
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).toContain("flex-wrap");
    expect(html).toContain("min-w-0");
  });

  it("chrome containers are max-w-bounded with gutters (page cannot overflow sideways)", () => {
    const src = HEADER_SRC();
    expect(src).toContain("max-w-[1440px]");
    expect(src).toContain("px-4 sm:px-6 lg:px-10");
    expect(src).toContain("max-w-[var(--fq-container,1280px)]");
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).toContain("max-w-[1440px]");
  });

  it("overflow guards exist on announcement, mega panel, and mobile drawer", () => {
    const src = HEADER_SRC();
    // Announcement collapses via overflow-hidden, never overlapping content.
    expect(src).toContain("w-full overflow-hidden");
    // Mega panel scrolls internally instead of pushing the page.
    expect(src).toContain("max-h-[85vh] overflow-y-auto");
    // Mobile drawer scrolls internally with a viewport cap.
    expect(src).toContain("md:hidden overflow-y-auto");
    expect(src).toContain("max-h-[calc(100vh");
  });

  it("compact-state switching exists (scroll-driven heights + drawer offset)", () => {
    const src = HEADER_SRC();
    expect(src).toContain("window.scrollY > 40");
    expect(src).toContain('h-[36px]');
    expect(src).toContain('h-0 opacity-0');
    expect(src).toContain('h-[72px]');
    expect(src).toContain('h-[64px]');
    expect(src).toContain('top: scrolled ? "64px" : "108px"');
    // Server paint is the expanded state: full chrome, never pre-collapsed.
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).toContain("h-[72px]");
    expect(html).toContain("h-[36px]");
  });

  it("header root stays sticky + full-width so long labels never lose chrome", () => {
    const src = HEADER_SRC();
    expect(src).toContain("sticky top-0 z-40 w-full");
  });

  it("touch targets + mobile reachability: 44px links and a labelled drawer fallback", () => {
    const src = HEADER_SRC();
    const hits = src.match(/min-h-\[44px\]/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
    // Labels hidden behind `hidden md:flex` on small screens stay reachable.
    expect(src).toContain("selectMobileMenu");
    expect(src).toContain("store-mobile-menu");
    expect(src).toContain("aria-expanded");
    expect(src).toContain("expandedMobileMenu");
    // Luxury dropdown links carry the 44px guard in rendered markup.
    const html = renderHeader({
      slug: "songoskriti",
      name: "Songoskriti",
      themeKey: "songoskriti",
    });
    expect(html).toContain("min-h-[44px]");
  });
});

describe("chrome-localization: language toggle (both locales, tappable)", () => {
  it("renders EN + বাং affordances with pressed state and 40px+ targets", () => {
    const src = TOGGLE_SRC();
    expect(src).toContain("aria-pressed");
    expect(src).toContain("min-h-10");
    expect(src).toContain("min-w-10");
    for (const lang of ["en", "bn"] as const) {
      const html = renderToggle({ initialLang: lang });
      expect(html).toContain("EN");
      expect(html).toContain("বাং");
      expect(html).toContain('aria-pressed="true"');
    }
  });

  it("header wires the toggle into both luxury and generic chrome", () => {
    const src = HEADER_SRC();
    expect(src).toContain("<LanguageToggle />");
    expect(src).toContain("{!isLuxury && <LanguageToggle />}");
  });
});

describe("chrome-localization: footer menus (long labels, grid, caps)", () => {
  const footerNodes = (label: string) => [
    dbNode({ id: "f-1", label, url: "/c/footer-long" }, [
      dbNode({ id: "f-1-a", label, url: "/c/footer-long-child" }),
    ]),
  ];

  it("renders extra-long footer labels verbatim in both locales with rebased hrefs", () => {
    const en = renderFooter({ nodes: footerNodes(LONG_EN) });
    expect(en).toContain(LONG_EN);
    expect(en).toContain("/store/demo/c/footer-long");
    expect(en).toContain('aria-label="Footer menu"');
    const bn = renderFooter({ nodes: footerNodes(LONG_BN), initialLang: "bn" });
    expect(bn).toContain(LONG_BN);
    expect(bn).toContain("/store/demo/c/footer-long-child");
    expect(bn).toContain('aria-label="ফুটার মেনু"');
  });

  it("empty footer menus render nothing (no broken/empty nav landmark)", () => {
    expect(renderFooter({ nodes: [] })).toBe("");
  });

  it("footer grid is responsive with min-w-0 columns (long words cannot force overflow)", () => {
    const html = renderFooter({ nodes: footerNodes(LONG_EN) });
    expect(html).toContain("grid");
    expect(html).toContain("max-w-6xl");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("lg:grid-cols-4");
    expect(html).toContain("min-w-0");
    const ulLine = FOOTER_SRC()
      .split("\n")
      .find((l) => l.includes("sm:grid-cols-2"));
    expect(ulLine).toBeDefined();
    expect(ulLine!).not.toMatch(/w-\[\d+px\]/);
  });

  it("footer caps column/child counts so merchant menus cannot break the page", () => {
    const src = FOOTER_SRC();
    expect(src).toContain("slice(0, 12)");
    expect(src).toContain("slice(0, 24)");
  });

  it("footer links never clip: no truncate / nowrap / fixed-width guards in footer chrome", () => {
    const src = FOOTER_SRC();
    expect(src).not.toContain("truncate");
    expect(src).not.toContain("whitespace-nowrap");
    expect(src).not.toMatch(/w-\[\d+px\]/);
  });
});

describe("chrome-localization: support widget (bn chrome, wrap, bounds)", () => {
  it("launcher keeps a localized label and a 56px viewport-fixed target in both locales", () => {
    const en = renderWidget({});
    expect(en).toContain('aria-label="Support chat"');
    expect(en).toContain("fixed bottom-5 right-5");
    expect(en).toContain("size-14");
    const bn = renderWidget({ initialLang: "bn" });
    expect(bn).toContain('aria-label="সহায়তা চ্যাট"');
    expect(bn).toContain("fixed bottom-5 right-5");
    expect(bn).toContain("size-14");
  });

  it("initial greetings exist in both locales for every widget mode", () => {
    const tBn = (en: string, bn?: string) => (bn ? bn : en);
    const tEn = (en: string) => en;
    for (const mode of ["store", "platform", "dashboard"]) {
      const en = getInitialGreeting(tEn, mode);
      const bn = getInitialGreeting(tBn, mode);
      expect(en.length).toBeGreaterThan(0);
      expect(bn.length).toBeGreaterThan(0);
      expect(BN_RE.test(bn)).toBe(true);
    }
    expect(getInitialGreeting(tEn, "store")).toContain("order status");
    expect(getInitialGreeting(tEn, "platform")).toContain("Welcome to Framique");
    expect(getInitialGreeting(tEn, "dashboard")).toContain("Copilot");
  });

  it("message chrome wraps instead of clipping (feed scrolls, bubbles cap + wrap)", () => {
    const src = WIDGET_SRC();
    // Feed scrolls internally.
    expect(src).toContain("flex-1 space-y-3 overflow-y-auto px-4 py-3");
    // Bubbles cap at 85% and preserve line breaks for long bn text.
    expect(src).toContain("max-w-[85%]");
    expect(src).toContain("whitespace-pre-line");
    // Quick asks + CTA rows wrap instead of overflowing the 25rem dialog.
    expect(src).toContain("flex flex-wrap gap-1.5");
    // Composer input shrinks instead of forcing horizontal overflow.
    expect(src).toContain("min-w-0 flex-1");
  });

  it("dialog is viewport-bounded on small screens and capped on larger ones", () => {
    const src = WIDGET_SRC();
    expect(src).toContain("fixed inset-0");
    expect(src).toContain("sm:w-[25rem]");
    expect(src).toContain("sm:h-[38rem]");
  });
});

describe("chrome-localization: page overflow (theme chrome + storefront page)", () => {
  it("theme chrome zones are max-w-bounded with gutters and keep footer chrome", () => {
    const src = CHROME_SRC();
    expect(src).toContain('containerClassName = "mx-auto max-w-6xl px-4 py-8"');
    expect(src).toContain("mx-auto max-w-7xl space-y-2 px-4 sm:px-6 lg:px-8 pt-4");
    expect(src).toContain(
      "mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8 pb-16",
    );
    expect(src).toContain("border-t border-[var(--theme-border)]");
    expect(src).not.toMatch(/w-\[\d+px\]/);
  });

  it("storefront page guards long labels: wrapping filters, bounded inputs, clamped cards", () => {
    const src = PAGE_SRC();
    // Filter chip groups wrap for long bn category/collection names.
    expect(src).toContain("flex flex-wrap gap-2");
    // Search input is fluid but capped.
    expect(src).toContain("w-full max-w-md");
    // Catalogue grid reflows instead of overflowing.
    expect(src).toContain("grid grid-cols-2");
    expect(src).toContain("lg:grid-cols-4");
    // Cards clip media, not text: titles clamp to two lines.
    expect(src).toContain("overflow-hidden");
    expect(src).toContain("line-clamp-2");
    // Hero copy is measure-capped for long bn taglines.
    expect(src).toContain("max-w-xl");
  });
});
