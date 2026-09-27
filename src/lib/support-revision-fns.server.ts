/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DisplayReview } from "./support-revision-review.server";
import type { RevisionScore } from "./support-revision.server";

const reviewStatus = z.enum(["pending", "approved", "rejected", "applied"]);

async function merchantOf(context: { supabase: unknown; userId: string }) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(context.supabase as never, context.userId);
}

/** Serializable queue row: `score_json` without the `Record<string, unknown>` index. */
export type RevisionReviewDto = Omit<DisplayReview, "score_json"> & {
  score_json: RevisionScore;
};

function toDto(row: DisplayReview): RevisionReviewDto {
  return {
    ...row,
    score_json: JSON.parse(
      JSON.stringify(row.score_json),
    ) as RevisionScore,
  };
}

/** Merchant revision-review queue (PII-redacted display rows). */
export const listRevisionReviewsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ status: reviewStatus.or(z.literal("all")).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<RevisionReviewDto[]> => {
    const merchantId = await merchantOf(context);
    const { listRevisionReviews } = await import(
      "./support-revision-review.server"
    );
    const rows = await listRevisionReviews(
      merchantId,
      (data.status ?? "all") as
        | "pending"
        | "approved"
        | "rejected"
        | "applied"
        | "all",
      context.supabase as any,
    );
    return rows.map(toDto);
  });

/** Approve a pending revision, optionally with an operator-edited reply. */
export const approveRevisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1).max(120),
        editedReply: z.string().trim().max(4000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await merchantOf(context);
    const { approveRevision } = await import(
      "./support-revision-review.server"
    );
    return approveRevision(data.id, context.userId, data.editedReply ?? null, {
      merchantId,
      db: context.supabase as any,
    });
  });

/** Reject a pending revision with an optional reason. */
export const rejectRevisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1).max(120),
        reason: z.string().trim().max(300).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await merchantOf(context);
    const { rejectRevision } = await import(
      "./support-revision-review.server"
    );
    return rejectRevision(data.id, context.userId, data.reason ?? null, {
      merchantId,
      db: context.supabase as any,
    });
  });

/**
 * Apply an approved revision: routes to exactly one of `kb_published`
 * (factual/policy change) or `dpo_pair` (style-only change).
 */
export const applyRevisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const merchantId = await merchantOf(context);
    const { applyApproved } = await import(
      "./support-revision-review.server"
    );
    return applyApproved(data.id, {
      merchantId,
      db: context.supabase as any,
    });
  });
