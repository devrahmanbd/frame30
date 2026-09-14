/**
 * Phase 12 — self-hosted error tracking (GlitchTip + Sentry).
 *
 * Pure, isomorphic policy for the error reporter. Everything that decides
 * *whether* and *where* an event goes lives here so both the server transport
 * and the tests can reason about it without a network:
 *
 *  - `errorTargets`  — one reporter, many backends. GlitchTip is the default
 *    (light, Postgres-backed); self-hosted Sentry is the heavy option. A host
 *    may run one, both, or neither; neither means the app simply logs.
 *  - `errorSampleRate` / `errorQuota` — per-environment sampling and quotas so
 *    a bad deploy cannot fill the error backend's disk.
 *  - `shouldSample` — deterministic per-fingerprint decision: the same failure
 *    is consistently kept or consistently dropped, so sampling never hides a
 *    single-occurrence bug behind a coin flip on every occurrence.
 *  - `sanitizeEventFields` — the belt to the scrubber's braces: whole fields
 *    that are known to carry PII or money payloads never enter an event body.
 *
 * No secrets and no PII may ever appear in an event body. Tenant identity is
 * carried as an opaque tag only.
 */
import { parseSentryDsn, type SentryDsn } from "./telemetry";

export type ErrorTargetName = "glitchtip" | "sentry";

export type ErrorTarget = {
  name: ErrorTargetName;
  /** Raw DSN string — required in the envelope header. */
  dsnString: string;
  dsn: SentryDsn;
};

export type EnvLike = Record<string, string | undefined>;

const DSN_ENV: Record<ErrorTargetName, string> = {
  glitchtip: "GLITCHTIP_DSN",
  sentry: "SENTRY_DSN",
};

/** Every configured backend, in send order (GlitchTip first — it is the default). */
export function errorTargets(env: EnvLike): ErrorTarget[] {
  const out: ErrorTarget[] = [];
  for (const name of ["glitchtip", "sentry"] as const) {
    const raw = env[DSN_ENV[name]];
    const dsn = parseSentryDsn(raw);
    if (raw && dsn) out.push({ name, dsnString: raw, dsn });
  }
  return out;
}

export function errorTrackingEnabled(env: EnvLike) {
  return errorTargets(env).length > 0;
}

/** Deployment environment name, used for both tagging and sampling defaults. */
export function errorEnvironment(env: EnvLike) {
  return env["ERROR_ENVIRONMENT"] ?? env["SENTRY_ENVIRONMENT"] ?? "preview";
}

export function errorRelease(env: EnvLike) {
  return env["ERROR_RELEASE"] ?? env["SENTRY_RELEASE"] ?? "dev";
}

export function errorCommit(env: EnvLike) {
  return env["ERROR_COMMIT_SHA"] ?? env["SENTRY_COMMIT_SHA"] ?? env["COMMIT_SHA"] ?? "";
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Fraction of *distinct fingerprints* forwarded. Production keeps everything by
 * default (errors are rare and each one matters); preview keeps a quarter,
 * because a broken preview branch can loop.
 */
export function errorSampleRate(env: EnvLike): number {
  const explicit = env["ERROR_SAMPLE_RATE"];
  if (explicit !== undefined && explicit !== "") return clamp01(Number(explicit));
  return errorEnvironment(env) === "production" ? 1 : 0.25;
}

/** Per-fingerprint send ceiling inside a rolling window. */
export function errorQuota(env: EnvLike): { limit: number; windowMs: number } {
  const limit = Number(env["ERROR_QUOTA_PER_MINUTE"] ?? (errorEnvironment(env) === "production" ? 60 : 20));
  return { limit: Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 60, windowMs: 60_000 };
}

/** Stable 32-bit hash — same input, same bucket, on every isolate. */
export function hashKey(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shouldSample(fingerprintKey: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  return hashKey(fingerprintKey) / 0xffffffff < rate;
}

/**
 * Fields that must never be forwarded to an error backend even when their
 * value looks harmless: order and payment payloads, customer contact details,
 * addresses, and anything credential-shaped. The generic scrubber masks values
 * that *look* like PII; this removes whole fields by intent.
 */
export const FORBIDDEN_EVENT_FIELDS =
  /^(email|phone|mobile|msisdn|name|full_name|customer|customer_name|customer_email|customer_phone|address|address_line[0-9]?|street|city_line|postcode|zip|order|order_payload|line_items|items|cart|payload|body|request_body|response_body|token|access_token|refresh_token|id_token|secret|password|authorization|cookie|apikey|api_key|card|pan|cvv|account_number|msisdn_hash)$/i;

/**
 * Drop forbidden fields, cap breadth/depth, and keep only primitives at the
 * leaves. Returns a shallow, boring object that is safe to serialize.
 */
export function sanitizeEventFields(
  input: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (depth > 3) return out;
  for (const [key, value] of Object.entries(input).slice(0, 40)) {
    if (FORBIDDEN_EVENT_FIELDS.test(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = typeof value === "string" ? value.slice(0, 500) : value;
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((v) => (typeof v === "object" && v !== null ? "[object]" : v));
    } else if (typeof value === "object") {
      out[key] = sanitizeEventFields(value as Record<string, unknown>, depth + 1);
    }
  }
  return out;
}

/** Tag set shared by every event, on every backend. */
export function baseTags(env: EnvLike, extra: Record<string, string> = {}): Record<string, string> {
  const commit = errorCommit(env);
  return {
    environment: errorEnvironment(env),
    release: errorRelease(env),
    ...(commit ? { commit } : {}),
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Browser report contract                                             */
/* ------------------------------------------------------------------ */

export const BROWSER_REPORT_MAX_BYTES = 16_384;
export const BROWSER_REPORT_MECHANISMS = [
  "onerror",
  "unhandledrejection",
  "react_error_boundary",
  "manual",
] as const;
export type BrowserReportMechanism = (typeof BROWSER_REPORT_MECHANISMS)[number];

export type BrowserErrorReport = {
  message: string;
  stack?: string;
  mechanism: BrowserReportMechanism;
  route?: string;
  release?: string;
  commit?: string;
};
