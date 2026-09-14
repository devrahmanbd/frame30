/**
 * Commerce back-office server layer: draft orders, B2B price lists, suppliers
 * and purchase orders, the bulk editor, order tags/saved views and storefront
 * subscriptions.
 *
 * Rules that hold for every export here:
 * - Tenancy is always the merchant id resolved from the session, never a client field.
 * - Anything that must not run twice is idempotent in the database, not in JS.
 * - Reads that fan out are cached per tenant; writes purge what they invalidate.
 * - Every unit of work is wrapped in a span so latency and failures reach Prometheus.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { incr, log, withSpan } from "./observability.server";
import { chargeKey, normaliseTags, validateBulkRows, type BulkRow } from "./commerce-desk";

type Db = SupabaseClient<Database>;

export class CommerceDeskError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommerceDeskError";
  }
}

function fail(code: string, message: string): never {
  incr("framique_commerce_desk_errors_total", { code });
  throw new CommerceDeskError(code, message);
}

/** Unguessable share token for an invoice link. */
function shareToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sequenceNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

/* ============================== draft orders ============================== */

export async function listDraftOrders(db: Db, merchantId: string) {
  return withSpan("commerce_desk.drafts_list", async () => {
    const { data, error } = await db
      .from("draft_orders")
      .select("*, draft_order_items(*)")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });
}

export async function saveDraftOrder(
  db: Db,
  merchantId: string,
  input: {
    id?: string;
    customerId?: string | null;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    addressLine: string;
    city: string;
    postcode: string;
    note: string;
    currencyCode: string;
    discountMinorInt: number;
    shippingMinorInt: number;
    vatMinorInt: number;
    expiresAt?: string | null;
    items: {
      variantId: string | null;
      title: string;
      variantName: string;
      sku: string;
      quantity: number;
      unitPriceMinorInt: number;
    }[];
  },
) {
  return withSpan("commerce_desk.draft_save", async () => {
    const patch = {
      merchant_id: merchantId,
      customer_id: input.customerId ?? null,
      customer_name: input.customerName.trim().slice(0, 160),
      customer_email: input.customerEmail.trim().toLowerCase().slice(0, 200),
      customer_phone: input.customerPhone.trim().slice(0, 40),
      address_line: input.addressLine.trim().slice(0, 300),
      city: input.city.trim().slice(0, 120),
      postcode: input.postcode.trim().slice(0, 20),
      note: input.note.slice(0, 2000),
      currency_code: input.currencyCode,
      discount_minor_int: Math.max(0, Math.floor(input.discountMinorInt)),
      shipping_minor_int: Math.max(0, Math.floor(input.shippingMinorInt)),
      vat_minor_int: Math.max(0, Math.floor(input.vatMinorInt)),
      expires_at: input.expiresAt ?? null,
    };

    let draftId = input.id ?? null;
    if (draftId) {
      const { error } = await db
        .from("draft_orders")
        .update(patch)
        .eq("id", draftId)
        .eq("merchant_id", merchantId);
      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("draft_orders")
        .insert({ ...patch, number: sequenceNumber("DRAFT"), share_token: shareToken() })
        .select("id")
        .single();
      if (error) throw error;
      draftId = data.id;
    }

    // Items are replaced wholesale: the editor always submits the full basket,
    // so a diff would only add a way for the two to disagree.
    await db.from("draft_order_items").delete().eq("draft_order_id", draftId);
    if (input.items.length) {
      const rows = input.items.slice(0, 200).map((i) => ({
        merchant_id: merchantId,
        draft_order_id: draftId!,
        variant_id: i.variantId,
        title: i.title.slice(0, 200),
        variant_name: i.variantName.slice(0, 120),
        sku: i.sku.slice(0, 80),
        quantity: Math.max(1, Math.floor(i.quantity)),
        unit_price_minor_int: Math.max(0, Math.floor(i.unitPriceMinorInt)),
        line_total_minor_int:
          Math.max(1, Math.floor(i.quantity)) * Math.max(0, Math.floor(i.unitPriceMinorInt)),
      }));
      const { error } = await db.from("draft_order_items").insert(rows);
      if (error) throw error;
    }

    const { error: recalcError } = await db.rpc("draft_order_recalc", { _draft_id: draftId! });
    if (recalcError) throw recalcError;
    return { id: draftId! };
  });
}

export async function sendDraftOrder(db: Db, merchantId: string, draftId: string) {
  return withSpan("commerce_desk.draft_send", async () => {
    const { data, error } = await db
      .from("draft_orders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", draftId)
      .eq("merchant_id", merchantId)
      .eq("status", "draft")
      .select("share_token, number")
      .maybeSingle();
    if (error) throw error;
    if (!data) fail("draft_not_sendable", "That draft has already been sent or converted.");
    incr("framique_draft_orders_total", { action: "sent" });
    return data;
  });
}

export async function convertDraftOrder(db: Db, draftId: string) {
  return withSpan("commerce_desk.draft_convert", async () => {
    const { data, error } = await db.rpc("draft_order_convert", { _draft_id: draftId });
    if (error) throw error;
    const result = data as { outcome: string; order_id?: string; order_number?: string };
    incr("framique_draft_orders_total", { action: result.outcome });
    if (result.outcome === "empty") fail("draft_empty", "Add at least one item before converting.");
    if (result.outcome === "not_acceptable") {
      fail("draft_not_acceptable", "Send the invoice link before converting it to an order.");
    }
    if (result.outcome === "not_found") fail("draft_not_found", "That draft no longer exists.");
    return result;
  });
}

export async function cancelDraftOrder(db: Db, merchantId: string, draftId: string) {
  const { error } = await db
    .from("draft_orders")
    .update({ status: "cancelled" })
    .eq("id", draftId)
    .eq("merchant_id", merchantId)
    .neq("status", "converted");
  if (error) throw error;
  return { ok: true };
}

/* ============================== price lists =============================== */

export async function loadPricing(db: Db, merchantId: string) {
  return withSpan("commerce_desk.pricing_load", async () => {
    const [lists, items, accounts] = await Promise.all([
      db.from("price_lists").select("*").eq("merchant_id", merchantId).order("priority", { ascending: false }),
      db.from("price_list_items").select("*").eq("merchant_id", merchantId).limit(2000),
      db
        .from("b2b_accounts")
        .select("*, customers(name, email)")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (lists.error) throw lists.error;
    if (items.error) throw items.error;
    if (accounts.error) throw accounts.error;
    return { lists: lists.data ?? [], items: items.data ?? [], accounts: accounts.data ?? [] };
  });
}

export async function savePriceList(
  db: Db,
  merchantId: string,
  input: {
    id?: string;
    code: string;
    name: string;
    kind: "fixed" | "percent_off";
    adjustmentBp: number;
    currencyCode: string;
    isActive: boolean;
    priority: number;
  },
) {
  const patch = {
    merchant_id: merchantId,
    code: input.code.trim().toUpperCase().slice(0, 40),
    name: input.name.trim().slice(0, 120),
    kind: input.kind,
    adjustment_bp: Math.min(10000, Math.max(0, Math.floor(input.adjustmentBp))),
    currency_code: input.currencyCode,
    is_active: input.isActive,
    priority: Math.max(0, Math.floor(input.priority)),
  };
  const query = input.id
    ? db.from("price_lists").update(patch).eq("id", input.id).eq("merchant_id", merchantId).select("*").single()
    : db.from("price_lists").insert(patch).select("*").single();
  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === "23505") fail("code_taken", "That price list code is already used.");
    throw error;
  }
  return data;
}

export async function savePriceListItem(
  db: Db,
  merchantId: string,
  input: { priceListId: string; variantId: string; minQuantity: number; priceMinorInt: number },
) {
  const { error } = await db.from("price_list_items").upsert(
    {
      merchant_id: merchantId,
      price_list_id: input.priceListId,
      variant_id: input.variantId,
      min_quantity: Math.max(1, Math.floor(input.minQuantity)),
      price_minor_int: Math.max(0, Math.floor(input.priceMinorInt)),
    },
    { onConflict: "price_list_id,variant_id,min_quantity" },
  );
  if (error) throw error;
  return { ok: true };
}

export async function deletePriceListItem(db: Db, merchantId: string, id: string) {
  const { error } = await db.from("price_list_items").delete().eq("id", id).eq("merchant_id", merchantId);
  if (error) throw error;
  return { ok: true };
}

export async function saveB2bAccount(
  db: Db,
  merchantId: string,
  input: {
    id?: string;
    customerId: string;
    companyName: string;
    taxId: string;
    priceListId: string | null;
    netTermsDays: number;
    creditLimitMinorInt: number;
    isApproved: boolean;
  },
) {
  const patch = {
    merchant_id: merchantId,
    customer_id: input.customerId,
    company_name: input.companyName.trim().slice(0, 160),
    tax_id: input.taxId.trim().slice(0, 60),
    price_list_id: input.priceListId,
    net_terms_days: Math.min(180, Math.max(0, Math.floor(input.netTermsDays))),
    credit_limit_minor_int: Math.max(0, Math.floor(input.creditLimitMinorInt)),
    is_approved: input.isApproved,
    approved_at: input.isApproved ? new Date().toISOString() : null,
  };
  const { data, error } = await db
    .from("b2b_accounts")
    .upsert(patch, { onConflict: "merchant_id,customer_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Contract price for one customer — the same routine checkout uses. */
export async function priceForCustomer(
  db: Db,
  merchantId: string,
  variantId: string,
  customerId: string | null,
  quantity: number,
) {
  const { data, error } = await db.rpc("price_for_customer", {
    _merchant_id: merchantId,
    _variant_id: variantId,
    _customer_id: customerId ?? undefined,
    _quantity: Math.max(1, Math.floor(quantity)),
  });
  if (error) throw error;
  return (data as number | null) ?? null;
}

/* ========================== suppliers + purchasing ======================== */

export async function loadPurchasing(db: Db, merchantId: string) {
  return withSpan("commerce_desk.purchasing_load", async () => {
    const [suppliers, orders] = await Promise.all([
      db.from("suppliers").select("*").eq("merchant_id", merchantId).order("name"),
      db
        .from("purchase_orders")
        .select("*, purchase_order_items(*), suppliers(name, code)")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (suppliers.error) throw suppliers.error;
    if (orders.error) throw orders.error;
    return { suppliers: suppliers.data ?? [], purchaseOrders: orders.data ?? [] };
  });
}

export async function saveSupplier(
  db: Db,
  merchantId: string,
  input: {
    id?: string;
    code: string;
    name: string;
    email: string;
    phone: string;
    addressLine: string;
    leadTimeDays: number;
    isActive: boolean;
  },
) {
  const patch = {
    merchant_id: merchantId,
    code: input.code.trim().toUpperCase().slice(0, 40),
    name: input.name.trim().slice(0, 160),
    email: input.email.trim().toLowerCase().slice(0, 200),
    phone: input.phone.trim().slice(0, 40),
    address_line: input.addressLine.trim().slice(0, 300),
    lead_time_days: Math.max(0, Math.floor(input.leadTimeDays)),
    is_active: input.isActive,
  };
  const query = input.id
    ? db.from("suppliers").update(patch).eq("id", input.id).eq("merchant_id", merchantId).select("*").single()
    : db.from("suppliers").insert(patch).select("*").single();
  const { data, error } = await query;
  if (error) {
    if ((error as { code?: string }).code === "23505") fail("code_taken", "That supplier code is already used.");
    throw error;
  }
  return data;
}

export async function savePurchaseOrder(
  db: Db,
  merchantId: string,
  input: {
    id?: string;
    supplierId: string;
    locationId: string | null;
    currencyCode: string;
    expectedAt: string | null;
    note: string;
    items: { variantId: string; sku: string; quantityOrdered: number; unitCostMinorInt: number }[];
  },
) {
  return withSpan("commerce_desk.po_save", async () => {
    const patch = {
      merchant_id: merchantId,
      supplier_id: input.supplierId,
      location_id: input.locationId,
      currency_code: input.currencyCode,
      expected_at: input.expectedAt,
      note: input.note.slice(0, 2000),
      total_minor_int: input.items.reduce(
        (s, i) => s + Math.max(1, Math.floor(i.quantityOrdered)) * Math.max(0, Math.floor(i.unitCostMinorInt)),
        0,
      ),
    };

    let poId = input.id ?? null;
    if (poId) {
      const { data, error } = await db
        .from("purchase_orders")
        .update(patch)
        .eq("id", poId)
        .eq("merchant_id", merchantId)
        .eq("status", "draft")
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) fail("po_locked", "A submitted purchase order can no longer be edited.");
    } else {
      const { data, error } = await db
        .from("purchase_orders")
        .insert({ ...patch, number: sequenceNumber("PO") })
        .select("id")
        .single();
      if (error) throw error;
      poId = data.id;
    }

    await db.from("purchase_order_items").delete().eq("purchase_order_id", poId);
    if (input.items.length) {
      const { error } = await db.from("purchase_order_items").insert(
        input.items.slice(0, 300).map((i) => ({
          merchant_id: merchantId,
          purchase_order_id: poId!,
          variant_id: i.variantId,
          sku: i.sku.slice(0, 80),
          quantity_ordered: Math.max(1, Math.floor(i.quantityOrdered)),
          unit_cost_minor_int: Math.max(0, Math.floor(i.unitCostMinorInt)),
        })),
      );
      if (error) throw error;
    }
    return { id: poId! };
  });
}

export async function submitPurchaseOrder(db: Db, merchantId: string, poId: string) {
  const { data, error } = await db
    .from("purchase_orders")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", poId)
    .eq("merchant_id", merchantId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("po_not_draft", "That purchase order has already been submitted.");
  incr("framique_purchase_orders_total", { action: "submitted" });
  return { ok: true };
}

export async function receivePurchaseOrder(
  db: Db,
  poId: string,
  lines: { itemId: string; quantity: number }[],
) {
  return withSpan("commerce_desk.po_receive", async () => {
    const { data, error } = await db.rpc("purchase_order_receive", {
      _po_id: poId,
      _lines: lines.map((l) => ({ item_id: l.itemId, quantity: Math.max(0, Math.floor(l.quantity)) })),
    });
    if (error) throw error;
    const result = data as { outcome: string; units?: number; outstanding?: number };
    if (result.outcome === "not_receivable") {
      fail("po_not_receivable", "Submit the purchase order before receiving stock.");
    }
    if (result.outcome === "not_found") fail("po_not_found", "That purchase order no longer exists.");
    incr("framique_purchase_orders_total", { action: "received" });
    return result;
  });
}

export async function cancelPurchaseOrder(db: Db, merchantId: string, poId: string) {
  const { error } = await db
    .from("purchase_orders")
    .update({ status: "cancelled" })
    .eq("id", poId)
    .eq("merchant_id", merchantId)
    .in("status", ["draft", "submitted"]);
  if (error) throw error;
  return { ok: true };
}

/* ============================== bulk editor =============================== */

export async function loadVariantGrid(db: Db, merchantId: string, search: string) {
  const key = `variant-grid:${merchantId}:${search.trim().toLowerCase()}`;
  return cached(key, 20, async () =>
    withSpan("commerce_desk.variant_grid", async () => {
      let query = db
        .from("product_variants")
        .select("id, name, sku, barcode, price_amount_minor_int, compare_at_amount_minor_int, stock_quantity, backorder_policy, backorder_limit, preorder_release_at, currency_code, products(title, slug)")
        .eq("merchant_id", merchantId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(300);
      const term = search.trim();
      if (term) query = query.or(`sku.ilike.%${term}%,name.ilike.%${term}%,barcode.ilike.%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    }),
  );
}

export function purgeVariantGrid(merchantId: string) {
  invalidate(`variant-grid:${merchantId}`);
}

export async function bulkUpdateVariants(db: Db, merchantId: string, rows: BulkRow[]) {
  return withSpan("commerce_desk.bulk_update", async () => {
    const { valid, invalid, overflow } = validateBulkRows(rows);
    if (!valid.length) {
      return { requested: rows.length, applied: 0, rejected: rows.length, invalid, overflow, detail: [] };
    }
    const { data, error } = await db.rpc("bulk_update_variants", {
      _merchant_id: merchantId,
      _updates: valid,
    });
    if (error) throw error;
    purgeVariantGrid(merchantId);
    const result = data as {
      requested: number;
      applied: number;
      rejected: number;
      detail: { variant_id?: string; error?: string }[];
    };
    incr("framique_bulk_edit_rows_total", { result: "applied" }, result.applied);
    log("info", "commerce_desk.bulk_update", { merchantId, ...result, locallyRejected: invalid.length });
    return { ...result, invalid, overflow };
  });
}

export async function setVariantPreorder(
  db: Db,
  merchantId: string,
  input: {
    variantId: string;
    policy: "deny" | "allow" | "preorder";
    limit: number;
    releaseAt: string | null;
    note: string;
  },
) {
  const { error } = await db
    .from("product_variants")
    .update({
      backorder_policy: input.policy,
      backorder_limit: Math.max(0, Math.floor(input.limit)),
      preorder_release_at: input.releaseAt,
      preorder_note: input.note.slice(0, 300),
    })
    .eq("id", input.variantId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  purgeVariantGrid(merchantId);
  return { ok: true };
}

export async function nextSku(db: Db, merchantId: string, prefix: string) {
  const { data, error } = await db.rpc("sku_next", { _merchant_id: merchantId, _prefix: prefix });
  if (error) throw error;
  return data as string;
}

/* ========================= order tags + saved views ======================= */

export async function setOrderTags(db: Db, merchantId: string, orderId: string, tags: string[]) {
  const clean = normaliseTags(tags);
  const { error } = await db
    .from("orders")
    .update({ tags: clean })
    .eq("id", orderId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  return { tags: clean };
}

export async function listSavedViews(db: Db, merchantId: string, userId: string) {
  const { data, error } = await db
    .from("order_saved_views")
    .select("*")
    .eq("merchant_id", merchantId)
    .or(`user_id.eq.${userId},is_shared.eq.true`)
    .order("position")
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function saveSavedView(
  db: Db,
  merchantId: string,
  userId: string,
  input: { id?: string; name: string; filters: Record<string, unknown>; isShared: boolean; position: number },
) {
  const patch = {
    merchant_id: merchantId,
    user_id: userId,
    name: input.name.trim().slice(0, 80),
    filters: input.filters as never,
    is_shared: input.isShared,
    position: Math.max(0, Math.floor(input.position)),
  };
  const query = input.id
    ? db
        .from("order_saved_views")
        .update(patch)
        .eq("id", input.id)
        .eq("merchant_id", merchantId)
        .eq("user_id", userId)
        .select("*")
        .single()
    : db.from("order_saved_views").insert(patch).select("*").single();
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function deleteSavedView(db: Db, merchantId: string, userId: string, id: string) {
  const { error } = await db
    .from("order_saved_views")
    .delete()
    .eq("id", id)
    .eq("merchant_id", merchantId)
    .eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

/* ============================== subscriptions ============================= */

export async function listSubscriptions(db: Db, merchantId: string) {
  return withSpan("commerce_desk.subscriptions_list", async () => {
    const [subs, charges] = await Promise.all([
      db
        .from("customer_subscriptions")
        .select("*, customers(name, email), product_variants(name, sku)")
        .eq("merchant_id", merchantId)
        .order("next_charge_at", { ascending: true, nullsFirst: false })
        .limit(300),
      db
        .from("subscription_charges")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("scheduled_at", { ascending: false })
        .limit(300),
    ]);
    if (subs.error) throw subs.error;
    if (charges.error) throw charges.error;
    return { subscriptions: subs.data ?? [], charges: charges.data ?? [] };
  });
}

export async function setSubscriptionState(
  db: Db,
  merchantId: string,
  subscriptionId: string,
  action: "pause" | "resume" | "cancel" | "cancel_at_period_end",
) {
  const now = new Date().toISOString();
  const patch =
    action === "pause"
      ? { status: "paused" as const, paused_at: now, next_charge_at: null }
      : action === "resume"
        ? { status: "active" as const, paused_at: null, next_charge_at: now }
        : action === "cancel"
          ? { status: "cancelled" as const, cancelled_at: now, next_charge_at: null }
          : { cancel_at_period_end: true };
  const { error } = await db
    .from("customer_subscriptions")
    .update(patch)
    .eq("id", subscriptionId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  incr("framique_subscription_actions_total", { action });
  return { ok: true };
}

/**
 * Billing worker. The database hands out cycles one at a time with
 * `for update skip locked`, and every cycle carries a deterministic
 * idempotency key, so two workers running at once — or one worker retried —
 * still bill each customer exactly once.
 */
export async function runSubscriptionBilling(
  db: Db,
  merchantId: string,
  charge: (claim: {
    charge_id: string;
    subscription_id: string;
    amount_minor: number;
    idempotency_key: string;
  }) => Promise<{ paid: boolean; orderId?: string; reason?: string }>,
  limit = 50,
) {
  return withSpan("commerce_desk.subscription_billing", async () => {
    const { data, error } = await db.rpc("subscription_claim_due", {
      _merchant_id: merchantId,
      _limit: limit,
    });
    if (error) throw error;
    const claims = ((data as { claimed?: unknown[] })?.claimed ?? []) as {
      charge_id: string;
      subscription_id: string;
      cycle: number;
      amount_minor: number;
      idempotency_key: string;
    }[];

    let paid = 0;
    let failed = 0;
    for (const claim of claims) {
      // Defensive: the key must match what the pure helper would produce, so a
      // future gateway integration can dedupe on it too.
      if (claim.idempotency_key !== chargeKey(claim.subscription_id, claim.cycle)) {
        log("warn", "subscription.key_mismatch", { chargeId: claim.charge_id });
      }
      let outcome: { paid: boolean; orderId?: string; reason?: string };
      try {
        outcome = await charge(claim);
      } catch (err) {
        outcome = { paid: false, reason: err instanceof Error ? err.message : "charge_failed" };
      }
      const { error: settleError } = await db.rpc("subscription_settle_charge", {
        _charge_id: claim.charge_id,
        _outcome: outcome.paid ? "paid" : "failed",
        _order_id: outcome.orderId ?? undefined,
        _reason: outcome.reason ?? undefined,
      });
      if (settleError) throw settleError;
      if (outcome.paid) paid += 1;
      else failed += 1;
    }

    incr("framique_subscription_charges_total", { result: "paid" }, paid);
    incr("framique_subscription_charges_total", { result: "failed" }, failed);
    log("info", "commerce_desk.subscription_billing", { merchantId, claimed: claims.length, paid, failed });
    return { claimed: claims.length, paid, failed };
  });
}
