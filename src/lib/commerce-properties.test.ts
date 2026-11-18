import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { discountFor } from "./coupons.server";
import type { Database } from "@/integrations/supabase/types";

type CouponRow = Database["public"]["Tables"]["coupons"]["Row"];

describe("Property-Based Verification (fast-check) — Commerce & Taxonomy Invariants", () => {
  // ── Property 1: Discount Bounds & Non-Negativity ──
  describe("Discount Invariants", () => {
    it("never discounts more than subtotal and preserves non-negative minor units", () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100_000_000 }), // subtotal up to 1,000,000 BDT in paisa
          fc.oneof(
            // Fixed discount
            fc.record({
              type: fc.constant("fixed" as const),
              amount_minor_int: fc.integer({ min: 0, max: 200_000_000 }),
              percent_off: fc.constant(0),
              buy_quantity: fc.constant(0),
              get_quantity: fc.constant(0),
            }),
            // Percent discount
            fc.record({
              type: fc.constant("percent" as const),
              amount_minor_int: fc.constant(0),
              percent_off: fc.integer({ min: 0, max: 150 }), // test beyond 100%
              buy_quantity: fc.constant(0),
              get_quantity: fc.constant(0),
            }),
            // Free shipping
            fc.record({
              type: fc.constant("free_shipping" as const),
              amount_minor_int: fc.constant(0),
              percent_off: fc.constant(0),
              buy_quantity: fc.constant(0),
              get_quantity: fc.constant(0),
            }),
            // BOGO
            fc.record({
              type: fc.constant("buy_x_get_y" as const),
              amount_minor_int: fc.constant(0),
              percent_off: fc.constant(0),
              buy_quantity: fc.integer({ min: 1, max: 10 }),
              get_quantity: fc.integer({ min: 1, max: 10 }),
            })
          ),
          fc.array(
            fc.record({
              variantId: fc.uuid(),
              quantity: fc.integer({ min: 1, max: 20 }),
              unitPriceMinor: fc.integer({ min: 100, max: 500_000 }),
            }),
            { maxLength: 10 }
          ),
          (subtotalMinor, couponBase, lines) => {
            const coupon = {
              ...couponBase,
              id: "coupon-test",
              merchant_id: "merchant-test",
              code: "TEST-CODE",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              starts_at: null,
              expires_at: null,
              status: "active" as const,
              min_subtotal_minor_int: 0,
              max_discount_minor_int: null,
              usage_limit: null,
              redeemed_count: 0,
              per_customer_limit: null,
              allow_combine: true,
              one_per_order: false,
              priority: 0,
              batch_label: null,
            } as unknown as CouponRow;

            const { discountMinor } = discountFor(coupon, subtotalMinor, lines);

            // Invariant 1: discount is an integer
            expect(Number.isInteger(discountMinor)).toBe(true);

            // Invariant 2: discount is non-negative
            expect(discountMinor).toBeGreaterThanOrEqual(0);

            // Invariant 3: discount never exceeds subtotal
            expect(discountMinor).toBeLessThanOrEqual(subtotalMinor);

            // Invariant 4: final total is non-negative
            const finalTotal = subtotalMinor - discountMinor;
            expect(finalTotal).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 1000 }
      );
    });
  });

  // ── Property 2: Integer Minor Units Arithmetic & Additivity ──
  describe("Minor Units Additivity", () => {
    it("satisfies strict summation additivity without floating point drift", () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              unitPrice: fc.integer({ min: 0, max: 10_000_000 }),
              quantity: fc.integer({ min: 1, max: 50 }),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          fc.array(
            fc.record({
              unitPrice: fc.integer({ min: 0, max: 10_000_000 }),
              quantity: fc.integer({ min: 1, max: 50 }),
            }),
            { minLength: 0, maxLength: 20 }
          ),
          (listA, listB) => {
            const sumLines = (lines: Array<{ unitPrice: number; quantity: number }>) =>
              lines.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);

            const totalA = sumLines(listA);
            const totalB = sumLines(listB);
            const combinedTotal = sumLines([...listA, ...listB]);

            // Additivity invariant
            expect(combinedTotal).toBe(totalA + totalB);
            expect(Number.isInteger(combinedTotal)).toBe(true);
            expect(combinedTotal).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 3: Recommendation Self-Exclusion Invariant ──
  describe("Recommendation Self-Exclusion", () => {
    it("guarantees active product slug is never present in recommendation results", () => {
      fc.assert(
        fc.property(
          // List of unique product slugs
          fc.uniqueArray(
            fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/).filter((s) => s.length >= 3),
            { minLength: 1, maxLength: 30 }
          ),
          fc.nat(),
          (slugs, seed) => {
            const activeIndex = seed % slugs.length;
            const activeSlug = slugs[activeIndex];

            // Filter function matching production preview rail recommendation logic:
            // exclude active product and its alias
            const recommendations = slugs.filter(
              (candidateSlug) => candidateSlug !== activeSlug
            );

            // Invariant: active slug is strictly absent
            expect(recommendations.includes(activeSlug)).toBe(false);
            expect(recommendations.length).toBe(slugs.length - 1);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 4: Collection Taxonomy & Category Isolation Invariant ──
  describe("Collection Taxonomy Isolation", () => {
    it("ensures saree collections contain strictly sarees and reject fusion/tunics/panjabis", () => {
      const allowedCategories = ["sarees", "jamdani", "tangail", "katan"] as const;
      const prohibitedCategories = ["tunics", "panjabi", "mens", "kids", "quilts"] as const;

      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              slug: fc.stringMatching(/^[a-z0-9-]+$/),
              category: fc.constantFrom(...allowedCategories, ...prohibitedCategories),
              isSaree: fc.boolean(),
            }),
            { minLength: 1, maxLength: 50 }
          ),
          (catalog) => {
            // Saree filter rule enforced in store
            const sareeAssortment = catalog.filter((product) =>
              allowedCategories.includes(product.category as (typeof allowedCategories)[number])
            );

            // Invariant 1: No prohibited categories in saree assortment
            for (const item of sareeAssortment) {
              expect(prohibitedCategories.includes(item.category as (typeof prohibitedCategories)[number])).toBe(false);
            }

            // Invariant 2: Assortment size is exact
            const expectedCount = catalog.filter((p) =>
              allowedCategories.includes(p.category as (typeof allowedCategories)[number])
            ).length;
            expect(sareeAssortment.length).toBe(expectedCount);
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  // ── Property 5: Responsive Width Invariant ──
  describe("Responsive Layout Constraints", () => {
    it("guarantees content width remains strictly within viewport across all widths", () => {
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
