/**
 * Gift cards — balance ledger with idempotent redemption.
 *
 * The balance never moves in TypeScript: `gift_card_redeem` holds a row lock,
 * writes an append-only `gift_card_entries` row keyed by the caller's
 * idempotency key, and replays return the original verdict. Codes are compared
 * upper-cased and redemption is burst-limited because a code is a bearer token.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { incr, log, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import { CommerceError } from "./inventory.server";

type Client = SupabaseClient<Database>;

const MESSAGES: Record<string, string> = {
  gift_card_not_found: "Gift card not found",
  gift_card_inactive: "This gift card is no longer active",
  gift_card_expired: "This gift card has expired",
  gift_card_empty: "This gift card has no balance left",
  invalid_amount: "Enter a valid amount",
  forbidden: "You do not have permission to do that",
};

function mapError(message: string) {
  const code = Object.keys(MESSAGES).find((k) => message.includes(k));
  if (code) return new CommerceError(code, MESSAGES[code] as string);
  log("warn", "giftcard.rpc_failed", { detail: message.slice(0, 120) });
  return new CommerceError("giftcard_unavailable", "Gift cards are temporarily unavailable");
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Ambiguous glyphs (0/O, 1/I) are excluded so a card can be read aloud. */
export function generateCode(prefix = "GC", groups = 3, size = 4) {
  const bytes = crypto.getRandomValues(new Uint8Array(groups * size));
  const chunks: string[] = [];
  for (let g = 0; g < groups; g += 1) {
    let chunk = "";
    for (let i = 0; i < size; i += 1) {
      chunk += ALPHABET[(bytes[g * size + i] as number) % ALPHABET.length];
    }
    chunks.push(chunk);
  }
  return `${prefix}-${chunks.join("-")}`;
}

export async function loadGiftCards(db: Client, merchantId: string) {
  const { data, error } = await db
    .from("gift_cards")
    .select("*")
    .eq("merchant_id", merchantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw mapError(error.message);
  return data ?? [];
}

export async function loadGiftCardEntries(db: Client, merchantId: string, giftCardId: string) {
  const { data } = await db
    .from("gift_card_entries")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("gift_card_id", giftCardId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function issueGiftCard(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    amountMinorInt: number;
    currencyCode?: string;
    expiresAt?: string | null;
    email?: string | null;
    phone?: string | null;
    code?: string;
  },
) {
  return withSpan("commerce.giftcard_issue", async () => {
    await enforceRateLimit("commerce.giftcard_issue", `${merchantId}:${actor}`);
    const amount = Math.floor(input.amountMinorInt);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new CommerceError("invalid_amount", "Enter a valid amount");
    }
    const { data, error } = await db.rpc("gift_card_issue", {
      _merchant_id: merchantId,
      _code: input.code?.trim().toUpperCase() || generateCode(),
      _amount_minor: amount,
      _currency: input.currencyCode ?? "BDT",
      _expires_at: (input.expiresAt ?? undefined) as string,
      _email: (input.email ?? undefined) as string,
      _phone: (input.phone ?? undefined) as string,
    });
    if (error) throw mapError(error.message);
    incr("framique_gift_card_issued_total", {});
    return data;
  });
}

export type RedeemResult = {
  replayed: boolean;
  applied_minor_int: number;
  balance_minor_int: number;
  currency_code: string;
};

/**
 * Redemption is idempotent per `(gift card, idempotency key)`. A replay returns
 * the original applied amount, never a second deduction.
 */
export async function redeemGiftCard(
  db: Client,
  merchantId: string,
  input: {
    code: string;
    amountMinorInt: number;
    orderId?: string | null;
    idempotencyKey: string;
    subject: string;
  },
) {
  return withSpan("commerce.giftcard_redeem", async () => {
    await enforceRateLimit("commerce.giftcard_redeem", `${merchantId}:${input.subject}`);
    const { data, error } = await db.rpc("gift_card_redeem", {
      _merchant_id: merchantId,
      _code: input.code,
      _amount_minor: Math.floor(input.amountMinorInt),
      _order_id: (input.orderId ?? undefined) as string,
      _idempotency_key: input.idempotencyKey,
    });
    if (error) {
      incr("framique_gift_card_redeem_total", { outcome: "error" });
      throw mapError(error.message);
    }
    const result = data as unknown as RedeemResult;
    incr("framique_gift_card_redeem_total", {
      outcome: result.replayed ? "replayed" : "applied",
    });
    return result;
  });
}

/** Balance lookup for the checkout preview — reveals nothing but the balance. */
export async function giftCardBalance(db: Client, merchantId: string, code: string) {
  const { data } = await db
    .from("gift_cards")
    .select("code, balance_minor_int, currency_code, status, expires_at")
    .eq("merchant_id", merchantId)
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  if (!data) throw new CommerceError("gift_card_not_found", MESSAGES["gift_card_not_found"] ?? "");
  return data;
}

export async function voidGiftCard(
  db: Client,
  merchantId: string,
  actor: string,
  giftCardId: string,
) {
  await enforceRateLimit("commerce.giftcard_issue", `${merchantId}:${actor}`);
  const { data, error } = await db
    .from("gift_cards")
    .update({ status: "void" })
    .eq("id", giftCardId)
    .eq("merchant_id", merchantId)
    .select("*")
    .single();
  if (error) throw mapError(error.message);
  incr("framique_gift_card_void_total", {});
  return data;
}
