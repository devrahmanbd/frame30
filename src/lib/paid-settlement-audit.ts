/**
 * T1 audit helper (read-only): flags `paid` online orders that never went
 * through a verified settlement.
 *
 * A genuine online capture always leaves two traces: a `charge_intent` in
 * `paid` status and a `payments` row written by `applySignedReturn` (provider
 * reference `<method>:<key>`). Orders stuck at `paid` with only a `MOCK-*`
 * placement row — or no payment row at all — predate the pending-until-
 * settlement fix and need ops review. Pure module: no imports, fully testable.
 *
 * The operational script `scripts/audit-paid-placement.mjs` mirrors this
 * predicate against live PostgREST reads and never mutates data.
 */

export type PaidOrderRow = {
  id: string;
  order_number?: string | null;
  merchant_id?: string | null;
  payment_method: string;
  status: string;
  total_minor_int?: number | null;
  created_at?: string | null;
};

export type IntentRow = {
  order_id: string;
  status: string;
  method: string;
};

export type PaymentRow = {
  order_id: string;
  payment_status: string;
  provider_reference?: string | null;
};

export type SuspectOrder = {
  orderId: string;
  orderNumber: string | null;
  merchantId: string | null;
  method: string;
  totalMinor: number | null;
  createdAt: string | null;
  reason: string;
};

const PLACEMENT_REF_PREFIX = "MOCK-";

/** Placement-artifact rows never count as settlement evidence. */
function isSettlementPayment(p: PaymentRow): boolean {
  if (p.payment_status !== "paid") return false;
  const ref = p.provider_reference ?? "";
  return !ref.toUpperCase().startsWith(PLACEMENT_REF_PREFIX);
}

export function findPaidWithoutSettlement(
  orders: readonly PaidOrderRow[],
  intents: readonly IntentRow[],
  payments: readonly PaymentRow[],
): SuspectOrder[] {
  const paidIntents = new Set(
    intents.filter((i) => i.status === "paid").map((i) => i.order_id),
  );
  const settledOrders = new Set(
    payments.filter(isSettlementPayment).map((p) => p.order_id),
  );
  const out: SuspectOrder[] = [];
  for (const o of orders) {
    if (o.status !== "paid") continue;
    if (o.payment_method === "cod") continue;
    const hasIntent = paidIntents.has(o.id);
    const hasPayment = settledOrders.has(o.id);
    if (hasIntent && hasPayment) continue;
    out.push({
      orderId: o.id,
      orderNumber: o.order_number ?? null,
      merchantId: o.merchant_id ?? null,
      method: o.payment_method,
      totalMinor:
        typeof o.total_minor_int === "number" ? o.total_minor_int : null,
      createdAt: o.created_at ?? null,
      reason: !hasIntent
        ? "no_paid_settlement_intent"
        : "no_settlement_payment_row",
    });
  }
  return out;
}
