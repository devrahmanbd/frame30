import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const mediaListFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listMedia } = await import("./media.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { items: await listMedia(merchantId) };
  });

export const mediaUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        contentType: z.string().min(3).max(100),
        // ~5 MB binary ≈ 6.9 MB base64; the byte-accurate cap lives server-side.
        base64: z.string().min(1).max(7_500_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { uploadMedia } = await import("./media.server");
    const merchantId = await scope(context.supabase, context.userId);
    // The client is passed so the storage quota is enforced under the caller's
    // own RLS scope before a single byte is written.
    return {
      item: await uploadMedia(merchantId, data.name, data.contentType, data.base64, context.supabase),
    };
  });

export const mediaDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteMedia } = await import("./media.server");
    const { invalidateEntitlements } = await import("./entitlements.server");
    const merchantId = await scope(context.supabase, context.userId);
    await deleteMedia(merchantId, data.path);
    // Freeing bytes must be visible immediately, or a merchant who just cleaned
    // up would still be told they are over quota for the next 15 seconds.
    invalidateEntitlements(merchantId);
    return { ok: true as const };
  });
