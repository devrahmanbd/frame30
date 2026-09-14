/**
 * Bulk discount-code generation.
 *
 * Generated codes are ordinary `coupons` rows sharing a `batch_label`, so the
 * existing server-side validation, stacking rules and usage caps apply
 * unchanged — there is no second discount path to keep in sync. Codes use an
 * unambiguous alphabet and are inserted in one statement so a partial batch
 * cannot leave half a campaign live.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { CommerceError } from "./inventory.server";

type Client = SupabaseClient<Database>;
type CouponType = Database["public"]["Enums"]["coupon_type"];

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomCode(prefix: string, length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const body = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  const clean = prefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean ? `${clean}-${body}` : body;
}

export type GenerateInput = {
  prefix: string;
  count: number;
  type: CouponType;
  amountMinorInt?: number;
  percentOff?: number;
  minSubtotalMinorInt?: number;
  maxDiscountMinorInt?: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  expiresAt?: string | null;
  batchLabel: string;
};

export async function generateCodes(
  db: Client,
  merchantId: string,
  actor: string,
  input: GenerateInput,
) {
  return withSpan("commerce.codegen", async () => {
    await enforceRateLimit("commerce.codegen", `${merchantId}:${actor}`);
    const count = Math.min(500, Math.max(1, Math.floor(input.count)));
    if (!input.batchLabel.trim()) throw new CommerceError("batch_required", "Name the batch");
    if (input.type === "percent" && !input.percentOff) {
      throw new CommerceError("percent_required", "Set a percentage");
    }
    if (input.type === "fixed" && !input.amountMinorInt) {
      throw new CommerceError("amount_required", "Set an amount");
    }

    const codes = new Set<string>();
    while (codes.size < count) codes.add(randomCode(input.prefix));

    const rows = Array.from(codes, (code) => ({
      merchant_id: merchantId,
      code,
      type: input.type,
      amount_minor_int: Math.max(0, Math.floor(input.amountMinorInt ?? 0)),
      percent_off: Math.min(100, Math.max(0, Math.floor(input.percentOff ?? 0))),
      min_subtotal_minor_int: Math.max(0, Math.floor(input.minSubtotalMinorInt ?? 0)),
      max_discount_minor_int:
        input.maxDiscountMinorInt == null ? null : Math.max(0, Math.floor(input.maxDiscountMinorInt)),
      usage_limit: input.usageLimit,
      per_customer_limit: input.perCustomerLimit,
      expires_at: input.expiresAt ?? null,
      status: "active" as const,
      batch_label: input.batchLabel.trim(),
    }));

    const { data, error } = await db.from("coupons").insert(rows).select("id, code");
    if (error) throw new CommerceError("codegen_failed", error.message);
    incr("framique_discount_codes_generated_total", {}, data?.length ?? 0);
    return { batchLabel: input.batchLabel.trim(), codes: (data ?? []).map((d) => d.code) };
  });
}

export async function loadBatches(db: Client, merchantId: string) {
  const { data } = await db
    .from("coupons")
    .select("batch_label, code, redeemed_count, usage_limit, status, expires_at")
    .eq("merchant_id", merchantId)
    .not("batch_label", "is", null)
    .limit(2000);
  const map = new Map<
    string,
    { label: string; codes: number; redeemed: number; active: number; expiresAt: string | null }
  >();
  for (const row of data ?? []) {
    const label = row.batch_label as string;
    const entry = map.get(label) ?? {
      label,
      codes: 0,
      redeemed: 0,
      active: 0,
      expiresAt: row.expires_at,
    };
    entry.codes += 1;
    entry.redeemed += row.redeemed_count;
    if (row.status === "active") entry.active += 1;
    map.set(label, entry);
  }
  return [...map.values()].sort((a, b) => b.codes - a.codes);
}
