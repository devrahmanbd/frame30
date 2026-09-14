/**
 * Webhook signing + delivery policy (pure, unit-tested).
 *
 * The signature scheme mirrors the inbound gateway in `docs/06-payments`:
 * `v1=HMAC_SHA256(secret, "<timestamp>.<body>")`, timestamp in seconds, sent
 * as `Framique-Signature: t=<ts>,v1=<hex>`. Receivers must reject a stale
 * timestamp, so replaying a captured body is not enough to forge a call.
 *
 * Rotation is a *two-key window*: after rotating, the previous secret keeps
 * verifying for a grace period so a merchant can redeploy without dropping
 * events. Both signatures are sent, newest first.
 */

export const SIGNATURE_HEADER = "framique-signature";
export const TOLERANCE_SECONDS = 300;

/** Events an endpoint may subscribe to. Unknown names are rejected at write time. */
export const WEBHOOK_EVENTS = [
  "order.created",
  "order.paid",
  "order.fulfilled",
  "order.cancelled",
  "product.created",
  "product.updated",
  "export.completed",
  "export.failed",
  "api.key.rotated",
  "oauth.token.revoked",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function signedPayload(timestamp: number, body: string) {
  return `${timestamp}.${body}`;
}

export async function computeSignature(secret: string, timestamp: number, body: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedPayload(timestamp, body)),
  );
  return toHex(mac);
}

export function signatureHeader(timestamp: number, signatures: string[]) {
  return [`t=${timestamp}`, ...signatures.map((s) => `v1=${s}`)].join(",");
}

/** Constant-time compare so a receiver cannot time-probe the expected digest. */
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function parseSignatureHeader(header: string) {
  const out: { timestamp: number | null; signatures: string[] } = { timestamp: null, signatures: [] };
  for (const part of header.split(",")) {
    const [k, v] = part.trim().split("=");
    if (k === "t" && v) out.timestamp = Number.parseInt(v, 10);
    if (k === "v1" && v) out.signatures.push(v);
  }
  return out;
}

export async function verifySignature(opts: {
  header: string;
  body: string;
  secrets: string[];
  nowSeconds?: number;
  toleranceSeconds?: number;
}) {
  const { timestamp, signatures } = parseSignatureHeader(opts.header);
  if (!timestamp || signatures.length === 0) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSeconds ?? TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return false;
  for (const secret of opts.secrets) {
    const expected = await computeSignature(secret, timestamp, opts.body);
    if (signatures.some((sig) => timingSafeEqual(sig, expected))) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Delivery policy                                                      */
/* ------------------------------------------------------------------ */

/** Exponential backoff with a hard ceiling; attempt is 1-based. */
export const MAX_ATTEMPTS = 6;
const BACKOFF_SECONDS = [30, 120, 600, 3_600, 21_600, 86_400];

export function backoffSeconds(attempt: number) {
  const idx = Math.max(0, Math.min(attempt - 1, BACKOFF_SECONDS.length - 1));
  return BACKOFF_SECONDS[idx] as number;
}

export type DeliveryOutcome = {
  status: "delivered" | "failed" | "dead";
  nextAttemptAt: string | null;
};

/**
 * Decides the next state after one HTTP attempt.
 * 2xx is success; 410 Gone is terminal (the receiver disowned the endpoint);
 * everything else retries until the attempt ceiling, then dead-letters.
 */
export function nextDeliveryState(opts: {
  attempt: number;
  responseStatus: number | null;
  now?: Date;
}): DeliveryOutcome {
  const now = opts.now ?? new Date();
  const code = opts.responseStatus;
  if (code !== null && code >= 200 && code < 300) return { status: "delivered", nextAttemptAt: null };
  if (code === 410) return { status: "dead", nextAttemptAt: null };
  if (opts.attempt >= MAX_ATTEMPTS) return { status: "dead", nextAttemptAt: null };
  const delay = backoffSeconds(opts.attempt);
  return { status: "failed", nextAttemptAt: new Date(now.getTime() + delay * 1000).toISOString() };
}

/** Only https endpoints, no localhost/private hosts: webhooks must not be an SSRF probe. */
export function validateEndpointUrl(raw: string): { ok: true; url: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "https_required" };
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) return { ok: false, reason: "private_host" };
  return { ok: true, url: parsed.toString() };
}
