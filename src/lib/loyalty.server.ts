/**
 * Loyalty, referral and affiliate service layer — §4.3.
 *
 * The pure engine in `./loyalty.ts` decides *what* should happen; this file is
 * responsible for making it durable and safe:
 *
 *  - Points are an append-only ledger. Balances on `loyalty_accounts` are a
 *    cache that is always recomputed from ledger rows, never incremented blind.
 *  - Every value-moving write is idempotent on a natural key (order id for
 *    earning and commissions, referee id for referrals), so a retried webhook
 *    or a double-clicked button cannot mint value twice.
 *  - Everything is rate limited, audited (actor, before, after, reason) and
 *    instrumented with counters and spans.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  attributeOrder,
  commissionFor,
  DEFAULT_AFFILIATE,
  DEFAULT_PROGRAM,
  DEFAULT_REFERRAL,
  earnPoints,
  evaluateReferral,
  normalizeProgram,
  payoutReadiness,
  planSpend,
  quoteRedemption,
  summarizeLedger,
  tierFor,
  tierProgress,
  type AffiliateTerms,
  type LoyaltyProgram,
  type ReferralPolicy,
} from "./loyalty";
import { enforceRateLimit } from "./rate-limit.server";
import { incr, log, withSpan } from "./observability.server";

type Client = SupabaseClient<Database>;

export class GrowthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "GrowthError";
  }
}

function fail(code: string, message: string): never {
  incr("growth.error", { code });
  throw new GrowthError(code, message);
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

/* ------------------------------------------------------------------ settings */

export type GrowthSettings = {
  merchantId: string;
  loyaltyEnabled: boolean;
  loyalty: LoyaltyProgram;
  referralEnabled: boolean;
  referral: ReferralPolicy;
  affiliateEnabled: boolean;
  affiliate: AffiliateTerms;
};

function normalizeReferral(input: Partial<ReferralPolicy> | null | undefined): ReferralPolicy {
  const p = { ...DEFAULT_REFERRAL, ...(input ?? {}) };
  return {
    refereeDiscountMinor: Math.max(0, Math.trunc(p.refereeDiscountMinor)),
    referrerPoints: Math.max(0, Math.trunc(p.referrerPoints)),
    minOrderMinor: Math.max(0, Math.trunc(p.minOrderMinor)),
    maxRewardsPerWindow: Math.max(0, Math.trunc(p.maxRewardsPerWindow)),
    windowDays: Math.min(365, Math.max(1, Math.trunc(p.windowDays))),
  };
}


function normalizeAffiliate(input: Partial<AffiliateTerms> | null | undefined): AffiliateTerms {
  const t = { ...DEFAULT_AFFILIATE, ...(input ?? {}) };
  return {
    commissionBps: Math.min(5000, Math.max(0, Math.trunc(t.commissionBps))),
    flatMinor: Math.max(0, Math.trunc(t.flatMinor)),
    cookieDays: Math.min(180, Math.max(1, Math.trunc(t.cookieDays))),
    holdDays: Math.min(180, Math.max(0, Math.trunc(t.holdDays))),
    minPayoutMinor: Math.max(0, Math.trunc(t.minPayoutMinor)),
    payOnShipping: Boolean(t.payOnShipping),
  };
}

export async function loadSettings(db: Client, merchantId: string): Promise<GrowthSettings> {
  const { data, error } = await db
    .from("growth_settings")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (error) fail("settings_unavailable", "Growth settings are temporarily unavailable");
  return {
    merchantId,
    loyaltyEnabled: data?.loyalty_enabled ?? false,
    loyalty: normalizeProgram((data?.loyalty_program ?? null) as Partial<LoyaltyProgram> | null),
    referralEnabled: data?.referral_enabled ?? false,
    referral: normalizeReferral((data?.referral_policy ?? null) as Partial<ReferralPolicy> | null),
    affiliateEnabled: data?.affiliate_enabled ?? false,
    affiliate: normalizeAffiliate((data?.affiliate_terms ?? null) as Partial<AffiliateTerms> | null),
  };
}

export async function saveSettings(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    loyaltyEnabled?: boolean;
    loyalty?: Partial<LoyaltyProgram>;
    referralEnabled?: boolean;
    referral?: Partial<ReferralPolicy>;
    affiliateEnabled?: boolean;
    affiliate?: Partial<AffiliateTerms>;
  },
) {
  await enforceRateLimit("growth.write", merchantId);
  const before = await loadSettings(db, merchantId);
  const next: GrowthSettings = {
    merchantId,
    loyaltyEnabled: input.loyaltyEnabled ?? before.loyaltyEnabled,
    loyalty: normalizeProgram({ ...before.loyalty, ...(input.loyalty ?? {}) }),
    referralEnabled: input.referralEnabled ?? before.referralEnabled,
    referral: normalizeReferral({ ...before.referral, ...(input.referral ?? {}) }),
    affiliateEnabled: input.affiliateEnabled ?? before.affiliateEnabled,
    affiliate: normalizeAffiliate({ ...before.affiliate, ...(input.affiliate ?? {}) }),
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const { error } = await admin.from("growth_settings").upsert(
    {
      merchant_id: merchantId,
      loyalty_enabled: next.loyaltyEnabled,
      loyalty_program: next.loyalty as never,
      referral_enabled: next.referralEnabled,
      referral_policy: next.referral as never,
      affiliate_enabled: next.affiliateEnabled,
      affiliate_terms: next.affiliate as never,

      updated_at: new Date().toISOString(),
    },
    { onConflict: "merchant_id" },
  );
  if (error) fail("settings_save_failed", "Could not save growth settings");

  await audit(admin, merchantId, "loyalty", actor, "settings.save", null, {
    before: before as unknown as Record<string, unknown>,
    after: next as unknown as Record<string, unknown>,
  });
  incr("growth.settings_saved");
  return next;
}

export async function audit(
  admin: Client,
  merchantId: string,
  domain: "loyalty" | "referral" | "affiliate" | "virtual",
  actor: string,
  action: string,
  subjectId: string | null,
  states: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; reason?: string },
) {
  await admin.from("growth_audit").insert({
    merchant_id: merchantId,
    domain,
    actor,
    action,
    subject_id: subjectId,
    before_state: (states.before ?? null) as never,
    after_state: (states.after ?? null) as never,
    reason: states.reason ?? null,
  });
}

/* ------------------------------------------------------------------- accounts */

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Referral codes are read aloud and typed by hand, so ambiguous glyphs are out. */
export function generateReferralCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("");
}

async function ensureAccount(admin: Client, merchantId: string, customerId: string) {
  const { data: existing } = await admin
    .from("loyalty_accounts")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing) return existing;

  // Collisions are astronomically unlikely but a unique index would surface one
  // as a hard error, so retry a few times before giving up.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await admin
      .from("loyalty_accounts")
      .insert({ merchant_id: merchantId, customer_id: customerId, referral_code: generateReferralCode() })
      .select("*")
      .maybeSingle();
    if (data) return data;
    if (error && !error.message.includes("duplicate key")) {
      fail("account_unavailable", "Could not open a loyalty account");
    }
    const { data: raced } = await admin
      .from("loyalty_accounts")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (raced) return raced;
  }
  return fail("account_unavailable", "Could not open a loyalty account");
}

/**
 * Recomputes the cached balance from the ledger. Called after every mutation so
 * a crash halfway through a multi-row write self-heals on the next touch rather
 * than leaving a shopper with points the ledger cannot back.
 */
async function refreshBalance(admin: Client, accountId: string) {
  const { data: rows } = await admin
    .from("loyalty_ledger")
    .select("points, remaining_points, state")
    .eq("account_id", accountId)
    .limit(10_000);

  let available = 0;
  let pending = 0;
  let earned = 0;
  let spent = 0;
  for (const row of rows ?? []) {
    if (row.state === "available") available += row.remaining_points;
    else if (row.state === "pending") pending += row.points;
    if (row.points > 0 && row.state !== "revoked") earned += row.points;
    if (row.points < 0) spent += Math.abs(row.points);
  }

  const { data: account } = await admin
    .from("loyalty_accounts")
    .select("lifetime_net_minor")
    .eq("id", accountId)
    .maybeSingle();
  const tier = tierFor(account?.lifetime_net_minor ?? 0);

  await admin
    .from("loyalty_accounts")
    .update({
      available_points: Math.max(0, available),
      pending_points: Math.max(0, pending),
      lifetime_earned: Math.max(0, earned),
      lifetime_spent: Math.max(0, spent),
      tier,
      updated_at: new Date().toISOString(),
    })
    .eq("id", accountId);

  return { available: Math.max(0, available), pending: Math.max(0, pending), tier };
}

export async function customerSummary(db: Client, merchantId: string, customerId: string) {
  await enforceRateLimit("growth.read", `${merchantId}:${customerId}`);
  const settings = await loadSettings(db, merchantId);
  const { data: account } = await db
    .from("loyalty_accounts")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (!account) {
    return {
      enabled: settings.loyaltyEnabled,
      program: settings.loyalty,
      account: null,
      balance: { pending: 0, available: 0, spent: 0, expired: 0, expiringSoon: 0, lifetime: 0 },
      progress: tierProgress(0),
      entries: [],
    };
  }
  const { data: entries } = await db
    .from("loyalty_ledger")
    .select("id, kind, points, remaining_points, state, expires_at, note, created_at")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return {
    enabled: settings.loyaltyEnabled,
    program: settings.loyalty,
    account,
    balance: summarizeLedger(
      (entries ?? []).map((e) => ({
        points: e.state === "available" ? e.remaining_points : e.points,
        state: e.state as "available" | "expired" | "pending" | "revoked" | "spent",
        expiresAt: e.expires_at,
      })),
    ),
    progress: tierProgress(account.lifetime_net_minor),
    entries: entries ?? [],
  };
}

/* --------------------------------------------------------------------- earning */

/**
 * Grants points for a delivered order. Idempotent on `(merchant, order, earn)`
 * via a unique index: a replayed fulfilment webhook returns the original grant
 * instead of paying twice.
 */
export async function earnForOrder(
  db: Client,
  merchantId: string,
  input: {
    orderId: string;
    customerId: string;
    subtotalMinor: number;
    shippingMinor: number;
    taxMinor: number;
    discountMinor: number;
    pointsPaidMinor: number;
  },
) {
  return withSpan("loyalty.earn", async () => {
    await enforceRateLimit("loyalty.earn", merchantId);
    const settings = await loadSettings(db, merchantId);
    if (!settings.loyaltyEnabled) return { granted: 0, skipped: "disabled" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;

    const { data: replay } = await admin
      .from("loyalty_ledger")
      .select("id, points")
      .eq("merchant_id", merchantId)
      .eq("order_id", input.orderId)
      .eq("kind", "earn")
      .maybeSingle();
    if (replay) {
      incr("loyalty.earn_replayed");
      return { granted: replay.points, skipped: "replay" as const };
    }

    const account = await ensureAccount(admin, merchantId, input.customerId);
    const result = earnPoints(settings.loyalty, { ...input, lifetimeNetMinor: account.lifetime_net_minor });
    const netMinor = account.lifetime_net_minor + result.qualifyingMinor;

    if (result.points > 0) {
      const holdDays = settings.loyalty.holdDays;
      const { error } = await admin.from("loyalty_ledger").insert({
        merchant_id: merchantId,
        account_id: account.id,
        kind: "earn",
        points: result.points,
        remaining_points: holdDays > 0 ? 0 : result.points,
        state: holdDays > 0 ? "pending" : "available",
        order_id: input.orderId,
        matures_at: holdDays > 0 ? daysFromNow(holdDays) : null,
        expires_at: settings.loyalty.expiryDays > 0 ? daysFromNow(settings.loyalty.expiryDays) : null,
        actor: "system",
        note: `Order reward at ${result.multiplier}x (${result.tier})`,
      });
      // A duplicate here means a concurrent grant won the race; that is success.
      if (error && !error.message.includes("duplicate key")) {
        fail("earn_failed", "Could not add loyalty points for this order");
      }
    }

    await admin
      .from("loyalty_accounts")
      .update({ lifetime_net_minor: netMinor, tier: tierFor(netMinor) })
      .eq("id", account.id);
    await refreshBalance(admin, account.id);

    incr("loyalty.earned", { tier: result.tier }, result.points);
    return { granted: result.points, tier: result.tier, skipped: null };
  });
}

/** Settles matured pending points and expires stale available ones. */
export async function maturePoints(admin: Client, limit = 500) {
  const now = new Date().toISOString();
  const { data: pending } = await admin
    .from("loyalty_ledger")
    .select("id, account_id, points")
    .eq("state", "pending")
    .lte("matures_at", now)
    .limit(limit);

  const touched = new Set<string>();
  for (const row of pending ?? []) {
    await admin
      .from("loyalty_ledger")
      .update({ state: "available", remaining_points: row.points })
      .eq("id", row.id)
      .eq("state", "pending");
    touched.add(row.account_id);
  }

  const { data: expiring } = await admin
    .from("loyalty_ledger")
    .select("id, account_id")
    .eq("state", "available")
    .gt("remaining_points", 0)
    .lte("expires_at", now)
    .limit(limit);
  for (const row of expiring ?? []) {
    await admin
      .from("loyalty_ledger")
      .update({ state: "expired", remaining_points: 0 })
      .eq("id", row.id)
      .eq("state", "available");
    touched.add(row.account_id);
  }

  for (const accountId of touched) await refreshBalance(admin, accountId);
  incr("loyalty.matured", {}, pending?.length ?? 0);
  incr("loyalty.expired", {}, expiring?.length ?? 0);
  return { matured: pending?.length ?? 0, expired: expiring?.length ?? 0, accounts: touched.size };
}

/* ------------------------------------------------------------------ redemption */

export async function quoteForOrder(
  db: Client,
  merchantId: string,
  args: { customerId: string; orderTotalMinor: number; requestedPoints?: number },
) {
  const settings = await loadSettings(db, merchantId);
  if (!settings.loyaltyEnabled) return { points: 0, discountMinor: 0, maxPoints: 0, reason: "disabled" };
  const { data: account } = await db
    .from("loyalty_accounts")
    .select("available_points, blocked_at")
    .eq("merchant_id", merchantId)
    .eq("customer_id", args.customerId)
    .maybeSingle();
  if (!account) return { points: 0, discountMinor: 0, maxPoints: 0, reason: "no_account" };
  if (account.blocked_at) return { points: 0, discountMinor: 0, maxPoints: 0, reason: "blocked" };
  return quoteRedemption(settings.loyalty, {
    balancePoints: account.available_points,
    orderTotalMinor: args.orderTotalMinor,
    requestedPoints: args.requestedPoints,
  });
}

/**
 * Spends points against an order, drawing from the soonest-expiring grants
 * first. Idempotent on `(merchant, order, redeem)`.
 */
export async function redeemForOrder(
  db: Client,
  merchantId: string,
  args: { customerId: string; orderId: string; orderTotalMinor: number; requestedPoints: number },
) {
  return withSpan("loyalty.redeem", async () => {
    await enforceRateLimit("loyalty.redeem", `${merchantId}:${args.customerId}`);
    const settings = await loadSettings(db, merchantId);
    if (!settings.loyaltyEnabled) fail("loyalty_disabled", "Points are not available in this store");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;

    const { data: replay } = await admin
      .from("loyalty_ledger")
      .select("id, points")
      .eq("merchant_id", merchantId)
      .eq("order_id", args.orderId)
      .eq("kind", "redeem")
      .maybeSingle();
    if (replay) return { points: Math.abs(replay.points), discountMinor: 0, replayed: true };

    const account = await ensureAccount(admin, merchantId, args.customerId);
    if (account.blocked_at) fail("account_blocked", "This account cannot redeem points right now");

    const quote = quoteRedemption(settings.loyalty, {
      balancePoints: account.available_points,
      orderTotalMinor: args.orderTotalMinor,
      requestedPoints: args.requestedPoints,
    });
    if (quote.points <= 0) fail(quote.reason ?? "cannot_redeem", "These points cannot be redeemed here");

    const { data: grants } = await admin
      .from("loyalty_ledger")
      .select("id, remaining_points, expires_at")
      .eq("account_id", account.id)
      .eq("state", "available")
      .gt("remaining_points", 0)
      .order("expires_at", { ascending: true, nullsFirst: false })
      .limit(500);

    const plan = planSpend(
      (grants ?? []).map((g) => ({
        id: g.id,
        points: g.remaining_points,
        state: "available" as const,
        expiresAt: g.expires_at,
      })),
      quote.points,
    );
    if (plan.shortfall > 0) fail("insufficient_points", "You do not have enough points for that");

    for (const draw of plan.draws) {
      const grant = (grants ?? []).find((g) => g.id === draw.id);
      const remaining = (grant?.remaining_points ?? 0) - draw.points;
      // Guarded on the previous remaining value so two concurrent redemptions
      // cannot both draw from the same grant.
      const { data: updated } = await admin
        .from("loyalty_ledger")
        .update({ remaining_points: remaining, state: remaining === 0 ? "spent" : "available" })
        .eq("id", draw.id)
        .eq("remaining_points", grant?.remaining_points ?? -1)
        .select("id")
        .maybeSingle();
      if (!updated) fail("redeem_conflict", "Your points changed while we were spending them. Try again.");
    }

    await admin.from("loyalty_ledger").insert({
      merchant_id: merchantId,
      account_id: account.id,
      kind: "redeem",
      points: -quote.points,
      remaining_points: 0,
      state: "spent",
      order_id: args.orderId,
      actor: "customer",
      note: `Redeemed on order`,
    });
    await refreshBalance(admin, account.id);
    incr("loyalty.redeemed", {}, quote.points);
    return { points: quote.points, discountMinor: quote.discountMinor, replayed: false };
  });
}

/** Manual staff adjustment — always audited, never silent. */
export async function adjustPoints(
  db: Client,
  merchantId: string,
  actor: string,
  args: { customerId: string; points: number; reason: string },
) {
  await enforceRateLimit("loyalty.adjust", merchantId);
  if (!Number.isInteger(args.points) || args.points === 0) fail("invalid_amount", "Enter a non-zero whole number");
  if (Math.abs(args.points) > 1_000_000) fail("invalid_amount", "That adjustment is too large");
  if (args.reason.trim().length < 3) fail("reason_required", "Give a reason for this adjustment");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const settings = await loadSettings(db, merchantId);
  const account = await ensureAccount(admin, merchantId, args.customerId);

  if (args.points < 0 && account.available_points < Math.abs(args.points)) {
    fail("insufficient_points", "This customer does not have that many points");
  }

  if (args.points > 0) {
    await admin.from("loyalty_ledger").insert({
      merchant_id: merchantId,
      account_id: account.id,
      kind: "adjust",
      points: args.points,
      remaining_points: args.points,
      state: "available",
      actor,
      note: args.reason.slice(0, 200),
      expires_at: settings.loyalty.expiryDays > 0 ? daysFromNow(settings.loyalty.expiryDays) : null,
    });
  } else {
    const { data: grants } = await admin
      .from("loyalty_ledger")
      .select("id, remaining_points, expires_at")
      .eq("account_id", account.id)
      .eq("state", "available")
      .gt("remaining_points", 0)
      .order("expires_at", { ascending: true, nullsFirst: false })
      .limit(500);
    const plan = planSpend(
      (grants ?? []).map((g) => ({
        id: g.id,
        points: g.remaining_points,
        state: "available" as const,
        expiresAt: g.expires_at,
      })),
      Math.abs(args.points),
    );
    if (plan.shortfall > 0) fail("insufficient_points", "This customer does not have that many points");
    for (const draw of plan.draws) {
      const grant = (grants ?? []).find((g) => g.id === draw.id);
      const remaining = (grant?.remaining_points ?? 0) - draw.points;
      await admin
        .from("loyalty_ledger")
        .update({ remaining_points: remaining, state: remaining === 0 ? "spent" : "available" })
        .eq("id", draw.id);
    }
    await admin.from("loyalty_ledger").insert({
      merchant_id: merchantId,
      account_id: account.id,
      kind: "adjust",
      points: args.points,
      remaining_points: 0,
      state: "spent",
      actor,
      note: args.reason.slice(0, 200),
    });
  }

  const balance = await refreshBalance(admin, account.id);
  await audit(admin, merchantId, "loyalty", actor, "points.adjust", account.id, {
    after: { points: args.points, balance: balance.available },
    reason: args.reason.slice(0, 200),
  });
  incr("loyalty.adjusted");
  return balance;
}

/* -------------------------------------------------------------------- referral */

/**
 * Records and scores a referral. The engine's verdict is stored verbatim,
 * including the reason, so a merchant can always explain a rejection to an
 * angry customer instead of shrugging at a boolean.
 */
export async function claimReferral(
  db: Client,
  merchantId: string,
  args: {
    code: string;
    refereeCustomerId: string;
    orderId: string;
    orderTotalMinor: number;
    isFirstOrder: boolean;
    accountAgeMinutes: number;
    deviceHash?: string | null;
    paymentFingerprint?: string | null;
  },
) {
  return withSpan("referral.claim", async () => {
    await enforceRateLimit("referral.claim", `${merchantId}:${args.refereeCustomerId}`);
    const settings = await loadSettings(db, merchantId);
    if (!settings.referralEnabled) return { qualified: false, reason: "disabled" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;

    const code = args.code.trim().toUpperCase();
    const { data: referrer } = await admin
      .from("loyalty_accounts")
      .select("id, customer_id")
      .eq("merchant_id", merchantId)
      .eq("referral_code", code)
      .maybeSingle();
    if (!referrer) return { qualified: false, reason: "unknown_code" as const };

    const windowStart = new Date(Date.now() - settings.referral.windowDays * 86_400_000).toISOString();
    const { count } = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId)
      .eq("referrer_customer_id", referrer.customer_id)
      .eq("state", "rewarded")
      .gte("created_at", windowStart);

    let sharedDevice = false;
    let sharedPayment = false;
    if (args.deviceHash || args.paymentFingerprint) {
      const { data: siblings } = await admin
        .from("referrals")
        .select("device_hash, payment_fingerprint")
        .eq("merchant_id", merchantId)
        .eq("referrer_customer_id", referrer.customer_id)
        .limit(200);
      sharedDevice = Boolean(args.deviceHash) && (siblings ?? []).some((s) => s.device_hash === args.deviceHash);
      sharedPayment =
        Boolean(args.paymentFingerprint) &&
        (siblings ?? []).some((s) => s.payment_fingerprint === args.paymentFingerprint);
    }

    const verdict = evaluateReferral(settings.referral, {
      referrerId: referrer.customer_id,
      refereeId: args.refereeCustomerId,
      refereeOrderTotalMinor: args.orderTotalMinor,
      refereeIsFirstOrder: args.isFirstOrder,
      rewardsInWindow: count ?? 0,
      sharedDeviceHash: sharedDevice,
      sharedPaymentFingerprint: sharedPayment,
      refereeAccountAgeMinutes: args.accountAgeMinutes,
    });

    const state = verdict.qualified ? "rewarded" : verdict.reviewRequired ? "review" : "rejected";
    const { data: row, error } = await admin
      .from("referrals")
      .insert({
        merchant_id: merchantId,
        referrer_customer_id: referrer.customer_id,
        referee_customer_id: args.refereeCustomerId,
        code,
        state,
        reason: verdict.reason,
        review_required: verdict.reviewRequired,
        referrer_points: verdict.referrerPoints,
        referee_discount_minor: verdict.refereeDiscountMinor,
        order_id: args.orderId,
        device_hash: args.deviceHash ?? null,
        payment_fingerprint: args.paymentFingerprint ?? null,
        decided_at: new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();
    // The unique index means this shopper was already referred; that is a
    // rejection, not an error.
    if (error) return { qualified: false, reason: "already_referred" as const };

    if (verdict.qualified && verdict.referrerPoints > 0) {
      await admin.from("loyalty_ledger").insert({
        merchant_id: merchantId,
        account_id: referrer.id,
        kind: "referral",
        points: verdict.referrerPoints,
        remaining_points: verdict.referrerPoints,
        state: "available",
        actor: "system",
        reference: row?.id ?? null,
        note: "Referral reward",
        expires_at: settings.loyalty.expiryDays > 0 ? daysFromNow(settings.loyalty.expiryDays) : null,
      });
      await refreshBalance(admin, referrer.id);
    }

    incr("referral.decided", { state });
    return { qualified: verdict.qualified, reason: verdict.reason, state, verdict };
  });
}

/** Staff override on a held referral — pays or rejects, always with a reason. */
export async function decideReferral(
  db: Client,
  merchantId: string,
  actor: string,
  args: { referralId: string; approve: boolean; reason: string },
) {
  await enforceRateLimit("growth.write", merchantId);
  if (args.reason.trim().length < 3) fail("reason_required", "Give a reason for this decision");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const { data: referral } = await admin
    .from("referrals")
    .select("*")
    .eq("id", args.referralId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!referral) fail("not_found", "Referral not found");
  if (referral.state !== "review") fail("already_decided", "This referral has already been decided");

  const settings = await loadSettings(db, merchantId);
  const nextState = args.approve ? "rewarded" : "rejected";
  await admin
    .from("referrals")
    .update({ state: nextState, reason: args.reason.slice(0, 200), decided_at: new Date().toISOString() })
    .eq("id", referral.id);

  if (args.approve && referral.referrer_points > 0) {
    const account = await ensureAccount(admin, merchantId, referral.referrer_customer_id);
    await admin.from("loyalty_ledger").insert({
      merchant_id: merchantId,
      account_id: account.id,
      kind: "referral",
      points: referral.referrer_points,
      remaining_points: referral.referrer_points,
      state: "available",
      actor,
      reference: referral.id,
      note: "Referral reward (manual approval)",
      expires_at: settings.loyalty.expiryDays > 0 ? daysFromNow(settings.loyalty.expiryDays) : null,
    });
    await refreshBalance(admin, account.id);
  }

  await audit(admin, merchantId, "referral", actor, `referral.${nextState}`, referral.id, {
    before: { state: referral.state },
    after: { state: nextState },
    reason: args.reason.slice(0, 200),
  });
  return { state: nextState };
}

/* ------------------------------------------------------------------- affiliate */

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function upsertAffiliate(
  db: Client,
  merchantId: string,
  actor: string,
  input: {
    id?: string;
    displayName: string;
    slug?: string;
    contactEmail?: string | null;
    contactPhone?: string | null;
    state?: "pending" | "active" | "paused" | "banned";
    commissionBps?: number | null;
    reason?: string;
  },
) {
  await enforceRateLimit("growth.write", merchantId);
  const slug = slugify(input.slug || input.displayName);
  if (slug.length < 3) fail("invalid_slug", "Give the partner a longer link name");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const payload = {
    merchant_id: merchantId,
    display_name: input.displayName.trim().slice(0, 120),
    slug,
    contact_email: input.contactEmail?.trim() || null,
    contact_phone: input.contactPhone?.trim() || null,
    state: input.state ?? "pending",
    terms_override:
      input.commissionBps === null || input.commissionBps === undefined
        ? null
        : ({ commissionBps: Math.min(5000, Math.max(0, Math.trunc(input.commissionBps))) } as never),
    approved_at: input.state === "active" ? new Date().toISOString() : null,
    banned_reason: input.state === "banned" ? (input.reason ?? "").slice(0, 200) : null,
    updated_at: new Date().toISOString(),
  };

  const query = input.id
    ? admin.from("affiliates").update(payload).eq("id", input.id).eq("merchant_id", merchantId)
    : admin.from("affiliates").insert(payload);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) {
    if (error.message.includes("duplicate key")) fail("slug_taken", "That link name is already used");
    fail("affiliate_save_failed", "Could not save the partner");
  }

  await audit(admin, merchantId, "affiliate", actor, input.id ? "affiliate.update" : "affiliate.create", data?.id ?? null, {
    after: payload as unknown as Record<string, unknown>,
    reason: input.reason,
  });
  return data;
}

/**
 * Records a partner link click. Stores only hashes; the click is the evidence
 * that later decides attribution, so it is written before the visitor ever
 * reaches the storefront.
 */
export async function recordAffiliateClick(
  merchantId: string,
  args: {
    slug: string;
    visitorHash: string;
    ipHash?: string | null;
    uaHash?: string | null;
    landingPath?: string | null;
    referrerHost?: string | null;
    customerId?: string | null;
  },
) {
  await enforceRateLimit("affiliate.click", merchantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const settings = await loadSettings(admin, merchantId);
  if (!settings.affiliateEnabled) return { recorded: false, reason: "disabled" as const };

  const { data: affiliate } = await admin
    .from("affiliates")
    .select("id, state")
    .eq("merchant_id", merchantId)
    .eq("slug", slugify(args.slug))
    .maybeSingle();
  if (!affiliate) return { recorded: false, reason: "unknown_partner" as const };
  if (affiliate.state !== "active") return { recorded: false, reason: "partner_inactive" as const };

  await admin.from("affiliate_clicks").insert({
    merchant_id: merchantId,
    affiliate_id: affiliate.id,
    visitor_hash: args.visitorHash,
    customer_id: args.customerId ?? null,
    ip_hash: args.ipHash ?? null,
    ua_hash: args.uaHash ?? null,
    landing_path: args.landingPath?.slice(0, 200) ?? null,
    referrer_host: args.referrerHost?.slice(0, 120) ?? null,
    expires_at: daysFromNow(settings.affiliate.cookieDays),
  });
  incr("affiliate.click");
  return { recorded: true, affiliateId: affiliate.id };
}

/** Attributes a placed order to at most one partner and books the commission. */
export async function bookCommission(
  db: Client,
  merchantId: string,
  args: {
    orderId: string;
    orderAt: string;
    customerId: string | null;
    visitorHash: string;
    subtotalMinor: number;
    shippingMinor: number;
    discountMinor: number;
    refundedMinor: number;
    currencyCode?: string;
  },
) {
  return withSpan("affiliate.commission", async () => {
    const settings = await loadSettings(db, merchantId);
    if (!settings.affiliateEnabled) return { booked: false, reason: "disabled" as const };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as Client;

    const { data: replay } = await admin
      .from("affiliate_commissions")
      .select("id, amount_minor")
      .eq("merchant_id", merchantId)
      .eq("order_id", args.orderId)
      .maybeSingle();
    if (replay) return { booked: false, reason: "replay" as const, amountMinor: replay.amount_minor };

    const since = new Date(
      Date.parse(args.orderAt) - settings.affiliate.cookieDays * 86_400_000,
    ).toISOString();
    const { data: clicks } = await admin
      .from("affiliate_clicks")
      .select("id, affiliate_id, clicked_at, affiliates(owner_customer_id)")
      .eq("merchant_id", merchantId)
      .eq("visitor_hash", args.visitorHash)
      .gte("clicked_at", since)
      .order("clicked_at", { ascending: false })
      .limit(50);

    const winner = attributeOrder(settings.affiliate, {
      orderAt: args.orderAt,
      customerId: args.customerId,
      clicks: (clicks ?? []).map((c) => ({
        affiliateId: c.affiliate_id,
        affiliateOwnerId:
          (c.affiliates as unknown as { owner_customer_id: string | null } | null)?.owner_customer_id ?? null,
        clickedAt: c.clicked_at,
      })),
    });
    if (!winner) return { booked: false, reason: "no_attribution" as const };

    const { data: affiliate } = await admin
      .from("affiliates")
      .select("id, state, terms_override")
      .eq("id", winner.affiliateId)
      .maybeSingle();
    if (!affiliate || affiliate.state !== "active") return { booked: false, reason: "partner_inactive" as const };

    const terms = normalizeAffiliate({
      ...settings.affiliate,
      ...((affiliate.terms_override ?? {}) as Partial<AffiliateTerms>),
    });
    const result = commissionFor(terms, args);
    if (result.commissionMinor <= 0) return { booked: false, reason: "no_qualifying_revenue" as const };

    const clickRow = (clicks ?? []).find((c) => c.clicked_at === winner.clickedAt);
    const { error } = await admin.from("affiliate_commissions").insert({
      merchant_id: merchantId,
      affiliate_id: affiliate.id,
      order_id: args.orderId,
      click_id: clickRow?.id ?? null,
      qualifying_minor: result.qualifyingMinor,
      amount_minor: result.commissionMinor,
      rate_bps: terms.commissionBps,
      currency_code: args.currencyCode ?? "BDT",
      matures_at: daysFromNow(terms.holdDays),
    });
    if (error && !error.message.includes("duplicate key")) {
      fail("commission_failed", "Could not record the partner commission");
    }

    if (clickRow) {
      await admin.from("affiliate_clicks").update({ converted_order_id: args.orderId }).eq("id", clickRow.id);
    }
    incr("affiliate.commission_booked", {}, 1);
    return { booked: true, affiliateId: affiliate.id, amountMinor: result.commissionMinor };
  });
}

/** Reverses a commission when the order is refunded or cancelled. */
export async function reverseCommission(merchantId: string, orderId: string, reason: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  const { data } = await admin
    .from("affiliate_commissions")
    .update({ state: "reversed", reversed_at: new Date().toISOString(), reason: reason.slice(0, 200) })
    .eq("merchant_id", merchantId)
    .eq("order_id", orderId)
    .in("state", ["pending", "approved"])
    .select("id")
    .maybeSingle();
  if (data) incr("affiliate.commission_reversed");
  return { reversed: Boolean(data) };
}

/** Matures held commissions into approved once the refund window has passed. */
export async function approveMaturedCommissions(admin: Client, limit = 500) {
  const now = new Date().toISOString();
  const { data } = await admin
    .from("affiliate_commissions")
    .update({ state: "approved", approved_at: now })
    .eq("state", "pending")
    .lte("matures_at", now)
    .select("id")
    .limit(limit);
  incr("affiliate.commission_approved", {}, data?.length ?? 0);
  return { approved: data?.length ?? 0 };
}

export async function markCommissionsPaid(
  db: Client,
  merchantId: string,
  actor: string,
  args: { affiliateId: string; reference: string },
) {
  await enforceRateLimit("affiliate.payout", merchantId);
  const settings = await loadSettings(db, merchantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;

  const { data: commissions } = await admin
    .from("affiliate_commissions")
    .select("id, state, amount_minor, matures_at")
    .eq("merchant_id", merchantId)
    .eq("affiliate_id", args.affiliateId)
    .limit(2000);

  const readiness = payoutReadiness(
    settings.affiliate,
    (commissions ?? []).map((c) => ({ state: c.state, amountMinor: c.amount_minor, matureAt: c.matures_at })),
  );
  if (!readiness.canPayout) fail("below_min_payout", "This partner has not reached the payout minimum yet");

  const now = new Date().toISOString();
  const payable = (commissions ?? []).filter((c) => c.state === "approved" && c.matures_at <= now);
  await admin
    .from("affiliate_commissions")
    .update({ state: "paid", paid_at: now, reason: args.reference.slice(0, 120) })
    .in(
      "id",
      payable.map((c) => c.id),
    );

  await audit(admin, merchantId, "affiliate", actor, "affiliate.payout", args.affiliateId, {
    after: { amountMinor: readiness.payable, commissions: payable.length },
    reason: args.reference.slice(0, 120),
  });
  incr("affiliate.payout", {}, readiness.payable);
  return { paidMinor: readiness.payable, commissions: payable.length };
}

/* ------------------------------------------------------------------------ desk */

export async function loadGrowthDesk(db: Client, merchantId: string) {
  await enforceRateLimit("growth.read", merchantId);
  const settings = await loadSettings(db, merchantId);

  const [accounts, referrals, affiliates, commissions, auditRows] = await Promise.all([
    db
      .from("loyalty_accounts")
      .select("id, customer_id, tier, available_points, pending_points, lifetime_net_minor, referral_code, blocked_at")
      .eq("merchant_id", merchantId)
      .order("available_points", { ascending: false })
      .limit(100),
    db
      .from("referrals")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("affiliates").select("*").eq("merchant_id", merchantId).order("created_at", { ascending: false }).limit(100),
    db
      .from("affiliate_commissions")
      .select("id, affiliate_id, order_id, state, amount_minor, matures_at, created_at")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(500),
    db
      .from("growth_audit")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const commissionRows = commissions.data ?? [];
  const byAffiliate = new Map<string, typeof commissionRows>();
  for (const row of commissionRows) {
    const list = byAffiliate.get(row.affiliate_id) ?? [];
    list.push(row);
    byAffiliate.set(row.affiliate_id, list);
  }

  const partners = (affiliates.data ?? []).map((a) => ({
    ...a,
    readiness: payoutReadiness(
      settings.affiliate,
      (byAffiliate.get(a.id) ?? []).map((c) => ({
        state: c.state,
        amountMinor: c.amount_minor,
        matureAt: c.matures_at,
      })),
    ),
  }));

  const totals = (accounts.data ?? []).reduce(
    (acc, a) => ({
      available: acc.available + a.available_points,
      pending: acc.pending + a.pending_points,
      members: acc.members + 1,
    }),
    { available: 0, pending: 0, members: 0 },
  );

  return {
    settings,
    accounts: accounts.data ?? [],
    referrals: referrals.data ?? [],
    partners,
    commissions: commissionRows.slice(0, 100),
    audit: auditRows.data ?? [],
    totals: {
      ...totals,
      liabilityMinor: totals.available * settings.loyalty.pointValueMinor,
      referralsInReview: (referrals.data ?? []).filter((r) => r.state === "review").length,
      payableMinor: partners.reduce((n, p) => n + p.readiness.payable, 0),
    },
  };
}

/* ----------------------------------------------------------------------- sweep */

export async function runGrowthSweep() {
  await enforceRateLimit("growth.sweep", "global");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  try {
    const points = await maturePoints(admin);
    const commissions = await approveMaturedCommissions(admin);
    log("info", "growth.sweep", { ...points, ...commissions });
    return { ...points, ...commissions };
  } catch (err) {
    log("error", "growth.sweep_failed", { err: String(err) });
    throw err;
  }
}
