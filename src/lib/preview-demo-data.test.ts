/**
 * previewDemoMap collection/category filtering — TDD: category slugs resolve
 * to category-filtered rows (not the new-in fallback), unknown slugs fall
 * back to the base rows.
 */
import { describe, expect, it } from "vitest";
import { newSection } from "./builder-ast";
import { collectWidgetRequests } from "./widget-data";
import { previewDemoMap } from "./preview-demo-data";

function rowsFor(collection: string, theme = "songoskriti") {
  const section = {
    ...newSection("product_rail"),
    props: { source: "collection", collection, limit: 24 },
  };
  const bundle = collectWidgetRequests({
    header: [],
    main: [section],
    footer: [],
  } as never);
  const map = previewDemoMap(bundle, theme);
  const key = bundle.byNode[section.id]!;
  return map[key] ?? [];
}

describe("previewDemoMap collection filtering", () => {
  it("resolves a category slug to category-filtered rows", () => {
    const rows = rowsFor("women");
    expect(rows.length).toBeGreaterThan(0);
    // every row's product belongs to the women category (songoskriti has no
    // `women` collection, so a collection-only filter would fall back to base)
    expect(
      rows.every((r) => r.subtitle === "women" || r.id.includes("women")),
    ).toBe(true);
  });

  it("resolves girls and boys to distinct non-overlapping assortments", () => {
    const girlsRows = rowsFor("girls");
    const boysRows = rowsFor("boys");
    const kidsRows = rowsFor("kids");

    expect(girlsRows.length).toBeGreaterThan(0);
    expect(boysRows.length).toBeGreaterThan(0);
    expect(kidsRows.length).toBeGreaterThanOrEqual(girlsRows.length + boysRows.length);

    // Girls contains girls ghagra choli, no panjabi or sarees
    expect(girlsRows.map((r) => r.id)).toContain("girls-silk-festive-ghagra-choli");
    expect(girlsRows.map((r) => r.id)).not.toContain("boys-silk-panjabi-pajama-set");
    expect(girlsRows.map((r) => r.id)).not.toContain("muslin-floral-festive-saree");
    expect(girlsRows.map((r) => r.id)).not.toContain("taaga-contemporary-linen-tunic");

    // Boys contains boys panjabi, no ghagra choli or sarees
    expect(boysRows.map((r) => r.id)).toContain("boys-silk-panjabi-pajama-set");
    expect(boysRows.map((r) => r.id)).not.toContain("girls-silk-festive-ghagra-choli");
    expect(boysRows.map((r) => r.id)).not.toContain("muslin-floral-festive-saree");
    expect(boysRows.map((r) => r.id)).not.toContain("taaga-man-relaxed-khadi-shirt");
  });

  it("filters out excluded product from recommendation rails", () => {
    const section = {
      ...newSection("product_rail"),
      props: {
        source: "collection",
        collection: "sarees",
        exclude: "dhakai-jamdani-heritage-saree",
        limit: 24,
      },
    };
    const bundle = collectWidgetRequests({
      header: [],
      main: [section],
      footer: [],
    } as never);
    const map = previewDemoMap(bundle, "songoskriti");
    const rows = map[bundle.byNode[section.id]!] ?? [];

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.id)).not.toContain("dhakai-jamdani-heritage-saree");
  });

  it("resolves sarees More to explore to exclusively authentic sarees, rejecting all other categories", () => {
    const rows = rowsFor("sarees");
    const ids = rows.map((r) => r.id);

    // Allowed:
    expect(ids).toContain("dhakai-jamdani-heritage-saree");
    expect(ids).toContain("muslin-floral-festive-saree");
    expect(ids).toContain("tangail-handloom-cotton-saree");

    // Rejected:
    expect(ids).not.toContain("taaga-contemporary-linen-tunic");
    expect(ids).not.toContain("taaga-man-relaxed-khadi-shirt");
    expect(ids).not.toContain("rajshahi-silk-festive-panjabi");
    expect(ids).not.toContain("comilla-handspun-khadi-kurta");
    expect(ids).not.toContain("handcrafted-nakshi-kantha-quilt");
    expect(ids).not.toContain("dhamrai-brass-necklace");
    expect(ids).not.toContain("rongpur-silver-filigree-earrings");
    expect(ids).not.toContain("girls-silk-festive-ghagra-choli");
    expect(ids).not.toContain("boys-silk-panjabi-pajama-set");
  });

  it("applies demo focus on /c/sarees such that More to explore is mapped to sarees, not womens", async () => {
    const { applyDemoFocus, resolveDemoFocus } = await import("./theme-preview-nav");
    const focus = resolveDemoFocus("songoskriti", "collection", "sarees");
    expect(focus).not.toBeNull();
    const authoredGrid = {
      ...newSection("product_grid"),
      props: { source: "collection", collection: "new-in", heading: "New Arrivals" },
    };
    const authoredSecondaryRail = {
      ...newSection("product_rail"),
      props: { source: "collection", collection: "festive", heading: "More to explore" },
    };
    const focused = applyDemoFocus([authoredGrid, authoredSecondaryRail], focus!);
    expect(focused[1].props["collection"]).toBe("sarees");
    expect(focused[1].props["collection"]).not.toBe("womens");

    // Resolving requests for focused[1] yields strictly sarees
    const bundle = collectWidgetRequests({
      header: [],
      main: [focused[1]],
      footer: [],
    } as never);
    const map = previewDemoMap(bundle, "songoskriti");
    const recRows = map[bundle.byNode[focused[1].id]!] ?? [];
    const recIds = recRows.map((r) => r.id);
    expect(recIds).toContain("dhakai-jamdani-heritage-saree");
    expect(recIds).not.toContain("taaga-contemporary-linen-tunic");
  });

  it("renames secondary rail to More Children's Wear for girls and boys collections", async () => {
    const { applyDemoFocus, resolveDemoFocus } = await import("./theme-preview-nav");
    const girlsFocus = resolveDemoFocus("songoskriti", "collection", "girls");
    const authoredGrid = {
      ...newSection("product_grid"),
      props: { source: "collection", collection: "new-in", heading: "New Arrivals" },
    };
    const authoredSecondaryRail = {
      ...newSection("product_rail"),
      props: { source: "collection", collection: "festive", heading: "More to explore" },
    };
    const focused = applyDemoFocus([authoredGrid, authoredSecondaryRail], girlsFocus!);
    expect(focused[0].props["heading"]).toBe("Girls Festive Wear");
    expect(focused[1].props["heading"]).toBe("More Children's Wear");
    expect(focused[1].props["collection"]).toBe("kids");
  });
});
