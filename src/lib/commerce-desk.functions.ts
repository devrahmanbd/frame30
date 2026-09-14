/**
 * Server functions for the commerce back office.
 *
 * Every staff entry point carries the Supabase bearer middleware, resolves
 * tenancy from the session, validates input with Zod and passes through a
 * named rate-limit bucket. The single public entry point (a shared invoice
 * link) is throttled by token and returns only what the buyer needs to see.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const uuid = z.string().uuid();
const minor = z.number().int().min(0).max(1_000_000_000);

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

async function guard(bucket: Parameters<typeof import("./rate-limit.server").enforceRateLimit>[0], key: string) {
  const { enforceRateLimit } = await import("./rate-limit.server");
  await enforceRateLimit(bucket, key);
}

/* ============================== draft orders ============================== */

const draftItem = z.object({
  variantId: uuid.nullable(),
  title: z.string().min(1).max(200),
  variantName: z.string().max(120).default(""),
  sku: z.string().max(80).default(""),
  quantity: z.number().int().min(1).max(9999),
  unitPriceMinorInt: minor,
});

export const draftOrdersLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.drafts", `${merchantId}:${context.userId}`);
    const { listDraftOrders } = await import("./commerce-desk.server");
    return { merchantId, drafts: await listDraftOrders(context.supabase, merchantId) };
  });

export const draftOrderSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        customerId: uuid.nullish(),
        customerName: z.string().max(160).default(""),
        customerEmail: z.string().max(200).default(""),
        customerPhone: z.string().max(40).default(""),
        addressLine: z.string().max(300).default(""),
        city: z.string().max(120).default(""),
        postcode: z.string().max(20).default(""),
        note: z.string().max(2000).default(""),
        currencyCode: z.string().min(3).max(3).default("BDT"),
        discountMinorInt: minor.default(0),
        shippingMinorInt: minor.default(0),
        vatMinorInt: minor.default(0),
        expiresAt: z.string().datetime().nullish(),
        items: z.array(draftItem).max(200).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.drafts", `${merchantId}:${context.userId}`);
    const { saveDraftOrder } = await import("./commerce-desk.server");
    return saveDraftOrder(context.supabase, merchantId, {
      ...data,
      customerId: data.customerId ?? null,
      expiresAt: data.expiresAt ?? null,
    });
  });

export const draftOrderActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, action: z.enum(["send", "convert", "cancel"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.drafts", `${merchantId}:${context.userId}`);
    const { sendDraftOrder, convertDraftOrder, cancelDraftOrder } = await import("./commerce-desk.server");
    if (data.action === "send") return { action: "send", ...(await sendDraftOrder(context.supabase, merchantId, data.id)) };
    if (data.action === "convert") return { action: "convert", ...(await convertDraftOrder(context.supabase, data.id)) };
    return { action: "cancel", ...(await cancelDraftOrder(context.supabase, merchantId, data.id)) };
  });

/** Public invoice link. Token-scoped, throttled, and never exposes the buyer's details back. */
export const draftOrderPublicFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{32,64}$/) }).parse(d))
  .handler(async ({ data }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const verdict = await rateLimit("order.lookup", `draft:${data.token}`);
    if (!verdict.allowed) return { found: false as const, throttled: true };
    const { publicClient } = await import("./pricing.server");
    const db = publicClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data: result } = await db.rpc("draft_order_public", { _token: data.token });
    return { ...(result as Record<string, unknown>), throttled: false };
  });

export const draftOrderAcceptFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().regex(/^[a-f0-9]{32,64}$/) }).parse(d))
  .handler(async ({ data }) => {
    await guard("checkout.place", `draft-accept:${data.token}`);
    const { publicClient } = await import("./pricing.server");
    const db = publicClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    };
    const { data: result, error } = await db.rpc("draft_order_accept", { _token: data.token });
    if (error) return { outcome: "error" as const };
    return result as { outcome: string };
  });

/* ============================== price lists =============================== */

export const pricingLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.pricing", `${merchantId}:${context.userId}`);
    const { loadPricing } = await import("./commerce-desk.server");
    return { merchantId, ...(await loadPricing(context.supabase, merchantId)) };
  });

export const priceListSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        code: z.string().min(2).max(40),
        name: z.string().min(2).max(120),
        kind: z.enum(["fixed", "percent_off"]),
        adjustmentBp: z.number().int().min(0).max(10000).default(0),
        currencyCode: z.string().min(3).max(3).default("BDT"),
        isActive: z.boolean().default(true),
        priority: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.pricing", `${merchantId}:${context.userId}`);
    const { savePriceList } = await import("./commerce-desk.server");
    return savePriceList(context.supabase, merchantId, data);
  });

export const priceListItemSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        priceListId: uuid,
        variantId: uuid,
        minQuantity: z.number().int().min(1).max(100000).default(1),
        priceMinorInt: minor,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.pricing", `${merchantId}:${context.userId}`);
    const { savePriceListItem } = await import("./commerce-desk.server");
    return savePriceListItem(context.supabase, merchantId, data);
  });

export const priceListItemDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.pricing", `${merchantId}:${context.userId}`);
    const { deletePriceListItem } = await import("./commerce-desk.server");
    return deletePriceListItem(context.supabase, merchantId, data.id);
  });

export const b2bAccountSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        customerId: uuid,
        companyName: z.string().max(160).default(""),
        taxId: z.string().max(60).default(""),
        priceListId: uuid.nullable().default(null),
        netTermsDays: z.number().int().min(0).max(180).default(0),
        creditLimitMinorInt: minor.default(0),
        isApproved: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.pricing", `${merchantId}:${context.userId}`);
    const { saveB2bAccount } = await import("./commerce-desk.server");
    return saveB2bAccount(context.supabase, merchantId, data);
  });

/* ============================== purchasing ================================ */

export const purchasingLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.purchasing", `${merchantId}:${context.userId}`);
    const { loadPurchasing } = await import("./commerce-desk.server");
    return { merchantId, ...(await loadPurchasing(context.supabase, merchantId)) };
  });

export const supplierSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        code: z.string().min(2).max(40),
        name: z.string().min(2).max(160),
        email: z.string().max(200).default(""),
        phone: z.string().max(40).default(""),
        addressLine: z.string().max(300).default(""),
        leadTimeDays: z.number().int().min(0).max(365).default(0),
        isActive: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.purchasing", `${merchantId}:${context.userId}`);
    const { saveSupplier } = await import("./commerce-desk.server");
    return saveSupplier(context.supabase, merchantId, data);
  });

export const purchaseOrderSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        supplierId: uuid,
        locationId: uuid.nullable().default(null),
        currencyCode: z.string().min(3).max(3).default("BDT"),
        expectedAt: z.string().nullable().default(null),
        note: z.string().max(2000).default(""),
        items: z
          .array(
            z.object({
              variantId: uuid,
              sku: z.string().max(80).default(""),
              quantityOrdered: z.number().int().min(1).max(100000),
              unitCostMinorInt: minor,
            }),
          )
          .max(300)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.purchasing", `${merchantId}:${context.userId}`);
    const { savePurchaseOrder } = await import("./commerce-desk.server");
    return savePurchaseOrder(context.supabase, merchantId, data);
  });

export const purchaseOrderActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        action: z.enum(["submit", "cancel", "receive"]),
        lines: z
          .array(z.object({ itemId: uuid, quantity: z.number().int().min(0).max(100000) }))
          .max(300)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.purchasing", `${merchantId}:${context.userId}`);
    const { submitPurchaseOrder, cancelPurchaseOrder, receivePurchaseOrder } = await import(
      "./commerce-desk.server"
    );
    if (data.action === "submit") return submitPurchaseOrder(context.supabase, merchantId, data.id);
    if (data.action === "cancel") return cancelPurchaseOrder(context.supabase, merchantId, data.id);
    return receivePurchaseOrder(context.supabase, data.id, data.lines);
  });

/* ============================== bulk editor =============================== */

export const variantGridFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().max(80).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.bulk_edit", `${merchantId}:${context.userId}`);
    const { loadVariantGrid } = await import("./commerce-desk.server");
    return { merchantId, rows: await loadVariantGrid(context.supabase, merchantId, data.search) };
  });

export const bulkUpdateVariantsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              variant_id: uuid,
              price_minor_int: minor.optional(),
              compare_at_minor_int: minor.optional(),
              stock_quantity: z.number().int().min(0).max(10_000_000).optional(),
              sku: z.string().max(80).optional(),
              barcode: z.string().max(40).optional(),
            }),
          )
          .min(1)
          .max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.bulk_apply", `${merchantId}:${context.userId}`);
    const { bulkUpdateVariants } = await import("./commerce-desk.server");
    return bulkUpdateVariants(context.supabase, merchantId, data.rows);
  });

export const variantPreorderSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        variantId: uuid,
        policy: z.enum(["deny", "allow", "preorder"]),
        limit: z.number().int().min(0).max(1_000_000).default(0),
        releaseAt: z.string().nullable().default(null),
        note: z.string().max(300).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.bulk_edit", `${merchantId}:${context.userId}`);
    const { setVariantPreorder } = await import("./commerce-desk.server");
    return setVariantPreorder(context.supabase, merchantId, data);
  });

export const skuNextFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ prefix: z.string().max(24).default("SKU") }).parse(d))
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.codegen", `${merchantId}:${context.userId}`);
    const { nextSku } = await import("./commerce-desk.server");
    const sku = await nextSku(context.supabase, merchantId, data.prefix);
    const { ean13 } = await import("./commerce-desk");
    return { sku, barcode: ean13(sku.replace(/\D/g, "") || Date.now().toString().slice(-8)) };
  });

/* ========================= order tags + saved views ======================= */

export const orderTagsSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderId: uuid, tags: z.array(z.string().max(40)).max(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.order_tags", `${merchantId}:${context.userId}`);
    const { setOrderTags } = await import("./commerce-desk.server");
    return setOrderTags(context.supabase, merchantId, data.orderId, data.tags);
  });

export const savedViewsLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { listSavedViews } = await import("./commerce-desk.server");
    return { merchantId, views: await listSavedViews(context.supabase, merchantId, context.userId) };
  });

export const savedViewSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        name: z.string().min(1).max(80),
        filters: z.record(z.string(), z.unknown()).default({}),
        isShared: z.boolean().default(false),
        position: z.number().int().min(0).max(100).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.order_tags", `${merchantId}:${context.userId}`);
    const { saveSavedView } = await import("./commerce-desk.server");
    return saveSavedView(context.supabase, merchantId, context.userId, data);
  });

export const savedViewDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { deleteSavedView } = await import("./commerce-desk.server");
    return deleteSavedView(context.supabase, merchantId, context.userId, data.id);
  });

/* ============================== subscriptions ============================= */

export const subscriptionsLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.subscriptions", `${merchantId}:${context.userId}`);
    const { listSubscriptions } = await import("./commerce-desk.server");
    return { merchantId, ...(await listSubscriptions(context.supabase, merchantId)) };
  });

export const subscriptionActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid,
        action: z.enum(["pause", "resume", "cancel", "cancel_at_period_end"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.subscriptions", `${merchantId}:${context.userId}`);
    const { setSubscriptionState } = await import("./commerce-desk.server");
    return setSubscriptionState(context.supabase, merchantId, data.id, data.action);
  });

/**
 * Runs the due cycles now. Charges are settled through the store's configured
 * method; cash on delivery settles immediately as an invoice to collect, while
 * anything else waits for the gateway and is retried by the dunning schedule.
 */
export const subscriptionBillingRunFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    await guard("commerce.subscription_run", `${merchantId}:${context.userId}`);
    const { runSubscriptionBilling } = await import("./commerce-desk.server");
    return runSubscriptionBilling(context.supabase, merchantId, async (claim) => ({
      paid: claim.amount_minor === 0,
      reason: claim.amount_minor === 0 ? undefined : "awaiting_payment",
    }));
  });
