/**
 * Signed storefront preview tokens.
 *
 * The preview iframe loads via plain navigation (no session headers), so the
 * merchant's draft cannot ride the normal auth middleware. Instead the
 * marketplace mints a short-lived HMAC bearer token binding
 * (merchant, theme, expiry). Anyone without a valid token sees the published
 * theme — drafts never leak to shoppers, crawlers, or other tenants.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const PREVIEW_TTL_MS = 10 * 60_000;

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function issuePreviewToken(
  secret: string,
  merchantId: string,
  themeId: string,
  nowMs: number = Date.now(),
): string {
  const header = b64urlEncode(JSON.stringify({ alg: "HS256", typ: "FQPV1" }));
  const payload = b64urlEncode(
    JSON.stringify({ m: merchantId, t: themeId, e: nowMs + PREVIEW_TTL_MS }),
  );
  const sig = b64urlEncode(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

export function verifyPreviewToken(
  secret: string,
  token: string,
  nowMs: number = Date.now(),
): { merchantId: string; themeId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts as [string, string, string];
  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(b64urlDecode(payload).toString("utf8"));
  } catch {
    return null;
  }
  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest();
  let actual: Buffer;
  try {
    actual = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  const body = payloadJson as Record<string, unknown>;
  if (
    typeof body["m"] !== "string" ||
    typeof body["t"] !== "string" ||
    typeof body["e"] !== "number" ||
    body["e"] <= nowMs
  ) {
    return null;
  }
  return { merchantId: body["m"], themeId: body["t"] };
}

/** Which secret signs preview tokens. Never leaves the server boundary. */
export function previewSecret(): string {
  const configured =
    process.env["PREVIEW_TOKEN_SECRET"] ?? process.env["AUTH_HASH_SALT"];
  if (configured) return configured;
  // Rule 28 fail closed: a shared hardcoded key would let any holder forge
  // cross-merchant preview tokens. Allow the dev fallback ONLY on local dev /
  // test; every other environment (production, preview deploys without env)
  // throws instead of minting forgeable tokens.
  const nodeEnv = process.env["NODE_ENV"];
  const isProd =
    nodeEnv === "production" ||
    process.env["FRAMIQUE_ENV"] === "production" ||
    process.env["VERCEL_ENV"] === "production";
  if (
    !isProd &&
    (nodeEnv === "development" || nodeEnv === "test" || !nodeEnv)
  ) {
    return "framique-preview-dev";
  }
  throw new Error("PREVIEW_TOKEN_SECRET must be set in production");
}
