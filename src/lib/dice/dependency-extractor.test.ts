import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  extractFileEdges,
  buildDependencyGraph,
  computeImpactClosure,
  ARCHITECTURAL_SURFACES,
} from "../../../scripts/extract-dependencies.mjs";

const FIXTURES_DIR = join(process.cwd(), "tests/fixtures/dice");

describe("DICE Multi-Surface Dependency Extractor (Revision 2.3 Section 5 & C3)", () => {
  describe("1. Multi-Surface Extraction Across 12 Architectural Surfaces", () => {
    it("extracts edges across all 12 declared architectural surfaces", () => {
      const surfaceFound = new Set();
      const fixtureFiles = readdirSync(FIXTURES_DIR);

      for (const f of fixtureFiles) {
        const fullPath = join(FIXTURES_DIR, f);
        const content = readFileSync(fullPath, "utf8");
        const edges = extractFileEdges(f, content);
        for (const e of edges) {
          surfaceFound.add(e.surface);
        }
      }

      for (const surface of ARCHITECTURAL_SURFACES) {
        expect(
          surfaceFound.has(surface),
          `Missing extraction teeth for declared architectural surface: ${surface}`
        ).toBe(true);
      }
    });

    it("extracts TypeScript import relationships", () => {
      const content = readFileSync(join(FIXTURES_DIR, "fixture-ts-mod.ts"), "utf8");
      const edges = extractFileEdges("fixture-ts-mod.ts", content);
      expect(edges.some((e) => e.target === "fixture-ts-dep.ts" && e.surface === "typescript_module")).toBe(true);
    });

    it("extracts PostgreSQL RLS policies", () => {
      const content = readFileSync(join(FIXTURES_DIR, "fixture-rls.sql"), "utf8");
      const edges = extractFileEdges("fixture-rls.sql", content);
      expect(edges.some((e) => e.surface === "rls_policy" && e.target.includes("tenant_isolation"))).toBe(true);
    });

    it("extracts dynamic route registrations", () => {
      const content = readFileSync(join(FIXTURES_DIR, "fixture-route.tsx"), "utf8");
      const edges = extractFileEdges("fixture-route.tsx", content);
      expect(edges.some((e) => e.surface === "dynamic_route" && e.target === "route:/store/$slug")).toBe(true);
    });
  });

  describe("2. Dual-Graph Traversal & Deleted Edge Re-verification", () => {
    it("proves deleted edge in G_base forces re-verification of historically dependent nodes", () => {
      // Base graph: Component A depends on Component B
      const baseFiles = {
        "comp-a.ts": "import { b } from \x27./comp-b\x27;",
        "comp-b.ts": "export const b = 1;",
      };
      const baseGraph = buildDependencyGraph(baseFiles);

      // Candidate graph: Edge deleted (comp-a refactored to remove comp-b import)
      const candFiles = {
        "comp-a.ts": "export const a = 2;", // import removed!
        "comp-b.ts": "export const b = 1;",
      };
      const candGraph = buildDependencyGraph(candFiles);

      // Candidate modified file is ONLY comp-a.ts
      const { impactedRoots, deletedEdges, impactClosure } = computeImpactClosure(
        ["comp-a.ts"],
        baseGraph,
        candGraph
      );

      // Deleted edge must be detected
      expect(deletedEdges.length).toBeGreaterThanOrEqual(1);

      // Even though comp-b.ts was NOT in the git diff, it MUST be included in impact closure
      expect(impactClosure).toContain("comp-b.ts");
      expect(impactClosure).toContain("comp-a.ts");
    });
  });

  describe("3. Conservative Escalation (Fail-Closed on Unparseable Files)", () => {
    it("escalates to fail-closed error if an unparseable or null file is encountered", () => {
      const corruptFiles = {
        "corrupt.ts": null,
      };

      expect(() => buildDependencyGraph(corruptFiles as any)).toThrow(
        /Unparseable file: corrupt.ts/
      );
    });
  });
});
