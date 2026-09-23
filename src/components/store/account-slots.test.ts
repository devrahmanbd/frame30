/**
 * Account slot helpers — TDD: pure row mapping + ctx shape for route/preview
 * contextSlots (orders_list / profile_card are context-gated widgets).
 */
import { describe, expect, it } from "vitest";
import { newSection } from "@/lib/builder-ast";
import {
  accountSlotCtx,
  mapOrdersToRows,
  mapProfileToRow,
} from "./account-slots";

describe("mapOrdersToRows", () => {
  it("maps overview orders to priced widget rows", () => {
    const rows = mapOrdersToRows([
      {
        id: "o1",
        order_number: "ORD-1001",
        status: "delivered",
        total_minor_int: 129900,
        currency_code: "BDT",
        created_at: "2026-09-01T10:00:00Z",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "o1",
      title: "ORD-1001",
      subtitle: "delivered",
      priceMinor: 129900,
      currency: "BDT",
    });
  });

  it("maps empty orders to an empty list", () => {
    expect(mapOrdersToRows([])).toEqual([]);
  });
});

describe("mapProfileToRow", () => {
  it("maps a profile to a widget row", () => {
    const row = mapProfileToRow({
      name: "Demo Shopper",
      email: "demo@example.com",
      phone: "01700000000",
    });
    expect(row).toMatchObject({
      title: "Demo Shopper",
      subtitle: "demo@example.com",
    });
  });

  it("maps a null profile to undefined", () => {
    expect(mapProfileToRow(null)).toBeUndefined();
  });
});

describe("accountSlotCtx", () => {
  it("builds a renderable ctx carrying rows and pending", () => {
    const section = newSection("orders_list");
    const rows = mapOrdersToRows([]);
    const ctx = accountSlotCtx(section, {
      rows,
      pending: false,
      locale: "en",
      storeSlug: "demo",
    });
    expect(ctx.section).toBe(section);
    expect(ctx.data).toEqual({ rows, pending: false });
    expect(ctx.editing).toBe(false);
    expect(ctx.storeSlug).toBe("demo");
    expect(typeof ctx.money(100)).toBe("string");
  });
});
