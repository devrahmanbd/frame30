/**
 * Storefront commerce icon family — TDD: one Tabler-style outline family,
 * bilingual standalone labels, no external assets.
 *
 * The bug classes are mixed stroke weights (one icon at 2px among 1.75px),
 * hotlinked CDN geometry, raw hex fills, and standalone marks without a
 * bilingual label — so every mark is asserted on all four.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  STOREFRONT_ICONS,
  STOREFRONT_ICON_LABELS,
  STOREFRONT_STROKE_WIDTH,
  StorefrontIcon,
  storefrontIconLabel,
  type StorefrontIconName,
} from "./storefront";

const NAMES = Object.keys(STOREFRONT_ICONS) as StorefrontIconName[];

const EXPECTED: StorefrontIconName[] = [
  "cart",
  "search",
  "close",
  "chevron-down",
  "chevron-up",
  "chevron-left",
  "chevron-right",
  "arrow-left",
  "arrow-right",
  "arrow-up-right",
  "plus",
  "minus",
  "check",
  "star",
  "truck",
  "shield",
  "shield-check",
  "refresh",
];

describe("storefront icon set", () => {
  it("covers the commerce set (cart, search, close, chevrons/arrows, plus, minus, check, star, truck, shield, refresh)", () => {
    expect([...NAMES].sort()).toEqual([...EXPECTED].sort());
  });

  it("renders one 24px stroke family with round caps and the shared weight", () => {
    for (const name of NAMES) {
      const Component = STOREFRONT_ICONS[name];
      const html = renderToStaticMarkup(createElement(Component));
      expect(html).toContain('viewBox="0 0 24 24"');
      expect(html).toContain('stroke="currentColor"');
      expect(html).toContain('stroke-linecap="round"');
      expect(html).toContain('stroke-linejoin="round"');
      expect(html).toContain(`stroke-width="${STOREFRONT_STROKE_WIDTH}"`);
      expect(html).toContain('fill="none"');
      // Real geometry, not an empty shell.
      const d = html.match(/<path d="([^"]+)"/)?.[1] ?? "";
      expect(d.length, name).toBeGreaterThan(8);
    }
  });

  it("ships no raw hex and no external URLs", () => {
    const source = readFileSync(
      new URL("./storefront.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The only URL allowed is the mandatory SVG namespace.
    const urls = source.match(/https?:\/\/[^\s"']+/g) ?? [];
    expect(urls).toEqual(["http://www.w3.org/2000/svg"]);
    expect(source).not.toContain("svgrepo");
    expect(source).not.toContain("opensvg");
  });

  it("labels every mark in both storefront locales", () => {
    for (const name of NAMES) {
      const label = STOREFRONT_ICON_LABELS[name];
      expect(label.en.length).toBeGreaterThan(0);
      expect(label.bn.length).toBeGreaterThan(0);
      expect(label.bn).toMatch(/[\u0980-\u09FF]/);
    }
    expect(storefrontIconLabel("cart", "bn")).toBe("কার্ট");
    expect(storefrontIconLabel("search")).toBe("Search");
  });

  it("hides decorative marks and labels standalone marks", () => {
    const decorative = renderToStaticMarkup(
      createElement(StorefrontIcon, { name: "cart", decorative: true }),
    );
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain("aria-label");

    const standalone = renderToStaticMarkup(
      createElement(StorefrontIcon, { name: "cart", label: true, lang: "bn" }),
    );
    expect(standalone).toContain('role="img"');
    expect(standalone).toContain('aria-label="কার্ট"');
  });
});
