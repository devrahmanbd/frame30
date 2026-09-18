import { createFileRoute } from "@tanstack/react-router";

/**
 * OAuth 2.1 token endpoint: authorization_code (PKCE required) and
 * refresh_token (rotating, with reuse detection). Accepts form-encoded bodies
 * per RFC 6749 and JSON for convenience. Errors follow the OAuth error shape,
 * never leaking whether a client id exists.
 */
function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin");
  if (!origin) return "*";
  try {
    const { hostname } = new URL(origin);
    if (
      hostname.endsWith(".framique.store") ||
      hostname.endsWith(".framique.com") ||
      hostname === "framique.qubickle.com" ||
      hostname === "localhost"
    ) {
      return origin;
    }
  } catch { /* ignore */ }
  return "*";
}

function corsHeaders(request: Request): Record<string, string> {
  return {
    "access-control-allow-origin": getAllowedOrigin(request),
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-credentials": "true",
  };
}

function oauthError(code: string, status: number, detail?: string, request?: Request) {
  return Response.json(
    { error: code, error_description: detail },
    {
      status,
      headers: { ...(request ? corsHeaders(request) : {}), "cache-control": "no-store", pragma: "no-cache" },
    },
  );
}

async function readParams(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    return Object.fromEntries(
      Object.entries(body).map(([k, v]) => [
        k,
        typeof v === "string" ? v : String(v ?? ""),
      ]),
    );
  }
  const form = await request.formData().catch(() => null);
  if (!form) return {};
  const out: Record<string, string> = {};
  form.forEach((value, key) => {
    if (typeof value === "string") out[key] = value;
  });
  return out;
}

/** Supports client_secret_basic in addition to client_secret_post. */
function basicAuth(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("basic ")) return null;
  try {
    const [id, secret] = atob(header.slice(6)).split(":");
    if (!id) return null;
    return {
      clientId: decodeURIComponent(id),
      clientSecret: secret ? decodeURIComponent(secret) : null,
    };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request) }),
      POST: async ({ request }) => {
        const params = await readParams(request);
        const basic = basicAuth(request);
        const clientId = basic?.clientId ?? params["client_id"] ?? "";
        const clientSecret =
          basic?.clientSecret ?? params["client_secret"] ?? null;
        if (!clientId)
          return oauthError("invalid_client", 401, "client_id is required.", request);

        const { OAuthError, exchangeCode, refreshToken } =
          await import("@/lib/oauth.server");
        try {
          const grant = params["grant_type"];
          if (grant === "authorization_code") {
            const pair = await exchangeCode({
              clientId,
              clientSecret,
              code: params["code"] ?? "",
              redirectUri: params["redirect_uri"] ?? "",
              codeVerifier: params["code_verifier"] ?? "",
            });
            return Response.json(pair, {
              headers: {
                ...corsHeaders(request),
                "cache-control": "no-store",
                pragma: "no-cache",
              },
            });
          }
          if (grant === "refresh_token") {
            const pair = await refreshToken({
              clientId,
              clientSecret,
              refreshToken: params["refresh_token"] ?? "",
            });
            return Response.json(pair, {
              headers: {
                ...corsHeaders(request),
                "cache-control": "no-store",
                pragma: "no-cache",
              },
            });
          }
          return oauthError(
            "unsupported_grant_type",
            400,
            "Use authorization_code or refresh_token.",
            request,
          );
        } catch (err) {
          if (err instanceof OAuthError)
            return oauthError(err.code, err.status, err.detail, request);
          const { captureError } = await import("@/lib/observability.server");
          void captureError(err, { route: "oauth.token" });
          return oauthError("server_error", 500, undefined, request);
        }
      },
    },
  },
});
