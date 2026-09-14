/** Public contact intake: validation, anti-abuse, durable routing, and delivery. */
import { getRequest } from "@tanstack/react-start/server";
import { captureError, incr, log, withSpan } from "./observability.server";
import { enforceRateLimit, RateLimitError } from "./rate-limit.server";
import { sendMail } from "./mailer.server";
import { ORG_NAP } from "./nap";
import {
  CONTACT_CONSENT_VERSION,
  CONTACT_LIMITS,
  CONTACT_ROUTES,
  contactReference,
  normaliseContact,
  renderContactAcknowledgement,
  responseDueAt,
  retryAt,
  scoreContact,
  type ContactLocale,
  type ContactRejectReason,
  type ContactTopic,
} from "./contact";

type Db = { from: (table: string) => any };

async function admin(): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

async function hash(value: string): Promise<string> {
  const salt = process.env["AUTH_HASH_SALT"] ?? "framique-contact";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${value}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 40);
}

function requestIdentity() {
  try {
    const request = getRequest();
    return {
      ip: (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown").slice(0, 64),
      ua: (request.headers.get("user-agent") ?? "unknown").slice(0, 180),
    };
  } catch {
    return { ip: "unknown", ua: "unknown" };
  }
}

function freshReference(now: Date) {
  const entropy = new Uint8Array(5);
  crypto.getRandomValues(entropy);
  return contactReference(now, entropy);
}

async function recordEvent(input: {
  submissionId: string | null;
  reference: string;
  eventType: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const db = await admin();
    await db.from("contact_events").insert({
      submission_id: input.submissionId,
      reference: input.reference,
      event_type: input.eventType,
      reason: input.reason?.slice(0, 300) ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    log("error", "contact.event_write_failed", {
      event_type: input.eventType,
      message: String((error as Error)?.message ?? error).slice(0, 160),
    });
  }
}

export type SubmitContactInput = {
  name: string;
  email: string;
  phone?: string | null;
  topic: ContactTopic;
  message: string;
  locale?: ContactLocale;
  honeypot?: string | null;
  renderedAt?: number | null;
};

export type SubmitContactResult = {
  outcome: "received" | "rejected" | "rate_limited";
  reference?: string;
  reason?: ContactRejectReason;
  retryAfterSeconds?: number;
};

export async function submitContact(input: SubmitContactInput): Promise<SubmitContactResult> {
  return withSpan("contact.submit", async () => {
    const now = new Date();
    const locale: ContactLocale = input.locale === "bn" ? "bn" : "en";
    const reference = freshReference(now);
    const identity = requestIdentity();
    const [ipHash, uaHash] = await Promise.all([hash(identity.ip), hash(identity.ua)]);
    const spam = scoreContact({
      honeypot: input.honeypot,
      renderedAt: input.renderedAt,
      submittedAt: now.getTime(),
    });

    if (spam.blocked) {
      await recordEvent({
        submissionId: null,
        reference,
        eventType: "rejected",
        reason: spam.reasons.join(","),
        metadata: { score: spam.score },
      });
      incr("framique_contact_submission_total", { outcome: "rejected", reason: spam.reasons[0] ?? "spam" });
      // A bot receives the same apparent success shape as a human; otherwise the
      // honeypot becomes an oracle it can tune against.
      return { outcome: "received", reference };
    }

    const cleaned = normaliseContact(input);
    if (!cleaned.ok) {
      incr("framique_contact_submission_total", { outcome: "invalid", reason: cleaned.reason });
      return { outcome: "rejected", reason: cleaned.reason };
    }

    const emailHash = await hash(cleaned.value.email);
    try {
      await enforceRateLimit("contact.submit_ip", ipHash);
      await enforceRateLimit("contact.submit_email", emailHash);
    } catch (error) {
      if (error instanceof RateLimitError) {
        incr("framique_contact_submission_total", { outcome: "rate_limited" });
        return {
          outcome: "rate_limited",
          retryAfterSeconds: Math.max(1, Math.ceil((new Date(error.resetAt).getTime() - now.getTime()) / 1_000)),
        };
      }
      throw error;
    }

    const dueAt = responseDueAt(input.topic, now);
    const db = await admin();
    const { data: row, error } = await db.from("contact_submissions").insert({
      reference,
      ...cleaned.value,
      topic: input.topic,
      routed_team: input.topic,
      response_due_at: dueAt.toISOString(),
      spam_score: spam.score,
      spam_reasons: spam.reasons,
      locale,
      consent_version: CONTACT_CONSENT_VERSION,
      ip_hash: ipHash,
      user_agent_hash: uaHash,
    }).select("id").single();

    if (error || !row) {
      await captureError(error ?? new Error("contact_insert_empty"), { scope: "contact.submit.insert" });
      throw new Error("contact_unavailable");
    }

    await recordEvent({
      submissionId: row.id,
      reference,
      eventType: "accepted",
      metadata: { topic: input.topic, locale, response_due_at: dueAt.toISOString() },
    });
    await queueContactMail({
      submissionId: row.id,
      reference,
      locale,
      topic: input.topic,
      name: cleaned.value.name,
      email: cleaned.value.email,
      phone: cleaned.value.phone,
      message: cleaned.value.message,
    });
    incr("framique_contact_submission_total", { outcome: "received", topic: input.topic });
    log("info", "contact.submission_received", { reference, topic: input.topic, response_due_at: dueAt.toISOString() });
    return { outcome: "received", reference };
  });
}

function routeRecipient(topic: ContactTopic) {
  if (topic === "sales") return ORG_NAP.salesEmail;
  if (topic === "migration") return ORG_NAP.migrationEmail;
  return ORG_NAP.supportEmail;
}

async function queueContactMail(input: {
  submissionId: string;
  reference: string;
  locale: ContactLocale;
  topic: ContactTopic;
  name: string;
  email: string;
  phone: string | null;
  message: string;
}) {
  const acknowledgement = renderContactAcknowledgement(input);
  const internalText = [
    `Reference: ${input.reference}`,
    `Team: ${CONTACT_ROUTES[input.topic].label.en}`,
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone ?? "Not provided"}`,
    "",
    input.message,
  ].join("\n");
  const messages = [
    { kind: "acknowledgement", recipient: input.email, ...acknowledgement },
    {
      kind: "internal_route",
      recipient: routeRecipient(input.topic),
      subject: `[${input.reference}] ${CONTACT_ROUTES[input.topic].label.en}: ${input.name}`,
      text: internalText,
      html: null,
    },
  ] as const;
  const db = await admin();

  for (const message of messages) {
    const { data: queued, error } = await db.from("contact_outbox").insert({
      submission_id: input.submissionId,
      kind: message.kind,
      recipient: message.recipient,
      subject: message.subject,
      text_body: message.text,
      html_body: message.html,
      idempotency_key: `${input.submissionId}:${message.kind}`,
    }).select("id").single();
    if (error || !queued) {
      log("error", "contact.outbox_queue_failed", { reference: input.reference, kind: message.kind });
      incr("framique_contact_outbox_total", { outcome: "queue_failed", kind: message.kind });
      continue;
    }
    await recordEvent({ submissionId: input.submissionId, reference: input.reference, eventType: message.kind === "acknowledgement" ? "ack_queued" : "routed" });
    await deliverContactMail(queued.id, message, 0, input.submissionId, input.reference);
  }
}

async function deliverContactMail(
  id: string,
  message: { recipient: string; subject: string; text: string; html: string | null; kind: string },
  previousAttempts: number,
  submissionId: string,
  reference: string,
) {
  const attempts = previousAttempts + 1;
  const result = await sendMail({
    to: message.recipient,
    subject: message.subject,
    text: message.text,
    html: message.html,
    idempotencyKey: id,
  });
  const db = await admin();
  const now = new Date();
  if (result.ok) {
    await db.from("contact_outbox").update({
      status: "sent",
      attempts,
      provider: result.provider,
      provider_message_id: result.messageId,
      sent_at: now.toISOString(),
      last_error: result.simulated ? "no_provider_configured" : null,
    }).eq("id", id);
    await recordEvent({ submissionId, reference, eventType: message.kind === "acknowledgement" ? "ack_sent" : "route_sent" });
    incr("framique_contact_outbox_total", { outcome: result.simulated ? "stored" : "sent", kind: message.kind });
    return;
  }
  const dead = !result.retriable || attempts >= CONTACT_LIMITS.outboxMaxAttempts;
  await db.from("contact_outbox").update({
    status: dead ? "dead" : "retry",
    attempts,
    provider: result.provider,
    last_error: result.error.slice(0, 500),
    next_attempt_at: retryAt(attempts, now).toISOString(),
  }).eq("id", id);
  await recordEvent({ submissionId, reference, eventType: "delivery_failed", reason: dead ? "dead" : "retry", metadata: { kind: message.kind, attempts } });
  incr("framique_contact_outbox_total", { outcome: dead ? "dead" : "retry", kind: message.kind });
}

export async function flushContactOutbox(limit = CONTACT_LIMITS.outboxFlushBatch) {
  const db = await admin();
  const now = new Date();
  const capped = Math.max(1, Math.min(CONTACT_LIMITS.outboxFlushBatch, Math.floor(limit)));
  const { data: rows, error } = await db.from("contact_outbox")
    .select("id, submission_id, kind, recipient, subject, text_body, html_body, attempts, contact_submissions!inner(reference)")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(capped);
  if (error) throw error;
  let processed = 0;
  for (const row of rows ?? []) {
    const reference = Array.isArray(row.contact_submissions)
      ? row.contact_submissions[0]?.reference
      : row.contact_submissions?.reference;
    if (!reference) continue;
    await deliverContactMail(row.id, {
      recipient: row.recipient,
      subject: row.subject,
      text: row.text_body,
      html: row.html_body,
      kind: row.kind,
    }, row.attempts ?? 0, row.submission_id, reference);
    processed += 1;
  }
  return { processed };
}