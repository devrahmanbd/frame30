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
import { useCallback, useEffect, useMemo, useState } from "react";
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

import {
  DEMO_CATALOGS,
  type DemoProduct,
  type DemoVariant,
} from "@/lib/demo-catalog";
import { ThemeSurface } from "@/components/builder/ThemeSurface";
import { OrderConfirmationMock } from "@/components/store/OrderConfirmationMock";
import {
  StoreHeader,
  MinimalCheckoutHeader,
} from "@/components/store/StoreHeader";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import { CartProvider } from "@/components/builder/CartContext";
import { BlogFeedProvider } from "@/components/builder/blog";
import { stripArchiveEmptyState } from "@/lib/archive-ast";
import {
  CollectionQueryProvider,
  groupFacetRows,
} from "@/components/builder/collection";
import { ProductCard } from "@/components/builder/primitives/ProductCard";
import type { PaymentMethodKey } from "@/lib/payment-rails";
import {
  collectWidgetRequests,
  type WidgetDataBundle,
  type WidgetDataMap,
  type WidgetRow,
} from "@/lib/widget-data";
import { previewDemoMap } from "@/lib/preview-demo-data";
import { PREVIEW_DEMO_PAGE } from "@/lib/preview-page-data";
import { normalizeSearchParams } from "@/lib/storefront-search";
import { facetHref, toggleFacet } from "@/lib/facet-url";
// Phase 2 — the theme-owned demo data (Task 2 / Task 4 / Task 7). Used
// ONLY for the Songoskriti blueprint; every other blueprint keeps today's
// behaviour byte-for-byte. The data is SYNTHETIC and labelled as such.
import {
  SONGOSKRITI_PREVIEW_QUERY_TERM,
  SONGOSKRITI_PREVIEW_SEARCH_PATH,
  SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
  songoskritiPreviewAccountOverview,
  songoskritiPreviewCart,
  songoskritiPreviewFacets,
  songoskritiPreviewFeed,
  songoskritiPreviewOrderDetail,
  songoskritiPreviewOrders,
  songoskritiPreviewProfile,
} from "@/lib/themes/songoskriti/preview-demo-data";
import { SONGOSKRITI_PREVIEW_PAGE } from "@/lib/themes/songoskriti/preview-page";
import { OrdersList, ProfileCard } from "@/components/builder/account";
import {
  AccountDashboard,
  type AccountOrderDetail,
} from "@/components/store/AccountDashboard";
import {
  AccountDashboardProvider,
  type AccountDashboardState,
  type AccountPanelType,
} from "@/components/store/AccountDashboardContext";
import type { AccountTab } from "@/lib/account-tab";
import { accountSlotCtx } from "./account-slots";
import { useLang } from "@/lib/i18n";
import { compileResponsiveCss } from "@/lib/responsive-css";
import { fontStylesheetUrl } from "@/lib/theme-fonts";
import {
  flattenSections,
  type Section,
  type TemplateKey,
  type ThemeAst,
  type ThemeTokens,
} from "@/lib/builder-ast";
import {
  EMPTY_AST,
  primarySectionId,
  combineUsedSkinCss,
  usedWidgetSkins,
} from "@/lib/builder-ast";
import {
  applyDemoFocus,
  type DemoFocus,
  handlePreviewCanvasClick,
  handlePreviewCanvasSubmit,
  previewSearchForSwitch,
  resolveDemoFocus,
  resolvePreviewVariantAst,
  PREVIEW_DISABLED_MESSAGE,
} from "@/lib/theme-preview-nav";
import {
  baseTemplateKey,
  isTemplateVariantKey,
  type TemplateVariantKey,
} from "@/lib/template-variants";
import { useSectionChannel } from "@/components/builder/useSectionChannel";

/* Click routing (block checks, href parsing, click/submit interception) lives in
   @/lib/theme-preview-nav — the single source. This frame only imports it. */

/**
 * The unsupported-template panel's copy.
 *
 * The panel states a fact about the THEME's coverage — it is not a demo, so
 * it carries none of the retired demo strings ("Demo page", "Demo search",
 * "Meet the makers", "Sample product", "Demo"). The contract test
 * (`src/lib/themes/songoskriti/archive-contract.test.ts`) reads these two
 * constants straight out of this file, so the copy cannot drift back into
 * demo copy without failing a test.
 */
const UNSUPPORTED_TEMPLATE_TITLE =
  "This template is not supported by this theme";
const UNSUPPORTED_TEMPLATE_BODY =
  "The theme does not author a body for this template, and the engine never synthesises one — a template the theme does not author is not filled with a generic fallback body, so there is nothing to preview. The archive is a first-class template a theme may author, and the platform's own reader surfaces — the blog listing and its category, tag and author archives — keep the platform grid, because they carry no store slug and so they cannot resolve a theme.";

// M4: the merchant-facing builder names the same state in the same words.
// The declarations stay `const` (the archive contract reads them textually);
// this re-export is the one module boundary the builder imports through.
export { UNSUPPORTED_TEMPLATE_TITLE, UNSUPPORTED_TEMPLATE_BODY };

/**
 * The preview's rail SELECTION — the local state the demo rail owns.
 *
 * The demo cart is inert by design: it must never reach a server. But a
 * control that looks live and does nothing is worse than no control (the
 * plan's **D6**), so the SELECTION is a real local transition: choosing a
 * rail in the preview changes the preview. The demo cart's own `setMethod`
 * stays the no-op it was built with — the live cart context is never
 * touched.
 *
 * It is a hook of its own so the transition can be exercised for what it is
 * — a state change that the rail's `checked` state follows — rather than
 * read out of the source text. The preview frame uses it, and so does the
 * preview-safety contract.
 */
export function usePreviewRailSelection(): {
  method: PaymentMethodKey;
  setMethod: (method: PaymentMethodKey) => void;
} {
  const [previewMethod, setPreviewMethod] = useState<PaymentMethodKey>("cod");
  return { method: previewMethod, setMethod: setPreviewMethod };
}

/**
 * The explicit unsupported state — a named panel, never a redirect.
 *
 * It NAMES the template key, LINKS BACK to the home tab (an in-canvas `/`
 * link, which the canvas's capture-phase handler resolves to the `index`
 * template — `src/lib/theme-preview-nav.ts:96-98`, `:159-180`), and carries
 * no demo copy.
 */
function UnsupportedTemplateNotice({ template }: { template: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-bangla-display text-2xl font-semibold">
        {UNSUPPORTED_TEMPLATE_TITLE}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {UNSUPPORTED_TEMPLATE_BODY}
      </p>
      <p className="mt-4 text-sm">
        The requested template key is{" "}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {template}
        </code>
        .
      </p>
      <a
        href="/"
        className="mt-6 inline-flex min-h-11 items-center justify-center rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Back to the home tab
      </a>
    </div>
  );
}

export type ThemePreviewFrameProps = {
  /** Blueprint name for the header. */
  themeName: string;
  /** Blueprint author. */
  author: string;
  /** Blueprint key — selects the demo catalog for preview rows. */
  blueprintKey: string;
  /** Theme tokens applied to the preview surface. */
  tokens: ThemeTokens;
  /**
   * All authored templates keyed by template key — a **PARTIAL** map: a
   * template the theme does not author is ABSENT, and the host renders its
   * explicit "not supported by this theme" panel for it.
   */
  templates: Partial<Record<TemplateKey, ThemeAst>>;
  /**
   * The theme's authored VARIANT bodies (`blog_listing`, `blog_article`).
   *
   * A SEPARATE map, exactly as the preset carries it: the base map stays
   * the ten-key template space the host resolves against, and a key the
   * platform does not know must stay ABSENT from it (the host turns an
   * absent key into its explicit "not supported by this theme" panel).
   * ABSENT = the theme ships no variant body, and every variant falls back
   * to its base template.
   */
  variants?: Record<string, ThemeAst>;
  /** Deep-linkable starting tab (?template=product). Defaults to homepage. */
  initialTemplate?: TemplateKey | TemplateVariantKey;
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
  initialMockOrder?: "success" | "pending" | "failed";
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
  variants?: DemoVariant[];
}) {
  const variantChannel = useSectionChannel(blueprintKey, "variant");
  const selectedVariantIndex = !isNaN(parseInt(variantChannel.ids[0] || "", 10))
    ? parseInt(variantChannel.ids[0] as string, 10)
    : 0;

  const selectedVariant = variants[selectedVariantIndex];
  const selectedImages = selectedVariant?.images;
  const validImages = (
    selectedImages && selectedImages.length > 0 ? selectedImages : images
  ).filter(Boolean);
  console.log(
    "DemoProductMediaGallery validImages:",
    validImages,
    "variants:",
    variants,
    "selectedVariantIndex:",
    selectedVariantIndex,
  );

  const [index, setIndex] = useState(0);

  // Reset index to 0 when the image set changes due to variant change
  useEffect(() => {
    setIndex(0);
  }, [selectedVariantIndex]);

  if (validImages.length === 0) {
    return (
      <div className="relative w-full aspect-[4/5] bg-muted rounded-lg max-h-[70vh]" />
    );
  }

  const active = Math.min(index, validImages.length - 1);
  const step = (delta: number) =>
    setIndex((i) => (i + delta + validImages.length) % validImages.length);

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

/**
 * Demo catalogue variant as rendered: the catalogue shape plus the optional
 * row id carried by `_catalog` payloads (absent in the static presets, where
 * the variant name is the identity).
 */
type PreviewVariant = DemoVariant & { id?: string };

/** Mapped preview variant: the minor-unit price/stock shape the PDP product
 *  components read (`PriceBlock` / `VariantSelector` / `AddToCart`). */
type MappedPreviewVariant = {
  id: string;
  name: string;
  sku?: string;
  price_amount_minor_int: number;
  compare_at_amount_minor_int?: number;
  stock_quantity: number;
};

/** Debug handle the preview exposes on `window` for failing renders. */
type PreviewDebugWindow = Window & {
  __DEBUG_PRODUCT?: unknown;
  __DEBUG_FOCUS?: unknown;
};

function useMockProductSlots(
  template: TemplateKey,
  demoFocus: DemoFocus | null,
  themeName: string,
  blueprintKey: string,
) {
  const [variantId, setVariantId] = useState<string>("");
  const [added, setAdded] = useState(false);

  // If not product template or no demo product, return undefined so it falls back
  const demoProduct =
    template === "product" && demoFocus
      ? DEMO_CATALOGS[
          blueprintKey as keyof typeof DEMO_CATALOGS
        ]?.products.find((p: DemoProduct) => p.slug === demoFocus.slug)
      : null;

  const mappedVariants: MappedPreviewVariant[] = demoProduct
    ? demoProduct.variants.map((v: PreviewVariant) => ({
        id: v.id ?? v.name,
        name: v.name,
        sku: v.sku,
        price_amount_minor_int: v.price,
        compare_at_amount_minor_int: v.compare_at,
        stock_quantity: v.stock ?? 10,
      }))
    : [];

  // Initialize variant on product change
  useEffect(() => {
    if (demoProduct) {
      setVariantId(
        (demoProduct.variants[0] as PreviewVariant | undefined)?.id ??
          demoProduct.variants[0]?.name ??
          "",
      );
    }
  }, [demoProduct?.slug]);

  // Push variant index to the section channel so the AST product_media widget reacts
  const variantChannel = useSectionChannel(blueprintKey, "variant");
  useEffect(() => {
    if (!demoProduct || mappedVariants.length === 0) return;
    const idx = mappedVariants.findIndex(
      (v: MappedPreviewVariant) => v.id === variantId,
    );
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
    currency_code: "BDT",
  };

  const settingsPayload = {
    shipping_flat_minor_int: 6000,
    cod_enabled: true,
    mfs_enabled: true,
    free_shipping_threshold_minor_int: null,
  };

  const mappedVariant =
    mappedVariants.find((v: MappedPreviewVariant) => v.id === variantId) ??
    mappedVariants[0] ??
    null;

  const breadcrumb = (
    <nav className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
      <span className="hover:text-foreground transition-colors cursor-pointer">
        {themeName}
      </span>
      <span aria-hidden className="mx-2">
        {" "}
        /{" "}
      </span>
      <span className="text-foreground">{demoProduct.title}</span>
    </nav>
  );

  // NOTE: product_media is intentionally NOT in the return — the AST widget handles
  // the gallery using the images injected by applyDemoFocus, and the channel push above
  // drives variant→gallery binding reactively.
  const meta = <ProductInfo product={productPayload} />;
  const priceBlock = mappedVariant ? (
    <PriceBlock variant={mappedVariant} currencyCode="BDT" />
  ) : null;

  const addToCart = mappedVariant ? (
    <div>
      <VariantSelector
        variants={mappedVariants}
        variantId={variantId}
        setVariantId={setVariantId}
      />
      <AddToCart
        variant={mappedVariant}
        merchant={merchantPayload}
        custom={false}
        add={(id, qty) => {
          console.log("Mock add to cart", id, qty);
        }}
        added={added}
        setAdded={setAdded}
        settings={settingsPayload}
      />
    </div>
  ) : null;

  const pageContent = (
    <>
      <ProductDetails product={productPayload} />
      <ProductCraftStory
        description={demoProduct.description}
        themeKey={blueprintKey}
      />
    </>
  );

  const productImages =
    demoFocus?.images ??
    demoProduct?.images ??
    (demoProduct?.image_url ? [demoProduct.image_url] : []);
  if (typeof window !== "undefined") {
    const debugWindow = window as PreviewDebugWindow;
    debugWindow.__DEBUG_PRODUCT = demoProduct;
    debugWindow.__DEBUG_FOCUS = demoFocus;
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
    page_content: pageContent,
  };
}

/**
 * The account's four placeable panels — the closed vocabulary the theme's
 * own body may place. The preview and the storefront grant the SAME set
 * (`src/lib/preview-parity.contract.test.ts`).
 */
const ACCOUNT_PANEL_TYPES: readonly AccountPanelType[] = [
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
];

export function ThemePreviewFrame({
  themeName,
  blueprintKey,
  tokens,
  templates,
  variants,
  initialTemplate,
  initialFocus,
  initialMockOrder,
  skinSheets,
}: ThemePreviewFrameProps) {
  const startTemplate = initialTemplate ?? "index";
  const navigate = useNavigate();
  const [template, setTemplate] = useState<TemplateKey | TemplateVariantKey>(
    startTemplate,
  );
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
  const [mockOrder, setMockOrder] = useState(initialMockOrder);

  // Back/forward re-sync: the route owns the URL, the frame owns the paint.
  // Route search changes (history pop) re-render this frame with new
  // initial props, but useState keeps the stale click-time values without
  // this effect, so the back button would desync from the URL.
  useEffect(() => {
    setTemplate(initialTemplate ?? "index");
    setMockOrder(initialMockOrder);
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

  // Decision D1' — an unsupported template is an EXPLICIT state, never a
  // silent redirect to the homepage. `archive` IS a template key now (the
  // content archive is a first-class theme part), so it is authored like any
  // other; a key the platform still does not know — say
  // `?template=blog_anything` — is the unsupported request, and when the
  // theme does not author the requested template the canvas renders the
  // named "not supported by this theme" panel instead of the homepage body.
  const templatesByKey: Partial<Record<TemplateKey, ThemeAst>> = templates;
  // The VARIANT bodies ride BESIDE the base map. A closed variant key
  // resolves through the SAME rule the storefront uses — the variant first,
  // then its base, and NOTHING else (`resolvePreviewVariantAst` is the
  // preview seam of `resolveVariantAst`) — so the preview shows the
  // composition the storefront will render, not a different one.
  const variantBag = useMemo(
    () => ({ ...templates, ...(variants ?? {}) }),
    [templates, variants],
  );
  const isVariant = isTemplateVariantKey(template);
  // The BASE key drives every catalogue allowlist check and every grant,
  // exactly as it does for the editor and the publish gate: no widget's
  // catalogue row names a variant key.
  const baseTemplate: TemplateKey = isVariant
    ? (baseTemplateKey(template) ?? "index")
    : (template as TemplateKey);
  const variantResolved = isVariant
    ? resolvePreviewVariantAst(variantBag, template)
    : null;
  const authored: ThemeAst | undefined = isVariant
    ? variantResolved?.ast
    : templatesByKey[template as TemplateKey];
  const unsupported = authored === undefined;
  const ast = authored ?? templatesByKey.index ?? EMPTY_AST;
  // Phase 2 (Task 7): the theme-owned demo data — the synthetic cart, the
  // demo feed, the demo query and the labelled sample page — belongs to the
  // Songoskriti blueprint alone. Every other blueprint keeps today's
  // behaviour byte-for-byte (the studio's `DEMO_CART` fallback, the pack's
  // own `SAMPLE` blog rows, the shared `PREVIEW_DEMO_PAGE`).
  const isSongoskriti = blueprintKey === "songoskriti";
  const demoFocus =
    focus && focus.template === baseTemplate
      ? resolveDemoFocus(blueprintKey, focus.template, focus.slug)
      : null;
  const focusedMain =
    demoFocus &&
    (baseTemplate === "collection" || baseTemplate === "product") &&
    demoFocus.template === baseTemplate
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
      const map = previewDemoMap(bundle, blueprintKey);
      if (isSongoskriti) {
        // The theme's own rows replace the studio's generic ones for the
        // two sources the Songoskriti compositions need: the `facets` rows
        // the search sidebar and the toolbar read, and the shopper-scoped
        // `orders` / `profile` rows the account template reads.
        const facets = songoskritiPreviewFacets();
        for (const request of bundle.requests) {
          if (request.source === "facets") map[request.key] = facets;
          else if (request.source === "orders")
            map[request.key] = songoskritiPreviewOrders();
          else if (request.source === "profile")
            map[request.key] = [songoskritiPreviewProfile()];
        }
      }
      return { bundle, map };
    }, [ast, focusedMain, blueprintKey, isSongoskriti]);

  const { lang, t } = useLang();
  // Account center is context-gated: feed the merchant sections demo rows
  // so the account tab renders instead of parking on skeletons.
  const productSlots = useMockProductSlots(
    baseTemplate,
    demoFocus,
    themeName,
    blueprintKey,
  );
  /**
   * The account panels the THEME's own body placed.
   *
   * The generalised form of the storefront's rule: a panel the theme places
   * is the THEME's; a panel it does not place is the DASHBOARD's — and the
   * dashboard's fallback skips the placed ones, so a panel is never shown
   * twice on one page.
   */
  const placedAccountPanels = useMemo(() => {
    const sections = [
      ...flattenSections(ast.header),
      ...flattenSections(focusedMain),
      ...flattenSections(ast.footer),
    ];
    return ACCOUNT_PANEL_TYPES.filter((panel) =>
      sections.some((section) => section.type === panel),
    );
  }, [ast, focusedMain]);

  const accountSlots = useMemo(() => {
    if (baseTemplate !== "account") return undefined;
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
      // The account's four PLACEABLE panels — granted exactly when the
      // theme's own body places them, so the preview and the storefront
      // grant the same set.
      account_nav: placedAccountPanels.includes("account_nav")
        ? null
        : undefined,
      account_overview: placedAccountPanels.includes("account_overview")
        ? null
        : undefined,
      account_orders: placedAccountPanels.includes("account_orders")
        ? null
        : undefined,
      account_details: placedAccountPanels.includes("account_details")
        ? null
        : undefined,
    };
  }, [baseTemplate, ast, previewData, lang, blueprintKey, placedAccountPanels]);

  // The account template's route-owned BODY slot (Batch B). The storefront's
  // account route renders the designed dashboard there; the preview renders
  // the SAME dashboard over the theme's SYNTHETIC demo shopper — visibly
  // labelled ("Rumana Haque (demo shopper)", an RFC 2606 `.example` email),
  // never a real shopper's data. The preview has no session and no shopper,
  // so nothing real can reach this surface.
  const [previewAccountTab, setPreviewAccountTab] =
    useState<AccountTab>("orders");
  // The preview's demo order DETAIL — the same disclosure the storefront's
  // dashboard offers, resolved from the theme's SYNTHETIC demo catalogue.
  // There is no shopper and no session here, so nothing real can reach it.
  const [previewOrderDetail, setPreviewOrderDetail] = useState<{
    orderId: string;
    detail: AccountOrderDetail;
  } | null>(null);
  const loadPreviewOrder = (orderId: string) => {
    const detail = songoskritiPreviewOrderDetail(orderId);
    setPreviewOrderDetail(detail ? { orderId, detail } : null);
  };
  /**
   * The preview's own open-order state — the same shape the storefront's
   * route owns. The preview has no shopper and no session, so nothing real
   * can reach it.
   */
  const setPreviewOpenOrder = useCallback((orderId: string | null) => {
    if (orderId === null) setPreviewOrderDetail(null);
  }, []);

  /**
   * The preview's account state — the ONE object the theme-placed panels and
   * the dashboard's own copy read.
   *
   * The demo shopper is synthetic and visibly labelled
   * ("Rumana Haque (demo shopper)", an RFC 2606 `.example` email), and the
   * order rows come from the theme's own demo fixtures.
   */
  const previewAccountState = useMemo(
    (): AccountDashboardState => ({
      slug: blueprintKey,
      currency: "BDT",
      status: "ready",
      overview: songoskritiPreviewAccountOverview(),
      orders: songoskritiPreviewOrders(),
      tab: previewAccountTab,
      setTab: setPreviewAccountTab,
      openOrderId: previewOrderDetail?.orderId ?? null,
      setOpenOrderId: setPreviewOpenOrder,
      orderDetail: previewOrderDetail,
      onLoadOrder: loadPreviewOrder,
      placed: placedAccountPanels,
    }),
    [
      blueprintKey,
      previewAccountTab,
      previewOrderDetail,
      setPreviewOpenOrder,
      placedAccountPanels,
    ],
  );
  const accountBodySlot = useMemo(() => {
    if (baseTemplate !== "account") return undefined;
    if (!isSongoskriti) return { page_content: null };
    return {
      page_content: (
        <AccountDashboard
          slug={blueprintKey}
          overview={songoskritiPreviewAccountOverview()}
          status="ready"
          tab={previewAccountTab}
          onTabChange={setPreviewAccountTab}
          currency="BDT"
          onLoadOrder={loadPreviewOrder}
          orderDetail={previewOrderDetail}
        />
      ),
    };
  }, [
    baseTemplate,
    isSongoskriti,
    blueprintKey,
    previewAccountTab,
    previewOrderDetail,
  ]);

  // The five cart slots keep their `null` values: `null` is the platform's
  // "granted" token, and the widgets read the cart CONTEXT themselves —
  // exactly what the live cart route does ("the keys simply tell the
  // renderer this page owns the cart context"). The slots are granted for
  // the `checkout` template too: the authored checkout body is full of
  // context widgets (`checkout_steps` / `payment_methods` /
  // `cart_summary`), and an ungranted context widget renders `null` when
  // `editing={false}`.
  //
  // The CART and the CHECKOUT are granted SEPARATELY (Batch C): the
  // storefront's cart route grants the five cart slots and nothing else,
  // while the checkout route grants those five PLUS the route-owned body
  // slot the checkout form flows through. The preview mirrors the storefront
  // exactly — the preview-parity contract.
  const cartSlots =
    baseTemplate === "cart"
      ? {
          cart_lines: null,
          cart_summary: null,
          cart_drawer: null,
          checkout_steps: null,
          payment_methods: null,
        }
      : undefined;
  const checkoutSlots =
    baseTemplate === "checkout"
      ? {
          cart_lines: null,
          cart_summary: null,
          cart_drawer: null,
          checkout_steps: null,
          payment_methods: null,
          // The route-owned body slot (Batch B): the checkout FORM lives
          // there in production. The preview has no route and no shopper, so
          // the slot is granted and renders nothing.
          page_content: null,
        }
      : undefined;

  // The demo rows the search template's grid node resolves: the demo
  // catalogue's products, priced by the demo map. They are the preview's
  // demo RESULT SET — the thing the `empty_state` grant and the demo
  // `productSlot` below both read.
  const searchDemoRows = useMemo<WidgetRow[]>(() => {
    if (baseTemplate !== "search" || !isSongoskriti) return [];
    const grid = focusedMain.find((section) => section.type === "product_grid");
    const key = grid ? previewData.bundle.byNode[grid.id] : undefined;
    return (key ? previewData.map[key] : undefined) ?? [];
  }, [baseTemplate, isSongoskriti, focusedMain, previewData]);

  // The six Phase-2.4 search widgets are CONTEXT widgets: they render only
  // where the host grants permission (`SectionRenderer.tsx:814-833`). The
  // preview grants the storefront's set — `result_toolbar`, `filter_chips`,
  // `pagination`, `category_header`, `facet_sidebar` and (conditionally)
  // `empty_state`. `facet_sidebar` is no longer preview-only: Decision
  // G2 (a) closed the difference, and the storefront's search route mounts
  // the `WidgetDataProvider` that feeds the same facet rows.
  //
  // `empty_state` is the ONE conditional grant, and it mirrors the
  // storefront's own contract: the platform's `EmptyState` widget renders
  // its panel UNCONDITIONALLY (`collection.tsx:707-753`), so the GRANT is
  // what decides whether the theme's empty copy appears — and the
  // storefront grants it only when the platform's own empty state would
  // have shown (`store.$slug.search.tsx:424-444`, mirrored in §(b.4)'s
  // `contextSlots` hunk). The preview mirrors it against its own demo
  // result set: the grant is present iff the demo results are empty. The
  // demo catalogue is never empty, so the theme's "Nothing matches those
  // filters" panel never renders UNDERNEATH a grid of results.
  const searchSlots =
    baseTemplate === "search"
      ? {
          result_toolbar: null,
          filter_chips: null,
          pagination: null,
          category_header: null,
          facet_sidebar: null,
          ...(searchDemoRows.length === 0 ? { empty_state: null } : {}),
        }
      : undefined;

  // The demo `productSlot` for the search template — the storefront's shape.
  // The storefront hands the theme ONE opaque block (`productSlot`,
  // `src/routes/store.$slug.search.tsx:559`): the platform's query box, the
  // platform's category/kind chips and the results grid. The theme's grid
  // honours that block on the `search` template
  // (`src/components/builder/songoskriti.tsx:906-…`: `const host = template
  // === "search" ? productSlot : undefined`), so the preview hands the SAME
  // shape and demonstrates the same contract: the query box and the
  // category/kind chips stay reachable on a themed search page, exactly as
  // §(b.4) requires of the storefront.
  //
  // Mutation safety: the query box's `<form>` lives inside the preview
  // canvas, so the canvas's capture-phase submit handler intercepts it
  // ("Disabled in preview"); the facet links are preview hrefs the canvas's
  // click handler resolves to the preview's own search tab; the results
  // grid renders the platform's card with NO store slug in context, so it
  // stays a plain anchor with no wishlist or quick-view hooks.
  const searchProductSlot = useMemo(() => {
    if (baseTemplate !== "search" || !isSongoskriti) return undefined;
    const facets = groupFacetRows(songoskritiPreviewFacets());
    const params = normalizeSearchParams({ q: SONGOSKRITI_PREVIEW_QUERY_TERM });
    const chip = (key: "category" | "kind", row: WidgetRow) => (
      <a
        key={`${key}:${row.id}`}
        href={facetHref(
          SONGOSKRITI_PREVIEW_SEARCH_PATH,
          toggleFacet(params, key, row.id),
        )}
        className="inline-flex min-h-11 items-center gap-2 rounded-fq-md border border-border bg-card px-3 text-sm"
      >
        {row.title}
        {typeof row.count === "number" ? ` (${row.count})` : ""}
      </a>
    );
    return (
      <div className="space-y-6">
        {/* The platform's query box — search EXECUTION, not presentation.
            The platform owns it; no theme can author one. */}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="min-w-0 flex-1">
            <label
              htmlFor="fq-preview-search"
              className="block text-xs font-medium text-muted-foreground"
            >
              {t(
                "Product name, description or tag",
                "পণ্যের নাম, বিবরণ বা ট্যাগ",
              )}
            </label>
            <input
              id="fq-preview-search"
              name="q"
              type="search"
              defaultValue={SONGOSKRITI_PREVIEW_QUERY_TERM}
              maxLength={80}
              placeholder={t("e.g. jamdani shari", "যেমন: জামদানি শাড়ি")}
              className="min-h-11 w-full rounded-fq-md border border-border bg-card px-3 text-sm"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            {t("Search", "খুঁজুন")}
          </button>
        </form>
        {/* The platform's category/kind chips — real links built from the
            demo query, so the preview shows the filters are links. */}
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">
            {t("Category", "ক্যাটাগরি")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {facets.category.map((row) => chip("category", row))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-medium text-muted-foreground">
            {t("Product type", "পণ্যের ধরন")}
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {facets.kind.map((row) => chip("kind", row))}
          </div>
        </fieldset>
        {/* The platform's results grid — the demo rows above. */}
        <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 md:grid-cols-3 xl:grid-cols-4">
          {searchDemoRows.map((row) => (
            <li key={row.id}>
              <ProductCard row={row} locale={lang} variant="standard" />
            </li>
          ))}
        </ul>
      </div>
    );
  }, [baseTemplate, isSongoskriti, searchDemoRows, lang, t]);

  // The blog pack is a context widget set too (`blog_terms` /
  // `blog_archive` / `blog_pager` carry a `templates:` allowlist), so the
  // preview grants them on the `blog` template: the pack then reads the
  // demo feed the host mounts below instead of rendering nothing.
  const blogSlots =
    baseTemplate === "blog"
      ? {
          blog_terms: null,
          blog_archive: null,
          blog_pager: null,
        }
      : undefined;

  // The preview has no CMS page record: `page_content` is a CONTEXT widget
  // (`src/components/builder/widgets.tsx:1617`), so the host must hand it a
  // node. Without one the fixed page template renders chrome with an empty
  // body. The demo fixture mirrors the production payload shape
  // (`src/components/store/PageView.tsx:73-110`) and is labelled as demo.
  // The "Last updated" label is localised through the SAME `t` the
  // production route uses (`src/components/store/PageView.tsx:104`), so the
  // preview follows its own locale instead of hardcoding English.
  const pageSlots = useMemo(() => {
    if (baseTemplate !== "page" && template !== "blog_article")
      return undefined;
    // The Songoskriti blueprint shows the theme's own labelled sample page;
    // every other blueprint keeps the shared demo page.
    const page = isSongoskriti ? SONGOSKRITI_PREVIEW_PAGE : PREVIEW_DEMO_PAGE;
    return {
      // The `breadcrumb` widget is a CONTEXT widget: the storefront's page
      // host grants it with the route's own crumb trail
      // (`src/components/store/PageView.tsx` — `contextSlots={{ breadcrumb,
      // page_content: pageContent }}`). The preview grants it too, so the
      // theme's page body renders the same sections on both surfaces
      // (Batch C — the preview-parity contract).
      breadcrumb: null,
      page_content: (
        <article>
          <h1 className="font-bangla-display text-3xl font-bold">
            {page.title}
          </h1>
          <p className="mt-2 text-muted-foreground">{page.excerpt}</p>
          <div
            className="fq-prose mt-6 space-y-4 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: page.html }} // sast-allow: html-sink -- static first-party demo literal from src/lib/preview-page-data.ts, no merchant or shopper data reaches this sink
          />
          <p className="mt-8 text-xs text-muted-foreground">
            {t("Last updated", "সর্বশেষ হালনাগাদ")}:{" "}
            <time dateTime={page.updated_at} className="money">
              {new Date(page.updated_at).toLocaleDateString("en-GB")}
            </time>
          </p>
        </article>
      ),
    };
  }, [baseTemplate, template, t, isSongoskriti]);

  // The theme's own demo providers — the Songoskriti blueprint only. The
  // `CartProvider` wrap goes around the WHOLE preview canvas — BOTH
  // branches, the authored checkout body and the ordinary canvas — so the
  // cart widgets read one cart context (the synthetic cart, not the studio's
  // `DEMO_CART` fallback). The `BlogFeedProvider` wrap carries the demo
  // feed the blog pack reads. The `CollectionQueryProvider` carries the
  // demo query, so the theme's facet, sort and pager widgets compute REAL
  // links in the preview. Every other blueprint keeps today's behaviour
  // byte-for-byte.
  const previewCart = useMemo(() => songoskritiPreviewCart(), []);
  const previewFeed = useMemo(() => songoskritiPreviewFeed(), []);
  // The archive template's functional slots (Decision D1'). The content
  // archive is a LISTING page: the platform's own `category_header` grant,
  // the blog pack (terms / listing / pager) and the paging. `empty_state` is
  // the ONE conditional grant, mirroring the merchant host and Search: the
  // demo feed carries articles, so the theme's "Nothing in this archive
  // yet" panel must not render underneath the listing (Swarm 4 §(u.5)).
  const archiveSlots =
    baseTemplate === "archive"
      ? {
          category_header: null,
          blog_terms: null,
          blog_archive: null,
          blog_pager: null,
          pagination: null,
          ...(previewFeed.articles.length === 0 ? { empty_state: null } : {}),
        }
      : undefined;
  // The theme authors `empty_state` as an ordinary archive section, so the
  // context grant alone is not enough: strip the authored panel from the
  // rendered body while the demo feed has articles (Swarm 4 §(u.5)).
  const previewMain =
    baseTemplate === "archive" && previewFeed.articles.length > 0
      ? stripArchiveEmptyState(focusedMain)
      : focusedMain;
  /**
   * The preview's rail SELECTION — LOCAL state, not the cart's inert
   * no-op.
   *
   * The demo cart is inert by design: it must never reach a server. But a
   * control that looks live and does nothing is worse than no control (the
   * plan's **D6**), so the SELECTION is a real local transition: choosing a
   * rail in the preview changes the preview. The demo cart's own
   * `setMethod` stays the no-op it was built with — the live cart context
   * is never touched.
   */
  const { method: previewMethod, setMethod: setPreviewMethod } =
    usePreviewRailSelection();
  const previewCartWithSelection = useMemo(
    () => ({
      ...previewCart,
      method: previewMethod,
      setMethod: (method: PaymentMethodKey) => setPreviewMethod(method),
    }),
    [previewCart, previewMethod, setPreviewMethod],
  );
  const previewQuery = useMemo(
    () => ({
      params: normalizeSearchParams({ q: SONGOSKRITI_PREVIEW_QUERY_TERM }),
      // The demo total is the explicit, labelled 38 — NOT the demo
      // catalogue's own 13 products: the platform pages at `PAGE_SIZE = 24`
      // and the pager renders only above one page, so a catalogue-derived
      // total would render no pager at all in the preview.
      total: SONGOSKRITI_PREVIEW_SEARCH_TOTAL,
      basePath: SONGOSKRITI_PREVIEW_SEARCH_PATH,
      navigate: undefined,
    }),
    [],
  );

  // ---- preview canvas: full-bleed, no frame. Clicks navigate between
  // templates in place; actions and submits are blocked. ----
  /**
   * S5 / Decision D6 — the payment rail's visible DEMO marker.
   *
   * The preview's rail selection is a real local transition (the control is
   * not inert), but it never reaches a cart or an order. The marker says so
   * beside the rail on the two templates that show it.
   *
   * The marker REUSES the shared preview sentence (`PREVIEW_DISABLED_MESSAGE`)
   * as its PREFIX and appends ONE clause of its own, which says what the demo
   * selection affects. The clause is ENGLISH-ONLY on purpose: translations
   * are out of scope for this programme (the plan's Global Constraints), the
   * marker is preview CHROME and not part of the theme's template AST, and
   * the translation meter (`src/lib/translation-coverage.ts:92`) is a pure
   * function of those ASTs — so it does not cover this string at all. The
   * clause is stated here and recorded in the escalation record; it is not
   * silently "fixed", and a bilingual marker would need a separate,
   * explicitly ratified translation task.
   *
   * The marker is SPLIT so the shared sentence stands alone as its own
   * sentence, instead of reading "Disabled in preview: payment selection
   * changes this preview only."
   */
  const paymentDemoMarker =
    baseTemplate === "cart" || baseTemplate === "checkout" ? (
      <p
        data-fq-demo-marker="payment-methods"
        role="note"
        className="mx-auto max-w-7xl px-4 pt-4 text-[12px] text-muted-foreground sm:px-6 lg:px-8"
      >
        <span className="font-semibold">{PREVIEW_DISABLED_MESSAGE}</span>{" "}
        <span>Payment selection changes this preview only.</span>
      </p>
    ) : null;
  const canvas = (
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
          {/*
            The `unsupported` flag (the fallback above) is CONSUMED here: when
            the theme does not author the requested template the canvas
            renders the named "not supported by this theme" PANEL and the
            homepage body is NOT rendered. When the flag is false the canvas
            renders exactly as it does today.
          */}
          {unsupported ? (
            <UnsupportedTemplateNotice template={template} />
          ) : (
            <>
              {/* Per-device overrides, same contract as ThemeChrome:
                verbatim stylesheet, inside the theme scope. */}
              {responsive.css ? (
                <style
                  data-fq-responsive={String(responsive.rules)}
                  dangerouslySetInnerHTML={{ __html: responsive.css }} // sast-allow: html-sink -- compileResponsiveCss EMITTERS emit only clamped numbers and oneOf vocabulary values under generated selectors
                />
              ) : null}

              {/* Top-level ribbon bar (e.g. subbrand_bar) rendered above the store masthead */}
              {ast.header
                .filter((section) => section.type === "subbrand_bar")
                .map((section) => (
                  <SectionRenderer
                    key={section.id}
                    section={section}
                    template={baseTemplate}
                    editing={false}
                    storeSlug={blueprintKey}
                    themeKey={blueprintKey}
                    contextSlots={
                      accountSlots ||
                      accountBodySlot ||
                      productSlots ||
                      undefined
                    }
                  />
                ))}

              {/* Wordmark row, as on a live storefront — the blueprint's
                navigation sections render beneath it. */}
              {baseTemplate === "checkout" ? (
                <>
                  {/* The AUTHORED checkout template, rendered through the same
                    SectionRenderer the storefront uses — the composition that
                    replaced the generic checkout mock (the file was deleted
                    2026-10-22, proven unused by the obsolete-path record's
                    O1). The five cart slots are granted above, so the
                    platform's `checkout_steps` / `payment_methods` /
                    `cart_summary` widgets render against the synthetic cart
                    context. `MinimalCheckoutHeader` is the CHROME (the header
                    lockup), never the body. */}
                  <MinimalCheckoutHeader
                    slug={blueprintKey}
                    name={themeName}
                    themeKey={blueprintKey}
                  />
                  {paymentDemoMarker}
                  {previewMain.length > 0 ? (
                    <main className="space-y-12 sm:space-y-16 pb-16">
                      {previewMain.map((section) => (
                        <SectionRenderer
                          key={section.id}
                          section={section}
                          template={baseTemplate}
                          editing={false}
                          storeSlug={blueprintKey}
                          themeKey={blueprintKey}
                          contextSlots={{
                            ...accountSlots,
                            ...accountBodySlot,
                            ...productSlots,
                            ...cartSlots,
                            ...checkoutSlots,
                            ...searchSlots,
                            ...blogSlots,
                            ...pageSlots,
                            ...archiveSlots,
                          }}
                          productSlot={searchProductSlot}
                          primary={section.id === primaryId}
                        />
                      ))}
                    </main>
                  ) : (
                    <div className="grid min-h-[40vh] place-items-center p-8 text-sm text-muted-foreground">
                      No sections authored for this template.
                    </div>
                  )}
                </>
              ) : (
                <>
                  <StoreHeader
                    slug={blueprintKey}
                    name={themeName}
                    menus={null}
                    themeKey={blueprintKey}
                  />
                  {baseTemplate === "cart" ? paymentDemoMarker : null}
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
                          template={baseTemplate}
                          editing={false}
                          storeSlug={blueprintKey}
                          themeKey={blueprintKey}
                          contextSlots={{
                            ...accountSlots,
                            ...accountBodySlot,
                            ...productSlots,
                            ...cartSlots,
                            ...checkoutSlots,
                            ...searchSlots,
                            ...blogSlots,
                            ...pageSlots,
                            ...archiveSlots,
                          }}
                        />
                      ))}

                    {/* main slot */}
                    {mockOrder ? (
                      <OrderConfirmationMock
                        slug={blueprintKey}
                        themeName={themeName}
                        status={mockOrder}
                      />
                    ) : previewMain.length > 0 ? (
                      <main className="space-y-12 sm:space-y-16 pb-16 [&>[data-fq-node^='announcement_bar']]:!mt-0 [&>[data-fq-node^='announcement_bar']+*]:!mt-0">
                        {previewMain.map((section) => (
                          <SectionRenderer
                            key={section.id}
                            section={section}
                            template={baseTemplate}
                            editing={false}
                            storeSlug={blueprintKey}
                            themeKey={blueprintKey}
                            contextSlots={{
                              ...accountSlots,
                              ...accountBodySlot,
                              ...productSlots,
                              ...cartSlots,
                              ...checkoutSlots,
                              ...searchSlots,
                              ...blogSlots,
                              ...pageSlots,
                              ...archiveSlots,
                            }}
                            productSlot={searchProductSlot}
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
                              template={baseTemplate}
                              editing={false}
                              themeKey={blueprintKey}
                              contextSlots={{
                                ...accountSlots,
                                ...accountBodySlot,
                                ...productSlots,
                                ...cartSlots,
                                ...checkoutSlots,
                                ...searchSlots,
                                ...blogSlots,
                                ...pageSlots,
                                ...archiveSlots,
                              }}
                            />
                          ))}
                        </div>
                      </footer>
                    )}
                  </WidgetDataProvider>
                </>
              )}
            </>
          )}
        </ThemeSurface>
      </div>
    </div>
  );

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

      {isSongoskriti ? (
        <AccountDashboardProvider value={previewAccountState}>
          <CartProvider value={previewCartWithSelection}>
            <CollectionQueryProvider value={previewQuery}>
              <BlogFeedProvider value={previewFeed}>{canvas}</BlogFeedProvider>
            </CollectionQueryProvider>
          </CartProvider>
        </AccountDashboardProvider>
      ) : (
        canvas
      )}
    </div>
  );
}
