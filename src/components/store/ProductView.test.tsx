/**
 * Theme-remediation Task 4 — ProductCraftStory brand-art gate.
 *
 * ProductCraftStory rendered the songoskriti brand image
 * (`/ph/songoskriti/hero_artisans_*.jpg`) unconditionally, so every
 * non-songoskriti storefront with a handloom/jamdani/silk product showed
 * songoskriti brand art — same brand-art class as the CollectionView hero
 * fix (key-gated in `fix/theme-remediation` @ 5d50c97). Brand follows the
 * installed theme key: foreign/null keys get a neutral placeholder block,
 * the songoskriti key keeps its art (pixel-parity pin below).
 *
 * Vitest env node — NO jsdom/testing-library/renderHook. Static markup
 * via renderToStaticMarkup (StoreHeader.test.tsx / CollectionView.test.tsx
 * precedent). ProductCraftStory only needs useLang → LanguageProvider.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { ProductCraftStory } from "./ProductView";
import { LanguageProvider } from "@/lib/i18n";

const CRAFT_DESC =
  "Handloom jamdani saree in mulberry silk, heritage weave from Demra.";

function renderStory(themeKey?: string | null) {
  const ui: ReactElement = (
    <LanguageProvider initialLang="en">
      <ProductCraftStory description={CRAFT_DESC} themeKey={themeKey} />
    </LanguageProvider>
  );
  return renderToStaticMarkup(ui);
}

describe("ProductCraftStory brand art follows the theme key", () => {
  it("foreign key renders the section with zero /ph/songoskriti paths", () => {
    const html = renderStory("bazaar");
    expect(html).toContain("The Weave");
    expect(html).not.toContain("/ph/songoskriti");
  });

  it("null themeKey renders the section with zero /ph/songoskriti paths", () => {
    const html = renderStory(null);
    expect(html).toContain("The Weave");
    expect(html).not.toContain("/ph/songoskriti");
  });

  it("omitted themeKey defaults to generic (zero /ph/songoskriti paths)", () => {
    const html = renderStory(undefined);
    expect(html).toContain("The Weave");
    expect(html).not.toContain("/ph/songoskriti");
  });

  it("songoskriti key keeps its craft art (gate must not blank the theme page)", () => {
    const html = renderStory("songoskriti");
    expect(html).toContain("The Weave");
    expect(html).toContain("/ph/songoskriti/hero_artisans_");
  });

  it("non-craft description renders null for every key (existing behavior)", () => {
    for (const key of ["songoskriti", "bazaar", null, undefined]) {
      const ui: ReactElement = (
        <LanguageProvider initialLang="en">
          <ProductCraftStory
            description="Plain cotton t-shirt, machine made."
            themeKey={key}
          />
        </LanguageProvider>
      );
      expect(renderToStaticMarkup(ui)).toBe("");
    }
  });

  it("source gates the brand art behind the songoskriti key", () => {
    const src = readFileSync("src/components/store/ProductView.tsx", "utf8");
    expect(src).toMatch(/themeKey === "songoskriti"|isSongoskriti/);
    expect(src).toContain("/ph/songoskriti/hero_artisans_");
  });
});
