import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("../marketing.server");
  return currentMerchantId(db, userId);
}

export const mediaLibraryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listAttachments } = await import("./library.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { items: await listAttachments(context.supabase, merchantId) };
  });

export const mediaUploadAttachmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().min(1).max(200),
        contentType: z.string().min(3).max(120),
        // ~25 MB binary ≈ 34 MB base64; the byte-accurate cap lives server-side.
        base64: z.string().min(1).max(36_000_000),
        width: z.number().int().positive().max(20000).nullable().optional(),
        height: z.number().int().positive().max(20000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { uploadAttachment } = await import("./library.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { item: await uploadAttachment(context.supabase, merchantId, data) };
  });

export const mediaUpdateAttachmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().max(200).optional(),
        altText: z.string().max(300).optional(),
        caption: z.string().max(500).optional(),
        description: z.string().max(2000).optional(),
        fileName: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { updateAttachment } = await import("./library.server");
    const merchantId = await scope(context.supabase, context.userId);
    const { id, ...patch } = data;
    return { item: await updateAttachment(context.supabase, merchantId, id, patch) };
  });

export const mediaDeleteAttachmentsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteAttachments } = await import("./library.server");
    const merchantId = await scope(context.supabase, context.userId);
    return { removed: await deleteAttachments(context.supabase, merchantId, data.ids) };
  });
