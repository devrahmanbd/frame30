/**
 * Multi-location inventory, transfers, fulfilment records and order invoices.
 *
 * Every stock movement is decided in Postgres (`inventory_transfer_receive`,
 * `fulfilment_create`, `order_invoice_issue`) so a retry can never double-move
 * units or mint a second invoice number. This module shapes payloads, applies
 * the burst gate and records spans/counters — it never computes a chargeable
 * amount and never trusts a client-sent quantity beyond clamping.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { one } from "./embed";

type Client = SupabaseClient<Database>;

export class CommerceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "CommerceError";
  }
}

const RPC_MESSAGES: Record<string, string> = {
  forbidden: "You do not have permission to do that",
  order_not_found: "Order not found",
  order_not_fulfillable: "This order cannot be fulfilled in its current state",
  order_not_invoiceable: "This order cannot be invoiced yet",
  order_item_not_found: "One of the selected items is not on this order",
  nothing_to_fulfil: "Every selected item is already fulfilled",
  transfer_not_found: "Transfer not found",
  transfer_cancelled: "This transfer was cancelled",
};

/** Postgres messages are mapped to stable, secret-free app codes. */
export function mapRpcError(message: string): CommerceError {
  const code = Object.keys(RPC_MESSAGES).find((k) => message.includes(k));
  if (code) return new CommerceError(code, RPC_MESSAGES[code] as string);
  log("warn", "commerce.rpc_failed", { detail: message.slice(0, 120) });
  return new CommerceError("commerce_unavailable", "That action is temporarily unavailable");
}

export async function loadLocations(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("inventory_locations")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw mapRpcError(error.message);
  return data ?? [];
}

export async function saveLocation(
  db: Client,
  merchantId: string,
  input: {
    id?: string;
    name: string;
    code: string;
    addressLine?: string | null;
    city?: string | null;
    isDefault?: boolean;
    active?: boolean;
  },
) {
  return withSpan("commerce.location_save", async () => {
    await enforceRateLimit("commerce.inventory", merchantId);
    const row = {
      merchant_id: merchantId,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      address_line: input.addressLine ?? null,
      city: input.city ?? null,
      is_default: input.isDefault ?? false,
      active: input.active ?? true,
    };
    const query = input.id
      ? db.from("inventory_locations").update(row).eq("id", input.id).eq("merchant_id", merchantId)
      : db.from("inventory_locations").insert(row);
    const { data, error } = await query.select("*").single();
    if (error) throw mapRpcError(error.message);
    if (row.is_default) {
      // Exactly one default per store — returns restock into it.
      await db
        .from("inventory_locations")
        .update({ is_default: false })
        .eq("merchant_id", merchantId)
        .neq("id", data.id);
    }
    incr("framique_inventory_location_saved_total", {});
    return data;
  });
}

export type LevelRow = {
  variantId: string;
  variantName: string;
  productTitle: string;
  sku: string | null;
  locationId: string;
  locationName: string;
  onHand: number;
  reserved: number;
  lowStockThreshold: number | null;
};

export async function loadLevels(db: Client, merchantId: string, locationId?: string) {
  return withSpan("commerce.levels_load", async () => {
    let q = db
      .from("inventory_levels")
      .select(
        "id, variant_id, location_id, on_hand, reserved, low_stock_threshold, inventory_locations(name), product_variants(name, sku, products(title))",
      )
      .eq("merchant_id", merchantId)
      .order("on_hand", { ascending: true })
      .limit(500);
    if (locationId) q = q.eq("location_id", locationId);
    const { data, error } = await q;
    if (error) throw mapRpcError(error.message);
    return (data ?? []).map((r) => {
      const variant = one<{
        name: string;
        sku: string | null;
        products: { title: string } | { title: string }[] | null;
      }>(r.product_variants);
      return {
        id: r.id,
        variantId: r.variant_id,
        variantName: variant?.name ?? "",
        productTitle: one(variant?.products)?.title ?? "",
        sku: variant?.sku ?? null,
        locationId: r.location_id,
        locationName: one<{ name: string }>(r.inventory_locations)?.name ?? "",
        onHand: r.on_hand,
        reserved: r.reserved,
        lowStockThreshold: r.low_stock_threshold,
      };
    });
  });
}

export async function setLevel(
  db: Client,
  merchantId: string,
  input: {
    locationId: string;
    variantId: string;
    onHand: number;
    lowStockThreshold?: number | null;
  },
) {
  return withSpan("commerce.level_set", async () => {
    await enforceRateLimit("commerce.inventory", merchantId);
    const onHand = Math.max(0, Math.floor(input.onHand));
    const { data, error } = await db
      .from("inventory_levels")
      .upsert(
        {
          merchant_id: merchantId,
          location_id: input.locationId,
          variant_id: input.variantId,
          on_hand: onHand,
          low_stock_threshold: input.lowStockThreshold ?? null,
        },
        { onConflict: "location_id,variant_id" },
      )
      .select("*")
      .single();
    if (error) throw mapRpcError(error.message);
    incr("framique_inventory_level_set_total", {});
    return data;
  });
}

export async function lowStock(db: Client, merchantId: string, fallbackThreshold = 5) {
  const levels = await loadLevels(db, merchantId);
  return levels.filter((l) => l.onHand <= (l.lowStockThreshold ?? fallbackThreshold));
}

export async function loadTransfers(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("inventory_transfers")
    .select("*, inventory_transfer_items(id, variant_id, quantity)")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw mapRpcError(error.message);
  return data ?? [];
}

export async function createTransfer(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    fromLocationId: string;
    toLocationId: string;
    note?: string | null;
    items: { variantId: string; quantity: number }[];
  },
) {
  return withSpan("commerce.transfer_create", async () => {
    await enforceRateLimit("commerce.transfer", `${merchantId}:${actor}`);
    if (input.fromLocationId === input.toLocationId) {
      throw new CommerceError("same_location", "Pick two different locations");
    }
    const items = input.items
      .map((i) => ({ ...i, quantity: Math.floor(i.quantity) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) throw new CommerceError("no_items", "Add at least one item");

    const reference = `TRF-${Date.now().toString(36).toUpperCase()}`;
    const { data: transfer, error } = await db
      .from("inventory_transfers")
      .insert({
        merchant_id: merchantId,
        reference,
        from_location_id: input.fromLocationId,
        to_location_id: input.toLocationId,
        note: input.note ?? null,
        created_by: actor,
        status: "in_transit",
      })
      .select("*")
      .single();
    if (error) throw mapRpcError(error.message);

    const { error: itemError } = await db.from("inventory_transfer_items").insert(
      items.map((i) => ({
        merchant_id: merchantId,
        transfer_id: transfer.id,
        variant_id: i.variantId,
        quantity: i.quantity,
      })),
    );
    if (itemError) throw mapRpcError(itemError.message);
    incr("framique_inventory_transfer_total", { outcome: "created" });
    return transfer;
  });
}

/** Receiving is idempotent: a second call on a received transfer is a no-op. */
export async function receiveTransfer(
  db: Client,
  merchantId: string,
  actor: string,
  transferId: string,
) {
  return withSpan("commerce.transfer_receive", async () => {
    await enforceRateLimit("commerce.transfer", `${merchantId}:${actor}`);
    const { data, error } = await db.rpc("inventory_transfer_receive", { _transfer_id: transferId });
    if (error) throw mapRpcError(error.message);
    incr("framique_inventory_transfer_total", { outcome: "received" });
    return data;
  });
}

/* ---------------------------------- fulfilments --------------------------------- */

export async function loadFulfilments(db: Client, merchantId: string, orderId?: string) {
  let q = db
    .from("fulfilments")
    .select("*, fulfilment_items(id, order_item_id, quantity)")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (orderId) q = q.eq("order_id", orderId);
  const { data, error } = await q;
  if (error) throw mapRpcError(error.message);
  return data ?? [];
}

export async function createFulfilment(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    orderId: string;
    locationId?: string | null;
    items: { orderItemId: string; quantity: number }[];
    idempotencyKey: string;
  },
) {
  return withSpan("commerce.fulfilment_create", async () => {
    await enforceRateLimit("commerce.fulfil", `${merchantId}:${actor}`);
    const { assertNoFraudHold } = await import("./fraud.server");
    try {
      await assertNoFraudHold(db, merchantId, input.orderId);
    } catch {
      throw new CommerceError(
        "fraud_hold_active",
        "This order is held for fraud review. Clear the case before fulfilling.",
      );
    }
    const items = input.items
      .map((i) => ({ order_item_id: i.orderItemId, quantity: Math.floor(i.quantity) }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) throw new CommerceError("no_items", "Select at least one item");


    const { data, error } = await db.rpc("fulfilment_create", {
      _order_id: input.orderId,
      _location_id: (input.locationId ?? undefined) as string,
      _items: items as never,
      _idempotency_key: input.idempotencyKey,
    });

    if (error) throw mapRpcError(error.message);
    incr("framique_fulfilment_total", {});
    return data;
  });
}

export async function advanceFulfilment(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    fulfilmentId: string;
    status: Database["public"]["Enums"]["fulfilment_status"];
    trackingNumber?: string | null;
    carrierCode?: string | null;
  },
) {
  return withSpan("commerce.fulfilment_advance", async () => {
    await enforceRateLimit("commerce.fulfil", `${merchantId}:${actor}`);
    const now = new Date().toISOString();
    const patch: Database["public"]["Tables"]["fulfilments"]["Update"] = { status: input.status };
    if (input.trackingNumber !== undefined) patch.tracking_number = input.trackingNumber;
    if (input.carrierCode !== undefined) patch.carrier_code = input.carrierCode;
    if (input.status === "shipped") patch.shipped_at = now;
    if (input.status === "delivered") patch.delivered_at = now;

    const { data, error } = await db
      .from("fulfilments")
      .update(patch)
      .eq("id", input.fulfilmentId)
      .eq("merchant_id", merchantId)
      .select("*")
      .single();
    if (error) throw mapRpcError(error.message);
    incr("framique_fulfilment_state_total", { status: input.status });
    return data;
  });
}

/* ----------------------------------- invoices ----------------------------------- */

export async function issueOrderInvoice(
  db: Client,
  merchantId: string,
  actor: string,
  orderId: string,
) {
  return withSpan("commerce.invoice_issue", async () => {
    await enforceRateLimit("commerce.invoice", `${merchantId}:${actor}`);
    const { data, error } = await db.rpc("order_invoice_issue", { _order_id: orderId });
    if (error) throw mapRpcError(error.message);
    incr("framique_order_invoice_total", {});
    return data;
  });
}

export async function loadOrderInvoice(db: Client, merchantId: string, orderId: string) {
  const { data } = await db
    .from("order_invoices")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("order_id", orderId)
    .maybeSingle();
  return data;
}
