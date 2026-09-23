import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { StoreHomepage } from "@/components/store/StoreHomepage";
import { StoreWelcome } from "@/components/store/StoreWelcome";
import { PluginFooterMounts } from "@/components/store/PluginFooterMounts";
import { PluginProvider } from "@/components/builder/PluginContext";

import { buildPageHead, buildStoreHead } from "@/lib/theme-seo";
import { fontHeadLinks } from "@/lib/theme-fonts";
import { astJsonLd } from "@/lib/structured-data";
import { flattenAst } from "@/lib/builder-ast";

import { verificationTags } from "@/lib/search-console";
import {
  getStorefront,
  resolveStoreRedirectFn,
} from "@/lib/storefront.functions";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/")({
  validateSearch: (s: Record<string, unknown>): { preview_token?: string } => ({
    preview_token:
      typeof s.preview_token === "string" ? s.preview_token : undefined,
  }),
  /**
   * `redirect_to_primary`: when the merchant owns an active primary custom
   * domain, `/store/<slug>` path traffic 301s to `https://<primary>/`.
   * Already on the primary host (or no primary) → null → keep serving.
   * Never throws: resolution failure degrades to no-redirect.
   */
  beforeLoad: async ({ params, location }: any) => {
    try {
      const { to } = await resolveStoreRedirectFn({
        data: { slug: params.slug as string },
      });
      if (to) {
        let search = "";
        try {
          const raw = new URL(location?.href ?? "", "http://localhost").search;
          search = raw || "";
        } catch {
          search = "";
        }
        throw redirect({
          href: `${to.replace(/\/$/, "")}/${search}`,
          statusCode: 301,
        });
      }
    } catch (err) {
      // A redirect throw must pass through; anything else is swallowed so a
      // failed check never breaks the storefront.
      if (
        err &&
        typeof err === "object" &&
        "options" in err &&
        (err as { options?: { href?: string } }).options?.href
      )
        throw err;
    }
  },
  // NOTE: this repo's TanStack version does NOT pass `search` to route
  // loaders (verified in router-core load-matches.js: getLoaderContext
  // carries params/deps/location but no search key), so the token is read
  // off the request URL directly. validateSearch above still documents +
  // types the param for Links and useSearch consumers.
  loader: async ({ params, location }: any) => {
    let previewToken: string | undefined;
    try {
      // location.href may be origin-relative in SSR ("/store/x?..."); the
      // dummy base is ignored when href is already absolute.
      const raw = new URL(location.href, "http://localhost").searchParams.get(
        "preview_token",
      );
      previewToken = typeof raw === "string" && raw ? raw : undefined;
    } catch {
      previewToken = undefined;
    }
    const data = await getStorefront({
      data: { slug: params.slug as string, previewToken },
    });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Store unavailable" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    // CMS-designated homepage: the page's own title/robots win; the URL
    // stays `/store/<slug>`.
    if (loaderData.homepage) {
      const home = loaderData.homepage;
      return buildPageHead({
        origin: loaderData.origin,
        path: `/store/${params.slug}`,
        storePath: `/store/${params.slug}`,
        storeName: loaderData.merchant.name,
        themeKey: home.themeKey,
        robots: home.page.robots,
        noindex: (home.page.robots ?? "").startsWith("noindex"),
        seo: home.seo ?? null,
        page: home.page,
      });
    }
    // Phase 4: merchant head snippet (verification metas, canonical/alternate
    // links, JSON-LD) is appended after the platform's own tags so it can
    // supplement but never silently replace them.
    const custom = loaderData.customCode?.headTags ?? [];
    const base = buildStoreHead({
      origin: loaderData.origin,
      path: `/store/${params.slug}`,
      storeName: loaderData.merchant.name,
      themeKey: loaderData.themeKey,
      tagline: loaderData.settings?.tagline ?? null,
      seo: loaderData.seo,
      products: loaderData.products.map((p) => ({
        title: p.title,
        slug: p.slug,
        image_url: p.image_url,
      })),
    });
    const previewMeta = loaderData.preview
      ? [{ name: "robots", content: "noindex, nofollow" }]
      : [];
    return {
      ...base,
      meta: [
        ...previewMeta,
        ...(base.meta ?? []),
        // Phase 5: search-engine ownership tags, server-rendered so a crawler
        // sees them on the very first fetch.
        ...verificationTags(loaderData.siteKit.verification),
        ...custom.filter((t) => t.tag === "meta").map((t) => t.attrs),
      ],
      // Phase 3: typography links are derived from this store's own pairing,
      // so a theme never pays for a family it does not use.
      links: [
        ...(base.links ?? []),
        ...fontHeadLinks(
          loaderData.tokens ?? {
            fontDisplay: "Noto Sans Bengali",
            fontBody: "Inter",
          },
        ),
        ...custom.filter((t) => t.tag === "link").map((t) => t.attrs),
      ],
      scripts: [
        ...(base.scripts ?? []),
        // Phase 7.2: schema emitted by the widgets that are actually on the
        // page (FAQ, how-to, store locator, video), derived from the AST.
        ...astJsonLd(
          loaderData.ast,
          {
            storeName: loaderData.merchant.name,
            url: loaderData.origin
              ? `${loaderData.origin}/store/${params.slug}`
              : null,
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
  },
  component: StorefrontHome,
  notFoundComponent: StoreMissing,
});

function StoreMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">
        {t("Store not found", "দোকান পাওয়া যায়নি")}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {t("This storefront is not published.", "এই দোকানটি প্রকাশিত হয়নি।")}
      </p>
    </main>
  );
}

function StorefrontHome() {
  const data = Route.useLoaderData();
  const { slug } = Route.useParams();
  if (data.homepage) {
    return <StoreHomepage home={data.homepage} slug={slug} />;
  }
  // No designated homepage: every store shows the welcome plate instead
  // of the theme index. Footer plugin widgets mount here too — themeless
  // stores get their chat bubble on this very page.
  return (
    <PluginProvider plugins={data.installedPlugins ?? []}>
      <StoreWelcome
        slug={slug}
        name={data.merchant.name}
        custom={false}
      />
      <PluginFooterMounts />
    </PluginProvider>
  );
}
