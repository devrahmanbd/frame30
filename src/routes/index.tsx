import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { getLanding } from "@/lib/landing.functions";
import { getSiteContext } from "@/lib/site-seo.functions";
import { buildMarketingHead, buildGraph } from "@/lib/marketing-seo";
import { FAQ_ROWS } from "@/lib/landing";
import { en } from "@/lib/i18n-dict";
import { HomePage } from "@/components/public/landing";

export const Route = createFileRoute("/")({
  // Public, unauthenticated and failure-tolerant: `loadLanding` never throws,
  // so prerender and SSR cannot 500 on the most-crawled URL we own.
  loader: async () => {
    const [landing, site] = await Promise.all([getLanding(), getSiteContext()]);
    return { ...landing, origin: site.origin };
  },
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? null;
    // Every tag and every JSON-LD node comes from the one typed builder in
    // `marketing-seo.ts`; this route only supplies the page-specific FAQ and
    // plan offers. The FAQ entries are the same strings the page renders in
    // its SSR HTML — an answer a crawler cannot find on the page is a
    // structured-data violation, so both read from FAQ_ROWS.
    const head = buildMarketingHead({ route: "home", origin });
    const graph = buildGraph({
      route: "home",
      origin,
      faq: FAQ_ROWS.map((row) => ({
        question: en(row.questionKey),
        answer: en(row.answerKey),
      })),
      offers: (loaderData?.plans ?? [])
        .filter((plan) => typeof plan.priceMinorInt === "number")
        .map((plan) => ({
          name: plan.titleEn,
          price: String(Math.round((plan.priceMinorInt as number) / 100)),
          currency: plan.currencyCode,
        })),
    });
    return {
      meta: head.meta,
      links: head.links,
      scripts: graph ? [{ type: "application/ld+json", children: JSON.stringify(graph) }] : [],
    };
  },
  component: PlatformHome,
});

function PlatformHome() {
  const data = Route.useLoaderData();

  return (
    <PublicShell >
      <HomePage data={data} />
    </PublicShell>
  );
}
