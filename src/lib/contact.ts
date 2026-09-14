export const CONTACT_TOPICS = ["sales", "support", "migration"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];
export type ContactLocale = "en" | "bn";

export const CONTACT_CONSENT_VERSION = "2026-08-v1";
export const CONTACT_LIMITS = {
  minNameChars: 2,
  maxNameChars: 100,
  minMessageChars: 20,
  maxMessageChars: 4_000,
  minFillMs: 1_500,
  maxFormAgeMs: 6 * 60 * 60 * 1_000,
  outboxMaxAttempts: 5,
  outboxFlushBatch: 6,
} as const;

export const CONTACT_ROUTES: Record<ContactTopic, { responseHours: number; label: Record<ContactLocale, string> }> = {
  sales: { responseHours: 4, label: { en: "Sales", bn: "সেলস" } },
  support: { responseHours: 2, label: { en: "Merchant support", bn: "মার্চেন্ট সাপোর্ট" } },
  migration: { responseHours: 8, label: { en: "Store migration", bn: "স্টোর মাইগ্রেশন" } },
};

export type ContactRejectReason =
  | "name_invalid"
  | "email_invalid"
  | "phone_invalid"
  | "message_too_short"
  | "message_too_long"
  | "bot_honeypot"
  | "bot_timing"
  | "form_expired";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()-]{7,24}$/;

export function normaliseContact(input: {
  name: string;
  email: string;
  phone?: string | null;
  message: string;
}) {
  const name = input.name.replace(/\s+/g, " ").trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone?.replace(/\s+/g, " ").trim() || null;
  const message = input.message.replace(/\r\n/g, "\n").trim();
  if (name.length < CONTACT_LIMITS.minNameChars || name.length > CONTACT_LIMITS.maxNameChars)
    return { ok: false as const, reason: "name_invalid" as const };
  if (email.length > 254 || !EMAIL_RE.test(email))
    return { ok: false as const, reason: "email_invalid" as const };
  if (phone && !PHONE_RE.test(phone))
    return { ok: false as const, reason: "phone_invalid" as const };
  if (message.length < CONTACT_LIMITS.minMessageChars)
    return { ok: false as const, reason: "message_too_short" as const };
  if (message.length > CONTACT_LIMITS.maxMessageChars)
    return { ok: false as const, reason: "message_too_long" as const };
  return { ok: true as const, value: { name, email, phone, message } };
}

export function scoreContact(signals: {
  honeypot?: string | null;
  renderedAt?: number | null;
  submittedAt: number;
}) {
  const reasons: ContactRejectReason[] = [];
  let score = 0;
  if (signals.honeypot?.trim()) {
    score += 100;
    reasons.push("bot_honeypot");
  }
  if (typeof signals.renderedAt === "number" && Number.isFinite(signals.renderedAt)) {
    const elapsed = signals.submittedAt - signals.renderedAt;
    if (elapsed >= 0 && elapsed < CONTACT_LIMITS.minFillMs) {
      score += 70;
      reasons.push("bot_timing");
    }
    if (elapsed > CONTACT_LIMITS.maxFormAgeMs) {
      score += 30;
      reasons.push("form_expired");
    }
  }
  return { score: Math.min(100, score), reasons, blocked: score >= 70 };
}

export function contactReference(now: Date, entropy: Uint8Array): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = [...entropy].slice(0, 5).map((v) => v.toString(36).padStart(2, "0")).join("").toUpperCase();
  return `FQ-${day}-${suffix}`;
}

export function responseDueAt(topic: ContactTopic, now: Date): Date {
  return new Date(now.getTime() + CONTACT_ROUTES[topic].responseHours * 3_600_000);
}

export function retryAt(attempts: number, now: Date): Date {
  const seconds = Math.min(1_800, 30 * 2 ** Math.max(0, attempts - 1));
  return new Date(now.getTime() + seconds * 1_000);
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

export function renderContactAcknowledgement(input: {
  name: string;
  reference: string;
  topic: ContactTopic;
  locale: ContactLocale;
}) {
  const route = CONTACT_ROUTES[input.topic];
  const bnHours = String(route.responseHours).replace(/\d/g, (digit) => "০১২৩৪৫৬৭৮৯"[Number(digit)] ?? digit);
  const subject = input.locale === "bn" ? `আপনার বার্তা পেয়েছি — ${input.reference}` : `We received your message — ${input.reference}`;
  const text = input.locale === "bn"
    ? `${input.name},\n\nআপনার ${route.label.bn} বার্তা পেয়েছি। রেফারেন্স: ${input.reference}। সাধারণত ${bnHours} কর্মঘণ্টার মধ্যে উত্তর দিই।\n\nFramique`
    : `${input.name},\n\nWe received your ${route.label.en.toLowerCase()} message. Reference: ${input.reference}. We normally reply within ${route.responseHours} business hours.\n\nFramique`;
  return { subject, text, html: `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>` };
}