/**
 * The merchant-scoped category archive's server function (Batch B, gap 3).
 *
 * A server function is a public endpoint, so it carries the same controls
 * the other reader functions carry: closed-input validation, the IP-hashed
 * `blog.read` bucket, and a server-side tenant resolution the caller can
 * never influence (no merchant id crosses the wire — the slug is resolved
 * to a merchant inside the loader). The implementation lives behind a
 * dynamic import so nothing server-only reaches the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const archiveSchema = z.object({
  slug: z.string().min(1).max(80),
  termSlug: z.string().min(1).max(120),
  page: z.number().int().min(1).max(500).optional(),
});

/** IP-keyed subject for the public bucket. Hashed upstream; never logged raw. */
async function readerSubject(): Promise<string> {
  const { requestFingerprint } = await import("./identity.server");
  const { ipHash } = await requestFingerprint();
  return `blog:${ipHash}`;
}

export const storeBlogArchiveFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => archiveSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const { enforceRateLimit } = await import("./rate-limit.server");
    await enforceRateLimit("blog.read", await readerSubject());
    const { loadStoreBlogArchive } =
      await import("./store-blog-archive.server");
    return loadStoreBlogArchive(data.slug, data.termSlug, data.page ?? 1);
  });
