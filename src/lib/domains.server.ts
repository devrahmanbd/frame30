/**
 * Custom-domain lifecycle: add → verify DNS → issue certificate → serve.
 *
 * Design notes
 * - The database is the state machine's only source of truth; every transition
 *   goes through `transition()`, which refuses illegal edges, writes a
 *   `domain_events` row and counts the move in Prometheus. There is no way to
 *   flip a domain to `active` without the checks having passed.
 * - DNS is read over DNS-over-HTTPS from two independent resolvers so a single
 *   resolver outage (or a stale cache) cannot strand a merchant. Answers are
 *   memoised for 30s to keep the "Check now" button cheap under refresh spam.
 * - TLS is issued at the edge (OpenResty + lua-resty-acme). This module owns
 *   the ACME http-01 challenge store and the edge handshake; it never holds a
 *   private key. With no edge configured the domain parks in `issuing_cert`
 *   and the UI says so, rather than pretending to be live.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { cached } from "./cache.server";
import { incr, log, observe, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  DomainInputError,
  MAX_AUTO_ATTEMPTS,
  canTransition,
  certHealth,
  challengeHost,
  dnsInstructions,
  evaluateDns,
  nextCheckDelaySeconds,
  normalizeHostname,
  type CertStatus,
  type DnsRecord,
  type DomainStatus,
} from "./domains";

type Client = SupabaseClient<Database>;
type DomainRow = Database["public"]["Tables"]["merchant_domains"]["Row"];

const MAX_DOMAINS_PER_MERCHANT = 10;
const DNS_TIMEOUT_MS = 4000;

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "DomainError";
  }
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Routing target merchants point DNS at. Configurable per environment. */
export function edgeTarget(): { cname: string; ips: string[] } {
  const cname = process.env["DOMAIN_EDGE_CNAME"] ?? "edge.framique.app";
  const ips = (process.env["DOMAIN_EDGE_IPS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { cname, ips };
}

/* ------------------------------- DNS reads ------------------------------- */

type DohAnswer = { type: number; data: string };

const RESOLVERS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
] as const;

async function resolveOnce(resolver: string, name: string, type: "TXT" | "CNAME" | "A") {
  const url = `${resolver}?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetch(url, {
    headers: { accept: "application/dns-json" },
    signal: AbortSignal.timeout(DNS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`doh_${res.status}`);
  const body = (await res.json()) as { Answer?: DohAnswer[]; Status?: number };
  return (body.Answer ?? []).map((a) => a.data);
}

/**
 * Query both resolvers, take the union of answers. A record that any public
 * resolver can see is good enough to proceed — propagation is uneven and we
 * would rather re-check later than block a correctly configured merchant.
 */
export async function resolveDns(name: string, type: "TXT" | "CNAME" | "A"): Promise<string[]> {
  return cached(`dns:${type}:${name}`, 30, async () => {
    const started = Date.now();
    const settled = await Promise.allSettled(RESOLVERS.map((r) => resolveOnce(r, name, type)));
    observe("framique_domain_dns_ms", Date.now() - started, { type });
    const ok = settled.filter((s) => s.status === "fulfilled");
    if (!ok.length) {
      incr("framique_domain_dns_total", { type, outcome: "error" });
      throw new DomainError("domain.dns_unavailable", 503);
    }
    incr("framique_domain_dns_total", { type, outcome: "ok" });
    const out = new Set<string>();
    for (const s of ok) for (const v of (s as PromiseFulfilledResult<string[]>).value) out.add(v);
    return [...out];
  });
}

/* ------------------------------ state machine ---------------------------- */

async function transition(
  domain: Pick<DomainRow, "id" | "merchant_id" | "status">,
  to: DomainStatus,
  patch: Partial<Database["public"]["Tables"]["merchant_domains"]["Update"]>,
  meta: { reason?: string | null; detail?: Record<string, unknown>; actor?: string | null } = {},
) {
  const from = domain.status as DomainStatus;
  if (!canTransition(from, to)) {
    log("warn", "domain.illegal_transition", { from, to, domain: domain.id });
    throw new DomainError("domain.illegal_transition", 409);
  }
  const db = await admin();
  const { error } = await db
    .from("merchant_domains")
    .update({ ...patch, status: to, updated_at: new Date().toISOString() })
    .eq("id", domain.id);
  if (error) throw new DomainError(error.message, 500);

  if (from !== to) {
    await db.from("domain_events").insert({
      domain_id: domain.id,
      merchant_id: domain.merchant_id,
      from_status: from,
      to_status: to,
      reason: meta.reason ?? null,
      detail: (meta.detail ?? {}) as Json,
      actor: meta.actor ?? null,
    });
    incr("framique_domain_transition_total", { from, to });
    log("info", "domain.transition", { domain: domain.id, from, to, reason: meta.reason ?? null });
  }
}

/* --------------------------------- reads --------------------------------- */

export type DomainView = {
  id: string;
  hostname: string;
  status: DomainStatus;
  isPrimary: boolean;
  redirectToPrimary: boolean;
  records: DnsRecord[];
  lastCheckedAt: string | null;
  nextCheckAt: string;
  checkAttempts: number;
  lastError: string | null;
  observed: { type: string; values: string[] }[];
  cert: { status: CertStatus; issuedAt: string | null; expiresAt: string | null; error: string | null };
  certHealth: ReturnType<typeof certHealth>;
  verifiedAt: string | null;
  activatedAt: string | null;
  createdAt: string;
};

function toView(row: DomainRow): DomainView {
  return {
    id: row.id,
    hostname: row.hostname,
    status: row.status as DomainStatus,
    isPrimary: row.is_primary,
    redirectToPrimary: row.redirect_to_primary,
    records: dnsInstructions(row.hostname, row.verification_token, {
      cname: row.dns_target,
      ips: edgeTarget().ips,
    }),
    lastCheckedAt: row.last_checked_at,
    nextCheckAt: row.next_check_at,
    checkAttempts: row.check_attempts,
    lastError: row.last_error,
    observed: (row.observed_records as unknown as { type: string; values: string[] }[]) ?? [],
    cert: {
      status: row.cert_status as CertStatus,
      issuedAt: row.cert_issued_at,
      expiresAt: row.cert_expires_at,
      error: row.cert_error,
    },
    certHealth: certHealth(row.cert_expires_at),
    verifiedAt: row.verified_at,
    activatedAt: row.activated_at,
    createdAt: row.created_at,
  };
}

export async function listDomains(db: Client, merchantId: string, userId: string) {
  return withSpan("domains.list", async () => {
    await enforceRateLimit("domains.read", userId);
    const { data, error } = await db
      .from("merchant_domains")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
    if (error) throw new DomainError(error.message, 500);
    return {
      domains: (data ?? []).map(toView),
      target: edgeTarget(),
      edgeConfigured: Boolean(process.env["DOMAIN_EDGE_HOOK_URL"]),
      limit: MAX_DOMAINS_PER_MERCHANT,
    };
  });
}

export async function domainHistory(db: Client, merchantId: string, userId: string, domainId: string) {
  await enforceRateLimit("domains.read", userId);
  const { data, error } = await db
    .from("domain_events")
    .select("id, from_status, to_status, reason, detail, created_at")
    .eq("merchant_id", merchantId)
    .eq("domain_id", domainId)
    .order("id", { ascending: false })
    .limit(50);
  if (error) throw new DomainError(error.message, 500);
  return (data ?? []).map((e) => ({
    id: String(e.id),
    from: e.from_status as DomainStatus | null,
    to: e.to_status as DomainStatus,
    reason: e.reason,
    detail: (e.detail ?? {}) as Record<string, string | number | boolean | null>,
    createdAt: e.created_at,
  }));
}

/* -------------------------------- mutations ------------------------------- */

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function addDomain(db: Client, merchantId: string, userId: string, input: string) {
  return withSpan("domains.add", async () => {
    await enforceRateLimit("domains.write", userId);
    let hostname: string;
    try {
      hostname = normalizeHostname(input);
    } catch (err) {
      throw new DomainError(err instanceof DomainInputError ? err.code : "domain.invalid", 400);
    }

    const { count } = await db
      .from("merchant_domains")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId);
    if ((count ?? 0) >= MAX_DOMAINS_PER_MERCHANT) throw new DomainError("domain.limit_reached", 409);

    const service = await admin();
    // Global uniqueness is enforced by a unique index; surfacing it as a clean
    // error prevents one tenant from probing another tenant's hostnames.
    const { data, error } = await service
      .from("merchant_domains")
      .insert({
        merchant_id: merchantId,
        hostname,
        verification_token: randomToken(),
        dns_target: edgeTarget().cname,
        created_by: userId,
        next_check_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") throw new DomainError("domain.taken", 409);
      throw new DomainError(error.message, 500);
    }

    await service.from("domain_events").insert({
      domain_id: data.id,
      merchant_id: merchantId,
      from_status: null,
      to_status: "pending_dns",
      reason: "domain.added",
      actor: userId,
    });
    incr("framique_domain_added_total");
    return toView(data);
  });
}

async function loadOwned(db: Client, merchantId: string, domainId: string) {
  const { data, error } = await db
    .from("merchant_domains")
    .select("*")
    .eq("merchant_id", merchantId)
    .eq("id", domainId)
    .maybeSingle();
  if (error) throw new DomainError(error.message, 500);
  if (!data) throw new DomainError("domain.not_found", 404);
  return data;
}

/**
 * One verification pass. Safe to call from the UI button and from cron: it is
 * idempotent, always records what it observed, and always schedules the next
 * automatic attempt with backoff.
 */
export async function verifyDomain(
  db: Client,
  merchantId: string,
  userId: string,
  domainId: string,
  opts: { actor?: string | null; manual?: boolean } = {},
): Promise<DomainView> {
  return withSpan("domains.verify", async () => {
    if (opts.manual !== false) await enforceRateLimit("domains.verify", userId);
    const row = await loadOwned(db, merchantId, domainId);
    if (row.status === "disabled") throw new DomainError("domain.disabled", 409);

    const service = await admin();
    if ((row.status as DomainStatus) === "pending_dns" || (row.status as DomainStatus) === "failed") {
      await transition(row, "verifying", {}, { reason: "domain.check_started", actor: opts.actor });
      row.status = "verifying";
    }

    const target = edgeTarget();
    let txt: string[] = [];
    let cname: string[] = [];
    let a: string[] = [];
    try {
      [txt, cname, a] = await Promise.all([
        resolveDns(challengeHost(row.hostname), "TXT"),
        resolveDns(row.hostname, "CNAME"),
        resolveDns(row.hostname, "A"),
      ]);
    } catch {
      // Resolver outage is our problem, not the merchant's: retry sooner and
      // leave the state untouched so the UI does not show a bogus failure.
      await service
        .from("merchant_domains")
        .update({
          last_checked_at: new Date().toISOString(),
          next_check_at: new Date(Date.now() + 120_000).toISOString(),
          last_error: "domain.dns_unavailable",
        })
        .eq("id", row.id);
      throw new DomainError("domain.dns_unavailable", 503);
    }

    const verdict = evaluateDns({
      hostname: row.hostname,
      token: row.verification_token,
      txt,
      cname,
      a,
      target,
    });
    const attempts = row.check_attempts + 1;
    const observed = [
      { type: "TXT", values: txt },
      { type: "CNAME", values: cname },
      { type: "A", values: a },
    ] as unknown as Json;
    const now = new Date();

    if (!verdict.reason) {
      await transition(
        row,
        "dns_verified",
        {
          verified_at: now.toISOString(),
          last_checked_at: now.toISOString(),
          check_attempts: 0,
          last_error: null,
          observed_records: observed,
          next_check_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
        { reason: "domain.dns_ok", actor: opts.actor },
      );
      incr("framique_domain_verify_total", { outcome: "verified" });
      const refreshed = await loadOwned(db, merchantId, domainId);
      return requestCertificate(db, merchantId, refreshed.id, opts.actor ?? null);
    }

    const stalled = attempts >= MAX_AUTO_ATTEMPTS;
    await transition(
      row,
      stalled ? "failed" : "verifying",
      {
        last_checked_at: now.toISOString(),
        check_attempts: attempts,
        last_error: verdict.reason,
        observed_records: observed,
        next_check_at: new Date(Date.now() + nextCheckDelaySeconds(attempts) * 1000).toISOString(),
      },
      { reason: verdict.reason, detail: { attempts }, actor: opts.actor },
    );
    incr("framique_domain_verify_total", { outcome: stalled ? "failed" : "pending" });
    return toView(await loadOwned(db, merchantId, domainId));
  });
}

/**
 * Hand the verified hostname to the TLS edge. `lua-resty-acme` performs the
 * ACME order and calls back into `/api/public/domains/callback`; we only track
 * the state and store http-01 challenges it registers.
 */
export async function requestCertificate(
  db: Client,
  merchantId: string,
  domainId: string,
  actor: string | null,
): Promise<DomainView> {
  const row = await loadOwned(db, merchantId, domainId);
  const hook = process.env["DOMAIN_EDGE_HOOK_URL"];
  await transition(
    row,
    "issuing_cert",
    { cert_status: "pending", cert_error: null },
    { reason: hook ? "cert.requested" : "cert.awaiting_edge", actor },
  );

  if (hook) {
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env["DOMAIN_EDGE_TOKEN"] ?? ""}`,
        },
        body: JSON.stringify({ hostname: row.hostname, domainId: row.id, merchantId }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`edge_${res.status}`);
      incr("framique_domain_cert_request_total", { outcome: "ok" });
    } catch (err) {
      incr("framique_domain_cert_request_total", { outcome: "error" });
      log("warn", "domain.cert_request_failed", { domain: row.id });
      const service = await admin();
      await service
        .from("merchant_domains")
        .update({ cert_error: err instanceof Error ? err.message : "edge_unreachable" })
        .eq("id", row.id);
    }
  }
  return toView(await loadOwned(db, merchantId, domainId));
}

export async function setPrimary(db: Client, merchantId: string, userId: string, domainId: string) {
  await enforceRateLimit("domains.write", userId);
  const row = await loadOwned(db, merchantId, domainId);
  if ((row.status as DomainStatus) !== "active") throw new DomainError("domain.not_active", 409);
  const service = await admin();
  await service.from("merchant_domains").update({ is_primary: false }).eq("merchant_id", merchantId);
  const { error } = await service
    .from("merchant_domains")
    .update({ is_primary: true, redirect_to_primary: false })
    .eq("id", domainId);
  if (error) throw new DomainError(error.message, 500);
  await service.from("domain_events").insert({
    domain_id: domainId,
    merchant_id: merchantId,
    from_status: row.status,
    to_status: row.status,
    reason: "domain.primary_set",
    actor: userId,
  });
  incr("framique_domain_primary_set_total");
  return listDomains(db, merchantId, userId);
}

export async function setRedirect(
  db: Client,
  merchantId: string,
  userId: string,
  domainId: string,
  redirect: boolean,
) {
  await enforceRateLimit("domains.write", userId);
  const row = await loadOwned(db, merchantId, domainId);
  if (row.is_primary && redirect) throw new DomainError("domain.primary_cannot_redirect", 409);
  const service = await admin();
  await service.from("merchant_domains").update({ redirect_to_primary: redirect }).eq("id", domainId);
  return listDomains(db, merchantId, userId);
}

export async function setDomainEnabled(
  db: Client,
  merchantId: string,
  userId: string,
  domainId: string,
  enabled: boolean,
) {
  await enforceRateLimit("domains.write", userId);
  const row = await loadOwned(db, merchantId, domainId);
  await transition(
    row,
    enabled ? "pending_dns" : "disabled",
    enabled
      ? { check_attempts: 0, last_error: null, next_check_at: new Date().toISOString() }
      : { is_primary: false },
    { reason: enabled ? "domain.enabled" : "domain.disabled", actor: userId },
  );
  return listDomains(db, merchantId, userId);
}

export async function removeDomain(db: Client, merchantId: string, userId: string, domainId: string) {
  await enforceRateLimit("domains.write", userId);
  await loadOwned(db, merchantId, domainId);
  const service = await admin();
  const { error } = await service.from("merchant_domains").delete().eq("id", domainId);
  if (error) throw new DomainError(error.message, 500);
  incr("framique_domain_removed_total");
  return listDomains(db, merchantId, userId);
}

/* ----------------------------- edge integration --------------------------- */

/** ACME http-01: the edge registers the token, we serve it over plain HTTP. */
export async function storeChallenge(hostname: string, token: string, keyAuthorization: string) {
  const service = await admin();
  const { data: domain } = await service
    .from("merchant_domains")
    .select("id")
    .eq("hostname", hostname)
    .maybeSingle();
  if (!domain) throw new DomainError("domain.not_found", 404);
  await service
    .from("domain_challenges")
    .upsert(
      {
        domain_id: domain.id,
        hostname,
        token,
        key_authorization: keyAuthorization,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
      { onConflict: "hostname,token" },
    );
  incr("framique_domain_challenge_stored_total");
}

export async function readChallenge(hostname: string, token: string): Promise<string | null> {
  const service = await admin();
  const { data } = await service
    .from("domain_challenges")
    .select("key_authorization, expires_at")
    .eq("hostname", hostname)
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.key_authorization;
}

/** Certificate result reported by the edge after an ACME order settles. */
export async function applyCertResult(input: {
  hostname: string;
  ok: boolean;
  expiresAt?: string | null;
  error?: string | null;
}) {
  const service = await admin();
  const { data: row } = await service
    .from("merchant_domains")
    .select("*")
    .eq("hostname", input.hostname)
    .maybeSingle();
  if (!row) throw new DomainError("domain.not_found", 404);

  if (input.ok) {
    await transition(
      row,
      "active",
      {
        cert_status: "issued",
        cert_issued_at: new Date().toISOString(),
        cert_expires_at: input.expiresAt ?? null,
        cert_error: null,
        activated_at: new Date().toISOString(),
        last_error: null,
        check_attempts: 0,
        next_check_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      { reason: "cert.issued" },
    );
    incr("framique_domain_cert_total", { outcome: "issued" });
    await notifyMerchant(row.merchant_id, {
      kind: "domain_active",
      severity: "info",
      titleEn: "Custom domain is live",
      titleBn: "কাস্টম ডোমেইন চালু হয়েছে",
      bodyEn: `${row.hostname} now serves your storefront over HTTPS.`,
      bodyBn: `${row.hostname} এখন HTTPS-এ আপনার স্টোর দেখাচ্ছে।`,
      href: "/admin/settings/domains",
    });
    // First live domain becomes primary automatically — one less manual step.
    const { count } = await service
      .from("merchant_domains")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", row.merchant_id)
      .eq("is_primary", true);
    if (!count) {
      await service.from("merchant_domains").update({ is_primary: true }).eq("id", row.id);
    }
  } else {
    await transition(
      row,
      "failed",
      { cert_status: "error", cert_error: input.error ?? "cert.failed" },
      { reason: "cert.failed", detail: { error: input.error ?? null } },
    );
    incr("framique_domain_cert_total", { outcome: "error" });
    await notifyMerchant(row.merchant_id, {
      kind: "domain_cert_failed",
      severity: "warning",
      titleEn: "Certificate could not be issued",
      titleBn: "সার্টিফিকেট ইস্যু করা যায়নি",
      bodyEn: `We could not issue TLS for ${row.hostname}. Check the DNS records and retry.`,
      bodyBn: `${row.hostname}-এর জন্য TLS ইস্যু করা যায়নি। DNS রেকর্ড দেখে আবার চেষ্টা করুন।`,
      href: "/admin/settings/domains",
    });
  }
}

async function notifyMerchant(
  merchantId: string,
  n: {
    kind: string;
    severity: "info" | "warning" | "critical";
    titleEn: string;
    titleBn: string;
    bodyEn: string;
    bodyBn: string;
    href: string;
  },
) {
  try {
    const service = await admin();
    await service.from("notifications").insert({
      merchant_id: merchantId,
      kind: n.kind,
      severity: n.severity,
      title_en: n.titleEn,
      title_bn: n.titleBn,
      body_en: n.bodyEn,
      body_bn: n.bodyBn,
      href: n.href,
    });
  } catch {
    // A missed alert must never fail the domain transition.
  }
}

/* ---------------------------------- cron ---------------------------------- */

export type DomainSweepResult = {
  checked: number;
  verified: number;
  failed: number;
  renewals: number;
  expired_challenges: number;
};

/**
 * Poll every domain whose next check is due, then flag certificates inside the
 * renewal window so the edge can re-order before expiry.
 */
export async function sweepDomains(subject = "cron"): Promise<DomainSweepResult> {
  return withSpan("domains.sweep", async () => {
    await enforceRateLimit("domains.sweep", subject);
    const service = await admin();
    const now = new Date().toISOString();

    const { data: due } = await service
      .from("merchant_domains")
      .select("*")
      .in("status", ["pending_dns", "verifying", "dns_verified"])
      .lte("next_check_at", now)
      .order("next_check_at", { ascending: true })
      .limit(50);

    const result: DomainSweepResult = {
      checked: 0,
      verified: 0,
      failed: 0,
      renewals: 0,
      expired_challenges: 0,
    };

    for (const row of due ?? []) {
      result.checked += 1;
      try {
        const view = await verifyDomain(
          service as unknown as Client,
          row.merchant_id,
          subject,
          row.id,
          { manual: false, actor: null },
        );
        if (view.status === "dns_verified" || view.status === "issuing_cert" || view.status === "active") {
          result.verified += 1;
        }
        if (view.status === "failed") result.failed += 1;
      } catch {
        // Per-domain failures are logged inside verifyDomain; keep sweeping.
      }
    }

    const renewAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { data: renewals } = await service
      .from("merchant_domains")
      .select("id, hostname, merchant_id, status, cert_expires_at")
      .eq("status", "active")
      .eq("cert_status", "issued")
      .lt("cert_expires_at", renewAt)
      .limit(50);
    for (const row of renewals ?? []) {
      await service.from("merchant_domains").update({ cert_status: "renewing" }).eq("id", row.id);
      await requestCertificate(service as unknown as Client, row.merchant_id, row.id, null).catch(
        () => undefined,
      );
      result.renewals += 1;
    }

    const { count } = await service
      .from("domain_challenges")
      .delete({ count: "exact" })
      .lt("expires_at", now);
    result.expired_challenges = count ?? 0;

    for (const [k, v] of Object.entries(result)) incr("framique_domain_sweep_total", { bucket: k }, v);
    log("info", "domains.sweep", { ...result });
    return result;
  });
}
