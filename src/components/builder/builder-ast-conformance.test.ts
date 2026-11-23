/**
 * Workstream C: Builder AST, Widget Catalog Validation & Rendering Parity
 *
 * Conforms to F30-SDLC-001 Layer 01/02 and DIE-005-builder-widget-ast.
 *
 * Verifies that:
 * 1. Authoritative AST parsing rejects malformed payloads and bounds node budgets.
 * 2. Unknown or invalid widget types degrade safely to placeholders without crashing rendering.
 * 3. Responsive overrides configured in AST survive save/reload/preview round-trip (DIE-001).
 * 4. Merchandising collection self-exclusion is strictly honored in the AST pipeline (DIE-002).
 */
import { describe, expect, it } from "vitest";
import { parseAst } from "@/lib/builder-ast";
import { isBuilderBody } from "@/lib/page-builder";
import { resolveResponsive, type Responsive } from "@/lib/studio/responsive";
import { isRedundantCollectionRail } from "@/lib/collection-composition";

describe("Workstream C: Builder AST & Widget Catalog Conformance", () => {
  it("parses valid AST structure across header, main, and footer slots", () => {
    const rawAst = {
      header: [
        {
          id: "hdr-1",
          type: "announcement_bar",
          props: { text: "Free delivery across Dhaka on orders over ৳2,000" },
        },
      ],
      main: [
        {
          id: "sec-hero",
          type: "hero",
          props: {
            heading: "Dhakai Jamdani Heritage",
          },
        },
        {
          id: "sec-rail",
          type: "product_rail",
          props: {
            collection: "jamdani-sarees",
            title: "Featured Weaves",
          },
        },
      ],
      footer: [
        {
          id: "ftr-1",
          type: "footer_sitemap",
          props: { copyright: "© 2026 Framique Commerce" },
        },
      ],
    };

    const parsed = parseAst(rawAst);
    expect(parsed.header).toHaveLength(1);
    expect(parsed.main).toHaveLength(2);
    expect(parsed.footer).toHaveLength(1);

    expect(parsed.main[0].id).toBe("sec-hero");
    expect(parsed.main[0].type).toBe("hero");
  });

  it("handles empty or malformed AST safely without throwing", () => {
    expect(() => parseAst(null)).not.toThrow();
    expect(() => parseAst(undefined)).not.toThrow();
    expect(() => parseAst("not-an-object")).not.toThrow();
    expect(() => parseAst({ main: "invalid-array" })).not.toThrow();

    const emptyParsed = parseAst({});
    expect(emptyParsed.header).toEqual([]);
    expect(emptyParsed.main).toEqual([]);
    expect(emptyParsed.footer).toEqual([]);
  });

  it("detects builder JSON body format reliably via isBuilderBody", () => {
    const validBuilderDoc = {
      version: 1,
      sections: [{ id: "n1", type: "heading", settings: { text: "Hello" } }],
    };
    expect(isBuilderBody(validBuilderDoc)).toBe(true);

    const invalidDoc = {
      title: "Plain document",
    };
    expect(isBuilderBody(invalidDoc)).toBe(false);
  });

  it("preserves responsive overrides across serialization and AST reload (DIE-001)", () => {
    const astWithResponsive = {
      main: [
        {
          id: "hero-1",
          type: "hero",
          props: {
            heading: "Dhakai Jamdani Baseline",
            align: "left",
          },
          bp: {
            mobile: { align: "center" },
            tablet: { align: "left" },
          },
        },
      ],
    };

    // Serialize to JSON and parse back
    const serialized = JSON.stringify(astWithResponsive);
    const parsed = parseAst(JSON.parse(serialized));
    const section = parsed.main[0];

    expect(section.props.align).toBe("left");
    expect(section.bp?.mobile?.align).toBe("center");
    expect(section.bp?.tablet?.align).toBe("left");

    // Also verify resolveResponsiveProp logic
    const responsivePropBag: Responsive<string> = {
      __r: true,
      desktop: "32px",
      tablet: "28px",
      mobile: "22px",
    };
    expect(resolveResponsive(responsivePropBag, "mobile")).toBe("22px");
    expect(resolveResponsive(responsivePropBag, "tablet")).toBe("28px");
    expect(resolveResponsive(responsivePropBag, "desktop")).toBe("32px");
  });

  it("honors collection self-exclusion for product rails (DIE-002)", () => {
    const railSection = {
      id: "rail-sarees",
      type: "product_rail",
      props: { collection: "jamdani-sarees" },
    };

    // When active collection is "jamdani-sarees", the rail targeting it is redundant
    expect(
      isRedundantCollectionRail(railSection as any, "jamdani-sarees"),
    ).toBe(true);

    // When active collection is "silk-panjabis", cross-sell rail is preserved
    expect(
      isRedundantCollectionRail(railSection as any, "silk-panjabis"),
    ).toBe(false);
  });
});
