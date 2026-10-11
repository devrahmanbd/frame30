import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requirePermission } from "@/lib/authz-middleware";
import { OFFICIAL_THEME_KEYS } from "@/lib/themes/appearance";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("@/lib/marketing.server");
  return currentMerchantId(db, userId);
}

const themeId = z.string().uuid();
const themeKey = z.string().min(1).max(64);

export const themesWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("themes.read")])
  .handler(async ({ context }) => {
    const { loadThemesWorkspace } = await import("./appearance.server");
    return loadThemesWorkspace(
      context.supabase,
      await scope(context.supabase, context.userId),
    );
  });

export const themeInstallFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) => z.object({ key: themeKey }).parse(d))
  .handler(async ({ data, context }) => {
    const { installCatalogTheme, installOfficialTheme } = await import(
      "./appearance.server"
    );
    // Frame30: official keys initialize from the built-in source registry
    // (via installOfficialTheme); community keys install from DB rows.
    // Either way the merchant's records are created tenant-scoped.
    if ((OFFICIAL_THEME_KEYS as readonly string[]).includes(data.key)) {
      return installOfficialTheme(
        context.supabase,
        await scope(context.supabase, context.userId),
        data.key,
        context.userId,
      );
    }
    return installCatalogTheme(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.key,
      context.userId,
    );
  });

export const themeActivateFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) => z.object({ id: themeId }).parse(d))
  .handler(async ({ data, context }) => {
    const { activateTheme } = await import("./appearance.server");
    return activateTheme(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.id,
      context.userId,
    );
  });

export const themeDeleteFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) => z.object({ id: themeId }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteTheme } = await import("./appearance.server");
    return deleteTheme(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.id,
      context.userId,
    );
  });

export const themeFlagsFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: themeId,
        autoUpdate: z.boolean().optional(),
        favourite: z.boolean().optional(),
        name: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setThemeFlags } = await import("./appearance.server");
    const { id, ...patch } = data;
    return setThemeFlags(
      context.supabase,
      await scope(context.supabase, context.userId),
      id,
      patch,
    );
  });

export const themeCatalogFavouriteFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ key: themeKey, favourite: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setCatalogFavourite } = await import("./appearance.server");
    return setCatalogFavourite(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.key,
      data.favourite,
    );
  });

export const themeApproveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ themeId, versionId: themeId }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { approveThemeVersion } = await import("./appearance.server");
    // Rethrown as-is: ThemeDeskError carries `.code` for ownership/version
    // refusals and must survive to the caller unwrapped.
    return approveThemeVersion(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.themeId,
      data.versionId,
      context.userId,
    );
  });
