import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const snapshotDeskFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSnapshots } = await import("./snapshots.server");
    return loadSnapshots(context.supabase, context.userId);
  });

export const snapshotCreateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["platform", "store"]).default("platform"),
        merchantId: z.string().uuid().nullable().optional(),
        label: z.string().trim().max(120).nullable().optional(),
        note: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createSnapshot } = await import("./snapshots.server");
    return createSnapshot(context.supabase, context.userId, data);
  });

export const snapshotDownloadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { signSnapshot } = await import("./snapshots.server");
    return signSnapshot(context.supabase, context.userId, data.id);
  });

export const snapshotVerifyFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { verifySnapshot } = await import("./snapshots.server");
    return verifySnapshot(context.supabase, context.userId, data.id);
  });

export const snapshotRestoreFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        mode: z.enum(["dry_run", "restore"]),
        confirm: z.string().trim().max(200).nullable().optional(),
        tables: z.array(z.string().trim().max(64)).max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { restoreSnapshot } = await import("./snapshots.server");
    return restoreSnapshot(context.supabase, context.userId, data);
  });

export const snapshotDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteSnapshot } = await import("./snapshots.server");
    return deleteSnapshot(context.supabase, context.userId, data.id);
  });
