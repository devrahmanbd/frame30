/**
 * Tenant blog RPC surface (T5+D3).
 *
 * The scoped readers (`store-blog.server`) aggregate one merchant's articles.
 * These functions are the public edge over them: they resolve the merchant
 * server-side from the path/host slug via `merchantIdForSlug` (never from
 * client input), rate-limit by client IP exactly like `blogIndexFn` (a server
 * function is reachable directly, so "only our route calls it" is not a
 * control), and read through the anon client so RLS — not this file —
 * decides what is visible.
 *
 * Article resolution is pattern-aware: the direct slug is tried first, then
 * the merchant's permalink settings are loaded and `extractStoreArticleSlug`
 * (a `parsePath`-equivalent over the patterned remainder, e.g. `2026/09/x`
 * or `news/x`) extracts the bare slug for a retry. Canonical URLs always
 * come from `buildPermalink`/`absolutePermalink` in `permalink.ts` — this
 * file never hand-builds an article path.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  DEFAULT_PERMALINKS,
  parsePath,
  type PermalinkSettings,
} from "./permalink";

const merchantSlugSchema = z.string().min(1).max(80);

const indexInputSchema = z.object({
  slug: merchantSlugSchema,
  page: z.number().int().min(1).max(500).optional(),
});

const articleInputSchema = z.object({
  slug: merchantSlugSchema,
  /** Bare slug or a patterned remainder (`2026/09/x`, `news/x`). */
  articleSlug: z.string().min(1).max(200),
});

/**
 * Pure slug extraction for patterned article URLs.
 *
 * `parsePath` is the canonical parser, but it expects a full store-relative
 * path including the merchant base (`/blog/2026/09/x`). Route params arrive
 * as remainders — sometimes with the base (`blog/2026/09/x`), sometimes
 * without (`2026/09/x`, `news/x`), sometimes a bare slug (`x`). This tries
 * each reading in cheapest-first order and returns the bare article slug, or
 * null when nothing parses and there is no usable tail segment.
 */
export function extractStoreArticleSlug(
  settings: PermalinkSettings,
  raw: string,
): string | null {
  const cleaned = (raw ?? "").split(/[?#]/)[0]?.trim() ?? "";
  if (!cleaned) return null;
  const normalised = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;

  const direct = parsePath(settings, normalised);
  if (direct?.kind === "article" && direct.slug) return direct.slug;

  if (settings.articleBase) {
    const withBase = `${settings.articleBase}${normalised}`.replace(
      /\/{2,}/g,
      "/",
    );
    if (withBase !== normalised) {
      const parsed = parsePath(settings, withBase);
      if (parsed?.kind === "article" && parsed.slug) return parsed.slug;
    }
  }

  const segments = normalised.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  return last ? last.toLowerCase() : null;
}

/** IP-keyed subject for public buckets. Hashed upstream; never logged raw. */
async function readerSubject(): Promise<string> {
  const { requestFingerprint } = await import("./identity.server");
  const { ipHash } = await requestFingerprint();
  return `blog:${ipHash}`;
}

type StoreContext = {
  merchantId: string;
  settings: PermalinkSettings;
  origin: string | null;
};

/** Merchant id + render-path permalink settings + request origin, or null. */
async function storeBlogContext(slug: string): Promise<StoreContext | null> {
  const { merchantIdForSlug } = await import("./storefront-host.server");
  const merchantId = await merchantIdForSlug(slug);
  if (!merchantId) return null;
  const { publicClient } = await import("./pricing.server");
  const { permalinkSettingsFor } = await import("./permalink.server");
  const { requestOrigin } = await import("./site-origin.server");
  const settings = await permalinkSettingsFor(
    publicClient() as never,
    merchantId,
  );
  return { merchantId, settings, origin: requestOrigin() };
}

export const storeBlogIndexFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => indexInputSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadStoreBlogIndex } = await import("./store-blog.server");
    await enforceRateLimit("blog.read", await readerSubject());
    const ctx = await storeBlogContext(data.slug);
    if (!ctx) return null;
    const listing = await loadStoreBlogIndex(ctx.merchantId, data.page ?? 1);
    return {
      merchantSlug: data.slug,
      settings: ctx.settings,
      origin: ctx.origin,
      listing,
    };
  });

export const storeBlogArticleFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => articleInputSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadStoreArticle } = await import("./store-blog.server");
    await enforceRateLimit("blog.read", await readerSubject());
    const ctx = await storeBlogContext(data.slug);
    if (!ctx) return null;
    // Slugs are lowercase-only by `validateSlug`, so normalise before the
    // exact-match lookup; a mixed-case hand-typed URL still resolves.
    const direct = (data.articleSlug ?? "").trim().toLowerCase();
    if (!direct) return null;
    let article = await loadStoreArticle(ctx.merchantId, direct);
    let resolvedSlug: string | null = article ? direct : null;
    if (!article) {
      const extracted = extractStoreArticleSlug(ctx.settings, data.articleSlug);
      if (extracted && extracted !== direct) {
        article = await loadStoreArticle(ctx.merchantId, extracted);
        if (article) resolvedSlug = extracted;
      }
    }
    if (!article) return null;
    return {
      merchantSlug: data.slug,
      settings: ctx.settings,
      origin: ctx.origin,
      article,
      resolvedSlug,
    };
  });

/** Fallback settings for head builders when the fn payload is unavailable. */
export function fallbackPermalinkSettings(): PermalinkSettings {
  return DEFAULT_PERMALINKS;
}
