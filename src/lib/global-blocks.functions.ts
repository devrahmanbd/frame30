/**
 * Phase 1.5 — global blocks RPC surface.
 *
 * Thin by design: validation shape here, behaviour in `global-blocks.server`.
 * Reads need `themes.read`, writes need `themes.update`, so a support-tier
 * staff member can inspect a block but never publish a change to every page it
 * appears on.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./authz-middleware";

const nodes: z.ZodType<unknown> = z.custom<unknown>(() => true);
const uuid = z.string().uuid();

export const globalBlockListFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("themes.read")])
  .inputValidator((d: unknown) =>
    z.object({ merchantId: uuid.optional(), themeId: uuid.nullish() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listGlobalBlocks } = await import("./global-blocks.server");
    return listGlobalBlocks(context.supabase, context.actor.merchantId!, data.themeId ?? null);
  });

export const globalBlockCreateFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: uuid.optional(),
        themeId: uuid.nullish(),
        name: z.string().min(1).max(80),
        nodes,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { createGlobalBlock } = await import("./global-blocks.server");
    return createGlobalBlock(context.supabase, context.actor.merchantId!, context.userId, {
      name: data.name,
      nodes: data.nodes,
      themeId: data.themeId ?? null,
    });
  });

export const globalBlockUpdateFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: uuid.optional(),
        id: uuid,
        expectedRevision: z.number().int().min(1).max(1_000_000),
        name: z.string().min(1).max(80).optional(),
        nodes: nodes.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { updateGlobalBlock } = await import("./global-blocks.server");
    return updateGlobalBlock(context.supabase, context.actor.merchantId!, context.userId, data);
  });

export const globalBlockDeleteFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) => z.object({ merchantId: uuid.optional(), id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { deleteGlobalBlock } = await import("./global-blocks.server");
    return deleteGlobalBlock(context.supabase, context.actor.merchantId!, context.userId, data.id);
  });
