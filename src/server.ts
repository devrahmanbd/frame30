import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  isPersonalizedStorefrontPath,
  isStorefrontPath,
  personalizedNoStoreHeaders,
  storefrontCacheHeaders,
} from "./lib/storefront-cache";
import { isLocalHostname } from "./lib/edge-hosts";
import { consoleSecurityHeaders, isConsolePath } from "./lib/console-headers";
import {
  resolveTierFromSignals,
  resolvePolicy,
  type RiskTier,
} from "./lib/risk-tier";
import { getMerchantRiskContext } from "./lib/risk-tier.server";
import { buildCsp, newNonce } from "./lib/custom-code";

type ServerEntry = {
  fetch: (
    request: Request,
    env: unknown,
    ctx: unknown,
  ) => Promise<Response> | Response;
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
async function normalizeCatastrophicSsrResponse(
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(
    consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`),
  );
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as {
      unhandled?: unknown;
      message?: unknown;
    };
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

/**
 * Resolve the risk tier for a request by looking up the merchant's stored
 * tier, theme/plugin provenance, and abuse signals. Returns 'low' when
 * no merchant is identified or on any failure (fail-open).
 */
async function resolveRequestTier(
  merchantId?: string,
): Promise<{ tier: RiskTier; reasons: string[] }> {
  if (!merchantId) return { tier: "low", reasons: [] };

  try {
    const ctx = await getMerchantRiskContext(merchantId);
    const { tier, reasons } = resolveTierFromSignals({
      storedTier: ctx.storedTier,
      themeSource: ctx.themeSource,
      pluginSources: ctx.pluginSources,
      fraudScore: ctx.abuseScore,
    });
    return { tier, reasons };
  } catch {
    return { tier: "low", reasons: [] };
  }
}

function withSecurityHeaders(
  request: Request,
  response: Response,
  riskTier: RiskTier = "low",
): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!isLocalHostname(new URL(request.url).hostname)) {
    headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  }
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");

  // Emit tier-aware CSP header based on resolved risk tier
  const policy = resolvePolicy(riskTier);
  let nonce = "";
  if (policy.csp.nonce) {
    nonce = newNonce();
    headers.set("content-security-policy", buildCsp(nonce, {}, riskTier));
  } else {
    // medium / high: no nonce, strict script-src 'self'
    headers.set("content-security-policy", buildCsp("", {}, riskTier));
  }

  if (isEditorPreviewHost(request)) {
    headers.delete("x-frame-options");
  } else {
    headers.set("x-frame-options", "SAMEORIGIN");
  }

  // When a CSP nonce is active, inject a <meta> tag so client-side code
  // (CustomCodeScript) can read it and attach it to dynamically created scripts.
  // The meta tag is harmless on non-storefront pages.
  let body = response.body;
  if (nonce) {
    const metaTag = `<meta name="csp-nonce" content="${nonce}">`;
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    let injected = false;

    body = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // Inject before </head> if not yet done
          if (!injected && buffer.includes("</head>")) {
            const idx = buffer.indexOf("</head>");
            controller.enqueue(
              encoder.encode(buffer.slice(0, idx) + metaTag + buffer.slice(idx)),
            );
          } else if (!injected) {
            // No </head> found — append meta at end as fallback
            controller.enqueue(encoder.encode(buffer + metaTag));
          } else if (buffer) {
            controller.enqueue(encoder.encode(buffer));
          }
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        // Flush complete chunks up to the </head> occurrence
        const idx = buffer.indexOf("</head>");
        if (idx !== -1) {
          const end = idx + "</head>".length;
          controller.enqueue(encoder.encode(buffer.slice(0, end) + metaTag));
          injected = true;
          buffer = buffer.slice(end);
        }
      },
    });
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
  for (const [key, value] of Object.entries(consoleSecurityHeaders()))
    headers.set(key, value);
  if (isEditorPreviewHost(request)) {
    // Keep noindex + private caching, drop the framing denial for the editor.
    headers.delete("x-frame-options");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
  const url = new URL(request.url);
  const { pathname } = url;
  // PII guard FIRST (REPORT WF-09): cart/checkout/account/order/track render
  // shopper-specific data and must never sit in a shared cache — including on
  // custom domains, where isStorefrontPath() marks /cart|/checkout|/order
  // cacheable. Force origin-only delivery.
  if (isPersonalizedStorefrontPath(pathname)) {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(personalizedNoStoreHeaders()))
      headers.set(key, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  // Draft previews must never enter the shared cache: same URL shape as the
  // live page, but per-merchant private content. The route also emits noindex.
  if (url.searchParams.has("preview_token")) {
    const headers = new Headers(response.headers);
    headers.set("cache-control", "private, no-store");
    // Belt and suspenders with the noindex meta on preview pages: header
    // wins even if the head-tag pipeline dedupes the robots meta.
    headers.set("x-robots-tag", "noindex, nofollow");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  if (!isStorefrontPath(pathname)) return response;
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(storefrontCacheHeaders(null)))
    headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withTenantCanaryHeaders(
  response: Response,
  decision?: {
    cohortTier?: number;
    tenantId?: string | null;
    targetSlot?: string;
  },
): Response {
  const headers = new Headers(response.headers);
  const currentSlot =
    process.env["CLUSTER_SLOT"] || process.env["TOPOLOGY_SLOT"] || "blue";
  headers.set("x-framique-slot", currentSlot);
  if (decision) {
    if (decision.cohortTier !== undefined) {
      headers.set("x-framique-cohort-tier", String(decision.cohortTier));
    }
    // Stop echoing x-framique-tenant-id to public shoppers (REPORT WF-26)
    if (decision.targetSlot) {
      headers.set("x-framique-target-slot", decision.targetSlot);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      // Global Security Middleware: Enforce HTTPS
      const proto =
        request.headers.get("x-forwarded-proto") ||
        url.protocol.replace(":", "");
      // Exact-match local check only (REPORT WF-10): a substring test would
      // treat attacker hosts like `localhost.evil.com` as local and disable
      // HTTPS + CSRF protection for them.
      const isLocalhost = isLocalHostname(url.hostname);

      if (
        proto === "http" &&
        !isLocalhost &&
        !url.hostname.startsWith("preview.") &&
        !url.hostname.startsWith("id-preview--")
      ) {
        return Response.redirect(
          `https://${url.host}${url.pathname}${url.search}`,
          301,
        );
      }

      // Global Security Middleware: Tenant-aware CSRF Protection on Mutations [A]
      // Uses `isTrustedCsrfOrigin` (csrf.server.ts) which handles:
      //   - Same-host (platform, *.framique.store, custom domains via x-forwarded-host)
      //   - Merchant custom domains — DB-backed allow-list with 30s TTL cache
      //   - Payment gateway POST-back origins — only on /api/public/payments/* path
      if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
        // Public webhook routes use their own HMAC signature verification
        if (
          !url.pathname.startsWith("/api/public") &&
          !url.pathname.startsWith("/api/canary-alert")
        ) {
          const origin = request.headers.get("origin");
          const host =
            request.headers.get("x-forwarded-host") ||
            request.headers.get("host") ||
            url.host;

          if (origin) {
            let originHost: string;
            try {
              originHost = new URL(origin).host;
            } catch {
              return new Response("CSRF check failed (invalid origin)", {
                status: 403,
              });
            }

            if (!isLocalhost) {
              const { isTrustedCsrfOrigin, lookupActiveMerchantDomain } =
                await import("./lib/csrf.server");
              const trusted = await isTrustedCsrfOrigin({
                requestHost: host,
                originHost,
                pathname: url.pathname,
                lookupCustomDomain: lookupActiveMerchantDomain,
              });
              if (!trusted) {
                return new Response("CSRF check failed (untrusted origin)", {
                  status: 403,
                });
              }
            }
          } else {
            const referer = request.headers.get("referer");
            if (referer) {
              try {
                const refererHost = new URL(referer).host;
                if (refererHost !== host && !isLocalhost) {
                  return new Response("CSRF check failed (referer mismatch)", {
                    status: 403,
                  });
                }
              } catch {
                return new Response("CSRF check failed (invalid referer)", {
                  status: 403,
                });
              }
            }
            // If neither Origin nor Referer is present, fail safely unless authenticated via API token (REPORT WF-11)
            else if (!isLocalhost) {
              const hasToken =
                request.headers.has("authorization") ||
                request.headers.has("x-api-key");
              if (!hasToken) {
                return new Response(
                  "CSRF check failed (missing origin/referer)",
                  { status: 403 },
                );
              }
            }
          }
        }
      }

      if (url.pathname === "/api/healthz" || url.pathname === "/healthz") {
        const mode =
          url.searchParams.get("type") === "liveness"
            ? "liveness"
            : "readiness";
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
        const webhookSecret = process.env["CANARY_WEBHOOK_SECRET"];
        const auth =
          request.headers.get("x-canary-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (webhookSecret && auth !== webhookSecret) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { processPrometheusAlertWebhook } =
          await import("./lib/circuit-breaker.server");
        const payload = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        const outcome = await processPrometheusAlertWebhook(payload);
        return new Response(JSON.stringify(outcome, null, 2), {
          status: outcome.tripped ? 200 : 202,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      // Resolve Tenant Canary & Routing context
      const { resolveTenantCanaryRoute } =
        await import("./lib/tenant-canary.server");
      const canaryDecision = await resolveTenantCanaryRoute(request).catch(
        () => undefined,
      );
      const merchantId =
        canaryDecision?.tenantId && canaryDecision.tenantId !== "manual-override"
          ? canaryDecision.tenantId
          : undefined;

      // Multi-Tier Ingress Rate Limiting: Tenant Isolation vs System Ingress
      const isStaticAsset =
        url.pathname.startsWith("/assets/") ||
        url.pathname.startsWith("/fonts/") ||
        url.pathname === "/favicon.ico" ||
        url.pathname.startsWith("/.well-known/") ||
        /\.(png|jpe?g|webp|gif|svg|ico|css|js|woff2?|map)$/i.test(url.pathname);

      if (!isLocalhost && !isStaticAsset) {
        try {
          const clientIp =
            request.headers.get("cf-connecting-ip") ||
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            "127.0.0.1";

          if (merchantId) {
            // Tenant Storefront: enforce tenant aggregate capacity + shopper limit
            const { enforceTenantRateLimit } = await import("./lib/rate-limit.server");
            await enforceTenantRateLimit(merchantId, clientIp);
          } else if (url.pathname.startsWith("/auth")) {
            // Sensitive Auth Endpoints
            const { enforceRateLimit } = await import("./lib/rate-limit.server");
            await enforceRateLimit("system.auth", clientIp);
          } else {
            // Platform System Ingress
            const { enforceRateLimit } = await import("./lib/rate-limit.server");
            await enforceRateLimit("system.ingress", clientIp);
          }
        } catch (err: unknown) {
          if ((err as Error)?.name === "RateLimitError") {
            const rlErr = err as { bucket: string; resetAt: string };
            const resetSeconds = Math.max(
              1,
              Math.ceil((Date.parse(rlErr.resetAt) - Date.now()) / 1000),
            );
            return new Response(
              JSON.stringify({
                error: "rate_limit_exceeded",
                bucket: rlErr.bucket,
                reset_at: rlErr.resetAt,
              }),
              {
                status: 429,
                headers: {
                  "content-type": "application/json",
                  "retry-after": String(resetSeconds),
                  "x-ratelimit-reset": rlErr.resetAt,
                },
              },
            );
          }
          // Fail open on rate limiter infrastructure faults
        }
      }

      // Resolve risk tier per-request for CSP header emission
      const { tier: riskTier } = await resolveRequestTier(merchantId);

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      return withTenantCanaryHeaders(
        withConsoleHeaders(
          request,
          withStorefrontCache(
            request,
            withSecurityHeaders(request, normalized, riskTier),
          ),
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
