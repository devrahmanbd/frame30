import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BITEXT_FIELDS, SECTION_CATALOG, catalogEntry, type SectionType } from "./builder-ast";
import { WIDGET_REGISTRY, isDataWidget } from "./widget-registry";
import { clampPercent } from "@/components/builder/primitives/Hotspot";
import { convertCm } from "@/components/builder/primitives/UnitToggle";
import { sizeRows } from "@/components/builder/apparel";
import type { WidgetRow } from "./widget-data";

const ATELIER: SectionType[] = [
  "editorial_hero",
  "lookbook",
  "shoppable_image",
  "split_feature",
  "collection_story",
  "ugc_gallery",
  "social_strip",
  "store_locator",
  "size_selector",
  "size_guide",
  "fit_note",
  "back_in_stock",
  "care_panel",
  "sustain_badge",
  "complete_the_look",
  "wishlist_button",
];

const SRC = readFileSync("src/components/builder/apparel.tsx", "utf8");

describe("phase 2.6 — catalogue wiring", () => {
  it("registers every Atelier widget in the catalogue and the registry", () => {
    for (const type of ATELIER) {
      expect(catalogEntry(type), type).toBeDefined();
      expect(WIDGET_REGISTRY[type], type).toBeDefined();
    }
  });

  it("gives each data-bound Atelier widget a source and a skeleton", () => {
    for (const type of ["shoppable_image", "ugc_gallery", "complete_the_look", "size_selector", "back_in_stock"] as SectionType[]) {
      expect(isDataWidget(type), type).toBe(true);
      expect(WIDGET_REGISTRY[type].skeleton, type).toBe(true);
    }
  });

  it("marks bilingual copy props on every Atelier widget that shows prose", () => {
    for (const type of ATELIER) {
      const keys = BITEXT_FIELDS[type];
      expect(keys, type).toBeDefined();
      const fields = new Set(catalogEntry(type)!.fields.map((f) => f.key));
      for (const key of keys!) expect(fields.has(key), `${type}.${key}`).toBe(true);
    }
  });

  it("defaults every catalogue field so a freshly dropped widget renders", () => {
    for (const type of ATELIER) {
      const entry = SECTION_CATALOG.find((e) => e.type === type)!;
      for (const field of entry.fields) {
        expect(Object.hasOwn(entry.defaults, field.key), `${type}.${field.key}`).toBe(true);
      }
    }
  });

  it("keeps the marquee upgrade — pause on hover is an inspector control", () => {
    const marquee = catalogEntry("marquee")!;
    expect(marquee.fields.some((f) => f.key === "pauseOnHover")).toBe(true);
    expect(marquee.defaults["pauseOnHover"]).toBe(true);
  });
});

describe("phase 2.6 — hotspot geometry", () => {
  it("clamps pins inside the frame", () => {
    expect(clampPercent(-40)).toBe(4);
    expect(clampPercent(140)).toBe(96);
    expect(clampPercent(50)).toBe(50);
  });

  it("falls back to the centre for a non-numeric coordinate", () => {
    expect(clampPercent(Number.NaN)).toBe(50);
  });
});

describe("phase 2.6 — size guide units", () => {
  it("passes centimetres through and converts to inches", () => {
    expect(convertCm(100, "cm")).toBe(100);
    expect(convertCm(2.54, "in")).toBe(1);
    expect(convertCm(100, "in")).toBe(39.4);
  });
});

describe("phase 2.6 — size rows", () => {
  const rows: WidgetRow[] = [
    { id: "a", title: "Tee", options: "S", inStock: true },
    { id: "b", title: "Tee", options: "M", inStock: false },
    { id: "c", title: "", options: "   " },
  ];

  it("keeps only variants that carry a label", () => {
    expect(sizeRows(rows).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("tolerates a missing batch", () => {
    expect(sizeRows(undefined)).toEqual([]);
  });
});

describe("phase 2.6 — theme independence and money discipline", () => {
  it("imports no theme module", () => {
    const imports = [...SRC.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
    expect(imports.filter((s) => /theme|preset|bazaar|atelier|circuit|rupaboti/i.test(s))).toEqual([]);
  });

  it("does no client-side money arithmetic", () => {
    expect(SRC).not.toMatch(/Minor\s*[*/+-]\s*/);
    expect(SRC).not.toMatch(/[*/+-]\s*\w*Minor\b/);
  });

  it("uses tokens, never raw colour", () => {
    expect(SRC.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});
