/**
 * Blog CMS RPC surface.
 *
 * Shape validation lives here, behaviour in `cms.server.ts`. Two things this
 * layer owns that the runtime cannot:
 *
 *  - **Rate limits per intent.** Autosave fires every few seconds per open
 *    editor, a manual save is human-paced, and a restore rewrites live content;
 *    each gets its own bucket keyed by merchant so one noisy tab cannot starve
 *    a colleague, and a scripted client cannot hammer the revisions table.
 *  - **Error translation.** `ArticleValidationError` carries a stable code and
 *    bilingual copy; it is re-thrown as a plain message the editor can show and
 *    a field it can focus, instead of leaking database prose to a merchant.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requirePermission } from "./authz-middleware";

const articleSchema = z.object({
  id: z.string().uuid().nullable(),
  title: z.string().min(1).max(200),
  titleEn: z.string().max(200),
  slug: z.string().max(120),
  excerpt: z.string().max(1000),
  // 400 kB matches BODY_LIMITS.maxChars: past that the parser truncates anyway,
  // so refusing here keeps a hostile payload off the database entirely.
  body: z.string().min(1).max(400_000),
  coverImageUrl: z.string().max(2048),
  tags: z.array(z.string().max(40)).max(20),
  status: z.enum(["draft", "scheduled", "published", "archived"]),
  scheduledFor: z.string().nullable(),
  metaTitle: z.string().max(200),
  metaDescription: z.string().max(600),
  canonical: z.string().max(2048),
  robots: z.string().max(60),
  autosave: z.boolean().optional(),
});

/** Surface a merchant-actionable failure; keep everything else opaque. */
function toClientError(error: unknown): Error {
  if (error && typeof error === "object" && (error as { name?: string }).name === "ArticleValidationError") {
    const detail = error as { code: string; field: string; en: string; bn: string };
    const wrapped = new Error(`${detail.code}|${detail.field}|${detail.en}|${detail.bn}`);
    wrapped.name = "ArticleValidationError";
    return wrapped;
  }
  return error instanceof Error ? error : new Error("save_failed");
}

export const saveArticleFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.create")])
  .inputValidator((d: unknown) => articleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveArticle } = await import("./cms.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit(data.autosave ? "cms.autosave" : "cms.save", `${merchantId}:${context.userId}`);
    try {
      return await saveArticle(context.supabase, merchantId, context.userId, data);
    } catch (error) {
      throw toClientError(error);
    }
  });

export const articleRevisionsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ articleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { listRevisions } = await import("./cms.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("cms.read", `${merchantId}:${context.userId}`);
    return listRevisions(context.supabase, merchantId, data.articleId);
  });

/** Two full revisions for the side-by-side compare panel. */
export const revisionPairFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ leftId: z.string().uuid(), rightId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { revisionPair } = await import("./cms.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("cms.read", `${merchantId}:${context.userId}`);
    return revisionPair(context.supabase, merchantId, data.leftId, data.rightId);
  });

export const restoreRevisionFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ revisionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { restoreRevision } = await import("./cms.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await enforceRateLimit("cms.restore", `${merchantId}:${context.userId}`);
    return restoreRevision(context.supabase, merchantId, data.revisionId, context.userId);
  });


export const listRedirectsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { listRedirects } = await import("./cms.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return listRedirects(context.supabase, merchantId);
  });

export const saveRedirectFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ fromPath: z.string().min(1), toPath: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveRedirect } = await import("./cms.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await saveRedirect(context.supabase, merchantId, data.fromPath, data.toPath);
    return { ok: true };
  });

export const deleteRedirectFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { deleteRedirect } = await import("./cms.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await deleteRedirect(context.supabase, merchantId, data.id);
    return { ok: true };
  });

const formSchema = z.object({
  id: z.string().uuid().nullable(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  fields: z.array(
    z.object({
      key: z.string().min(1),
      label: z.string().min(1),
      type: z.enum(["text", "email", "phone", "textarea"]),
      required: z.boolean(),
    }),
  ),
  successMessage: z.string(),
  requiresConsent: z.boolean(),
  isActive: z.boolean(),
});

export const formsLoadFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { loadForms } = await import("./accounts.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    return loadForms(context.supabase, merchantId);
  });

export const saveFormFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) => formSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { saveForm } = await import("./accounts.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await saveForm(context.supabase, merchantId, data);
    return { ok: true };
  });

export const submissionStatusFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("marketing.update")])
  .inputValidator((d: unknown) =>
    z.object({ submissionId: z.string().uuid(), status: z.enum(["new", "handled", "spam"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { currentMerchantId } = await import("./marketing.server");
    const { setSubmissionStatus } = await import("./accounts.server");
    const merchantId = await currentMerchantId(context.supabase, context.userId);
    await setSubmissionStatus(context.supabase, merchantId, data.submissionId, data.status);
    return { ok: true };
  });
