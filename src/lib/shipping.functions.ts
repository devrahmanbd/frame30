import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

const money = z.number().int().min(0).max(100_000_000);

async function merchantOf(context: { supabase: never; userId: string }) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(context.supabase, context.userId);
}

/** Full shipping desk payload: shipments, carriers, rate table, COD, DLQ. */
export const shippingDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listShipments, listCarriers, listCodSettlements, listWebhookEvents } = await import(
      "./courier.server"
    );
    const { loadRateTable } = await import("./shipping-rates.server");
    const merchantId = await merchantOf(context as never);
    const [shipments, carriers, table, cod, dlq] = await Promise.all([
      listShipments(context.supabase, merchantId),
      listCarriers(context.supabase, merchantId),
      loadRateTable(context.supabase, merchantId),
      listCodSettlements(context.supabase, merchantId),
      listWebhookEvents(context.supabase, merchantId),
    ]);
    return { shipments, carriers, zones: table.zones, rules: table.rules, cod, dlq };
  });

export const quoteShippingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        carrierCode: z.string().min(2).max(40),
        city: z.string().max(80).nullable(),
        weightGrams: z.number().int().min(1).max(50_000),
        isCod: z.boolean(),
        codAmountMinorInt: money,
        orderTotalMinorInt: money,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { quote } = await import("./shipping-rates.server");
    const { rateLimit, RateLimitError } = await import("./rate-limit.server");
    const merchantId = await merchantOf(context as never);
    const verdict = await rateLimit("shipping.quote", merchantId);
    if (!verdict.allowed) throw new RateLimitError("shipping.quote", verdict.reset_at);
    return quote(context.supabase, merchantId, data);
  });

export const saveZoneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        code: z.string().min(2).max(40),
        nameEn: z.string().min(1).max(80),
        nameBn: z.string().max(80).default(""),
        districts: z.array(z.string().max(60)).max(100),
        isDefault: z.boolean(),
        enabled: z.boolean(),
        priority: z.number().int().min(1).max(999),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveZone } = await import("./shipping-rates.server");
    return saveZone(context.supabase, await merchantOf(context as never), data);
  });

export const saveRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        zoneId: z.string().uuid(),
        carrierCode: z.string().min(2).max(40).nullable(),
        minWeightGrams: z.number().int().min(0).max(100_000),
        maxWeightGrams: z.number().int().min(1).max(100_000),
        baseMinorInt: money,
        perKgMinorInt: money,
        codFeeBp: z.number().int().min(0).max(2000),
        freeOverMinorInt: money.nullable(),
        enabled: z.boolean(),
        priority: z.number().int().min(1).max(999),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveRule } = await import("./shipping-rates.server");
    return saveRule(context.supabase, await merchantOf(context as never), data);
  });

export const deleteRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ruleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteRule } = await import("./shipping-rates.server");
    return deleteRule(context.supabase, await merchantOf(context as never), data.ruleId);
  });

export const schedulePickupFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ shipmentId: z.string().uuid(), slotStart: z.string().min(4).max(40) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { schedulePickup } = await import("./courier.server");
    return schedulePickup(
      context.supabase,
      await merchantOf(context as never),
      data.shipmentId,
      data.slotStart,
    );
  });

export const cancelShipmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { cancelShipment } = await import("./courier.server");
    return cancelShipment(context.supabase, await merchantOf(context as never), data.shipmentId);
  });

export const reconcileCodFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        shipmentId: z.string().uuid(),
        reportedMinorInt: money,
        reference: z.string().max(80).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { reconcileCod } = await import("./courier.server");
    return reconcileCod(
      context.supabase,
      await merchantOf(context as never),
      data.shipmentId,
      data.reportedMinorInt,
      data.reference ?? null,
    );
  });

export const setCarrierModeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        carrierId: z.string().uuid(),
        enabled: z.boolean().optional(),
        apiMode: z.enum(["mock", "sandbox", "live"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setCarrierMode } = await import("./courier.server");
    return setCarrierMode(context.supabase, await merchantOf(context as never), data.carrierId, {
      enabled: data.enabled,
      apiMode: data.apiMode,
    });
  });

export const saveCarrierCredentialsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requirePermission("settings.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        carrierId: z.string().uuid(),
        credentials: z.record(z.unknown()),
        baseUrl: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveCarrierCredentials } = await import("./courier.server");
    return saveCarrierCredentials(
      context.supabase,
      await merchantOf(context as never),
      data.carrierId,
      data.credentials,
      data.baseUrl,
    );
  });

/** Anonymous parcel tracking by opaque token. PII-minimal by construction. */
export const trackParcelFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const verdict = await rateLimit("shipping.track", `track:${data.token.slice(0, 12)}`);
    if (!verdict.allowed) return { found: false as const, rateLimited: true as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.rpc("shipment_tracking_public", {
      _token: data.token,
    });
    if (error) return { found: false as const, rateLimited: false as const };
    const parsed = (row ?? null) as {
      status?: string;
      carrier_code?: string;
      events?: { status: string; occurred_at: string }[];
      last_event_at?: string | null;
      city?: string | null;
    } | null;
    if (!parsed || !parsed.status) return { found: false as const, rateLimited: false as const };
    return { found: true as const, rateLimited: false as const, parcel: parsed };
  });

/** Manual replay of a parked courier callback — tenant-scoped and rate-limited. */
export const replayCourierEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { replayWebhookEvent } = await import("./courier.server");
    return replayWebhookEvent(
      context.supabase,
      await merchantOf(context as never),
      data.eventId,
    );
  });
