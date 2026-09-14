import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { isStorefrontPath, storefrontCacheHeaders } from "./lib/storefront-cache";
import { consoleSecurityHeaders, isConsolePath } from "./lib/console-headers";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

/**
 * Phase 4 — document hardening for merchant custom code.
 *
 * The custom-code island is the only path that can add script to a storefront
 * page, and it is created by the app itself after hydration, so the enforced
 * boundary that matters lives where merchant markup actually runs: the `html`
 * widget's sandboxed iframe carries its own strict CSP (see
 * `buildCsp`/`sandboxSrcDoc`). Here we set the document-level headers that can
 * be applied without rewriting the streamed SSR body.
 */
/**
 * Local development and preview hosts allow framing for design tools and dev preview;
 * production hosts enforce the strict framing denial policy.
 */
function isEditorPreviewHost(request: Request): boolean {
  try {
    const { hostname } = new URL(request.url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("preview.") ||
      hostname.startsWith("id-preview--")
    );
  } catch {
    return false;
  }
}

function withSecurityHeaders(request: Request, response: Response): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (isEditorPreviewHost(request)) {
    headers.delete("x-frame-options");
  } else {
    headers.set("x-frame-options", "SAMEORIGIN");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * §5 — console documents are never framed and never indexed. Applied after the
 * base header set so `frame-ancestors 'none'` / `DENY` win over `SAMEORIGIN`.
 */
function withConsoleHeaders(request: Request, response: Response): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const { pathname } = new URL(request.url);
  if (!isConsolePath(pathname)) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(consoleSecurityHeaders())) headers.set(key, value);
  if (isEditorPreviewHost(request)) {
    // Keep noindex + private caching, drop the framing denial for the editor.
    headers.delete("x-frame-options");
    headers.delete("content-security-policy");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}


/**
 * Phase 8.2 — shared-cache policy for storefront documents.
 *
 * Only `/store/*` HTML is cacheable, and the window is deliberately short: the
 * authoritative invalidation is the origin cache key, which carries the
 * published theme version, so a publish changes the key rather than requiring
 * an edge purge. Admin, owner and API responses stay private.
 */
function withStorefrontCache(request: Request, response: Response): Response {
  if (request.method !== "GET") return response;
  if (response.status !== 200) return response;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const { pathname } = new URL(request.url);
  if (!isStorefrontPath(pathname)) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(storefrontCacheHeaders(null))) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withTenantCanaryHeaders(
  response: Response,
  decision?: { cohortTier?: number; tenantId?: string | null; targetSlot?: string },
): Response {
  const headers = new Headers(response.headers);
  const currentSlot = process.env["CLUSTER_SLOT"] || process.env["TOPOLOGY_SLOT"] || "blue";
  headers.set("x-framique-slot", currentSlot);
  if (decision) {
    if (decision.cohortTier !== undefined) {
      headers.set("x-framique-cohort-tier", String(decision.cohortTier));
    }
    if (decision.tenantId) {
      headers.set("x-framique-tenant-id", decision.tenantId);
    }
    if (decision.targetSlot) {
      headers.set("x-framique-target-slot", decision.targetSlot);
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      
      // Global Security Middleware: Enforce HTTPS
      const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(':', '');
      const isLocalhost = url.hostname.includes("localhost") || url.hostname.includes("127.0.0.1") || url.hostname.endsWith(".local") || url.hostname.endsWith("framique.test");
      
      if (proto === "http" && !isLocalhost && !url.hostname.startsWith("preview.") && !url.hostname.startsWith("id-preview--")) {
        return Response.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
      }

      // Global Security Middleware: Enforce CSRF Protection on Mutations
      if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
        // Exclude generic API webhooks that rely on external callers
        if (!url.pathname.startsWith("/api/public") && !url.pathname.startsWith("/api/canary-alert")) {
          const origin = request.headers.get("origin");
          const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
          
          if (origin) {
            try {
              const originHost = new URL(origin).host;
              if (originHost !== host && !isLocalhost) {
                return new Response("CSRF check failed (origin mismatch)", { status: 403 });
              }
            } catch {
              return new Response("CSRF check failed (invalid origin)", { status: 403 });
            }
          } else {
            const referer = request.headers.get("referer");
            if (referer) {
              try {
                const refererHost = new URL(referer).host;
                if (refererHost !== host && !isLocalhost) {
                  return new Response("CSRF check failed (referer mismatch)", { status: 403 });
                }
              } catch {
                return new Response("CSRF check failed (invalid referer)", { status: 403 });
              }
            }
            // If neither Origin nor Referer is present, fail safely
            else if (!isLocalhost && !url.pathname.startsWith("/api/")) {
               return new Response("CSRF check failed (missing origin/referer)", { status: 403 });
            }
          }
        }
      }

      // Global Security Middleware: Global Ingress Rate Limiting
      if (!isLocalhost && !url.pathname.startsWith("/api/healthz") && url.pathname !== "/healthz") {
        try {
          const { enforceRateLimit, rateLimitHeaders } = await import("./lib/rate-limit.server");
          const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
          
          // Use the infra.read bucket as a fallback global ingress limit (120 req / 60s per IP)
          // We apply this broadly to prevent volumetric scraping
          const verdict = await enforceRateLimit("infra.read", `ingress:${clientIp}`);
          // Note: In a true global middleware we'd attach headers to every response,
          // but for simplicity we only halt on block. The internal rate limiters will append their own specific headers.
        } catch (err: unknown) {
          if ((err as Error)?.name === "RateLimitError") {
             return new Response("Too Many Requests", { status: 429 });
          }
          // Ignore rate limit backend failures, failing open
        }
      }

      if (url.pathname === "/api/healthz" || url.pathname === "/healthz") {
        const mode = url.searchParams.get("type") === "liveness" ? "liveness" : "readiness";
        const { checkHealth } = await import("./lib/healthz.server");
        const { statusCode, result } = await checkHealth(mode);
        return new Response(JSON.stringify(result, null, 2), {
          status: statusCode,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (url.pathname === "/api/canary-alert" && request.method === "POST") {
        const { processPrometheusAlertWebhook } = await import("./lib/circuit-breaker.server");
        const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const outcome = await processPrometheusAlertWebhook(payload);
        return new Response(JSON.stringify(outcome, null, 2), {
          status: outcome.tripped ? 200 : 202,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      const { resolveTenantCanaryRoute } = await import("./lib/tenant-canary.server");
      const canaryDecision = await resolveTenantCanaryRoute(request).catch(() => undefined);

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return withTenantCanaryHeaders(
        withConsoleHeaders(
          request,
          withStorefrontCache(request, withSecurityHeaders(request, normalized)),
        ),
        canaryDecision,
      );
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
