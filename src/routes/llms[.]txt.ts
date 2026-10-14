import { createFileRoute } from "@tanstack/react-router";

/**
 * Merchant store map for answer engines: catalogue links with root-shape
 * paths on the requesting custom host. Every link is an `absolutePermalink`
 * canonical from the merchant's own permalink settings, so the map advertises
 * exactly what the storefront serves. Best-effort reads — the file renders
 * the store identity even when catalogue tables are unreachable.
 */
/**
 * Typed surface of the fluent catalogue queries below. The client resolves
 * through the loose schema alias, so the builder models only the methods
 * this file chains; terminal results carry the exact selected columns
 * (matching `MerchantLlmsInput`), and `then` keeps the list queries'
 * `r.data ?? []` shape. Runtime behavior is untouched — types erase.
 */
type LlmsMerchantRow = { id: string; name: string; slug: string };
type LlmsCatalogRow = {
  slug: string;
  title?: string | null;
  name?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
};
type LlmsQueryResult = { data: LlmsCatalogRow[] | null };
interface LlmsQuery {
  select: (columns: string) => LlmsQuery;
  eq: (column: string, value: string | number | boolean | null) => LlmsQuery;
  is: (column: string, value: null) => LlmsQuery;
  lte: (column: string, value: string) => LlmsQuery;
  limit: (count: number) => LlmsQuery;
  order: (column: string, options: { ascending: boolean }) => LlmsQuery;
  maybeSingle: () => Promise<{ data: LlmsMerchantRow | null }>;
  then: <T>(
    onFulfilled: (value: LlmsQueryResult) => T | PromiseLike<T>,
  ) => Promise<T>;
}

async function merchantLlmsTxt(
  slug: string,
  origin: string,
): Promise<Response> {
  const headers = {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
  };
  try {
    const { publicClient } = await import("@/lib/pricing.server");
    const db = publicClient() as unknown as {
      from: (t: string) => LlmsQuery;
    };
    const { data: merchant } = await db
      .from("merchants")
      .select("id, name, slug")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (!merchant) throw new Error("unknown_merchant");
    const m = merchant as { id: string; name: string; slug: string };
    const settings = await import("@/lib/permalink.server")
      .then((mod) => mod.permalinkSettingsFor(db as never, m.id))
      .catch(() => null);
    const [products, collections, pages, articles] = await Promise.all([
      db
        .from("products")
        .select("slug, title")
        .eq("merchant_id", m.id)
        .eq("status", "active")
        .limit(100)
        .then((r: LlmsQueryResult) => r.data ?? []),
      db
        .from("collections")
        .select("slug, name")
        .eq("merchant_id", m.id)
        .eq("is_published", true)
        .limit(50)
        .then((r: LlmsQueryResult) => r.data ?? []),
      db
        .from("storefront_pages")
        .select("slug, title")
        .eq("merchant_id", m.id)
        .eq("is_published", true)
        .is("deleted_at", null)
        .limit(50)
        .then((r: LlmsQueryResult) => r.data ?? []),
      db
        .from("articles")
        .select("slug, title, published_at")
        .eq("merchant_id", m.id)
        .eq("status", "published")
        .lte("published_at", new Date().toISOString())
        .is("deleted_at", null)
        .limit(50)
        .then((r: LlmsQueryResult) => r.data ?? [])
        .catch(() => []),
    ]);
    const { buildMerchantLlmsTxt } = await import("@/lib/store-sitemap.server");
    const body = buildMerchantLlmsTxt(origin, {
      storeName: m.name,
      products: (products ?? []) as { slug: string; title: string }[],
      collections: (collections ?? []) as { slug: string; name: string }[],
      pages: (pages ?? []) as { slug: string; title: string }[],
      articles: (articles ?? []) as {
        slug: string;
        title: string;
        published_at?: string | null;
      }[],
      settings,
    });
    return new Response(body, { headers });
  } catch {
    return new Response(`# Store\n\nStorefront: ${origin}/\n`, { headers });
  }
}

/**
 * Phase 10.5 — marketing-site `llms.txt`, the sibling of the per-store one.
 *
 * Answer engines quote text, and the cheapest way to be quoted correctly is to
 * hand them an accurate map instead of making them infer one from six crawled
 * pages. Everything served here is also visible on the site — this is a map,
 * not cloaking.
 *
 * Failure policy: the file must render even when every backend read is down.
 * Plans and articles are optional enrichment behind individually caught reads;
 * the page/contact/legal skeleton comes from the static registry.
 */
export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requestOrigin } = await import("@/lib/site-origin.server");
        const origin = requestOrigin() ?? new URL(request.url).origin;
        // Custom host: this merchant's store map instead of marketing content.
        try {
          const { resolveStorefrontHost } =
            await import("@/lib/storefront-host.server");
          const host = await resolveStorefrontHost();
          if (host) {
            return merchantLlmsTxt(host.merchantSlug, origin);
          }
        } catch {
          // Fall through to the platform document.
        }
        const { renderMarketingLlmsTxt } = await import("@/lib/marketing-seo");
        const { log } = await import("@/lib/observability.server");

        // Each enrichment read is independently optional: a dead
        // plan_definitions table costs us the Plans section, not the file.
        const plans = await (async () => {
          try {
            const { publicPlans } = await import("@/lib/site.server");
            return (await publicPlans())
              .filter((plan) => typeof plan.priceMinorInt === "number")
              .map((plan) => ({
                name: plan.titleEn,
                price: String(Math.round((plan.priceMinorInt as number) / 100)),
                currency: plan.currencyCode,
              }));
          } catch (error) {
            log("warn", "llms_txt.plans_failed", {
              reason: String((error as Error)?.message ?? error).slice(0, 160),
            });
            return [];
          }
        })();

        const articles = await (async () => {
          try {
            const { publicClient } = await import("@/lib/pricing.server");
            const { data } = await publicClient()
              .from("articles")
              .select("slug, title, updated_at, published_at")
              .eq("status", "published")
              .order("published_at", { ascending: false })
              .limit(50);
            return (data ?? [])
              .filter((row) => Boolean(row.slug && row.title))
              .map((row) => ({
                slug: row.slug as string,
                title: row.title as string,
                updatedAt: (row.updated_at ?? row.published_at ?? null) as
                  string | null,
              }));
          } catch (error) {
            log("warn", "llms_txt.articles_failed", {
              reason: String((error as Error)?.message ?? error).slice(0, 160),
            });
            return [];
          }
        })();

        const { PAYMENT_METHOD_KEYS, PAYMENT_METHOD_CATALOG } =
          await import("@/lib/payment-rails");
        const paymentMethods = PAYMENT_METHOD_KEYS.map(
          (key) => PAYMENT_METHOD_CATALOG[key].label,
        );

        const body = renderMarketingLlmsTxt({
          origin,
          plans,
          articles,
          paymentMethods,
        });
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control":
              "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
