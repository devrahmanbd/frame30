/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const priority = z.enum(["low", "normal", "high", "urgent"]);

async function merchantOf(context: { supabase: unknown; userId: string }) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(context.supabase as never, context.userId);
}

/** Public storefront turn. Never throws: an outage degrades to a human hand-off. */
export const askSupportFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        message: z.string().trim().min(1).max(1000),
        conversationId: z.string().uuid().nullable().optional(),
        orderNumber: z.string().trim().max(40).nullable().optional(),
        phone: z.string().trim().max(30).nullable().optional(),
        locale: z.enum(["bn", "en"]).optional(),
        takeoverMode: z.enum(["ai", "human_takeover"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { askSupport, degradedAnswer } = await import("./support-agent.server");
    try {
      return await askSupport(data);
    } catch (err) {
      return degradedAnswer(data.conversationId ?? null, err);
    }
  });

/**
 * Customer storefront chat message sender (Phase 12.5).
 * Honors human_takeover suppression middleware and forwards to runSupportAgentTurn / askSupport.
 */
export const customerSendChatMessageFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        message: z.string().trim().min(1).max(1000),
        conversationId: z.string().uuid().nullable().optional(),
        orderNumber: z.string().trim().max(40).nullable().optional(),
        phone: z.string().trim().max(30).nullable().optional(),
        locale: z.enum(["bn", "en"]).optional(),
        takeoverMode: z.enum(["ai", "human_takeover"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { runSupportAgentTurn, degradedAnswer } = await import("./support-agent.server");
    try {
      return await runSupportAgentTurn(data);
    } catch (err) {
      return degradedAnswer(data.conversationId ?? null, err);
    }
  });

/** Best-effort CSAT from the storefront widget with optional review text. Never throws. */
export const rateSupportFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        review: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { rateConversation } = await import("./support-agent.server");
    try {
      return await rateConversation(data.conversationId, data.rating, data.review);
    } catch {
      return { ok: false, rating: data.rating, review: data.review ?? null } as const;
    }
  });

/** Fetch merchant CSAT metrics and reviews for Admin Desk analytics. */
export const getCsatAnalyticsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await merchantOf(context);
    const { getCsatAnalytics } = await import("./ai-training-data.server");
    return getCsatAnalytics(merchantId);
  });


export const supportDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await merchantOf(context);
    const [{ listTickets }, { listDocs }, { listChannels }] = await Promise.all([
      import("./support-tickets.server"),
      import("./support-kb.server"),
      import("./support-channels.server"),
    ]);
    const [tickets, docs, channels] = await Promise.all([
      listTickets(context.supabase, merchantId),
      listDocs(context.supabase, merchantId),
      listChannels(context.supabase, merchantId),
    ]);
    const db = context.supabase as unknown as import("@supabase/supabase-js").SupabaseClient<any, any, any>;
    const { data: policies } = await db
      .from("support_sla_policies")
      .select("priority, first_response_minutes, resolution_minutes")
      .eq("merchant_id", merchantId);
    return {
      merchantId,
      ...tickets,
      docs,
      channels,
      policies: (policies ?? []) as {
        priority: string;
        first_response_minutes: number;
        resolution_minutes: number;
      }[],
    };
  });

export const supportTicketEventsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { ticketEvents } = await import("./support-tickets.server");
    const merchantId = await merchantOf(context);
    return ticketEvents(context.supabase, merchantId, data.ticketId);
  });

export const supportTicketUpdateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ticketId: z.string().uuid(),
        status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
        priority: priority.optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        note: z.string().trim().max(500).optional(),
        firstResponse: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { updateTicket } = await import("./support-tickets.server");
    const merchantId = await merchantOf(context);
    return updateTicket(context.supabase, merchantId, context.userId, data);
  });

export const supportTicketCreateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        subject: z.string().trim().min(3).max(180),
        body: z.string().trim().max(4000).optional(),
        priority: priority.optional(),
        orderNumber: z.string().trim().max(40).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createTicket } = await import("./support-tickets.server");
    const merchantId = await merchantOf(context);
    return createTicket({
      merchantId,
      subject: data.subject,
      ...(data.body !== undefined ? { body: data.body } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      channel: "admin",
      orderNumber: data.orderNumber ?? null,
      actorId: context.userId,
      reason: "support.manual_ticket",
    });
  });

export const supportSlaSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        priority,
        first_response_minutes: z.number().int().min(5).max(10_080),
        resolution_minutes: z.number().int().min(15).max(43_200),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveSlaPolicy } = await import("./support-tickets.server");
    const merchantId = await merchantOf(context);
    return saveSlaPolicy(context.supabase, merchantId, context.userId, data);
  });

export const supportKbSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        title: z.string().trim().min(3).max(200),
        body: z.string().trim().min(10).max(20_000),
        locale: z.enum(["bn", "en"]),
        status: z.enum(["draft", "published"]),
        tags: z.array(z.string().trim().max(30)).max(12).default([]),
        sourceUrl: z.string().url().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveDoc } = await import("./support-kb.server");
    const merchantId = await merchantOf(context);
    return saveDoc(context.supabase, merchantId, context.userId, data);
  });

export const supportKbDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ docId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteDoc } = await import("./support-kb.server");
    const merchantId = await merchantOf(context);
    return deleteDoc(context.supabase, merchantId, context.userId, data.docId);
  });

export const supportChannelSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullable().optional(),
        channel: z.enum(["whatsapp", "messenger"]),
        displayName: z.string().trim().min(2).max(80),
        externalId: z.string().trim().min(3).max(120),
        enabled: z.boolean(),
        secret: z.string().trim().min(8).max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveChannel } = await import("./support-channels.server");
    const merchantId = await merchantOf(context);
    return saveChannel(context.supabase, merchantId, context.userId, data);
  });

/** Guardrail + tool-call audit feed for the admin trust panel. */
export const supportAuditFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await merchantOf(context);
    const [{ data: guardrails }, { data: tools }] = await Promise.all([
      (context.supabase as any)
        .from("ai_guardrail_events")
        .select("id, kind, rule, action, created_at")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(50),
      (context.supabase as any)
        .from("ai_tool_calls")
        .select("id, tool, source_table, ok, latency_ms, error_code, created_at")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { guardrails: guardrails ?? [], tools: tools ?? [] };
  });

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.3: In-Chat Automatic & Interactive Support Ticket Creation Tool
// ─────────────────────────────────────────────────────────────────────────────

const widgetTicketSchema = z.object({
  slug: z.string().min(1).max(80),
  conversationId: z.string().uuid().nullable().optional(),
  subject: z.string().trim().min(3).max(180),
  body: z.string().trim().max(4000).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  orderNumber: z.string().trim().max(40).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

/**
 * Storefront widget ticket creation tool (unauthenticated, public).
 *
 * Called by the action agent when:
 *  (a) ≥ 2 consecutive low-confidence turns.
 *  (b) Refund/dispute intent detected.
 *  (c) Customer says "open a ticket" or "contact support".
 *  (d) Customer clicks the in-chat "Create Ticket" CTA.
 *
 * Rate-limited per slug+phone and returns a structured ticket card payload.
 */
export const createSupportTicketWidgetFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => widgetTicketSchema.parse(d))
  .handler(async ({ data }) => {
    const { createTicket } = await import("./support-tickets.server");
    const { enforceRateLimit } = await import("./rate-limit.server");

    // Resolve merchant by storefront slug
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: merchant, error: merchantErr } = await supabaseAdmin
      .from("merchants")
      .select("id, name")
      .eq("slug", data.slug)
      .maybeSingle();

    if (merchantErr || !merchant) {
      return {
        ok: false as const,
        error: "store_not_found",
        reply: "I'm sorry, I couldn't find your store. Please contact us directly.",
      };
    }

    // Rate-limit by merchant + optional phone hash
    const rateKey = data.phone
      ? `${merchant.id}:${Buffer.from(data.phone).toString("base64").slice(0, 12)}`
      : `${merchant.id}:anon`;
    await enforceRateLimit("support.ticket_widget", rateKey);

    const priority = data.priority ?? "normal";

    try {
      const ticket = await createTicket({
        merchantId: merchant.id,
        subject: data.subject,
        body: data.body,
        priority,
        channel: "widget",
        conversationId: data.conversationId ?? null,
        orderNumber: data.orderNumber ?? null,
        requesterHash: data.phone
          ? Buffer.from(data.phone).toString("base64").slice(0, 24)
          : null,
        reason: "support.agent_escalation",
      });

      const ticketRef = `#TKT-${ticket.id.slice(-8).toUpperCase()}`;
      const slaMsg = `Your ticket **${ticketRef}** has been created with **${priority}** priority. Our team will respond within the SLA window. Status: ${ticket.status}.`;

      return {
        ok: true as const,
        ticketId: ticket.id,
        ticketRef,
        subject: ticket.subject,
        priority: ticket.priority,
        status: ticket.status,
        firstResponseDueAt: ticket.first_response_due_at,
        conversationId: data.conversationId ?? null,
        agentMessage: slaMsg,
        agentMessageBn: `আপনার সাপোর্ট টিকিট **${ticketRef}** সফলভাবে তৈরি হয়েছে (অগ্রাধিকার: **${priority}**)। আমাদের দল শীঘ্রই যোগাযোগ করবে।`,
      };
    } catch {
      return {
        ok: false as const,
        error: "ticket_create_failed",
        reply: "I was unable to create your support ticket. Please try again or contact us directly.",
      };
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9.4: In-Chat Callback Request Form Tool
// ─────────────────────────────────────────────────────────────────────────────

const callbackSchema = z.object({
  slug: z.string().min(1).max(80),
  conversationId: z.string().uuid().nullable().optional(),
  customerName: z.string().trim().min(1).max(100),
  phone: z
    .string()
    .trim()
    .regex(
      /^(?:\+8801|01|8801)[3-9]\d{8}$/,
      "Must be a valid Bangladeshi mobile number (01XXXXXXXXX or +8801XXXXXXXXX)",
    ),
  preferredWindow: z.enum(["morning", "afternoon", "evening"]),
  note: z.string().trim().max(500).nullable().optional(),
});

/**
 * Storefront widget callback request tool (unauthenticated, public).
 *
 * Called by the agent when the customer asks for a phone call or
 * explicit high-touch assistance. Validates Bangladesh phone format,
 * persists to support_callbacks, and returns an agent acknowledgement card.
 */
export const requestCallbackFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => callbackSchema.parse(d))
  .handler(async ({ data }) => {
    const { createCallback, validateBdPhone } = await import("./support-callbacks.server");

    // Validate phone before hitting DB
    const phoneCheck = validateBdPhone(data.phone);
    if (!phoneCheck.valid) {
      return {
        ok: false as const,
        error: "invalid_phone",
        reply: "The phone number is not a valid Bangladeshi mobile number. Please use 01XXXXXXXXX format.",
      };
    }

    // Resolve merchant by slug
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: merchant, error: merchantErr } = await supabaseAdmin
      .from("merchants")
      .select("id, name")
      .eq("slug", data.slug)
      .maybeSingle();

    if (merchantErr || !merchant) {
      return {
        ok: false as const,
        error: "store_not_found",
        reply: "I'm sorry, I couldn't find your store. Please contact us directly.",
      };
    }

    try {
      const callback = await createCallback({
        merchantId: merchant.id,
        conversationId: data.conversationId ?? null,
        customerName: data.customerName,
        phone: data.phone,
        preferredWindow: data.preferredWindow,
        note: data.note ?? null,
        channel: "widget",
      });

      return {
        ok: true as const,
        callbackId: callback.id,
        callbackRef: `#CB-${callback.id.slice(-6).toUpperCase()}`,
        customerName: callback.customerName,
        phoneE164: callback.phoneE164,
        window: callback.window,
        windowDescription: callback.windowDescription,
        agentMessage: callback.agentMessage,
        agentMessageBn: callback.agentMessageBn,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      if (msg.includes("invalid_phone") || msg.includes("invalid_bd_mobile")) {
        return {
          ok: false as const,
          error: "invalid_phone",
          reply: "The phone number is not a valid Bangladeshi mobile number. Please use 01XXXXXXXXX format.",
        };
      }
      return {
        ok: false as const,
        error: "callback_failed",
        reply: "I was unable to schedule the callback. Please try again shortly.",
      };
    }
  });

/** Admin: list callback queue for merchant support desk. */
export const listCallbacksFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await merchantOf(context);
    const { listCallbacks } = await import("./support-callbacks.server");
    return listCallbacks(merchantId);
  });

/** Admin: update callback status after contact attempt. */
export const updateCallbackStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        callbackId: z.string().min(1),
        status: z.enum(["contacted", "failed", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await merchantOf(context);
    const { updateCallbackStatus } = await import("./support-callbacks.server");
    return updateCallbackStatus(merchantId, data.callbackId, data.status);
  });

