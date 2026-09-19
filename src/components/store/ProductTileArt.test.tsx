/**
 * Imageless product tiles.
 *
 * Demo catalogue products ship with `image_url NULL`; every product surface
 * must render a designed, deterministic tile instead of an empty grey box —
 * with no hotlinked photography and no invented product imagery.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ProductTileArt,
  TILE_BASE,
  TILE_VARIANTS,
  hashSeed,
  monogramOf,
  tileVariantFor,
} from "./ProductTileArt";
import { MediaFrame } from "@/components/builder/primitives/MediaFrame";
import { ProductCard } from "@/components/builder/primitives/ProductCard";
import { StoreImage } from "./StoreImage";

/** All 24 demo products from 20260919100000_rupaboti_demo_catalog.sql. */
const DEMO_PRODUCTS: { id: string; title: string }[] = [
  { id: "e0ba0000-0000-4000-8000-000000000401", title: "Rupaboti Night Repair Cream 50g" },
  { id: "e0ba0000-0000-4000-8000-000000000402", title: "GlowLab Vitamin C Serum 20% 30ml" },
  { id: "e0ba0000-0000-4000-8000-000000000403", title: "Herbal Roots Neem Face Wash 100ml" },
  { id: "e0ba0000-0000-4000-8000-000000000404", title: "SkinPure Hyaluronic Moisturizer 50ml" },
  { id: "e0ba0000-0000-4000-8000-000000000405", title: "BeautyVerse Rose Toner 120ml" },
  { id: "e0ba0000-0000-4000-8000-000000000406", title: "Rupaboti Body Butter Cream 200ml" },
  { id: "e0ba0000-0000-4000-8000-000000000407", title: "GlowLab Shea Body Lotion 250ml" },
  { id: "e0ba0000-0000-4000-8000-000000000408", title: "Herbal Roots Coffee Body Scrub 200g" },
  { id: "e0ba0000-0000-4000-8000-000000000409", title: "SkinPure Argan Shampoo 300ml" },
  { id: "e0ba0000-0000-4000-8000-000000000410", title: "Herbal Roots Onion Hair Oil 200ml" },
  { id: "e0ba0000-0000-4000-8000-000000000411", title: "BeautyVerse Matte Lipstick Set (6 shades)" },
  { id: "e0ba0000-0000-4000-8000-000000000412", title: "GlowLab HD Foundation - Porcelain 30ml" },
  { id: "e0ba0000-0000-4000-8000-000000000413", title: "Rupaboti Under-Eye Gel 15ml" },
  { id: "e0ba0000-0000-4000-8000-000000000414", title: "SkinPure Collagen Night Serum 30ml" },
  { id: "e0ba0000-0000-4000-8000-000000000415", title: "GlowLab Hyaluronic Acid Essence 100ml" },
  { id: "e0ba0000-0000-4000-8000-000000000416", title: "Rupaboti Vitamin C Brightening Cream 50g" },
  { id: "e0ba0000-0000-4000-8000-000000000417", title: "SkinPure Kojic Acid Soap Bar 100g" },
  { id: "e0ba0000-0000-4000-8000-000000000418", title: "Herbal Roots Acne Spot Gel 20g" },
  { id: "e0ba0000-0000-4000-8000-000000000419", title: "BeautyVerse Brightening Sheet Mask (5 pcs)" },
  { id: "e0ba0000-0000-4000-8000-000000000420", title: "GlowLab Dark Spot Corrector 30ml" },
  { id: "e0ba0000-0000-4000-8000-000000000421", title: "Rupaboti Dry Skin Rescue Balm 50g" },
  { id: "e0ba0000-0000-4000-8000-000000000422", title: "SkinPure Oil-Control Clay Mask 100g" },
  { id: "e0ba0000-0000-4000-8000-000000000423", title: "Rupaboti Bridal Glow Combo (5-step)" },
  { id: "e0ba0000-0000-4000-8000-000000000424", title: "GlowLab Skin + Makeup Festive Combo" },
];

const markup = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("tile helpers", () => {
  it("same seed always resolves to the same variant (no per-render randomness)", () => {
    for (const product of DEMO_PRODUCTS) {
      const first = tileVariantFor(product.id);
      expect(tileVariantFor(product.id)).toBe(first);
      expect(tileVariantFor(product.id)).toBe(hashSeed(product.id) % TILE_VARIANTS);
      expect(first).toBeGreaterThanOrEqual(0);
      expect(first).toBeLessThan(TILE_VARIANTS);
    }
  });

  it("null, undefined and empty seeds still resolve to a stable variant", () => {
    for (const seed of [null, undefined, ""]) {
      const variant = tileVariantFor(seed);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(TILE_VARIANTS);
      expect(tileVariantFor(seed)).toBe(variant);
    }
  });

  it("monograms take the first Latin letter, upper-cased", () => {
    expect(monogramOf("Rupaboti Night Repair Cream 50g")).toBe("R");
    expect(monogramOf("glowlab serum")).toBe("G");
    expect(monogramOf("  20% vitamin C")).toBe("2");
  });

  it("monograms fall back to R for null, empty and non-Latin titles", () => {
    expect(monogramOf(null)).toBe("R");
    expect(monogramOf(undefined)).toBe("R");
    expect(monogramOf("")).toBe("R");
    expect(monogramOf("রূপবতী")).toBe("R");
  });
});

describe("ProductTileArt", () => {
  it("renders the same markup for the same seed across renders", () => {
    const first = markup(<ProductTileArt seed="e0ba0000-0000-4000-8000-000000000401" title="Rupaboti Night Repair Cream 50g" />);
    const second = markup(<ProductTileArt seed="e0ba0000-0000-4000-8000-000000000401" title="Rupaboti Night Repair Cream 50g" />);
    expect(first).toBe(second);
  });

  it("is a designed tile, not a placeholder: no grey box, no broken-image icon, no 'no image' text", () => {
    const html = markup(<ProductTileArt seed="abc" title="GlowLab Serum" />);
    expect(html).toContain("data-tile-art");
    expect(html).toContain(`data-monogram="G"`);
    expect(html).toContain(TILE_BASE);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("bg-muted");
    expect(html.toLowerCase()).not.toContain("no image");
  });

  it("every demo product renders a tile with its own monogram", () => {
    expect(DEMO_PRODUCTS).toHaveLength(24);
    for (const product of DEMO_PRODUCTS) {
      const html = markup(<ProductTileArt seed={product.id} title={product.title} />);
      expect(html).toContain("data-tile-art");
      expect(html).toContain(`data-monogram="${monogramOf(product.title)}"`);
      expect(html).not.toContain("<img");
      expect(html).not.toContain("bg-muted");
    }
  });

  it("spreads demo products across motif variants (intentional variety, not one stamp)", () => {
    const seen = new Set(DEMO_PRODUCTS.map((p) => tileVariantFor(p.id)));
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});

describe("imageless product surfaces", () => {
  it("MediaFrame with artSeed renders a tile for null, undefined and empty src", () => {
    for (const src of [null, undefined, ""]) {
      const html = markup(
        <MediaFrame src={src} alt="GlowLab Serum" ratio="square" artSeed="product-1" />,
      );
      expect(html).toContain("aspect-square");
      expect(html).toContain("data-tile-art");
      expect(html).not.toContain("<img");
    }
  });

  it("MediaFrame without artSeed keeps the neutral placeholder (authored frames untouched)", () => {
    const html = markup(<MediaFrame src={null} alt="Kurta" ratio="square" />);
    expect(html).toContain("aspect-square");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data-tile-art");
  });

  it("ProductCard with a null image renders a tile, never a void", () => {
    const html = markup(
      <ProductCard
        row={{ id: "e0ba0000-0000-4000-8000-000000000402", title: "GlowLab Vitamin C Serum 20% 30ml", imageUrl: null }}
        locale="en"
      />,
    );
    expect(html).toContain("GlowLab Vitamin C Serum");
    expect(html).toContain("data-tile-art");
    expect(html).not.toContain("bg-muted");
  });

  it("StoreImage renders a tile when both image and fallback are missing", () => {
    const html = markup(
      <StoreImage image={null} fallbackSrc={null} alt="Rupaboti Balm" seed="product-9" className="size-full" />,
    );
    expect(html).toContain("data-tile-art");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("bg-muted");
  });

  it("StoreImage still renders an <img> when a fallback source exists", () => {
    const html = markup(
      <StoreImage
        image={null}
        fallbackSrc="https://example.com/serum.jpg"
        alt="Serum"
        seed="product-9"
        className="size-full"
      />,
    );
    expect(html).toContain("<img");
    expect(html).not.toContain("data-tile-art");
  });
});
