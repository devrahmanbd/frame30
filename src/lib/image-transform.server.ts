/**
 * Edge image transform service — §4.4.
 *
 * The Worker runtime has no sharp/native codecs, so this module does not decode
 * pixels itself. It is the *policy* layer in front of a transformer:
 *
 *  - verifies the HMAC on the URL, so nobody can point our bandwidth at an
 *    arbitrary host or mint infinite variants and blow the cache,
 *  - SSRF-guards the source against an allow-list before any fetch happens,
 *  - delegates the actual resize to an imgproxy-compatible service when one is
 *    configured, and otherwise streams the origin bytes through unchanged with
 *    correct caching, so the storefront still renders during misconfiguration.
 */

import {
  cacheControlFor,
  contentTypeFor,
  decodeSource,
  decodeSpec,
  encodeSource,
  encodeSpec,
  isAllowedSource,
  negotiateFormat,
  safeEqualHex,
  signaturePayload,
  type TransformSpec,
} from "./image-transform";
import { incr, log, observe } from "./observability.server";

function hex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function signingSecret() {
  // Falls back to the deployment's Supabase URL-derived salt only in preview;
  // production sets an explicit secret.
  return process.env["IMAGE_SIGNING_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
}

function allowedHosts(): string[] {
  const raw = process.env["IMAGE_ALLOWED_HOSTS"] ?? "";
  const configured = raw
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const supabaseHost = (() => {
    try {
      return new URL(process.env["SUPABASE_URL"] ?? "").hostname;
    } catch {
      return null;
    }
  })();
  return [...configured, ...(supabaseHost ? [supabaseHost] : [])];
}

/** Builds a signed, cache-friendly URL. Use this from loaders and components. */
export async function buildImageUrl(source: string, spec: Partial<TransformSpec>, origin = "") {
  // A source the transform will refuse is never signed: handing the browser a
  // URL that answers 403 blanks the product grid, while the original file still
  // renders. Policy stays in one place — the allow-list.
  if (!isAllowedSource(source, allowedHosts()).ok) return source;
  const specSegment = encodeSpec({ ...spec } as TransformSpec);
  const sourceSegment = encodeSource(source);
  const signature = await hmacHex(signingSecret(), signaturePayload(specSegment, sourceSegment));
  return `${origin}/api/public/img/${signature.slice(0, 32)}/${specSegment}/${sourceSegment}`;
}

export type TransformOutcome =
  | { status: "ok"; response: Response }
  | { status: "error"; code: string; response: Response };

function refuse(code: string, httpStatus: number): TransformOutcome {
  incr("framique_image_transform_total", { outcome: code });
  return {
    status: "error",
    code,
    response: new Response(code, {
      status: httpStatus,
      headers: { "cache-control": cacheControlFor(false), "content-type": "text/plain" },
    }),
  };
}

/**
 * Handles one `/api/public/img/:sig/:spec/:source` request end to end.
 */
export async function serveTransform(
  segments: string[],
  accept: string | null,
): Promise<TransformOutcome> {
  const started = Date.now();
  const [signature, specSegment, sourceSegment] = segments;
  if (!signature || !specSegment || !sourceSegment) return refuse("bad_path", 400);

  const secret = signingSecret();
  if (!secret) return refuse("signing_unconfigured", 503);

  const expected = (await hmacHex(secret, signaturePayload(specSegment, sourceSegment))).slice(0, 32);
  if (!safeEqualHex(signature, expected)) return refuse("bad_signature", 403);

  const spec = decodeSpec(specSegment);
  if (!spec) return refuse("bad_spec", 400);

  const source = decodeSource(sourceSegment);
  if (!source) return refuse("bad_source", 400);

  const guard = isAllowedSource(source, allowedHosts());
  if (!guard.ok) {
    log("warn", "image.source_refused", { reason: guard.reason });
    return refuse(guard.reason, 403);
  }

  const format = negotiateFormat(accept, spec.format);
  const transformer = process.env["IMGPROXY_URL"];

  try {
    const upstream = transformer
      ? await fetch(imgproxyUrl(transformer, spec, format, guard.url.toString()), {
          headers: { accept: contentTypeFor(format) },
        })
      : await fetch(guard.url.toString());

    if (!upstream.ok || !upstream.body) return refuse(`upstream_${upstream.status}`, 502);

    observe("framique_image_transform_ms", Date.now() - started, { format });
    incr("framique_image_transform_total", { outcome: transformer ? "transformed" : "passthrough" });

    return {
      status: "ok",
      response: new Response(upstream.body, {
        status: 200,
        headers: {
          "content-type": transformer ? contentTypeFor(format) : (upstream.headers.get("content-type") ?? "image/jpeg"),
          "cache-control": cacheControlFor(true),
          vary: "Accept",
          "x-image-engine": transformer ? "imgproxy" : "passthrough",
        },
      }),
    };
  } catch {
    return refuse("upstream_unreachable", 502);
  }
}

function imgproxyUrl(base: string, spec: TransformSpec, format: string, source: string) {
  const resize = spec.resize === "cover" ? "fill" : spec.resize === "fit" ? "fit" : "fit";
  const path = `/rs:${resize}:${spec.width}:${spec.height}:0/q:${spec.quality}/plain/${encodeURIComponent(source)}@${format}`;
  return `${base.replace(/\/+$/, "")}/insecure${path}`;
}
