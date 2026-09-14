import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const minor = z.number().int().min(0);

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

/* --------------------------------- inventory --------------------------------- */

export const inventoryLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadLocations, loadLevels, loadTransfers, loadFulfilments } = await import(
      "./inventory.server"
    );
    const merchantId = await scope(context.supabase, context.userId);
    const [locations, levels, transfers, fulfilments] = await Promise.all([
      loadLocations(context.supabase, merchantId),
      loadLevels(context.supabase, merchantId),
      loadTransfers(context.supabase, merchantId),
      loadFulfilments(context.supabase, merchantId),
    ]);
    return { merchantId, locations, levels, transfers, fulfilments };
  });

export const inventorySaveLocationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: uuid.optional(),
        name: z.string().min(1).max(120),
        code: z.string().min(1).max(40),
        addressLine: z.string().max(300).nullish(),
        city: z.string().max(120).nullish(),
        isDefault: z.boolean().optional(),
        active: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveLocation } = await import("./inventory.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveLocation(context.supabase, merchantId, data);
  });

export const inventorySetLevelFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        variantId: uuid,
        locationId: uuid,
        onHand: z.number().int().min(0),
        lowStockThreshold: z.number().int().min(0).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setLevel } = await import("./inventory.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setLevel(context.supabase, merchantId, data);
  });


export const inventoryTransferFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fromLocationId: uuid,
        toLocationId: uuid,
        items: z.array(z.object({ variantId: uuid, quantity: z.number().int().min(1) })).min(1),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createTransfer } = await import("./inventory.server");
    const merchantId = await scope(context.supabase, context.userId);
    return createTransfer(context.supabase, merchantId, context.userId, data);
  });

/* -------------------------------- fulfilment -------------------------------- */

export const fulfilmentCreateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: uuid,
        locationId: uuid.nullish(),
        items: z.array(z.object({ orderItemId: uuid, quantity: z.number().int().min(1) })).min(1),
        idempotencyKey: z.string().min(8).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createFulfilment } = await import("./inventory.server");
    const merchantId = await scope(context.supabase, context.userId);
    return createFulfilment(context.supabase, merchantId, context.userId, data);
  });

export const fulfilmentAdvanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fulfilmentId: uuid,
        status: z.enum(["packed", "shipped", "delivered", "cancelled"]),
        trackingNumber: z.string().max(120).optional(),
        carrierCode: z.string().max(60).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { advanceFulfilment } = await import("./inventory.server");
    const merchantId = await scope(context.supabase, context.userId);
    return advanceFulfilment(context.supabase, merchantId, context.userId, data);
  });

/* -------------------------------- gift cards -------------------------------- */

export const giftCardsLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadGiftCards } = await import("./gift-cards.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, cards: await loadGiftCards(context.supabase, merchantId) };
  });

export const giftCardIssueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        amountMinorInt: minor.min(1),
        expiresAt: z.string().nullish(),
        email: z.string().email().nullish(),
        phone: z.string().max(30).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { issueGiftCard } = await import("./gift-cards.server");
    const merchantId = await scope(context.supabase, context.userId);
    return issueGiftCard(context.supabase, merchantId, context.userId, data);
  });

export const giftCardVoidFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ giftCardId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { voidGiftCard } = await import("./gift-cards.server");
    const merchantId = await scope(context.supabase, context.userId);
    return voidGiftCard(context.supabase, merchantId, context.userId, data.giftCardId);
  });

/* ------------------------------ returns/disputes ------------------------------ */

export const returnsLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadReturns, loadDisputes } = await import("./returns.server");
    const merchantId = await scope(context.supabase, context.userId);
    const [returns, disputes] = await Promise.all([
      loadReturns(context.supabase, merchantId),
      loadDisputes(context.supabase, merchantId),
    ]);
    return { merchantId, returns, disputes };
  });

export const returnAdvanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        returnId: uuid,
        status: z.enum(["approved", "rejected", "received", "refunded", "cancelled"]),
        note: z.string().max(300).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { advanceReturn } = await import("./returns.server");
    const merchantId = await scope(context.supabase, context.userId);
    return advanceReturn(context.supabase, merchantId, context.userId, data);
  });

export const disputeAdvanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        disputeId: uuid,
        status: z.enum(["evidence_submitted", "won", "lost", "withdrawn"]),
        note: z.string().max(300).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { advanceDispute } = await import("./returns.server");
    const merchantId = await scope(context.supabase, context.userId);
    return advanceDispute(context.supabase, merchantId, context.userId, data);
  });

/* ------------------------------- carts/bundles ------------------------------- */

export const cartsLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCarts, cartStats } = await import("./carts.server");
    const merchantId = await scope(context.supabase, context.userId);
    const carts = await loadCarts(context.supabase, merchantId);
    return { merchantId, carts, stats: cartStats(carts) };
  });

export const cartRecoveryFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cartIds: z.array(uuid).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { sendRecovery } = await import("./carts.server");
    const merchantId = await scope(context.supabase, context.userId);
    return sendRecovery(context.supabase, merchantId, context.userId, data.cartIds);
  });

export const bundlesLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadBundles } = await import("./bundles.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, bundles: await loadBundles(context.supabase, merchantId) };
  });

export const bundleSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        productId: uuid,
        pricingMode: z.enum(["fixed", "percent"]),
        fixedPriceMinorInt: minor.nullish(),
        percentOff: z.number().int().min(0).max(100).optional(),
        active: z.boolean().optional(),
        components: z
          .array(z.object({ variantId: uuid, quantity: z.number().int().min(1) }))
          .min(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveBundle } = await import("./bundles.server");
    const merchantId = await scope(context.supabase, context.userId);
    return saveBundle(context.supabase, merchantId, context.userId, data);
  });

export const bundleDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bundleId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteBundle } = await import("./bundles.server");
    const merchantId = await scope(context.supabase, context.userId);
    await deleteBundle(context.supabase, merchantId, data.bundleId);
    return { ok: true };
  });

/* ------------------------------ customers/codes ------------------------------ */

export const customersLoadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ term: z.string().max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadCustomers, loadSegments } = await import("./bundles.server");
    const merchantId = await scope(context.supabase, context.userId);
    const [customers, segments] = await Promise.all([
      loadCustomers(context.supabase, merchantId, data.term ?? ""),
      loadSegments(context.supabase, merchantId),
    ]);
    return { merchantId, customers, segments };
  });

export const discountBatchesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadBatches } = await import("./discount-codes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { merchantId, batches: await loadBatches(context.supabase, merchantId) };
  });

export const discountGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        prefix: z.string().max(12),
        count: z.number().int().min(1).max(500),
        type: z.enum(["fixed", "percent", "free_shipping"]),
        amountMinorInt: minor.optional(),
        percentOff: z.number().int().min(0).max(100).optional(),
        minSubtotalMinorInt: minor.optional(),
        maxDiscountMinorInt: minor.nullish(),
        usageLimit: z.number().int().min(1).nullable(),
        perCustomerLimit: z.number().int().min(1).nullable(),
        expiresAt: z.string().nullish(),
        batchLabel: z.string().min(1).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { generateCodes } = await import("./discount-codes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return generateCodes(context.supabase, merchantId, context.userId, data);
  });

/* --------------------------------- invoices --------------------------------- */

/** Mints the legal invoice number for an order (idempotent in the RPC). */
export const invoiceIssueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { issueOrderInvoice } = await import("./inventory.server");
    const merchantId = await scope(context.supabase, context.userId);
    await issueOrderInvoice(context.supabase, merchantId, context.userId, data.orderId);
    const { loadInvoiceDocument } = await import("./invoices.server");
    return loadInvoiceDocument(context.supabase, merchantId, data.orderId);
  });

/** Reads the printable invoice document, or null when none is issued yet. */
export const invoiceDocumentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { loadInvoiceDocument } = await import("./invoices.server");
    const merchantId = await scope(context.supabase, context.userId);
    return loadInvoiceDocument(context.supabase, merchantId, data.orderId);
  });
