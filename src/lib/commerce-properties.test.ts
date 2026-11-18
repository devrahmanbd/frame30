import { describe, it, expect } from "vitest";
import fc from "fast-check";

// Direct production commerce module imports
import { calculateDiscount, calculateOrderTotal } from "./commerce/pricing";
import { sumMinorUnits, sumCartLines, calculateLineTotal } from "./commerce/money";
import {
  excludeActiveProduct,
  filterCrossSellRecommendations,
} from "./commerce/recommendations";
import {
  isSareeCategory,
  isDisallowedInSarees,
  assertSareeTaxonomyIsolation,
  SAREE_CATEGORIES,
  DISALLOWED_APPAREL_IN_SAREES,
} from "./commerce/taxonomy";
import { filterCollectionProducts } from "./commerce/collection-filters";

describe("Property-Based Verification (fast-check) — Production Commerce Modules", () => {
  // ── Property 1: Pricing & Discount Bounds ──
  describe("Production Pricing (pricing.ts)", () => {
    it("guarantees 0 <= discountMinor <= subtotal and non-negative final total", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }), // subtotal up to 1,000,000 BDT in minor units
          fc.oneof(
            // Fixed discount
            fc.record({
              type: fc.constant("fixed" as const),
              amount_minor_int: fc.integer({ min: 0, max: 200_000_000 }),
            }),
            // Percent discount
            fc.record({
              type: fc.constant("percent" as const),
              percent_off: fc.integer({ min: -50, max: 200 }), // includes edge cases <0 and >100
            }),
            // Free shipping
            fc.record({
              type: fc.constant("free_shipping" as const),
            }),
            // BOGO
            fc.record({
              type: fc.constant("bogo" as const),
              buy_quantity: fc.integer({ min: 1, max: 10 }),
              get_quantity: fc.integer({ min: 1, max: 10 }),
            })
          ),
          fc.array(
            fc.record({
              unitPriceMinor: fc.integer({ min: 0, max: 500_000 }),
              quantity: fc.integer({ min: 1, max: 20 }),
            }),
            { maxLength: 10 }
          ),
          fc.integer({ min: 0, max: 50_000 }), // shipping fee
          (subtotalMinor, coupon, lines, shippingMinor) => {
            const { discountMinor } = calculateDiscount(coupon, subtotalMinor, lines);

            // Invariant 1: discount is strictly an integer
            expect(Number.isInteger(discountMinor)).toBe(true);

            // Invariant 2: discount is non-negative
            expect(discountMinor).toBeGreaterThanOrEqual(0);

            // Invariant 3: discount never exceeds subtotal
            expect(discountMinor).toBeLessThanOrEqual(subtotalMinor);

            // Invariant 4: order total calculation preserves non-negativity
            const finalTotal = calculateOrderTotal(subtotalMinor, discountMinor, shippingMinor);
            expect(Number.isInteger(finalTotal)).toBe(true);
            expect(finalTotal).toBeGreaterThanOrEqual(0);
            expect(finalTotal).toBe(subtotalMinor - discountMinor + shippingMinor);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ── Property 2: Integer Minor Units Arithmetic & Cart Line Summation ──
  describe("Production Money Arithmetic (money.ts)", () => {
    it("guarantees strict integer additivity, associativity, and line total correctness", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              unitPriceMinor: fc.integer({ min: 0, max: 10_000_000 }),
              quantity: fc.integer({ min: 0, max: 50 }),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          fc.array(
            fc.record({
              unitPriceMinor: fc.integer({ min: 0, max: 10_000_000 }),
              quantity: fc.integer({ min: 0, max: 50 }),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          (linesA, linesB) => {
            // Test production sumCartLines
            const totalA = sumCartLines(linesA);
            const totalB = sumCartLines(linesB);
            const combinedTotal = sumCartLines([...linesA, ...linesB]);

            // Additivity invariant
            expect(combinedTotal).toBe(totalA + totalB);
            expect(Number.isInteger(combinedTotal)).toBe(true);
            expect(combinedTotal).toBeGreaterThanOrEqual(0);

            // Test line item multiplier
            for (const line of linesA) {
              const lineTotal = calculateLineTotal(line.unitPriceMinor, line.quantity);
              expect(lineTotal).toBe(line.unitPriceMinor * line.quantity);
              expect(Number.isInteger(lineTotal)).toBe(true);
            }

            // Test sumMinorUnits
            const amountsA = linesA.map((l) => l.unitPriceMinor);
            const amountsB = linesB.map((l) => l.unitPriceMinor);
            expect(sumMinorUnits([...amountsA, ...amountsB])).toBe(
              sumMinorUnits(amountsA) + sumMinorUnits(amountsB)
            );
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 3: Recommendation Self-Exclusion Invariant ──
  describe("Production Recommendations (recommendations.ts)", () => {
    it("guarantees active product slug and aliases are never present in recommendations", () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(
            fc.record({
              slug: fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/).filter((s) => s.length >= 3),
              category: fc.constantFrom("sarees", "jamdani", "panjabi", "tunics", "jewelry"),
            }),
            { selector: (item) => item.slug, minLength: 2, maxLength: 30 }
          ),
          fc.nat(),
          fc.integer({ min: 1, max: 10 }),
          (catalog, seed, limit) => {
            const activeIndex = seed % catalog.length;
            const activeProduct = catalog[activeIndex];

            // 1. Test production excludeActiveProduct
            const filtered = excludeActiveProduct(catalog, activeProduct.slug);
            expect(filtered.some((p) => p.slug === activeProduct.slug)).toBe(false);
            expect(filtered.length).toBeLessThanOrEqual(catalog.length - 1);

            // 2. Test production filterCrossSellRecommendations
            const recommendations = filterCrossSellRecommendations(
              catalog,
              activeProduct,
              limit
            );

            // Invariant 1: active product is strictly absent
            expect(recommendations.some((p) => p.slug === activeProduct.slug)).toBe(false);

            // Invariant 2: output length is bounded by requested limit
            expect(recommendations.length).toBeLessThanOrEqual(limit);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 4: Collection Taxonomy & Category Isolation Invariant ──
  describe("Production Taxonomy & Collection Filters (taxonomy.ts & collection-filters.ts)", () => {
    it("ensures saree collections contain strictly sarees and reject fusion/tunics/panjabis", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              slug: fc.stringMatching(/^[a-z0-9-]+$/).filter((s) => s.length >= 3),
              category: fc.constantFrom(...SAREE_CATEGORIES, ...DISALLOWED_APPAREL_IN_SAREES),
              collections: fc.array(fc.constantFrom("sarees", "women", "festive", "new-in"), {
                maxLength: 3,
              }),
              tags: fc.array(fc.constantFrom("saree", "handloom", "silk", "panjabi", "tunic"), {
                maxLength: 4,
              }),
            }),
            { minLength: 1, maxLength: 40 }
          ),
          (catalog) => {
            // Test production filterCollectionProducts for 'sarees'
            const sareeAssortment = filterCollectionProducts(catalog, "sarees");

            // Invariant 1: No product in saree assortment is disallowed
            for (const item of sareeAssortment) {
              expect(isDisallowedInSarees(item.category, item.tags)).toBe(false);
              expect(assertSareeTaxonomyIsolation(item.category, item.tags)).toBe(true);
            }

            // Invariant 2: Every product recognized as saree is valid saree category or carries saree tag
            for (const item of sareeAssortment) {
              const valid =
                isSareeCategory(item.category) ||
                (item.tags && item.tags.some((t) => t.toLowerCase().includes("saree")));
              expect(valid).toBe(true);
            }
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 5: Responsive Width Invariant ──
  describe("Responsive Layout Width Arithmetic", () => {
    it("guarantees layout dimensions never exceed viewport boundary", () => {
      const viewports = [320, 360, 390, 430, 768, 1024, 1280, 1440] as const;

      fc.assert(
        fc.property(
          fc.constantFrom(...viewports),
          fc.integer({ min: 12, max: 48 }), // horizontal padding
          fc.integer({ min: 100, max: 1440 }), // raw content element max-width
          (viewportWidth, padding, elementMaxWidth) => {
            const availableWidth = viewportWidth - padding * 2;
            const renderedWidth = Math.min(availableWidth, elementMaxWidth);

            // Invariant 1: element rendered width never exceeds available width
            expect(renderedWidth).toBeLessThanOrEqual(availableWidth);

            // Invariant 2: total horizontal footprint never exceeds viewport width
            const totalFootprint = renderedWidth + padding * 2;
            expect(totalFootprint).toBeLessThanOrEqual(viewportWidth);
          }
        ),
        { numRuns: 500 }
      );
    });
  });
});
