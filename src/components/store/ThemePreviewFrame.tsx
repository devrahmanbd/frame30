/**
 * Task 8 — Full-screen theme preview frame.
 *
 * Renders blueprint sections (header / main / footer) with in-canvas
 * template navigation. No auth required; the route resolves the blueprint
 * from the URL key param and passes it here. Uses the same ThemeSurface +
 * SectionRenderer stack the storefront uses, but with placeholder widget
 * data so every section renders something visible.
 *
 * The preview is chrome-free: it shows exactly the store. Template switching
 * happens through in-canvas links (product / collection / search / page /
 * blog / cart / checkout / account / home) and the `?template=` deep link.
 * Signup, order tracking and every form submit are blocked with a
 * "Disabled in preview"
 * toast — capture-phase interception runs before widget handlers so no
 * contact/newsletter/coupon submission ever fires.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { StoreHeader } from "@/components/store/StoreHeader";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import {
  collectWidgetRequests,
  type WidgetDataBundle,
  type WidgetDataMap,
} from "@/lib/widget-data";
import { previewDemoMap } from "@/lib/preview-demo-data";
import { OrdersList, ProfileCard } from "@/components/builder/account";
import { accountSlotCtx } from "./account-slots";
import { useLang } from "@/lib/i18n";
import { compileResponsiveCss } from "@/lib/responsive-css";
import { fontStylesheetUrl } from "@/lib/theme-fonts";
import {
  type Section,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";
import { primarySectionId } from "@/lib/builder-ast";
import {
  collectionDisplayName,
  handlePreviewCanvasClick,
  handlePreviewCanvasSubmit,
} from "@/lib/theme-preview-nav";
import { demoCatalogFor } from "@/lib/demo-catalog";

/** Re-exported so existing importers keep resolving the preview toast copy. */
export { PREVIEW_DISABLED_MESSAGE } from "@/lib/theme-preview-nav";

export type ThemePreviewFrameProps = {
  /** Blueprint name for the header. */
  themeName: string;
  /** Blueprint author. */
  author: string;
  /** Blueprint key — selects the demo catalog for preview rows. */
  blueprintKey: string;
  /** Theme tokens applied to the preview surface. */
  tokens: ThemeTokens;
  /** All authored templates keyed by template key. */
  templates: Record<TemplateKey, ThemeAst>;
  /** Deep-linkable starting tab (?template=product). Defaults to homepage. */
  initialTemplate?: TemplateKey;
  /** Deep-linkable collection/product slug (?template=collection&slug=festive):
      renders that demo collection under its catalog name on first paint.
      In-canvas clicks replace it. */
  initialSlug?: string | null;
  /**
   * Retained for route compatibility. The preview renders no chrome, so the
   * close control is gone and this is intentionally unwired.
   */
  onClose: () => void;
};

export function ThemePreviewFrame({
  themeName,
  blueprintKey,
  tokens,
  templates,
  initialTemplate,
  initialSlug,
}: ThemePreviewFrameProps) {
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateKey>(
    initialTemplate ?? "index",
  );
  // Clicked product/collection slug: renders that demo collection instead
  // of one static page for every /c/* link. Cleared on any switch that
  // carries no slug. Deep-linkable via ?slug= for merchant-less URLs.
  const [slug, setSlug] = useState<string | null>(initialSlug ?? null);

  const switchTo = (
    t: TemplateKey,
    s: string | null,
    query: string | null,
  ): void => {
    setTemplate(t);
    setSlug(s);
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        template: t,
        ...(s ? { slug: s } : { slug: undefined }),
        ...(query && t === "search" ? { q: query } : {}),
      }),
      replace: false,
    } as never);
  };

  // Slug-aware collection overlay: the clicked /c/* link renders its own
  // collection — catalog name in the heading, rails filtered to slugs the
  // catalog actually stocks (unknown slugs keep the authored rail).
  const ast = useMemo(() => {
    const base = templates[template] ?? templates.index;
    if (template !== "collection" || !slug) return base;
    const label = collectionDisplayName(blueprintKey, slug);
    const catalog = demoCatalogFor(blueprintKey);
    const hasProducts = catalog.products.some((p) =>
      p.collections?.includes(slug),
    );
    const main: Section[] = base.main.map((section) => {
      if (section.type === "heading")
        return { ...section, props: { ...section.props, text: label } };
      const collectionProp = (section.props as Record<string, unknown>)[
        "collection"
      ];
      if (
        section.type === "product_rail" &&
        typeof collectionProp === "string"
      ) {
        return {
          ...section,
          props: {
            ...section.props,
            collection: hasProducts ? slug : collectionProp,
          },
        };
      }
      return section;
    });
    return { ...base, main };
  }, [templates, template, slug, blueprintKey]);
  // The preview has no route to supply the h1, so the elected primary
  // section owns it — same election the storefront host runs.
  const primaryId = primarySectionId(ast);
  const allSections: Section[] = [...ast.header, ...ast.main, ...ast.footer];
  // CompiledResponsive object — the stylesheet is `.css`. The storefront
  // host (ThemeChrome) inlines it verbatim inside ThemeSurface; preview
  // must do the same or per-device overrides silently die here.
  const responsive = compileResponsiveCss(allSections);
  // Preview has no merchant data: feed every data widget demo catalog rows
  // so grids/rails render products instead of skeleton-spinning forever.
  const previewData: { bundle: WidgetDataBundle; map: WidgetDataMap } =
    useMemo(() => {
      // Focused rails request the focused collection, so bundle from the
      // overlaid sections — otherwise rows would not match the heading.
      const bundle = collectWidgetRequests(ast);
      return { bundle, map: previewDemoMap(bundle, blueprintKey) };
    }, [ast, blueprintKey]);

  const { lang } = useLang();
  // Account center is context-gated: feed the merchant sections demo rows
  // so the account tab renders instead of parking on skeletons.
  const accountSlots = useMemo(() => {
    if (template !== "account") return undefined;
    const sections = [...ast.header, ...ast.main, ...ast.footer];
    const build = (type: "orders_list" | "profile_card") => {
      const section = sections.find((s) => s.type === type);
      if (!section) return undefined;
      const key = previewData.bundle.byNode[section.id];
      const rows = key ? previewData.map[key] : undefined;
      const ctx = accountSlotCtx(section, {
        rows,
        pending: false,
        locale: lang,
        storeSlug: blueprintKey,
      });
      return type === "orders_list" ? (
        <OrdersList {...ctx} />
      ) : (
        <ProfileCard {...ctx} />
      );
    };
    return {
      orders_list: build("orders_list"),
      profile_card: build("profile_card"),
    };
  }, [template, ast, previewData, lang, blueprintKey]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${themeName} theme preview`}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      {/* ---- Google Font stylesheet for theme's font pairings ---- */}
      {fontStylesheetUrl(tokens) && (
        <link
          rel="stylesheet"
          href={fontStylesheetUrl(tokens)}
          crossOrigin="anonymous"
        />
      )}

      {/* ---- preview canvas: full-bleed, no frame. Clicks navigate between
          templates in place; actions and submits are blocked. ---- */}
      <div
        className="flex-1 overflow-auto bg-background"
        onClickCapture={(event) =>
          handlePreviewCanvasClick(event, (t, s, q) => switchTo(t, s, q))
        }
        onSubmitCapture={handlePreviewCanvasSubmit}
      >
        <div className="mx-auto" style={{ maxWidth: "100%" }}>
          <ThemeSurface tokens={tokens}>
            {/* Per-device overrides, same contract as ThemeChrome:
                verbatim stylesheet, inside the theme scope. */}
            {responsive.css ? (
              <style
                data-fq-responsive={String(responsive.rules)}
                dangerouslySetInnerHTML={{ __html: responsive.css }}
              />
            ) : null}

            {/* Top-level ribbon bar (e.g. subbrand_bar) rendered above the store masthead */}
            {ast.header
              .filter((section) => section.type === "subbrand_bar")
              .map((section) => (
                <SectionRenderer
                  key={section.id}
                  section={section}
                  template={template}
                  editing={false}
                  contextSlots={accountSlots}
                />
              ))}

            {/* Wordmark row, as on a live storefront — the blueprint's
                navigation sections render beneath it. */}
            <StoreHeader slug={blueprintKey} name={themeName} menus={null} />
            <WidgetDataProvider
              bundle={previewData.bundle}
              map={previewData.map}
            >
              {/* Header sections below the masthead (e.g. mega_menu) */}
              {ast.header
                .filter((section) => section.type !== "subbrand_bar")
                .map((section) => (
                  <SectionRenderer
                    key={section.id}
                    section={section}
                    template={template}
                    editing={false}
                    contextSlots={accountSlots}
                  />
                ))}

              {/* main slot */}
              {ast.main.length > 0 ? (
                <main className="space-y-12 sm:space-y-16 pb-16 [&>[data-fq-node^='hero_carousel']]:!mt-0 [&>[data-fq-node^='announcement_bar']]:!mt-0 [&>[data-fq-node^='announcement_bar']+*]:!mt-0">
                  {ast.main.map((section) => (
                    <SectionRenderer
                      key={section.id}
                      section={section}
                      template={template}
                      editing={false}
                      contextSlots={accountSlots}
                      primary={section.id === primaryId}
                    />
                  ))}
                </main>
              ) : (
                <div className="grid min-h-[40vh] place-items-center p-8 text-sm text-muted-foreground">
                  No sections authored for this template.
                </div>
              )}

              {/* footer slot — landmark parity with ThemeChrome */}
              {ast.footer.length > 0 && (
                <footer className="border-t border-border bg-card/40 mt-16 pt-12 pb-16">
                  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                    {ast.footer.map((section) => (
                      <SectionRenderer
                        key={section.id}
                        section={section}
                        template={template}
                        editing={false}
                        contextSlots={accountSlots}
                      />
                    ))}
                  </div>
                </footer>
              )}
            </WidgetDataProvider>
          </ThemeSurface>
        </div>
      </div>
    </div>
  );
}
