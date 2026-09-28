import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  isPersonalizedStorefrontPath,
  isStorefrontPath,
  personalizedNoStoreHeaders,
  storefrontCacheHeaders,
} from "./lib/storefront-cache";
import { isLocalHostname, isPreviewDeployHost } from "./lib/edge-hosts";
import {
  decideStoreRedirectForPath,
  isBlockedPathStorefront,
  isBlockedThemePreview,
  normalizePreviewHost,
  normalizeRequestHost,
  resolveEffectiveHost,
} from "./lib/storefront-host.server";
import { consoleSecurityHeaders, isConsolePath } from "./lib/console-headers";
import { resolveTierFromSignals, type RiskTier } from "./lib/risk-tier";
import { getMerchantRiskContext } from "./lib/risk-tier.server";
import { buildCsp, newNonce } from "./lib/custom-code";
import { setCurrentNonce, getCurrentNonce } from "./lib/ssr-nonce";

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
 *
 * Rule 5: preview prefixes are platform-suffix-anchored (isPreviewDeployHost),
 * so `preview.evil.com` does NOT relax framing — only genuine platform
 * previews + loopback do.
 */
function isEditorPreviewHost(request: Request): boolean {
  try {
    const { hostname } = new URL(request.url);
    const host = hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    return isPreviewDeployHost(host);
  } catch {
    return false;
  }
}

/**
 * Resolve the risk tier for a request by looking up the merchant's stored
 * tier, theme/plugin provenance, and abuse signals. Returns 'medium' when
 * no merchant is identified or on any failure (Rule 5 restrictive fail
 * closed — an unestablished tier must not grant low-tier privileges).
 */
async function resolveRequestTier(
  merchantId?: string,
): Promise<{ tier: RiskTier; reasons: string[] }> {
  if (!merchantId) return { tier: "medium", reasons: [] };

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
    return { tier: "medium", reasons: [] };
  }
}

export /** Origins the browser must be allowed to fetch (CSP connect-src). */
function cspConnectOrigins(): string[] {
  const out = new Set<string>();
  const candidates = [
    process.env["SUPABASE_URL"],
    process.env["VITE_SUPABASE_URL"],
    ...(process.env["CSP_CONNECT_EXTRA"] ?? "").split(/\s+/),
  ];
  for (const raw of candidates) {
    const value = raw?.trim();
    if (!value) continue;
    try {
      const origin = new URL(value).origin;
      if (origin === "null") continue;
      out.add(origin);
      // WebSocket schemes never inherit their https counterpart in CSP, so
      // Supabase Realtime (wss://…) needs an explicit source (live 2026-09-22:
      // realtime blocked by "connect-src 'self' https://framebase…").
      if (origin.startsWith("https://"))
        out.add(`wss://${origin.slice("https://".length)}`);
      else if (origin.startsWith("http://"))
        out.add(`ws://${origin.slice("http://".length)}`);
    } catch {
      // Not a parseable URL — skip rather than emit an invalid CSP source.
    }
  }
  return [...out];
}

export function withSecurityHeaders(
  request: Request,
  response: Response,
  riskTier: RiskTier = "medium",
): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if (!isLocalHostname(new URL(request.url).hostname)) {
    headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );

  // Emit CSP header with a per-document nonce. The nonce is unconditional:
  // TanStack Start SSR always emits executable inline scripts (scroll
  // restoration, $tsr stream barrier/bootstrap) plus our theme boot script,
  // so a `script-src 'self'` document can never hydrate (live 2026-09-28:
  // 3× CSP blocks → missing window.$_TSR → invariant + uncaught promise on
  // `/` and `/theme-preview/*`). Nonce + strict-dynamic is narrowly scoped
  // (no `unsafe-inline`); merchant code stays gated via risk-tier features,
  // frame-src/connect-src below stay tiered.
  // connect-src must cover the Supabase backend: auth/token, REST, storage
  // and realtime all run on a different origin (framebase.qubickle.com).
  // Without it the browser blocks sign-in with a CSP violation (seen live
  // 2026-09-19: connect to .../auth/v1/token blocked by "connect-src 'self'").
  const connectOrigins = cspConnectOrigins();
  const nonce = getCurrentNonce() || newNonce();
  setCurrentNonce(nonce);
  headers.set(
    "content-security-policy",
    buildCsp(nonce, { connect: connectOrigins }, riskTier),
  );

  if (isEditorPreviewHost(request)) {
    headers.delete("x-frame-options");
  } else {
    headers.set("x-frame-options", "SAMEORIGIN");
  }

  // When a CSP nonce is active, inject a <meta> tag so client-side code
  // (CustomCodeScript) can read it and attach it to dynamically created scripts.
  // The meta tag is harmless on non-storefront pages.
  //
  // Implementation note (ENV-1 root cause, 2026-09-18): this MUST be a
  // TransformStream, not a hand-rolled ReadableStream with an async pull()
  // loop. The pull version stalled SSR bodies: chunks buffered while waiting
  // for `</head>` were never enqueued, and the stream made no progress, so
  // every SSR page hung with zero bytes until TanStack's 120s stream killer
  // fired. TransformStream applies backpressure per chunk and keeps pumping
  // whether or not the transform enqueues output.
  let body = response.body;
  if (nonce) {
    const metaTag = `<meta name="csp-nonce" content="${nonce}">`;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = "";
    let injected = false;
    body = response.body!.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (injected) {
            controller.enqueue(chunk);
            return;
          }
          buffer += decoder.decode(chunk, { stream: true });
          const idx = buffer.indexOf("</head>");
          if (idx === -1) return; // hold until the marker arrives; pumping continues
          const end = idx + "</head>".length;
          controller.enqueue(encoder.encode(buffer.slice(0, end) + metaTag));
          const remainder = buffer.slice(end);
          buffer = "";
          injected = true;
          if (remainder) controller.enqueue(encoder.encode(remainder));
        },
        flush(controller) {
          if (!injected) {
            buffer += decoder.decode();
            controller.enqueue(encoder.encode(buffer + metaTag));
          } else if (buffer) {
            controller.enqueue(encoder.encode(buffer));
          }
          buffer = "";
        },
      }),
    );
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

      // TB-2 ingress hygiene (GAP-T3): `x-framique-*` headers are
      // app-injected downstream identity (see `headersToInject` in
      // tenant-canary.server.ts). A client-supplied value must never
      // arrive at the resolver — strip before any tenant logic runs.
      request.headers.delete("x-framique-tenant-id");
      request.headers.delete("x-framique-target-slot");
      request.headers.delete("x-framique-cohort-tier");

      // Custom-domain-only cutover: path-based storefront URLs (`/store/*`)
      // on platform hosts are an abuse surface and never serve (bare 404,
      // no message body — reveal nothing about the path shape).
      // Excepted: draft previews (token-verified downstream), token-gated
      // order flows, and loopback dev — decided pure in
      // `isBlockedPathStorefront` so contract tests pin the matrix.
      try {
        // Rule 2: XFH honored only on host+XFH agreement (spoof rejection).
        // resolveEffectiveHost ignores a disagreeing XFH and uses Host.
        const effectiveRawHost = resolveEffectiveHost({
          host: request.headers.get("host"),
          xForwardedHost: request.headers.get("x-forwarded-host"),
          urlHost: url.host,
        });
        const rawHost =
          request.headers.get("x-forwarded-host") ??
          request.headers.get("host") ??
          url.host;
        const normalizedHost = normalizeRequestHost(effectiveRawHost);
        // Preview exemption is token-VERIFIED and merchant-bound (Sept
        // 2026): any ?preview_token= value used to lift both path gates.
        // A token minted for merchant A never exempts merchant B's paths.
        let validPreview = false;
        const previewToken = url.searchParams.get("preview_token");
        if (previewToken) {
          try {
            const { verifyPreviewToken, previewSecret } =
              await import("./lib/theme-preview.server");
            const payload = verifyPreviewToken(previewSecret(), previewToken);
            if (payload) {
              const slugMatch = /^\/store\/([^/?#]+)/.exec(url.pathname);
              if (!slugMatch) {
                validPreview = true;
              } else {
                const { merchantIdForSlug } =
                  await import("./lib/storefront-host.server");
                const owner = await merchantIdForSlug(slugMatch[1] ?? "").catch(
                  () => null,
                );
                validPreview = owner !== null && owner === payload.merchantId;
              }
            } else {
              try {
                const { incr } = await import("./lib/observability.server");
                incr("framique_preview_token_verify_failed_total", {
                  reason: "invalid",
                });
              } catch {
                // Observability must never break routing.
              }
            }
          } catch {
            validPreview = false;
            try {
              const { incr } = await import("./lib/observability.server");
              incr("framique_preview_token_verify_failed_total", {
                reason: "error",
              });
            } catch {
              // Observability must never break routing.
            }
          }
        }
        // System-domain-only theme preview (Sept 2026 security fix):
        // `/theme-preview/*` renders blueprints with no session, so merchant
        // and unknown hosts get a bare 404 (no body, no leak — never a login
        // redirect from storefront paths). Local dev + platform hosts pass.
        // Rule 28: pass the RAW host — isBlockedThemePreview normalizes via
        // the shared preview-aware path (loopback with port survives).
        if (isBlockedThemePreview(effectiveRawHost ?? rawHost, url.pathname)) {
          const { incr } = await import("./lib/observability.server");
          incr("framique_theme_preview_blocked_total", {});
          return new Response(null, { status: 404 });
        }
        // Unmapped custom hosts serve nothing at all: not the CMS marketing
        // site, not a featured store, not an error page with a body. A bare
        // 404 reveals nothing. Platform hosts, loopback dev, anchored
        // preview deployments (platform-suffix-anchored, Rule 5) and mapped
        // merchant hosts pass through untouched. Lookup timeouts fail OPEN
        // (a DB blip must never take down every custom store); every other
        // exception fails CLOSED (Rule 5) and is counted + logged (Rule 17).
        try {
          const { isPlatformHost, resolveStorefrontHostFor } =
            await import("./lib/storefront-host.server");
          const host = normalizedHost ?? "";
          const previewDeploy = host ? isPreviewDeployHost(host) : false;
          if (
            host &&
            !isPlatformHost(host) &&
            !isLocalHostname(host) &&
            !previewDeploy
          ) {
            let mapped:
              | Awaited<ReturnType<typeof resolveStorefrontHostFor>>
              | "lookup-failed"
              | "lookup-timeout";
            try {
              mapped = await resolveStorefrontHostFor(host);
            } catch (err) {
              const msg = String((err as Error)?.message ?? err).toLowerCase();
              const isTimeout =
                msg.includes("timeout") ||
                msg.includes("timed out") ||
                msg.includes("etimedout") ||
                msg.includes("57014") ||
                msg.includes("fetch failed");
              try {
                const { incr, log } =
                  await import("./lib/observability.server");
                incr("framique_unmapped_host_lookup_error_total", {
                  outcome: isTimeout ? "timeout_open" : "error_closed",
                });
                log("warn", "edge.unmapped_lookup_failed", {
                  host: host.slice(0, 80),
                  timeout: isTimeout,
                  message: String((err as Error)?.message ?? err).slice(0, 160),
                });
              } catch {
                // Observability must never break routing.
              }
              mapped = isTimeout ? "lookup-timeout" : "lookup-failed";
            }
            if (mapped === null) {
              const { incr } = await import("./lib/observability.server");
              incr("framique_unmapped_host_blocked_total", {});
              return new Response(null, { status: 404 });
            }
            if (mapped === "lookup-failed") {
              // Fail closed on non-timeout exceptions (Rule 5).
              const { incr } = await import("./lib/observability.server");
              incr("framique_unmapped_host_blocked_total", {});
              return new Response(null, { status: 404 });
            }
            // "lookup-timeout" falls through (narrow fail-open).
          }
        } catch (err) {
          // Outer gate exception: fail closed is unsafe here (would 404 all
          // traffic on a coding bug), so fall through — but count + log
          // (Rule 17) instead of swallowing silently.
          try {
            const { incr, log } = await import("./lib/observability.server");
            incr("framique_edge_gate_error_total", {});
            log("error", "edge.gate_failed_open", {
              path: url.pathname.slice(0, 80),
              message: String((err as Error)?.message ?? err).slice(0, 160),
            });
          } catch {
            // Observability must never break routing.
          }
        }
        if (
          isBlockedPathStorefront(normalizedHost, url.pathname, validPreview)
        ) {
          // DEV-2 deep-path permalink: /store/<slug>/* → https://<primary>/*.
          // Centralized here (not per-route beforeLoad) because this gate 404s
          // before SSR — a per-route beforeLoad would never run on platform
          // hosts. One lookup covers the index + every deep route (p/c/pages/
          // search/blog/cart/…), present and future.
          // WordPress parity: strip the /store/<slug> prefix, collapse //,
          // preserve ? via url.search (# never reaches the server; #
          // semantics live in decideStoreRedirectForPath for callers holding
          // the full subpath, e.g. resolveStoreRedirectFn). Fail-soft: any
          // lookup failure falls through to the bare 404 below. Exemptions
          // (preview_token, track/order, localhost, custom hosts) never reach
          // here — isBlockedPathStorefront already returned false for them.
          try {
            const slugMatch = /^\/store\/([^/?#]+)/.exec(url.pathname);
            const slug = slugMatch?.[1];
            if (slug && normalizedHost) {
              const { merchantIdForSlug, primaryHostForMerchant } =
                await import("./lib/storefront-host.server");
              const merchantId = await merchantIdForSlug(slug).catch(
                () => null,
              );
              if (merchantId) {
                const primary = await primaryHostForMerchant(merchantId).catch(
                  () => null,
                );
                const to = decideStoreRedirectForPath(
                  primary,
                  normalizedHost,
                  `${url.pathname}${url.search}`,
                );
                if (to) return Response.redirect(to, 301);
              }
            }
          } catch {
            // A redirect-lookup failure must never break routing — fall
            // through to the bare 404 below.
          }
          const { incr } = await import("./lib/observability.server");
          incr("framique_path_storefront_blocked_total", {
            path: url.pathname.split("/").slice(0, 3).join("/"),
          });
          return new Response(null, { status: 404 });
        }
        // Cross-tenant path guard (Sept 2026): on a custom host,
        // `/store/<slug>/*` serves only the host owner's sections. A
        // foreign slug (or an unresolvable host) answers bare 404.
        // Preview tokens stay exempt — verified above.
        if (!validPreview) {
          const { isBlockedForeignStorePath } =
            await import("./lib/storefront-host.server");
          if (
            await isBlockedForeignStorePath(
              effectiveRawHost ?? rawHost,
              url.pathname,
            )
          ) {
            const { incr } = await import("./lib/observability.server");
            incr("framique_path_storefront_blocked_total", {
              path: url.pathname.split("/").slice(0, 3).join("/"),
            });
            return new Response(null, { status: 404 });
          }
        }
      } catch (err) {
        // A gate failure must never break routing — fall through to SSR —
        // but count + log (Rule 17) instead of swallowing silently.
        try {
          const { incr, log } = await import("./lib/observability.server");
          incr("framique_edge_gate_error_total", {});
          log("error", "edge.gate_failed_open", {
            message: String((err as Error)?.message ?? err).slice(0, 160),
          });
        } catch {
          // Observability must never break routing.
        }
      }

      // NOTE (custom-domain cutover, completed): every custom-shape path now
      // has a dedicated host-gated root route (/p, /c, /pages, /search,
      // /cart, /checkout, /account), so no internal rewrite is needed. An
      // earlier rewrite mapped custom paths to /store/<slug>/* for SSR while
      // the browser hydrated the custom route — different components on each
      // side, hence React #418 on every deep page + the featured-store
      // bounce. Deleted; do not re-add. OPEN: merchant robots/sitemap/llms
      // on custom hosts (needs root SEO routes, not a rewrite).

      // Global Security Middleware: Enforce HTTPS
      const proto =
        request.headers.get("x-forwarded-proto") ||
        url.protocol.replace(":", "");
      // Exact-match local check only (REPORT WF-10): a substring test would
      // treat attacker hosts like `localhost.evil.com` as local and disable
      // HTTPS + CSRF protection for them. Preview bypass is
      // platform-suffix-anchored (Rule 5): `preview.evil.com` stays HTTPS.
      const isLocalhost = isLocalHostname(url.hostname);

      if (
        proto === "http" &&
        !isLocalhost &&
        !isPreviewDeployHost(url.hostname)
      ) {
        return Response.redirect(
          `https://${url.host}${url.pathname}${url.search}`,
          301,
        );
      }

      // Global Security Middleware: Tenant-aware CSRF Protection on Mutations [A]
      // Uses `isTrustedCsrfOrigin` (csrf.server.ts) which handles:
      //   - Same-host (platform path-based storefronts /store/<slug>, custom domains via x-forwarded-host)
      //   - Merchant custom domains — DB-backed allow-list with 30s TTL cache
      //   - Payment gateway POST-back origins — only on /api/public/payments/* path
      if (["POST", "PUT", "DELETE", "PATCH"].includes(request.method)) {
        // Public webhook routes use their own HMAC signature verification
        if (
          !url.pathname.startsWith("/api/public") &&
          !url.pathname.startsWith("/api/canary-alert")
        ) {
          const origin = request.headers.get("origin");
          // Rule 2: CSRF host uses the trusted effective host (XFH only on
          // host+XFH agreement; spoofed XFH is ignored).
          const host =
            resolveEffectiveHost({
              host: request.headers.get("host"),
              xForwardedHost: request.headers.get("x-forwarded-host"),
              urlHost: url.host,
            }) ?? url.host;

          if (origin) {
            let originHost: string;
            try {
              // Normalize port/case like the request host so same-origin
              // with explicit :443/:3000 still matches (Rule 28 shared path).
              const rawOrigin = new URL(origin).host;
              originHost =
                normalizePreviewHost(rawOrigin) ?? rawOrigin.toLowerCase();
            } catch {
              return new Response("CSRF check failed (invalid origin)", {
                status: 403,
              });
            }

            if (!isLocalhost) {
              const { isTrustedCsrfOrigin, lookupActiveMerchantDomain } =
                await import("./lib/csrf.server");
              const trusted = await isTrustedCsrfOrigin({
                requestHost: normalizePreviewHost(host) ?? host.toLowerCase(),
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
                const rawReferer = new URL(referer).host;
                const refererHost =
                  normalizePreviewHost(rawReferer) ?? rawReferer.toLowerCase();
                const normHost =
                  normalizePreviewHost(host) ?? host.toLowerCase();
                if (refererHost !== normHost && !isLocalhost) {
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
        canaryDecision?.tenantId &&
        canaryDecision.tenantId !== "manual-override"
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
            const { enforceTenantRateLimit } =
              await import("./lib/rate-limit.server");
            await enforceTenantRateLimit(merchantId, clientIp);
          } else if (url.pathname.startsWith("/auth")) {
            // Sensitive Auth Endpoints
            const { enforceRateLimit } =
              await import("./lib/rate-limit.server");
            await enforceRateLimit("system.auth", clientIp);
          } else if (isConsolePath(url.pathname)) {
            // Operator console gets its own budget so public crawl bursts
            // on a shared egress IP can't lock admins out (2026-09-19).
            const { enforceRateLimit } =
              await import("./lib/rate-limit.server");
            await enforceRateLimit("system.console", clientIp);
          } else if (
            clientIp === "127.0.0.1" ||
            clientIp === "::1" ||
            clientIp === "::ffff:127.0.0.1"
          ) {
            // Loopback-sourced monitoring/proofs share one IP by
            // construction — bounded headroom instead of the shared budget.
            const { enforceRateLimit } =
              await import("./lib/rate-limit.server");
            await enforceRateLimit("system.ingress.loopback", clientIp);
          } else {
            // Platform System Ingress
            const { enforceRateLimit } =
              await import("./lib/rate-limit.server");
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

      // Generate nonce BEFORE SSR so TanStack Router can inject it into <script> tags.
      // Unconditional (live 2026-09-28): every document needs the nonce or
      // hydration/bootstrap scripts are CSP-blocked. Clear first so a prior
      // request's value can never leak into this document's scripts/header.
      setCurrentNonce("");
      const nonce = newNonce();
      // Make nonce available to getRouter() during SSR via module-level store
      setCurrentNonce(nonce);
      request.headers.set("x-csp-nonce", nonce);

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      const final = withTenantCanaryHeaders(
        withConsoleHeaders(
          request,
          withStorefrontCache(
            request,
            withSecurityHeaders(request, normalized, riskTier),
          ),
        ),
        canaryDecision,
      );
      return final;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
