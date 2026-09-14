/**
 * Content desk — typed RPC surface for `/admin/content/*` (Phase 11).
 *
 * Reads need `marketing.read`; writes need `marketing.update`; permanent
 * deletion and publish/unpublish need `marketing.publish`. The merchant is
 * always resolved from the session, never from the payload.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./authz-middleware";
import { CONTENT_STATUSES, PAGE_TEMPLATES, SLUG_RE } from "./content-desk";

const kindSchema = z.enum(["page", "post"]);
const idList = z.array(z.string().uuid()).min(1).max(200);
const templateIds = PAGE_TEMPLATES.map((t) => t.id) as [string, ...string[]];

export const contentDeskFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadContentDesk } = await import("./content-desk.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return loadContentDesk(context.supabase, merchantId, data.kind);
  });

const quickEditSchema = z.object({
  kind: kindSchema,
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  slug: z.string().regex(SLUG_RE, "slug.shape"),
  date: z.string().max(32).nullable(),
  password: z.string().max(64).nullable(),
  parentId: z.string().uuid().nullable(),
  menuOrder: z.number().int().min(0).max(9999),
  template: z.enum(templateIds),
  status: z.enum(CONTENT_STATUSES),
  visibility: z.enum(["public", "private", "password"]),
  allowComments: z.boolean(),
});

export const contentQuickEditFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => quickEditSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { applyQuickEdit } = await import("./content-desk.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("cms.save", `${merchantId}:${context.userId}`);
    const { kind, ...input } = data;
    return applyQuickEdit(context.supabase, merchantId, kind, input);
  });

const bulkEditSchema = z.object({
  kind: kindSchema,
  ids: idList,
  patch: z.object({
    authorId: z.string().uuid().optional(),
    parentId: z.string().uuid().nullable().optional(),
    template: z.enum(templateIds).optional(),
    allowComments: z.boolean().optional(),
    status: z.enum(["published", "draft", "pending", "scheduled", "private"]).optional(),
  }),
});

export const contentBulkEditFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => bulkEditSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { applyBulkEdit } = await import("./content-desk.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return applyBulkEdit(context.supabase, merchantId, data.kind, data.ids, data.patch);
  });

export const contentBulkVerbFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({ kind: kindSchema, ids: idList, verb: z.enum(["trash", "restore", "publish", "unpublish"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { applyBulkVerb } = await import("./content-desk.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return applyBulkVerb(context.supabase, merchantId, data.kind, data.ids, data.verb);
  });

export const contentDeleteForeverFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.publish")])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, ids: idList }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { applyBulkVerb } = await import("./content-desk.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return applyBulkVerb(context.supabase, merchantId, data.kind, data.ids, "delete");
  });

export const contentCreateDraftFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.create")])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: kindSchema,
        title: z.string().trim().max(160).optional(),
        editor: z.enum(["classic", "builder"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { createDraft } = await import("./content-desk.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return createDraft(context.supabase, merchantId, data.kind, context.userId, { title: data.title, editor: data.editor });
  });
