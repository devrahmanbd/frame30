/**
 * R6 — FINAL ACCEPTANCE: two themes, one merchant payload, theme switch + full flow.
 *
 * Theme A = songoskriti (heritage/luxury chrome), Theme B = somvabona
 * (everyday chrome). The SAME page AST, product rows, dashboard menu tree,
 * announcement section, footer section and community (plugin_block) install
 * render under both keys via SSR (`renderToStaticMarkup` — no browser
 * tooling in this env; assertions run on rendered HTML strings).
 *
 * Proven here:
 *  1. builder → save → reload → publish → storefront (pure/SSR contracts:
 *     newSection → parseAst serialise → parseAst reload (byte-stable) →
 *     lintTemplate gate → parseTemplates/resolveTemplate → SectionRenderer
 *     storefront under BOTH themes).
 *  2. Theme A → Theme B switch: identical content/functionality with
 *     different presentation per surface —
 *     header, announcement, widgets (product_grid), footer, menu, community.
 *
 * Read-only against the implementation: this file only renders existing
 * components and reads existing registries. No implementation imports are
 * mutated (registrations are cleared + re-registered per test).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Router mock: Link renders a plain <a> (same precedent as StoreHeader.test).
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

import {
  flattenAst,
  lintTemplate,
  newSection,
  parseAst,
  parseTemplates,
  resolveTemplate,
  templateOf,
  type Section,
  type SectionType,
  type ThemeAst,
} from "./builder-ast";
import {
  clearThemePresentations,
  registerThemePresentation,
  resolveThemePresentation,
} from "./theme-presentations";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import type { WidgetRow } from "./widget-data";
import { LanguageProvider } from "@/lib/i18n";
import type { CanonicalMenuItem, MenuNode } from "@/lib/menus/menu";
import {
  assembleHeaderData,
  GenericHeaderShell,
  resolveHeaderShell,
} from "@/components/store/StoreHeader";
import {
  SongoskritiHeaderPresentation,
  SongoskritiHeaderShell,
} from "./themes/songoskriti/header-presentation";
import {
  SomvabonaHeaderPresentation,
  SomvabonaHeaderShell,
} from "./themes/somvabona/header-presentation";
import {
  SongoskritiDesktopNav,
  SongoskritiMobileDrawer,
} from "./themes/songoskriti/header-presentation";
import {
  SomvabonaDesktopNav,
  SomvabonaMobileDrawer,
} from "./themes/somvabona/header-presentation";
import { SongoskritiAnnouncementPresentation } from "./themes/songoskriti/announcement-presentation";
import { SomvabonaAnnouncementPresentation } from "./themes/somvabona/announcement-presentation";
import { SongoskritiFooterProofPresentation } from "./themes/songoskriti/footer-proof-presentation";
import { SomvabonaFooterProofPresentation } from "./themes/somvabona/footer-proof-presentation";

const THEME_A = "songoskriti";
const THEME_B = "somvabona";

/* ── Shared merchant payload (ONE object per surface, both themes) ── */

const MSG1_EN = "Free delivery over BDT 2,000";
const MSG1_BN = "৳২০০০-এর বেশি কিনলে ফ্রি ডেলিভারি";
const MSG2_EN = "New drop every Friday";
const LINK_HREF = "/c/new-in";

const ROWS: WidgetRow[] = [
  {
    id: "acc-jamdani",
    title: "Dhakai Jamdani saree",
    href: "/p/acc-jamdani",
    priceMinor: 12500_00,
    currency: "BDT",
    imageUrl: "/ph/acc-jamdani.png",
    inStock: true,
  },
  {
    id: "acc-panjabi",
    title: "Silk panjabi",
    href: "/p/acc-panjabi",
    priceMinor: 4800_00,
    currency: "BDT",
    imageUrl: "/ph/acc-panjabi.png",
    inStock: true,
  },
];

const CANONICAL_MENU: CanonicalMenuItem[] = [
  {
    id: "shop",
    label: "Shop",
    href: "/c/shop",
    badge: "New",
    children: [
      {
        id: "sarees",
        label: "Sarees",
        href: "/c/sarees",
        children: [{ id: "jamdani", label: "Jamdani", href: "/c/jamdani" }],
      },
    ],
    promo: { image: "/ph/acc-promo.jpg", href: "/c/festive", title: "Festive" },
  },
  { id: "about", label: "About", href: "/pages/about" },
];

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

/** ONE dashboard menu tree — the header-shell input for both themes. */
function proofMenus(): { header: MenuNode[]; mobile: MenuNode[] } {
  const tree: MenuNode[] = [
    {
      ...dbNode({ id: "m-shop", label: "Shop", url: "/c/shop" }),
      children: [
        {
          ...dbNode({ id: "m-sarees", label: "Sarees", url: "/c/sarees" }),
          children: [dbNode({ id: "m-jamdani", label: "Jamdani", url: "/c/jamdani" })],
        },
      ],
    },
    dbNode({ id: "m-about", label: "About", url: "/pages/about" }),
  ];
  return { header: tree, mobile: tree };
}

/* ── Page AST sections (builder input) ── */

function announcementSection(): Section {
  const base = newSection("announcement_bar");
  return {
    ...base,
    id: "acc-announcement",
    props: {
      ...base.props,
      items: [
        { text: MSG1_EN, text_bn: MSG1_BN },
        { text: MSG2_EN, text_bn: "" },
      ],
      href: LINK_HREF,
      dismissible: true,
      rotateMs: 0,
      motion: "static",
    },
  };
}

function megaMenuSection(): Section {
  const base = newSection("mega_menu");
  return {
    ...base,
    id: "acc-mega-menu",
    props: { ...base.props, label: "Shop", limit: 8 },
  };
}

function headingSection(): Section {
  const base = newSection("heading");
  return {
    ...base,
    id: "acc-heading",
    props: { ...base.props, text: "Acceptance headline", level: "h2" },
  };
}

function productGridSection(): Section {
  const base = newSection("product_grid");
  return {
    ...base,
    id: "acc-grid",
    props: { ...base.props, heading: "Acceptance collection", limit: 8 },
  };
}

function communitySection(): Section {
  const base = newSection("plugin_block");
  return {
    ...base,
    id: "acc-community",
    props: { ...base.props, pluginKey: "plugin:reviews/wall", height: 320 },
  };
}

function footerSection(): Section {
  const base = newSection("footer_sitemap");
  return {
    ...base,
    id: "acc-footer",
    props: {
      ...base.props,
      items: [
        {
          title: "Shop",
          links: "New in|/c/new-in\nBest sellers|/c/best-sellers",
        },
        { title: "Help", links: "Contact|/pages/contact" },
      ],
      pages: "",
    },
  };
}

function acceptanceAst(): ThemeAst {
  return {
    header: [announcementSection(), megaMenuSection()],
    main: [headingSection(), productGridSection(), communitySection()],
    footer: [footerSection()],
  };
}

/* ── Render helpers (SSR markup strings) ── */

function ctxFor(
  section: Section,
  locale: "en" | "bn" = "en",
  data?: WidgetCtx["data"],
): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    storeSlug: "demo",
    ...(data ? { data } : {}),
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function renderPresentation(
  themeKey: string,
  widgetType: SectionType,
  section: Section,
  locale: "en" | "bn" = "en",
  data?: WidgetCtx["data"],
): string {
  const Cmp = resolveThemePresentation(themeKey, widgetType)!;
  return renderToStaticMarkup(
    createElement(Cmp as (p: WidgetCtx) => React.ReactElement, ctxFor(section, locale, data)),
  );
}

function renderEngine(
  section: Section,
  themeKey: string,
  locale: "en" | "bn" = "en",
  map?: Record<string, WidgetRow[]>,
  byNode?: Record<string, string>,
): string {
  const node =
    map && byNode ? (
      <WidgetDataProvider
        bundle={{ requests: [{ key: "acc", source: "collection", params: {} }], byNode } as never}
        map={map as never}
      >
        <SectionRenderer section={section} themeKey={themeKey} locale={locale} />
      </WidgetDataProvider>
    ) : (
      <SectionRenderer section={section} themeKey={themeKey} locale={locale} />
    );
  return renderToStaticMarkup(node);
}

function renderShell(
  Shell: typeof SongoskritiHeaderShell,
  themeKey: string | null,
  opts: { locale?: "en" | "bn"; mobileOpen?: boolean; expandedMobileMenu?: string | null } = {},
): string {
  const { locale = "en", mobileOpen = true, expandedMobileMenu = "m-shop" } = opts;
  const t =
    locale === "bn" ? (en: string, bn?: string) => bn ?? en : (en: string) => en;
  const data = assembleHeaderData({
    slug: "demo",
    menus: proofMenus(),
    themeKey,
    pathname: "/store/demo",
    t,
  });
  const ui: ReactElement = (
    <QueryClientProvider client={new QueryClient()}>
      <LanguageProvider initialLang={locale}>
        <Shell
          slug="demo"
          name="Demo"
          custom={false}
          data={data}
          behavior={{
            mobileOpen,
            setMobileOpen: (() => {}) as never,
            scrolled: false,
            expandedMobileMenu,
            setExpandedMobileMenu: (() => {}) as never,
          }}
          wishlistCount={2}
          cartCount={3}
          cartHydrated
          locale={locale}
          t={t}
        />
      </LanguageProvider>
    </QueryClientProvider>
  );
  return renderToStaticMarkup(ui);
}

beforeEach(() => {
  mockPathname.current = "/store/demo";
  clearThemePresentations();
  registerThemePresentation(THEME_A, "mega_menu", SongoskritiHeaderPresentation);
  registerThemePresentation(THEME_B, "mega_menu", SomvabonaHeaderPresentation);
  registerThemePresentation(THEME_A, "announcement_bar", SongoskritiAnnouncementPresentation);
  registerThemePresentation(THEME_B, "announcement_bar", SomvabonaAnnouncementPresentation);
  registerThemePresentation(THEME_A, "footer_sitemap", SongoskritiFooterProofPresentation);
  registerThemePresentation(THEME_B, "footer_sitemap", SomvabonaFooterProofPresentation);
});

/* ── 1. builder → save → reload → publish → storefront ── */

describe("R6 acceptance — builder → save → reload → publish → storefront", () => {
  it("builds the acceptance page, saves + reloads byte-stable, publishes clean", () => {
    // BUILD (editor): merchant drops the acceptance sections on the canvas.
    const draft = acceptanceAst();
    expect(draft.header.map((s) => s.type)).toEqual(["announcement_bar", "mega_menu"]);
    expect(draft.main.map((s) => s.type)).toEqual(["heading", "product_grid", "plugin_block"]);
    expect(draft.footer.map((s) => s.type)).toEqual(["footer_sitemap"]);

    // SAVE: serialise → parse (the server path). Authored copy survives,
    // smuggled props are dropped.
    const saved = parseAst(JSON.parse(JSON.stringify(draft)));
    expect(saved.main.find((s) => s.id === "acc-grid")!.props["heading"]).toBe(
      "Acceptance collection",
    );
    expect(saved.main.find((s) => s.id === "acc-heading")!.props["text"]).toBe(
      "Acceptance headline",
    );
    expect(saved.main.find((s) => s.id === "acc-community")!.props["pluginKey"]).toBe(
      "plugin:reviews/wall",
    );

    // RELOAD: serialise → parse again is byte-stable.
    const reloaded = parseAst(JSON.parse(JSON.stringify(saved)));
    expect(JSON.stringify(reloaded)).toBe(JSON.stringify(saved));

    // PUBLISH: lint gate is clean (no errors), template resolves, never blank.
    const errors = lintTemplate(reloaded, "index").filter((i) => i.level === "error");
    expect(errors).toEqual([]);
    const templates = parseTemplates({ index: reloaded });
    const { ast, match } = resolveTemplate(templates, "index");
    expect(match).toBe("base");
    expect(templateOf(templates, "index").main.map((s) => s.id)).toEqual([
      "acc-heading",
      "acc-grid",
      "acc-community",
    ]);
    expect(flattenAst(ast).map((s) => s.id)).toEqual([
      "acc-announcement",
      "acc-mega-menu",
      "acc-heading",
      "acc-grid",
      "acc-community",
      "acc-footer",
    ]);
  });

  it("storefront renders the published page under BOTH themes with authored copy", () => {
    const { ast } = resolveTemplate(parseTemplates({ index: parseAst(acceptanceAst()) }), "index");
    const byNode = { "acc-grid": "acc", "acc-mega-menu": "acc" };
    const map = { acc: ROWS };
    const renderPage = (themeKey: string) =>
      renderToStaticMarkup(
        <WidgetDataProvider
          bundle={{ requests: [{ key: "acc", source: "collection", params: {} }], byNode } as never}
          map={map as never}
        >
          <>
            {[...ast.header, ...ast.main, ...ast.footer].map((s) => (
              <SectionRenderer key={s.id} section={s} themeKey={themeKey} locale="en" />
            ))}
          </>
        </WidgetDataProvider>,
      );
    const htmlA = renderPage(THEME_A);
    const htmlB = renderPage(THEME_B);

    // Same merchant payload visible in both storefronts.
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain("Acceptance headline");
      expect(html).toContain("Acceptance collection");
      for (const row of ROWS) {
        expect(html).toContain(row.title);
        expect(html).toContain(row.imageUrl as string);
      }
      expect(html).toContain(MSG1_EN);
      expect(html).toContain(LINK_HREF);
      expect(html).toContain("New in");
      expect(html).toContain("Best sellers");
      expect(html).toContain("Contact");
      expect(html).toContain("This app is not installed");
    }
    // Theme chrome differs per theme on the same page.
    expect(htmlA).toContain('data-announcement-presentation="songoskriti"');
    expect(htmlB).toContain('data-announcement-presentation="somvabona"');
    expect(htmlA).toContain('data-footer-presentation="songoskriti-proof"');
    expect(htmlB).toContain('data-footer-presentation="somvabona-proof"');
    expect(htmlA).toContain('data-header-presentation="songoskriti"');
    expect(htmlB).toContain('data-header-presentation="somvabona"');
    expect(htmlA).not.toBe(htmlB);
  });
});

/* ── 2. Theme A → Theme B switch, per surface ── */

describe("R6 acceptance — switch: header", () => {
  it("resolves distinct shells per theme with generic fallback", () => {
    expect(resolveHeaderShell(THEME_A)).toBe(SongoskritiHeaderShell);
    expect(resolveHeaderShell(THEME_B)).toBe(SomvabonaHeaderShell);
    expect(resolveHeaderShell("mystery-theme")).toBe(GenericHeaderShell);
    expect(resolveHeaderShell(null)).toBe(GenericHeaderShell);
  });

  it("same menu + same header state: identical content, different presentation", () => {
    const htmlA = renderShell(SongoskritiHeaderShell, THEME_A);
    const htmlB = renderShell(SomvabonaHeaderShell, THEME_B);

    // Presentation differs: per-theme shell markers, never crossed.
    expect(htmlA).toContain('data-header-shell="songoskriti"');
    expect(htmlB).toContain('data-header-shell="somvabona"');
    expect(htmlA).not.toContain('data-header-shell="somvabona"');
    expect(htmlB).not.toContain('data-header-shell="songoskriti"');
    expect(htmlA).not.toBe(htmlB);
    // Desktop geometry differs: luxury mega panel vs compact dropdown.
    expect(htmlA).toContain('data-mega="songoskriti"');
    expect(htmlA).toContain("grid-cols-4");
    expect(htmlB).toContain('data-drop="somvabona"');
    expect(htmlB).toContain("min-w-52");
    expect(htmlA).not.toContain("data-drop");
    expect(htmlB).not.toContain("data-mega");
    // Mobile geometry differs: accordion buttons vs native disclosures.
    expect(htmlA).toContain('data-nav="songoskriti-drawer"');
    expect(htmlA).toContain('aria-expanded="true"');
    expect(htmlB).toContain('data-nav="somvabona-drawer"');
    expect(htmlB).toContain("<details");

    // Content identical: same labels, same rebased hrefs, same landmark.
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain(">Shop<");
      expect(html).toContain(">Sarees<");
      expect(html).toContain(">Jamdani<");
      expect(html).toContain(">About<");
      expect(html).toContain('href="/store/demo/c/shop"');
      expect(html).toContain('href="/store/demo/c/sarees"');
      expect(html).toContain('href="/store/demo/c/jamdani"');
      expect(html).toContain('href="/store/demo/pages/about"');
      expect(html).toContain('aria-label="Store menu"');
    }
    // Functionality identical: same controls, counts, language switch.
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain('aria-label="Search"');
      expect(html).toContain('aria-label="Your account"');
      expect(html).toContain('aria-label="Wishlist, 2"');
      expect(html).toContain('aria-label="Cart, 3"');
      expect(html).toContain("EN");
      expect(html).toContain("বাং");
    }
  });
});

describe("R6 acceptance — switch: announcement", () => {
  it("same announcement section: identical copy/links/behavior, different chrome", () => {
    const section = announcementSection();
    const before = JSON.stringify(section);
    const htmlA = renderPresentation(THEME_A, "announcement_bar", section);
    const htmlB = renderPresentation(THEME_B, "announcement_bar", section);

    // Presentation differs: heritage centered serif bar vs everyday strip.
    expect(htmlA).toContain('data-announcement-presentation="songoskriti"');
    expect(htmlB).toContain('data-announcement-presentation="somvabona"');
    expect(htmlA).toContain("<div");
    expect(htmlB).toContain("<section");
    expect(htmlA).toContain("font-serif");
    expect(htmlA).toContain("uppercase");
    expect(htmlB).toContain("font-sans");
    expect(htmlB).toContain("text-left");
    expect(htmlA).not.toBe(htmlB);

    // Content identical: same message, same link, same region label.
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain(MSG1_EN);
      expect(html).toContain(LINK_HREF);
      expect(html).toContain('aria-label="Announcement"');
    }
    // Functionality identical: steppers reach every message, same dismiss.
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain('aria-label="Previous announcement"');
      expect(html).toContain('aria-label="Next announcement"');
      expect(html).toContain('aria-label="Dismiss announcement"');
    }
    // Neither render mutates the shared section.
    expect(JSON.stringify(section)).toBe(before);
  });

  it("same bilingual copy in the bn locale", () => {
    const section = announcementSection();
    const htmlA = renderPresentation(THEME_A, "announcement_bar", section, "bn");
    const htmlB = renderPresentation(THEME_B, "announcement_bar", section, "bn");
    expect(htmlA).not.toBe(htmlB);
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain(MSG1_BN);
      expect(html).toContain('aria-label="ঘোষণা"');
    }
  });
});

describe("R6 acceptance — switch: widgets (product_grid)", () => {
  function renderGrid(themeKey: string): string {
    const section = productGridSection();
    return renderEngine(section, themeKey, "en", { acc: ROWS }, { "acc-grid": "acc" });
  }

  it("same section + same rows: identical data, different presentation", () => {
    const section = productGridSection();
    const before = JSON.stringify(section);
    const htmlA = renderGrid(THEME_A);
    const htmlB = renderGrid(THEME_B);

    // Presentation differs: heritage editorial grid vs generic grid.
    expect(htmlA.length).toBeGreaterThan(0);
    expect(htmlB.length).toBeGreaterThan(0);
    expect(htmlA).not.toBe(htmlB);
    expect(htmlA).toContain("font-serif");
    // No cross-brand leak.
    expect(htmlA).not.toContain("somvabona");
    expect(htmlB).not.toContain("songoskriti");

    // Data identical: same heading, same products, same images.
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain("Acceptance collection");
      for (const row of ROWS) {
        expect(html).toContain(row.title);
        expect(html).toContain(row.imageUrl as string);
      }
      expect(html).toContain('data-widget="product_grid"');
    }
    expect(JSON.stringify(section)).toBe(before);
  });
});

describe("R6 acceptance — switch: footer", () => {
  it("same footer section: identical columns/links/affordances, different structure", () => {
    const section = footerSection();
    const before = JSON.stringify(section);
    const htmlA = renderPresentation(THEME_A, "footer_sitemap", section);
    const htmlB = renderPresentation(THEME_B, "footer_sitemap", section);

    // Presentation differs: heritage grid sections vs everyday stacked list.
    expect(htmlA).toContain('data-footer-presentation="songoskriti-proof"');
    expect(htmlB).toContain('data-footer-presentation="somvabona-proof"');
    expect(htmlA).toContain("<section");
    expect(htmlB).not.toContain("<section");
    expect(htmlB).toContain("<ul");
    expect(htmlA).not.toBe(htmlB);
    expect(htmlA).not.toContain("somvabona-proof");
    expect(htmlB).not.toContain("songoskriti-proof");

    // Content identical: same columns, labels, hrefs, nav label.
    for (const html of [htmlA, htmlB]) {
      for (const label of ["Shop", "Help", "New in", "Best sellers", "Contact"]) {
        expect(html).toContain(label);
      }
      for (const href of ["/c/new-in", "/c/best-sellers", "/pages/contact"]) {
        expect(html).toContain(`href="${href}"`);
      }
      expect(html).toContain('aria-label="Footer menu"');
      expect(html).toContain("<p");
    }
    expect(JSON.stringify(section)).toBe(before);
  });

  it("one global footer edit lands in every theme template", () => {
    const edited: Section = {
      ...footerSection(),
      props: {
        ...footerSection().props,
        items: [
          { title: "Sale", links: "Clearance|/c/clearance" },
          { title: "Help", links: "Contact|/pages/contact" },
        ],
      },
    };
    const htmlA = renderPresentation(THEME_A, "footer_sitemap", edited);
    const htmlB = renderPresentation(THEME_B, "footer_sitemap", edited);
    for (const html of [htmlA, htmlB]) {
      expect(html).toContain("Sale");
      expect(html).toContain('href="/c/clearance"');
      expect(html).not.toContain("Best sellers");
    }
    expect(htmlA).not.toBe(htmlB);
  });
});

describe("R6 acceptance — switch: menu", () => {
  it("same canonical menu: identical links/labels/hrefs, different nav markup", () => {
    const desktopA = renderToStaticMarkup(
      <SongoskritiDesktopNav items={CANONICAL_MENU} base="/store/demo" />,
    );
    const desktopB = renderToStaticMarkup(
      <SomvabonaDesktopNav items={CANONICAL_MENU} base="/store/demo" />,
    );
    for (const html of [desktopA, desktopB]) {
      expect(html).toContain(">Shop<");
      expect(html).toContain(">Sarees<");
      expect(html).toContain(">Jamdani<");
      expect(html).toContain('href="/store/demo/c/shop"');
      expect(html).toContain('href="/store/demo/c/jamdani"');
      expect(html).toContain('href="/store/demo/pages/about"');
      expect(html).toContain("New");
      expect(html).toContain('src="/ph/acc-promo.jpg"');
    }
    expect(desktopA).toContain('data-nav="songoskriti-desktop"');
    expect(desktopA).toContain('data-mega="songoskriti"');
    expect(desktopB).toContain('data-nav="somvabona-desktop"');
    expect(desktopB).toContain('data-drop="somvabona"');
    expect(desktopA).not.toBe(desktopB);

    const drawerA = renderToStaticMarkup(
      <SongoskritiMobileDrawer items={CANONICAL_MENU} base="/store/demo" defaultExpandedId="shop" />,
    );
    const drawerB = renderToStaticMarkup(
      <SomvabonaMobileDrawer items={CANONICAL_MENU} base="/store/demo" defaultExpandedId="shop" />,
    );
    for (const html of [drawerA, drawerB]) {
      expect(html).toContain(">Shop<");
      expect(html).toContain(">Jamdani<");
      expect(html).toContain('href="/store/demo/c/jamdani"');
    }
    expect(drawerA).toContain('data-nav="songoskriti-drawer"');
    expect(drawerA).toContain('aria-expanded="true"');
    expect(drawerB).toContain('data-nav="somvabona-drawer"');
    expect(drawerB).toContain("<details");
    expect(drawerA).not.toBe(drawerB);
  });
});

describe("R6 acceptance — switch: community widget", () => {
  it("same plugin_block install renders identically on both themes, no brand leak", () => {
    const section = communitySection();
    const before = JSON.stringify(section);
    const htmlA = renderEngine(section, THEME_A);
    const htmlB = renderEngine(section, THEME_B);

    // Functionality identical: same unavailable-install placeholder copy.
    expect(htmlA).toContain("This app is not installed");
    expect(htmlB).toContain("This app is not installed");
    expect(htmlA).toBe(htmlB);
    // Never one theme's brand inside the other's tree.
    expect(htmlA).not.toContain("songoskriti");
    expect(htmlA).not.toContain("somvabona");
    expect(JSON.stringify(section)).toBe(before);
  });

  it("install persists through save without loss", () => {
    const saved = parseAst({
      header: [],
      main: [communitySection()],
      footer: [],
    });
    expect(saved.main).toHaveLength(1);
    expect(saved.main[0]!.type).toBe("plugin_block");
    expect(saved.main[0]!.props["pluginKey"]).toBe("plugin:reviews/wall");
    expect(saved.main[0]!.invalid).toBeUndefined();
    const again = parseAst(JSON.parse(JSON.stringify(saved)));
    expect(JSON.stringify(again)).toBe(JSON.stringify(saved));
  });
});
