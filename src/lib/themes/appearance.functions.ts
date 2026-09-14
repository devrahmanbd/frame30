import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("@/lib/marketing.server");
  return currentMerchantId(db, userId);
}

const themeId = z.string().uuid();
const themeKey = z.string().min(1).max(64);

export const themesWorkspaceFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadThemesWorkspace } = await import("./appearance.server");
    return loadThemesWorkspace(context.supabase, await scope(context.supabase, context.userId));
  });

export const themeInstallFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: themeKey }).parse(d))
  .handler(async ({ data, context }) => {
    const { installCatalogTheme } = await import("./appearance.server");
    return installCatalogTheme(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.key,
    );
  });

export const themeActivateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: themeId }).parse(d))
  .handler(async ({ data, context }) => {
    const { activateTheme } = await import("./appearance.server");
    return activateTheme(context.supabase, await scope(context.supabase, context.userId), data.id);
  });

export const themeDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: themeId }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteTheme } = await import("./appearance.server");
    return deleteTheme(context.supabase, await scope(context.supabase, context.userId), data.id);
  });

export const themeFlagsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: themeKey, favourite: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { setCatalogFavourite } = await import("./appearance.server");
    return setCatalogFavourite(
      context.supabase,
      await scope(context.supabase, context.userId),
      data.key,
      data.favourite,
    );
  });
