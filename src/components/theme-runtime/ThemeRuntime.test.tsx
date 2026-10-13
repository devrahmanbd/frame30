/**
 * ThemeRuntime component — TDD: sandbox tokens, frame CSP contract,
 * immutable asset URLs, clamped height handshake, SSR shell.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildThemeFrameUrl,
  clampThemeHeight,
  isApprovedAssetOrigin,
  THEME_HEIGHT_MESSAGE,
  THEME_MAX_HEIGHT,
  THEME_MIN_HEIGHT,
  THEME_SANDBOX,
  themeFrameCSP,
  ThemeRuntime,
} from "./ThemeRuntime";

const ORIGIN = "https://themes.example-cdn.com";
const THEME = { name: "rupaboti", version: "1.4.0" };

describe("sandbox tokens — scripts inside, nothing else", () => {
  it("enables scripts inside the isolated document", () => {
    expect(THEME_SANDBOX.split(/\s+/)).toContain("allow-scripts");
  });

  it("is exactly allow-scripts: no same-origin, no navigation, no popups", () => {
    expect(THEME_SANDBOX).toBe("allow-scripts");
    expect(THEME_SANDBOX).not.toContain("allow-same-origin");
    expect(THEME_SANDBOX).not.toContain("allow-top-navigation");
    expect(THEME_SANDBOX).not.toContain("allow-popups");
    expect(THEME_SANDBOX).not.toContain("allow-forms");
  });
});

describe("themeFrameCSP — restrictive frame contract", () => {
  it("starts from default-src none (WidgetSandbox pattern)", () => {
    const csp = themeFrameCSP(ORIGIN);
    expect(csp.startsWith("default-src 'none'")).toBe(true);
  });

  it("admits only the approved asset origin for code-bearing kinds", () => {
    const csp = themeFrameCSP(ORIGIN);
    expect(csp).toContain(`script-src ${ORIGIN}`);
    expect(csp).toContain(`style-src ${ORIGIN}`);
    expect(csp).toContain(`img-src ${ORIGIN}`);
    expect(csp).toContain(`font-src ${ORIGIN}`);
    expect(csp).not.toContain("unsafe-inline;");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*(blob:|data:)/);
  });

  it("keeps connect-src none (bridge is the only data path)", () => {
    expect(themeFrameCSP(ORIGIN)).toContain("connect-src 'none'");
  });

  it("fails closed on unapproved origins", () => {
    for (const bad of [
      "https://evil.example.com; script-src evil",
      "http://themes.example-cdn.com",
      "javascript:alert(1)",
      "",
    ]) {
      expect(themeFrameCSP(bad)).toBe("default-src 'none'");
    }
  });
});

describe("buildThemeFrameUrl — immutable asset URLs", () => {
  it("builds a version-pinned https URL", () => {
    expect(buildThemeFrameUrl(ORIGIN, THEME)).toBe(
      `${ORIGIN}/t/rupaboti/1.4.0/index.html`,
    );
  });

  it("rejects mutable tags, traversal and http origins", () => {
    expect(
      buildThemeFrameUrl(ORIGIN, { name: "rupaboti", version: "latest" }),
    ).toBeNull();
    expect(
      buildThemeFrameUrl(ORIGIN, { name: "../evil", version: "1.0.0" }),
    ).toBeNull();
    expect(
      buildThemeFrameUrl(ORIGIN, { name: "rupaboti", version: "" }),
    ).toBeNull();
    expect(
      buildThemeFrameUrl("http://themes.example-cdn.com", THEME),
    ).toBeNull();
    expect(buildThemeFrameUrl("https://evil.example.com", THEME)).toBe(
      "https://evil.example.com/t/rupaboti/1.4.0/index.html",
    );
  });

  it("allows http loopback for local dev only", () => {
    expect(buildThemeFrameUrl("http://localhost:3000", THEME)).toContain(
      "http://localhost:3000/t/rupaboti/1.4.0/index.html",
    );
    expect(isApprovedAssetOrigin("https://themes.example-cdn.com")).toBe(true);
    expect(isApprovedAssetOrigin("http://themes.example-cdn.com")).toBe(false);
  });
});

describe("clampThemeHeight — runaway content cannot take the page", () => {
  it("passes sane heights through (ceiled)", () => {
    expect(clampThemeHeight(320)).toBe(320);
    expect(clampThemeHeight(320.2)).toBe(321);
  });

  it("clamps runaway and degenerate input", () => {
    expect(clampThemeHeight(1_000_000)).toBe(THEME_MAX_HEIGHT);
    expect(clampThemeHeight(-50)).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight(0)).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight(NaN)).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight(Infinity)).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight(undefined)).toBe(THEME_MIN_HEIGHT);
    expect(clampThemeHeight("9999999")).toBe(THEME_MAX_HEIGHT);
  });

  it("pins the handshake message type", () => {
    expect(THEME_HEIGHT_MESSAGE).toBe("fq:theme-height");
  });
});

describe("ThemeRuntime SSR shell", () => {
  const props = {
    title: "Custom theme",
    assetOrigin: ORIGIN,
    theme: THEME,
    granted: ["theme:storefront:read"],
    onCall: async () => ({ ok: true }),
  };

  it("renders the iframe shell without touching window", () => {
    const html = renderToStaticMarkup(createElement(ThemeRuntime, props));
    expect(html).toContain("<iframe");
    expect(html).toContain("Custom theme");
    expect(html).toContain(`${ORIGIN}/t/rupaboti/1.4.0/index.html`);
    expect(html).toContain('sandbox="allow-scripts"');
    expect(html).not.toContain("allow-same-origin");
  });

  it("never inlines theme code (no srcdoc path)", () => {
    const html = renderToStaticMarkup(createElement(ThemeRuntime, props));
    expect(html).not.toContain("srcdoc");
    expect(html).toContain("src=");
  });

  it("renders nothing for an unapproved identity (fail closed)", () => {
    const html = renderToStaticMarkup(
      createElement(ThemeRuntime, {
        ...props,
        theme: { name: "rupaboti", version: "latest" },
      }),
    );
    expect(html).toBe("");
  });
});
