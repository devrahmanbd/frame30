/**
 * Phase 10.4 — newsletter service layer.
 *
 * Threat model first, because this is one of exactly two endpoints an
 * anonymous stranger on the internet can POST to on the marketing site:
 *
 *   • **Enumeration.** The response never differs between a new address, one
 *     awaiting confirmation and one already confirmed. All three answer
 *     `check_inbox`.
 *   • **Mail-bombing.** Consent is double opt-in, so an attacker can never put
 *     a third party on the list. Confirmations are rate limited per IP *and*
 *     per address, and the per-address resend cooldown lives in the row, not
 *     the limiter, so it survives an IP change.
 *   • **Scripted signups.** Honeypot + fill-timing + per-IP bucket, each with a
 *     distinct reject reason and counter so we can see which rule fires.
 *   • **Data minimisation.** The IP is stored as a salted hash, never raw. The
 *     tables carry no anon/authenticated grant at all, so the list is
 *     unreachable from a browser even with a leaked publishable key.
 *
 * Delivery is queued in `newsletter_outbox` *before* it is attempted, so a
 * provider outage costs a delay rather than a lost confirmation, and every
 * failure keeps its attempt count, error and next retry time for an operator.
 */
import { getRequest } from "@tanstack/react-start/server";
import { captureError, incr, log, withSpan } from "./observability.server";
import { enforceRateLimit, RateLimitError } from "./rate-limit.server";
import { sendMail } from "./mailer.server";
import {
  CONSENT_TEXT,
  CONSENT_VERSION,
  NEWSLETTER_LIMITS,
  canResend,
  generateToken,
  isSendable,
  nextAttemptAt,
  normaliseSource,
  outboxIsDead,
  renderEmail,
  scoreSubmission,
  statusAfterBounce,
  validateEmail,
  verifyExpiry,
  type EmailKind,
  type NewsletterLocale,
  type NewsletterStatus,
  type RejectReason,
  type SubscribeOutcome,
} from "./newsletter";

export class NewsletterError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "NewsletterError";
  }
}

/** Untyped admin handle: these tables are service-role only by design. */
type Db = {
  from: (table: string) => any;
};

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

async function sha256(value: string): Promise<string> {
  const salt = process.env["AUTH_HASH_SALT"] ?? "framique-newsletter";
  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function requestSignals(): { ip: string; ua: string; origin: string | null } {
  try {
    const req = getRequest();
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? req.headers.get("host");
    return {
      ip: ip.slice(0, 64),
      ua: (req.headers.get("user-agent") ?? "unknown").slice(0, 180),
      origin: host ? `${proto || "https"}://${host}` : null,
    };
  } catch {
    // Outside a request scope (tests, cron): no client identity to bind to.
    return { ip: "unknown", ua: "unknown", origin: null };
  }
}

function siteOrigin(fallback: string | null): string {
  return fallback ?? process.env["PUBLIC_SITE_ORIGIN"] ?? "https://framique.com";
}

/** Append-only consent/abuse trail. Never blocks the caller's path. */
async function recordEvent(input: {
  subscriberId: string | null;
  emailHash: string;
  type:
    | "signup"
    | "resend"
    | "verified"
    | "unsubscribed"
    | "bounced"
    | "complained"
    | "blocked"
    | "rejected"
    | "already_active"
    | "verify_expired";
  source?: string;
  locale?: string | null;
  ipHash?: string | null;
  reason?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    const db = await admin();
    await db.from("newsletter_events").insert({
      subscriber_id: input.subscriberId,
      email_hash: input.emailHash,
      type: input.type,
      source: input.source ?? "unknown",
      locale: input.locale ?? null,
      ip_hash: input.ipHash ?? null,
      reason: input.reason ?? null,
      meta: input.meta ?? {},
    });
  } catch (error) {
    // The ledger is important, but losing it must not lose the subscription.
    log("error", "newsletter.event_write_failed", {
      type: input.type,
      message: String((error as Error)?.message ?? error).slice(0, 160),
    });
  }
}

export type SubscribeInput = {
  email: string;
  locale?: NewsletterLocale;
  source?: string;
  consent: boolean;
  honeypot?: string | null;
  renderedAt?: number | null;
};

export type SubscribeResult = {
  outcome: SubscribeOutcome;
  /** Present only when the address itself was refused; never leaks list state. */
  reason: RejectReason | null;
  retryAfterSeconds?: number;
};

/**
 * The public entry point. Returns an indistinguishable success for every
 * address that passes validation, whatever its current state on the list.
 */
export async function subscribeNewsletter(input: SubscribeInput): Promise<SubscribeResult> {
  return withSpan("newsletter.subscribe", async () => {
    const now = new Date();
    const locale: NewsletterLocale = input.locale === "bn" ? "bn" : "en";
    const source = normaliseSource(input.source);
    const { ip, ua, origin } = requestSignals();
    const ipHash = await sha256(ip);

    // 1. Cheap local rules first — no database round-trip for an obvious bot.
    const signals = scoreSubmission({
      honeypot: input.honeypot ?? null,
      renderedAt: input.renderedAt ?? null,
      submittedAt: now.getTime(),
      consent: input.consent === true,
    });
    if (!signals.ok) {
      incr("framique_newsletter_signup_total", { outcome: "rejected", reason: signals.reason });
      await recordEvent({
        subscriberId: null,
        emailHash: await sha256(String(input.email ?? "").toLowerCase()),
        type: "rejected",
        source,
        locale,
        ipHash,
        reason: signals.reason,
      });
      return { outcome: "rejected", reason: signals.reason };
    }

    const verdict = validateEmail(input.email);
    if (!verdict.ok) {
      incr("framique_newsletter_signup_total", { outcome: "rejected", reason: verdict.reason });
      await recordEvent({
        subscriberId: null,
        emailHash: await sha256(String(input.email ?? "").toLowerCase()),
        type: "rejected",
        source,
        locale,
        ipHash,
        reason: verdict.reason,
      });
      return { outcome: "rejected", reason: verdict.reason };
    }

    const email = verdict.email;
    const emailHash = await sha256(email);

    // 2. Two independent buckets: a shared office IP must not be able to
    //    subscribe hundreds of addresses, and one address must not be able to
    //    trigger unlimited confirmations from a rotating IP.
    try {
      await enforceRateLimit("newsletter.subscribe_ip", ipHash);
      await enforceRateLimit("newsletter.subscribe_email", emailHash);
    } catch (error) {
      if (error instanceof RateLimitError) {
        incr("framique_newsletter_signup_total", { outcome: "rate_limited" });
        return {
          outcome: "rate_limited",
          reason: null,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((new Date(error.resetAt).getTime() - now.getTime()) / 1000),
          ),
        };
      }
      throw error;
    }

    const db = await admin();
    const { data: existing, error: readError } = await db
      .from("newsletter_subscribers")
      .select(
        "id, email, status, locale, resend_count, last_resend_at, verify_token, verify_expires_at, unsubscribe_token, bounce_count",
      )
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (readError) {
      await captureError(readError, { scope: "newsletter.subscribe.read" });
      throw new NewsletterError("newsletter_unavailable", "Subscription is temporarily unavailable");
    }

    const uaHash = await sha256(ua);

    // 3a. Never seen before → pending row + confirmation mail.
    if (!existing) {
      const verifyToken = generateToken();
      const { data: created, error: insertError } = await db
        .from("newsletter_subscribers")
        .insert({
          email,
          email_domain: verdict.domain,
          locale,
          source,
          status: "pending" satisfies NewsletterStatus,
          consent_at: now.toISOString(),
          consent_text: CONSENT_TEXT[locale],
          consent_version: CONSENT_VERSION,
          ip_hash: ipHash,
          ua_hash: uaHash,
          verify_token: verifyToken,
          verify_sent_at: now.toISOString(),
          verify_expires_at: verifyExpiry(now).toISOString(),
          last_event_at: now.toISOString(),
        })
        .select("id, unsubscribe_token")
        .single();

      if (insertError) {
        // A unique-violation here means two submits raced. That is a success
        // from the visitor's point of view, not an error.
        if (String((insertError as { code?: string }).code) === "23505") {
          incr("framique_newsletter_signup_total", { outcome: "raced" });
          return { outcome: "check_inbox", reason: null };
        }
        await captureError(insertError, { scope: "newsletter.subscribe.insert" });
        throw new NewsletterError("newsletter_unavailable", "Subscription is temporarily unavailable");
      }

      await recordEvent({
        subscriberId: created.id,
        emailHash,
        type: "signup",
        source,
        locale,
        ipHash,
        meta: { fillMs: signals.fillMs, domain: verdict.domain },
      });
      await queueAndFlush({
        subscriberId: created.id,
        to: email,
        kind: "double_opt_in",
        locale,
        verifyToken,
        unsubscribeToken: created.unsubscribe_token,
        origin: siteOrigin(origin),
      });
      incr("framique_newsletter_signup_total", { outcome: "pending", source });
      return { outcome: "check_inbox", reason: null };
    }

    // 3b. Suppressed addresses are honoured in silence. A bounced or
    //     complained address is not re-subscribed by a form post, ever.
    if (existing.status === "bounced" || existing.status === "complained" || existing.status === "blocked") {
      await recordEvent({
        subscriberId: existing.id,
        emailHash,
        type: "blocked",
        source,
        locale,
        ipHash,
        reason: existing.status,
      });
      incr("framique_newsletter_signup_total", { outcome: "suppressed", reason: existing.status });
      return { outcome: "check_inbox", reason: null };
    }

    // 3c. Already confirmed → nothing to do, and we say nothing about it.
    if (existing.status === "active") {
      await recordEvent({ subscriberId: existing.id, emailHash, type: "already_active", source, locale, ipHash });
      incr("framique_newsletter_signup_total", { outcome: "already_active" });
      return { outcome: "check_inbox", reason: null };
    }

    // 3d. Pending, or previously unsubscribed and coming back: re-arm the
    //     confirmation, subject to the stored cooldown.
    const resend = canResend(
      {
        status: "pending",
        resendCount: existing.resend_count ?? 0,
        lastResendAt: existing.last_resend_at ?? null,
      },
      now,
    );
    if (!resend.ok) {
      incr("framique_newsletter_signup_total", { outcome: "throttled", reason: resend.reason });
      // Still `check_inbox`: the previous confirmation is genuinely in flight.
      return { outcome: "check_inbox", reason: null, retryAfterSeconds: resend.retryAfterSeconds };
    }

    const verifyToken = generateToken();
    const { error: updateError } = await db
      .from("newsletter_subscribers")
      .update({
        status: "pending",
        locale,
        source,
        consent_at: now.toISOString(),
        consent_text: CONSENT_TEXT[locale],
        consent_version: CONSENT_VERSION,
        ip_hash: ipHash,
        ua_hash: uaHash,
        verify_token: verifyToken,
        verify_sent_at: now.toISOString(),
        verify_expires_at: verifyExpiry(now).toISOString(),
        resend_count: (existing.resend_count ?? 0) + 1,
        last_resend_at: now.toISOString(),
        unsubscribed_at: null,
        last_event_at: now.toISOString(),
      })
      .eq("id", existing.id);
    if (updateError) {
      await captureError(updateError, { scope: "newsletter.subscribe.rearm" });
      throw new NewsletterError("newsletter_unavailable", "Subscription is temporarily unavailable");
    }

    await recordEvent({ subscriberId: existing.id, emailHash, type: "resend", source, locale, ipHash });
    await queueAndFlush({
      subscriberId: existing.id,
      to: email,
      kind: "double_opt_in",
      locale,
      verifyToken,
      unsubscribeToken: existing.unsubscribe_token,
      origin: siteOrigin(origin),
    });
    incr("framique_newsletter_signup_total", { outcome: "resent", source });
    return { outcome: "check_inbox", reason: null };
  });
}

export type VerifyResult =
  | { status: "confirmed" | "already_confirmed"; email: string }
  | { status: "expired" | "invalid" };

/**
 * Confirms a double opt-in link. The token is single-use: it is cleared on
 * success, so a forwarded email cannot be replayed into a second confirmation.
 */
export async function verifyNewsletter(token: string): Promise<VerifyResult> {
  return withSpan("newsletter.verify", async () => {
    const clean = String(token ?? "").trim();
    if (!/^[a-f0-9]{32,64}$/.test(clean)) {
      incr("framique_newsletter_verify_total", { outcome: "invalid" });
      return { status: "invalid" };
    }

    const { ip, origin } = requestSignals();
    await enforceRateLimit("newsletter.verify", await sha256(ip));

    const db = await admin();
    const { data: row } = await db
      .from("newsletter_subscribers")
      .select("id, email, status, locale, verify_expires_at, unsubscribe_token")
      .eq("verify_token", clean)
      .limit(1)
      .maybeSingle();

    if (!row) {
      // Either a bad link, or a token already spent. An already-active address
      // whose token was cleared lands here; answering `invalid` is correct and
      // reveals nothing, and the UI offers a fresh signup.
      incr("framique_newsletter_verify_total", { outcome: "unknown_token" });
      return { status: "invalid" };
    }

    if (row.status === "active") {
      incr("framique_newsletter_verify_total", { outcome: "already" });
      return { status: "already_confirmed", email: row.email };
    }

    const now = new Date();
    if (row.verify_expires_at && new Date(row.verify_expires_at).getTime() < now.getTime()) {
      await recordEvent({
        subscriberId: row.id,
        emailHash: await sha256(row.email),
        type: "verify_expired",
        locale: row.locale,
      });
      incr("framique_newsletter_verify_total", { outcome: "expired" });
      return { status: "expired" };
    }

    const { error } = await db
      .from("newsletter_subscribers")
      .update({
        status: "active",
        verified_at: now.toISOString(),
        verify_token: null,
        verify_expires_at: null,
        verify_attempts: 0,
        last_event_at: now.toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      await captureError(error, { scope: "newsletter.verify.update" });
      throw new NewsletterError("newsletter_unavailable", "Confirmation is temporarily unavailable");
    }

    await recordEvent({
      subscriberId: row.id,
      emailHash: await sha256(row.email),
      type: "verified",
      locale: row.locale,
    });
    await queueAndFlush({
      subscriberId: row.id,
      to: row.email,
      kind: "welcome",
      locale: (row.locale === "bn" ? "bn" : "en") as NewsletterLocale,
      verifyToken: null,
      unsubscribeToken: row.unsubscribe_token,
      origin: siteOrigin(origin),
    });
    incr("framique_newsletter_verify_total", { outcome: "confirmed" });
    return { status: "confirmed", email: row.email };
  });
}

export type UnsubscribeResult = { status: "done" | "already" | "invalid"; email?: string };

/**
 * One-click unsubscribe. Deliberately unauthenticated and idempotent: making
 * someone sign in to stop receiving mail is both hostile and a CAN-SPAM/GDPR
 * problem. The token is high entropy and only ever removes consent.
 */
export async function unsubscribeNewsletter(token: string): Promise<UnsubscribeResult> {
  return withSpan("newsletter.unsubscribe", async () => {
    const clean = String(token ?? "").trim();
    if (!/^[a-f0-9]{32,64}$/.test(clean)) return { status: "invalid" };

    const { ip } = requestSignals();
    await enforceRateLimit("newsletter.unsubscribe", await sha256(ip));

    const db = await admin();
    const { data: row } = await db
      .from("newsletter_subscribers")
      .select("id, email, status, locale")
      .eq("unsubscribe_token", clean)
      .limit(1)
      .maybeSingle();
    if (!row) return { status: "invalid" };

    if (row.status === "unsubscribed") {
      incr("framique_newsletter_unsubscribe_total", { outcome: "already" });
      return { status: "already", email: row.email };
    }

    const now = new Date();
    await db
      .from("newsletter_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: now.toISOString(),
        verify_token: null,
        verify_expires_at: null,
        last_event_at: now.toISOString(),
      })
      .eq("id", row.id);

    // Anything still queued for this address is suppressed in the same breath:
    // an unsubscribe that races a queued send must win.
    await db
      .from("newsletter_outbox")
      .update({ status: "suppressed", last_error: "unsubscribed" })
      .eq("subscriber_id", row.id)
      .eq("status", "queued");

    await recordEvent({
      subscriberId: row.id,
      emailHash: await sha256(row.email),
      type: "unsubscribed",
      locale: row.locale,
      reason: "one_click",
    });
    incr("framique_newsletter_unsubscribe_total", { outcome: "done" });
    return { status: "done", email: row.email };
  });
}

/**
 * Provider feedback: hard bounces and spam complaints. Called from the signed
 * webhook route. Suppression is permanent for hard bounces and complaints —
 * the whole point is that we stop mailing that address.
 */
export async function recordDeliveryFeedback(input: {
  email: string;
  kind: "hard" | "soft" | "complaint";
  detail?: string | null;
}): Promise<{ status: NewsletterStatus | "unknown"; suppressed: boolean }> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email) return { status: "unknown", suppressed: false };

  const db = await admin();
  const { data: row } = await db
    .from("newsletter_subscribers")
    .select("id, status, bounce_count, locale")
    .eq("email", email)
    .limit(1)
    .maybeSingle();
  if (!row) return { status: "unknown", suppressed: false };

  const now = new Date();
  const emailHash = await sha256(email);

  if (input.kind === "complaint") {
    await db
      .from("newsletter_subscribers")
      .update({
        status: "complained",
        complaint_at: now.toISOString(),
        verify_token: null,
        last_event_at: now.toISOString(),
      })
      .eq("id", row.id);
    await recordEvent({
      subscriberId: row.id,
      emailHash,
      type: "complained",
      reason: input.detail?.slice(0, 200) ?? null,
    });
    incr("framique_newsletter_feedback_total", { kind: "complaint" });
    return { status: "complained", suppressed: true };
  }

  const next = statusAfterBounce(row.status as NewsletterStatus, row.bounce_count ?? 0, input.kind);
  await db
    .from("newsletter_subscribers")
    .update({
      status: next.status,
      bounce_count: (row.bounce_count ?? 0) + 1,
      last_event_at: now.toISOString(),
      ...(next.suppressed ? { verify_token: null } : {}),
    })
    .eq("id", row.id);
  await recordEvent({
    subscriberId: row.id,
    emailHash,
    type: "bounced",
    reason: `${input.kind}:${input.detail?.slice(0, 160) ?? ""}`,
  });
  incr("framique_newsletter_feedback_total", { kind: input.kind, suppressed: String(next.suppressed) });
  return next;
}

/* ------------------------------------------------------------------ outbox */

type QueueInput = {
  subscriberId: string;
  to: string;
  kind: EmailKind;
  locale: NewsletterLocale;
  verifyToken: string | null;
  unsubscribeToken: string;
  origin: string;
};

function urlsFor(input: QueueInput) {
  return {
    verifyUrl: input.verifyToken
      ? `${input.origin}/newsletter/verify?token=${input.verifyToken}`
      : `${input.origin}/`,
    unsubscribeUrl: `${input.origin}/unsubscribe?token=${input.unsubscribeToken}`,
  };
}

/**
 * Persist first, then try to send. If the process dies between the two, the
 * row is still queued and the next flush picks it up — the confirmation is
 * late, never lost.
 */
async function queueAndFlush(input: QueueInput) {
  const db = await admin();
  const { verifyUrl, unsubscribeUrl } = urlsFor(input);
  const rendered = renderEmail(input.kind, {
    locale: input.locale,
    verifyUrl,
    unsubscribeUrl,
    origin: input.origin,
  });

  const { data: queued, error } = await db
    .from("newsletter_outbox")
    .insert({
      subscriber_id: input.subscriberId,
      to_email: input.to,
      kind: input.kind,
      locale: input.locale,
      subject: rendered.subject,
      body_text: rendered.text,
      body_html: rendered.html,
      max_attempts: NEWSLETTER_LIMITS.outboxMaxAttempts,
    })
    .select("id")
    .single();
  if (error || !queued) {
    // Queueing failed: the subscription still stands, and we shout, because a
    // person is now waiting for an email that has no row behind it.
    log("error", "newsletter.queue_failed", {
      kind: input.kind,
      message: String((error as { message?: string })?.message ?? "unknown"),
    });
    incr("framique_newsletter_outbox_total", { outcome: "queue_failed" });
    return;
  }

  await attemptDelivery(queued.id, {
    to: input.to,
    subject: rendered.subject,
    text: rendered.text,
    html: rendered.html,
    unsubscribeUrl,
  });
}

async function attemptDelivery(
  outboxId: string,
  message: { to: string; subject: string; text: string; html: string; unsubscribeUrl: string },
  previousAttempts = 0,
) {
  const db = await admin();
  const attempts = previousAttempts + 1;
  const result = await sendMail({ ...message, idempotencyKey: outboxId });
  const now = new Date();

  if (result.ok) {
    await db
      .from("newsletter_outbox")
      .update({
        status: "sent",
        provider: result.provider,
        provider_message_id: result.messageId,
        attempts,
        sent_at: now.toISOString(),
        last_error: result.simulated ? "no_provider_configured" : null,
      })
      .eq("id", outboxId);
    incr("framique_newsletter_outbox_total", {
      outcome: result.simulated ? "simulated" : "sent",
      provider: result.provider,
    });
    return;
  }

  const dead = !result.retriable || outboxIsDead(attempts);
  await db
    .from("newsletter_outbox")
    .update({
      status: dead ? "dead" : "queued",
      provider: result.provider,
      attempts,
      last_error: result.error.slice(0, 300),
      next_attempt_at: nextAttemptAt(attempts, now, Math.random()).toISOString(),
    })
    .eq("id", outboxId);
  incr("framique_newsletter_outbox_total", { outcome: dead ? "dead" : "retry" });
  if (dead) {
    log("error", "newsletter.outbox_dead_letter", { outboxId, attempts, error: result.error.slice(0, 200) });
  }
}

/**
 * Drains a small, bounded slice of due rows. Called opportunistically at the
 * top of a subscribe request rather than from a scheduler, so a provider blip
 * self-heals on the next visitor without adding a cron dependency. The batch
 * is deliberately tiny: a visitor's request is not a worker.
 */
export async function flushOutbox(limit = NEWSLETTER_LIMITS.outboxFlushBatch): Promise<{ processed: number }> {
  const bounded = Math.max(1, Math.min(NEWSLETTER_LIMITS.outboxFlushBatch, Math.trunc(limit)));
  const db = await admin();
  const { data: due } = await db
    .from("newsletter_outbox")
    .select("id, to_email, subject, body_text, body_html, attempts, subscriber_id")
    .eq("status", "queued")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(bounded);

  const rows = (due ?? []) as {
    id: string;
    to_email: string;
    subject: string;
    body_text: string;
    body_html: string | null;
    attempts: number;
  }[];

  for (const row of rows) {
    // Extract the unsubscribe URL we already rendered so the header stays in
    // sync with the body even on a retry days later.
    const match = /https?:\/\/\S*\/unsubscribe\?token=[a-f0-9]+/.exec(row.body_text);
    await attemptDelivery(
      row.id,
      {
        to: row.to_email,
        subject: row.subject,
        text: row.body_text,
        html: row.body_html ?? "",
        unsubscribeUrl: match?.[0] ?? "",
      },
      row.attempts,
    );
  }
  if (rows.length > 0) log("info", "newsletter.outbox_flushed", { processed: rows.length });
  return { processed: rows.length };
}

/** Send-time audience filter, mirroring `channelAudience` for the platform list. */
export function sendableStatuses(): NewsletterStatus[] {
  return (["pending", "active", "unsubscribed", "bounced", "complained", "blocked"] as NewsletterStatus[]).filter(
    isSendable,
  );
}