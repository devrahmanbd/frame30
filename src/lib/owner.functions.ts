import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ownerTrialsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadTrials } = await import("./owner.server");
    return loadTrials(context.supabase, context.userId);
  });

export const ownerCouponsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadCoupons } = await import("./owner.server");
    return loadCoupons(context.supabase, context.userId);
  });

export const ownerMarketingFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadMarketing } = await import("./owner.server");
    return loadMarketing(context.supabase, context.userId);
  });

export const ownerFraudFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadFraud } = await import("./owner.server");
    return loadFraud(context.supabase, context.userId);
  });

export const ownerAiFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadAi } = await import("./owner.server");
    return loadAi(context.supabase, context.userId);
  });

// ──────────────────────────────────────────────
// Phase 12.2 — Moderation Console Server Fns
// ──────────────────────────────────────────────

export const ownerGetConversationMessagesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { loadAiConversationMessages } = await import("./owner.server");
    return loadAiConversationMessages(context.supabase, context.userId, data.conversationId);
  });

export const ownerSendAgentMessageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        merchantId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        isInternalNote: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerSendAgentMessage } = await import("./owner.server");
    return ownerSendAgentMessage(
      context.supabase,
      context.userId,
      data.conversationId,
      data.merchantId,
      data.body,
      data.isInternalNote ?? false,
    );
  });

export const ownerSetTakeoverModeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        mode: z.enum(["ai", "human_takeover"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerSetTakeoverMode } = await import("./owner.server");
    return ownerSetTakeoverMode(context.supabase, context.userId, data.conversationId, data.mode);
  });

export const ownerUpdateConversationStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        status: z.enum(["open", "in_progress", "resolved", "closed"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerUpdateConversationStatus } = await import("./owner.server");
    return ownerUpdateConversationStatus(
      context.supabase,
      context.userId,
      data.conversationId,
      data.status,
    );
  });

export const ownerSetConversationPriorityFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        priority: z.enum(["low", "normal", "high", "urgent"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerSetConversationPriority } = await import("./owner.server");
    return ownerSetConversationPriority(
      context.supabase,
      context.userId,
      data.conversationId,
      data.priority,
    );
  });

export const ownerSaveOperatorNotesFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        notes: z.string().max(10000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerSaveOperatorNotes } = await import("./owner.server");
    return ownerSaveOperatorNotes(
      context.supabase,
      context.userId,
      data.conversationId,
      data.notes,
    );
  });

export const ownerExportConversationTranscriptFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        format: z.enum(["markdown", "jsonl", "csv"]),
        options: z
          .object({
            redactPii: z.boolean().optional(),
            includeInternalNotes: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ownerExportConversationTranscript } = await import("./owner.server");
    return ownerExportConversationTranscript(
      context.supabase,
      context.userId,
      data.conversationId,
      data.format,
      data.options,
    );
  });



export const ownerRosterFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadOwners } = await import("./owner.server");
    return loadOwners(context.supabase, context.userId);
  });

export const ownerSettingsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadOwnerSettings } = await import("./owner.server");
    return loadOwnerSettings(context.supabase, context.userId);
  });

export const ownerSetFlagFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.string().min(1).max(64),
        value: z.union([z.boolean(), z.number().int().min(0).max(36500)]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setFlag } = await import("./owner.server");
    return setFlag(context.supabase, context.userId, data.key, data.value);
  });

// ------------------------------------------------------------------ §2.7 desk

export const ownerAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.string().max(40).nullable().optional(),
        action: z.string().max(60).nullable().optional(),
        entityId: z.string().max(80).nullable().optional(),
        page: z.number().int().min(1).max(500).optional(),
        pageSize: z.number().int().min(5).max(100).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadOwnerAudit } = await import("./owner-ops.server");
    return loadOwnerAudit(context.supabase, context.userId, data);
  });

export const ownerRevenueFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadRevenue } = await import("./owner-ops.server");
    return loadRevenue(context.supabase, context.userId);
  });

export const ownerSuspensionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSuspensions } = await import("./owner-ops.server");
    return loadSuspensions(context.supabase, context.userId);
  });

export const ownerSuspendFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: z.string().uuid(),
        reason: z.string().trim().min(8).max(500),
        freezePayments: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { suspendMerchant } = await import("./owner-ops.server");
    return suspendMerchant(
      context.supabase,
      context.userId,
      data.merchantId,
      data.reason,
      data.freezePayments,
    );
  });

export const ownerReinstateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: z.string().uuid(),
        note: z.string().trim().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { reinstateMerchant } = await import("./owner-ops.server");
    return reinstateMerchant(context.supabase, context.userId, data.merchantId, data.note ?? null);
  });

export const ownerImpersonationFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadImpersonation } = await import("./owner-ops.server");
    return loadImpersonation(context.supabase, context.userId);
  });

export const ownerImpersonateRequestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: z.string().uuid(),
        reason: z.string().trim().min(8).max(500),
        scope: z.enum(["read", "write"]),
        minutes: z.number().int().min(5).max(240),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { requestImpersonation } = await import("./owner-ops.server");
    return requestImpersonation(context.supabase, context.userId, data);
  });

export const ownerImpersonateRevokeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ grantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { revokeImpersonation } = await import("./owner-ops.server");
    return revokeImpersonation(context.supabase, context.userId, data.grantId);
  });

export const ownerImpersonateUseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ grantId: z.string().uuid(), action: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { useImpersonation } = await import("./owner-ops.server");
    return useImpersonation(context.supabase, context.userId, data.grantId, data.action);
  });

/** Merchant side: the tenant sees and answers every impersonation request. */
export const merchantImpersonationQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ merchantId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { merchantConsentQueue } = await import("./owner-ops.server");
    return merchantConsentQueue(context.supabase, data.merchantId);
  });

export const merchantImpersonationRespondFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ grantId: z.string().uuid(), approve: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { respondToImpersonation } = await import("./owner-ops.server");
    return respondToImpersonation(context.supabase, data.grantId, data.approve);
  });

/** Platform traffic: visitors, clicks and geography across every store. */
export const ownerTrafficFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ days: z.number().int().min(1).max(90).default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { ownerGate } = await import("./owner-ops.server");
    const { loadPlatformTraffic } = await import("./analytics-warehouse.server");
    return ownerGate(
      context.supabase,
      context.userId,
      { action: "traffic.read", entity: "analytics_geo_daily", kind: "read", bucket: "owner.read" },
      () => loadPlatformTraffic(data.days),
    );
  });
