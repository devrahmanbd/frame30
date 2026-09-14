/**
 * Ad-fraud defense service layer — §4.2.
 *
 * Responsibilities kept deliberately narrow:
 *  - ingest a storefront ad click, gather trailing-window context, score it
 *    with the pure engine and persist an immutable event;
 *  - roll clicks + merchant-entered spend into a daily attribution-integrity
 *    report per campaign;
 *  - maintain a per-merchant blocklist and a privacy-preserving cross-merchant
 *    abuse network keyed only by a one-way digest.
 *
 * Invariants: no raw ip, user agent, click id or session id is ever stored —
 * only tenant-salted digests. Every read is `merchant_id` scoped, every write
 * goes through the service role behind a rate limit, and every merchant-visible
 * state change writes an append-only audit row (actor, before, after, reason).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  campaignIntegrity,
  explainSignals,
  integrityAdvice,
  isAdNetwork,
  scoreClick,
  scoreVisitor,
  summarizeIntegrity,
  type AdNetwork,
  type AdVerdict,
  type CampaignIntegrity,
  type FiredSignal,
} from "./ad-fraud";
import { cached } from "./cache.server";
import { enforceRateLimit, rateLimit } from "./rate-limit.server";
import { incr, log, observe, withSpan } from "./observability.server";

type Client = SupabaseClient<Database>;

export const AD_FRAUD_WINDOW_DAYS = 14;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Tenant-salted, day-rotating digest. Two merchants never see the same hash for
 * the same shopper and yesterday's hash cannot be joined to today's, so the
 * warehouse holds no durable identifier.
 */
export async function tenantHash(merchantId: string, kind: string, raw: string, day = today()) {
  const salt = process.env["ANALYTICS_SALT"] ?? "framique-analytics";
  return (await sha256Hex(`${salt}:${merchantId}:${kind}:${day}:${raw}`)).slice(0, 32);
}

/**
 * Cross-merchant digest for the abuse network. Salted with a *separate* secret
 * and carries no merchant id, so a shared row can never be attributed back to a
 * store, and a store can never enumerate another store's traffic.
 */
export async function networkDigest(kind: string, raw: string) {
  const salt = process.env["AD_NETWORK_SALT"] ?? process.env["ANALYTICS_SALT"] ?? "framique-network";
  return (await sha256Hex(`${salt}:network:${kind}:${raw}`)).slice(0, 40);
}

export type ClickBeacon = {
  network: string;
  campaign?: string | null;
  adset?: string | null;
  creative?: string | null;
  clickId?: string | null;
  landingPath?: string | null;
  referrerHost?: string | null;
  userAgent: string;
  ipRaw: string;
  visitorRaw: string;
  javascriptRan: boolean;
  automationHints?: number;
  dwellMs?: number;
  interactions?: number;
  visitorCountry?: string | null;
  timezoneOffsetMinutes?: number | null;
  occurredAt?: string | null;
};

const DATACENTER_HINTS = /(aws|amazon|google|azure|digitalocean|linode|hetzner|ovh|vultr|oracle)/i;

/** Coarse network class from what an edge proxy gives us; never client-set. */
function classifyIp(ipRaw: string, asnHint: string | null): ClickInputClass {
  if (asnHint && DATACENTER_HINTS.test(asnHint)) return "datacenter";
  if (ipRaw.includes(":")) return "unknown";
  return "residential";
}

type ClickInputClass = "residential" | "mobile" | "datacenter" | "vpn" | "unknown";

async function activeBlockHashes(admin: Client, merchantId: string) {
  return cached(`ads:blocklist:${merchantId}`, 60, async () => {
    const { data } = await admin
      .from("ad_blocklist")
      .select("kind, value_hash, expires_at")
      .eq("merchant_id", merchantId)
      .eq("active", true)
      .limit(2000);
    const now = Date.now();
    const set = new Set<string>();
    for (const row of data ?? []) {
      if (row.expires_at && new Date(row.expires_at).getTime() < now) continue;
      set.add(`${row.kind}:${row.value_hash}`);
    }
    return set;
  });
}

export function invalidateBlocklistCache(_merchantId: string) {
  // cache.server has no targeted delete; a 60s TTL is the bound we accept.
}

async function networkReportCount(admin: Client, digest: string) {
  const { data } = await admin
    .from("ad_network_signals")
    .select("reports, severity")
    .eq("subject_digest", digest)
    .maybeSingle();
  return data?.reports ?? 0;
}

async function reportToNetwork(admin: Client, digest: string, kind: string) {
  const { data } = await admin
    .from("ad_network_signals")
    .select("id, reports, distinct_reporters, severity")
    .eq("subject_digest", digest)
    .maybeSingle();
  if (!data) {
    await admin.from("ad_network_signals").insert({
      subject_digest: digest,
      kind,
      reports: 1,
      distinct_reporters: 1,
      severity: 10,
    });
    return;
  }
  await admin
    .from("ad_network_signals")
    .update({
      reports: data.reports + 1,
      severity: Math.min(100, data.severity + 5),
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", data.id);
}

export type IngestResult = {
  accepted: boolean;
  duplicate: boolean;
  verdict: AdVerdict;
  score: number;
  /** Merchant-safe reasons; never raw weights or internal thresholds. */
  reasons: string[];
};

/**
 * Scores and stores one ad click. Idempotent on `dedupe_key`, so a retried or
 * replayed beacon returns the original verdict instead of double counting.
 */
export async function ingestClick(
  admin: Client,
  merchantId: string,
  beacon: ClickBeacon,
  opts: { asnHint?: string | null; targetCountry?: string | null } = {},
): Promise<IngestResult> {
  const started = Date.now();
  return withSpan("ads.ingest_click", async () => {
    const network: AdNetwork = isAdNetwork(beacon.network) ? beacon.network : "other";
    const day = today();
    const occurredAt = beacon.occurredAt ?? new Date().toISOString();

    const [visitorHash, ipHash, uaHash, clickIdHash] = await Promise.all([
      tenantHash(merchantId, "visitor", beacon.visitorRaw, day),
      tenantHash(merchantId, "ip", beacon.ipRaw, day),
      tenantHash(merchantId, "ua", beacon.userAgent, day),
      beacon.clickId ? tenantHash(merchantId, "clid", beacon.clickId, day) : Promise.resolve(null),
    ]);

    // A single fingerprint must not be able to flood the store bucket for
    // everyone else, so it is charged its own window before any database work.
    const perIp = await rateLimit("ads.click_ip", `${merchantId}:${ipHash}`);
    if (!perIp.allowed) {
      incr("framique_ad_clicks_total", { verdict: "throttled" });
      return { accepted: false, duplicate: false, verdict: "invalid", score: 100, reasons: ["CLICK_FLOOD"] };
    }

    const sinceHour = new Date(Date.now() - 3600_000).toISOString();
    const blocked = await activeBlockHashes(admin, merchantId);

    const [clicksHour, ipFanout, clickIdSeen, lastEvent, netReports] = await Promise.all([
      admin
        .from("ad_click_events")
        .select("id", { count: "exact", head: true })
        .eq("merchant_id", merchantId)
        .eq("visitor_hash", visitorHash)
        .gte("occurred_at", sinceHour),
      admin
        .from("ad_click_events")
        .select("visitor_hash")
        .eq("merchant_id", merchantId)
        .eq("ip_hash", ipHash)
        .gte("occurred_at", sinceHour)
        .limit(200),
      clickIdHash
        ? admin
            .from("ad_click_events")
            .select("id", { count: "exact", head: true })
            .eq("merchant_id", merchantId)
            .eq("click_id_hash", clickIdHash)
        : Promise.resolve({ count: 0 } as { count: number | null }),
      admin
        .from("ad_click_events")
        .select("ip_hash, visitor_country, occurred_at")
        .eq("merchant_id", merchantId)
        .eq("visitor_hash", visitorHash)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      networkReportCount(admin, await networkDigest("ip", beacon.ipRaw)),
    ]);

    const distinctVisitors = new Set((ipFanout.data ?? []).map((r) => r.visitor_hash)).size;
    const previous = lastEvent.data ?? null;
    const minutesSinceDistantHop =
      previous && previous.ip_hash !== ipHash
        ? Math.round((Date.parse(occurredAt) - Date.parse(previous.occurred_at)) / 60000)
        : null;

    const ipClass = classifyIp(beacon.ipRaw, opts.asnHint ?? null);

    const scored = scoreClick({
      network,
      javascriptRan: beacon.javascriptRan,
      automationHints: beacon.automationHints ?? 0,
      userAgent: beacon.userAgent,
      dwellMs: beacon.dwellMs ?? 0,
      interactions: beacon.interactions ?? 0,
      clickId: beacon.clickId ?? null,
      clickIdSeenBefore: (clickIdSeen.count ?? 0) > 0,
      referrerHost: beacon.referrerHost ?? null,
      ipClass,
      clicksLastHour: clicksHour.count ?? 0,
      distinctVisitorsPerIp: distinctVisitors,
      visitorCountry: beacon.visitorCountry ?? null,
      targetCountry: opts.targetCountry ?? "BD",
      timezoneOffsetMinutes: beacon.timezoneOffsetMinutes ?? null,
      minutesSinceDistantHop,
      blocklisted:
        blocked.has(`ip_hash:${ipHash}`) ||
        blocked.has(`visitor_hash:${visitorHash}`) ||
        blocked.has(`ua_hash:${uaHash}`),
      networkReports: netReports,
    });

    const dedupeKey =
      beacon.clickId
        ? `clid:${clickIdHash}`
        : `${visitorHash}:${network}:${beacon.campaign ?? "unknown"}:${Math.floor(Date.parse(occurredAt) / 60000)}`;

    const { data: inserted, error } = await admin
      .from("ad_click_events")
      .upsert(
        {
          merchant_id: merchantId,
          network,
          campaign: (beacon.campaign ?? "unknown").slice(0, 120),
          adset: beacon.adset?.slice(0, 120) ?? null,
          creative: beacon.creative?.slice(0, 120) ?? null,
          day,
          occurred_at: occurredAt,
          visitor_hash: visitorHash,
          ip_hash: ipHash,
          ua_hash: uaHash,
          click_id_hash: clickIdHash,
          landing_path: beacon.landingPath?.slice(0, 200) ?? null,
          referrer_host: beacon.referrerHost?.slice(0, 120) ?? null,
          ip_class: ipClass,
          visitor_country: beacon.visitorCountry?.slice(0, 2)?.toUpperCase() ?? null,
          score: scored.score,
          verdict: scored.verdict,
          decisive_code: scored.decisiveCode,
          signals: scored.signals as never,
          engine_version: String(scored.engineVersion),
          dedupe_key: dedupeKey,
        },
        { onConflict: "merchant_id,dedupe_key", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();

    if (error) throw new Error("ad_click_ingest_failed");
    const duplicate = !inserted;

    if (!duplicate) {
      await bumpVisitorProfile(admin, merchantId, visitorHash, day, scored.verdict, beacon, network);
      if (scored.verdict === "invalid") {
        await reportToNetwork(admin, await networkDigest("ip", beacon.ipRaw), "ip");
        await maybeAutoBlock(admin, merchantId, ipHash, scored.score, clicksHour.count ?? 0);
      }
    }

    incr("framique_ad_clicks_total", { verdict: duplicate ? "duplicate" : scored.verdict, network });
    observe("framique_ad_ingest_ms", Date.now() - started, { network });

    return {
      accepted: !duplicate,
      duplicate,
      verdict: scored.verdict,
      score: scored.score,
      reasons: scored.signals.map((s) => s.code),
    };
  });
}

async function bumpVisitorProfile(
  admin: Client,
  merchantId: string,
  visitorHash: string,
  day: string,
  verdict: AdVerdict,
  beacon: ClickBeacon,
  network: AdNetwork,
) {
  const { data: existing } = await admin
    .from("ad_visitor_profiles")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("visitor_hash", visitorHash)
    .eq("day", day)
    .maybeSingle();

  const clicks = (existing?.clicks ?? 0) + 1;
  const invalid = (existing?.invalid_clicks ?? 0) + (verdict === "invalid" ? 1 : 0);
  const suspicious = (existing?.suspicious_clicks ?? 0) + (verdict === "suspicious" ? 1 : 0);
  const dwell = beacon.dwellMs ?? 0;
  const medianDwell = existing ? Math.round((existing.median_dwell_ms + dwell) / 2) : dwell;
  const distinctCampaigns = Math.max(existing?.distinct_campaigns ?? 0, network ? 1 : 0);

  const scored = scoreVisitor({
    clicks,
    invalidClicks: invalid,
    suspiciousClicks: suspicious,
    productViews: existing?.product_views ?? 0,
    cartAdds: existing?.cart_adds ?? 0,
    orders: existing?.orders ?? 0,
    medianDwellMs: medianDwell,
    distinctCampaigns,
  });

  await admin.from("ad_visitor_profiles").upsert(
    {
      merchant_id: merchantId,
      visitor_hash: visitorHash,
      day,
      clicks,
      invalid_clicks: invalid,
      suspicious_clicks: suspicious,
      product_views: existing?.product_views ?? 0,
      cart_adds: existing?.cart_adds ?? 0,
      orders: existing?.orders ?? 0,
      median_dwell_ms: medianDwell,
      distinct_campaigns: distinctCampaigns,
      fake_score: scored.fakeScore,
      intent_score: scored.intentScore,
      verdict: scored.verdict,
      reasons: scored.reasons as never,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "merchant_id,visitor_hash,day" },
  );
}

/**
 * Auto-quarantine: a fingerprint that keeps producing invalid clicks is blocked
 * for 24h rather than forever, so a shared carrier NAT cannot be poisoned into
 * a permanent ban by an attacker.
 */
async function maybeAutoBlock(
  admin: Client,
  merchantId: string,
  ipHash: string,
  score: number,
  clicksLastHour: number,
) {
  if (score < 85 || clicksLastHour < 5) return;
  const expires = new Date(Date.now() + 24 * 3600_000).toISOString();
  await admin.from("ad_blocklist").upsert(
    {
      merchant_id: merchantId,
      kind: "ip_hash",
      value_hash: ipHash,
      label: "auto",
      reason: "Repeated invalid clicks within one hour",
      auto: true,
      active: true,
      expires_at: expires,
    },
    { onConflict: "merchant_id,kind,value_hash" },
  );
  await writeAdAudit(admin, merchantId, "system", "ads.auto_block", null, { ipHash, score }, "auto sweep");
  incr("framique_ad_autoblocks_total", {});
}

export async function writeAdAudit(
  db: Client,
  merchantId: string,
  actor: string,
  action: string,
  before: unknown,
  after: unknown,
  reason: string | null,
) {
  await db.from("ad_fraud_audit").insert({
    merchant_id: merchantId,
    actor,
    action,
    before_state: (before ?? null) as never,
    after_state: (after ?? null) as never,
    reason,
  });
}

/* ------------------------------------------------------------------ */
/* Daily rollup                                                        */
/* ------------------------------------------------------------------ */

/**
 * Recomputes the attribution-integrity report for one merchant-day. Pure maths
 * lives in `ad-fraud.ts`; this only gathers counters and persists them.
 */
export async function rollupIntegrityDay(admin: Client, merchantId: string, day: string) {
  return withSpan("ads.rollup_day", async () => {
    const [clicks, spend] = await Promise.all([
      admin
        .from("ad_click_events")
        .select("network, campaign, verdict, converted_order_id, decisive_code")
        .eq("merchant_id", merchantId)
        .eq("day", day)
        .limit(20000),
      admin
        .from("ad_spend_days")
        .select("network, campaign, spend_minor_int, currency_code")
        .eq("merchant_id", merchantId)
        .eq("day", day),
    ]);

    type Bucket = {
      clicks: number;
      invalid: number;
      suspicious: number;
      conversions: number;
      poisoned: number;
      signals: Map<string, number>;
    };
    const buckets = new Map<string, Bucket>();
    for (const row of clicks.data ?? []) {
      const key = `${row.network}::${row.campaign}`;
      const b =
        buckets.get(key) ??
        { clicks: 0, invalid: 0, suspicious: 0, conversions: 0, poisoned: 0, signals: new Map() };
      b.clicks += 1;
      if (row.verdict === "invalid") b.invalid += 1;
      if (row.verdict === "suspicious") b.suspicious += 1;
      if (row.converted_order_id) {
        b.conversions += 1;
        if (row.verdict === "invalid") b.poisoned += 1;
      }
      if (row.decisive_code) b.signals.set(row.decisive_code, (b.signals.get(row.decisive_code) ?? 0) + 1);
      buckets.set(key, b);
    }

    const spendByKey = new Map<string, { spend_minor_int: number; currency_code: string }>(
      (spend.data ?? []).map((s) => [
        `${s.network}::${s.campaign}`,
        { spend_minor_int: Number(s.spend_minor_int), currency_code: s.currency_code },
      ]),
    );


    const rows = [...buckets.entries()].map(([key, b]) => {
      const [network, campaign] = key.split("::");
      const money = spendByKey.get(key);
      const integrity = campaignIntegrity({
        network: (isAdNetwork(network!) ? network : "other") as AdNetwork,
        campaign: campaign ?? "unknown",
        day,
        clicks: b.clicks,
        invalidClicks: b.invalid,
        suspiciousClicks: b.suspicious,
        conversions: b.conversions,
        poisonedConversions: b.poisoned,
        spendMinorInt: Number(money?.spend_minor_int ?? 0),
        currencyCode: money?.currency_code ?? "BDT",
      });
      return {
        merchant_id: merchantId,
        network: integrity.network,
        campaign: integrity.campaign,
        day,
        clicks: integrity.clicks,
        invalid_clicks: integrity.invalidClicks,
        suspicious_clicks: integrity.suspiciousClicks,
        conversions: integrity.conversions,
        poisoned_conversions: integrity.poisonedConversions,
        spend_minor_int: integrity.spendMinorInt,
        wasted_spend_minor_int: integrity.wastedSpendMinorInt,
        currency_code: integrity.currencyCode,
        integrity_score: integrity.integrityScore,
        top_signals: [...b.signals.entries()]
          .sort((a, c) => c[1] - a[1])
          .slice(0, 5)
          .map(([code, count]) => ({ code, count })) as never,
        computed_at: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      await admin
        .from("ad_integrity_days")
        .upsert(rows, { onConflict: "merchant_id,network,campaign,day" });
    }
    incr("framique_ad_rollup_rows_total", {}, rows.length);
    return { day, campaigns: rows.length };
  });
}

/** Cron entry point: rolls up today and yesterday, then expires stale blocks. */
export async function runAdFraudSweep(limit = 50) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  await enforceRateLimit("ads.sweep", "global");

  const since = daysAgo(1);
  const { data: active } = await admin
    .from("ad_click_events")
    .select("merchant_id, day")
    .gte("day", since)
    .limit(20000);

  const pairs = new Map<string, { merchantId: string; day: string }>();
  for (const row of active ?? []) {
    pairs.set(`${row.merchant_id}:${row.day}`, { merchantId: row.merchant_id, day: row.day });
  }

  let processed = 0;
  for (const pair of [...pairs.values()].slice(0, limit)) {
    try {
      await rollupIntegrityDay(admin, pair.merchantId, pair.day);
      processed += 1;
    } catch (err) {
      log("error", "ads.rollup_failed", { merchantId: pair.merchantId, day: pair.day, err: String(err) });
    }
  }

  const { data: expiredRows } = await admin
    .from("ad_blocklist")
    .update({ active: false })
    .lt("expires_at", new Date().toISOString())
    .eq("active", true)
    .select("id");

  return { processed, expired: expiredRows?.length ?? 0 };
}


/* ------------------------------------------------------------------ */
/* Beacon policy                                                       */
/* ------------------------------------------------------------------ */

export type BeaconPolicy = {
  exists: boolean;
  allowedOrigins: string[];
  beaconSecret: string | null;
  requireSignature: boolean;
  targetCountry: string;
};

/**
 * Per-merchant policy for the public click beacon: which storefront origins may
 * post, whether beacons must be HMAC signed, and the campaign target country
 * used by the geo signals. Cached for 60s because it sits on the hot ingest
 * path, and fails closed on an unknown merchant so a random uuid cannot create
 * rows via the public endpoint.
 */
export async function beaconPolicy(admin: Client, merchantId: string): Promise<BeaconPolicy> {
  return cached(`ads:beacon-policy:${merchantId}`, 60, async () => {
    const [{ data: merchant }, { data: settings }] = await Promise.all([
      admin.from("merchants").select("id").eq("id", merchantId).maybeSingle(),
      admin
        .from("ad_beacon_settings")
        .select("allowed_origins, beacon_secret_enc, require_signature, target_country")
        .eq("merchant_id", merchantId)
        .maybeSingle(),
    ]);

    if (!merchant) {
      return { exists: false, allowedOrigins: [], beaconSecret: null, requireSignature: false, targetCountry: "BD" };
    }

    let secret: string | null = null;
    if (settings?.beacon_secret_enc) {
      try {
        const { unsealSecret } = await import("./webhook-secret.server");
        secret = await unsealSecret(settings.beacon_secret_enc);
      } catch {
        // A secret we cannot open must not silently disable signing.
        secret = null;
        log("error", "ads.beacon_secret_unreadable", { merchantId });
      }
    }

    return {
      exists: true,
      allowedOrigins: settings?.allowed_origins ?? [],
      beaconSecret: settings?.require_signature ? (secret ?? "unavailable") : secret,
      requireSignature: settings?.require_signature ?? false,
      targetCountry: settings?.target_country ?? "BD",
    };
  });
}

/* ------------------------------------------------------------------ */
/* Merchant desk                                                       */
/* ------------------------------------------------------------------ */

export type DeskPayload = Awaited<ReturnType<typeof loadAdFraudDesk>>;

/**
 * One cached read for the whole ad-defense screen. Cached per merchant for 30s
 * with stale-while-revalidate so a polling dashboard never hammers the
 * warehouse, and always keyed by `merchant_id` so a hit cannot cross tenants.
 */
export async function loadAdFraudDesk(db: Client, merchantId: string, days = AD_FRAUD_WINDOW_DAYS) {
  await enforceRateLimit("ads.read", merchantId);
  const from = daysAgo(days);

  return cached(
    `ads:desk:${merchantId}:${days}:${today()}`,
    30,
    async () =>
      withSpan("ads.desk_load", async () => {
        const [integrity, recent, offenders, blocklist, spend, audit] = await Promise.all([
          db
            .from("ad_integrity_days")
            .select("*")
            .eq("merchant_id", merchantId)
            .gte("day", from)
            .order("day", { ascending: false })
            .limit(500),
          db
            .from("ad_click_events")
            .select("id, network, campaign, occurred_at, score, verdict, decisive_code, signals, ip_class, visitor_country, landing_path")
            .eq("merchant_id", merchantId)
            .gte("day", from)
            .order("occurred_at", { ascending: false })
            .limit(100),
          db
            .from("ad_visitor_profiles")
            .select("visitor_hash, day, clicks, invalid_clicks, fake_score, intent_score, verdict, reasons")
            .eq("merchant_id", merchantId)
            .gte("day", from)
            .order("fake_score", { ascending: false })
            .limit(25),
          db
            .from("ad_blocklist")
            .select("id, kind, value_hash, label, reason, auto, active, expires_at, created_at")
            .eq("merchant_id", merchantId)
            .order("created_at", { ascending: false })
            .limit(100),
          db
            .from("ad_spend_days")
            .select("id, network, campaign, day, spend_minor_int, currency_code")
            .eq("merchant_id", merchantId)
            .gte("day", from)
            .order("day", { ascending: false })
            .limit(200),
          db
            .from("ad_fraud_audit")
            .select("id, actor, action, reason, created_at, after_state")
            .eq("merchant_id", merchantId)
            .order("created_at", { ascending: false })
            .limit(30),
        ]);

        const campaigns: CampaignIntegrity[] = (integrity.data ?? []).map((r) =>
          campaignIntegrity({
            network: (isAdNetwork(r.network) ? r.network : "other") as AdNetwork,
            campaign: r.campaign,
            day: r.day,
            clicks: r.clicks,
            invalidClicks: r.invalid_clicks,
            suspiciousClicks: r.suspicious_clicks,
            conversions: r.conversions,
            poisonedConversions: r.poisoned_conversions,
            spendMinorInt: Number(r.spend_minor_int),
            currencyCode: r.currency_code,
          }),
        );

        const summary = summarizeIntegrity(campaigns);

        return {
          windowDays: days,
          summary,
          adviceBn: integrityAdvice(summary, "bn"),
          adviceEn: integrityAdvice(summary, "en"),
          campaigns,
          recentClicks: (recent.data ?? []).map((c) => ({
            id: c.id,
            network: c.network,
            campaign: c.campaign,
            occurredAt: c.occurred_at,
            score: c.score,
            verdict: c.verdict as AdVerdict,
            ipClass: c.ip_class,
            country: c.visitor_country,
            landingPath: c.landing_path,
            explainedBn: explainSignals((c.signals ?? []) as unknown as FiredSignal[], "bn"),
            explainedEn: explainSignals((c.signals ?? []) as unknown as FiredSignal[], "en"),
          })),
          offenders: offenders.data ?? [],
          blocklist: blocklist.data ?? [],
          spend: spend.data ?? [],
          audit: audit.data ?? [],
        };
      }),
    { staleSeconds: 60 },
  );
}

/** Merchant records what a campaign actually cost so wasted spend is real money. */
export async function saveSpend(
  db: Client,
  merchantId: string,
  actor: string,
  input: { network: string; campaign: string; day: string; spendMinorInt: number; currencyCode: string },
) {
  await enforceRateLimit("ads.write", merchantId);
  const network = isAdNetwork(input.network) ? input.network : "other";
  const { data: before } = await db
    .from("ad_spend_days")
    .select("spend_minor_int")
    .eq("merchant_id", merchantId)
    .eq("network", network)
    .eq("campaign", input.campaign)
    .eq("day", input.day)
    .maybeSingle();

  const { error } = await db.from("ad_spend_days").upsert(
    {
      merchant_id: merchantId,
      network,
      campaign: input.campaign,
      day: input.day,
      spend_minor_int: Math.max(0, Math.trunc(input.spendMinorInt)),
      currency_code: input.currencyCode.toUpperCase(),
      source: "manual",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "merchant_id,network,campaign,day" },
  );
  if (error) throw new Error("ad_spend_save_failed");

  await writeAdAudit(db, merchantId, actor, "ads.spend_saved", before, input, null);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await rollupIntegrityDay(supabaseAdmin as unknown as Client, merchantId, input.day);
  return { ok: true };
}

export async function addBlock(
  db: Client,
  merchantId: string,
  actor: string,
  input: { kind: "ip_hash" | "visitor_hash" | "ua_hash" | "campaign"; value: string; reason?: string | null },
) {
  await enforceRateLimit("ads.write", merchantId);
  const value = input.value.trim();
  if (!value) throw new Error("ad_block_value_required");
  const { error } = await db.from("ad_blocklist").upsert(
    {
      merchant_id: merchantId,
      kind: input.kind,
      value_hash: value,
      label: input.kind === "campaign" ? value : `${value.slice(0, 6)}…`,
      reason: input.reason ?? null,
      auto: false,
      active: true,
    },
    { onConflict: "merchant_id,kind,value_hash" },
  );
  if (error) throw new Error("ad_block_failed");
  await writeAdAudit(db, merchantId, actor, "ads.block_added", null, input, input.reason ?? null);
  return { ok: true };
}

export async function setBlockActive(
  db: Client,
  merchantId: string,
  actor: string,
  id: string,
  active: boolean,
) {
  await enforceRateLimit("ads.write", merchantId);
  const { data: before } = await db
    .from("ad_blocklist")
    .select("id, kind, value_hash, active")
    .eq("merchant_id", merchantId)
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new Error("ad_block_not_found");

  const { error } = await db
    .from("ad_blocklist")
    .update({ active })
    .eq("merchant_id", merchantId)
    .eq("id", id);
  if (error) throw new Error("ad_block_update_failed");

  await writeAdAudit(db, merchantId, actor, "ads.block_toggled", before, { ...before, active }, null);
  return { ok: true };
}

/** Manual "recompute now" for a merchant who just entered spend numbers. */
export async function recomputeWindow(db: Client, merchantId: string, actor: string, days = 7) {
  await enforceRateLimit("ads.recompute", merchantId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Client;
  let campaigns = 0;
  for (let i = 0; i < days; i += 1) {
    const result = await rollupIntegrityDay(admin, merchantId, daysAgo(i));
    campaigns += result.campaigns;
  }
  await writeAdAudit(db, merchantId, actor, "ads.recomputed", null, { days, campaigns }, null);
  return { days, campaigns };
}
