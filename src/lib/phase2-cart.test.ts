/**
 * Phase 2.5 — cart / checkout / account widgets.
 *
 * The suite guards the one rule of this phase: no widget does money
 * arithmetic. Everything else here checks the wiring — catalogue entries,
 * bitext coverage, the order source and the drawer bus.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SECTION_CATALOG, BITEXT_FIELDS, type SectionType } from "./builder-ast";
import { WIDGET_REGISTRY } from "./widget-registry";
import { orderStageIndex } from "@/components/builder/cart";

const PHASE_25: SectionType[] = [
  "cart_lines",
  "cart_summary",
  "cart_drawer",
  "checkout_steps",
  "payment_methods",
  "order_tracker",
  "free_shipping_bar",
];

const CART_SRC = readFileSync("src/components/builder/cart.tsx", "utf8");

describe("phase 2.5 — catalogue wiring", () => {
  it("registers every widget in the catalogue and the registry", () => {
    for (const type of PHASE_25) {
      expect(SECTION_CATALOG.find((entry) => entry.type === type), `${type} catalogue`).toBeTruthy();
      expect(WIDGET_REGISTRY[type], `${type} registry`).toBeTruthy();
    }
  });

  it("ships bangla siblings for every shopper-visible string", () => {
    for (const type of PHASE_25) {
      expect(BITEXT_FIELDS[type]?.length, `${type} bitext`).toBeGreaterThan(0);
    }
  });

  it("exposes cart_summary as a real widget, not a host slot", () => {
    const entry = SECTION_CATALOG.find((e) => e.type === "cart_summary")!;
    expect(entry.group).toBe("commerce");
    expect(entry.fields.length).toBeGreaterThan(5);
    expect(readFileSync("src/components/builder/widgets.tsx", "utf8")).not.toContain(
      "cart_summary: ContextSlot",
    );
  });

  it("binds the order tracker to the order source", () => {
    expect(WIDGET_REGISTRY.order_tracker.data?.source).toBe("order");
  });
});

describe("phase 2.5 — no money arithmetic in widgets", () => {
  it("never adds, subtracts or multiplies a minor-unit value", () => {
    const offenders = CART_SRC.split("\n").filter((line) => {
      if (!/Minor\b/.test(line)) return false;
      // A bare read or a formatter call is fine; an operator on it is not.
      return /Minor\w*\s*[-+*/]\s*\w|\w\s*[-+*/]\s*\w*Minor/.test(line);
    });
    // The single permitted exception is the progress percentage, which is not money.
    expect(offenders.every((line) => line.includes("percent") || line.includes("threshold"))).toBe(true);
  });

  it("reads totals straight off the server quote", () => {
    for (const field of ["subtotalMinor", "shippingMinor", "vatMinor", "totalMinor"]) {
      expect(CART_SRC).toContain(`totals.${field}`);
    }
  });

  it("uses the server free-shipping remainder rather than deriving it", () => {
    expect(CART_SRC).toContain("totals.freeShippingRemainingMinor");
  });
});

describe("phase 2.5 — order stages", () => {
  it("maps order statuses onto the four shopper-facing stages", () => {
    expect(orderStageIndex("pending")).toBe(0);
    expect(orderStageIndex("confirmed")).toBe(1);
    expect(orderStageIndex("paid")).toBe(1);
    expect(orderStageIndex("shipped")).toBe(2);
    expect(orderStageIndex("in_transit")).toBe(2);
    expect(orderStageIndex("delivered")).toBe(3);
  });

  it("treats an unknown or missing status as freshly placed", () => {
    expect(orderStageIndex(undefined)).toBe(0);
    expect(orderStageIndex("something_new")).toBe(0);
  });
});

describe("phase 2.5 — payment rails", () => {
  it("renders only the methods the server returned", () => {
    expect(CART_SRC).toContain("groupMethods(cart.methods)");
    expect(CART_SRC).not.toMatch(/methods\s*=\s*\[/);
  });
});
