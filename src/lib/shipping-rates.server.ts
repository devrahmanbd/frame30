/**
 * Shipping rate desk: zones, weight rules and deterministic quotes.
 *
 * The price a buyer sees is always recomputed here and stored in
 * `shipment_quotes`; the client never sends a delivery amount. Reads are
 * cached per tenant with stale-while-revalidate, writes bust the key.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, invalidate } from "./cache.server";
import { withSpan, incr, log } from "./observability.server";
import { rateLimit, RateLimitError } from "./rate-limit.server";
import { DbTimeoutError, withDbTimeout } from "./db-timeout.server";
import {
  DEFAULT_ZONES,
  computeQuote,
  type QuoteBreakdown,
  type RateRuleLike,
  type ZoneLike,
} from "./shipping-rates";

type Client = SupabaseClient<Database>;

export class ShippingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}

export type ZoneRow = Database["public"]["Tables"]["shipping_zones"]["Row"];
export type RuleRow =
  Database["public"]["Tables"]["shipping_rate_rules"]["Row"];

const CACHE_TTL_SECONDS = 60;
const rateKey = (merchantId: string) => `shipping-rates:${merchantId}`;

function toZoneLike(row: ZoneRow): ZoneLike {
  return {
    id: row.id,
    code: row.code,
    districts: row.districts ?? [],
    isDefault: row.is_default,
    enabled: row.enabled,
    priority: row.priority,
  };
}

function toRuleLike(row: RuleRow): RateRuleLike {
  return {
    id: row.id,
    zoneId: row.zone_id,
    carrierCode: row.carrier_code,
    minWeightGrams: row.min_weight_grams,
    maxWeightGrams: row.max_weight_grams,
    baseMinorInt: row.base_minor_int,
    perKgMinorInt: row.per_kg_minor_int,
    codFeeBp: row.cod_fee_bp,
    freeOverMinorInt: row.free_over_minor_int,
    enabled: row.enabled,
    priority: row.priority,
  };
}

/** A store with no zones still has to be able to sell, so seed a working table. */
async function seedDefaults(merchantId: string) {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  // Bounded like the read path: a stall seeds nothing and fails closed as
  // rates_unavailable (the caller quotes no rate) instead of hanging.
  let zones: ZoneRow[] | null = null;
  let error: { message?: string } | null = null;
  try {
    ({ data: zones, error } = (await withDbTimeout(
      () =>
        supabaseAdmin
          .from("shipping_zones")
          .insert(
            DEFAULT_ZONES.map((z) => ({
              merchant_id: merchantId,
              code: z.code,
              name_en: z.nameEn,
              name_bn: z.nameBn,
              districts: [...z.districts],
              is_default: z.isDefault,
              priority: z.priority,
            })),
          )
          .select("*") as unknown as Promise<{
          data: ZoneRow[] | null;
          error: { message?: string } | null;
        }>,
      { op: "shipping.seed_zones", timeoutMs: 5000 },
    )) as { data: ZoneRow[] | null; error: { message?: string } | null });
  } catch (err) {
    if (err instanceof DbTimeoutError) {
      log("warn", "shipping.seed_timeout", {
        merchantId,
        timeoutMs: err.timeoutMs,
      });
      throw new ShippingError(
        "rates_unavailable",
        "Shipping rates are temporarily unavailable",
      );
    }
    throw err;
  }
  if (error) throw error;

  const rules = (zones ?? []).map((zone) => {
    const preset = DEFAULT_ZONES.find((z) => z.code === zone.code)!;
    return {
      merchant_id: merchantId,
      zone_id: zone.id,
      carrier_code: null,
      min_weight_grams: 0,
      max_weight_grams: 30_000,
      base_minor_int: preset.base,
      per_kg_minor_int: preset.perKg,
      cod_fee_bp: preset.codBp,
      priority: 100,
    };
  });
  let ruleRows: RuleRow[] | null = null;
  let ruleError: { message?: string } | null = null;
  try {
    ({ data: ruleRows, error: ruleError } = (await withDbTimeout(
      () =>
        supabaseAdmin
          .from("shipping_rate_rules")
          .insert(rules)
          .select("*") as unknown as Promise<{
          data: RuleRow[] | null;
          error: { message?: string } | null;
        }>,
      { op: "shipping.seed_rules", timeoutMs: 5000 },
    )) as { data: RuleRow[] | null; error: { message?: string } | null });
  } catch (err) {
    if (err instanceof DbTimeoutError) {
      log("warn", "shipping.seed_timeout", {
        merchantId,
        timeoutMs: err.timeoutMs,
      });
      throw new ShippingError(
        "rates_unavailable",
        "Shipping rates are temporarily unavailable",
      );
    }
    throw err;
  }
  if (ruleError) throw ruleError;
  log("info", "shipping.defaults_seeded", { zones: zones?.length ?? 0 });
  return { zones: zones ?? [], rules: ruleRows ?? [] };
}

export async function loadRateTable(
  supabase: Client,
  merchantId: string,
): Promise<{ zones: ZoneRow[]; rules: RuleRow[] }> {
  return cached(
    rateKey(merchantId),
    CACHE_TTL_SECONDS,
    async () => {
      // Money-path reads (checkout previews price from this table): bounded
      // so a stall fails closed as rates_unavailable instead of hanging the
      // quote. Callers treat any throw as "no rate" — never a guessed price.
      let zonesRes: { data: ZoneRow[] | null; error: unknown };
      let rulesRes: { data: RuleRow[] | null; error: unknown };
      try {
        [zonesRes, rulesRes] = (await withDbTimeout(
          () =>
            Promise.all([
              supabase
                .from("shipping_zones")
                .select("*")
                .eq("merchant_id", merchantId)
                .order("priority"),
              supabase
                .from("shipping_rate_rules")
                .select("*")
                .eq("merchant_id", merchantId)
                .order("priority"),
            ]) as unknown as Promise<
              [
                { data: ZoneRow[] | null; error: unknown },
                { data: RuleRow[] | null; error: unknown },
              ]
            >,
          { op: "shipping.rate_table", timeoutMs: 5000 },
        )) as [
          { data: ZoneRow[] | null; error: unknown },
          { data: RuleRow[] | null; error: unknown },
        ];
      } catch (err) {
        if (err instanceof DbTimeoutError) {
          log("warn", "shipping.rate_table_timeout", {
            merchantId,
            timeoutMs: err.timeoutMs,
          });
          throw new ShippingError(
            "rates_unavailable",
            "Shipping rates are temporarily unavailable",
          );
        }
        throw err;
      }
      if (zonesRes.error) throw zonesRes.error;
      if (rulesRes.error) throw rulesRes.error;
      if ((zonesRes.data ?? []).length === 0) return seedDefaults(merchantId);
      return { zones: zonesRes.data ?? [], rules: rulesRes.data ?? [] };
    },
    { staleSeconds: 120 },
  );
}

export function bustRateTable(merchantId: string) {
  invalidate(rateKey(merchantId));
}

export type QuoteArgs = {
  carrierCode: string;
  city: string | null;
  weightGrams: number;
  isCod: boolean;
  codAmountMinorInt: number;
  orderTotalMinorInt: number;
};

/** Quote without persisting — used by checkout previews and the admin desk. */
export async function quote(
  supabase: Client,
  merchantId: string,
  args: QuoteArgs,
): Promise<QuoteBreakdown> {
  return withSpan("shipping.quote", async () => {
    const table = await loadRateTable(supabase, merchantId);
    const result = computeQuote(
      table.zones.map(toZoneLike),
      table.rules.map(toRuleLike),
      {
        city: args.city,
        weightGrams: args.weightGrams,
        isCod: args.isCod,
        codAmountMinorInt: args.codAmountMinorInt,
        orderTotalMinorInt: args.orderTotalMinorInt,
        carrierCode: args.carrierCode,
      },
    );
    incr("framique_shipping_quote_total", {
      carrier: args.carrierCode,
      outcome: result.fallback ? "fallback" : "matched",
    });
    return result;
  });
}

/** Quote and persist, so the shipment and the order agree on one number. */
export async function persistQuote(
  supabase: Client,
  merchantId: string,
  orderId: string | null,
  args: QuoteArgs,
): Promise<{ quoteId: string | null; breakdown: QuoteBreakdown }> {
  const breakdown = await quote(supabase, merchantId, args);
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("shipment_quotes")
    .insert({
      merchant_id: merchantId,
      order_id: orderId,
      zone_id: breakdown.zoneId,
      rule_id: breakdown.ruleId,
      carrier_code: args.carrierCode,
      weight_grams: Math.max(0, Math.round(args.weightGrams)),
      amount_minor_int: breakdown.shippingMinorInt,
      cod_fee_minor_int: breakdown.codFeeMinorInt,
      breakdown:
        breakdown as unknown as Database["public"]["Tables"]["shipment_quotes"]["Insert"]["breakdown"],
      stale: breakdown.fallback,
    })
    .select("id")
    .single();
  if (error) {
    log("warn", "shipping.quote_persist_failed", { code: error.code });
    return { quoteId: null, breakdown };
  }
  return { quoteId: data.id, breakdown };
}

export type ZoneInput = {
  id?: string | null;
  code: string;
  nameEn: string;
  nameBn: string;
  districts: string[];
  isDefault: boolean;
  enabled: boolean;
  priority: number;
};

export async function saveZone(
  supabase: Client,
  merchantId: string,
  input: ZoneInput,
) {
  const verdict = await rateLimit("shipping.zone_write", merchantId);
  if (!verdict.allowed)
    throw new RateLimitError("shipping.zone_write", verdict.reset_at);
  if (!/^[a-z0-9_]{2,40}$/.test(input.code)) {
    throw new ShippingError(
      "zone_code_invalid",
      "Zone code must be lowercase letters, digits or _",
    );
  }
  const payload = {
    merchant_id: merchantId,
    code: input.code,
    name_en: input.nameEn.trim().slice(0, 80),
    name_bn: input.nameBn.trim().slice(0, 80),
    districts: input.districts
      .map((d) => d.trim())
      .filter(Boolean)
      .slice(0, 100),
    is_default: input.isDefault,
    enabled: input.enabled,
    priority: Math.max(1, Math.min(999, Math.round(input.priority))),
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase
        .from("shipping_zones")
        .update(payload)
        .eq("id", input.id)
        .eq("merchant_id", merchantId)
    : supabase.from("shipping_zones").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  bustRateTable(merchantId);
  return data;
}

export type RuleInput = {
  id?: string | null;
  zoneId: string;
  carrierCode: string | null;
  minWeightGrams: number;
  maxWeightGrams: number;
  baseMinorInt: number;
  perKgMinorInt: number;
  codFeeBp: number;
  freeOverMinorInt: number | null;
  enabled: boolean;
  priority: number;
};

export async function saveRule(
  supabase: Client,
  merchantId: string,
  input: RuleInput,
) {
  const verdict = await rateLimit("shipping.zone_write", merchantId);
  if (!verdict.allowed)
    throw new RateLimitError("shipping.zone_write", verdict.reset_at);
  if (input.minWeightGrams >= input.maxWeightGrams) {
    throw new ShippingError(
      "rule_weight_invalid",
      "Maximum weight must exceed minimum weight",
    );
  }
  if (input.baseMinorInt < 0 || input.perKgMinorInt < 0 || input.codFeeBp < 0) {
    throw new ShippingError(
      "rule_amount_invalid",
      "Amounts cannot be negative",
    );
  }
  const payload = {
    merchant_id: merchantId,
    zone_id: input.zoneId,
    carrier_code: input.carrierCode,
    min_weight_grams: Math.round(input.minWeightGrams),
    max_weight_grams: Math.round(input.maxWeightGrams),
    base_minor_int: Math.round(input.baseMinorInt),
    per_kg_minor_int: Math.round(input.perKgMinorInt),
    cod_fee_bp: Math.min(2000, Math.round(input.codFeeBp)),
    free_over_minor_int:
      input.freeOverMinorInt === null
        ? null
        : Math.round(input.freeOverMinorInt),
    enabled: input.enabled,
    priority: Math.max(1, Math.min(999, Math.round(input.priority))),
    updated_at: new Date().toISOString(),
  };
  const query = input.id
    ? supabase
        .from("shipping_rate_rules")
        .update(payload)
        .eq("id", input.id)
        .eq("merchant_id", merchantId)
    : supabase.from("shipping_rate_rules").insert(payload);
  const { data, error } = await query.select("*").single();
  if (error) throw error;
  bustRateTable(merchantId);
  return data;
}

export async function deleteRule(
  supabase: Client,
  merchantId: string,
  ruleId: string,
) {
  const { error } = await supabase
    .from("shipping_rate_rules")
    .delete()
    .eq("id", ruleId)
    .eq("merchant_id", merchantId);
  if (error) throw error;
  bustRateTable(merchantId);
  return { deleted: true };
}
