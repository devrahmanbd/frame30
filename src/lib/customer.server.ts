/**
 * §3 — `/dashboard` data layer (server only).
 *
 * Reads run through the service client because shoppers hold no tenant grants,
 * and are therefore scoped **explicitly** on every query by
 * `(merchant_id, customer_id)` resolved from the session — never by anything the
 * client sends. Columns come from the allow-lists in `customer-view.ts`, so
 * staff notes, risk tags and order access tokens are not merely hidden: they are
 * never selected.
 */
import type { CustomerScope } from "./customer-scope";
import {
  CUSTOMER_ITEM_SELECT,
  CUSTOMER_ORDER_SELECT,
  CUSTOMER_SHIPMENT_SELECT,
  OPEN_ORDER_STATUSES,
  deliveryProblem,
  deliveryStepIndex,
  nextAction,
  publicTimeline,
  returnEligibility,
  type Eligibility,
  type PublicEvent,
} from "./customer-view";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Resolves the shopper behind a session, or null for an unfinished signup. */
export async function resolveCustomerScope(
  userId: string,
  merchantId?: string | null,
): Promise<CustomerScope | null> {
  const client = await db();
  let query = client
    .from("customers")
    .select("id, merchant_id, name, email, phone, locale, merchants(name, slug, currency_code)")
    .eq("auth_uid", userId)
    .is("deleted_at", null);

  if (merchantId) {
    query = query.eq("merchant_id", merchantId);
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data } = await query.limit(1).maybeSingle();
  if (!data) return null;
  const store = (data.merchants ?? null) as { name?: string; slug?: string; currency_code?: string } | null;
  return {
    id: data.id,
    merchantId: data.merchant_id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    locale: data.locale,
    storeName: store?.name ?? null,
    storeSlug: store?.slug ?? null,
    currencyCode: store?.currency_code ?? "BDT",
  };
}

/** Resolves all merchant stores where this user holds a customer profile. */
export async function resolveCustomerAccounts(userId: string): Promise<CustomerScope[]> {
  const client = await db();
  const { data } = await client
    .from("customers")
    .select("id, merchant_id, name, email, phone, locale, merchants(name, slug, currency_code)")
    .eq("auth_uid", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []).map((row) => {
    const store = (row.merchants ?? null) as { name?: string; slug?: string; currency_code?: string } | null;
    return {
      id: row.id,
      merchantId: row.merchant_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      locale: row.locale,
      storeName: store?.name ?? null,
      storeSlug: store?.slug ?? null,
      currencyCode: store?.currency_code ?? "BDT",
    };
  });
}

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  currency_code: string;
  total_minor_int: number;
  created_at: string;
  updated_at: string;
  subtotal_minor_int: number;
  discount_minor_int: number;
  shipping_minor_int: number;
  cod_surcharge_minor_int: number;
  vat_minor_int: number;
  customer_name: string;
  address_line: string;
  city: string;
  postcode: string | null;
};

function scopedOrders(client: Awaited<ReturnType<typeof db>>, scope: CustomerScope) {
  return client
    .from("orders")
    .select(CUSTOMER_ORDER_SELECT)
    .eq("merchant_id", scope.merchantId)
    .eq("customer_id", scope.id);
}

/* --------------------------------------------------------------------- home */

export async function loadCustomerHome(scope: CustomerScope) {
  const client = await db();
  const { data: orders } = await scopedOrders(client, scope)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = ((orders ?? []) as unknown as OrderRow[]);
  const open = rows.filter((o) => (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status));

  const orderIds = open.map((o) => o.id);
  const shipments = orderIds.length
    ? (
        await client
          .from("carrier_shipments")
          .select(CUSTOMER_SHIPMENT_SELECT)
          .eq("merchant_id", scope.merchantId)
          .in("order_id", orderIds)
          .order("created_at", { ascending: false })
      ).data ?? []
    : [];

  const { data: loyalty } = await client
    .from("loyalty_accounts")
    .select("available_points, pending_points, tier, enabled")
    .eq("merchant_id", scope.merchantId)
    .eq("customer_id", scope.id)
    .maybeSingle();

  return {
    currency: scope.currencyCode,
    storeName: scope.storeName,
    storeSlug: scope.storeSlug,
    name: scope.name,
    active: open.map((o) => {
      const shipment = shipments.find((s) => s.order_id === o.id) ?? null;
      return {
        id: o.id,
        orderNumber: o.order_number,
        status: o.status,
        paymentMethod: o.payment_method,
        currency: o.currency_code,
        totalMinor: o.total_minor_int,
        placedAt: o.created_at,
        stepIndex: deliveryStepIndex(shipment?.status),
        problem: deliveryProblem(shipment?.status),
        next: nextAction(o),
      };
    }),
    recent: rows.slice(0, 5).map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      currency: o.currency_code,
      totalMinor: o.total_minor_int,
      placedAt: o.created_at,
    })),
    loyalty: loyalty?.enabled
      ? {
          available: loyalty.available_points,
          pending: loyalty.pending_points,
          tier: loyalty.tier ?? null,
        }
      : null,
  };
}

/* ------------------------------------------------------------------- orders */

export async function loadCustomerOrders(scope: CustomerScope, page = 0, pageSize = 20) {
  const client = await db();
  const from = page * pageSize;
  const { data, count } = await client
    .from("orders")
    .select(CUSTOMER_ORDER_SELECT, { count: "exact" })
    .eq("merchant_id", scope.merchantId)
    .eq("customer_id", scope.id)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  const rows = ((data ?? []) as unknown as OrderRow[]);
  return {
    total: count ?? rows.length,
    page,
    pageSize,
    rows: rows.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      currency: o.currency_code,
      totalMinor: o.total_minor_int,
      placedAt: o.created_at,
    })),
  };
}

export type CustomerOrderDetail = {
  order: OrderRow;
  items: {
    id: string;
    title: string;
    variant: string;
    sku: string | null;
    quantity: number;
    unitMinor: number;
    lineMinor: number;
  }[];
  timeline: PublicEvent[];
  shipment: {
    carrierCode: string;
    awb: string | null;
    status: string;
    trackingUrl: string | null;
    stepIndex: number;
    problem: { en: string; bn: string } | null;
    deliveredAt: string | null;
  } | null;
  returns: { id: string; reference: string; status: string; reason: string; refundMinor: number; createdAt: string }[];
  eligibility: Eligibility;
  invoice: { number: string; issuedAt: string } | null;
};

/**
 * One order, or null when it is not this shopper's. The scope predicate is part
 * of the query, so a guessed id is indistinguishable from a missing one.
 */
export async function loadCustomerOrder(
  scope: CustomerScope,
  orderId: string,
): Promise<CustomerOrderDetail | null> {
  const client = await db();
  const { data: order } = await scopedOrders(client, scope).eq("id", orderId).maybeSingle();
  if (!order) return null;
  const row = order as unknown as OrderRow;

  const [items, events, shipments, returns, invoice] = await Promise.all([
    client
      .from("order_items")
      .select(CUSTOMER_ITEM_SELECT)
      .eq("merchant_id", scope.merchantId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: true }),
    // `note` is deliberately not selected: staff notes are internal.
    client
      .from("order_events")
      .select("id, event_type, created_at")
      .eq("merchant_id", scope.merchantId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(100),
    client
      .from("carrier_shipments")
      .select(CUSTOMER_SHIPMENT_SELECT)
      .eq("merchant_id", scope.merchantId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1),
    client
      .from("return_requests")
      .select("id, reference, status, reason, refund_minor_int, created_at")
      .eq("merchant_id", scope.merchantId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    client
      .from("order_invoices")
      .select("invoice_number, issued_at")
      .eq("merchant_id", scope.merchantId)
      .eq("order_id", orderId)
      .maybeSingle(),
  ]);

  const shipment = shipments.data?.[0] ?? null;
  const returnRows = returns.data ?? [];
  const openReturn = returnRows.some((r) => !["rejected", "cancelled", "refunded"].includes(r.status));

  return {
    order: { ...row },
    items: (items.data ?? []).map((i) => ({
      id: i.id,
      title: i.product_title,
      variant: i.variant_name,
      sku: i.sku,
      quantity: i.quantity,
      unitMinor: i.unit_price_minor_int,
      lineMinor: i.line_total_minor_int,
    })),
    timeline: publicTimeline(events.data ?? []),
    shipment: shipment
      ? {
          carrierCode: shipment.carrier_code,
          awb: shipment.awb,
          status: shipment.status,
          trackingUrl: shipment.tracking_url,
          stepIndex: deliveryStepIndex(shipment.status),
          problem: deliveryProblem(shipment.status),
          deliveredAt: shipment.delivered_at,
        }
      : null,
    returns: returnRows.map((r) => ({
      id: r.id,
      reference: r.reference,
      status: r.status,
      reason: r.reason,
      refundMinor: r.refund_minor_int,
      createdAt: r.created_at,
    })),
    eligibility: returnEligibility({
      status: row.status,
      deliveredAt: shipment?.delivered_at ?? null,
      createdAt: row.created_at,
      hasOpenReturn: openReturn,
    }),
    invoice: invoice.data
      ? { number: invoice.data.invoice_number, issuedAt: invoice.data.issued_at }
      : null,
  };
}

/* ------------------------------------------------------------------- track */

export async function loadCustomerTracking(scope: CustomerScope) {
  const client = await db();
  const { data: orders } = await scopedOrders(client, scope)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = ((orders ?? []) as unknown as OrderRow[]);
  if (rows.length === 0) return { parcels: [] };

  const { data: shipments } = await client
    .from("carrier_shipments")
    .select(CUSTOMER_SHIPMENT_SELECT)
    .eq("merchant_id", scope.merchantId)
    .in(
      "order_id",
      rows.map((o) => o.id),
    )
    .order("created_at", { ascending: false })
    .limit(20);

  const shipmentRows = shipments ?? [];
  const events = shipmentRows.length
    ? (
        await client
          .from("delivery_events")
          .select("id, shipment_id, event_type, occurred_at")
          .eq("merchant_id", scope.merchantId)
          .in(
            "shipment_id",
            shipmentRows.map((s) => s.id),
          )
          .order("occurred_at", { ascending: true })
          .limit(300)
      ).data ?? []
    : [];

  return {
    parcels: shipmentRows.map((s) => {
      const order = rows.find((o) => o.id === s.order_id);
      return {
        id: s.id,
        orderId: s.order_id,
        orderNumber: order?.order_number ?? null,
        carrierCode: s.carrier_code,
        awb: s.awb,
        status: s.status,
        trackingUrl: s.tracking_url,
        stepIndex: deliveryStepIndex(s.status),
        problem: deliveryProblem(s.status),
        attempts: s.attempt_count,
        deliveredAt: s.delivered_at,
        lastEventAt: s.last_event_at,
        events: events
          .filter((e) => e.shipment_id === s.id)
          .map((e) => ({ id: e.id, at: e.occurred_at, type: e.event_type })),
      };
    }),
  };
}

/* ---------------------------------------------------------------- wishlist */

export async function loadCustomerWishlist(scope: CustomerScope) {
  const client = await db();
  const { data } = await client
    .from("customer_wishlist_items")
    .select("id, product_variant_id, stock_alert, created_at")
    .eq("merchant_id", scope.merchantId)
    .eq("customer_id", scope.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const items = data ?? [];
  if (items.length === 0) return { items: [] };

  const { data: variants } = await client
    .from("product_variants")
    .select("id, name, sku, price_amount_minor_int, product_id")
    .in(
      "id",
      items.map((i) => i.product_variant_id),
    );
  const variantRows = variants ?? [];
  const { data: products } = variantRows.length
    ? await client
        .from("products")
        .select("id, title, slug")
        .in(
          "id",
          variantRows.map((v) => v.product_id),
        )
    : { data: [] };

  return {
    currency: scope.currencyCode,
    items: items.map((i) => {
      const variant = variantRows.find((v) => v.id === i.product_variant_id) ?? null;
      const product = (products ?? []).find((p) => p.id === variant?.product_id) ?? null;
      return {
        id: i.id,
        variantId: i.product_variant_id,
        stockAlert: i.stock_alert,
        title: product?.title ?? variant?.name ?? "Saved item",
        slug: product?.slug ?? null,
        variantName: variant?.name ?? "",
        priceMinor: variant?.price_amount_minor_int ?? 0,
      };
    }),
  };
}

export async function removeWishlistItem(scope: CustomerScope, itemId: string) {
  const client = await db();
  await client
    .from("customer_wishlist_items")
    .delete()
    .eq("merchant_id", scope.merchantId)
    .eq("customer_id", scope.id)
    .eq("id", itemId);
  return { ok: true };
}

/* ----------------------------------------------------------------- profile */

export async function loadCustomerProfile(scope: CustomerScope) {
  const client = await db();
  const [addresses, consents] = await Promise.all([
    client
      .from("customer_addresses")
      .select(
        "id, address_type, label, full_name, phone, line1, line2, city, district, postcode, is_default",
      )
      .eq("merchant_id", scope.merchantId)
      .eq("customer_id", scope.id)
      .is("deleted_at", null)
      .order("is_default", { ascending: false }),
    client
      .from("customer_consents")
      .select("channel, purpose, granted")
      .eq("merchant_id", scope.merchantId)
      .eq("customer_id", scope.id),
  ]);

  return {
    profile: {
      name: scope.name,
      email: scope.email,
      phone: scope.phone,
      locale: scope.locale,
      storeName: scope.storeName,
    },
    addresses: addresses.data ?? [],
    consents: consents.data ?? [],
  };
}

export async function saveCustomerProfile(
  scope: CustomerScope,
  input: { name: string; email: string | null; phone: string | null; locale: string },
) {
  const client = await db();
  const { error } = await client
    .from("customers")
    .update({
      name: input.name,
      email: input.email,
      phone: input.phone,
      locale: input.locale,
    })
    .eq("id", scope.id)
    .eq("merchant_id", scope.merchantId);
  if (error) throw new Error("profile_update_failed");
  return { ok: true };
}

export async function setCustomerConsent(
  scope: CustomerScope,
  channel: "email" | "sms" | "push",
  purpose: "marketing" | "cart_recovery" | "stock_alerts",
  granted: boolean,
) {
  const client = await db();
  const now = new Date().toISOString();
  const { data: existing } = await client
    .from("customer_consents")
    .select("id")
    .eq("merchant_id", scope.merchantId)
    .eq("customer_id", scope.id)
    .eq("channel", channel)
    .eq("purpose", purpose)
    .maybeSingle();

  if (existing) {
    await client
      .from("customer_consents")
      .update({
        granted,
        granted_at: granted ? now : null,
        withdrawn_at: granted ? null : now,
        source: "dashboard",
      })
      .eq("id", existing.id);
  } else {
    await client.from("customer_consents").insert({
      merchant_id: scope.merchantId,
      customer_id: scope.id,
      channel,
      purpose,
      granted,
      granted_at: granted ? now : null,
      withdrawn_at: granted ? null : now,
      source: "dashboard",
    });
  }
  return { ok: true };
}

export async function saveCustomerAddress(
  scope: CustomerScope,
  input: {
    addressId: string | null;
    addressType: "shipping" | "billing";
    label: string;
    fullName: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    district: string;
    postcode: string;
    isDefault: boolean;
  },
) {
  const client = await db();
  const row = {
    merchant_id: scope.merchantId,
    customer_id: scope.id,
    address_type: input.addressType,
    label: input.label,
    full_name: input.fullName,
    phone: input.phone,
    line1: input.line1,
    line2: input.line2 || null,
    city: input.city,
    district: input.district,
    postcode: input.postcode || null,
    is_default: input.isDefault,
  };

  if (input.addressId) {
    await client
      .from("customer_addresses")
      .update(row)
      .eq("id", input.addressId)
      .eq("merchant_id", scope.merchantId)
      .eq("customer_id", scope.id);
  } else {
    await client.from("customer_addresses").insert(row);
  }
  if (input.isDefault) {
    // Exactly one default per shopper, enforced here rather than in the UI.
    const query = client
      .from("customer_addresses")
      .update({ is_default: false })
      .eq("merchant_id", scope.merchantId)
      .eq("customer_id", scope.id)
      .eq("address_type", input.addressType);
    await (input.addressId ? query.neq("id", input.addressId) : query.neq("label", input.label));
  }
  return { ok: true };
}

export async function deleteCustomerAddress(scope: CustomerScope, addressId: string) {
  const client = await db();
  await client
    .from("customer_addresses")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", addressId)
    .eq("merchant_id", scope.merchantId)
    .eq("customer_id", scope.id);
  return { ok: true };
}

/* ----------------------------------------------------------------- returns */

/**
 * Opens a return request for the shopper's own order. Money is never created
 * here: the row lands in `requested` and the merchant's refund path decides.
 */
export async function openCustomerReturn(
  scope: CustomerScope,
  input: { orderId: string; reason: string; note: string; items: { orderItemId: string; quantity: number }[] },
) {
  const detail = await loadCustomerOrder(scope, input.orderId);
  if (!detail) throw new Error("order_not_found");
  if (!detail.eligibility.eligible) throw new Error("order_not_returnable");

  const client = await db();
  const chosen = input.items
    .map((i) => {
      const line = detail.items.find((l) => l.id === i.orderItemId);
      if (!line) return null;
      const quantity = Math.min(Math.max(1, Math.floor(i.quantity)), line.quantity);
      return { line, quantity };
    })
    .filter((v): v is { line: CustomerOrderDetail["items"][number]; quantity: number } => v !== null);
  if (chosen.length === 0) throw new Error("return_items_required");

  const refundMinor = chosen.reduce((sum, c) => sum + c.line.unitMinor * c.quantity, 0);
  const reference = `RET-${Date.now().toString(36).toUpperCase()}`;
  const order = detail.order as unknown as OrderRow;

  const { data: created, error } = await client
    .from("return_requests")
    .insert({
      merchant_id: scope.merchantId,
      order_id: input.orderId,
      reference,
      reason: input.reason.slice(0, 200),
      customer_note: input.note.slice(0, 500) || null,
      currency_code: order.currency_code,
      refund_minor_int: refundMinor,
      status: "requested",
    })
    .select("id, reference, status, refund_minor_int, created_at")
    .single();
  if (error || !created) throw new Error("return_open_failed");

  await client.from("return_items").insert(
    chosen.map((c) => ({
      merchant_id: scope.merchantId,
      return_id: created.id,
      order_item_id: c.line.id,
      quantity: c.quantity,
      amount_minor_int: c.line.unitMinor * c.quantity,
      restock: true,
    })),
  );
  await client.from("order_events").insert({
    merchant_id: scope.merchantId,
    order_id: input.orderId,
    event_type: "return_requested",
    note: `Shopper requested a return (${reference})`,
  });

  return {
    id: created.id,
    reference: created.reference,
    status: created.status,
    refundMinor: created.refund_minor_int,
    createdAt: created.created_at,
  };
}
