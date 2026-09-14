import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTION_CATALOG, BITEXT_FIELDS } from "@/lib/builder-ast";
import { WIDGET_REGISTRY } from "@/lib/widget-registry";
import { emiPlan, EMI_TENURES, isEmiTenure } from "@/lib/emi";
import { sparklinePath, authoredSpecs, resolvedSpecs } from "@/components/builder/electronics";
import { groupSpecs } from "@/components/builder/primitives/SpecRow";

const CIRCUIT_TYPES = [
  "spec_highlights",
  "compare_tray",
  "warranty_panel",
  "authenticity_badge",
  "emi_calculator",
  "price_sparkline",
  "bundle_builder",
  "doc_links",
  "support_strip",
  "buying_guide",
  "trade_in",
] as const;

const SRC = readFileSync("src/components/builder/electronics.tsx", "utf8");

describe("phase 2.7 — circuit catalogue wiring", () => {
  it("registers every new widget in the catalogue and the registry", () => {
    for (const type of CIRCUIT_TYPES) {
      expect(SECTION_CATALOG.some((entry) => entry.type === type), `${type} catalogue`).toBe(true);
      expect(WIDGET_REGISTRY[type], `${type} registry`).toBeTruthy();
    }
  });

  it("ships Bangla bitext for every new widget", () => {
    for (const type of CIRCUIT_TYPES) {
      expect(BITEXT_FIELDS[type]?.length, `${type} bitext`).toBeGreaterThan(0);
    }
  });

  it("keeps spec_table upgraded with grouped rows 5 and 6", () => {
    const entry = SECTION_CATALOG.find((e) => e.type === "spec_table")!;
    const keys = Object.keys(entry.defaults ?? {});
    expect(keys).toEqual(expect.arrayContaining(["r5Label", "r6Label", "grouped"]));
  });
});

describe("phase 2.7 — no client-side money arithmetic", () => {
  it("never adds, subtracts or multiplies inside the renderer module", () => {
    const offenders = SRC.split("\n")
      .map((line) => line.trim())
      .filter((line) => !line.startsWith("*") && !line.startsWith("//") && !line.startsWith("/*"))
      .filter((line) => /(?:Minor|price|total|amount)\w*\s*[-+*/]\s*\w/i.test(line));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("prints money only through the ctx formatter", () => {
    expect(SRC).not.toMatch(/toFixed\(/);
    expect(SRC).toMatch(/money\(/);
  });
});

describe("phase 2.7 — emi maths (server-side helper)", () => {
  it("computes a flat-rate instalment in integer minor units", () => {
    const plan = emiPlan(120_000_00, 12, 1000, "City Bank");
    expect(plan).not.toBeNull();
    expect(Number.isInteger(plan!.perMonthMinor)).toBe(true);
    expect(plan!.totalMinor).toBeGreaterThanOrEqual(120_000_00);
    expect(plan!.tenureMonths).toBe(12);
  });

  it("rejects nonsense principals and tenures", () => {
    expect(emiPlan(0, 12, 1000)).toBeNull();
    expect(emiPlan(10_000, 0, 1000)).toBeNull();
    expect(emiPlan(10_000, 7, 1000)).toBeNull();
  });

  it("exposes the supported tenures as a closed set", () => {
    expect([...EMI_TENURES]).toEqual([3, 6, 9, 12]);
    expect(isEmiTenure(6)).toBe(true);
    expect(isEmiTenure(5)).toBe(false);
  });
});

describe("phase 2.7 — spec grouping and sparkline", () => {
  it("prefers resolved rows and keeps group order stable", () => {
    const rows = resolvedSpecs([
      { id: "a", title: "Chipset", valueText: "A17", group: "Performance" } as never,
      { id: "b", title: "RAM", valueText: "8", unit: "GB", group: "Performance" } as never,
      { id: "c", title: "Weight", valueText: "187", unit: "g", group: "Body" } as never,
    ]);
    const groups = groupSpecs(rows);
    expect(groups.map((g) => g.group)).toEqual(["Performance", "Body"]);
    expect(groups[0]!.rows).toHaveLength(2);
  });

  it("reads authored rows and drops unlabelled ones", () => {
    const values: Record<string, string> = {
      r1Label: "Display",
      r1Value: "6.1 inch",
      r2Label: "",
      r3Label: "Battery",
      r3Value: "3349 mAh",
      r3Group: "Power",
    };
    const pairs = authoredSpecs((key) => values[key] ?? "");
    expect(pairs.map((p) => p.label)).toEqual(["Display", "Battery"]);
    expect(pairs[1]!.group).toBe("Power");
  });

  it("draws a sparkline only when there are at least two points", () => {
    expect(sparklinePath([100])).toBe("");
    const path = sparklinePath([100, 50, 75]);
    expect(path.startsWith("M0,")).toBe(true);
    expect(path.split("L")).toHaveLength(3);
  });
});
