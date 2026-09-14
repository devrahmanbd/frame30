import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";
import { MarketingPlaceholderImage } from "@/components/public/MarketingPlaceholderImage";

import { DocsSearch } from "@/components/docs/DocsSearch";
import { DocsAiWidget } from "@/components/docs/DocsAiWidget";
import { PublicShell } from "@/components/public/PublicShell";
import { useLang } from "@/lib/i18n";
import { CURRENT_VERSION, DOC_VERSIONS, docNav, docOrder, endpointRows, latestUpdate } from "@/lib/docs";
import { buildGraph, buildMarketingHead } from "@/lib/marketing-seo";
import { getSiteContext } from "@/lib/site-seo.functions";

/** The docs entry point: search, the full map, and what the API can actually do. */
export const Route = createFileRoute("/docs/")({
  loader: async () => {
    const site = await getSiteContext().catch(() => null);
    return { origin: site.origin};
  },
  head: ({ loaderData }) => {
    const origin = loaderData?.origin ?? null;
    const head = buildMarketingHead({ route: "docs", origin });
    const graph = buildGraph({ route: "docs", origin });
    return {
      meta: head.meta,
      links: head.links,
      scripts: graph ? [{ type: "application/ld+json", children: JSON.stringify(graph) }] : []};
  },
  component: DocsIndex});

function DocsIndex() {
  const { lang } = useLang();
  
  const nav = docNav(CURRENT_VERSION);
  const pageCount = docOrder(CURRENT_VERSION).length;
  const endpoints = endpointRows().length;

  return (
    <PublicShell >
      <div className="mx-auto max-w-5xl px-4 py-12">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CURRENT_VERSION} · updated {latestUpdate()}
          </p>
          <h1 className="mt-2 font-bangla-display text-4xl font-bold">Developer documentation</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {pageCount} pages covering {endpoints} public endpoints, OAuth and API keys, signed webhooks, rate
            limits, error handling, and how to author themes and apps. Every sample here is runnable.
          </p>
        </header>

        <div className="mt-8 max-w-xl">
          <DocsSearch version={CURRENT_VERSION} />
        </div>

        <div className="mt-4 flex flex-col sm:flex-row flex-wrap gap-3 text-sm">
          <Link
            to="/docs/$version/$slug"
            params={{ version: CURRENT_VERSION, slug: "quickstart" }}
            className="w-full sm:w-auto min-h-11 inline-flex items-center justify-center gap-2 rounded-fq-md fq-cta-primary px-5 py-2.5 font-semibold group"
          >
            <span>Start the quickstart</span>
            <AnimatedIcon icon={ArrowRight} variant="magnetic" size="sm" />
          </Link>
          <Link
            to="/docs/$version/$slug"
            params={{ version: CURRENT_VERSION, slug: "rest-api" }}
            className="w-full sm:w-auto min-h-11 inline-flex items-center justify-center rounded-fq-md border border-border px-5 py-2.5 font-semibold"
          >
            API reference
          </Link>
        </div>

        <div className="mt-10 fq-feature-card overflow-hidden">
          <div className="fq-feature-card-glow" />
          <div className="relative z-10">
          <MarketingPlaceholderImage
            alt="Prompt: Conceptual 3D visualization of REST API endpoints and Webhook payload packets seamlessly flowing into an e-commerce database, glowing neon accents on slate dark background, clean isometric perspective, 8k resolution, aspect ratio 16:9."
            aspect="16/9"
            badge="API Engine"
            caption="Low-latency REST endpoints and cryptographically signed webhooks for Bangladesh commerce."
          />
          </div>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {nav.map((group) => (
            <section key={group.id}>
              <h2 className="font-bangla-display text-xl font-bold">{group.label[lang]}</h2>
              <ul className="mt-3 space-y-3">
                {group.pages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      to="/docs/$version/$slug"
                      params={{ version: CURRENT_VERSION, slug: page.slug }}
                      className="block fq-feature-card p-4 relative"
                    >
                      <div className="fq-feature-card-glow" />
                      <div className="z-10 relative">
                        <span className="font-medium text-foreground">{page.title[lang]}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">{page.summary[lang]}</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <section className="mt-14 rounded-fq-md border border-border bg-card p-6">
          <h2 className="font-bangla-display text-xl font-bold">Versions</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {DOC_VERSIONS.map((version) => (
              <li key={version.id} className="flex flex-wrap items-center gap-2">
                <Link
                  to="/docs/$version/$slug"
                  params={{ version: version.id, slug: "quickstart" }}
                  // "v1" is two glyphs wide, so the height floor alone leaves a
                  // 12×24 target. 2.5.8 is a both-axes rule.
                  className="fq-tap min-w-6 justify-center text-primary underline underline-offset-4"
                >
                  {version.label}
                </Link>
                <span className="text-muted-foreground">
                  released {version.released}
                  {version.sunsetOn ? ` · retires ${version.sunsetOn}` : " · current"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Breaking changes get a new version and 90 days' notice. Retired versions keep answering until their
            sunset date, and say so in a response header long before that.
          </p>
        </section>

        <section className="mt-10 text-sm text-muted-foreground">
          <p>
            Building for other merchants? See{" "}
            <Link to="/pricing" className="fq-tap text-primary underline underline-offset-4">
              pricing
            </Link>{" "}
            for plan limits that affect API quota, or{" "}
            <Link to="/contact" className="fq-tap text-primary underline underline-offset-4">
              contact the team
            </Link>{" "}
            about partner terms. The full feature map lives on{" "}
            <Link to="/features" className="fq-tap text-primary underline underline-offset-4">
              features
            </Link>
            .
          </p>
        </section>
      </div>
      <DocsAiWidget version={CURRENT_VERSION} />
    </PublicShell>
  );
}
