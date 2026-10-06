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
  .middleware([requirePermission("plugins.read")])
  .handler(async ({ context }) => {
    const { listInstalledPlugins } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return {
      plugins: await listInstalledPlugins(context.supabase, merchantId),
    };
  });

export const pluginInstallFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plugins.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        manifest: z.unknown(),
        grantedScopes: z.array(z.string()).max(20),
        installId: z.string().uuid().nullable().optional(),
        reconsented: z.boolean().optional(),
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
      reconsented: data.reconsented ?? false,
    });
  });

export const pluginSettingsSaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plugins.update")])
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
      context.userId,
    );
  });

export const pluginToggleFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plugins.update")])
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

export const pluginAutoUpdatesFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plugins.update")])
  .inputValidator((d: unknown) =>
    z.object({ pluginId, enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { setPluginAutoUpdates } = await import("./plugins.server");
    const merchantId = await scope(context.supabase, context.userId);
    return setPluginAutoUpdates(
      context.supabase,
      merchantId,
      data.pluginId,
      data.enabled,
      context.userId,
    );
  });

export const pluginUninstallFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plugins.update")])
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

/* ------------------------------------------------------- plugin ZIP upload
 *
 * PLUGIN UPLOAD lane (theme `themeUploadFn` → `installUploadedTheme` parity):
 * the plugins desk had client-side validation only with zero server path.
 * This is the working server path: authoritative archive checks, then the
 * bytes ride the NORMAL `installPackage` pipeline (kind "plugin", strict
 * `pkg1PluginValidator` — the real plugin gate), plus the host projection
 * (`upsertPlugin` with the full permission grant, linked to the pipeline
 * ledger row — the same projection the official-install path runs), so an
 * upload renders and the existing Activate/Deactivate/Delete actions apply
 * from the first byte.
 *
 * Idempotency: the client mints ONE key per file-pick (crypto.randomUUID,
 * held across retries/double-clicks). A replayed key returns the original
 * install — double-clicks never stack duplicate ledger rows. Archive checks
 * run BEFORE the pipeline (and the pipeline itself validates before its own
 * replay lookup), so a reused key cannot smuggle hostile bytes past the
 * archive gates.
 */

export const MAX_PLUGIN_UPLOAD_BYTES = 20 * 1024 * 1024;

export type PluginUploadInput = {
  fileName: string;
  fileBase64: string;
  idempotencyKey: string;
};

export type PluginUploadResult = {
  installId: string;
  slug: string;
  version: string;
  alreadyInstalled: boolean;
  /** Live (`installed`) vs parked (`paused`) ledger state — drives the row badge. */
  enabled: boolean;
};

export class PluginUploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PluginUploadError";
  }
}

export type PluginUploadCheck =
  | { ok: true; name: string }
  | { ok: false; reason: string };

/** Front-of-house validation for the `.zip` drop-zone on the plugins desk. */
export function validatePluginUpload(file: {
  name: string;
  size: number;
}): PluginUploadCheck {
  const name = file.name.trim();
  if (!name) return { ok: false, reason: "The file needs a name." };
  if (!/\.zip$/iu.test(name))
    return { ok: false, reason: "Plugin packages must be a .zip file." };
  if (file.size <= 0) return { ok: false, reason: "That file is empty." };
  if (file.size > MAX_PLUGIN_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: `Plugin packages must stay under ${MAX_PLUGIN_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    };
  }
  return { ok: true, name };
}

function decodePluginUploadBytes(fileBase64: string): Uint8Array {
  const text = (fileBase64 ?? "").trim();
  if (!text)
    throw new PluginUploadError("plugin.upload_empty", "That file is empty.");
  // Portable base64 (Buffer on the server, atob in every other runtime that
  // can reach this module through the client-bundled functions file).
  let bin: string;
  try {
    bin =
      typeof Buffer !== "undefined"
        ? Buffer.from(text, "base64").toString("binary")
        : atob(text);
  } catch {
    throw new PluginUploadError(
      "plugin.upload_invalid",
      "That file could not be read as a plugin package.",
    );
  }
  if (!bin.length)
    throw new PluginUploadError("plugin.upload_empty", "That file is empty.");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i) & 0xff;
  return bytes;
}

/**
 * Upload-plugin server path: authoritative archive checks, then the bytes
 * ride `installPackage` (kind "plugin") with the strict plugin validator,
 * plus the host projection so the install renders and toggles like any
 * pipeline install. Read-only neighbours (imported, never modified):
 * the package-install pipeline, the plugin host, the package-zip gates.
 */
export async function installUploadedPlugin(
  db: SupabaseClient<Database>,
  merchantId: string,
  input: PluginUploadInput,
  actorId?: string | null,
): Promise<PluginUploadResult> {
  const rawName = (input.fileName ?? "").trim();
  if (!/\.zip$/iu.test(rawName)) {
    throw new PluginUploadError(
      "plugin.upload_name",
      "Plugin packages must be a .zip file.",
    );
  }
  const bytes = decodePluginUploadBytes(input.fileBase64 ?? "");
  if (bytes.length > MAX_PLUGIN_UPLOAD_BYTES) {
    throw new PluginUploadError(
      "plugin.upload_too_large",
      `Plugin packages must stay under ${MAX_PLUGIN_UPLOAD_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const isZip =
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06));
  if (!isZip) {
    throw new PluginUploadError(
      "plugin.upload_magic",
      "That file is not a valid zip archive.",
    );
  }

  const [{ installPackage }, pluginPackage, packageZip] = await Promise.all([
    import("./package-install.server"),
    import("./plugin-package"),
    import("./package-zip"),
  ]);
  const out = await installPackage(
    db,
    merchantId,
    {
      kind: "plugin",
      fileName: rawName,
      bytes,
      idempotencyKey: input.idempotencyKey,
      validator:
        pluginPackage.pkg1PluginValidator as Parameters<
          typeof installPackage
        >[2]["validator"],
    },
    actorId,
  );
  // The bytes already passed the strict gate inside the pipeline — this
  // re-parse only recovers the manifest for the host projection + slug.
  const layout = packageZip.validatePackageLayout(
    packageZip.extractPackageFiles(bytes, packageZip.parseZip(bytes)),
    "plugin",
  );
  const gated = pluginPackage.gateExportManifest(layout.manifest);
  const slug = gated.id;
  if (!out.alreadyInstalled) {
    const { upsertPlugin } = await import("./plugins.server");
    try {
      await upsertPlugin(db, merchantId, {
        manifest: layout.manifest,
        grantedScopes: gated.permissions,
        installId: out.packageId,
        actorId: actorId ?? null,
      });
    } catch (e) {
      // Mirror the official-install compensation: no orphan pipeline rows
      // strand behind a success response.
      try {
        const { deleteVersionAssets, pluginVersionPrefix } = await import(
          "./package-store.server"
        );
        await deleteVersionAssets(
          db,
          merchantId,
          pluginVersionPrefix(gated.id, out.artifactId.slice(0, 8)),
        ).catch(() => null);
      } catch {
        // Compensation is best-effort; the projection error is the signal.
      }
      await db
        .from("marketplace_installs")
        .delete()
        .eq("merchant_id", merchantId)
        .eq("id", out.packageId);
      throw e;
    }
    return {
      installId: out.packageId,
      slug,
      version: out.version,
      alreadyInstalled: false,
      enabled: true,
    };
  }
  const { data: live } = await db
    .from("marketplace_installs")
    .select("id, status")
    .eq("merchant_id", merchantId)
    .eq("id", out.packageId)
    .maybeSingle();
  const status = (live as { status?: string } | null)?.status;
  return {
    installId: out.packageId,
    slug,
    version: out.version,
    alreadyInstalled: true,
    enabled: status !== "paused" && status !== "removed",
  };
}

export const pluginUploadFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("plugins.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        fileName: z.string().trim().min(1).max(100),
        // Base64 of a zip bounded by MAX_PLUGIN_UPLOAD_BYTES server-side;
        // the transport cap here only stops absurd payloads early.
        fileBase64: z.string().min(1).max(30_000_000),
        idempotencyKey: z.string().min(8).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { rateLimit } = await import("./rate-limit.server");
    const merchantId = await scope(context.supabase, context.userId);
    await rateLimit("market.install", merchantId);
    return installUploadedPlugin(
      context.supabase,
      merchantId,
      data,
      context.userId,
    );
  });
