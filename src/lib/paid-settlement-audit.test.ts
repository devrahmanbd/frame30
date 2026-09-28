import { describe, expect, it } from "vitest";
import { findPaidWithoutSettlement } from "./paid-settlement-audit";

describe("findPaidWithoutSettlement", () => {
  it("flags a paid online order with only a MOCK placement row", () => {
    const suspects = findPaidWithoutSettlement(
      [
        {
          id: "o1",
          order_number: "FQ-1",
          merchant_id: "m1",
          payment_method: "bkash",
          status: "paid",
          total_minor_int: 1000,
          created_at: "2026-09-01T00:00:00Z",
        },
      ],
      [],
      [
        {
          order_id: "o1",
          payment_status: "paid",
          provider_reference: "MOCK-BKASH-FQ-1",
        },
      ],
    );
    expect(suspects).toHaveLength(1);
    expect(suspects[0]).toMatchObject({
      orderId: "o1",
      reason: "no_paid_settlement_intent",
    });
  });

  it("flags a paid online order with no payment row at all", () => {
    const suspects = findPaidWithoutSettlement(
      [
        {
          id: "o2",
          payment_method: "nagad",
          status: "paid",
        },
      ],
      [],
      [],
    );
    expect(suspects).toHaveLength(1);
    expect(suspects[0].reason).toBe("no_paid_settlement_intent");
  });

  it("flags a paid intent that never wrote its settlement payment row", () => {
    const suspects = findPaidWithoutSettlement(
      [{ id: "o3", payment_method: "bkash", status: "paid" }],
      [{ order_id: "o3", status: "paid", method: "bkash" }],
      [],
    );
    expect(suspects).toHaveLength(1);
    expect(suspects[0].reason).toBe("no_settlement_payment_row");
  });

  it("clears a genuinely settled order (paid intent + real payment row)", () => {
    expect(
      findPaidWithoutSettlement(
        [{ id: "o4", payment_method: "bkash", status: "paid" }],
        [{ order_id: "o4", status: "paid", method: "bkash" }],
        [
          {
            order_id: "o4",
            payment_status: "paid",
            provider_reference: "bkash:idem-settle-1",
          },
        ],
      ),
    ).toEqual([]);
  });

  it("ignores COD orders and unsettled statuses", () => {
    expect(
      findPaidWithoutSettlement(
        [
          { id: "c1", payment_method: "cod", status: "paid" },
          { id: "c2", payment_method: "cod", status: "confirmed" },
          { id: "p1", payment_method: "bkash", status: "payment_pending" },
          { id: "p2", payment_method: "bkash", status: "pending" },
        ],
        [],
        [],
      ),
    ).toEqual([]);
  });
});
