import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

export const listFontAssetsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listFontAssets } = await import("./theme-fonts.server");
    return listFontAssets(context.supabase, await scope(context.supabase, context.userId));
  });

export const uploadFontAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        family: z.string().min(2).max(40),
        weight: z.number().int().min(100).max(900),
        subset: z.enum(["latin", "bengali"]),
        base64: z.string().min(16).max(1_400_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { uploadFontAsset } = await import("./theme-fonts.server");
    return uploadFontAsset(context.supabase, await scope(context.supabase, context.userId), data);
  });

export const confirmFontLicenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { confirmFontLicence } = await import("./theme-fonts.server");
    return confirmFontLicence(context.supabase, await scope(context.supabase, context.userId), data);
  });

export const deleteFontAssetFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteFontAsset } = await import("./theme-fonts.server");
    await deleteFontAsset(context.supabase, await scope(context.supabase, context.userId), data.id);
    return { ok: true };
  });
