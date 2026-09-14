/**
 * Phase 10.4 — the newsletter domain, expressed as pure functions.
 *
 * This is the platform (marketing site) list, not a merchant's storefront
 * audience — that one lives in `public.subscribers` and is tenant scoped.
 *
 * Everything that decides *whether* an address may join the list, *when* a
 * confirmation may be resent, *how long* a verify link lives and *what* the
 * email says lives here, with no I/O. Three reasons:
 *
 *   • Consent is a legal artefact. The exact sentence a person agreed to, and
 *     its version, must be reproducible years later from a constant, not from
 *     whatever the footer happens to render today.
 *   • Anti-abuse rules must be testable without a database. A honeypot rule
 *     that only runs in production is a rule nobody can prove.
 *   • The server module stays a thin, auditable transaction script.
 */

export type NewsletterLocale = "en" | "bn";

export type NewsletterStatus =
  | "pending"
  | "active"
  | "unsubscribed"
  | "bounced"
  | "complained"
  | "blocked";

/** Where the signup happened. Kept closed so reporting cannot drift. */
export const NEWSLETTER_SOURCES = [
  "footer",
  "blog_end",
  "exit_intent",
  "pricing",
  "docs",
  "contact",
  "unknown",
] as const;
export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

export function normaliseSource(value: unknown): NewsletterSource {
  const v = String(value ?? "").trim().toLowerCase();
  return (NEWSLETTER_SOURCES as readonly string[]).includes(v) ? (v as NewsletterSource) : "unknown";
}

/**
 * Operational limits. Every number here is a decision someone can argue with,
 * so they are named, commented and imported — never inlined at a call site.
 */
export const NEWSLETTER_LIMITS = {
  /** RFC 5321 maximum path length. Anything longer is not an address. */
  emailMaxChars: 254,
  localPartMaxChars: 64,
  /** Confirmation link lifetime. Long enough for a weekend, short enough to expire. */
  verifyTtlHours: 48,
  /** A person may ask for the confirmation again, but not as a send loop. */
  resendCooldownSeconds: 300,
  maxResends: 5,
  /** A human cannot read the label, type an address and submit in under a second. */
  minFillMs: 1_200,
  /** A form open for longer than this was probably left in a tab, or replayed. */
  maxFormAgeMs: 6 * 60 * 60 * 1000,
  /** Outbox delivery attempts before the row is dead-lettered for an operator. */
  outboxMaxAttempts: 5,
  /** Rows a single request is allowed to drain, so a flush cannot become a job. */
  outboxFlushBatch: 5,
  /** Hard bounces tolerated before the address is suppressed outright. */
  maxHardBounces: 2,
} as const;

/**
 * Disposable/throwaway providers. This list is deliberately short and made of
 * domains that exist only to be disposable — we would rather let a rare one
 * through than reject somebody's real mailbox, so there is no fuzzy matching
 * and no "looks temporary" heuristic beyond the explicit suffixes below.
 */
export const DISPOSABLE_DOMAINS = new Set<string>([
  "0-mail.com",
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "boun.cr",
  "burnermail.io",
  "dispostable.com",
  "dropmail.me",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.net",
  "harakirimail.com",
  "inboxbear.com",
  "jetable.org",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.org",
  "tempail.com",
  "tempmail.dev",
  "tempmailo.com",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

/** Sub-domained disposable services (`something.1secmail.com`). */
export const DISPOSABLE_SUFFIXES = [
  ".1secmail.com",
  ".mailinator.com",
  ".yopmail.com",
  ".trashmail.com",
  ".33mail.com",
] as const;

/**
 * Shared mailboxes. A newsletter sent to `info@` is a newsletter nobody
 * consented to: one person subscribes, five colleagues receive it, and the
 * complaint lands on our sending reputation.
 */
export const ROLE_LOCAL_PARTS = new Set<string>([
  "abuse",
  "admin",
  "administrator",
  "billing",
  "contact",
  "help",
  "hostmaster",
  "info",
  "mail",
  "marketing",
  "no-reply",
  "noreply",
  "office",
  "postmaster",
  "root",
  "sales",
  "security",
  "support",
  "sysadmin",
  "webmaster",
]);

/**
 * The consent sentence, versioned. `consent_version` is stored on the row, so
 * changing this text later never rewrites what an existing subscriber agreed
 * to — a new version is added and old rows keep pointing at the old wording.
 */
export const CONSENT_VERSION = "2026-08-v1";

export const CONSENT_TEXT: Record<NewsletterLocale, string> = {
  en: "I agree to receive the Framique merchant newsletter by email, and I can unsubscribe from any message.",
  bn: "আমি ইমেইলে Framique মার্চেন্ট নিউজলেটার পেতে সম্মত, এবং যেকোনো মেসেজ থেকে আনসাবস্ক্রাইব করতে পারব।",
};

export type RejectReason =
  | "email_required"
  | "email_too_long"
  | "email_invalid"
  | "email_disposable"
  | "email_role_address"
  | "bot_honeypot"
  | "bot_timing"
  | "form_expired"
  | "consent_required";

export type EmailVerdict =
  | { ok: true; email: string; localPart: string; domain: string }
  | { ok: false; reason: RejectReason };

/**
 * Address syntax we are willing to accept. Intentionally stricter than RFC
 * 5322 (which permits quoted strings and comments almost nobody can deliver
 * to) and looser than a hand-rolled `\w+@\w+` — the goal is "an address a mail
 * server will accept", not "a grammar a parser will accept".
 */
const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function validateEmail(raw: unknown): EmailVerdict {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, reason: "email_required" };
  if (value.length > NEWSLETTER_LIMITS.emailMaxChars) return { ok: false, reason: "email_too_long" };
  if (/\s/.test(value)) return { ok: false, reason: "email_invalid" };

  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return { ok: false, reason: "email_invalid" };

  const localPart = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (localPart.length > NEWSLETTER_LIMITS.localPartMaxChars) return { ok: false, reason: "email_invalid" };
  if (!LOCAL_RE.test(localPart)) return { ok: false, reason: "email_invalid" };

  // Address literals (`user@[10.0.0.1]`) and bare hostnames are never a real
  // newsletter recipient, and both are common in scripted signups.
  if (domain.startsWith("[") || !domain.includes(".")) return { ok: false, reason: "email_invalid" };
  const labels = domain.split(".");
  if (labels.some((label) => !LABEL_RE.test(label))) return { ok: false, reason: "email_invalid" };
  const tld = labels[labels.length - 1]!;
  if (tld.length < 2 || /\d/.test(tld)) return { ok: false, reason: "email_invalid" };

  const email = `${localPart.toLowerCase()}@${domain}`;
  if (isDisposableDomain(domain)) return { ok: false, reason: "email_disposable" };
  if (ROLE_LOCAL_PARTS.has(localPart.toLowerCase())) return { ok: false, reason: "email_role_address" };

  return { ok: true, email, localPart: localPart.toLowerCase(), domain };
}

export function isDisposableDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  return DISPOSABLE_SUFFIXES.some((suffix) => d.endsWith(suffix));
}

export type SubmissionSignals = {
  /** Hidden field a human never sees, and therefore never fills. */
  honeypot?: string | null;
  /** Epoch ms the form was rendered, stamped client-side. */
  renderedAt?: number | null;
  /** Epoch ms of submission — supplied so tests are deterministic. */
  submittedAt: number;
  consent: boolean;
};

export type SubmissionVerdict =
  | { ok: true; fillMs: number | null }
  | { ok: false; reason: RejectReason };

/**
 * Cheap, local bot filtering. None of these are proof of a bot on their own,
 * which is why each one is a separate, named reason: the metric tells us which
 * rule is actually earning its place, and which is only rejecting humans.
 */
export function scoreSubmission(signals: SubmissionSignals): SubmissionVerdict {
  if (signals.honeypot && signals.honeypot.trim() !== "") return { ok: false, reason: "bot_honeypot" };
  if (!signals.consent) return { ok: false, reason: "consent_required" };

  if (typeof signals.renderedAt === "number" && Number.isFinite(signals.renderedAt)) {
    const fillMs = signals.submittedAt - signals.renderedAt;
    // A negative delta means a forged or clock-skewed timestamp: treat it as
    // "no signal" rather than as evidence, and let the rate limiter decide.
    if (fillMs >= 0) {
      if (fillMs < NEWSLETTER_LIMITS.minFillMs) return { ok: false, reason: "bot_timing" };
      if (fillMs > NEWSLETTER_LIMITS.maxFormAgeMs) return { ok: false, reason: "form_expired" };
      return { ok: true, fillMs };
    }
  }
  return { ok: true, fillMs: null };
}

/** URL-safe, 192-bit token. Long enough that guessing is not a strategy. */
export function generateToken(bytes = 24): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function verifyExpiry(now: Date): Date {
  return new Date(now.getTime() + NEWSLETTER_LIMITS.verifyTtlHours * 3600_000);
}

export type ResendState = {
  status: NewsletterStatus;
  resendCount: number;
  lastResendAt: string | null;
};

export type ResendVerdict =
  | { ok: true }
  | { ok: false; reason: "not_pending" | "cooldown" | "resend_limit"; retryAfterSeconds: number };

export function canResend(state: ResendState, now: Date): ResendVerdict {
  if (state.status !== "pending") return { ok: false, reason: "not_pending", retryAfterSeconds: 0 };
  if (state.resendCount >= NEWSLETTER_LIMITS.maxResends) {
    return { ok: false, reason: "resend_limit", retryAfterSeconds: 0 };
  }
  if (state.lastResendAt) {
    const elapsed = (now.getTime() - new Date(state.lastResendAt).getTime()) / 1000;
    if (elapsed < NEWSLETTER_LIMITS.resendCooldownSeconds) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSeconds: Math.ceil(NEWSLETTER_LIMITS.resendCooldownSeconds - elapsed),
      };
    }
  }
  return { ok: true };
}

/**
 * Delivery retry schedule: exponential with a cap, plus caller-supplied jitter
 * so a provider outage does not produce a synchronised retry stampede when it
 * recovers. Attempt is 1-based (the delay *after* attempt N failed).
 */
export function backoffDelayMs(attempt: number, jitter = 0): number {
  const base = Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
  const spread = Math.max(0, Math.min(1, jitter)) * base * 0.25;
  return Math.round(base + spread);
}

export function nextAttemptAt(attempt: number, now: Date, jitter = 0): Date {
  return new Date(now.getTime() + backoffDelayMs(attempt, jitter));
}

export function outboxIsDead(attempts: number): boolean {
  return attempts >= NEWSLETTER_LIMITS.outboxMaxAttempts;
}

/**
 * Bounce handling. A soft bounce is a mailbox having a bad day; a hard bounce
 * is a mailbox that does not exist, and continuing to mail it is how a sender
 * gets blocklisted. Complaints suppress immediately, always.
 */
export function statusAfterBounce(
  current: NewsletterStatus,
  bounceCount: number,
  kind: "hard" | "soft",
): { status: NewsletterStatus; suppressed: boolean } {
  if (current === "unsubscribed" || current === "complained" || current === "blocked") {
    return { status: current, suppressed: true };
  }
  if (kind === "hard" || bounceCount + 1 >= NEWSLETTER_LIMITS.maxHardBounces) {
    return { status: "bounced", suppressed: true };
  }
  return { status: current, suppressed: false };
}

export function isSendable(status: NewsletterStatus): boolean {
  return status === "pending" || status === "active";
}

export type EmailKind = "double_opt_in" | "welcome" | "unsubscribe_receipt";

export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const EMAIL_COPY: Record<
  EmailKind,
  Record<NewsletterLocale, { subject: string; lines: (ctx: EmailContext) => string[]; cta?: string }>
> = {
  double_opt_in: {
    en: {
      subject: "Confirm your Framique newsletter subscription",
      cta: "Confirm subscription",
      lines: (ctx) => [
        "Someone — we hope you — asked to receive the Framique merchant newsletter at this address.",
        `Confirm within ${NEWSLETTER_LIMITS.verifyTtlHours} hours: ${ctx.verifyUrl}`,
        "If it was not you, ignore this email. Nothing is sent to an address that is never confirmed.",
      ],
    },
    bn: {
      subject: "আপনার Framique নিউজলেটার সাবস্ক্রিপশন নিশ্চিত করুন",
      cta: "সাবস্ক্রিপশন নিশ্চিত করুন",
      lines: (ctx) => [
        "এই ঠিকানায় Framique মার্চেন্ট নিউজলেটার পাওয়ার অনুরোধ এসেছে — আশা করি সেটি আপনিই করেছেন।",
        `${NEWSLETTER_LIMITS.verifyTtlHours} ঘণ্টার মধ্যে নিশ্চিত করুন: ${ctx.verifyUrl}`,
        "আপনি না করে থাকলে ইমেইলটি এড়িয়ে যান। নিশ্চিত না হওয়া ঠিকানায় আমরা কিছুই পাঠাই না।",
      ],
    },
  },
  welcome: {
    en: {
      subject: "You are on the Framique newsletter list",
      lines: () => [
        "Your subscription is confirmed. You will get one email a month about product changes, commerce rules in Bangladesh, and merchant stories.",
        "Every email carries an unsubscribe link that works in one click.",
      ],
    },
    bn: {
      subject: "আপনি Framique নিউজলেটার তালিকায় যুক্ত হয়েছেন",
      lines: () => [
        "আপনার সাবস্ক্রিপশন নিশ্চিত হয়েছে। মাসে একটি ইমেইলে প্রোডাক্টের পরিবর্তন, বাংলাদেশের কমার্স নিয়ম এবং মার্চেন্টদের গল্প পাবেন।",
        "প্রতিটি ইমেইলে এক ক্লিকে আনসাবস্ক্রাইব করার লিঙ্ক থাকবে।",
      ],
    },
  },
  unsubscribe_receipt: {
    en: {
      subject: "You are unsubscribed from the Framique newsletter",
      lines: () => [
        "This address has been removed from the Framique newsletter list. No further marketing email will be sent to it.",
        "If this was a mistake, you can subscribe again from the site footer.",
      ],
    },
    bn: {
      subject: "Framique নিউজলেটার থেকে আপনাকে সরানো হয়েছে",
      lines: () => [
        "এই ঠিকানাটি Framique নিউজলেটার তালিকা থেকে সরানো হয়েছে। এখানে আর কোনো মার্কেটিং ইমেইল যাবে না।",
        "ভুল করে হয়ে থাকলে সাইটের ফুটার থেকে আবার সাবস্ক্রাইব করতে পারেন।",
      ],
    },
  },
};

export type EmailContext = {
  locale: NewsletterLocale;
  verifyUrl: string;
  unsubscribeUrl: string;
  /** Absolute site origin, used for the footer identity line. */
  origin: string;
};

/**
 * Renders one message in both plain text and HTML. Text is not an afterthought:
 * it is what spam filters read, what accessible clients render, and what we can
 * assert on in a test.
 */
export function renderEmail(kind: EmailKind, ctx: EmailContext): RenderedEmail {
  const copy = EMAIL_COPY[kind][ctx.locale];
  const lines = copy.lines(ctx);
  const footer =
    ctx.locale === "bn"
      ? `আনসাবস্ক্রাইব: ${ctx.unsubscribeUrl}`
      : `Unsubscribe: ${ctx.unsubscribeUrl}`;

  const text = [...lines, "", footer, ctx.origin].join("\n\n");

  const body = lines
    .map((line) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(line)}</p>`)
    .join("");
  const button =
    kind === "double_opt_in" && copy.cta
      ? `<p style="margin:24px 0"><a href="${escapeHtml(ctx.verifyUrl)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escapeHtml(copy.cta)}</a></p>`
      : "";

  const html = [
    `<!doctype html><html lang="${ctx.locale}"><body style="margin:0;padding:24px;background:#f8fafc;font-family:system-ui,-apple-system,'Noto Sans Bengali',sans-serif;color:#0f172a">`,
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">`,
    `<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(copy.subject)}</h1>`,
    body,
    button,
    `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />`,
    `<p style="font-size:12px;color:#64748b;margin:0"><a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:#64748b">${escapeHtml(ctx.locale === "bn" ? "আনসাবস্ক্রাইব" : "Unsubscribe")}</a> · ${escapeHtml(ctx.origin)}</p>`,
    `</div></body></html>`,
  ].join("");

  return { subject: copy.subject, text, html };
}

/**
 * What the browser is allowed to learn. A subscribe endpoint that answers
 * "already subscribed" for one address and "check your inbox" for another is
 * an email-enumeration oracle, so the success shape is identical for a new
 * address, a pending one and an already-confirmed one.
 */
export type SubscribeOutcome = "check_inbox" | "rejected" | "rate_limited";

export function publicOutcome(reason: RejectReason | null): SubscribeOutcome {
  return reason ? "rejected" : "check_inbox";
}