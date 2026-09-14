import { describe, expect, it } from "vitest";
import {
  adjustPrice,
  availabilityView,
  canSendDraft,
  chargeKey,
  draftTotals,
  dunningPlan,
  ean13,
  isValidEan13,
  netTermsDueAt,
  nextPeriodEnd,
  normaliseTags,
  receivingProgress,
  resolvePrice,
  skuPrefix,
  validateBulkRows,
} from "./commerce-desk";

const ID = "11111111-2222-3333-4444-555555555555";

describe("barcodes and SKUs", () => {
  it("produces valid EAN-13 codes", () => {
    const code = ean13(1234);
    expect(code).toHaveLength(13);
    expect(isValidEan13(code)).toBe(true);
  });

  it("rejects a corrupted check digit", () => {
    const code = ean13(99);
    const broken = code.slice(0, 12) + String((Number(code[12]) + 1) % 10);
    expect(isValidEan13(broken)).toBe(false);
  });

  it("derives a readable prefix", () => {
    expect(skuPrefix("Blue Cotton", "Tee")).toBe("BLU-COT");
    expect(skuPrefix("", null)).toBe("SKU");
  });
});

describe("availability", () => {
  it("is truthful about stock", () => {
    expect(availabilityView({ stock: 40, policy: "deny" }).label).toBe("In stock");
    expect(availabilityView({ stock: 3, policy: "deny" }).tone).toBe("warn");
  });

  it("blocks when backorders are off", () => {
    expect(availabilityView({ stock: 0, policy: "deny" }).allowed).toBe(false);
  });

  it("allows a pre-order and marks it deferred", () => {
    const v = availabilityView({ stock: 0, policy: "preorder", releaseAt: "2026-09-01" });
    expect(v.allowed).toBe(true);
    expect(v.deferred).toBe(true);
    expect(v.label).toContain("Pre-order");
  });

  it("respects the backorder cap", () => {
    expect(availabilityView({ stock: 0, quantity: 9, policy: "allow", limit: 5 }).allowed).toBe(false);
    expect(availabilityView({ stock: 0, quantity: 4, policy: "allow", limit: 5 }).allowed).toBe(true);
  });
});

describe("B2B pricing", () => {
  it("prefers the largest matching quantity break", () => {
    const breaks = [
      { minQuantity: 1, priceMinor: 1000 },
      { minQuantity: 10, priceMinor: 800 },
      { minQuantity: 50, priceMinor: 600 },
    ];
    expect(resolvePrice({ baseMinor: 1200, quantity: 12, breaks })).toBe(800);
    expect(resolvePrice({ baseMinor: 1200, quantity: 100, breaks })).toBe(600);
  });

  it("falls back to a list percentage, then the catalogue price", () => {
    expect(resolvePrice({ baseMinor: 1000, quantity: 1, kind: "percent_off", adjustmentBp: 1500 })).toBe(850);
    expect(resolvePrice({ baseMinor: 1000, quantity: 1 })).toBe(1000);
  });

  it("never returns a negative price", () => {
    expect(resolvePrice({ baseMinor: 100, quantity: 1, kind: "percent_off", adjustmentBp: 10000 })).toBe(0);
  });

  it("computes net terms", () => {
    expect(netTermsDueAt(new Date("2026-01-01T00:00:00Z"), 30).toISOString().slice(0, 10)).toBe("2026-01-31");
  });
});

describe("draft orders", () => {
  it("totals lines and clamps the discount", () => {
    const t = draftTotals([{ quantity: 2, unitPriceMinor: 500 }], { discountMinor: 5000, shippingMinor: 100 });
    expect(t.subtotal).toBe(1000);
    expect(t.discount).toBe(1000);
    expect(t.total).toBe(100);
  });

  it("guards sending", () => {
    expect(canSendDraft({ lineCount: 0, customerEmail: "a@b.co", status: "draft" }).ok).toBe(false);
    expect(canSendDraft({ lineCount: 1, customerEmail: "nope", status: "draft" }).ok).toBe(false);
    expect(canSendDraft({ lineCount: 1, customerEmail: "a@b.co", status: "sent" }).ok).toBe(false);
    expect(canSendDraft({ lineCount: 1, customerEmail: "a@b.co", status: "draft" }).ok).toBe(true);
  });
});

describe("tags and bulk edits", () => {
  it("normalises tags", () => {
    expect(normaliseTags(" VIP, vip , Gift wrap!, ")).toEqual(["vip", "gift-wrap"]);
  });

  it("separates unusable rows", () => {
    const res = validateBulkRows([
      { variant_id: ID, price_minor_int: 500 },
      { variant_id: "nope", price_minor_int: 1 },
      { variant_id: ID, stock_quantity: -2 },
      { variant_id: ID },
    ]);
    expect(res.valid).toHaveLength(1);
    expect(res.invalid.map((i) => i.reason)).toEqual([
      "Unknown product variant",
      "Values cannot be negative",
      "Nothing to change",
    ]);
  });

  it("adjusts prices in every mode", () => {
    expect(adjustPrice(1000, { mode: "percent", value: -10 })).toBe(900);
    expect(adjustPrice(1000, { mode: "amount", value: 250 })).toBe(1250);
    expect(adjustPrice(1000, { mode: "set", value: 99 })).toBe(99);
    expect(adjustPrice(100, { mode: "amount", value: -900 })).toBe(0);
  });
});

describe("subscriptions", () => {
  it("keys a cycle deterministically", () => {
    expect(chargeKey(ID, 3)).toBe(`sub:${ID}:cycle:3`);
    expect(chargeKey(ID, 3)).toBe(chargeKey(ID, 3));
  });

  it("advances the period per interval", () => {
    const from = new Date("2026-01-31T00:00:00Z");
    expect(nextPeriodEnd(from, "month", 1).getUTCMonth()).toBe(2);
    expect(nextPeriodEnd(from, "week", 2).toISOString().slice(0, 10)).toBe("2026-02-14");
    expect(nextPeriodEnd(from, "year", 1).getUTCFullYear()).toBe(2027);
  });

  it("backs off then gives up", () => {
    expect(dunningPlan(0)).toEqual({ retryInDays: 1, pastDue: false });
    expect(dunningPlan(2)).toEqual({ retryInDays: 3, pastDue: false });
    expect(dunningPlan(3)).toEqual({ retryInDays: null, pastDue: true });
  });
});

describe("receiving", () => {
  it("summarises progress and clamps over-receipt", () => {
    const p = receivingProgress([
      { ordered: 10, received: 10 },
      { ordered: 10, received: 20 },
    ]);
    expect(p).toMatchObject({ ordered: 20, received: 20, outstanding: 0, percent: 100, complete: true });
  });
});
