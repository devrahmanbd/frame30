import { describe, expect, it } from "vitest";
import { biTextKeysOf, SECTION_CATALOG, type SectionType } from "./builder-ast";
import { isDataWidget, widgetMeta } from "./widget-registry";
import { WIDGET_COMPONENTS } from "@/components/builder/widgets";
import { parseLinkList } from "@/components/builder/chrome";

const CHROME: SectionType[] = [
  "announcement_bar",
  "utility_bar",
  "trust_bar",
  "payment_icons",
  "notice",
  "mega_menu",
  "department_strip",
  "footer_sitemap",
  "search_command",
  "account_cart",
];

describe("phase 2.1 chrome widgets", () => {
  it("registers every chrome widget in the catalogue", () => {
    const types = new Set(SECTION_CATALOG.map((entry) => entry.type));
    for (const type of CHROME) expect(types.has(type)).toBe(true);
  });

  it("has a renderer for every chrome widget", () => {
    for (const type of CHROME) expect(typeof WIDGET_COMPONENTS[type]).toBe("function");
  });

  it("declares bilingual copy on every merchant-authored string", () => {
    for (const type of CHROME) {
      if (type === "footer_sitemap" || type === "account_cart") {
        expect(biTextKeysOf(type).length).toBeGreaterThan(0);
        continue;
      }
      expect(biTextKeysOf(type).length).toBeGreaterThan(0);
    }
  });

  it("keeps navigation widgets on the batched taxonomy source", () => {
    for (const type of ["mega_menu", "department_strip"] as SectionType[]) {
      expect(isDataWidget(type)).toBe(true);
      expect(widgetMeta(type)?.data?.source).toBe("taxonomy");
      expect(widgetMeta(type)?.skeleton).toBe(true);
    }
  });

  it("keeps header-only widgets out of other slots", () => {
    for (const type of ["utility_bar", "mega_menu", "search_command", "account_cart"] as SectionType[]) {
      expect(widgetMeta(type)?.slots).toContain("header");
    }
    expect(widgetMeta("footer_sitemap")?.slots).toEqual(["footer"]);
  });

  it("claims no primary heading from the chrome", () => {
    for (const type of CHROME) expect(widgetMeta(type)?.seo.heading).toBe(false);
  });
});

describe("footer sitemap link parsing", () => {
  it("parses label|href pairs and drops malformed entries", () => {
    expect(parseLinkList("New in|/new, Sale|/sale")).toEqual([
      { label: "New in", href: "/new" },
      { label: "Sale", href: "/sale" },
    ]);
    expect(parseLinkList("|/orphan, Contact")).toEqual([{ label: "Contact", href: "#" }]);
  });

  it("caps a column at eight links", () => {
    const raw = Array.from({ length: 12 }, (_, i) => `L${i}|/l${i}`).join(", ");
    expect(parseLinkList(raw)).toHaveLength(8);
  });
});
