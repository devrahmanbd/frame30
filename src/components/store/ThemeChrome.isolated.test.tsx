/**
 * ThemeRuntime activation — custom-isolated mount decision (TDD RED-first).
 *
 * `ThemeRuntime` (sandboxed iframe, THEME_SANDBOX allow-scripts only, bridge
 * v2, capability grants from the install) exists but is unmounted. The mount
 * is a conditional branch in `ThemeChrome` on the theme record's runtime
 * flag: `runtime: "custom-isolated"` renders through `ThemeRuntime`, every
 * other record — including a missing flag — takes the identical classic
 * `ThemeSurface` path.
 *
 * Contracts pinned here:
 * 1. Mount decision: flag on → isolated; flag off / missing / invalid →
 *    classic renderer (never a stranded blank frame).
 * 2. Install grants ride the mount (`buildThemeGrants`); bridge-v2 auth
 *    semantics stay covered by the bridge suite.
 * 3. Host-rendered SEO metadata is still emitted for isolated themes
 *    (per docs/theme-runtime/limits.md: SSR head from host).
 * 4. Disable/rollback of the custom theme reverts to the previous renderer
 *    without stranding (no iframe, previous body back).
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/" } }),
    Link: (p: Record<string, unknown>) => {
      const { to, children, ...rest } = p as {
        to?: unknown;
        children?: unknown;
        [k: string]: unknown;
      };
      return h(
        "a",
        {
          href: typeof to === "string" ? to : "/",
          ...rest,
        },
        children as never,
      );
    },
  };
});

import { ThemeChrome, shouldUseIsolatedTheme } from "./ThemeChrome";
import { buildThemeGrants } from "@/components/theme-runtime/capabilities";
import { buildProductHead, buildStoreHead } from "@/lib/theme-seo";

const ORIGIN = "https://themes.example-cdn.com";

function isolatedTheme(overrides: Record<string, unknown> = {}) {
  return {
    runtime: "custom-isolated",
    assetOrigin: ORIGIN,
    name: "acme-custom",
    version: "1.4.0",
    granted: buildThemeGrants({
      storefrontRead: true,
      variantSelect: true,
      cartAdd: true,
      navigate: true,
    }).granted,
    navigateAllowlist: [],
    onCall: async () => ({ ok: true }),
    title: "Acme custom theme",
    ...overrides,
  };
}

const EMPTY_AST = { header: [], main: [], footer: [] };

function chrome(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    createElement(ThemeChrome, {
      template: "index",
      ast: EMPTY_AST,
      tokens: {},
      storeSlug: "acme",
      themeKey: "custom-acme",
      merchantId: null,
      siteKit: null,
      fallback: createElement("div", null, "fallback-body"),
      ...props,
    } as never),
  );
}

describe("shouldUseIsolatedTheme — mount decision", () => {
  it("mounts ThemeRuntime when the record is flagged custom-isolated", () => {
    expect(shouldUseIsolatedTheme(isolatedTheme())).toBe(true);
  });

  it("stays on the classic path when the flag names another runtime", () => {
    for (const runtime of ["official", "data-only", "", null]) {
      expect(
        shouldUseIsolatedTheme(isolatedTheme({ runtime })),
        `runtime=${String(runtime)}`,
      ).toBe(false);
    }
  });

  it("missing flag defaults to the classic path", () => {
    expect(shouldUseIsolatedTheme(undefined)).toBe(false);
    expect(shouldUseIsolatedTheme(null)).toBe(false);
    expect(shouldUseIsolatedTheme({})).toBe(false);
    const { runtime: _drop, ...noFlag } = isolatedTheme();
    void _drop;
    expect(shouldUseIsolatedTheme(noFlag)).toBe(false);
  });

  it("invalid descriptors fail back to the classic renderer, never a blank frame", () => {
    // Mutable tag: ThemeRuntime would render null — the mount must not strand.
    expect(shouldUseIsolatedTheme(isolatedTheme({ version: "latest" }))).toBe(
      false,
    );
    // Unapproved origin: same fail-back.
    expect(
      shouldUseIsolatedTheme(
        isolatedTheme({ assetOrigin: "http://themes.example-cdn.com" }),
      ),
    ).toBe(false);
    // Grants must ride the mount as an explicit list from the install.
    expect(shouldUseIsolatedTheme(isolatedTheme({ granted: null }))).toBe(
      false,
    );
    // No host handler: bridge calls would have nowhere to authorize.
    expect(shouldUseIsolatedTheme(isolatedTheme({ onCall: null }))).toBe(false);
  });
});

describe("ThemeChrome isolated branch", () => {
  it("renders the custom theme through ThemeRuntime (bridge v2 iframe)", () => {
    const html = chrome({ isolatedTheme: isolatedTheme() });
    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).toContain(`${ORIGIN}/t/acme-custom/1.4.0/index.html`);
    expect(html).toContain("Acme custom theme");
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain("srcdoc");
  });

  it("does not render classic theme sections under the isolated frame", () => {
    const html = chrome({ isolatedTheme: isolatedTheme() });
    expect(html).not.toContain("fallback-body");
    expect(html).not.toContain("fq-theme-scope");
  });

  it("every other theme takes the identical classic path (no iframe)", () => {
    for (const flag of [undefined, null, { runtime: "official" }, {}]) {
      const html = chrome({ isolatedTheme: flag });
      expect(html, `flag=${JSON.stringify(flag)}`).toContain("fallback-body");
      expect(html).not.toContain("<iframe");
      expect(html).not.toContain(ORIGIN);
    }
  });

  it("install grants ride the mount (least-privilege, from buildThemeGrants)", () => {
    const grants = buildThemeGrants({
      storefrontRead: true,
      cartAdd: true,
    });
    expect(grants.granted).toEqual(["theme:storefront:read", "theme:cart:add"]);
    const html = chrome({
      isolatedTheme: isolatedTheme({
        granted: grants.granted,
        navigateAllowlist: grants.navigateAllowlist,
      }),
    });
    expect(html).toContain("<iframe");
    expect(html).toContain('sandbox="allow-scripts"');
  });
});

describe("isolated themes keep host-rendered SEO (limits.md: SSR head from host)", () => {
  it("store head emits title/meta/canonical/JSON-LD for a custom-isolated theme key", () => {
    const head = buildStoreHead({
      origin: "https://shop.example.com",
      path: "/store/acme",
      storeName: "Acme",
      themeKey: "custom-acme",
    });
    expect(head.meta.find((m) => m.title)).toBeTruthy();
    expect(
      head.meta.find((m) => m.name === "description")?.content.length,
    ).toBeGreaterThan(0);
    expect(head.links.find((l) => l.rel === "canonical")?.href).toBe(
      "https://shop.example.com/store/acme",
    );
    const types = head.scripts.map((s) => s.children);
    expect(types.some((c) => c.includes('"Organization"'))).toBe(true);
    expect(types.some((c) => c.includes('"WebSite"'))).toBe(true);
  });

  it("product head emits Product/Offer JSON-LD for a custom-isolated theme key", () => {
    const head = buildProductHead({
      origin: "https://shop.example.com",
      path: "/store/acme/p/jamdani",
      storePath: "/store/acme",
      storeName: "Acme",
      themeKey: "custom-acme",
      product: { title: "Jamdani", slug: "jamdani" },
      currency: "BDT",
      priceMinor: 500000,
      inStock: true,
    });
    expect(head.meta.find((m) => m.title)?.title).toContain("Jamdani");
    expect(head.scripts.some((s) => s.children.includes('"Product"'))).toBe(
      true,
    );
  });

  it("isolated head matches the official-theme head shape (renderer never gates SEO)", () => {
    const base = {
      origin: "https://shop.example.com",
      path: "/store/acme",
      storeName: "Acme",
    } as const;
    const isolated = buildStoreHead({ ...base, themeKey: "custom-acme" });
    const official = buildStoreHead({ ...base, themeKey: "songoskriti" });
    expect(isolated.meta).toEqual(official.meta);
    expect(isolated.links).toEqual(official.links);
    expect(isolated.scripts).toEqual(official.scripts);
  });
});

describe("disable/rollback reverts without stranding", () => {
  it("disabling the custom theme restores the previous renderer, no frame left behind", () => {
    const before = chrome({ isolatedTheme: isolatedTheme() });
    expect(before).toContain("<iframe");
    // Disable: the theme record no longer carries the isolated runtime —
    // the next render is the classic path, not a stranded frame.
    const after = chrome({ isolatedTheme: undefined });
    expect(after).toContain("fallback-body");
    expect(after).not.toContain("<iframe");
    expect(after).not.toContain(ORIGIN);
  });

  it("rolling back to the official theme renders the classic themed path", () => {
    const after = chrome({
      isolatedTheme: { runtime: "official" },
      themeKey: "songoskriti",
    });
    expect(after).toContain("fallback-body");
    expect(after).not.toContain("<iframe");
  });
});
