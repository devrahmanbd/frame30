import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  generateFrozenPlan,
  canonicalizeJson,
  computePlanHash,
  loadMandatoryObligations,
} from "../../../scripts/dice-plan-generator.mjs";

describe("DICE Frozen Plan Generator (Revision 2.3 Section 3.1 & Invariants)", () => {
  describe("Invariant 1: Non-Empty Mandatory Baseline", () => {
    it("loads at least 4 mandatory obligations from persistent store", () => {
      const mand = loadMandatoryObligations();
      expect(mand.length).toBeGreaterThanOrEqual(4);
      const ids = mand.map((m: any) => m.obligation_id);
      expect(ids).toContain("OBL-SYS-SCOPE-GUARD-001");
      expect(ids).toContain("OBL-SYS-DRIFT-GUARD-001");
      expect(ids).toContain("OBL-SYS-DIE-REGISTRY-001");
      expect(ids).toContain("OBL-SYS-SECRETS-SCAN-001");
    });

    it("ensures every compiled plan contains mandatory obligations even with zero extra changes", () => {
      const { plan } = generateFrozenPlan({
        selectedObligations: [],
      });
      expect(plan.obligations.mandatory.length).toBeGreaterThanOrEqual(4);
      expect(plan.obligations.selected).toEqual(
        expect.arrayContaining(plan.obligations.mandatory)
      );
      expect(plan.obligations.active).toEqual(
        expect.arrayContaining(plan.obligations.mandatory)
      );
    });
  });

  describe("Invariant 2 & 3: Waiver Boundaries and Superset", () => {
    it("strictly rejects any waiver attempt on mandatory system obligations (fail-closed)", () => {
      expect(() =>
        generateFrozenPlan({
          waivedObligations: ["OBL-SYS-SCOPE-GUARD-001"],
        })
      ).toThrow(/Invariant 3 violated - Mandatory obligation OBL-SYS-SCOPE-GUARD-001 cannot be waived/);
    });

    it("allows waiving non-mandatory domain obligations", () => {
      const customOb = "OBL-THEME-COLOR_PALETTE-001";
      const { plan } = generateFrozenPlan({
        selectedObligations: [customOb],
        waivedObligations: [customOb],
      });

      expect(plan.obligations.selected).toContain(customOb);
      expect(plan.obligations.waived).toContain(customOb);
      expect(plan.obligations.active).not.toContain(customOb);
    });
  });

  describe("RFC 8785 Canonical JSON & Hash Determinism", () => {
    it("produces identical SHA-256 digests across repeated compilations", () => {
      const input = {
        candidateCommit: "5d2e538552d7c5c7905266de57153065fac83060",
        candidateTree: "3fc7226b47369e804b9f17bd8051cb68207a6952",
        selectedObligations: ["OBL-CMS-CONTENT_LIFECYCLE-001"],
        compiledAt: "2026-11-24T12:00:00Z",
      };

      const res1 = generateFrozenPlan(input);
      const res2 = generateFrozenPlan(input);

      expect(res1.planHash).toBe(res2.planHash);
      expect(res1.planHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("canonicalizes object key ordering independently of insertion order", () => {
      const objA = { b: 2, a: 1, z: { d: 4, c: 3 } };
      const objB = { z: { c: 3, d: 4 }, a: 1, b: 2 };
      expect(canonicalizeJson(objA)).toBe(canonicalizeJson(objB));
      expect(computePlanHash(objA)).toBe(computePlanHash(objB));
    });
  });

  describe("Property Testing (Partition Property & Non-Vacuity)", () => {
    it("property: partition property holds across randomized obligation sets", () => {
      fc.assert(
        fc.property(
          fc.array(fc.stringMatching(/^OBL-TEST-[A-Z0-9_]+-[0-9]{3}$/), {
            maxLength: 20,
          }),
          (randomObs) => {
            const { plan } = generateFrozenPlan({
              selectedObligations: randomObs,
            });

            const sel = new Set(plan.obligations.selected);
            const act = new Set(plan.obligations.active);
            const waived = new Set(plan.obligations.waived);

            // Active union Waived == Selected
            const union = new Set([...act, ...waived]);
            expect(union).toEqual(sel);

            // Active intersect Waived == Empty
            const intersection = [...act].filter((x) => waived.has(x));
            expect(intersection).toEqual([]);

            // Selected must contain all mandatory
            for (const m of plan.obligations.mandatory) {
              expect(sel.has(m)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
