import { createFileRoute } from "@tanstack/react-router";

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
        const origin = new URL(request.url).origin;
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
                updatedAt: (row.updated_at ?? row.published_at ?? null) as string | null,
              }));
          } catch (error) {
            log("warn", "llms_txt.articles_failed", {
              reason: String((error as Error)?.message ?? error).slice(0, 160),
            });
            return [];
          }
        })();

        const { PAYMENT_METHOD_KEYS, PAYMENT_METHOD_CATALOG } = await import("@/lib/payment-rails");
        const paymentMethods = PAYMENT_METHOD_KEYS.map((key) => PAYMENT_METHOD_CATALOG[key].label);

        const body = renderMarketingLlmsTxt({ origin, plans, articles, paymentMethods });
        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
