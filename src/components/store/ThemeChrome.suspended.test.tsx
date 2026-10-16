/**
 * ThemeChrome isolated branch — `suspended` forwarding (kill-switch liveness).
 *
 * The install's live status rides the mount descriptor and MUST reach the
 * sandboxed `ThemeRuntime` frame: `suspended: true` refuses every bridge call
 * as `theme.suspended` before any host work (per-envelope denial is pinned in
 * `src/components/theme-runtime/bridge-v2.test.ts`); absent/false stays
 * live. The frame still mounts either way — suspension denies CALLS, it never
 * strands the page on a blank frame.
 *
 * Props are not observable in static markup, so `ThemeRuntime` is stubbed at
 * the module boundary (everything else actual, including
 * `buildThemeFrameUrl`): the stub renders the real frame URL plus a
 * `data-fq-suspended` attribute exposing exactly the prop it received.
 */
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useRouterState: () => ({ location: { pathname: "/" } }),
  };
});

vi.mock("@/components/theme-runtime/ThemeRuntime", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/theme-runtime/ThemeRuntime")
    >();
  const { createElement: h } = await import("react");
  return {
    ...actual,
    ThemeRuntime: (p: {
      title?: string;
      assetOrigin: string;
      theme: { name: string; version: string };
      suspended?: boolean;
    }) =>
      h("iframe", {
        title: p.title ?? "stub",
        src: actual.buildThemeFrameUrl(p.assetOrigin, p.theme) ?? "about:blank",
        sandbox: "allow-scripts",
        "data-fq-suspended": p.suspended === true ? "true" : "false",
      }),
  };
});

import { ThemeChrome, shouldUseIsolatedTheme } from "./ThemeChrome";
import { buildThemeGrants } from "@/components/theme-runtime/capabilities";
import { authorizeThemeCall } from "@/components/theme-runtime/bridge-v2";

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

describe("ThemeChrome isolated branch — suspended forwarding", () => {
  it("a suspended install still mounts the frame (denial is per-call, never a stranding)", () => {
    expect(shouldUseIsolatedTheme(isolatedTheme({ suspended: true }))).toBe(
      true,
    );
    const html = chrome({ isolatedTheme: isolatedTheme({ suspended: true }) });
    expect(html).toContain("<iframe");
    expect(html).toContain(`${ORIGIN}/t/acme-custom/1.4.0/index.html`);
    expect(html).not.toContain("fallback-body");
  });

  it("forwards suspended=true to ThemeRuntime (the frame then denies every call)", () => {
    const html = chrome({ isolatedTheme: isolatedTheme({ suspended: true }) });
    expect(html).toContain('data-fq-suspended="true"');
  });

  it("absent/false stays live (frame mounts, calls allowed subject to grants)", () => {
    for (const suspended of [undefined, false]) {
      const html = chrome({
        isolatedTheme: isolatedTheme({ suspended }),
      });
      expect(html, `suspended=${String(suspended)}`).toContain("<iframe");
      expect(html).toContain('data-fq-suspended="false"');
    }
  });

  it("suspended=true denies the frame's bridge calls as theme.suspended", () => {
    // The forwarded value lands in ThemeRuntime's per-envelope context;
    // denial itself is the bridge contract (server revalidates regardless).
    expect(
      authorizeThemeCall(
        { v: 2, id: "1", method: "storefront.get" },
        { granted: ["theme:storefront:read"], suspended: true },
      ),
    ).toEqual({ allowed: false, reason: "suspended" });
    expect(authorizeThemeCall(null, { granted: [], suspended: true })).toEqual({
      allowed: false,
      reason: "suspended",
    });
  });
});
