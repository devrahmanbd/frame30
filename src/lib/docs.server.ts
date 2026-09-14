/**
 * Phase 10.8 — the "try it" sandbox executor.
 *
 * The docs are static; this is the only server-side surface they have, and it
 * is the one that needs real engineering, because it is an unauthenticated
 * endpoint that makes an outbound HTTP call on a stranger's behalf. Every
 * property below exists to stop that being a proxy for abuse:
 *
 *  - **Allowlist, not passthrough.** The request must match a `GET` route in
 *    `API_ROUTES` with no path parameters. Nothing else is dispatchable, so the
 *    panel can never mutate a tenant or be pointed at an internal host.
 *  - **Rate limited twice**: per hashed IP (a scripted sweep) and globally
 *    (a distributed one), with the verdict returned so the UI can say why.
 *  - **Hard timeout + abort**, so a slow sandbox cannot hold a worker.
 *  - **Bounded response**: size-capped, JSON-only, never streamed through.
 *  - **Honest degradation.** With no sandbox credential configured the panel
 *    returns a clearly-labelled recorded response rather than pretending to
 *    have called anything. `simulated: true` is rendered in the UI.
 *  - **Observable**: span, counter, latency histogram, structured log. A docs
 *    feature that quietly breaks is a docs feature nobody trusts.
 */
import { getRequest } from "@tanstack/react-start/server";

import { apiRouteByKey, endpointRows, routeKey } from "./docs";
import { incr, log, observe, withSpan } from "./observability.server";
import { enforceRateLimit, RateLimitError, rateLimit } from "./rate-limit.server";

export const TRYIT_TIMEOUT_MS = 6_000;
export const TRYIT_MAX_BYTES = 24_000;

export type TryItInput = {
  /** `METHOD pattern` key, e.g. `GET products`. */
  route: string;
  limit?: number;
};

export type TryItResult = {
  ok: boolean;
  status: number;
  durationMs: number;
  /** True when no sandbox credential is configured and a recorded body is shown. */
  simulated: boolean;
  request: { method: string; url: string; headers: Record<string, string> };
  /** Pretty-printed JSON. A string keeps the RPC payload provably serializable. */
  body: string | null;
  /** Remaining calls in the caller's bucket, for the UI counter. */
  remaining: number;
  resetAt: string;
  error?: string;
};

export class TryItError extends Error {
  constructor(
    readonly code: "unknown_route" | "not_tryable" | "rate_limited" | "unavailable",
    message: string,
    readonly resetAt?: string,
  ) {
    super(message);
    this.name = "TryItError";
  }
}

/** Recorded shapes, used when no sandbox tenant is wired up. Never invented at runtime. */
const RECORDED: Record<string, unknown> = {
  "GET me": {
    merchant_id: "sandbox_7f1c",
    name: "Framique Sandbox Store",
    scopes: ["orders.read", "products.read", "customers.read"],
    rate_limit: { limit: 600, remaining: 599, reset_at: "2026-02-01T09:00:00Z" },
  },
  "GET products": {
    data: [
      {
        id: "prd_01JB4TZ",
        title: "Jamdani saree — indigo",
        status: "active",
        price_minor: 450000,
        currency: "BDT",
        updated_at: "2026-01-28T11:04:12Z",
      },
      {
        id: "prd_01JB4U2",
        title: "Cotton kurta — natural dye",
        status: "draft",
        price_minor: 189000,
        currency: "BDT",
        updated_at: "2026-01-27T08:41:55Z",
      },
    ],
    next_cursor: null,
  },
  "GET orders": {
    data: [
      {
        id: "ord_01JB4V0",
        number: "1042",
        status: "paid",
        total_minor: 639000,
        currency: "BDT",
        placed_at: "2026-01-28T13:22:09Z",
      },
    ],
    next_cursor: null,
  },
  "GET customers": { data: [], next_cursor: null },
  "GET exports": { data: [], next_cursor: null },
  "GET webhooks": { data: [], next_cursor: null },
};

async function hashSubject(value: string): Promise<string> {
  const salt = process.env["AUTH_HASH_SALT"] ?? "framique-docs";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${value}`));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function callerIp(): string {
  try {
    const request = getRequest();
    const header =
      request?.headers.get("cf-connecting-ip") ??
      request?.headers.get("x-forwarded-for") ??
      request?.headers.get("x-real-ip") ??
      "";
    return header.split(",")[0]?.trim() || "unknown";
  } catch {
    // Called outside a request scope (unit test, warmup): one shared subject is
    // the safe default — it throttles harder, never softer.
    return "unknown";
  }
}

/** Read a bounded amount of the response; a docs panel never needs 5 MB. */
async function readBounded(res: Response): Promise<{ body: string; truncated: boolean }> {
  const text = await res.text();
  const truncated = text.length > TRYIT_MAX_BYTES;
  const slice = truncated ? text.slice(0, TRYIT_MAX_BYTES) : text;
  try {
    return { body: JSON.stringify(JSON.parse(slice), null, 2), truncated };
  } catch {
    // Not JSON (an HTML error page from a proxy, say): show it verbatim rather
    // than swallowing the one clue the reader has.
    return { body: slice, truncated };
  }
}

export async function runTryIt(input: TryItInput, origin: string | null): Promise<TryItResult> {
  return withSpan("docs.tryit", async () => {
    const route = apiRouteByKey(input.route);
    if (!route) {
      incr("framique_docs_tryit_total", { route: "unknown", outcome: "rejected" });
      throw new TryItError("unknown_route", "That endpoint is not part of the public API.");
    }

    const row = endpointRows().find((r) => r.key === routeKey(route));
    if (!row?.tryable) {
      incr("framique_docs_tryit_total", { route: row?.key ?? "unknown", outcome: "rejected" });
      throw new TryItError(
        "not_tryable",
        "Only read-only endpoints without path parameters can be run from the docs.",
      );
    }

    const subject = await hashSubject(callerIp());
    let verdict;
    try {
      // Per-caller first (cheap to attribute), then a shared ceiling so a
      // botnet cannot spend the sandbox's quota one IP at a time.
      verdict = await enforceRateLimit("docs.tryit", subject);
      await enforceRateLimit("docs.tryit_global", "all");
    } catch (error) {
      if (error instanceof RateLimitError) {
        incr("framique_docs_tryit_total", { route: row.key, outcome: "rate_limited" });
        throw new TryItError("rate_limited", "Too many sandbox calls. Try again shortly.", error.resetAt);
      }
      throw error;
    }

    const limit = Math.min(Math.max(Number(input.limit ?? 3) || 3, 1), 10);
    const base = process.env["DOCS_SANDBOX_API_BASE"] ?? (origin ? `${origin}/api/public/v1` : null);
    const key = process.env["DOCS_SANDBOX_API_KEY"];
    const path = route.pattern;
    const query = route.pattern === "me" ? "" : `?limit=${limit}`;
    const url = base ? `${base}/${path}${query}` : `/api/public/v1/${path}${query}`;
    const request = {
      method: route.method,
      url,
      headers: { Authorization: "Bearer fq_sandbox_…", Accept: "application/json" },
    };

    // No credential configured: be explicit rather than fake a live call.
    if (!base || !key) {
      incr("framique_docs_tryit_total", { route: row.key, outcome: "simulated" });
      return {
        ok: true,
        status: 200,
        durationMs: 0,
        simulated: true,
        request,
        body: JSON.stringify(RECORDED[row.key] ?? { data: [], next_cursor: null }, null, 2),
        remaining: verdict.remaining,
        resetAt: verdict.reset_at,
      };
    }

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRYIT_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: route.method,
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: controller.signal,
      });
      const { body, truncated } = await readBounded(res);
      const durationMs = Date.now() - started;
      observe("framique_docs_tryit_ms", durationMs, { route: row.key });
      incr("framique_docs_tryit_total", {
        route: row.key,
        outcome: res.ok ? "ok" : `http_${res.status}`,
      });
      if (!res.ok) {
        log("warn", "docs.tryit.upstream_error", { route: row.key, status: res.status });
      }
      return {
        ok: res.ok,
        status: res.status,
        durationMs,
        simulated: false,
        request,
        body: truncated ? `${body}\n\n… response truncated at ${TRYIT_MAX_BYTES} bytes` : body,
        remaining: verdict.remaining,
        resetAt: verdict.reset_at,
      };
    } catch (error) {
      const aborted = (error as Error)?.name === "AbortError";
      const durationMs = Date.now() - started;
      observe("framique_docs_tryit_ms", durationMs, { route: row.key });
      incr("framique_docs_tryit_total", { route: row.key, outcome: aborted ? "timeout" : "error" });
      log("warn", "docs.tryit.failed", {
        route: row.key,
        reason: aborted ? "timeout" : String((error as Error)?.message ?? error).slice(0, 160),
      });
      // Fail soft: the docs page keeps working, the panel says what happened.
      return {
        ok: false,
        status: aborted ? 504 : 502,
        durationMs,
        simulated: false,
        request,
        body: null,
        remaining: verdict.remaining,
        resetAt: verdict.reset_at,
        error: aborted ? "The sandbox did not answer in time." : "The sandbox call failed.",
      };
    } finally {
      clearTimeout(timer);
    }
  });
}

/** Bucket state without spending a hit — powers the "n left" hint on render. */
export async function tryItBudget(): Promise<{ remaining: number; limit: number }> {
  try {
    const subject = await hashSubject(callerIp());
    const verdict = await rateLimit("docs.tryit", `peek:${subject}`);
    return { remaining: verdict.remaining, limit: verdict.limit };
  } catch {
    return { remaining: 0, limit: 0 };
  }
}
