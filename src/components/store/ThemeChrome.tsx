/**
 * Storefront template host.
 *
 * Renders a published template's header / main / footer slots around the
 * route's own content. Context-aware widgets receive their live data through
 * `contextSlots`; when a theme publishes no main sections the route's default
 * body is used, so a store is never blank because a template is missing.
 */
import type { ReactNode } from "react";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { CartProvider, useLiveCart } from "@/components/builder/CartContext";
import { VitalsReporter } from "@/components/store/VitalsReporter";
import { TrafficReporter } from "@/components/store/TrafficReporter";
import { SiteKitSurface, type StorefrontSiteKit } from "@/components/store/SiteKitTags";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { useLangScope } from "@/lib/i18n";
import { compileResponsiveCss } from "@/lib/responsive-css";
import {
  type Section,
  type SectionType,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";

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
  /** Store slug — namespaces channel state and server bundle quotes. */
  storeSlug?: string;
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
  ownsPrimary?: boolean;
  containerClassName?: string;
  /**
   * Phase 17: the merchant's theme assets, already combined and sanitised on
   * the server (`storefrontThemeCss`). Inlined for the same reason as the
   * responsive sheet — it is tiny, tenant-specific and on the critical path.
   */
  customCss?: string | null;
};

/** Exactly one section per page may render the h1. */
export function primarySectionId(ast: ThemeAst | null): string | null {
  if (!ast) return null;
  const candidates = ast.main.filter((s) => !s.invalid);
  const heading = (s: Section) =>
    s.type === "hero" || (typeof s.props["heading"] === "string" && s.props["heading"]);
  return candidates.find((s) => s.type === "hero")?.id ?? candidates.find(heading)?.id ?? null;
}

/**
 * Phase 2.5: one live cart per storefront render. Every cart widget under it
 * shares a single server quote, so a page with a line list, a summary and a
 * drawer costs one round trip per change instead of three.
 */
function LiveCartScope({ slug, children }: { slug: string; children: React.ReactNode }) {
  const cart = useLiveCart(slug);
  return <CartProvider value={cart}>{children}</CartProvider>;
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
  merchantId,
  siteKit,
  fallback,
  ownsPrimary = false,
  containerClassName = "mx-auto max-w-6xl px-4 py-8",
  customCss = null,
}: Props) {
  // Phase 2.1: language choice is remembered per storefront.
  useLangScope(storeSlug ?? null);
  const themed = ast && ast.main.length > 0 ? ast : null;
  // Header and footer are site chrome: they must survive a template whose body
  // the route renders itself (cart, checkout, search). Dropping them with the
  // body left shoppers on a page with no store navigation and no policy links.
  const chromeAst = ast && (ast.header.length > 0 || ast.footer.length > 0) ? ast : null;
  const primary = ownsPrimary ? null : primarySectionId(themed);
  // Phase 5: the per-device layout overrides authored in the studio are
  // compiled once per render into a range-scoped stylesheet. It is inlined
  // (not linked) because it is template-specific, tiny, budget-capped and on
  // the critical path — a request for it would cost more than the bytes.
  const responsive = compileResponsiveCss(themed);

  const body = (
    <ThemeSurface tokens={tokens}>
      {responsive.css ? (
        <style
          data-fq-responsive={String(responsive.rules)}
          dangerouslySetInnerHTML={{ __html: responsive.css }}
        />
      ) : null}
      {customCss ? (
        <style data-fq-theme-assets="" dangerouslySetInnerHTML={{ __html: customCss }} />
      ) : null}
      <VitalsReporter merchantId={merchantId} template={template ?? "unknown"} />
      <TrafficReporter merchantId={merchantId} template={template ?? "unknown"} />
      <SiteKitSurface siteKit={siteKit ?? null} />
      {chrome}
      {chromeAst && chromeAst.header.length > 0 && (
        <div className="mx-auto max-w-6xl space-y-2 px-4 pt-4">
          {chromeAst.header.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              template={template}
              storeSlug={storeSlug}
              contextSlots={contextSlots}
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
                contextSlots={contextSlots}
                productSlot={productSlot}
                collectionSlot={collectionSlot}
                primary={section.id === primary}
              />
            ))}
          </div>
        ) : (
          fallback
        )}
      </main>
      {chromeAst && chromeAst.footer.length > 0 && (
        <footer className="mx-auto max-w-6xl space-y-2 px-4 pb-10">
          {chromeAst.footer.map((section) => (
            <SectionRenderer
              key={section.id}
              section={section}
              template={template}
              storeSlug={storeSlug}
              contextSlots={contextSlots}
            />
          ))}
        </footer>
      )}
    </ThemeSurface>
  );

  // Without a slug (studio preview) the widgets fall back to the demo cart.
  return storeSlug ? <LiveCartScope slug={storeSlug}>{body}</LiveCartScope> : body;
}
