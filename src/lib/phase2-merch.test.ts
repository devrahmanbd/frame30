import { describe, expect, it } from "vitest";
import { biTextKeysOf, SECTION_CATALOG, catalogEntry, type Section, type SectionType } from "./builder-ast";
import { collectWidgetRequests } from "./widget-data";
import { resolveWidgetData, type SourceLoaders } from "./widget-data.server";
import { widgetMeta } from "./widget-registry";
import { WIDGET_COMPONENTS } from "@/components/builder/widgets";
import { cardVariantOf } from "@/components/builder/merch";
import { savePercent } from "@/components/builder/primitives/ProductCard";

const MERCH: SectionType[] = [
  "product_rail",
  "deal_card",
  "deal_strip",
  "sponsored_slot",
  "brand_strip",
  "brand_rail",
  "compare_table",
  "rank_list",
];

const DATA_BOUND = MERCH.filter((type) => type !== "deal_card");

function node(type: SectionType, id: string): Section {
  const entry = catalogEntry(type);
  return { id, type, props: { ...(entry?.defaults ?? {}) } };
}

describe("phase 2.2 merchandising widgets", () => {
  it("has a catalogue entry, registry entry and renderer for every type", () => {
    const types = new Set(SECTION_CATALOG.map((entry) => entry.type));
    for (const type of MERCH) {
      expect(types.has(type)).toBe(true);
      expect(widgetMeta(type)).toBeTruthy();
      expect(typeof WIDGET_COMPONENTS[type]).toBe("function");
    }
  });

  it("declares a skeleton on every data-bound merchandising widget", () => {
    for (const type of DATA_BOUND) {
      expect(widgetMeta(type)?.data).toBeTruthy();
      expect(widgetMeta(type)?.skeleton).toBe(true);
    }
  });

  it("claims no primary heading", () => {
    for (const type of MERCH) expect(widgetMeta(type)?.seo.heading).toBe(false);
  });

  it("declares ItemList structured data on the list surfaces", () => {
    for (const type of ["product_rail", "deal_strip", "rank_list", "brand_rail"] as SectionType[]) {
      expect(widgetMeta(type)?.seo.jsonLd).toBe("ItemList");
    }
  });

  it("gives every merchant-authored string a বাংলা sibling", () => {
    for (const type of MERCH) expect(biTextKeysOf(type).length).toBeGreaterThan(0);
  });

  it("resolves a whole merchandising template in one call per source", async () => {
    const sections = MERCH.map((type, index) => node(type, `n${index}`));
    const bundle = collectWidgetRequests(sections);
    const calls: string[] = [];
    const loaders: SourceLoaders = {
      collection: async (_m, requests) => {
        calls.push("collection");
        return Object.fromEntries(requests.map((r) => [r.key, []]));
      },
      taxonomy: async (_m, requests) => {
        calls.push("taxonomy");
        return Object.fromEntries(requests.map((r) => [r.key, []]));
      },
      recommendation: async (_m, requests) => {
        calls.push("recommendation");
        return Object.fromEntries(requests.map((r) => [r.key, []]));
      },
    };
    await resolveWidgetData("merchant", bundle, loaders);
    expect(calls.filter((c) => c === "collection")).toHaveLength(1);
    expect(calls.filter((c) => c === "taxonomy")).toHaveLength(1);
  });

  it("collapses two identical rails into one request", () => {
    const bundle = collectWidgetRequests([node("product_rail", "a"), node("product_rail", "b")]);
    expect(bundle.requests).toHaveLength(1);
    expect(bundle.byNode["a"]).toBe(bundle.byNode["b"]);
  });

  it("routes brand widgets at the brand taxonomy", () => {
    for (const type of ["brand_strip", "brand_rail"] as SectionType[]) {
      expect(widgetMeta(type)?.data?.source).toBe("taxonomy");
      expect(catalogEntry(type)?.defaults["kind"]).toBe("brand");
    }
  });
});

describe("shared product card", () => {
  it("derives the saving from server-valued minor units only", () => {
    expect(savePercent(8000, 10000)).toBe(20);
    expect(savePercent(10000, 10000)).toBeNull();
    expect(savePercent(10000, undefined)).toBeNull();
  });

  it("falls back to a known card variant", () => {
    expect(cardVariantOf("editorial")).toBe("editorial");
    expect(cardVariantOf("nonsense")).toBe("standard");
    expect(cardVariantOf("", "compact")).toBe("compact");
  });
});
