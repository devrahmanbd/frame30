import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const publicArticlePageFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { requestFingerprint } = await import("./identity.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadPublicArticlePage } = await import("./blog-reader.server");
    const { ipHash } = await requestFingerprint();
    await enforceRateLimit("blog.read", `blog:${ipHash}`);
    return loadPublicArticlePage(data.slug);
  });

export const publicArticleResolutionFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1).max(120) }).parse(data))
  .handler(async ({ data }) => {
    const { requestFingerprint } = await import("./identity.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { resolveStorefrontPath } = await import("./url-resolve.server");
    const { ipHash } = await requestFingerprint();
    await enforceRateLimit("blog.read", `blog:${ipHash}`);
    return resolveStorefrontPath(`/blog/${data.slug}`);
  });

export const blogSearchFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ query: z.string().max(120), page: z.number().int().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { requestFingerprint } = await import("./identity.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { searchPublicBlog } = await import("./blog-reader.server");
    const { ipHash } = await requestFingerprint();
    await enforceRateLimit("blog.search", `blog-search:${ipHash}`);
    return searchPublicBlog(data.query, data.page);
  });

export const authorArchiveFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ slug: z.string().min(1).max(80), page: z.number().int().min(1).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { requestFingerprint } = await import("./identity.server");
    const { enforceRateLimit } = await import("./rate-limit.server");
    const { loadAuthorArchive } = await import("./blog-reader.server");
    const { ipHash } = await requestFingerprint();
    await enforceRateLimit("blog.read", `blog:${ipHash}`);
    return loadAuthorArchive(data.slug, data.page);
  });