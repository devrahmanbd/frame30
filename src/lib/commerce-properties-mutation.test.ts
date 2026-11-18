import { describe, it, expect } from "vitest";
import fc from "fast-check";

describe("Mutation Proof: fast-check Counterexample Shrinking Demonstration", () => {
  it("proves fast-check immediately catches and shrinks an unconstrained discount defect", () => {
    // Defective implementation: discount allows up to 150% without subtotal clamp
    const defectiveDiscount = (subtotal: number, percent: number) => {
      return Math.floor((subtotal * percent) / 100);
    };

    let caughtError: Error | null = null;
    try {
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 10000 }),
          fc.integer({ min: 101, max: 200 }), // buggy percentages > 100%
          (subtotal, percent) => {
            const discount = defectiveDiscount(subtotal, percent);
            // Invariant that should catch the bug:
            expect(discount).toBeLessThanOrEqual(subtotal);
          }
        ),
        { numRuns: 100 }
      );
    } catch (err: any) {
      caughtError = err;
    }

    // Proves that fast-check caught the invariant violation and shrunk to minimal counterexample
    expect(caughtError).not.toBeNull();
    expect(caughtError?.message).toContain("Property failed after");
    expect(caughtError?.message).toContain("Shrunk");
    console.log("[fast-check mutation proof] Defect caught and shrunk successfully:\n", caughtError?.message.slice(0, 300));
  });

  it("proves fast-check catches a self-recommendation defect", () => {
    // Defective implementation: forgot to filter out activeSlug
    const defectiveRecommend = (catalog: string[], _activeSlug: string) => {
      return catalog.slice(0, 4); // bugs: doesn't exclude active
    };

    let caughtError: Error | null = null;
    try {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^[a-z0-9-]+$/), { minLength: 2, maxLength: 10 }),
          (catalog) => {
            const active = catalog[0];
            const recs = defectiveRecommend(catalog, active);
            // Invariant: active product is never recommended
            expect(recs.includes(active)).toBe(false);
          }
        )
      );
    } catch (err: any) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    console.log("[fast-check mutation proof] Self-recommendation defect caught and shrunk:\n", caughtError?.message.slice(0, 300));
  });
});
