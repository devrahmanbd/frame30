/**
 * Support Mail Notification Engine (Phase 12.7).
 *
 * Dispatches transactional emails upon support agent interactions:
 *  1. Admin Alert: Notifies merchant support admin (or platform admin) of customer query, contact info, and status.
 *  2. Customer Reply: Sends an email copy and confirmation of the conversation and agent response to the customer.
 */

import { sendMail, type MailResult } from "./mailer.server";
import { ORG_NAP } from "./nap";
import { log, incr, withSpan } from "./observability.server";
import { redactPii, screenOutbound } from "./support-guardrails";

export type SupportNotificationInput = {
  merchantId: string;
  merchantName: string;
  slug: string;
  conversationId: string | null;
  customerName: string;
  customerEmail: string;
  phone?: string | null;
  orderNumber?: string | null;
  userMessage: string;
  agentReply: string;
  ticketId?: string | null;
  ticketRef?: string | null;
  priority?: string | null;
  callbackId?: string | null;
  locale?: "bn" | "en";
  trigger?:
    "chat_turn" | "ticket_created" | "callback_requested" | "human_takeover";
};

export type SupportNotificationResult = {
  ok: boolean;
  adminResult: MailResult | null;
  customerResult: MailResult | null;
  adminRecipient: string;
  customerRecipient: string;
  /** Union of PII classes scrubbed from the free-text bodies (e.g. "email"). */
  piiRedacted: string[];
  /** Outbound-filter rules that forced a body to be withheld, if any. */
  withheldRules: string[];
};

export type MailBodySafety = {
  text: string;
  piiHits: string[];
  withheldRule: string | null;
};

/**
 * PII + outbound safety gate for every free-text body that leaves the platform
 * by email. `redactPii` replaces raw identifiers (email, phone, NID,
 * card, …) with stable placeholders; `screenOutbound` then blocks anything
 * redactPii cannot fix (secrets, code leaks, authority claims) by withholding
 * the body behind a desk pointer instead of leaking it.
 */
export function sanitiseMailBody(raw: string): MailBodySafety {
  const { text: redacted, hits } = redactPii(raw ?? "");
  const verdict = screenOutbound(redacted, { pinned: true });
  if (!verdict.allowed) {
    return {
      text: `[Withheld by outbound safety filter (${verdict.rule}). See the admin support desk for the full transcript.]`,
      piiHits: hits,
      withheldRule: verdict.rule,
    };
  }
  return { text: redacted, piiHits: hits, withheldRule: null };
}

type Db = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: unknown;
        }>;
      };
    };
  };
};

async function getAdminDb(): Promise<Db> {
  const { supabaseAdmin } =
    await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Db;
}

/**
 * Resolves the admin notification recipient for a merchant or platform.
 */
export async function resolveAdminEmail(
  merchantId: string,
  slug: string,
): Promise<string> {
  if (slug === "framique" || slug === "platform") {
    return process.env["SUPPORT_ADMIN_EMAIL"] ?? ORG_NAP.supportEmail;
  }

  try {
    const db = await getAdminDb();
    const { data } = await db
      .from("merchant_settings")
      .select("support_email")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    const candidate =
      typeof data?.["support_email"] === "string"
        ? data["support_email"].trim()
        : "";
    if (candidate && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(candidate)) {
      return candidate;
    }
  } catch {
    /* fallback to org support email */
  }

  return process.env["SUPPORT_ADMIN_EMAIL"] ?? ORG_NAP.supportEmail;
}

/**
 * Generates an internal message digest for idempotency keys.
 */
function messageDigest(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Dispatches notification emails to admin and customer.
 * Fails safely and gracefully: mail provider errors never crash the chat turn.
 */
export async function sendSupportNotifications(
  input: SupportNotificationInput,
): Promise<SupportNotificationResult> {
  return withSpan("support.mail_notifications", async () => {
    const email = input.customerEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
      return {
        ok: false,
        adminResult: null,
        customerResult: null,
        adminRecipient: "",
        customerRecipient: email,
        piiRedacted: [],
        withheldRules: [],
      };
    }

    const adminEmail = await resolveAdminEmail(input.merchantId, input.slug);
    const customerName = input.customerName.trim() || "Customer";
    const timestamp = new Date().toISOString();
    const convId = input.conversationId ?? "unassigned";
    // Free-text bodies are untrusted: scrub PII and screen outbound before
    // either message leaves the boundary. Structured contact fields above stay
    // intact — the desk needs them to answer.
    const safeUser = sanitiseMailBody(input.userMessage);
    const safeAgent = sanitiseMailBody(input.agentReply);
    const userMessage = safeUser.text;
    const agentReply = safeAgent.text;
    const piiRedacted = [...new Set([...safeUser.piiHits, ...safeAgent.piiHits])];
    const withheldRules = [safeUser.withheldRule, safeAgent.withheldRule].filter(
      (r): r is string => r !== null,
    );
    if (withheldRules.length > 0) {
      log("warn", "support.mail_body_withheld", {
        conversationId: convId,
        rules: withheldRules,
      });
      incr("framique_support_mail_withheld_total", {
        rule: withheldRules[0] as string,
      });
    }
    if (piiRedacted.length > 0) {
      incr("framique_support_mail_redacted_total", {
        classes: piiRedacted.slice(0, 3).join(","),
      });
    }
    const digest = messageDigest(`${userMessage}:${agentReply}`);

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Admin Notification Message
    // ─────────────────────────────────────────────────────────────────────────
    const adminSubjectPrefix = input.ticketRef
      ? `[Support Ticket ${input.ticketRef}]`
      : input.callbackId
        ? `[Support Callback]`
        : input.trigger === "human_takeover"
          ? `[Support Alert: Human Takeover]`
          : `[Support Inquiry]`;

    const adminSubject = `${adminSubjectPrefix} ${input.merchantName}: ${customerName}`;

    const adminText = [
      `=== Support Notification ===`,
      `Store: ${input.merchantName} (${input.slug})`,
      `Customer Name: ${customerName}`,
      `Customer Email: ${email}`,
      `Phone: ${input.phone || "Not provided"}`,
      `Order Number: ${input.orderNumber || "Not provided"}`,
      `Conversation ID: ${convId}`,
      `Timestamp: ${timestamp}`,
      input.ticketRef
        ? `Ticket Ref: ${input.ticketRef} (Priority: ${input.priority || "normal"})`
        : null,
      input.callbackId ? `Callback ID: ${input.callbackId}` : null,
      "",
      `--- Customer Message ---`,
      userMessage,
      "",
      `--- Agent Response ---`,
      agentReply,
      "",
      `View in Admin Desk: https://${input.slug === "platform" ? "store.framique.com" : `${input.slug}.framique.com`}/admin/support`,
    ]
      .filter(Boolean)
      .join("\n");

    const adminHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
  <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
    <h2 style="margin: 0 0 4px 0; color: #111827; font-size: 18px;">${adminSubjectPrefix} ${escapeHtml(input.merchantName)}</h2>
    <span style="font-size: 12px; color: #6b7280;">Conversation ID: ${escapeHtml(convId)} • ${escapeHtml(timestamp)}</span>
  </div>
  <table style="width: 100%; font-size: 13px; margin-bottom: 16px; border-collapse: collapse;">
    <tr><td style="padding: 4px 0; color: #6b7280; width: 120px;">Customer:</td><td style="font-weight: 600; color: #111827;">${escapeHtml(customerName)} &lt;${escapeHtml(email)}&gt;</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Phone:</td><td style="color: #111827;">${escapeHtml(input.phone || "Not provided")}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Order #:</td><td style="color: #111827;">${escapeHtml(input.orderNumber || "Not provided")}</td></tr>
    ${input.ticketRef ? `<tr><td style="padding: 4px 0; color: #6b7280;">Ticket Ref:</td><td style="font-weight: 600; color: #2563eb;">${escapeHtml(input.ticketRef)} (${escapeHtml(input.priority || "normal")})</td></tr>` : ""}
  </table>
  <div style="margin-bottom: 16px;">
    <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">Customer Question:</div>
    <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 14px; color: #1f2937; white-space: pre-wrap;">${escapeHtml(userMessage)}</div>
  </div>
  <div style="margin-bottom: 20px;">
    <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">Agent Response:</div>
    <div style="background-color: #eff6ff; border-left: 3px solid #3b82f6; padding: 12px; border-radius: 4px; font-size: 14px; color: #1e3a8a; white-space: pre-wrap;">${escapeHtml(agentReply)}</div>
  </div>
</div>`;

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Customer Reply / Confirmation Message
    // ─────────────────────────────────────────────────────────────────────────
    const isBn = input.locale === "bn";
    const customerSubject = input.ticketRef
      ? isBn
        ? `[${input.merchantName} সাপোর্ট] আপনার টিকিট গ্রহণ করা হয়েছে: ${input.ticketRef}`
        : `[${input.merchantName} Support] Ticket Created: ${input.ticketRef}`
      : isBn
        ? `[${input.merchantName} সাপোর্ট] আমরা আপনার বার্তা পেয়েছি`
        : `[${input.merchantName} Support] We received your message`;

    const customerGreeting = isBn
      ? `হ্যালো ${customerName},`
      : `Hi ${customerName},`;
    const customerIntro = isBn
      ? `${input.merchantName} সাপোর্টের সাথে যোগাযোগ করার জন্য ধন্যবাদ। নিচে আপনার প্রশ্নের বিবরণ ও আমাদের উত্তর দেওয়া হলো:`
      : `Thank you for contacting ${input.merchantName} support. Here is a summary of your inquiry and our response:`;

    const customerFooter = isBn
      ? `আপনার যদি আরও কোনো প্রশ্ন থাকে, অনুগ্রহ করে এই ইমেইলে রিপ্লাই দিন অথবা আমাদের স্টোর চ্যাটে যোগাযোগ করুন।`
      : `If you have further questions or need additional assistance, simply reply to this email or visit our store support chat.`;

    const customerSignature = isBn
      ? `আন্তরিক শুভেচ্ছা,\n${input.merchantName} সাপোর্ট টিম`
      : `Warm regards,\n${input.merchantName} Support Team`;

    const customerText = [
      customerGreeting,
      "",
      customerIntro,
      "",
      `--- Your Question ---`,
      userMessage,
      "",
      `--- Support Response ---`,
      agentReply,
      "",
      input.ticketRef
        ? isBn
          ? `আপনার টিকিট রেফারেন্স: ${input.ticketRef}`
          : `Ticket Reference: ${input.ticketRef}`
        : null,
      "",
      customerFooter,
      "",
      customerSignature,
    ]
      .filter(Boolean)
      .join("\n");

    const customerHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
  <div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
    <h2 style="margin: 0; color: #111827; font-size: 18px;">${escapeHtml(input.merchantName)}</h2>
  </div>
  <p style="font-size: 14px; color: #374151; margin: 0 0 12px 0;">${escapeHtml(customerGreeting)}</p>
  <p style="font-size: 14px; color: #374151; margin: 0 0 16px 0;">${escapeHtml(customerIntro)}</p>
  <div style="margin-bottom: 16px;">
    <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">${isBn ? "আপনার প্রশ্ন:" : "Your Question:"}</div>
    <div style="background-color: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 14px; color: #1f2937; white-space: pre-wrap;">${escapeHtml(userMessage)}</div>
  </div>
  <div style="margin-bottom: 16px;">
    <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #6b7280; margin-bottom: 4px;">${isBn ? "সাপোর্ট উত্তর:" : "Support Response:"}</div>
    <div style="background-color: #f0fdf4; border-left: 3px solid #22c55e; padding: 12px; border-radius: 4px; font-size: 14px; color: #14532d; white-space: pre-wrap;">${escapeHtml(agentReply)}</div>
  </div>
  ${input.ticketRef ? `<div style="margin-bottom: 16px; padding: 10px; background-color: #eff6ff; border-radius: 6px; font-size: 13px; color: #1e40af;"><strong>${isBn ? "টিকিট রেফারেন্স:" : "Ticket Reference:"}</strong> ${escapeHtml(input.ticketRef)}</div>` : ""}
  <p style="font-size: 13px; color: #6b7280; margin: 16px 0 12px 0;">${escapeHtml(customerFooter)}</p>
  <p style="font-size: 13px; color: #374151; margin: 0; white-space: pre-line;">${escapeHtml(customerSignature)}</p>
</div>`;

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Dispatch Emails Concurrently with Idempotency Keys
    // ─────────────────────────────────────────────────────────────────────────
    const [adminResult, customerResult] = await Promise.all([
      sendMail({
        to: adminEmail,
        subject: adminSubject,
        text: adminText,
        html: adminHtml,
        idempotencyKey: `support:notify:admin:${convId}:${digest}`,
      }).catch((err) => {
        log("warn", "support.admin_mail_failed", {
          error: String((err as Error)?.message ?? err),
          adminEmail,
        });
        return {
          ok: false as const,
          provider: "log" as const,
          retriable: true,
          error: String((err as Error)?.message ?? err),
          status: null,
        };
      }),
      sendMail({
        to: email,
        subject: customerSubject,
        text: customerText,
        html: customerHtml,
        idempotencyKey: `support:notify:customer:${convId}:${digest}`,
      }).catch((err) => {
        log("warn", "support.customer_mail_failed", {
          error: String((err as Error)?.message ?? err),
          customerEmail: email,
        });
        return {
          ok: false as const,
          provider: "log" as const,
          retriable: true,
          error: String((err as Error)?.message ?? err),
          status: null,
        };
      }),
    ]);

    incr("framique_support_mail_dispatched_total", {
      adminOutcome: adminResult.ok ? "ok" : "failed",
      customerOutcome: customerResult.ok ? "ok" : "failed",
    });

    log("info", "support.mail_notifications_dispatched", {
      conversationId: convId,
      adminEmail,
      customerEmail: email,
      adminOk: adminResult.ok,
      customerOk: customerResult.ok,
    });

    return {
      ok: adminResult.ok && customerResult.ok,
      adminResult,
      customerResult,
      adminRecipient: adminEmail,
      customerRecipient: email,
      piiRedacted,
      withheldRules,
    };
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
