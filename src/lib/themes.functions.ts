import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const themeId = z.string().uuid();
const tree: z.ZodType<unknown> = z.custom<unknown>(() => true);

export const builderWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadWorkspace } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return loadWorkspace(context.supabase, merchantId);
  });

export const builderAutosaveFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ themeId, templates: tree, tokens: tree, revision: z.number().int().min(0).max(1_000_000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { autosave } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return autosave(context.supabase, merchantId, data);
  });

export const builderCommitFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ themeId, templates: tree, tokens: tree, note: z.string().max(160).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { commitVersion } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return commitVersion(context.supabase, merchantId, data);
  });

export const builderPublishFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ themeId, templates: tree, tokens: tree, note: z.string().max(160).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { publishVersion } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return publishVersion(context.supabase, merchantId, data);
  });

export const builderRollbackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ versionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { rollbackVersion } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return rollbackVersion(context.supabase, merchantId, data.versionId);
  });

export const builderScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        themeId,
        versionId: z.string().uuid().nullable(),
        action: z.enum(["publish", "unpublish"]),
        runAt: z.string().datetime(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { scheduleTheme } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return scheduleTheme(context.supabase, merchantId, data);
  });

export const builderCancelScheduleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scheduleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { cancelSchedule } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return cancelSchedule(context.supabase, merchantId, data.scheduleId);
  });

export const builderRegistryFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listRegistry } = await import("./themes.server");
    return listRegistry(context.supabase);
  });

export const builderInstallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().max(60), overwriteDraft: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { installRegistryTheme } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return installRegistryTheme(context.supabase, merchantId, data.key, data.overwriteDraft ?? false);
  });

export const builderPresetSwapFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().max(60), templates: tree }).parse(d))
  .handler(async ({ data, context }) => {
    const { previewPresetSwap } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return previewPresetSwap(context.supabase, merchantId, data.key, data.templates);
  });

export const builderUpdatePreviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().max(60).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { previewThemeUpdate } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return previewThemeUpdate(context.supabase, merchantId, data.key);
  });

export const builderUpdateApplyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.string().max(60),
        mode: z.enum(["adopt", "keep_mine"]),
        expectedRevision: z.number().int().min(0).max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { applyThemeUpdate } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return applyThemeUpdate(context.supabase, merchantId, data);
  });

/* --------------------------------------------- Phase 8: demo content + versions */

export const builderDemoImportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ themeKey: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data, context }) => {
    const { importDemoContent } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importDemoContent(context.supabase, merchantId, data.themeKey);
  });

export const builderDemoPurgeFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { purgeDemoContent } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return purgeDemoContent(context.supabase, merchantId);
  });

/** Registry compatibility descriptor for the studio's theme list. */
export const builderRegistryVersionFn = createServerFn({ method: "GET" }).handler(async () => {
  const { registryVersionInfo } = await import("./registry-version");
  return registryVersionInfo();
});
