/**
 * Phase 3 — template SEO RPC surface. Shape validation here, behaviour in
 * `builder-seo.server`. Reads need `themes.read`; writes need `themes.update`,
 * because a `noindex` flip is a publishing decision, not a content edit.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requirePermission } from "./authz-middleware";

const uuid = z.string().uuid();
const loose: z.ZodType<unknown> = z.custom<unknown>(() => true);

const seoShape = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(600).optional(),
  canonical: z.string().max(2048).optional(),
  ogTitle: z.string().max(200).optional(),
  ogDescription: z.string().max(600).optional(),
  ogImage: z.string().max(2048).optional(),
  focusKeyword: z.string().max(120).optional(),
  noindex: z.boolean().optional(),
});

export const templateSeoListFn = createServerFn({ method: "GET" })
  .middleware([requirePermission("themes.read")])
  .inputValidator((d: unknown) =>
    z.object({ merchantId: uuid.optional(), themeId: uuid.nullish() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { listTemplateSeo } = await import("./builder-seo.server");
    return listTemplateSeo(context.supabase, context.actor.merchantId!, data.themeId ?? null);
  });

export const templateSeoSaveFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: uuid.optional(),
        themeId: uuid.nullish(),
        template: z.string().min(1).max(40),
        expectedRevision: z.number().int().min(0).max(1_000_000),
        seo: seoShape,
        ast: loose.optional(),
        storeName: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { saveTemplateSeo } = await import("./builder-seo.server");
    return saveTemplateSeo(context.supabase, context.actor.merchantId!, context.userId, {
      template: data.template,
      themeId: data.themeId ?? null,
      seo: data.seo,
      ast: data.ast,
      storeName: data.storeName,
      expectedRevision: data.expectedRevision,
    });
  });

export const templateSeoClearFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("themes.update")])
  .inputValidator((d: unknown) =>
    z
      .object({
        merchantId: uuid.optional(),
        themeId: uuid.nullish(),
        template: z.string().min(1).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { clearTemplateSeo } = await import("./builder-seo.server");
    return clearTemplateSeo(
      context.supabase,
      context.actor.merchantId!,
      context.userId,
      data.template,
      data.themeId ?? null,
    );
  });
