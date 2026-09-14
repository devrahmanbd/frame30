/**
 * Public REST gateway (`/api/public/v1/*`).
 *
 * One place owns the cross-cutting concerns so individual resources cannot
 * forget them: authentication (API key *or* OAuth bearer), scope checks,
 * per-credential rate limiting, idempotency replay for writes, cursor
 * pagination, RFC 9457-style problem responses, metrics and structured logs.
 *
 * Tenancy: the credential decides `merchant_id`; it is never read from the
 * request. A caller cannot reach another merchant's rows even by guessing ids.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  matchRoute,
  parseScopes,
  requiresIdempotency,
  satisfies,
  type Scope,
} from "./api-scopes";
import { incr, log, observe } from "./observability.server";
import { rateLimit } from "./rate-limit.server";

type Admin = SupabaseClient<Database>;

export const API_VERSION = "2026-01-01";

type Principal = {
  kind: "api_key" | "oauth";
  merchantId: string;
  scopes: Scope[];
  subject: string;
  credentialId: string;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ApiError";
  }
}

function problem(status: number, code: string, detail?: string, extra: Record<string, unknown> = {}) {
  return Response.json(
    { type: `https://docs.framique.app/errors/${code}`, title: code, status, detail, ...extra },
    { status, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } },
  );
}

/* ------------------------------------------------------------------ */
/* Auth                                                                 */
/* ------------------------------------------------------------------ */

async function authenticate(request: Request): Promise<Principal> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    throw new ApiError(401, "unauthorized", "Send Authorization: Bearer <token>.");
  }
  // OAuth access tokens carry a distinct prefix, so one header serves both
  // credential families without an extra round-trip to the wrong table.
  if (token.startsWith("frmat_")) {
    const { resolveAccessToken } = await import("./oauth.server");
    const resolved = await resolveAccessToken(token);
    if (!resolved) throw new ApiError(401, "invalid_token", "Token expired or revoked.");
    return {
      kind: "oauth",
      merchantId: resolved.merchantId,
      scopes: resolved.scopes,
      subject: resolved.subject,
      credentialId: resolved.tokenId,
    };
  }
  const { resolveBearer } = await import("./api-keys.server");
  const key = await resolveBearer(token);
  if (!key) throw new ApiError(401, "invalid_token", "API key unknown or revoked.");
  return {
    kind: "api_key",
    merchantId: key.merchantId,
    scopes: parseScopes(key.scopes),
    subject: key.keyId,
    credentialId: key.keyId,
  };
}

/* ------------------------------------------------------------------ */
/* Idempotency                                                          */
/* ------------------------------------------------------------------ */

async function hashBody(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type IdempotencyHit =
  | { kind: "replay"; status: number; body: Json }
  | { kind: "conflict" }
  | { kind: "fresh" };

async function checkIdempotency(
  db: Admin,
  merchantId: string,
  route: string,
  key: string,
  requestHash: string,
): Promise<IdempotencyHit> {
  const { data } = await db
    .from("api_idempotency_keys")
    .select("request_hash,response,status")
    .eq("merchant_id", merchantId)
    .eq("idem_key", key)
    .eq("route", route)
    .maybeSingle();
  if (!data) return { kind: "fresh" };
  // Same key, different body = the client reused a key for a new intent.
  if (data.request_hash !== requestHash) return { kind: "conflict" };
  return { kind: "replay", status: data.status, body: data.response ?? null };
}

/* ------------------------------------------------------------------ */
/* Handlers                                                             */
/* ------------------------------------------------------------------ */

type Ctx = {
  db: Admin;
  principal: Principal;
  params: Record<string, string>;
  url: URL;
  body: unknown;
};

type Handled = { status: number; body: Json };

function page(url: URL) {
  return { limit: clampLimit(url.searchParams.get("limit")), cursor: decodeCursor(url.searchParams.get("cursor")) };
}

/** Keyset pagination on (created_at, id) — stable under concurrent inserts. */
function applyCursor<T>(query: T, cursor: { ts: string; id: string } | null): T {
  const q = query as unknown as {
    or: (f: string) => unknown;
  };
  if (!cursor) return query;
  return q.or(
    `created_at.lt.${cursor.ts},and(created_at.eq.${cursor.ts},id.lt.${cursor.id})`,
  ) as unknown as T;
}

function nextCursor(rows: { created_at: string; id: string }[], limit: number) {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1];
  return last ? encodeCursor({ ts: last.created_at, id: last.id }) : null;
}

function money(minor: number) {
  return { amount_minor: minor, currency: "BDT" };
}

const handlers: Record<string, (ctx: Ctx) => Promise<Handled>> = {
  "GET me": async ({ principal, db }) => {
    const { data } = await db
      .from("merchants")
      .select("id,name,slug")
      .eq("id", principal.merchantId)
      .maybeSingle();
    return {
      status: 200,
      body: {
        credential: principal.kind,
        scopes: principal.scopes,
        merchant: data ? { id: data.id, name: data.name, slug: data.slug } : null,
        api_version: API_VERSION,
      } as unknown as Json,
    };
  },

  "GET orders": async ({ db, principal, url }) => {
    const { limit, cursor } = page(url);
    let query = db
      .from("orders")
      .select(
        "id,order_number,status,payment_method,total_minor_int,currency_code,customer_name,created_at",
      )
      .eq("merchant_id", principal.merchantId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    const status = url.searchParams.get("status");
    if (status) {
      query = query.eq("status", status as Database["public"]["Enums"]["order_status"]);
    }
    query = applyCursor(query, cursor);
    const { data, error } = await query;
    if (error) throw new ApiError(400, "query_failed", error.message);
    const rows = data ?? [];
    return {
      status: 200,
      body: {
        data: rows.map((o) => ({
          id: o.id,
          order_number: o.order_number,
          status: o.status,
          payment_method: o.payment_method,
          total: money(o.total_minor_int),
          customer_name: o.customer_name,
          created_at: o.created_at,
        })),
        next_cursor: nextCursor(rows, limit),
      } as unknown as Json,
    };
  },

  "GET orders/:id": async ({ db, principal, params }) => {
    const { data } = await db
      .from("orders")
      .select("*")
      .eq("merchant_id", principal.merchantId)
      .eq("id", params["id"] as string)
      .maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "Order not found.");
    return {
      status: 200,
      body: {
        id: data.id,
        order_number: data.order_number,
        status: data.status,
        payment_method: data.payment_method,
        subtotal: money(data.subtotal_minor_int),
        shipping: money(data.shipping_minor_int),
        discount: money(data.discount_minor_int),
        vat: money(data.vat_minor_int),
        total: money(data.total_minor_int),
        tags: data.tags,
        note: data.note,
        customer: { name: data.customer_name, phone: data.customer_phone, email: data.customer_email },
        created_at: data.created_at,
      } as unknown as Json,
    };
  },

  "POST orders/:id/notes": async ({ db, principal, params, body }) => {
    const note = typeof (body as { note?: unknown })?.note === "string" ? (body as { note: string }).note : "";
    if (!note.trim()) throw new ApiError(422, "validation_failed", "`note` is required.");
    const { data: order } = await db
      .from("orders")
      .select("id")
      .eq("merchant_id", principal.merchantId)
      .eq("id", params["id"] as string)
      .maybeSingle();
    if (!order) throw new ApiError(404, "not_found", "Order not found.");
    const { data, error } = await db
      .from("order_events")
      .insert({
        merchant_id: principal.merchantId,
        order_id: order.id,
        event_type: "api.note",
        note: note.slice(0, 1000),
      })
      .select("id,created_at")
      .single();
    if (error || !data) throw new ApiError(400, "write_failed", error?.message);
    return { status: 201, body: { id: data.id, created_at: data.created_at } as unknown as Json };
  },

  "GET products": async ({ db, principal, url }) => {
    const { limit, cursor } = page(url);
    let query = db
      .from("products")
      .select("id,title,slug,status,product_kind,image_url,created_at")
      .eq("merchant_id", principal.merchantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    query = applyCursor(query, cursor);
    const { data, error } = await query;
    if (error) throw new ApiError(400, "query_failed", error.message);
    const rows = data ?? [];
    return { status: 200, body: { data: rows, next_cursor: nextCursor(rows, limit) } as unknown as Json };
  },

  "GET products/:id": async ({ db, principal, params }) => {
    const { data } = await db
      .from("products")
      .select("id,title,slug,status,description,image_url,tags,product_kind,created_at,updated_at")
      .eq("merchant_id", principal.merchantId)
      .eq("id", params["id"] as string)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "Product not found.");
    return { status: 200, body: data as unknown as Json };
  },

  "POST products": async ({ db, principal, body }) => {
    const input = (body ?? {}) as { title?: unknown; slug?: unknown; description?: unknown };
    const title = typeof input.title === "string" ? input.title.trim() : "";
    if (title.length < 2) throw new ApiError(422, "validation_failed", "`title` must be at least 2 characters.");
    const slug =
      (typeof input.slug === "string" && input.slug.trim()) ||
      `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)}-${Date.now().toString(36)}`;
    const { data, error } = await db
      .from("products")
      .insert({
        merchant_id: principal.merchantId,
        title: title.slice(0, 200),
        slug,
        status: "draft",
        description: typeof input.description === "string" ? input.description.slice(0, 4000) : null,
      })
      .select("id,title,slug,status,created_at")
      .single();
    if (error || !data) throw new ApiError(400, "write_failed", error?.message);
    return { status: 201, body: data as unknown as Json };
  },

  "GET customers": async ({ db, principal, url }) => {
    const { limit, cursor } = page(url);
    let query = db
      .from("customers")
      .select("id,name,email,phone,locale,created_at")
      .eq("merchant_id", principal.merchantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    query = applyCursor(query, cursor);
    const { data, error } = await query;
    if (error) throw new ApiError(400, "query_failed", error.message);
    const rows = data ?? [];
    return { status: 200, body: { data: rows, next_cursor: nextCursor(rows, limit) } as unknown as Json };
  },

  "GET exports": async ({ db, principal, url }) => {
    const { limit, cursor } = page(url);
    let query = db
      .from("export_jobs")
      .select("id,object_type,format,status,total_rows,size_bytes,created_at,finished_at")
      .eq("merchant_id", principal.merchantId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit);
    query = applyCursor(query, cursor);
    const { data, error } = await query;
    if (error) throw new ApiError(400, "query_failed", error.message);
    const rows = data ?? [];
    return { status: 200, body: { data: rows, next_cursor: nextCursor(rows, limit) } as unknown as Json };
  },

  "POST exports": async ({ db, principal, body }) => {
    const input = (body ?? {}) as { object_type?: unknown; format?: unknown };
    const objectTypes = ["orders", "products", "customers"] as const;
    const objectType = objectTypes.find((t) => t === input.object_type);
    if (!objectType) {
      throw new ApiError(422, "validation_failed", `object_type must be one of ${objectTypes.join(", ")}.`);
    }
    const format = input.format === "jsonl" ? "jsonl" : "csv";
    const { data, error } = await db
      .from("export_jobs")
      .insert({
        merchant_id: principal.merchantId,
        object_type: objectType as Database["public"]["Enums"]["export_object_type"],
        format,
        requested_by: principal.kind === "oauth" ? principal.subject : null,
      })
      .select("id,status,object_type,format,created_at")
      .single();
    if (error || !data) throw new ApiError(400, "write_failed", error?.message);
    return { status: 202, body: data as unknown as Json };
  },

  "GET exports/:id": async ({ db, principal, params }) => {
    const { data } = await db
      .from("export_jobs")
      .select("id,object_type,format,status,total_rows,size_bytes,signed_url,signed_url_expires_at,error,created_at,finished_at")
      .eq("merchant_id", principal.merchantId)
      .eq("id", params["id"] as string)
      .maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "Export job not found.");
    return { status: 200, body: data as unknown as Json };
  },

  "GET webhooks": async ({ db, principal }) => {
    const { data } = await db
      .from("api_webhook_endpoints")
      .select("id,url,description,events,status,failure_count,last_delivery_at,created_at")
      .eq("merchant_id", principal.merchantId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { status: 200, body: { data: data ?? [] } as unknown as Json };
  },

  "POST webhooks": async ({ db, principal, body }) => {
    const input = (body ?? {}) as { url?: unknown; events?: unknown; description?: unknown };
    const { isWebhookEvent, validateEndpointUrl } = await import("./webhook-signing");
    const url = validateEndpointUrl(typeof input.url === "string" ? input.url : "");
    if (!url.ok) throw new ApiError(422, "validation_failed", `url: ${url.reason}`);
    const events = Array.isArray(input.events) ? input.events.filter(isWebhookEvent) : [];
    if (!events.length) throw new ApiError(422, "validation_failed", "`events` must contain known event names.");
    const secretBytes = new Uint8Array(24);
    crypto.getRandomValues(secretBytes);
    const secret = `whsec_${Array.from(secretBytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const { sealSecret } = await import("./webhook-secret.server");
    const { data, error } = await db
      .from("api_webhook_endpoints")
      .insert({
        merchant_id: principal.merchantId,
        url: url.url,
        events,
        description: typeof input.description === "string" ? input.description.slice(0, 200) : "",
        secret_hash: await sealSecret(secret),
        secret_prefix: secret.slice(0, 12),
      })
      .select("id,url,events,status,created_at")
      .single();
    if (error || !data) throw new ApiError(400, "write_failed", error?.message);
    // Shown exactly once; there is no endpoint that reveals it again.
    return { status: 201, body: { ...data, secret } as unknown as Json };
  },

  "DELETE webhooks/:id": async ({ db, principal, params }) => {
    const { error } = await db
      .from("api_webhook_endpoints")
      .delete()
      .eq("merchant_id", principal.merchantId)
      .eq("id", params["id"] as string);
    if (error) throw new ApiError(400, "write_failed", error.message);
    return { status: 200, body: { deleted: true } as unknown as Json };
  },

  /* ---------------------------------------------------------------- */
  /* Themes — the same surface the Themes screen drives, so an SDK or a
     CI job can install, inspect and switch a storefront theme without
     clicking. Activation is exclusive: one active theme per merchant.  */

  "GET themes": async ({ db, principal }) => {
    const { data, error } = await db
      .from("store_themes")
      .select(
        "id,name,version:source_version,author,description,is_active,favourite,screenshot_url,tags,source_listing_slug,installed_at,updated_at",
      )
      .eq("merchant_id", principal.merchantId)
      .order("is_active", { ascending: false })
      .order("installed_at", { ascending: false })
      .limit(100);
    if (error) throw new ApiError(400, "query_failed", error.message);
    return { status: 200, body: { data: (data ?? []) as unknown as Json } as unknown as Json };
  },

  "GET themes/:id": async ({ db, principal, params }) => {
    const { data } = await db
      .from("store_themes")
      .select("*")
      .eq("merchant_id", principal.merchantId)
      .eq("id", params["id"] as string)
      .maybeSingle();
    if (!data) throw new ApiError(404, "not_found", "Theme not found.");
    return { status: 200, body: data as unknown as Json };
  },

  "GET themes/:id/assets": async ({ db, principal, params }) => {
    const themeId = params["id"] as string;
    const { data: theme } = await db
      .from("store_themes")
      .select("id")
      .eq("merchant_id", principal.merchantId)
      .eq("id", themeId)
      .maybeSingle();
    if (!theme) throw new ApiError(404, "not_found", "Theme not found.");
    const { data, error } = await db
      .from("theme_assets")
      .select("id,name,kind,enabled,bytes,url,theme_id,updated_at")
      .eq("merchant_id", principal.merchantId)
      .or(`theme_id.eq.${themeId},theme_id.is.null`)
      .order("kind", { ascending: true })
      .limit(200);
    if (error) throw new ApiError(400, "query_failed", error.message);
    return {
      status: 200,
      body: {
        data: (data ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          enabled: a.enabled,
          bytes: a.bytes,
          url: a.url,
          // A null theme_id asset applies to every theme on the storefront.
          scope: a.theme_id ? "theme" : "global",
          updated_at: a.updated_at,
        })),
      } as unknown as Json,
    };
  },

  "POST themes/:id/activate": async ({ db, principal, params }) => {
    const themeId = params["id"] as string;
    const { data: theme } = await db
      .from("store_themes")
      .select("id,name")
      .eq("merchant_id", principal.merchantId)
      .eq("id", themeId)
      .maybeSingle();
    if (!theme) throw new ApiError(404, "not_found", "Theme not found.");
    const off = await db
      .from("store_themes")
      .update({ is_active: false })
      .eq("merchant_id", principal.merchantId)
      .neq("id", themeId);
    if (off.error) throw new ApiError(400, "write_failed", off.error.message);
    const on = await db
      .from("store_themes")
      .update({ is_active: true })
      .eq("merchant_id", principal.merchantId)
      .eq("id", themeId);
    if (on.error) throw new ApiError(400, "write_failed", on.error.message);
    return {
      status: 200,
      body: { id: theme.id, name: theme.name, is_active: true } as unknown as Json,
    };
  },

  "GET marketplace/themes": async ({ db, url }) => {
    const { limit } = page(url);
    const { data, error } = await db
      .from("marketplace_themes")
      .select(
        "id,slug,name,description,version,vendor_name,category,price_minor_int,currency_code,thumbnail_url,install_count,rating_sum,rating_count,trial_allowed",
      )
      .eq("status", "active")
      .order("install_count", { ascending: false })
      .limit(limit);
    if (error) throw new ApiError(400, "query_failed", error.message);
    return {
      status: 200,
      body: {
        data: (data ?? []).map((t) => ({
          ...t,
          price: money(t.price_minor_int ?? 0),
          rating: t.rating_count ? Number((t.rating_sum / t.rating_count).toFixed(2)) : null,
        })),
      } as unknown as Json,
    };
  },
};

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export async function handleApiRequest(request: Request, splat: string): Promise<Response> {
  const started = Date.now();
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const path = splat.replace(/^\/+|\/+$/g, "");
  const match = matchRoute(method, path);
  const routeLabel = match ? `${method} ${match.route.pattern}` : "unmatched";

  let principal: Principal | null = null;
  try {
    if (!match) throw new ApiError(404, "unknown_route", `No route for ${method} /${path}.`);
    principal = await authenticate(request);

    if (!satisfies(principal.scopes, match.route.scope)) {
      throw new ApiError(403, "insufficient_scope", `Requires scope ${match.route.scope}.`, {
        required_scope: match.route.scope,
        granted_scopes: principal.scopes,
      });
    }

    // Rate limit per credential, not per merchant: one noisy integration must
    // not starve the merchant's other apps.
    const verdict = await rateLimit("api.v1", principal.credentialId);
    const rateHeaders = {
      "x-ratelimit-limit": String(verdict.limit),
      "x-ratelimit-remaining": String(verdict.remaining),
      "x-ratelimit-reset": verdict.reset_at,
    };
    if (!verdict.allowed) {
      incr("framique_api_request_total", { route: routeLabel, status: "429" });
      return problem(429, "rate_limited", "Too many requests.", {
        retry_after: verdict.reset_at,
      });
    }

    const rawBody = method === "GET" || method === "DELETE" ? "" : await request.text();
    let body: unknown = null;
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as Admin;

    // Idempotency: replay the stored response for a repeated key so a retrying
    // client cannot double-create.
    const idemKey = request.headers.get("idempotency-key");
    const requestHash = await hashBody(`${routeLabel}:${rawBody}`);
    if (requiresIdempotency(method)) {
      if (!idemKey) throw new ApiError(400, "idempotency_key_required", "Send an Idempotency-Key header.");
      const hit = await checkIdempotency(db, principal.merchantId, routeLabel, idemKey, requestHash);
      if (hit.kind === "conflict") {
        throw new ApiError(409, "idempotency_conflict", "Key already used with a different body.");
      }
      if (hit.kind === "replay") {
        incr("framique_api_request_total", { route: routeLabel, status: "replay" });
        return Response.json(hit.body, {
          status: hit.status,
          headers: { ...rateHeaders, "idempotent-replay": "true", "cache-control": "no-store" },
        });
      }
    }

    const handler = handlers[routeLabel];
    if (!handler) throw new ApiError(404, "unknown_route", `No handler for ${routeLabel}.`);
    const result = await handler({ db, principal, params: match.params, url, body });

    if (requiresIdempotency(method) && idemKey) {
      await db.from("api_idempotency_keys").insert({
        merchant_id: principal.merchantId,
        idem_key: idemKey,
        route: routeLabel,
        request_hash: requestHash,
        response: result.body,
        status: result.status,
      });
    }

    observe("framique_api_request_ms", Date.now() - started, { route: routeLabel });
    incr("framique_api_request_total", { route: routeLabel, status: String(result.status) });
    return Response.json(result.body, {
      status: result.status,
      headers: {
        ...rateHeaders,
        "framique-version": API_VERSION,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    const apiErr =
      err instanceof ApiError ? err : new ApiError(500, "internal_error", "Unexpected server error.");
    if (apiErr.status >= 500) {
      const { captureError } = await import("./observability.server");
      await captureError(err, { route: routeLabel, merchant_id: principal?.merchantId });
    }
    observe("framique_api_request_ms", Date.now() - started, { route: routeLabel });
    incr("framique_api_request_total", { route: routeLabel, status: String(apiErr.status) });
    log(apiErr.status >= 500 ? "error" : "warn", "api.request_failed", {
      route: routeLabel,
      status: apiErr.status,
      code: apiErr.code,
    });
    return problem(apiErr.status, apiErr.code, apiErr.detail, apiErr.extra);
  }
}
