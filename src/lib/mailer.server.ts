/**
 * Outbound transactional mail (Phase 10.4).
 *
 * The platform has no mail provider wired in yet, and pretending otherwise
 * would be the worst kind of lie in a codebase: the newsletter would look
 * delivered and nobody would receive anything. So this module does three
 * honest things instead.
 *
 *   1. It picks a provider from the environment. `RESEND_API_KEY` selects the
 *      Resend HTTP API (fetch-only, Worker-safe). With nothing configured it
 *      falls back to the `log` transport, which records the full message in
 *      the outbox row and emits a warning — the message is *stored*, not
 *      claimed as delivered to a person.
 *   2. It classifies failures. A 429 or a 5xx is retriable and goes back on
 *      the queue with backoff; a 4xx is permanent and dead-letters at once,
 *      because retrying a rejected recipient five times is how a sender earns
 *      a reputation problem.
 *   3. It fails fast and closed. Every call is wrapped in an abort timeout and
 *      a circuit breaker, so a provider hanging for 30s cannot hold a
 *      visitor's subscribe request open, and a provider that is down stops
 *      being asked until a cooldown passes.
 */
import { captureError, incr, log, observe } from "./observability.server";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string | null;
  /** Set on marketing mail so a client can offer one-click unsubscribe. */
  unsubscribeUrl?: string | null;
  /** Dedupe hint the provider may use; also our own idempotency key. */
  idempotencyKey?: string | null;
};

export type MailResult =
  | { ok: true; provider: MailProvider; messageId: string | null; simulated: boolean }
  | { ok: false; provider: MailProvider; retriable: boolean; error: string; status: number | null };

export type MailProvider = "resend" | "log";

export const MAIL_TIMEOUT_MS = 8_000;

/** Consecutive failures before the breaker opens, and how long it stays open. */
export const MAIL_BREAKER = { threshold: 5, cooldownMs: 60_000 } as const;

const breaker = { failures: 0, openedAt: 0 };

export function mailBreakerState() {
  return { ...breaker, open: isBreakerOpen(Date.now()) };
}

/** Test seam: a fresh process starts closed, and tests must be able to as well. */
export function resetMailBreaker() {
  breaker.failures = 0;
  breaker.openedAt = 0;
}

function isBreakerOpen(now: number): boolean {
  if (breaker.openedAt === 0) return false;
  if (now - breaker.openedAt >= MAIL_BREAKER.cooldownMs) {
    // Half-open: allow the next call through and let it decide.
    breaker.openedAt = 0;
    breaker.failures = 0;
    return false;
  }
  return true;
}

function noteFailure(now: number) {
  breaker.failures += 1;
  if (breaker.failures >= MAIL_BREAKER.threshold && breaker.openedAt === 0) {
    breaker.openedAt = now;
    log("error", "mail.breaker_open", { failures: breaker.failures });
    incr("framique_mail_breaker_total", { state: "open" });
  }
}

function noteSuccess() {
  breaker.failures = 0;
  breaker.openedAt = 0;
}

export function selectedProvider(): MailProvider {
  return process.env["RESEND_API_KEY"] ? "resend" : "log";
}

export function fromAddress(): string {
  return process.env["NEWSLETTER_FROM"] ?? "Framique <newsletter@framique.com>";
}

/** Address masked for logs — we never write a subscriber's mailbox to stdout. */
function maskedTo(to: string): string {
  const [user = "", domain = ""] = to.split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const provider = selectedProvider();
  const startedAt = Date.now();

  if (isBreakerOpen(startedAt)) {
    incr("framique_mail_total", { provider, outcome: "breaker_open" });
    return { ok: false, provider, retriable: true, error: "mail.breaker_open", status: null };
  }

  if (provider === "log") {
    // No provider configured. The message is persisted by the caller; here we
    // only record that it was *not* handed to anybody who can deliver it.
    log("warn", "mail.no_provider", {
      to: maskedTo(message.to),
      subject: message.subject.slice(0, 120),
      bytes: message.text.length,
    });
    incr("framique_mail_total", { provider, outcome: "simulated" });
    return { ok: true, provider, messageId: null, simulated: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAIL_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${process.env["RESEND_API_KEY"]}`,
      "content-type": "application/json",
    };
    if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey;

    const body: Record<string, unknown> = {
      from: fromAddress(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
    };
    if (message.html) body["html"] = message.html;
    if (message.unsubscribeUrl) {
      // RFC 8058: a mail client can unsubscribe without the person hunting for
      // a link, which measurably reduces spam complaints.
      body["headers"] = {
        "List-Unsubscribe": `<${message.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      };
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    observe("framique_mail_duration_ms", Date.now() - startedAt, { provider });

    if (res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { id?: string };
      noteSuccess();
      incr("framique_mail_total", { provider, outcome: "sent" });
      return { ok: true, provider, messageId: payload.id ?? null, simulated: false };
    }

    const detail = (await res.text().catch(() => "")).slice(0, 300);
    const retriable = res.status === 429 || res.status >= 500;
    if (retriable) noteFailure(Date.now());
    incr("framique_mail_total", {
      provider,
      outcome: retriable ? "retriable_error" : "permanent_error",
    });
    log(retriable ? "warn" : "error", "mail.rejected", {
      to: maskedTo(message.to),
      status: res.status,
      detail,
    });
    return { ok: false, provider, retriable, error: detail || `http_${res.status}`, status: res.status };
  } catch (error) {
    const aborted = (error as Error)?.name === "AbortError";
    noteFailure(Date.now());
    incr("framique_mail_total", { provider, outcome: aborted ? "timeout" : "network_error" });
    await captureError(error, { scope: "mail.send", to: maskedTo(message.to) });
    return {
      ok: false,
      provider,
      retriable: true,
      error: aborted ? "mail.timeout" : String((error as Error)?.message ?? error).slice(0, 200),
      status: null,
    };
  } finally {
    clearTimeout(timer);
  }
}