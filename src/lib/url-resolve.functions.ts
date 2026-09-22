/**
 * Public RPC for permalink resolution. Unauthenticated by design — it serves
 * the storefront — so it validates hard, caps input length, and returns only
 * publishable data (never merchant ids or row internals).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const resolvePathFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({
        path: z.string().min(1).max(500),
        referrer: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { resolveStorefrontPath, recordResolvedMiss } =
      await import("./url-resolve.server");
    const resolution = await resolveStorefrontPath(data.path);
    if (resolution.type === "miss") {
      await recordResolvedMiss(data.path, data.referrer ?? null);
      return { resolution, article: null, target: null };
    }
    // Non-article permalink hits (custom product/collection/page bases) carry
    // everything the route layer needs to render without a second resolve.
    if (resolution.type !== "article")
      return {
        resolution,
        article: null,
        target:
          resolution.type === "redirect" || resolution.type === "gone"
            ? null
            : {
                kind: resolution.type,
                slug: resolution.slug,
                merchantSlug: resolution.merchantSlug,
                canonicalPath: resolution.canonicalPath,
              },
      };
    const { loadPublicArticle } = await import("./marketing.server");
    const loaded = await loadPublicArticle(resolution.slug);
    if (!loaded)
      return {
        resolution: { type: "miss" as const },
        article: null,
        target: null,
      };
    const { requestOrigin } = await import("./site-origin.server");
    return { resolution, article: loaded, origin: requestOrigin() };
  });
