import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("@/lib/marketing.server");
  return currentMerchantId(db, userId);
}

const kind = z.enum(["css", "tokens", "image", "font"]);

export const themeAssetsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listThemeAssets } = await import("./assets.server");
    return listThemeAssets(context.supabase, await scope(context.supabase, context.userId));
  });

export const themeAssetSaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().nullish(),
        themeId: z.string().uuid().nullish(),
        kind,
        name: z.string().min(1).max(80),
        content: z.string().max(200_000).nullish(),
        url: z.string().max(500).nullish(),
        enabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveThemeAsset } = await import("./assets.server");
    return saveThemeAsset(context.supabase, await scope(context.supabase, context.userId), {
      id: data.id ?? null,
      themeId: data.themeId ?? null,
      kind: data.kind,
      name: data.name,
      content: data.content ?? null,
      url: data.url ?? null,
      enabled: data.enabled,
    });
  });

export const themeAssetToggleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { toggleThemeAsset } = await import("./assets.server");
    return toggleThemeAsset(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.id,
      data.enabled,
    );
  });

export const themeAssetDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteThemeAsset } = await import("./assets.server");
    return deleteThemeAsset(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.id,
    );
  });
