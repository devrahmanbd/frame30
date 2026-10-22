/**
 * Storefront template host.
 *
 * Renders a published template's header / main / footer slots around the
 * route's own content. Context-aware widgets receive their live data through
 * `contextSlots`; when a theme publishes no main sections the route's default
 * body is used, so a store is never blank because a template is missing.
 */
import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import type { DevThemeBinding } from "@/components/builder/SectionRenderer";
import type { UnifiedRegistry } from "@/lib/unified-widget-registry";
import { CartProvider, useLiveCart } from "@/components/builder/CartContext";
import { VitalsReporter } from "@/components/store/VitalsReporter";
import { TrafficReporter } from "@/components/store/TrafficReporter";
import {
  SiteKitSurface,
  type StorefrontSiteKit,
} from "@/components/store/SiteKitTags";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import {
  buildThemeFrameUrl,
  ThemeRuntime,
  type ThemeHostHandler,
} from "@/components/theme-runtime/ThemeRuntime";
import { StoreWelcome } from "@/components/store/StoreWelcome";
import { isCustomHostPath } from "@/lib/storefront-url";
import { useLangScope } from "@/lib/i18n";
import { compileResponsiveCss } from "@/lib/responsive-css";
import { fontStylesheetUrl } from "@/lib/theme-fonts";
import {
  type Section,
  type SectionType,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";
import { primarySectionId, usedWidgetSkins } from "@/lib/builder-ast";
import { themeRendersBody } from "@/lib/theme-body-slot";
import { filterSkinCss } from "@/lib/themes/assets";

type Props = {
  template: TemplateKey;
  ast: ThemeAst | null;
  tokens: ThemeTokens | null;
  /** Store chrome (header, support widget) rendered above the theme slots. */
  chrome?: ReactNode;
  contextSlots?: Partial<Record<SectionType, ReactNode>>;
  productSlot?: ReactNode;
  collectionSlot?: ReactNode;
  /** Used when the theme publishes no main sections for this template. */
  fallback: ReactNode;
  /** Display name for the themeless fallback. Defaults to the slug. */
  storeName?: string | null;
  /** Store slug — namespaces channel state and server bundle quotes. */
  storeSlug?: string;
  /**
   * Theme-remediation Task 3: explicit merchant theme key driving
   * per-theme widget resolution in every section below. Null/undefined
   * keeps the legacy unkeyed composition, byte-identical.
   */
  themeKey?: string | null;
  /**
   * Phase 4.4: when supplied, this page view reports field vitals (LCP/CLS/
   * INP) for the store. Absent in the studio preview, where lab numbers would
   * pollute a merchant's real-user data.
   */
  merchantId?: string | null;
  /** Set when a context slot renders the page h1, so no section claims it. */
  /**
   * Phase 5: verification metas and the consent-gated analytics plan. Mounted
   * here so no admin route can ever load a merchant's pixels.
   */
  siteKit?: StorefrontSiteKit | null;
  /**
   * The context section through which THIS route's body flows (authored
   * pages: `page_content`). The theme main renders only when it declares
   * that section; otherwise the route owns the body and `fallback` renders
   * in place of the theme's main — demo copy must never swallow merchant
   * content. Routes that name no slot keep the legacy behavior.
   */
  contentSlot?: SectionType;
  /**
   * The ROUTE's trailing action — rendered after the page body (the theme's
   * composition, or the route's fallback), inside the same `<main>`.
   *
   * The production checkout uses it to render the place-order action LAST: the
   * action belongs to the route, while the payment rail and the order total
   * belong to the theme's band — and the shopper must meet the action after
   * both, never before. The theme cannot place this slot, cannot fill it and
   * does not know it exists: it is the route's, not the theme's.
   */
  afterBody?: ReactNode;
  ownsPrimary?: boolean;
  containerClassName?: string;
  /**
   * Phase 17: the merchant's theme assets, already combined and sanitised on
   * the server (`storefrontThemeCss`). Inlined for the same reason as the
   * responsive sheet — it is tiny, tenant-specific and on the critical path.
   */
  customCss?: string | null;
  /**
   * Frame30 Level B — runtime binding for uploaded-theme widgets on the
   * storefront. Forwarded to every `SectionRenderer` below (pinned
   * identity AND version must match the def, else the explicit
   * placeholder). Deliberately WITHOUT a producer in this change: no
   * storefront loader projects the binding yet and no storefront `onCall`
   * implementation with server revalidation exists — a deny-all `onCall`
   * would silently break commerce, an allow-all would be default-allow —
   * so the prop stays absent and the storefront keeps the placeholder
   * until that host work lands. The prop existing now keeps the host diff
   * to binding-only when it does.
   */
  devThemeBinding?: DevThemeBinding | null;
  /**
   * Frame30 Level B storefront — route-local registry carrying the approved
   * theme defs the binding executes (built by the host from the PUBLISHED
   * manifest via `activeDevThemeWidgetDefs`, never the global singleton).
   * Absent keeps the legacy fallback registry path, byte-identical: binding
   * without resolvable defs stays placeholder (fail-closed).
   */
  registry?: UnifiedRegistry | null;
  /**
   * Custom-isolated theme mount (ThemeRuntime activation). Only a record
   * flagged `runtime: "custom-isolated"` with a valid immutable descriptor
   * renders through the sandboxed `ThemeRuntime` document (bridge v2, the
   * install's capability grants). Absent — or any other record, including a
   * missing flag — keeps the classic `ThemeSurface` renderer below,
   * byte-identical. Disabling the custom theme (prop absent again) reverts
   * to the previous renderer with no stranded frame.
   */
  isolatedTheme?: CustomIsolatedThemeMount | null;
};

/**
 * Custom-isolated theme mount descriptor: the theme record's runtime flag
 * plus everything `ThemeRuntime` needs — the version-pinned identity on the
 * controlled asset origin, the install's granted `theme:*` scopes (see
 * `buildThemeGrants`) and the host implementation behind bridge calls.
 */
export type CustomIsolatedThemeMount = {
  /** Runtime flag from the theme record: only this value mounts ThemeRuntime. */
  runtime: "custom-isolated";
  /** Controlled https origin serving version-pinned theme documents. */
  assetOrigin: string;
  /** Pinned theme identity (name + immutable version). */
  name: string;
  version: string;
  /** Granted `theme:*` scopes for this install. */
  granted: readonly string[];
  /** Exact https origins the theme may navigate to (empty = paths only). */
  navigateAllowlist?: readonly string[];
  /** Host implementation behind authorized bridge calls (server revalidates). */
  onCall: ThemeHostHandler;
  /**
   * Kill-switch liveness, fed from the install's live status: forwarded to
   * `ThemeRuntime`, where true refuses every bridge call as
   * `theme.suspended` before any host work. Absent = live. The frame still
   * mounts either way — suspension denies calls, it never strands the page.
   */
  suspended?: boolean;
  /** Descriptive frame title (defaults to the store name). */
  title?: string;
};

/**
 * Mount decision for custom-isolated themes. True ONLY for a record flagged
 * `runtime: "custom-isolated"` carrying a complete mount descriptor that
 * addresses a valid immutable theme document. Everything else — another
 * runtime, a missing flag, a malformed descriptor, an unaddressable
 * identity — is false, so the classic renderer below serves the page and the
 * storefront is never stranded on a blank frame.
 */
export function shouldUseIsolatedTheme(
  value: unknown,
): value is CustomIsolatedThemeMount {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as Partial<CustomIsolatedThemeMount>;
  if (r.runtime !== "custom-isolated") return false;
  if (
    typeof r.assetOrigin !== "string" ||
    typeof r.name !== "string" ||
    typeof r.version !== "string"
  )
    return false;
  if (!Array.isArray(r.granted)) return false;
  if (typeof r.onCall !== "function") return false;
  if (!buildThemeFrameUrl(r.assetOrigin, { name: r.name, version: r.version }))
    return false;
  return true;
}

/** Exactly one section per page may render the h1. Shared implementation
 *  lives in builder-ast so the storefront host and the theme preview agree;
 *  re-exported here for existing import paths. */
export { primarySectionId };

/**
 * Phase 2.5: one live cart per storefront render. Every cart widget under it
 * shares a single server quote, so a page with a line list, a summary and a
 * drawer costs one round trip per change instead of three.
 */
function LiveCartScope({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const cart = useLiveCart(slug);
  return <CartProvider value={cart}>{children}</CartProvider>;
}

/** True when the merchant has no theme at all: every route then serves the
 *  single shared welcome page instead of per-template fallbacks. */
export function isThemeless(
  ast: ThemeAst | null,
  tokens: ThemeTokens | null,
): boolean {
  return !ast && !tokens;
}

export function ThemeChrome({
  template,
  ast,
  tokens,
  chrome,
  contextSlots,
  productSlot,
  collectionSlot,
  storeSlug,
  themeKey,
  storeName,
  merchantId,
  siteKit,
  fallback,
  contentSlot,
  afterBody,
  ownsPrimary = false,
  containerClassName = "mx-auto max-w-6xl px-4 py-8",
  customCss = null,
  isolatedTheme = null,
  devThemeBinding = null,
  registry = null,
}: Props) {
  // Phase 2.1: language choice is remembered per storefront.
  useLangScope(storeSlug ?? null);
  let pathname = "";
  try {
    // Intentional: without a RouterProvider this hook throws; the catch is
    // the provider-absent resilience path (BlogArchiveTheme tests pin it).
    // eslint-disable-next-line react-hooks/rules-of-hooks
    pathname = useRouterState().location.pathname;
  } catch {
    pathname = "";
  }
  if (storeSlug && isThemeless(ast, tokens)) {
    return (
      <StoreWelcome
        slug={storeSlug}
        name={storeName ?? storeSlug}
        custom={isCustomHostPath(pathname)}
        tokens={tokens}
      />
    );
  }
  if (shouldUseIsolatedTheme(isolatedTheme)) {
    // Custom-isolated themes own the whole storefront inside the sandboxed
    // ThemeRuntime document (bridge v2, the install's capability grants).
    // SEO-critical metadata stays host-rendered per
    // docs/theme-runtime/limits.md: route `head()` (theme-seo) owns title /
    // meta / canonical / JSON-LD, and the verification/analytics surface
    // below stays mounted on the host — the frame contributes no crawlable
    // head. Classic sections are deliberately NOT rendered here; the theme
    // bundle owns presentation inside its document.
    const isolated = (
      <>
        <VitalsReporter
          merchantId={merchantId}
          template={template ?? "unknown"}
        />
        <TrafficReporter
          merchantId={merchantId}
          template={template ?? "unknown"}
        />
        <SiteKitSurface siteKit={siteKit ?? null} />
        <ThemeRuntime
          title={isolatedTheme.title ?? storeName ?? "Custom theme"}
          assetOrigin={isolatedTheme.assetOrigin}
          theme={{ name: isolatedTheme.name, version: isolatedTheme.version }}
          granted={isolatedTheme.granted}
          navigateAllowlist={isolatedTheme.navigateAllowlist ?? []}
          onCall={isolatedTheme.onCall}
          suspended={isolatedTheme.suspended}
        />
      </>
    );
    return storeSlug ? (
      <LiveCartScope slug={storeSlug}>{isolated}</LiveCartScope>
    ) : (
      isolated
    );
  }
  const base = isCustomHostPath(pathname)
    ? ""
    : storeSlug
      ? `/store/${storeSlug}`
      : "";
  // A route may name the context section its body flows through
  // (`page_content` for authored pages). The theme's main renders only when
  // it declares that section — otherwise the theme's demo copy would
  // swallow the body the route owns, and the route fallback renders
  // instead. Chrome, tokens and CSS are unaffected.
  // `themeRendersBody` is the shared predicate: the hosts that lay the page
  // out around the theme's body ask the SAME question, so the theme's choice
  // and the host's layout can never disagree.
  const themed = themeRendersBody(ast, contentSlot) ? ast : null;
  // Header and footer are site chrome: they must survive a template whose body
  // the route renders itself (cart, checkout, search). Dropping them with the
  // body left shoppers on a page with no store navigation and no policy links.
  const chromeAst =
    ast && (ast.header.length > 0 || ast.footer.length > 0) ? ast : null;
  const primary = ownsPrimary ? null : primarySectionId(themed);
  // Phase 5: the per-device layout overrides authored in the studio are
  // compiled once per render into a range-scoped stylesheet. It is inlined
  // (not linked) because it is template-specific, tiny, budget-capped and on
  // the critical path — a request for it would cost more than the bytes.
  const responsive = compileResponsiveCss(themed);
  const fontUrl = tokens ? fontStylesheetUrl(tokens) : null;
  // Lane B2-1: per-page skin filtering. The server combines every enabled
  // merchant asset per tenant (`storefrontThemeCss`); skin-scoped rules
  // (`[data-widget][data-skin]`) for skins this page does not render are
  // dropped here, where the rendered sections are known. Fail-open: any
  // failure inlines the full stylesheet, today's behavior.
  let pageCss = customCss;
  try {
    const used = usedWidgetSkins({
      header: chromeAst?.header ?? [],
      main: themed?.main ?? [],
      footer: chromeAst?.footer ?? [],
    }).map((skin) => skin.key);
    pageCss = filterSkinCss(customCss, used);
  } catch {
    pageCss = customCss;
  }

  const body = (
    <ThemeSurface tokens={tokens}>
      {fontUrl ? (
        <link rel="stylesheet" href={fontUrl} crossOrigin="anonymous" />
      ) : null}
      {responsive.css ? (
        <style
          data-fq-responsive={String(responsive.rules)}
          dangerouslySetInnerHTML={{ __html: responsive.css }} // sast-allow: html-sink -- compileResponsiveCss EMITTERS emit only clamped numbers and oneOf vocabulary values under generated selectors
        />
      ) : null}
      {pageCss ? (
        <style
          data-fq-theme-assets=""
          dangerouslySetInnerHTML={{ __html: pageCss }} // sast-allow: html-sink -- storefrontThemeCss via combineThemeCss/sanitiseThemeCss strips code-loading CSS, filterSkinCss only drops rules
        />
      ) : null}
      <VitalsReporter
        merchantId={merchantId}
        template={template ?? "unknown"}
      />
      <TrafficReporter
        merchantId={merchantId}
        template={template ?? "unknown"}
      />
      <SiteKitSurface siteKit={siteKit ?? null} />
      {chromeAst &&
        chromeAst.header
          .filter((section) => section.type === "subbrand_bar")
          .map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              template={template}
              storeSlug={storeSlug}
              themeKey={themeKey}
              devThemeBinding={devThemeBinding ?? undefined}
              registry={registry ?? undefined}
              contextSlots={contextSlots}
              linkBase={base}
            />
          ))}
      {chrome}
      {chromeAst &&
        chromeAst.header.some((section) => section.type !== "subbrand_bar") && (
          <div className="mx-auto max-w-7xl space-y-2 px-4 sm:px-6 lg:px-8 pt-4">
            {chromeAst.header
              .filter((section) => section.type !== "subbrand_bar")
              .map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  template={template}
                  storeSlug={storeSlug}
                  themeKey={themeKey}
                  devThemeBinding={devThemeBinding ?? undefined}
                  registry={registry ?? undefined}
                  contextSlots={contextSlots}
                  linkBase={base}
                />
              ))}
          </div>
        )}
      <main className={containerClassName}>
        {themed ? (
          <div className="space-y-8">
            {themed.main.map((section) => (
              <SectionRenderer
                key={section.id}
                section={section}
                template={template}
                storeSlug={storeSlug}
                themeKey={themeKey}
                devThemeBinding={devThemeBinding ?? undefined}
                registry={registry ?? undefined}
                contextSlots={contextSlots}
                productSlot={productSlot}
                collectionSlot={collectionSlot}
                primary={section.id === primary}
                linkBase={base}
              />
            ))}
          </div>
        ) : (
          fallback
        )}
        {/* The ROUTE's trailing action — after the theme's composition, so a
            route-owned control (the checkout's place-order action) can come
            last. */}
        {afterBody}
      </main>
      {chromeAst && chromeAst.footer.length > 0 && (
        <footer className="w-full pt-16 bg-[var(--theme-muted)] text-[var(--theme-ink)] border-t border-[var(--theme-border)]">
          <div className="mx-auto max-w-7xl space-y-8 px-4 sm:px-6 lg:px-8 pb-16">
            {chromeAst.footer.map((section) => (
              <SectionRenderer
                key={section.id}
                section={section}
                template={template}
                storeSlug={storeSlug}
                themeKey={themeKey}
                devThemeBinding={devThemeBinding ?? undefined}
                registry={registry ?? undefined}
                contextSlots={contextSlots}
                linkBase={base}
              />
            ))}
          </div>
        </footer>
      )}
    </ThemeSurface>
  );

  // Without a slug (studio preview) the widgets fall back to the demo cart.
  // NOTE: plugin rendering lives in `PluginLayer`, never here — this file
  // is theme territory and must not import plugin modules.
  return storeSlug ? (
    <LiveCartScope slug={storeSlug}>{body}</LiveCartScope>
  ) : (
    body
  );
}
