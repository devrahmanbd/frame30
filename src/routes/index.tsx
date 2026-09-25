import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/public/PublicShell";
import { StoreHomepage } from "@/components/store/StoreHomepage";
import { StoreWelcome } from "@/components/store/StoreWelcome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { getLanding } from "@/lib/landing.functions";
import { getSiteContext } from "@/lib/site-seo.functions";
import {
  getStorefront,
  resolveStorefrontHostFn,
} from "@/lib/storefront.functions";
import { buildMarketingHead, buildGraph } from "@/lib/marketing-seo";
import { buildPageHead, buildStoreHead } from "@/lib/theme-seo";
import { fontHeadLinks } from "@/lib/theme-fonts";
import { astJsonLd } from "@/lib/structured-data";
import { flattenAst } from "@/lib/builder-ast";
import { verificationTags } from "@/lib/search-console";
import { FAQ_ROWS } from "@/lib/landing";
import { en } from "@/lib/i18n-dict";
import { HomePage } from "@/components/public/landing";

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): { preview_token?: string } => ({
    preview_token:
      typeof s.preview_token === "string" ? s.preview_token : undefined,
  }),
  // Dual-mode document:
  // - Custom host with an ACTIVE merchant_domains row → that merchant's
  //   storefront (microscrop.shop serves its store at `/`).
  // - Every other host (platform origins, unknown, inactive) → the platform
  //   landing. The landing path is failure-tolerant exactly as before:
  //   `loadLanding` never throws, so prerender and SSR cannot 500.
  loader: async ({ location }: any) => {
    let host: Awaited<ReturnType<typeof resolveStorefrontHostFn>> = null;
    try {
      host = await resolveStorefrontHostFn();
    } catch {
      host = null;
    }
    if (host) {
      try {
        let previewToken: string | undefined;
        try {
          const raw = new URL(
            location?.href ?? "",
            "http://localhost",
          ).searchParams.get("preview_token");
          previewToken = typeof raw === "string" && raw ? raw : undefined;
        } catch {
          previewToken = undefined;
        }
        const storefront = await getStorefront({
          data: { slug: host.merchantSlug, previewToken },
        });
        if (storefront) return { kind: "store" as const, host, storefront };
      } catch {
        // A broken storefront on a custom host falls through to the landing
        // rather than 500ing the merchant's domain.
      }
    }
    const [landing, site] = await Promise.all([getLanding(), getSiteContext()]);
    return { kind: "landing" as const, ...landing, origin: site.origin };
  },
  head: ({ loaderData }) => {
    if (loaderData?.kind === "store") {
      const { host, storefront } = loaderData;
      // CMS-designated homepage on a custom domain: canonical stays `/`.
      if (storefront.homepage) {
        const home = storefront.homepage;
        return buildPageHead({
          origin: storefront.origin,
          path: "/",
          storePath: `/`,
          storeName: storefront.merchant.name,
          themeKey: home.themeKey,
          robots: home.page.robots,
          noindex: (home.page.robots ?? "").startsWith("noindex"),
          seo: home.seo ?? null,
          page: home.page,
        });
      }
      const custom = storefront.customCode?.headTags ?? [];
      const base = buildStoreHead({
        origin: storefront.origin,
        path: `/`,
        storeName: storefront.merchant.name,
        themeKey: storefront.themeKey,
        tagline: storefront.settings?.tagline ?? null,
        seo: storefront.seo,
        products: storefront.products.map((p) => ({
          title: p.title,
          slug: p.slug,
          image_url: p.image_url,
        })),
      });
      const previewMeta = storefront.preview
        ? [{ name: "robots", content: "noindex, nofollow" }]
        : [];
      return {
        ...base,
        meta: [
          ...previewMeta,
          ...(base.meta ?? []),
          ...verificationTags(storefront.siteKit.verification),
          ...custom.filter((t) => t.tag === "meta").map((t) => t.attrs),
        ],
        links: [
          ...(base.links ?? []),
          ...fontHeadLinks(
            storefront.tokens ?? {
              fontDisplay: "Noto Sans Bengali",
              fontBody: "Inter",
            },
          ),
          ...custom.filter((t) => t.tag === "link").map((t) => t.attrs),
        ],
        scripts: [
          ...(base.scripts ?? []),
          ...astJsonLd(
            storefront.ast,
            {
              storeName: storefront.merchant.name,
              url: storefront.origin ? `${storefront.origin}/` : null,
            },
            flattenAst,
          ).map((node) => ({
            type: "application/ld+json",
            children: JSON.stringify(node).replace(/</g, "\\u003c"),
          })),
          ...custom
            .filter(
              (t): t is Extract<typeof t, { tag: "script" }> =>
                t.tag === "script",
            )
            .map((t) => ({ ...t.attrs, children: t.children })),
        ],
      };
    }
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
      scripts: graph
        ? [{ type: "application/ld+json", children: JSON.stringify(graph) }]
        : [],
    };
  },
  component: PlatformHome,
});

function PlatformHome() {
  const data = Route.useLoaderData();

  // Custom-domain traffic renders the merchant storefront chrome directly —
  // no platform shell, no marketing sections.
  if (data.kind === "store") {
    if (data.storefront.homepage) {
      return (
        <StoreHomepage
          home={data.storefront.homepage}
          slug={data.host.merchantSlug}
        />
      );
    }
    // Themeless custom host: welcome fallback still carries the plugin layer
    // so footer mounts (chat bubbles etc.) render without a theme — same
    // wrap pattern as store.$slug.index.tsx.
    return (
      <PluginLayer plugins={data.storefront.installedPlugins ?? []}>
        <StoreWelcome
          slug={data.host.merchantSlug}
          name={data.storefront.merchant.name}
          custom
          tokens={data.storefront.tokens}
        />
      </PluginLayer>
    );
  }

  return (
    <PublicShell>
      <HomePage data={data} />
    </PublicShell>
  );
}
