/**
 * Pure validation rules for the public ad-click beacon.
 *
 * The endpoint is anonymous by nature, so everything a client sends is treated
 * as hostile: bounded sizes, a signed-freshness window, a well-formed nonce,
 * and normalized paths/hosts. Keeping the rules pure means they are unit
 * tested without a request object and reused by the SDK builder.
 */

export const BEACON_MAX_BODY_BYTES = 8 * 1024;
export const BEACON_MAX_SKEW_MS = 5 * 60_000;
export const BEACON_NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

export type BeaconRejection =
  | "method_not_allowed"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_payload"
  | "missing_nonce"
  | "invalid_nonce"
  | "stale_timestamp"
  | "future_timestamp"
  | "invalid_signature"
  | "origin_not_allowed"
  | "unknown_merchant"
  | "rate_limited"
  | "replay";

/** Content type must be JSON (charset suffix allowed); anything else is refused. */
export function isJsonContentType(header: string | null | undefined) {
  if (!header) return false;
  return /^application\/json\s*(;.*)?$/i.test(header.trim());
}

export function isBodyWithinLimit(declared: string | null | undefined, actualBytes: number) {
  const declaredLen = declared ? Number(declared) : Number.NaN;
  if (Number.isFinite(declaredLen) && declaredLen > BEACON_MAX_BODY_BYTES) return false;
  return actualBytes <= BEACON_MAX_BODY_BYTES;
}

export function isValidNonce(nonce: string | null | undefined): nonce is string {
  return typeof nonce === "string" && BEACON_NONCE_RE.test(nonce);
}

/**
 * Freshness window. A beacon older than five minutes is a replay of a captured
 * request; one from the future is a clock-skew forgery attempt. Both are
 * distinguished so the metrics show which is happening.
 */
export function checkTimestamp(sentAtMs: number, now = Date.now()): "ok" | "stale_timestamp" | "future_timestamp" {
  if (!Number.isFinite(sentAtMs)) return "stale_timestamp";
  const delta = now - sentAtMs;
  if (delta > BEACON_MAX_SKEW_MS) return "stale_timestamp";
  if (delta < -60_000) return "future_timestamp";
  return "ok";
}

/** Only same-site-ish origins are accepted when a merchant configured hosts. */
export function isOriginAllowed(origin: string | null | undefined, allowed: string[]) {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some((a) => {
    const candidate = a.trim().toLowerCase().replace(/^\*\./, "");
    return host === candidate || host.endsWith(`.${candidate}`);
  });
}

/** Landing paths are stored, so strip query, fragment and traversal noise. */
export function safeLandingPath(input: string | null | undefined) {
  if (!input) return null;
  const path = input.split("?")[0]?.split("#")[0] ?? "";
  if (!path.startsWith("/")) return null;
  const cleaned = path.replace(/\/{2,}/g, "/").replace(/\/\.\.(?=\/|$)/g, "");
  return cleaned.slice(0, 200) || "/";
}

/** Referrer is reduced to a bare hostname; anything unparsable is dropped. */
export function safeReferrerHost(input: string | null | undefined) {
  if (!input) return null;
  const raw = input.includes("://") ? input : `https://${input}`;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return /^[a-z0-9.-]{1,120}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * Canonical string a merchant SDK signs with its public beacon key. Field
 * order is fixed so both sides always agree.
 */
export function signaturePayload(input: {
  merchantId: string;
  nonce: string;
  sentAt: number;
  visitorId: string;
  network: string;
}) {
  return [input.merchantId, input.nonce, String(input.sentAt), input.visitorId, input.network].join("\n");
}

/** Constant-time hex comparison — never leak signature bytes through timing. */
export function timingSafeEqualHex(a: string, b: string) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** HTTP status for each rejection reason — used by the route and by tests. */
export function rejectionStatus(reason: BeaconRejection) {
  switch (reason) {
    case "method_not_allowed":
      return 405;
    case "unsupported_media_type":
      return 415;
    case "payload_too_large":
      return 413;
    case "rate_limited":
      return 429;
    case "origin_not_allowed":
    case "invalid_signature":
      return 403;
    case "unknown_merchant":
      return 404;
    case "replay":
      return 200;
    default:
      return 400;
  }
}
