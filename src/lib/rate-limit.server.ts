/**
 * Two-tier rate limiter: shared Redis sliding window, Postgres fixed window.
 *
 * Tier 1 — **Redis sorted-set sliding window** (`REDIS_URL` set). One `EVAL`
 * per decision trims expired members, counts the window, and only then admits
 * the caller, so the verdict is atomic and *shared across every isolate*. A
 * sliding window also removes the fixed-window edge burst, where a caller can
 * spend `2 × limit` across a boundary instant.
 *
 * Tier 2 — **`public.rate_limit_hit`** (no Redis, or Redis degraded). The
 * counter table is service-role only, so the verdict is never client trusted or
 * client readable. It is per-window, not sliding, and its accuracy is the reason
 * we keep it as the fallback rather than the primary.
 *
 * Failure policy: Redis faults *demote*, they never block — a broken accelerator
 * must not take the checkout down. Only when both tiers are unavailable do we
 * fail **open**, and that outcome is a counter (`outcome="unavailable"`) plus a
 * warn line, because a silent limiter is itself a security incident.
 *
 * Every verdict carries `source` so `/status`, the ops desk and the Grafana
 * panel can prove which tier actually decided.
 */
import { incr, log, observe, registerMetric } from "./observability.server";
import { redisConfigured, redisEval, redisKey } from "./redis.server";

registerMetric(
  "framique_rate_limit_ms",
  "histogram",
  "Rate-limit decision latency in milliseconds by bucket and deciding tier",
  [1, 2, 5, 10, 25, 50, 100, 250],
);

export class RateLimitError extends Error {
  constructor(
    readonly bucket: string,
    readonly resetAt: string,
  ) {
    super("rate_limit.exceeded");
    this.name = "RateLimitError";
  }
}

export type RateLimitSource = "redis" | "postgres" | "none";

export type RateVerdict = {
  allowed: boolean;
  hits: number;
  limit: number;
  remaining: number;
  reset_at: string;
  /** Which tier produced this verdict. `none` means both tiers were down. */
  source?: RateLimitSource;
};


/** Named buckets keep limits reviewable in one place instead of inline magic numbers. */
export const BUCKETS = {
  "auth.signin": { limit: 10, windowSeconds: 300 },
  "auth.reset": { limit: 5, windowSeconds: 900 },
  "auth.recovery": { limit: 8, windowSeconds: 900 },
  "auth.email_change": { limit: 3, windowSeconds: 3600 },
  "webhook.gateway": { limit: 600, windowSeconds: 60 },
  "storefront.form": { limit: 20, windowSeconds: 3600 },
  "owner.purge": { limit: 5, windowSeconds: 3600 },
  // Phase 13 integration desk: saving a connection is deliberate, but each
  // "test connection" makes a real outbound probe, so keep both hand-paced.
  "platform.write": { limit: 60, windowSeconds: 300 },
  "api.public": { limit: 120, windowSeconds: 60 },
  // Developer platform (3.6): token endpoints are brute-force targets, so they
  // are far tighter than the data-plane bucket.
  "api.v1": { limit: 600, windowSeconds: 60 },
  "oauth.token": { limit: 60, windowSeconds: 60 },
  "oauth.authorize": { limit: 20, windowSeconds: 300 },
  "webhook.dispatch": { limit: 600, windowSeconds: 60 },
  "dev.read": { limit: 120, windowSeconds: 60 },
  "dev.write": { limit: 30, windowSeconds: 300 },
  // Custom domains: DNS-over-HTTPS lookups are the expensive part, so manual
  // "check now" is gated much harder than reads, and cron gets its own bucket.
  "domains.read": { limit: 120, windowSeconds: 60 },
  "domains.write": { limit: 20, windowSeconds: 300 },
  "domains.verify": { limit: 12, windowSeconds: 300 },
  "domains.sweep": { limit: 60, windowSeconds: 3600 },
  "domains.acme": { limit: 240, windowSeconds: 60 },
  "catalog.import": { limit: 10, windowSeconds: 600 },
  "catalog.search": { limit: 120, windowSeconds: 60 },
  "storefront.search": { limit: 90, windowSeconds: 60 },
  // Conversion surfaces: reads are cheap and cached, writes are human-paced.
  "storefront.social": { limit: 120, windowSeconds: 60 },
  "storefront.view": { limit: 240, windowSeconds: 60 },
  "storefront.review": { limit: 5, windowSeconds: 3600 },
  "admin.reviews": { limit: 120, windowSeconds: 60 },
  "admin.experiments": { limit: 60, windowSeconds: 60 },
  "storefront.account": { limit: 60, windowSeconds: 60 },
  "checkout.reserve": { limit: 40, windowSeconds: 60 },
  "checkout.place": { limit: 12, windowSeconds: 300 },
  "order.lookup": { limit: 60, windowSeconds: 60 },
  "payments.charge": { limit: 15, windowSeconds: 300 },
  "payments.return": { limit: 30, windowSeconds: 300 },
  "payments.refund": { limit: 20, windowSeconds: 300 },
  "settlement.ingest": { limit: 10, windowSeconds: 3600 },
  "billing.plan_change": { limit: 6, windowSeconds: 3600 },
  "billing.trial_claim": { limit: 3, windowSeconds: 3600 },
  "billing.pay_invoice": { limit: 20, windowSeconds: 300 },
  "billing.sweep": { limit: 12, windowSeconds: 3600 },
  // Phase 5 — Site Kit / Search Console. Google's quota is per project, not
  // per tenant, so every outbound class gets its own bucket and the cron sweep
  // is limited independently of anything a merchant can trigger by hand.
  "sitekit.read": { limit: 120, windowSeconds: 60 },
  "sitekit.write": { limit: 20, windowSeconds: 300 },
  "gsc.properties": { limit: 20, windowSeconds: 300 },
  "gsc.refresh": { limit: 6, windowSeconds: 3600 },
  "gsc.inspect": { limit: 10, windowSeconds: 3600 },
  "gsc.sitemap": { limit: 6, windowSeconds: 3600 },
  "gsc.sweep": { limit: 12, windowSeconds: 3600 },
  "admin.notifications": { limit: 240, windowSeconds: 60 },
  "admin.activity": { limit: 120, windowSeconds: 60 },
  "admin.setup": { limit: 30, windowSeconds: 300 },
  "notifications.sweep": { limit: 12, windowSeconds: 3600 },
  "commerce.inventory": { limit: 120, windowSeconds: 60 },
  "commerce.transfer": { limit: 30, windowSeconds: 300 },
  "commerce.fulfil": { limit: 60, windowSeconds: 300 },
  "commerce.invoice": { limit: 60, windowSeconds: 300 },
  "commerce.giftcard_issue": { limit: 30, windowSeconds: 3600 },
  "commerce.giftcard_redeem": { limit: 10, windowSeconds: 300 },
  "commerce.return_open": { limit: 6, windowSeconds: 3600 },
  "commerce.return_advance": { limit: 60, windowSeconds: 300 },
  "commerce.dispute": { limit: 40, windowSeconds: 300 },
  "commerce.cart_capture": { limit: 60, windowSeconds: 3600 },
  "commerce.cart_recovery": { limit: 20, windowSeconds: 3600 },
  "commerce.customers": { limit: 120, windowSeconds: 60 },
  // Back-office commerce desk: editing is human-paced, applying is expensive.
  "commerce.drafts": { limit: 90, windowSeconds: 60 },
  "commerce.pricing": { limit: 90, windowSeconds: 60 },
  "commerce.purchasing": { limit: 90, windowSeconds: 60 },
  "commerce.bulk_edit": { limit: 120, windowSeconds: 60 },
  "commerce.bulk_apply": { limit: 12, windowSeconds: 300 },
  "commerce.order_tags": { limit: 120, windowSeconds: 60 },
  "commerce.subscriptions": { limit: 90, windowSeconds: 60 },
  "commerce.subscription_run": { limit: 6, windowSeconds: 3600 },
  "commerce.bundles": { limit: 60, windowSeconds: 300 },
  "commerce.coupon_validate": { limit: 30, windowSeconds: 60 },
  "commerce.codegen": { limit: 10, windowSeconds: 3600 },
  "builder.autosave": { limit: 240, windowSeconds: 60 },
  "builder.commit": { limit: 60, windowSeconds: 300 },
  "builder.publish": { limit: 20, windowSeconds: 3600 },
  "builder.schedule": { limit: 30, windowSeconds: 3600 },
  "builder.install": { limit: 10, windowSeconds: 3600 },
  "builder.preset_swap": { limit: 20, windowSeconds: 3600 },
  "builder.update": { limit: 20, windowSeconds: 3600 },
  "builder.custom_code": { limit: 120, windowSeconds: 300 },
  // Phase 1.5 global blocks: reads back the studio panel, writes fan out to
  // every placement, so writes are an order of magnitude tighter.
  "builder.blocks_read": { limit: 240, windowSeconds: 60 },
  "builder.blocks_write": { limit: 60, windowSeconds: 300 },
  // Phase 3 SEO drawer: the panel re-reads on every template switch, writes are
  // one deliberate save per template.
  "builder.seo_read": { limit: 240, windowSeconds: 60 },
  "builder.seo_write": { limit: 60, windowSeconds: 300 },
  "builder.demo_import": { limit: 6, windowSeconds: 3600 },

  "builder.sweep": { limit: 24, windowSeconds: 3600 },
  "shipping.zone_write": { limit: 60, windowSeconds: 300 },
  "shipping.quote": { limit: 120, windowSeconds: 60 },
  "shipping.create": { limit: 60, windowSeconds: 300 },
  "shipping.label": { limit: 60, windowSeconds: 300 },
  "shipping.pickup": { limit: 40, windowSeconds: 300 },
  "shipping.advance": { limit: 120, windowSeconds: 300 },
  "shipping.track": { limit: 60, windowSeconds: 60 },
  "shipping.cod": { limit: 40, windowSeconds: 300 },
  "courier.webhook": { limit: 600, windowSeconds: 60 },
  "courier.replay": { limit: 20, windowSeconds: 300 },
  "courier.sweep": { limit: 24, windowSeconds: 3600 },
  "pos.capture": { limit: 240, windowSeconds: 60 },
  "pos.refund": { limit: 30, windowSeconds: 300 },
  "pos.report": { limit: 60, windowSeconds: 300 },
  "pos.scan": { limit: 300, windowSeconds: 60 },
  // Blog CMS (content roadmap phase 1). Autosave fires roughly every 4s per
  // open editor, so it gets a generous bucket; manual saves and restores are
  // deliberate human actions and are throttled far harder.
  "cms.autosave": { limit: 120, windowSeconds: 60 },
  "cms.save": { limit: 40, windowSeconds: 300 },
  "cms.read": { limit: 240, windowSeconds: 60 },
  "cms.restore": { limit: 20, windowSeconds: 300 },
  "seo.write": { limit: 60, windowSeconds: 300 },
  "seo.read": { limit: 120, windowSeconds: 60 },
  "seo.sitemap": { limit: 120, windowSeconds: 60 },
  // Phase 7 weight discipline: history can poll with the SEO desk, but a real
  // audit loads representative storefront data and is deliberately human-paced.
  "seo.weight_read": { limit: 120, windowSeconds: 60 },
  "seo.weight_run": { limit: 4, windowSeconds: 3600 },
  // Phase 6 content health: the desk polls findings, but a scan walks every
  // article/page/product body and may touch other people's servers, so it is
  // the tightest read-path bucket in the SEO surface. Triage is a human click.
  "content.health_read": { limit: 120, windowSeconds: 60 },
  "content.health_run": { limit: 4, windowSeconds: 3600 },
  "content.health_triage": { limit: 60, windowSeconds: 300 },
  "content.health_suggest": { limit: 120, windowSeconds: 60 },
  "content.health_sweep": { limit: 12, windowSeconds: 3600 },
  // Phase 9.1 blog taxonomy. Reader traffic is IP-keyed and generous (a real
  // reader clicks archives quickly, and the pages are cached anyway) but capped
  // so a scraper walking `?page=` cannot turn pagination into a query amplifier.
  "blog.read": { limit: 240, windowSeconds: 60 },
  "blog.search": { limit: 60, windowSeconds: 60 },
  "taxonomy.read": { limit: 180, windowSeconds: 60 },
  "taxonomy.write": { limit: 60, windowSeconds: 300 },
  // Reordering drags fire one call per drop and deleting relinks children, so
  // both are human-paced writes rather than editor autosave traffic.
  "taxonomy.reorder": { limit: 90, windowSeconds: 300 },
  "taxonomy.delete": { limit: 20, windowSeconds: 3600 },
  // Phase 9.2 platform collection. Opening a charge touches our own gateway
  // account, so a merchant tapping "pay" repeatedly must never turn into
  // provider-side velocity abuse; the return path is generous because a real
  // rail may retry its callback, and every retry is idempotent anyway.
  "platform.pay": { limit: 12, windowSeconds: 900 },
  "platform.return": { limit: 240, windowSeconds: 60 },
  "platform.read": { limit: 120, windowSeconds: 60 },
  "platform.receipt": { limit: 60, windowSeconds: 300 },
  "entitlements.read": { limit: 180, windowSeconds: 60 },
  "consent.record": { limit: 30, windowSeconds: 300 },
  "consent.read": { limit: 60, windowSeconds: 60 },
  "owner.read": { limit: 120, windowSeconds: 60 },
  "owner.revenue": { limit: 60, windowSeconds: 60 },
  "owner.suspend": { limit: 12, windowSeconds: 3600 },
  "owner.impersonate": { limit: 10, windowSeconds: 3600 },
  "owner.impersonate_use": { limit: 120, windowSeconds: 300 },
  "owner.snapshot": { limit: 12, windowSeconds: 3600 },
  "owner.snapshot_restore": { limit: 6, windowSeconds: 3600 },
  "fraud.assess": { limit: 60, windowSeconds: 300 },
  "fraud.scan": { limit: 12, windowSeconds: 3600 },
  "fraud.decide": { limit: 120, windowSeconds: 300 },
  "fraud.beacon": { limit: 120, windowSeconds: 60 },
  "fraud.read": { limit: 120, windowSeconds: 60 },
  "ops.read": { limit: 120, windowSeconds: 60 },
  "ops.replay": { limit: 30, windowSeconds: 300 },
  "ops.backup": { limit: 12, windowSeconds: 3600 },
  "ops.incident": { limit: 60, windowSeconds: 300 },
  "ops.status": { limit: 240, windowSeconds: 60 },
  // Marketplace ecosystem: browsing is cheap, publishing and money are not.
  "market.read": { limit: 120, windowSeconds: 60 },
  "market.install": { limit: 20, windowSeconds: 3600 },
  "market.publish": { limit: 12, windowSeconds: 3600 },
  "market.moderate": { limit: 120, windowSeconds: 300 },
  "market.review": { limit: 10, windowSeconds: 3600 },
  "market.payout": { limit: 6, windowSeconds: 3600 },
  // Analytics: dashboards poll, ETL and exports are expensive.
  "analytics.read": { limit: 180, windowSeconds: 60 },
  "analytics.beacon": { limit: 600, windowSeconds: 60 },
  "analytics.flush": { limit: 12, windowSeconds: 3600 },
  "analytics.report_write": { limit: 60, windowSeconds: 300 },
  "analytics.report_run": { limit: 20, windowSeconds: 3600 },
  // Phase 4.4 real-user monitoring. The ingest bucket is public and keyed per
  // store: a page view posts at most one beacon per metric, so 600/min is
  // generous for a busy storefront and still caps a flood. Dashboard reads are
  // aggregated server-side and cached, so they stay dashboard-paced.
  "vitals.ingest": { limit: 600, windowSeconds: 60 },
  "vitals.ingest_ip": { limit: 60, windowSeconds: 60 },
  "vitals.read": { limit: 120, windowSeconds: 60 },
  // Browser error reports (Phase 12): a render loop is capped client-side too,
  // but a hostile caller must not be able to flood the error backend.
  "errors.ingest_ip": { limit: 30, windowSeconds: 60 },
  // AI & support: a chat turn costs a model call, so it is the tightest
  // per-visitor bucket in the system; desk reads and sweeps are generous.
  "support.ask": { limit: 20, windowSeconds: 300 },
  "support.read": { limit: 180, windowSeconds: 60 },
  "support.ticket": { limit: 120, windowSeconds: 300 },
  "support.ticket_widget": { limit: 10, windowSeconds: 300 },
  "support.callback": { limit: 5, windowSeconds: 1800 },
  "support.kb_write": { limit: 60, windowSeconds: 300 },
  "support.channel": { limit: 600, windowSeconds: 60 },
  "support.sweep": { limit: 12, windowSeconds: 3600 },

  // Provider sign-off & payouts: money-moving paths are deliberately slow.
  // Reads stay generous so a dashboard poll never trips the gate, while every
  // write, submission, review decision and payout request is throttled hard.
  "provider.read": { limit: 120, windowSeconds: 60 },
  "provider.write": { limit: 40, windowSeconds: 300 },
  "provider.submit": { limit: 6, windowSeconds: 3600 },
  "provider.review": { limit: 120, windowSeconds: 300 },
  "payout.read": { limit: 120, windowSeconds: 60 },
  "payout.request": { limit: 10, windowSeconds: 3600 },
  "payout.approve": { limit: 60, windowSeconds: 300 },
  "payout.account": { limit: 12, windowSeconds: 3600 },
  "payout.worker": { limit: 30, windowSeconds: 3600 },
  "currency.read": { limit: 120, windowSeconds: 60 },
  "currency.write": { limit: 12, windowSeconds: 3600 },

  // Ad-fraud defense (§4.2). Click ingest is a public storefront path and the
  // first thing an attacker floods, so it is capped per store *and* the caller
  // is charged again per fingerprint inside the ingest path. Desk reads are
  // cached; blocklist edits and manual recomputes are human-paced.
  "ads.click": { limit: 600, windowSeconds: 60 },
  "ads.click_ip": { limit: 60, windowSeconds: 60 },
  "ads.read": { limit: 120, windowSeconds: 60 },
  "ads.write": { limit: 40, windowSeconds: 300 },
  "ads.recompute": { limit: 12, windowSeconds: 3600 },
  "ads.sweep": { limit: 24, windowSeconds: 3600 },

  // Growth + digital fulfilment (4.3). Points, commissions and game keys are
  // bearer value, so every write path is far tighter than a normal desk read.
  // Revealing a code is the single most abusable call in the product: it is
  // limited per shopper *and* charged again per code inside the service layer.
  "growth.read": { limit: 120, windowSeconds: 60 },
  "growth.write": { limit: 40, windowSeconds: 300 },
  "loyalty.earn": { limit: 120, windowSeconds: 60 },
  "loyalty.redeem": { limit: 10, windowSeconds: 300 },
  "loyalty.adjust": { limit: 20, windowSeconds: 3600 },
  "referral.claim": { limit: 6, windowSeconds: 3600 },
  "affiliate.click": { limit: 300, windowSeconds: 60 },
  "affiliate.apply": { limit: 3, windowSeconds: 3600 },
  "affiliate.payout": { limit: 12, windowSeconds: 3600 },
  "virtual.import": { limit: 12, windowSeconds: 3600 },
  "virtual.reveal": { limit: 12, windowSeconds: 300 },
  "virtual.reveal_code": { limit: 5, windowSeconds: 3600 },
  "virtual.deliver": { limit: 240, windowSeconds: 60 },
  "growth.sweep": { limit: 24, windowSeconds: 3600 },

  // Infrastructure (4.4). Image variants are fetched dozens at a time by a
  // single product page, so the transform bucket is wide but still bounded per
  // IP; queue and index control planes are human-paced.
  "image.transform": { limit: 600, windowSeconds: 60 },
  "infra.read": { limit: 120, windowSeconds: 60 },
  "infra.write": { limit: 30, windowSeconds: 300 },
  "infra.replay": { limit: 30, windowSeconds: 300 },
  "infra.reindex": { limit: 6, windowSeconds: 3600 },
  "infra.loadtest": { limit: 6, windowSeconds: 3600 },
  "infra.worker": { limit: 240, windowSeconds: 60 },

  // Phase 10.4 — public newsletter. The subscribe path is one of the only
  // endpoints an anonymous stranger can POST to, and every accepted call can
  // cause outbound mail, so it is bucketed twice: per hashed IP (a scripted
  // signup farm) and per hashed address (a mail-bombing attempt from rotating
  // IPs). Verify and unsubscribe are link clicks — generous, but bounded so a
  // token-guessing sweep is not free.
  "newsletter.subscribe_ip": { limit: 5, windowSeconds: 900 },
  "newsletter.subscribe_email": { limit: 3, windowSeconds: 3600 },
  "contact.submit_ip": { limit: 6, windowSeconds: 900 },
  "contact.submit_email": { limit: 4, windowSeconds: 3600 },
  "newsletter.verify": { limit: 30, windowSeconds: 300 },
  "newsletter.unsubscribe": { limit: 30, windowSeconds: 300 },

  // Phase 10.8 — the docs "try it" panel. Anonymous strangers can trigger an
  // outbound call, so it is bucketed per hashed IP *and* globally: the per-IP
  // bucket stops a scripted sweep, the global one stops a distributed sweep
  // from spending the sandbox tenant's own quota one address at a time.
  "docs.tryit": { limit: 20, windowSeconds: 300 },
  "docs.tryit_global": { limit: 600, windowSeconds: 60 },

} as const;


export type BucketName = keyof typeof BUCKETS;

/**
 * Sliding-window admission in one round trip.
 *
 * Trim, count, then conditionally admit — in that order, inside the script, so
 * two isolates racing the last slot cannot both win. The set is given a TTL a
 * little longer than the window so an idle subject costs nothing, and the reset
 * hint is derived from the oldest surviving member rather than from "now +
 * window", which would over-state the wait for a caller that has been quiet.
 */
const SLIDING_WINDOW_LUA = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit  = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local hits = redis.call('ZCARD', key)
local allowed = 0
if hits < limit then
  redis.call('ZADD', key, now, member)
  hits = hits + 1
  allowed = 1
end
redis.call('PEXPIRE', key, window + 1000)

local reset = now + window
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
if oldest[2] then reset = tonumber(oldest[2]) + window end
return { allowed, hits, reset }
`;

/** Subject strings can be long (hashed IPs, ids); keep the key bounded. */
function subjectKey(bucket: string, subject: string): string {
  const safe = subject.length > 96 ? `${subject.slice(0, 88)}~${subject.length}` : subject;
  return redisKey("rl", bucket, safe);
}

let uniqueCounter = 0;

async function redisVerdict(
  bucket: BucketName,
  subject: string,
  cfg: { limit: number; windowSeconds: number },
): Promise<RateVerdict | null> {
  if (!redisConfigured()) return null;
  const now = Date.now();
  // Members must be unique per hit, otherwise two hits in the same millisecond
  // collapse into one ZADD and the caller gets a free request.
  const member = `${now}-${(uniqueCounter = (uniqueCounter + 1) % 1_000_000)}`;
  const started = now;
  const result = await redisEval(
    SLIDING_WINDOW_LUA,
    [subjectKey(bucket, subject)],
    [now, cfg.windowSeconds * 1000, cfg.limit, member],
  );
  if (!result.ok || !Array.isArray(result.value)) return null;

  const [allowedRaw, hitsRaw, resetRaw] = result.value as (number | string | null)[];
  const hits = Number(hitsRaw ?? 0);
  const resetMs = Number(resetRaw ?? now + cfg.windowSeconds * 1000);
  if (!Number.isFinite(hits) || !Number.isFinite(resetMs)) return null;

  observe("framique_rate_limit_ms", Date.now() - started, { bucket, source: "redis" });
  return {
    allowed: Number(allowedRaw) === 1,
    hits,
    limit: cfg.limit,
    remaining: Math.max(0, cfg.limit - hits),
    reset_at: new Date(resetMs).toISOString(),
    source: "redis",
  };
}

async function postgresVerdict(
  bucket: BucketName,
  subject: string,
  cfg: { limit: number; windowSeconds: number },
): Promise<RateVerdict | null> {
  const started = Date.now();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (
      supabaseAdmin as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("rate_limit_hit", {
      _bucket: bucket,
      _subject: subject,
      _limit: cfg.limit,
      _window_seconds: cfg.windowSeconds,
    });
    if (error || !data) return null;
    observe("framique_rate_limit_ms", Date.now() - started, { bucket, source: "postgres" });
    return { ...(data as RateVerdict), source: "postgres" };
  } catch (error) {
    log("warn", "rate_limit.postgres_failed", {
      bucket,
      reason: String((error as Error)?.message ?? error).slice(0, 160),
    });
    return null;
  }
}

export async function rateLimit(bucket: BucketName, subject: string): Promise<RateVerdict> {
  const cfg = BUCKETS[bucket];

  const shared = await redisVerdict(bucket, subject, cfg);
  if (shared) {
    incr("framique_rate_limit_total", {
      bucket,
      outcome: shared.allowed ? "allowed" : "blocked",
      source: "redis",
    });
    return shared;
  }
  if (redisConfigured()) {
    // Redis is configured but did not answer: the window is no longer shared.
    // That is a real degradation of the guarantee, so it is its own series.
    incr("framique_rate_limit_total", { bucket, outcome: "degraded", source: "redis" });
    log("warn", "rate_limit.redis_degraded", { bucket });
  }

  const local = await postgresVerdict(bucket, subject, cfg);
  if (local) {
    incr("framique_rate_limit_total", {
      bucket,
      outcome: local.allowed ? "allowed" : "blocked",
      source: "postgres",
    });
    return local;
  }

  // Both tiers down. Fail open on purpose — an unavailable limiter must not
  // become an outage — but say so loudly enough to alert on.
  log("warn", "rate_limit.unavailable", { bucket });
  incr("framique_rate_limit_total", { bucket, outcome: "unavailable", source: "none" });
  return {
    allowed: true,
    hits: 0,
    limit: cfg.limit,
    remaining: cfg.limit,
    reset_at: new Date(Date.now() + cfg.windowSeconds * 1000).toISOString(),
    source: "none",
  };
}

/** Throwing variant for call sites that just want the guard. */
export async function enforceRateLimit(bucket: BucketName, subject: string) {
  const verdict = await rateLimit(bucket, subject);
  if (!verdict.allowed) throw new RateLimitError(bucket, verdict.reset_at);
  return verdict;
}

export function rateLimitHeaders(v: RateVerdict) {
  const resetSeconds = Math.max(0, Math.ceil((Date.parse(v.reset_at) - Date.now()) / 1000));
  return {
    "x-ratelimit-limit": String(v.limit),
    "x-ratelimit-remaining": String(v.remaining),
    "x-ratelimit-reset": v.reset_at,
    // RFC 9110-style hint for dumb clients that cannot parse the timestamp.
    "retry-after": String(resetSeconds),
  };

}
