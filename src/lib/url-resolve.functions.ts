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
    const { resolveStorefrontPath, recordResolvedMiss } = await import("./url-resolve.server");
    const resolution = await resolveStorefrontPath(data.path);
    if (resolution.type === "miss") {
      await recordResolvedMiss(data.path, data.referrer ?? null);
      return { resolution, article: null };
    }
    if (resolution.type !== "article") return { resolution, article: null };
    const { loadPublicArticle } = await import("./marketing.server");
    const loaded = await loadPublicArticle(resolution.slug);
    if (!loaded) return { resolution: { type: "miss" as const }, article: null };
    return { resolution, article: loaded };
  });
