import { useCallback, useMemo } from "react";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { StoreHomepage } from "@/components/store/StoreHomepage";
import { StoreWelcome } from "@/components/store/StoreWelcome";
import { PluginLayer } from "@/components/store/PluginLayer";
import {
  ThemeChrome,
  type CustomIsolatedThemeMount,
} from "@/components/store/ThemeChrome";

import { buildPageHead, buildStoreHead } from "@/lib/theme-seo";
import { fontHeadLinks } from "@/lib/theme-fonts";
import { astJsonLd } from "@/lib/structured-data";
import { flattenAst } from "@/lib/builder-ast";

import { verificationTags } from "@/lib/search-console";
import {
  getStorefront,
  resolveStoreRedirectFn,
} from "@/lib/storefront.functions";
import {
  StorefrontError,
  isStorefrontInfrastructureError,
  normalizeStorefrontLoaderError,
} from "@/components/store/StorefrontError";
import { useLang } from "@/lib/i18n";

/**
 * Frame30 Level B storefront bridge — server half of the custom-isolated
 * theme `onCall` for the PUBLISHED store homepage.
 *
 * PUBLIC path only (shoppers, no auth): every invocation revalidates
 * against live rows for THIS slug's merchant via
 * `resolveStorefrontDevThemeCall` (tenant from the URL slug, prices/stock
 * from the catalog, forbidden price/tenant/payment fields refused, unknown
 * methods denied, `cart.add` server-repriced from live rows). The install's
 * live status is checked per envelope (`loadStorefrontDevThemeSuspension`):
 * a revoked install refuses the next call as `theme.suspended` before any
 * data read. The navigate allowlist is re-derived from the published
 * projection per call (fail-closed to paths-only), never from frame input.
 * Failures surface as `theme.*` Errors so the bridge maps them without
 * leaking internals; the frame is untrusted input throughout.
 */
export const storefrontDevThemeCallFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        method: z.string().min(1).max(64),
        params: z.unknown(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ result: Json }> => {
    const { publicClient } = await import("@/lib/pricing.server");
    const {
      resolveStorefrontDevThemeCall,
      loadPublishedDevThemeProjection,
      loadStorefrontDevThemeSuspension,
    } = await import("@/lib/storefront-dev-theme.server");
    const db = publicClient();
    const slug = data.slug.trim();
    let navigateAllowlist: readonly string[] = [];
    try {
      const { data: merchant } = await db
        .from("merchants")
        .select("id")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      const merchantId = (merchant as unknown as { id?: unknown } | null)?.id;
      if (typeof merchantId === "string" && merchantId) {
        const projection = await loadPublishedDevThemeProjection(
          db as never,
          merchantId,
        ).catch(() => null);
        if (projection) {
          navigateAllowlist = projection.binding.navigateAllowlist ?? [];
        }
      }
    } catch {
      navigateAllowlist = [];
    }
    let suspended = true;
    try {
      suspended = await loadStorefrontDevThemeSuspension(db as never, slug);
    } catch {
      suspended = true;
    }
    try {
      const result = await resolveStorefrontDevThemeCall(
        db as never,
        slug,
        data.method,
        data.params,
        { navigateAllowlist, suspended },
      );
      return { result: result as Json };
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "theme.host_error");
    }
  });

/**
 * Build ThemeChrome's `isolatedTheme` mount for the published homepage from
 * loader data the route already holds. Pure, fail-closed: returns null
 * unless `resolvePublishedStorefrontIsolatedInputs` admits the projection
 * (approved ACTIVE release, published document, unpinned, unpreviewed).
 * The mount's `onCall` delegates to the server half above, so every bridge
 * call revalidates server-side with live suspension per envelope.
 */
export function buildHomepageIsolatedTheme(
  inputs: {
    assetOrigin: string;
    name: string;
    version: string;
    granted: readonly string[];
    navigateAllowlist: readonly string[];
  } | null,
  opts: {
    slug: string;
    storeName: string;
    call: (method: string, params: unknown) => Promise<unknown>;
  },
): CustomIsolatedThemeMount | null {
  try {
    if (!inputs) return null;
    if (
      typeof inputs.assetOrigin !== "string" ||
      !inputs.assetOrigin ||
      typeof inputs.name !== "string" ||
      !inputs.name ||
      typeof inputs.version !== "string" ||
      !inputs.version ||
      !Array.isArray(inputs.granted)
    ) {
      return null;
    }
    return {
      runtime: "custom-isolated",
      assetOrigin: inputs.assetOrigin,
      name: inputs.name,
      version: inputs.version,
      granted: [...inputs.granted],
      navigateAllowlist: [...(inputs.navigateAllowlist ?? [])],
      onCall: async (method: string, params: unknown) =>
        opts.call(method, params),
      title: opts.storeName,
    };
  } catch {
    return null;
  }
}

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
  beforeLoad: async ({ params, location }) => {
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
  loader: async ({ params, location }) => {
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
    let data;
    try {
      data = await getStorefront({
        data: { slug: params.slug as string, previewToken },
      });
    } catch (err) {
      // Infrastructure blips (5xx/timeout) reach the shared errorComponent
      // with retry; only a null payload below becomes a 404.
      if (!isStorefrontInfrastructureError(err)) throw err;
      throw normalizeStorefrontLoaderError(err);
    }
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
  errorComponent: StorefrontError,
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
  const call = useServerFn(storefrontDevThemeCallFn);
  const onCall = useCallback(
    async (method: string, params: unknown): Promise<unknown> => {
      const out = await call({ data: { slug, method, params } });
      return (out as { result: unknown }).result;
    },
    [call, slug],
  );
  // Level B isolated mount: approved ACTIVE release only, published
  // document only (preview drafts and CMS-pinned pages never mount — the
  // gate lives in `resolvePublishedStorefrontIsolatedInputs`, read here and
  // never reimplemented). Null keeps the classic homepage below,
  // byte-identical. NOTE (sibling seam): per-envelope client `suspended`
  // reaches ThemeRuntime once ThemeChrome forwards it; server suspension is
  // already live per call via the server half above, and freshness is live
  // per message via ThemeRuntime's host clock.
  const isolatedTheme = useMemo(() => {
    try {
      const d = data as unknown as {
        preview?: unknown;
        devThemeBinding?: unknown;
        homepage?: { page?: { theme_id?: unknown } } | null;
      };
      const pageThemeId =
        d.homepage && typeof d.homepage === "object"
          ? ((d.homepage.page as { theme_id?: unknown } | undefined)
              ?.theme_id ?? null)
          : null;
      // Render-safe mirror of `resolvePublishedStorefrontIsolatedInputs`
      // (the server lane owns the canonical gate; this inlines the same
      // three plain-data checks so no server import enters the client
      // bundle): preview drafts never mount, CMS-pinned pages never inherit
      // the active theme's binding, malformed inputs never mount.
      if (d.preview === true) return null;
      if (typeof pageThemeId === "string" && pageThemeId.trim().length > 0) {
        return null;
      }
      const b = d.devThemeBinding as unknown as {
        assetOrigin?: unknown;
        theme?: { name?: unknown; version?: unknown };
        granted?: unknown;
        navigateAllowlist?: unknown;
      } | null;
      if (!b || typeof b !== "object") return null;
      if (
        typeof b.assetOrigin !== "string" ||
        !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(b.assetOrigin)
      ) {
        return null;
      }
      const t = b.theme;
      if (
        !t ||
        typeof t.name !== "string" ||
        typeof t.version !== "string" ||
        !/^[a-z0-9-]{1,64}$/.test(t.name) ||
        !/^\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[a-z0-9.-]{1,32})?$/i.test(t.version)
      ) {
        return null;
      }
      if (!Array.isArray(b.granted)) return null;
      return buildHomepageIsolatedTheme(
        {
          assetOrigin: b.assetOrigin,
          name: t.name,
          version: t.version,
          granted: (b.granted as unknown[]).filter(
            (s): s is string => typeof s === "string",
          ),
          navigateAllowlist: Array.isArray(b.navigateAllowlist)
            ? (b.navigateAllowlist as unknown[]).filter(
                (s): s is string => typeof s === "string",
              )
            : [],
        },
        { slug, storeName: data.merchant.name, call: onCall },
      );
    } catch {
      return null;
    }
  }, [data, slug, onCall]);
  if (isolatedTheme) {
    // Full custom themes own the whole storefront inside the sandboxed
    // ThemeRuntime document; SEO stays host-rendered via head() above.
    // Classic sections are deliberately not rendered here.
    const d = data as unknown as {
      siteKit?: { verification?: unknown } | null;
      homepage?: {
        ast?: unknown;
        tokens?: unknown;
        themeKey?: unknown;
        siteKit?: unknown;
        customCss?: unknown;
      } | null;
    };
    const home = d.homepage;
    return (
      <ThemeChrome
        template="page"
        storeSlug={slug}
        themeKey={
          (typeof home?.themeKey === "string" ? home.themeKey : null) ??
          data.themeKey ??
          null
        }
        merchantId={data.merchant.id}
        ast={(home?.ast ?? data.ast ?? null) as never}
        tokens={(home?.tokens ?? data.tokens ?? null) as never}
        siteKit={(home?.siteKit ?? d.siteKit ?? null) as never}
        customCss={(home?.customCss ?? null) as never}
        ownsPrimary
        fallback={null}
        isolatedTheme={isolatedTheme}
      />
    );
  }
  if (data.homepage) {
    return <StoreHomepage home={data.homepage} slug={slug} />;
  }
  // No designated homepage: every store shows the welcome plate instead
  // of the theme index. Footer plugin widgets mount here too — themeless
  // stores get their chat bubble on this very page.
  return (
    <PluginLayer plugins={data.installedPlugins ?? []}>
      <StoreWelcome
        slug={slug}
        name={data.merchant.name}
        custom={false}
        tokens={data.tokens}
      />
    </PluginLayer>
  );
}
