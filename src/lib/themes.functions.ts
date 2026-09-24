import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requirePermission } from "./authz-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const themeId = z.string().uuid();
const tree: z.ZodType<unknown> = z.custom<unknown>(() => true);

export const builderWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("themes.read")])
  .validator((d?: { previewThemeId?: string }) => d)
  .handler(async ({ data, context }) => {
    const { loadWorkspace } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return loadWorkspace(context.supabase, merchantId, data?.previewThemeId);
  });

export const builderAutosaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        themeId,
        templates: tree,
        tokens: tree,
        revision: z.number().int().min(0).max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { autosave } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return autosave(context.supabase, merchantId, data);
  });

export const builderCommitFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        themeId,
        templates: tree,
        tokens: tree,
        note: z.string().max(160).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { commitVersion } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return commitVersion(context.supabase, merchantId, data);
  });

export const builderPublishFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.publish")])
  .inputValidator((d: unknown) =>
    z
      .object({
        themeId,
        templates: tree,
        tokens: tree,
        note: z.string().max(160).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { publishVersion } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return publishVersion(context.supabase, merchantId, data);
  });

export const builderRollbackFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ versionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rollbackVersion } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return rollbackVersion(context.supabase, merchantId, data.versionId);
  });

export const builderScheduleFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
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
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ scheduleId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { cancelSchedule } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return cancelSchedule(context.supabase, merchantId, data.scheduleId);
  });

export const builderRegistryFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("themes.read")])
  .handler(async ({ context }) => {
    const { listRegistry } = await import("./themes.server");
    return listRegistry(context.supabase);
  });

export const builderInstallFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        key: z.string().max(60),
        overwriteDraft: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // P0 separation: installs create a NEW INACTIVE theme row, never mutate
    // the active theme's draft. The catalogue path owns that contract
    // (inactive row + version + draft + ledger + audit, idempotent replay),
    // so the builder endpoint delegates to it. overwriteDraft is accepted
    // for compatibility and ignored: re-installs replay instead of throwing.
    const { installCatalogTheme } = await import("./themes/appearance.server");
    const merchantId = await scope(context.supabase, context.userId);
    return installCatalogTheme(
      context.supabase,
      merchantId,
      data.key,
      context.userId,
    );
  });

export const builderPresetSwapFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().max(60), templates: tree }).parse(d),
  )
  .handler(async () => {
    const { BuilderError } = await import("./themes.server");
    throw new BuilderError(
      "builder.registry_removed",
      "Theme presets were removed",
    );
  });

export const builderUpdatePreviewFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.read")])
  .inputValidator((d: unknown) =>
    z.object({ key: z.string().max(60).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { previewThemeUpdate } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return previewThemeUpdate(context.supabase, merchantId, data.key);
  });

export const builderUpdateApplyFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
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
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeKey: z.string().min(1).max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importDemoContent } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importDemoContent(context.supabase, merchantId, data.themeKey);
  });

/* --------------------------------------------- Phase 15: granular imports */

const importThemeKey = z.string().min(1).max(64);
const importOverwrite = z.boolean().optional();

export const importPreflightFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeKey: importThemeKey }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importPreflight } = await import("./theme-imports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importPreflight(context.supabase, merchantId, data.themeKey);
  });

export const importThemeSlidesFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeKey: importThemeKey }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importThemeSlides } = await import("./theme-imports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importThemeSlides(context.supabase, merchantId, data.themeKey);
  });

export const importThemeMediaFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeKey: importThemeKey, overwrite: importOverwrite }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importThemeMedia } = await import("./theme-imports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importThemeMedia(context.supabase, merchantId, data.themeKey, data.overwrite ?? false);
  });

export const importThemeProductsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeKey: importThemeKey, overwrite: importOverwrite }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importThemeProducts } = await import("./theme-imports.server");
    const { demoCatalogFor } = await import("./demo-catalog");
    const merchantId = await scope(context.supabase, context.userId);
    const catalog = demoCatalogFor(data.themeKey);
    return importThemeProducts(
      context.supabase,
      merchantId,
      data.themeKey,
      catalog as unknown as Record<string, unknown>,
      data.overwrite ?? false,
    );
  });

export const importThemePostsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeKey: importThemeKey, overwrite: importOverwrite }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importThemePosts } = await import("./theme-imports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importThemePosts(context.supabase, merchantId, data.themeKey, data.overwrite ?? false);
  });

export const importThemeAllFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeKey: importThemeKey, overwrite: importOverwrite }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { importThemeAll } = await import("./theme-imports.server");
    const merchantId = await scope(context.supabase, context.userId);
    return importThemeAll(context.supabase, merchantId, data.themeKey, data.overwrite ?? false);
  });

export const builderDemoPurgeFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .handler(async ({ context }) => {
    const { purgeDemoContent } = await import("./themes.server");
    const merchantId = await scope(context.supabase, context.userId);
    return purgeDemoContent(context.supabase, merchantId);
  });

/** Registry compatibility descriptor for the studio's theme list. */
export const builderRegistryVersionFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const { registryVersionInfo } = await import("./registry-version");
  return registryVersionInfo();
});
