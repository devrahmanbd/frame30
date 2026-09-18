import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requirePermission } from "./authz-middleware";

async function scope(db: SupabaseClient<Database>, userId: string) {
  const { currentMerchantId } = await import("./marketing.server");
  return currentMerchantId(db, userId);
}

const pluginId = z.string().regex(/^[a-z][a-z0-9-]{2,39}$/);

export const pluginListFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("themes.read")])
  .handler(async ({ context }) => {
    const { listInstalledPlugins } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return {
      plugins: await listInstalledPlugins(context.supabase, merchantId),
    };
  });

export const pluginInstallFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        manifest: z.unknown(),
        grantedScopes: z.array(z.string()).max(20),
        installId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { upsertPlugin } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return upsertPlugin(context.supabase, merchantId, {
      manifest: data.manifest,
      grantedScopes: data.grantedScopes,
      installId: data.installId ?? null,
    });
  });

export const pluginSettingsSaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ pluginId, values: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { savePluginSettings } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return savePluginSettings(
      context.supabase,
      merchantId,
      data.pluginId,
      data.values,
    );
  });

export const pluginToggleFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z.object({ pluginId, enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setPluginEnabled } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setPluginEnabled(
      context.supabase,
      merchantId,
      data.pluginId,
      data.enabled,
      context.userId,
    );
  });

export const pluginUninstallFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) => z.object({ pluginId }).parse(d))
  .handler(async ({ data, context }) => {
    const { uninstallPlugin } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return uninstallPlugin(
      context.supabase,
      merchantId,
      data.pluginId,
      context.userId,
    );
  });

/** Platform owner only — RLS rejects a merchant who tries. Kill switches are global per plugin. */
export const pluginKillSwitchFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("flags.write")])
  .inputValidator((d: unknown) =>
    z
      .object({
        pluginId: z.string().min(1).max(80),
        disabled: z.boolean(),
        reason: z.string().max(200).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setPluginKillSwitch } = await import("./plugins.server");
    return setPluginKillSwitch(
      context.supabase,
      data.pluginId,
      data.disabled,
      data.reason,
    );
  });
