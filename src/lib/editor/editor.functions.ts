/**
 * Phase 12 — typed RPC surface for the editor takeover.
 *
 * Reads need `marketing.read`; drafts/autosaves need `marketing.update`;
 * publishing is gated by `marketing.publish` — callers without it are
 * demoted to "pending review" server-side, never rejected.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "@/lib/authz-middleware";
import { can } from "@/lib/authz";
import { CONTENT_STATUSES, PAGE_TEMPLATES, SLUG_RE } from "@/lib/content-desk";
import { POST_FORMATS } from "./editor-doc";

const kindSchema = z.enum(["page", "post"]);
const templateIds = PAGE_TEMPLATES.map((t) => t.id) as [string, ...string[]];
const formatIds = POST_FORMATS.map((f) => f.id) as [string, ...string[]];

export const docSchema = z.object({
  id: z.string().uuid().nullable(),
  kind: kindSchema,
  title: z.string().max(160),
  titleEn: z.string().max(160),
  slug: z
    .string()
    .max(96)
    .refine((s) => s === "" || SLUG_RE.test(s), "slug.shape"),
  body: z.string().max(200_000),
  editor: z.enum(["classic", "builder"]),
  excerpt: z.string().max(600),
  status: z.enum(CONTENT_STATUSES),
  publishAt: z.string().max(40).nullable(),
  publishedAt: z.string().max(40).nullable(),
  visibility: z.enum(["public", "private", "password"]),
  password: z.string().max(64),
  authorId: z.string().uuid().nullable(),
  template: z.enum(templateIds),
  parentId: z.string().uuid().nullable(),
  menuOrder: z.number().int().min(0).max(9999),
  allowComments: z.boolean(),
  format: z.enum(formatIds),
  featuredImage: z.string().max(2048),
  showInNav: z.boolean(),
  categories: z.array(z.string().uuid()).max(12),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  seo: z.object({
    metaTitle: z.string().max(120),
    metaDescription: z.string().max(320),
    canonical: z.string().max(2048),
    robots: z.string().max(40),
  }),
  // The extended SEO record is re-parsed server-side by `parseEntitySeo`,
  // so it only needs to arrive as an object here.
  seoExtended: z.unknown().optional(),
  updatedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
});

export const editorLoadFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z.object({ kind: kindSchema, id: z.string().uuid().nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { loadEditor } = await import("./editor.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const ctx = await loadEditor(context.supabase, merchantId, context.userId, data.kind, data.id);
    return { ...ctx, canPublish: can("marketing.publish", context.actor) };
  });

export const editorSaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z.object({ doc: docSchema, mode: z.enum(["autosave", "save", "publish"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { saveEditor } = await import("./editor.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    const canPublish = can("marketing.publish", context.actor);
    return saveEditor(
      context.supabase,
      merchantId,
      context.userId,
      data.doc as never,
      data.mode,
      canPublish,
    );
  });

export const editorRevisionFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("marketing.read")])
  .inputValidator((d: unknown) =>
    z.object({ kind: kindSchema, revisionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { readRevision } = await import("./editor.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return readRevision(context.supabase, merchantId, data.kind, data.revisionId);
  });

export const editorTrashFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ kind: kindSchema, id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { trashFromEditor } = await import("./editor.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return trashFromEditor(context.supabase, merchantId, data.kind, data.id);
  });

export const editorSetKindFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z
      .object({ kind: kindSchema, id: z.string().uuid(), editor: z.enum(["classic", "builder"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("@/lib/marketing.server");
    const { setEditorKind } = await import("./editor.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return setEditorKind(context.supabase, merchantId, data.kind, data.id, data.editor);
  });
