/**
 * §3 — the `/dashboard` field contract.
 *
 * Everything a shopper may see is declared here, once, as data. The server
 * builds its queries from these lists, so nothing internal (staff notes, risk
 * tags, order access tokens) can reach a customer payload — the allow-list is
 * the query, not a client-side filter. Pure module: no imports, fully testable.
 */

/** Order columns a shopper may read about their own order. */
export const CUSTOMER_ORDER_COLUMNS = [
  "id",
  "order_number",
  "status",
  "payment_method",
  "currency_code",
  "subtotal_minor_int",
  "discount_minor_int",
  "shipping_minor_int",
  "cod_surcharge_minor_int",
  "vat_minor_int",
  "total_minor_int",
  "customer_name",
  "address_line",
  "city",
  "postcode",
  "created_at",
  "updated_at",
] as const;

/** Never leaves the server on a `/dashboard` payload. Asserted by tests. */
export const INTERNAL_ORDER_COLUMNS = [
  "access_token",
  "idempotency_key",
  "note",
  "tags",
  "merchant_id",
  "customer_id",
  "vat_rate_basis_points",
] as const;

export const CUSTOMER_ORDER_SELECT = CUSTOMER_ORDER_COLUMNS.join(", ");

export const CUSTOMER_ITEM_SELECT =
  "id, product_title, variant_name, sku, quantity, unit_price_minor_int, line_total_minor_int";

/** Shipment columns a shopper may read: courier, code, status, timings. */
export const CUSTOMER_SHIPMENT_SELECT =
  "id, order_id, carrier_code, awb, status, tracking_url, attempt_count, last_event_at, delivered_at, created_at";

/**
 * Order events a shopper may see. Anything else (risk scoring, fraud checks,
 * internal notes, staff assignments) is dropped — an unknown event type is
 * treated as internal, so a new merchant-side event never leaks by default.
 */
export const PUBLIC_ORDER_EVENTS: Record<string, { en: string; bn: string }> = {
  order_placed: { en: "Order placed", bn: "অর্ডার করা হয়েছে" },
  created: { en: "Order placed", bn: "অর্ডার করা হয়েছে" },
  payment_pending: { en: "Waiting for payment", bn: "পেমেন্টের অপেক্ষায়" },
  payment_received: { en: "Payment received", bn: "পেমেন্ট পাওয়া গেছে" },
  paid: { en: "Payment received", bn: "পেমেন্ট পাওয়া গেছে" },
  payment_failed: { en: "Payment failed", bn: "পেমেন্ট ব্যর্থ" },
  confirmed: { en: "Order confirmed", bn: "অর্ডার নিশ্চিত" },
  packed: { en: "Packed", bn: "প্যাক করা হয়েছে" },
  shipped: { en: "Handed to courier", bn: "কুরিয়ারে দেওয়া হয়েছে" },
  out_for_delivery: { en: "Out for delivery", bn: "ডেলিভারির পথে" },
  delivered: { en: "Delivered", bn: "ডেলিভার হয়েছে" },
  cancelled: { en: "Cancelled", bn: "বাতিল" },
  refund_requested: { en: "Refund requested", bn: "রিফান্ড চাওয়া হয়েছে" },
  refunded: { en: "Refunded", bn: "রিফান্ড হয়েছে" },
  return_requested: { en: "Return requested", bn: "রিটার্ন চাওয়া হয়েছে" },
  return_approved: { en: "Return approved", bn: "রিটার্ন অনুমোদিত" },
  return_rejected: { en: "Return declined", bn: "রিটার্ন বাতিল" },
  return_received: { en: "Return received", bn: "রিটার্ন পাওয়া গেছে" },
};

export type RawEvent = { id: string; event_type: string; created_at: string; note?: string | null };
export type PublicEvent = { id: string; at: string; type: string; en: string; bn: string };

/** Keeps only allow-listed events and drops the internal `note` entirely. */
export function publicTimeline(rows: readonly RawEvent[]): PublicEvent[] {
  return rows
    .filter((r) => Boolean(PUBLIC_ORDER_EVENTS[r.event_type]))
    .map((r) => {
      const label = PUBLIC_ORDER_EVENTS[r.event_type]!;
      return { id: r.id, at: r.created_at, type: r.event_type, en: label.en, bn: label.bn };
    })
    .sort((a, b) => (a.at < b.at ? -1 : 1));
}

/* ------------------------------------------------------------------ delivery */

export const DELIVERY_STEPS = ["created", "picked_up", "in_transit", "out_for_delivery", "delivered"] as const;
export type DeliveryStep = (typeof DELIVERY_STEPS)[number];

const STEP_OF: Record<string, DeliveryStep> = {
  created: "created",
  pickup_scheduled: "created",
  picked_up: "picked_up",
  in_transit: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  failed_attempt: "out_for_delivery",
  returned: "in_transit",
};

export const DELIVERY_STEP_LABELS: Record<DeliveryStep, { en: string; bn: string }> = {
  created: { en: "Label created", bn: "লেবেল তৈরি" },
  picked_up: { en: "Picked up", bn: "সংগ্রহ করা হয়েছে" },
  in_transit: { en: "In transit", bn: "পথে আছে" },
  out_for_delivery: { en: "Out for delivery", bn: "ডেলিভারির পথে" },
  delivered: { en: "Delivered", bn: "ডেলিভার হয়েছে" },
};

/** 0-based index into DELIVERY_STEPS; -1 when the status is unknown. */
export function deliveryStepIndex(status: string | null | undefined): number {
  const step = status ? STEP_OF[status] : undefined;
  return step ? DELIVERY_STEPS.indexOf(step) : -1;
}

/** Problem states get their own copy — a stalled parcel must not read "in transit". */
export function deliveryProblem(status: string | null | undefined): { en: string; bn: string } | null {
  if (status === "failed_attempt")
    return { en: "Delivery attempt failed — the courier will retry", bn: "ডেলিভারি চেষ্টা ব্যর্থ — কুরিয়ার আবার চেষ্টা করবে" };
  if (status === "returned") return { en: "Parcel is on its way back", bn: "পার্সেল ফেরত পথে" };
  return null;
}

/* ------------------------------------------------------------------- returns */

export const RETURN_WINDOW_DAYS = 7;
export const RETURN_REASONS = [
  { value: "damaged", en: "Arrived damaged", bn: "ক্ষতিগ্রস্ত অবস্থায় এসেছে" },
  { value: "wrong_item", en: "Wrong item", bn: "ভুল পণ্য" },
  { value: "size", en: "Size or fit", bn: "সাইজ মেলেনি" },
  { value: "not_as_described", en: "Not as described", bn: "বর্ণনার সাথে মেলে না" },
  { value: "changed_mind", en: "Changed my mind", bn: "মত পরিবর্তন" },
] as const;

export type Eligibility =
  | { eligible: true; deadline: string }
  | { eligible: false; code: "not_delivered" | "window_closed" | "already_open"; deadline: string | null };

/**
 * Return eligibility from the policy window. Computed server-side and echoed to
 * the UI so the button and the server agree on the same answer.
 */
export function returnEligibility(input: {
  status: string;
  deliveredAt?: string | null;
  createdAt: string;
  hasOpenReturn?: boolean;
  windowDays?: number;
  now?: number;
}): Eligibility {
  const windowDays = input.windowDays ?? RETURN_WINDOW_DAYS;
  const now = input.now ?? Date.now();
  const from = Date.parse(input.deliveredAt ?? input.createdAt);
  const deadlineMs = from + windowDays * 86_400_000;
  const deadline = new Date(deadlineMs).toISOString();
  if (input.hasOpenReturn) return { eligible: false, code: "already_open", deadline };
  if (!["delivered", "fulfilled"].includes(input.status))
    return { eligible: false, code: "not_delivered", deadline: null };
  if (now > deadlineMs) return { eligible: false, code: "window_closed", deadline };
  return { eligible: true, deadline };
}

/* --------------------------------------------------------------- next action */

export type NextAction = { code: string; en: string; bn: string; to?: string } | null;

/** The single most useful thing the shopper can do about this order right now. */
export function nextAction(order: {
  id: string;
  status: string;
  payment_method: string;
}): NextAction {
  if (order.status === "payment_pending")
    return { code: "pay", en: "Complete your payment", bn: "পেমেন্ট সম্পন্ন করুন", to: `/dashboard/orders/${order.id}` };
  if (order.status === "pending" && order.payment_method === "cod")
    return { code: "confirm_cod", en: "Confirm your cash-on-delivery order", bn: "ক্যাশ-অন-ডেলিভারি অর্ডার নিশ্চিত করুন", to: `/dashboard/orders/${order.id}` };
  if (["confirmed", "packed", "shipped"].includes(order.status))
    return { code: "track", en: "Track your parcel", bn: "পার্সেল ট্র্যাক করুন", to: `/dashboard/track` };
  if (order.status === "delivered")
    return { code: "review", en: "Rate what you received", bn: "প্রাপ্ত পণ্যের রেটিং দিন", to: `/dashboard/orders/${order.id}` };
  return null;
}

export const OPEN_ORDER_STATUSES = [
  "pending",
  "payment_pending",
  "confirmed",
  "paid",
  "packed",
  "shipped",
  "refund_requested",
] as const;
