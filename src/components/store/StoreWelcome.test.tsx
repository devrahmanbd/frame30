/**
 * Store welcome default — TDD: every store without a designated homepage
 * shows this instead of the theme index.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StoreWelcome, WelcomePlate } from "./StoreWelcome";
import type { ThemeTokens } from "@/lib/builder-ast";

describe("WelcomePlate (h1+h3 only)", () => {
  it("renders exactly one h1 and one h3, nothing else", () => {
    const html = renderToStaticMarkup(
      createElement(WelcomePlate, {
        name: "Demo Store",
        base: "/store/demo-store",
      }),
    );
    expect(html).toContain("Welcome to Framique");
    expect(html).toContain(
      "This store is getting ready. Browse the collection while the shelves are stocked.",
    );
    expect((html.match(/<h1/g) || []).length).toBe(1);
    expect((html.match(/<h3/g) || []).length).toBe(1);
    expect(html).not.toContain("<header");
    expect(html).not.toContain("<nav");
    expect(html).not.toContain("<a ");
  });
});

describe("StoreWelcome per-theme and tenant separation", () => {
  it("renders unstyled plate when no tokens provided", () => {
    const html = renderToStaticMarkup(
      createElement(StoreWelcome, {
        slug: "tenant-a",
        name: "Tenant A",
        custom: false,
      }),
    );
    expect(html).toContain("Welcome to Framique");
    expect(html).not.toContain("fq-theme-scope");
  });

  it("renders within ThemeSurface when theme tokens are passed for the tenant", () => {
    const mockTokens: ThemeTokens = {
      brand: "#8A3B1F",
      accent: "#C45D3E",
      surface: "#FAF8F5",
      ink: "#2D2A26",
      radius: "4px",
      fontDisplay: "Playfair Display",
      fontBody: "Inter",
      container: "1320px",
      density: "airy",
      typeScale: "expressive",
      spaceUnit: "16px",
      shadow: "soft",
      motion: "subtle",
      digits: "latin",
      locale: "en",
      currencyDisplay: "symbol",
      fontPairing: "editorial-serif",
      dark: null,
      globals: { colors: [], fonts: [] },
      timezone: "Asia/Dhaka",
      allowCustomerTimezone: false,
    };

    const html = renderToStaticMarkup(
      createElement(StoreWelcome, {
        slug: "tenant-b",
        name: "Songoskriti Store",
        custom: false,
        tokens: mockTokens,
      }),
    );

    expect(html).toContain("Welcome to Framique");
    expect(html).toContain(
      "This store is getting ready. Browse the collection while the shelves are stocked.",
    );
    // Verified: scoped to fq-theme-scope for tenant isolation
    expect(html).toContain("fq-theme-scope");
    expect(html).toContain("--theme-brand:#8A3B1F");
    expect(html).toContain("--theme-surface:#FAF8F5");
    expect(html).toContain("Playfair Display");
    expect(html).toContain('rel="stylesheet"');
    expect(html).toContain("Playfair+Display");
  });
});
