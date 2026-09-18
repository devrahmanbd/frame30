import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Client = SupabaseClient<Database>;

async function scope(db: Client, userId: string): Promise<string> {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const dripStepSchema = z.object({
  id: z.string().optional(),
  delayDays: z.number().int().min(0),
  delayHours: z.number().int().min(0).max(23),
  subject: z.string().trim().min(1, "Subject is required"),
  bodyTemplate: z.string().trim().min(1, "Body template is required"),
  ctaText: z.string().trim().optional(),
  ctaUrl: z.string().trim().optional(),
});

export const listDripSequencesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { listDripSequences } = await import("./drip-sequences.server");
    return listDripSequences(context.supabase, merchantId);
  });

export const getDripSequenceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sequenceId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { getDripSequence } = await import("./drip-sequences.server");
    return getDripSequence(context.supabase, merchantId, data.sequenceId);
  });

export const saveDripSequenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().optional(),
        name: z.string().trim().min(1, "Sequence name is required"),
        description: z.string().trim().optional(),
        trigger: z.enum(["new_subscriber", "manual_enroll", "cold_outreach"]),
        status: z.enum(["active", "paused", "draft"]).optional(),
        steps: z.array(dripStepSchema).min(1, "At least one step is required"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { saveDripSequence } = await import("./drip-sequences.server");
    return saveDripSequence(context.supabase, merchantId, data);
  });

export const toggleDripSequenceStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sequenceId: z.string(),
        status: z.enum(["active", "paused", "draft"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { toggleDripSequenceStatus } =
      await import("./drip-sequences.server");
    return toggleDripSequenceStatus(
      context.supabase,
      merchantId,
      data.sequenceId,
      data.status,
    );
  });

export const deleteDripSequenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sequenceId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { deleteDripSequence } = await import("./drip-sequences.server");
    return deleteDripSequence(context.supabase, merchantId, data.sequenceId);
  });

export const enrollContactsInSequenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sequenceId: z.string(),
        contacts: z
          .array(
            z.object({
              email: z.string().trim().email(),
              name: z.string().trim().optional(),
            }),
          )
          .min(1, "At least one contact is required"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { enrollContactsInSequence } =
      await import("./drip-sequences.server");
    return enrollContactsInSequence(
      context.supabase,
      merchantId,
      data.sequenceId,
      data.contacts,
    );
  });

export const processDueDripStepsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { processDueDripSteps } = await import("./drip-sequences.server");
    return processDueDripSteps(context.supabase, merchantId);
  });

export const triggerDripStepTestFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sequenceId: z.string(),
        stepNumber: z.number().int().min(1),
        testEmail: z.string().trim().email(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await scope(context.supabase, context.userId);
    const { sendTestDripStep } = await import("./drip-sequences.server");
    return sendTestDripStep(
      context.supabase,
      merchantId,
      data.sequenceId,
      data.stepNumber,
      data.testEmail,
    );
  });
