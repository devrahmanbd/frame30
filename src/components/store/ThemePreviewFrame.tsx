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
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  PriceBlock,
  ProductInfo,
  VariantSelector,
  AddToCart,
  ProductDetails,
  ProductCraftStory,
} from "@/components/store/ProductView";

import { DEMO_CATALOGS } from "@/lib/demo-catalog";
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
import {
  primarySectionId,
  combineUsedSkinCss,
  usedWidgetSkins,
} from "@/lib/builder-ast";
import {
  applyDemoFocus,
  handlePreviewCanvasClick,
  handlePreviewCanvasSubmit,
  previewSearchForSwitch,
  resolveDemoFocus,
} from "@/lib/theme-preview-nav";
import { useSectionChannel } from "@/components/builder/useSectionChannel";


/* Click routing (block checks, href parsing, click/submit interception) lives in
   @/lib/theme-preview-nav — the single source. This frame only imports it. */

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
  /** Deep-linkable demo focus (?focus=bestsellers): renders that demo
      collection/product on first paint. In-canvas clicks replace it. */
  initialFocus?: string | null;
  /**
   * Lane B2-1: per-key theme skin sheets (`"<type>:<skin>"` → CSS, the
   * `combineUsedSkinCss` contract). Only the sheets for skins the rendered
   * template actually uses are inlined, inside ThemeSurface. Absent keeps
   * today's behavior — no skin stylesheet is inlined. The supplying lane
   * (theme/route) owns splitting full theme sheets per key.
   */
  skinSheets?: Partial<Record<string, string>> | null;
  /**
   * Retained for route compatibility. The preview renders no chrome, so the
   * close control is gone and this is intentionally unwired.
   */
  onClose: () => void;
};

/**
 * Multi-image carousel for theme preview product pages.
 * Reacts to the variant channel so clicking M/L swaps the gallery image.
 */
function DemoProductMediaGallery({
  images,
  blueprintKey,
  variants = [],
}: {
  images: string[];
  blueprintKey: string;
  variants?: any[];
}) {
  const variantChannel = useSectionChannel(blueprintKey, "variant");
  const selectedVariantIndex = !isNaN(parseInt(variantChannel.ids[0] || "", 10)) ? parseInt(variantChannel.ids[0] as string, 10) : 0;

  const selectedVariant = variants[selectedVariantIndex];
  const validImages = (selectedVariant?.images?.length > 0 ? selectedVariant.images : images).filter(Boolean);
  console.log("DemoProductMediaGallery validImages:", validImages, "variants:", variants, "selectedVariantIndex:", selectedVariantIndex);
  
  const [index, setIndex] = useState(0);

  // Reset index to 0 when the image set changes due to variant change
  useEffect(() => {
    setIndex(0);
  }, [selectedVariantIndex]);

  if (validImages.length === 0) {
    return <div className="relative w-full aspect-[4/5] bg-muted rounded-lg max-h-[70vh]" />;
  }

  const active = Math.min(index, validImages.length - 1);
  const step = (delta: number) => setIndex((i) => (i + delta + validImages.length) % validImages.length);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Product image"
      className="relative w-full flex flex-col items-center"
      data-debug={validImages.length}
      data-variants={variants?.length}
      data-index={selectedVariantIndex}
    >
      <div
        role="group"
        aria-roledescription="slide"
        aria-label={`Product image ${active + 1} / ${validImages.length}`}
        className="relative overflow-hidden rounded-lg border border-border bg-muted w-full max-w-2xl max-h-[70vh]"
        style={{ aspectRatio: "4/5" }}
      >
        <img
          src={validImages[active]}
          alt={`Product image ${active + 1}`}
          loading={active === 0 ? "eager" : "lazy"}
          fetchPriority={active === 0 ? "high" : "auto"}

          decoding="async"
          className="h-full w-full object-cover motion-safe:transition-all motion-safe:duration-500"
        />
        {validImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-lg shadow transition hover:bg-muted"
            >
              <span aria-hidden>‹</span>
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/95 text-lg shadow transition hover:bg-muted"
            >
              <span aria-hidden>›</span>
            </button>
            <p
              aria-hidden
              className="absolute bottom-2 right-2 rounded-full bg-foreground/70 px-2 py-1 text-xs tabular-nums text-background"
            >
              {active + 1} / {validImages.length}
            </p>
          </>
        )}
      </div>
      {validImages.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {validImages.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`View image ${i + 1}`}
              aria-pressed={i === active}
              className={`relative h-16 w-14 flex-none overflow-hidden rounded border-2 transition-all ${i === active ? "border-foreground" : "border-border opacity-60 hover:opacity-100"}`}
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function useMockProductSlots(

  template: TemplateKey,
  demoFocus: any,
  themeName: string,
  blueprintKey: string
) {
  const [variantId, setVariantId] = useState<string>("");
  const [added, setAdded] = useState(false);

  // If not product template or no demo product, return undefined so it falls back
  const demoProduct = template === "product" && demoFocus 
    ? DEMO_CATALOGS[blueprintKey as keyof typeof DEMO_CATALOGS]?.products.find((p: any) => p.slug === demoFocus.slug) 
    : null;

  const mappedVariants = demoProduct
    ? demoProduct.variants.map((v: any) => ({
        id: v.id ?? v.name,
        name: v.name,
        sku: v.sku,
        price_amount_minor_int: v.price,
        compare_at_amount_minor_int: v.compare_at,
        stock_quantity: v.stock ?? 10
      }))
    : [];

  // Initialize variant on product change
  useEffect(() => {
    if (demoProduct) {
      setVariantId((demoProduct.variants[0] as any)?.id ?? demoProduct.variants[0]?.name ?? "");

    }
  }, [demoProduct?.slug]);

  // Push variant index to the section channel so the AST product_media widget reacts
  const variantChannel = useSectionChannel(blueprintKey, "variant");
  useEffect(() => {
    if (!demoProduct || mappedVariants.length === 0) return;
    const idx = mappedVariants.findIndex((v: any) => v.id === variantId);
    variantChannel.clear();
    if (idx >= 0) {
      variantChannel.push(idx.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId, blueprintKey]);

  if (!demoProduct) return undefined;

  const productPayload = {
    id: demoProduct.slug,
    title: demoProduct.title,
    description: demoProduct.description,
    image_url: demoProduct.image_url,
    image: null,
    tags: demoProduct.tags ?? [],
    category_id: demoProduct.category ?? null,
  };
  
  const merchantPayload = {
    id: "demo",
    name: themeName,
    slug: blueprintKey,
    currency_code: "BDT"
  };
  
  const settingsPayload = {
    shipping_flat_minor_int: 6000,
    cod_enabled: true,
    mfs_enabled: true,
    free_shipping_threshold_minor_int: null
  };
  
  const mappedVariant = mappedVariants.find((v: any) => v.id === variantId) ?? mappedVariants[0] ?? null;

  const breadcrumb = (
    <nav className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
      <span className="hover:text-foreground transition-colors cursor-pointer">{themeName}</span>
      <span aria-hidden className="mx-2"> / </span>
      <span className="text-foreground">{demoProduct.title}</span>
    </nav>
  );

  // NOTE: product_media is intentionally NOT in the return — the AST widget handles
  // the gallery using the images injected by applyDemoFocus, and the channel push above
  // drives variant→gallery binding reactively.
  const meta = <ProductInfo product={productPayload as any} />;
  const priceBlock = mappedVariant ? <PriceBlock variant={mappedVariant as any} currencyCode="BDT" /> : null;

  
  const addToCart = mappedVariant ? (
    <div>
      <VariantSelector variants={mappedVariants as any} variantId={variantId} setVariantId={setVariantId} />
      <AddToCart
        variant={mappedVariant as any}
        merchant={merchantPayload as any}
        custom={false}
        add={(id, qty) => { console.log("Mock add to cart", id, qty); }}
        added={added}
        setAdded={setAdded}
        settings={settingsPayload as any}
      />
    </div>
  ) : null;

  
  const pageContent = (
    <>
      <ProductDetails product={productPayload as any} />
      <ProductCraftStory description={demoProduct.description} />
    </>
  );

  const productImages = demoFocus?.images ?? demoProduct?.images ?? (demoProduct?.image_url ? [demoProduct.image_url] : []);
  if (typeof window !== "undefined") {
    (window as any).__DEBUG_PRODUCT = demoProduct;
    (window as any).__DEBUG_FOCUS = demoFocus;
  }
  const media = (
    <DemoProductMediaGallery
      images={productImages}
      blueprintKey={blueprintKey}
      variants={demoProduct.variants}
    />
  );

  return {
    breadcrumb,
    product_media: media,
    product_meta: meta,
    price_block: priceBlock,
    add_to_cart: addToCart,
    page_content: pageContent
  };
}


export function ThemePreviewFrame({
  themeName,
  blueprintKey,
  tokens,
  templates,
  initialTemplate,
  initialFocus,
  skinSheets,
}: ThemePreviewFrameProps) {
  const startTemplate = initialTemplate ?? "index";
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateKey>(startTemplate);
  // Clicked product/collection slug: renders that demo collection instead
  // of one static page for every /c/* link. Cleared on any switch that
  // carries no slug. Deep-linkable via ?focus= for merchant-less URLs.
  const [focus, setFocus] = useState<{
    template: TemplateKey;
    slug: string;
  } | null>(() =>
    initialFocus &&
    (startTemplate === "collection" || startTemplate === "product")
      ? { template: startTemplate, slug: initialFocus }
      : null,
  );

  // Back/forward re-sync: the route owns the URL, the frame owns the paint.
  // Route search changes (history pop) re-render this frame with new
  // initial props, but useState keeps the stale click-time values without
  // this effect, so the back button would desync from the URL.
  useEffect(() => {
    setTemplate(initialTemplate ?? "index");
    setFocus(
      initialFocus &&
        (initialTemplate === "collection" || initialTemplate === "product")
        ? { template: initialTemplate, slug: initialFocus }
        : null,
    );
  }, [initialTemplate, initialFocus]);

  // Template/focus switch that syncs the URL: every in-canvas navigation
  // pushes a history entry (`?template=&focus=`, plus `q`/`max` on search)
  // with replace:false, so back/forward restores the painted template and
  // refresh keeps search state. Leaving search clears `q`/`max` so a
  // previous query never leaks into collection/product URLs.
  const switchTo = (
    nextTemplate: TemplateKey,
    nextFocus: string | null,
    query: string | null,
  ): void => {
    setTemplate(nextTemplate);
    setFocus(
      nextFocus && (nextTemplate === "collection" || nextTemplate === "product")
        ? { template: nextTemplate, slug: nextFocus }
        : null,
    );
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) =>
        previewSearchForSwitch(nextTemplate, nextFocus, query, prev),
      replace: false,
    } as never);
  };

  const ast = templates[template] ?? templates.index;
  const demoFocus =
    focus && focus.template === template
      ? resolveDemoFocus(blueprintKey, focus.template, focus.slug)
      : null;
  const focusedMain =
    demoFocus &&
    (template === "collection" || template === "product") &&
    demoFocus.template === template
      ? applyDemoFocus(ast.main, demoFocus)
      : ast.main;
  // The preview has no route to supply the h1, so the elected primary
  // section owns it — same election the storefront host runs.
  const primaryId = primarySectionId({ ...ast, main: focusedMain });
  // Lane B2-1: per-page skin sheets. Keys come from the RENDERED page
  // (header + focused main + footer, so a clicked collection's rails count);
  // only matching sheets inline, inside ThemeSurface. Fail-open: any failure
  // inlines nothing, today's behavior.
  let skinCss: string | null = null;
  try {
    if (skinSheets) {
      const used = usedWidgetSkins({
        header: ast.header,
        main: focusedMain,
        footer: ast.footer,
      }).map((skin) => skin.key);
      const combined = combineUsedSkinCss(skinSheets, used);
      skinCss = combined === "" ? null : combined;
    }
  } catch {
    skinCss = null;
  }
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
      // focused sections — otherwise rows would not match the heading.
      const bundle = collectWidgetRequests({ ...ast, main: focusedMain });
      return { bundle, map: previewDemoMap(bundle, blueprintKey) };
    }, [ast, focusedMain, blueprintKey]);

  const { lang } = useLang();
  // Account center is context-gated: feed the merchant sections demo rows
  // so the account tab renders instead of parking on skeletons.
  const productSlots = useMockProductSlots(template, demoFocus, themeName, blueprintKey);
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
          handlePreviewCanvasClick(event, switchTo, (message) =>
            toast.info(message),
          )
        }
        onSubmitCapture={(event) =>
          handlePreviewCanvasSubmit(event, (message) => toast.info(message))
        }
      >
        <div className="mx-auto" style={{ maxWidth: "100%" }}>
          <ThemeSurface tokens={tokens} skinCss={skinCss}>
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
                  storeSlug={blueprintKey}
                  contextSlots={accountSlots || productSlots || undefined}
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
                    storeSlug={blueprintKey}
                    contextSlots={accountSlots || productSlots || undefined}
                  />
                ))}

              {/* main slot */}
              {focusedMain.length > 0 ? (
                <main className="space-y-12 sm:space-y-16 pb-16 [&>[data-fq-node^='announcement_bar']]:!mt-0 [&>[data-fq-node^='announcement_bar']+*]:!mt-0">
                  {focusedMain.map((section) => (
                    <SectionRenderer
                      key={section.id}
                      section={section}
                      template={template}
                      editing={false}
                      storeSlug={blueprintKey}
                      contextSlots={accountSlots || productSlots || undefined}
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
                        contextSlots={accountSlots || productSlots || undefined}
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
