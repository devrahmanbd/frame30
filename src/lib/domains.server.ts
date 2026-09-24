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
 *   private key. With no edge configured the domain stays `dns_verified` with
 *   the cert marked `cert.awaiting_edge` (1h recheck) and the UI says so,
 *   rather than pretending an order was placed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { connect } from "node:tls";
import { cached } from "./cache.server";
import { incr, log, observe, withSpan } from "./observability.server";
import { enforceRateLimit } from "./rate-limit.server";
import {
  DomainInputError,
  LIVE_EDGE_CNAME,
  LIVE_EDGE_IPS,
  MAX_AUTO_ATTEMPTS,
  canTransition,
  certHealth,
  challengeHost,
  dnsInstructions,
  domainQuotaForPlan,
  evaluateDns,
  nextCheckDelaySeconds,
  normalizeHostname,
  type CertStatus,
  type DnsRecord,
  type DomainStatus,
} from "./domains";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Client = SupabaseClient<Database>;
type DomainRow = Database["public"]["Tables"]["merchant_domains"]["Row"];

/**
 * Per-plan custom-domain quota — single source is `domainQuotaForPlan()` in
 * `./domains` (owner policy 2026-09-19: 1 store = 1 domain on every plan).
 * This map is derived from it for callers that need a lookup table; do not
 * edit values here, edit the function.
 */
export const PLAN_DOMAIN_QUOTA: Record<string, number> = {
  launch: domainQuotaForPlan("launch"),
  growth: domainQuotaForPlan("growth"),
  business: domainQuotaForPlan("business"),
  enterprise: domainQuotaForPlan("enterprise"),
};

/** List-page safety cap — the add gate uses per-plan quotas (domainQuotaForPlan). */
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

/** Routing target merchants point DNS at. Configurable per environment. */
export function edgeTarget(): { cname: string; ips: string[] } {
  const cname = process.env["DOMAIN_EDGE_CNAME"] ?? LIVE_EDGE_CNAME;
  const envIps = (process.env["DOMAIN_EDGE_IPS"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { cname, ips: envIps.length > 0 ? envIps : [...LIVE_EDGE_IPS] };
}

/* ------------------------------- DNS reads ------------------------------- */

type DohAnswer = { type: number; data: string };

const RESOLVERS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
] as const;

async function resolveOnce(
  resolver: string,
  name: string,
  type: "TXT" | "CNAME" | "A",
) {
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
export async function resolveDns(
  name: string,
  type: "TXT" | "CNAME" | "A",
): Promise<string[]> {
  return cached(`dns:${type}:${name}`, 30, async () => {
    const started = Date.now();
    const settled = await Promise.allSettled(
      RESOLVERS.map((r) => resolveOnce(r, name, type)),
    );
    observe("framique_domain_dns_ms", Date.now() - started, { type });
    const ok = settled.filter((s) => s.status === "fulfilled");
    if (!ok.length) {
      incr("framique_domain_dns_total", { type, outcome: "error" });
      throw new DomainError("domain.dns_unavailable", 503);
    }
    incr("framique_domain_dns_total", { type, outcome: "ok" });
    const out = new Set<string>();
    for (const s of ok)
      for (const v of (s as PromiseFulfilledResult<string[]>).value) out.add(v);
    return [...out];
  });
}

/* ------------------------------ state machine ---------------------------- */

async function transition(
  domain: Pick<DomainRow, "id" | "merchant_id" | "status">,
  to: DomainStatus,
  patch: Partial<Database["public"]["Tables"]["merchant_domains"]["Update"]>,
  meta: {
    reason?: string | null;
    detail?: Record<string, unknown>;
    actor?: string | null;
  } = {},
) {
  const from = domain.status as DomainStatus;
  if (!canTransition(from, to)) {
    log("warn", "domain.illegal_transition", { from, to, domain: domain.id });
    throw new DomainError("domain.illegal_transition", 409);
  }
  const db = supabaseAdmin;
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
    log("info", "domain.transition", {
      domain: domain.id,
      from,
      to,
      reason: meta.reason ?? null,
    });
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
  cert: {
    status: CertStatus;
    issuedAt: string | null;
    expiresAt: string | null;
    error: string | null;
  };
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
    observed:
      (row.observed_records as unknown as {
        type: string;
        values: string[];
      }[]) ?? [],
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

export async function listDomains(
  db: Client,
  merchantId: string,
  userId: string,
) {
  return withSpan("domains.list", async () => {
    const { data, error } = await db
      .from("merchant_domains")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false });
    if (error) throw new DomainError(error.message, 500);
    // The UI hides the add form at this quota: report the real per-plan
    // quota (owner policy: 1 store = 1 domain on every plan), not the
    // list-page cap. Single source is domainQuotaForPlan(); fail closed to 1.
    let quota = domainQuotaForPlan("launch");
    try {
      const { data: sub } = await db
        .from("subscriptions")
        .select("plan")
        .eq("merchant_id", merchantId)
        .maybeSingle();
      quota = domainQuotaForPlan(
        ((sub as { plan?: string } | null)?.plan ?? "launch") as
          "launch" | "growth" | "business" | "enterprise",
      );
    } catch {
      quota = 1;
    }
    return {
      domains: (data ?? []).map(toView),
      target: edgeTarget(),
      edgeConfigured: Boolean(process.env["DOMAIN_EDGE_HOOK_URL"]),
      limit: Math.min(quota, MAX_DOMAINS_PER_MERCHANT),
    };
  });
}

export async function domainHistory(
  db: Client,
  merchantId: string,
  userId: string,
  domainId: string,
) {
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
    detail: (e.detail ?? {}) as Record<
      string,
      string | number | boolean | null
    >,
    createdAt: e.created_at,
  }));
}

/* -------------------------------- mutations ------------------------------- */

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function addDomain(
  db: Client,
  merchantId: string,
  userId: string,
  input: string,
) {
  return withSpan("domains.add", async () => {
    await enforceRateLimit("domains.write", userId);
    let hostname: string;
    try {
      hostname = normalizeHostname(input);
    } catch (err) {
      throw new DomainError(
        err instanceof DomainInputError ? err.code : "domain.invalid",
        400,
      );
    }

    const { count } = await db
      .from("merchant_domains")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", merchantId);
    // Plan-tiered quota (LE quota protection). Missing subscription reads
    // as launch — fail closed, never unlimited.
    const { data: sub } = await db
      .from("subscriptions")
      .select("plan")
      .eq("merchant_id", merchantId)
      .maybeSingle();
    const quota = domainQuotaForPlan(
      (sub?.plan ?? "launch") as
        "launch" | "growth" | "business" | "enterprise",
    );
    if ((count ?? 0) >= quota)
      throw new DomainError("domain.limit_reached", 409);

    const service = supabaseAdmin;
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
    if (row.status === "disabled")
      throw new DomainError("domain.disabled", 409);

    const service = supabaseAdmin;
    if (
      (row.status as DomainStatus) === "pending_dns" ||
      (row.status as DomainStatus) === "failed"
    ) {
      await transition(
        row,
        "verifying",
        {},
        { reason: "domain.check_started", actor: opts.actor },
      );
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
      const issued = await requestCertificate(
        db,
        merchantId,
        refreshed.id,
        opts.actor ?? null,
      );
      // Issuance observation, single place: covers both the manual Check now
      // button and the sweep (which calls verifyDomain per row). If the edge
      // already serves a valid cert, flip to active in the same pass instead
      // of waiting for the next sweep. Disabled via DOMAIN_TLS_OBSERVE=false.
      if (
        process.env["DOMAIN_TLS_OBSERVE"] !== "false" &&
        (issued.status === "dns_verified" || issued.status === "issuing_cert")
      ) {
        try {
          if (await reconcileIssuance(row.hostname)) {
            return toView(await loadOwned(db, merchantId, domainId));
          }
        } catch {
          // Logged inside reconcileIssuance; DNS verdict stands regardless.
        }
      }
      return issued;
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
        next_check_at: new Date(
          Date.now() + nextCheckDelaySeconds(attempts) * 1000,
        ).toISOString(),
      },
      { reason: verdict.reason, detail: { attempts }, actor: opts.actor },
    );
    incr("framique_domain_verify_total", {
      outcome: stalled ? "failed" : "pending",
    });
    return toView(await loadOwned(db, merchantId, domainId));
  });
}

/**
 * Hand the verified hostname to the TLS edge, in priority order:
 * 1. `DOMAIN_EDGE_HOOK_URL` (external edge with a push receiver);
 * 2. local provisioner (`EDGE_LOCAL_PROVISION=1`): certbot webroot through
 *    the live :80 challenge path, PEM into haproxy, reload — see
 *    `edge-provision.server.ts`. Fire-and-forget: the caller gets
 *    `issuing_cert` immediately; completion lands via `applyCertResult`.
 * 3. Neither: stay put with `cert.awaiting_edge` (fail closed, 1h recheck).
 */
export async function requestCertificate(
  db: Client,
  merchantId: string,
  domainId: string,
  actor: string | null,
): Promise<DomainView> {
  const row = await loadOwned(db, merchantId, domainId);
  const hook = process.env["DOMAIN_EDGE_HOOK_URL"];
  if (!hook) {
    if (
      process.env["EDGE_LOCAL_PROVISION"] === "1" &&
      (await import("./edge-provision.server")).isProvisionableHost(
        row.hostname,
      )
    ) {
      await transition(
        row,
        "issuing_cert",
        {
          cert_status: "pending",
          cert_error: null,
          next_check_at: new Date(Date.now() + 3_600_000).toISOString(),
        },
        { reason: "cert.requested", actor },
      );
      incr("framique_domain_cert_request_total", { outcome: "local" });
      // Never block the caller on ACME (15–120s): the provision settles the
      // state machine itself on completion.
      void provisionAndApply(db, merchantId, row.id, row.hostname, actor);
      return toView(await loadOwned(db, merchantId, domainId));
    }
    // No edge to place an order with: stay in the current status (normally
    // dns_verified) with the cert marked awaiting-edge and a 1h recheck.
    // Moving to issuing_cert here would strand the domain — no callback can
    // ever arrive, and serving requires `active`.
    await transition(
      row,
      row.status as DomainStatus,
      {
        cert_status: "pending",
        cert_error: "cert.awaiting_edge",
        next_check_at: new Date(Date.now() + 3_600_000).toISOString(),
      },
      { reason: "cert.awaiting_edge", actor },
    );
    incr("framique_domain_cert_request_total", { outcome: "awaiting_edge" });
    return toView(await loadOwned(db, merchantId, domainId));
  }
  // Schedule the next sweep visit so a domain parked in issuing_cert with a
  // failing edge is re-polled instead of stranding forever. verifyDomain
  // owns DNS backoff; this 1h fallback only applies when no callback arrives.
  await transition(
    row,
    "issuing_cert",
    {
      cert_status: "pending",
      cert_error: null,
      next_check_at: new Date(Date.now() + 3_600_000).toISOString(),
    },
    { reason: "cert.requested", actor },
  );

  try {
    const res = await fetch(hook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env["DOMAIN_EDGE_TOKEN"] ?? ""}`,
      },
      body: JSON.stringify({
        hostname: row.hostname,
        domainId: row.id,
        merchantId,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`edge_${res.status}`);
    incr("framique_domain_cert_request_total", { outcome: "ok" });
  } catch (err) {
    incr("framique_domain_cert_request_total", { outcome: "error" });
    log("warn", "domain.cert_request_failed", { domain: row.id });
    const service = supabaseAdmin;
    await service
      .from("merchant_domains")
      .update({
        cert_error: err instanceof Error ? err.message : "edge_unreachable",
      })
      .eq("id", row.id);
  }
  return toView(await loadOwned(db, merchantId, domainId));
}

/** Per-host provision single-flight (module scope: shared by all callers). */
const provisionInflight = new Map<string, number>();

/**
 * Traffic trigger — the real-time path that replaces polling and the manual
 * button for the common case. When edge traffic arrives for a hostname with
 * a non-terminal domain row (the merchant just pasted DNS and hit their URL
 * to test it), run one verify→provision chain, coalesced per host per
 * cooldown window. Never throws, never blocks serving: failures degrade to
 * the next trigger or the sweep, exactly as before.
 */
export async function triggerEdgeVerify(hostname: string): Promise<void> {
  try {
    const { shouldProvisionNow } = await import("./edge-provision.server");
    const host = hostname.toLowerCase();
    if (shouldProvisionNow(host, provisionInflight) !== "go") return;
    const service = supabaseAdmin;
    const { data: row } = await service
      .from("merchant_domains")
      .select("id, merchant_id, status")
      .eq("hostname", host)
      .maybeSingle();
    if (!row) return;
    const st = row.status as DomainStatus;
    if (
      st !== "pending_dns" &&
      st !== "verifying" &&
      st !== "dns_verified" &&
      st !== "issuing_cert"
    ) {
      return;
    }
    provisionInflight.set(host, Date.now());
    try {
      await verifyDomain(
        service as unknown as Client,
        row.merchant_id as string,
        `edge:${host}`,
        row.id as string,
        { manual: false, actor: "edge-trigger" },
      );
    } finally {
      // Keep the stamp: one trigger per window even when DNS is not ready.
    }
  } catch {
    // Serve first, verify later — a trigger must never break a request.
  }
}

/**
 * Fire-and-forget provision worker: runs the local ACME order, then settles
 * the state machine through the audited `applyCertResult` path (ok →
 * `active`, fail → `failed` with `cert_error`). Never throws — the domain
 * keeps its 1h recheck either way, so a crashed order degrades to the next
 * trigger instead of stranding.
 */
export async function provisionAndApply(
  db: Client,
  merchantId: string,
  domainId: string,
  hostname: string,
  actor: string | null,
): Promise<void> {
  const { shouldProvisionNow, runProvisionOrder, isProvisionableHost } =
    await import("./edge-provision.server");
  const host = hostname.toLowerCase();
  if (!isProvisionableHost(host)) return;
  if (shouldProvisionNow(host, provisionInflight) !== "go") return;
  provisionInflight.set(host, Date.now());
  try {
    const result = await runProvisionOrder(host, {
      staging: process.env["ACME_STAGING"] === "true",
    });
    if (result.ok) {
      await applyCertResult({
        hostname: host,
        ok: true,
        expiresAt: result.expiresAt,
        error: null,
      });
    } else {
      const service = supabaseAdmin;
      await service
        .from("merchant_domains")
        .update({
          cert_status: "error",
          cert_error: result.error,
          next_check_at: new Date(Date.now() + 3_600_000).toISOString(),
        })
        .eq("id", domainId);
      await service.from("domain_events").insert({
        domain_id: domainId,
        merchant_id: merchantId,
        from_status: "issuing_cert",
        to_status: "issuing_cert",
        reason: "cert.provision_failed",
        detail: { error: result.error },
        actor,
      });
    }
  } catch (err) {
    log("warn", "domain.provision_crashed", { domain: domainId });
    void err;
  } finally {
    // Keep the cooldown stamp (not a delete): a finished order — ok or
    // not — must not immediately re-fire on the next trigger.
  }
}

export async function setPrimary(
  db: Client,
  merchantId: string,
  userId: string,
  domainId: string,
) {
  await enforceRateLimit("domains.write", userId);
  const row = await loadOwned(db, merchantId, domainId);
  if ((row.status as DomainStatus) !== "active")
    throw new DomainError("domain.not_active", 409);
  const service = supabaseAdmin;
  await service
    .from("merchant_domains")
    .update({ is_primary: false })
    .eq("merchant_id", merchantId);
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
  if (row.is_primary && redirect)
    throw new DomainError("domain.primary_cannot_redirect", 409);
  const service = supabaseAdmin;
  await service
    .from("merchant_domains")
    .update({ redirect_to_primary: redirect })
    .eq("id", domainId);
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
      ? {
          check_attempts: 0,
          last_error: null,
          next_check_at: new Date().toISOString(),
        }
      : { is_primary: false },
    { reason: enabled ? "domain.enabled" : "domain.disabled", actor: userId },
  );
  return listDomains(db, merchantId, userId);
}

export async function removeDomain(
  db: Client,
  merchantId: string,
  userId: string,
  domainId: string,
) {
  await enforceRateLimit("domains.write", userId);
  await loadOwned(db, merchantId, domainId);
  const service = supabaseAdmin;
  const { error } = await service
    .from("merchant_domains")
    .delete()
    .eq("id", domainId);
  if (error) throw new DomainError(error.message, 500);
  incr("framique_domain_removed_total");
  return listDomains(db, merchantId, userId);
}

/**
 * Rename a domain (edit hostname). Re-validates, enforces global uniqueness,
 * and resets verification: new hostname starts at pending_dns with a fresh
 * token, loses primary (a primary must be re-verified before serving), and
 * records an audit event. Returns the refreshed list.
 */
export async function renameDomain(
  db: Client,
  merchantId: string,
  userId: string,
  domainId: string,
  rawHostname: string,
) {
  await enforceRateLimit("domains.write", userId);
  const row = await loadOwned(db, merchantId, domainId);
  const hostname = normalizeHostname(rawHostname);
  if (hostname === row.hostname) return listDomains(db, merchantId, userId);
  const service = supabaseAdmin;
  const { error } = await service
    .from("merchant_domains")
    .update({
      hostname,
      status: "pending_dns",
      is_primary: false,
      verification_token: randomToken(),
      dns_target: edgeTarget().cname,
      next_check_at: new Date().toISOString(),
      last_error: null,
      check_attempts: 0,
      // A certificate belongs to the old hostname: carrying it over would
      // display "HTTPS valid" for a domain that was never issued one.
      cert_status: "pending",
      cert_issued_at: null,
      cert_expires_at: null,
      cert_error: null,
      activated_at: null,
      verified_at: null,
    })
    .eq("id", domainId);
  if (error) {
    if (error.code === "23505") throw new DomainError("domain.taken", 409);
    throw new DomainError(error.message, 500);
  }
  await service.from("domain_events").insert({
    domain_id: domainId,
    merchant_id: merchantId,
    from_status: row.status,
    to_status: "pending_dns",
    reason: "domain.renamed",
    actor: userId,
    detail: { from: row.hostname, to: hostname },
  });
  incr("framique_domain_renamed_total");
  return listDomains(db, merchantId, userId);
}

/* ----------------------------- edge integration --------------------------- */

/** ACME http-01: the edge registers the token, we serve it over plain HTTP. */
export async function storeChallenge(
  hostname: string,
  token: string,
  keyAuthorization: string,
) {
  const service = supabaseAdmin;
  const { data: domain } = await service
    .from("merchant_domains")
    .select("id")
    .eq("hostname", hostname)
    .maybeSingle();
  if (!domain) throw new DomainError("domain.not_found", 404);
  await service.from("domain_challenges").upsert(
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

export async function readChallenge(
  hostname: string,
  token: string,
): Promise<string | null> {
  const service = supabaseAdmin;
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
  const service = supabaseAdmin;
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
      href: "/dashboard/settings/domains",
    });
    // First live domain becomes primary automatically — one less manual step.
    const { count } = await service
      .from("merchant_domains")
      .select("id", { count: "exact", head: true })
      .eq("merchant_id", row.merchant_id)
      .eq("is_primary", true);
    if (!count) {
      await service
        .from("merchant_domains")
        .update({ is_primary: true })
        .eq("id", row.id);
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
      href: "/dashboard/settings/domains",
    });
  }
}

/* --------------------- edge issuance observation --------------------- */

/**
 * Observe the certificate the world currently sees on a hostname.
 *
 * The edge (OpenResty + lua-resty-acme autossl) issues pull-based on first
 * SNI hit — there is no push hook to notify us. So instead of waiting for a
 * callback that may never come, the sweep performs a real TLS handshake with
 * full chain validation (`rejectUnauthorized`). Staging, self-signed and
 * expired certs fail validation inherently and can never flip a domain.
 */
export async function observeEdgeCertificate(
  hostname: string,
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let done = false;
    let sock: ReturnType<typeof connect> | null = null;
    const finish = (
      r: { ok: true; expiresAt: string } | { ok: false; error: string },
    ) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        sock?.destroy();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    const timer = setTimeout(
      () => finish({ ok: false, error: "tls.timeout" }),
      8000,
    );
    try {
      sock = connect({
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: true,
      });
    } catch {
      finish({ ok: false, error: "tls.connect_failed" });
      return;
    }
    sock.on("secureConnect", () => {
      try {
        const cert = sock?.getPeerCertificate() as
          { valid_to?: unknown } | undefined;
        const expires =
          typeof cert?.valid_to === "string" ? new Date(cert.valid_to) : null;
        if (
          !expires ||
          !Number.isFinite(expires.getTime()) ||
          expires.getTime() <= Date.now()
        ) {
          finish({ ok: false, error: "tls.bad_cert_dates" });
        } else {
          finish({ ok: true, expiresAt: expires.toISOString() });
        }
      } catch {
        finish({ ok: false, error: "tls.cert_read_failed" });
      }
    });
    sock.on("error", (err: unknown) => {
      finish({
        ok: false,
        error:
          err instanceof Error && (err as NodeJS.ErrnoException).code
            ? `tls.${(err as NodeJS.ErrnoException).code}`.toLowerCase()
            : "tls.error",
      });
    });
  });
}

/**
 * Reconcile one hostname against the publicly served certificate. Flips
 * `dns_verified`/`issuing_cert` to `active` (via the audited `applyCertResult`
 * path) when — and only when — a valid public cert is observed. Never throws;
 * returns whether the domain flipped. Unverified rows are never touched.
 */
export async function reconcileIssuance(hostname: string): Promise<boolean> {
  try {
    const host = hostname.toLowerCase();
    const service = supabaseAdmin;
    const { data: row } = await service
      .from("merchant_domains")
      .select("*")
      .eq("hostname", host)
      .maybeSingle();
    if (!row) return false;
    const status = row.status as DomainStatus;
    if (status !== "dns_verified" && status !== "issuing_cert") return false;
    const seen = await observeEdgeCertificate(host);
    if (!seen.ok) return false;
    if (status === "dns_verified") {
      // Bridge through issuing_cert: the edge demonstrably placed the order
      // (a valid cert exists), so record that before marking issued.
      await transition(
        row as unknown as Pick<DomainRow, "id" | "merchant_id" | "status">,
        "issuing_cert",
        { cert_status: "pending", cert_error: null },
        { reason: "cert.edge_observed_order" },
      );
    }
    await applyCertResult({
      hostname: host,
      ok: true,
      expiresAt: seen.expiresAt,
    });
    return true;
  } catch (err) {
    log("warn", "domain.reconcile_failed", { hostname });
    void err;
    return false;
  }
}

/**
 * Refresh a live row's expiry from the publicly served certificate.
 *
 * The edge auto-renews on its own with no callback, so `cert_expires_at`
 * would otherwise decay into false "Expiring" UI on healthy domains. Reads
 * the served cert (full chain validation) and, when it is newer than the
 * stored date, updates the date in place — status stays `active`, no state
 * transition, no event noise (a plain update, not `transition()`).
 * Never throws; returns whether the date moved.
 */
export async function refreshActiveExpiry(hostname: string): Promise<boolean> {
  try {
    const host = hostname.toLowerCase();
    const service = supabaseAdmin;
    const { data: row } = await service
      .from("merchant_domains")
      .select("*")
      .eq("hostname", host)
      .maybeSingle();
    if (!row || (row.status as DomainStatus) !== "active") return false;
    const seen = await observeEdgeCertificate(host);
    if (!seen.ok) return false;
    const current = (row as { cert_expires_at?: unknown }).cert_expires_at;
    const currentMs =
      typeof current === "string" ? new Date(current).getTime() : NaN;
    const seenMs = new Date(seen.expiresAt).getTime();
    if (!Number.isFinite(seenMs)) return false;
    if (Number.isFinite(currentMs) && seenMs <= currentMs) return false;
    const { error } = await service
      .from("merchant_domains")
      .update({
        cert_expires_at: seen.expiresAt,
        cert_error: null,
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) return false;
    incr("framique_domain_expiry_refreshed_total");
    return true;
  } catch {
    log("warn", "domain.refresh_failed", { hostname });
    return false;
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
    const service = supabaseAdmin;
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
  activated: number;
};

/**
 * Poll every domain whose next check is due, then flag certificates inside the
 * renewal window so the edge can re-order before expiry.
 *
 * Renewal goes through `transition()` (active -> issuing_cert, cert_status
 * `renewing`) so audit rows, metrics and the illegal-edge guard all apply —
 * never a raw `cert_status` write. Domains parked in `issuing_cert` without
 * an edge are re-polled via `verifyDomain` (issuing_cert -> verifying is a
 * legal edge) instead of stranding forever.
 */
export async function sweepDomains(
  subject = "cron",
): Promise<DomainSweepResult> {
  return withSpan("domains.sweep", async () => {
    await enforceRateLimit("domains.sweep", subject);
    const service = supabaseAdmin;
    const now = new Date().toISOString();

    const { data: due } = await service
      .from("merchant_domains")
      .select("*")
      .in("status", [
        "pending_dns",
        "verifying",
        "dns_verified",
        "issuing_cert",
      ])
      .lte("next_check_at", now)
      .order("next_check_at", { ascending: true })
      .limit(50);

    const result: DomainSweepResult = {
      checked: 0,
      verified: 0,
      failed: 0,
      renewals: 0,
      expired_challenges: 0,
      activated: 0,
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
        if (
          view.status === "dns_verified" ||
          view.status === "issuing_cert" ||
          view.status === "active"
        ) {
          result.verified += 1;
        }
        if (view.status === "failed") result.failed += 1;
        // Activation is observed inside verifyDomain (single path); count rows
        // that arrived non-active and left active.
        if (view.status === "active" && row.status !== "active") {
          result.activated += 1;
        }
      } catch {
        // Per-domain failures are logged inside verifyDomain; keep sweeping.
      }
    }

    // Stuck issuing_cert re-poll: rows that reached issuing_cert while an
    // edge hook was configured (or legacy parked rows) but never received a
    // callback get re-queued here so verifyDomain + issuance observation can
    // heal them instead of stranding forever.
    if (!process.env["DOMAIN_EDGE_HOOK_URL"]) {
      const staleAt = new Date(Date.now() - 3_600_000).toISOString();
      const { data: stuck } = await service
        .from("merchant_domains")
        .select("id")
        .eq("status", "issuing_cert")
        .lt("updated_at", staleAt)
        .gt("next_check_at", now)
        .order("updated_at", { ascending: true })
        .limit(50);
      for (const row of stuck ?? []) {
        await service
          .from("merchant_domains")
          .update({ next_check_at: now })
          .eq("id", row.id);
      }
      if ((stuck ?? []).length > 0) {
        log("info", "domains.sweep_stuck_requeued", {
          count: (stuck ?? []).length,
        });
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
      try {
        const { data: full } = await service
          .from("merchant_domains")
          .select("*")
          .eq("id", row.id)
          .maybeSingle();
        if (!full) continue;
        const hook = process.env["DOMAIN_EDGE_HOOK_URL"];
        if (!hook) {
          const { isProvisionableHost } =
            await import("./edge-provision.server");
          if (
            process.env["EDGE_LOCAL_PROVISION"] === "1" &&
            isProvisionableHost(row.hostname)
          ) {
            // Renewal through the local provisioner: same fire-and-forget
            // order as issuance; applyCertResult flips back to active.
            await transition(
              full as unknown as Pick<
                DomainRow,
                "id" | "merchant_id" | "status"
              >,
              "issuing_cert",
              {
                cert_status: "renewing",
                cert_error: null,
                next_check_at: new Date(Date.now() + 3_600_000).toISOString(),
              },
              { reason: "cert.renew_requested" },
            );
            void provisionAndApply(
              service as unknown as Client,
              row.merchant_id,
              row.id,
              row.hostname,
              null,
            );
            result.renewals += 1;
            continue;
          }
          log("info", "domains.renewal_skipped_no_edge", {
            domain: row.id,
          });
          continue;
        }
        // Renewal via the state machine: active -> issuing_cert with
        // CertStatus `renewing`. Emits domain_events + metrics like any
        // other edge; the raw-update path bypassed both and then hit
        // `domain.illegal_transition` inside requestCertificate.
        await transition(
          full as unknown as Pick<DomainRow, "id" | "merchant_id" | "status">,
          "issuing_cert",
          {
            cert_status: "renewing",
            cert_error: null,
            next_check_at: new Date(Date.now() + 3_600_000).toISOString(),
          },
          { reason: "cert.renew_requested" },
        );
        try {
          const res = await fetch(hook, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${process.env["DOMAIN_EDGE_TOKEN"] ?? ""}`,
            },
            body: JSON.stringify({
              hostname: row.hostname,
              domainId: row.id,
              merchantId: row.merchant_id,
              renew: true,
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error(`edge_${res.status}`);
          incr("framique_domain_cert_request_total", { outcome: "ok" });
        } catch (err) {
          incr("framique_domain_cert_request_total", { outcome: "error" });
          log("warn", "domain.cert_request_failed", { domain: row.id });
          await service
            .from("merchant_domains")
            .update({
              cert_error:
                err instanceof Error ? err.message : "edge_unreachable",
            })
            .eq("id", row.id);
        }
        result.renewals += 1;
      } catch {
        // Illegal edge or missing row: logged inside transition(); keep sweeping.
      }
    }

    const { count } = await service
      .from("domain_challenges")
      .delete({ count: "exact" })
      .lt("expires_at", now);
    result.expired_challenges = count ?? 0;

    for (const [k, v] of Object.entries(result))
      incr("framique_domain_sweep_total", { bucket: k }, v);
    log("info", "domains.sweep", { ...result });
    return result;
  });
}
