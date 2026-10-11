import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requirePermission } from "@/lib/authz-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("@/lib/marketing.server");
  return currentMerchantId(db, userId);
}

/**
 * Threat-defense — merchant approval queue (read-only).
 *
 * Returns `pendingApprovals` for the caller's merchant: flagged theme
 * drafts + flagged installed plugin manifests with no matching approval
 * audit. The queue spans two desks, so it sits behind BOTH read gates
 * (fail closed for a role missing either). Approvals themselves go through
 * the existing theme/plugin approve fns — this fn never writes.
 */
export const approvalQueueFn = createServerFn({ method: "GET" })
  .middleware([
    requirePermission("themes.read"),
    requirePermission("plugins.read"),
  ])
  .handler(async ({ context }) => {
    const { pendingApprovals } = await import("./approval-queue.server");
    return pendingApprovals(
      context.supabase,
      await scope(context.supabase, context.userId),
    );
  });
