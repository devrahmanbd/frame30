/**
 * Phase 0.2 — the single widget registry.
 *
 * One closed record keyed by `SectionType` describes every widget the builder
 * knows: its inspector fields and slots (from the AST catalogue), whether it
 * owns children, whether it resolves live data, whether it must ship a
 * skeleton, and what it contributes to the page's structured data.
 *
 * The type is `Record<SectionType, WidgetMeta>`, so adding a member to
 * `SectionType` fails the build until a registry entry exists. Adding a widget
 * is therefore exactly two edits: one catalogue/registry entry and one
 * renderer.
 *
 * This module is data only — it imports no React and no theme module, so
 * server code (SEO, validation, data resolution) can read it without pulling
 * the renderer into the bundle.
 */
import type { CatalogEntry, Field, SectionType, Slot } from "./builder-ast";
import { SECTION_CATALOG, catalogEntry } from "./builder-ast";

/** Where a data-bound widget gets its rows. Phase 0.3 resolves these in one batch. */
export type WidgetDataSource =
  | "collection"
  | "manual"
  | "recommendation"
  | "reviews"
  | "facets"
  | "taxonomy"
  // Phase 2.3 — product detail page sources.
  | "variants"
  | "qna"
  // Phase 2.5 — a single order row for the tracker.
  | "order"
  // Phase 2.7 — grouped spec rows and server-computed finance rows.
  | "specs"
  | "finance"
  // Phase 2.8 — a single product row (refill SKU, loyalty accrual).
  | "product";

export type WidgetData = {
  source: WidgetDataSource;
  /** Extra inspector fields that parameterise the query (limit, handle, sort…). */
  params: Field[];
};

/** What the widget contributes to structured data / head metadata. */
export type WidgetSeo = {
  /** JSON-LD type emitted for this node, if any. */
  jsonLd?: "FAQPage" | "ItemList" | "Product" | "BreadcrumbList" | "VideoObject" | "HowTo" | "Article";
  /** True when the widget may claim the page's single primary heading. */
  heading: boolean;
  /** Renders above the fold often enough that its media should not lazy-load. */
  eager?: boolean;
};

export type WidgetMeta = {
  type: SectionType;
  label: string;
  group: CatalogEntry["group"];
  slots: Slot[];
  fields: Field[];
  /** Node may own `children` (AST v3 containers). */
  container: boolean;
  /** Present when the widget resolves live data instead of static props. */
  data?: WidgetData;
  /**
   * Data widgets MUST render a box-model-identical placeholder while loading,
   * so hydration never shifts layout. Enforced by test, not convention.
   */
  skeleton: boolean;
  seo: WidgetSeo;
};

/** Per-type additions that the AST catalogue does not carry. */
const OVERRIDES: Partial<Record<SectionType, Partial<WidgetMeta>>> = {
  product_grid: {
    // Phase 0.3: these params are what the batch resolver hashes. Two nodes
    // with the same params share one request.
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max products", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
        {
          key: "sort",
          label: "Sort",
          kind: "select",
          panel: "content",
          options: [
            { value: "newest", label: "Newest" },
            { value: "price_asc", label: "Price: low to high" },
            { value: "price_desc", label: "Price: high to low" },
            { value: "title", label: "Title A–Z" },
          ],
        },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  collection_grid: {
    data: {
      source: "taxonomy",
      params: [{ key: "limit", label: "Max collections", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  // Phase 1: both read the same batched product rows; `recently_viewed`
  // orders them by the cross-section channel, `quick_view` shows them in the
  // shared overlay host.
  recently_viewed: {
    data: {
      source: "collection",
      params: [{ key: "limit", label: "Max items", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  quick_view: {
    data: {
      source: "collection",
      params: [{ key: "limit", label: "Max products", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },



  // Phase 2.1: navigation reads the taxonomy source through the same batch.
  mega_menu: {
    data: {
      source: "taxonomy",
      params: [{ key: "limit", label: "Max entries", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  department_strip: {
    data: {
      source: "taxonomy",
      params: [{ key: "limit", label: "Max departments", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  footer_sitemap: { seo: { jsonLd: "BreadcrumbList", heading: false } },
  search_command: { seo: { heading: false } },
  account_cart: { seo: { heading: false } },

  /* -------------------------------- Phase 2.2 — merchandising widgets ----- */

  product_rail: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max products", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
        { key: "source", label: "Source", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  deal_strip: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max deals", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  sponsored_slot: {
    data: {
      source: "recommendation",
      params: [{ key: "limit", label: "Max items", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  brand_strip: {
    data: {
      source: "taxonomy",
      params: [
        { key: "limit", label: "Max brands", kind: "number", panel: "content" },
        { key: "kind", label: "Taxonomy kind", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  brand_rail: {
    data: {
      source: "taxonomy",
      params: [
        { key: "limit", label: "Max brands", kind: "number", panel: "content" },
        { key: "kind", label: "Taxonomy kind", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  compare_table: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max products", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: false },
  },
  rank_list: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max products", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  deal_card: { seo: { heading: false } },

  /* -------------------------------- Phase 2.3 — product detail page ------- */

  buy_box: {
    data: {
      source: "variants",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { jsonLd: "Product", heading: false },
  },
  variant_picker: {
    data: {
      source: "variants",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  stock_delivery: {
    data: {
      source: "variants",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  sticky_buy_bar: {
    data: {
      source: "variants",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  rating_summary: {
    data: {
      source: "reviews",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { jsonLd: "Product", heading: false },
  },
  review_list: {
    data: {
      source: "reviews",
      params: [
        { key: "handle", label: "Product handle", kind: "text", panel: "content" },
        { key: "limit", label: "Reviews per page", kind: "number", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "Product", heading: false },
  },
  product_qna: {
    data: {
      source: "qna",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { jsonLd: "FAQPage", heading: false },
  },
  delivery_promise: { seo: { heading: false } },

  /* -------------------------------- Phase 2.4 — collection / search ------- */

  facet_sidebar: {
    data: {
      source: "facets",
      params: [
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
        { key: "limit", label: "Max options per group", kind: "number", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: false },
  },
  filter_chips: { seo: { heading: false } },
  result_toolbar: {
    data: {
      source: "facets",
      params: [{ key: "collection", label: "Collection handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  pagination: { seo: { heading: false } },
  category_header: { seo: { jsonLd: "BreadcrumbList", heading: true, eager: true } },
  empty_state: {
    data: {
      source: "collection",
      params: [{ key: "limit", label: "Max suggestions", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },

  seller_card: { seo: { heading: false } },

  product_media: { skeleton: true, seo: { heading: false, eager: true } },
  price_block: { skeleton: true, seo: { jsonLd: "Product", heading: false } },
  add_to_cart: { skeleton: true, seo: { heading: false } },
  product_meta: { skeleton: true, seo: { heading: false } },
  /* -------------------------- Phase 2.5 — cart / checkout ----------------- */
  // Cart widgets read the live CartContext, not the batch resolver: totals must
  // come from the server quote at interaction time, never from a cached row.
  cart_lines: { skeleton: true, seo: { heading: true } },
  cart_summary: { skeleton: true, seo: { heading: true } },
  cart_drawer: { skeleton: true, seo: { heading: false } },
  checkout_steps: { seo: { heading: false } },
  payment_methods: { seo: { heading: true } },
  free_shipping_bar: { seo: { heading: false } },
  order_tracker: {
    data: {
      source: "order",
      params: [{ key: "orderNumber", label: "Order number", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: true },
  },

  /* -------------------------- Phase 2.6 — Atelier (apparel) --------------- */
  editorial_hero: { seo: { heading: true, eager: true } },
  lookbook: { seo: { jsonLd: "ItemList", heading: false, eager: true } },
  shoppable_image: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max pins", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: false },
  },
  ugc_gallery: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max tiles", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  complete_the_look: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max items", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { jsonLd: "ItemList", heading: false },
  },
  size_selector: {
    data: {
      source: "variants",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  back_in_stock: {
    data: {
      source: "variants",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  size_guide: { seo: { heading: false } },
  care_panel: { seo: { jsonLd: "FAQPage", heading: false } },

  /* -------------------------------- Phase 2.7 — Circuit (electronics) ----- */

  spec_table: {
    data: {
      source: "specs",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  spec_highlights: { seo: { heading: false } },
  compare_tray: {
    data: {
      source: "collection",
      params: [{ key: "limit", label: "Rows to resolve", kind: "number", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  warranty_panel: { seo: { heading: false } },
  authenticity_badge: { seo: { heading: false } },
  emi_calculator: {
    data: {
      source: "finance",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  price_sparkline: {
    data: {
      source: "finance",
      params: [
        { key: "handle", label: "Product handle", kind: "text", panel: "content" },
        { key: "days", label: "Window in days", kind: "number", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: false },
  },
  bundle_builder: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Max add-ons", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: false },
  },
  doc_links: { seo: { heading: false } },
  support_strip: { seo: { heading: false } },
  buying_guide: { seo: { jsonLd: "Article", heading: false } },
  trade_in: { seo: { heading: false } },

  /* -------------------------- Phase 2.8 — Rupaboti (beauty) -------------- */
  shade_finder: {
    data: {
      source: "variants",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  skin_quiz: { seo: { heading: true } },
  routine_builder: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Steps", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: true },
  },
  ingredient_list: {
    data: {
      source: "specs",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  ingredient_glossary: { seo: { jsonLd: "FAQPage", heading: false } },
  claim_chips: { seo: { heading: false } },
  before_after: { seo: { heading: false } },
  safety_note: { seo: { heading: false } },
  batch_info: { seo: { heading: false } },
  texture_strip: { seo: { heading: false } },
  how_to_use: { seo: { jsonLd: "HowTo", heading: false } },
  refill_widget: {
    data: {
      source: "product",
      params: [{ key: "handle", label: "Refill handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },
  gift_builder: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Choices", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: true },
  },
  sample_picker: {
    data: {
      source: "collection",
      params: [
        { key: "limit", label: "Samples", kind: "number", panel: "content" },
        { key: "collection", label: "Collection handle", kind: "text", panel: "content" },
      ],
    },
    skeleton: true,
    seo: { heading: false },
  },
  consult_cta: { seo: { heading: false } },
  loyalty_strip: {
    data: {
      source: "product",
      params: [{ key: "handle", label: "Product handle", kind: "text", panel: "content" }],
    },
    skeleton: true,
    seo: { heading: false },
  },

  page_content: { skeleton: true, seo: { heading: false } },
  breadcrumb: { seo: { jsonLd: "BreadcrumbList", heading: false } },
  faq: { seo: { jsonLd: "FAQPage", heading: false } },
  video: { seo: { jsonLd: "VideoObject", heading: false } },
  hero: { seo: { heading: true, eager: true } },
  image: { seo: { heading: false, eager: true } },
};

function metaFor(entry: CatalogEntry): WidgetMeta {
  const override = OVERRIDES[entry.type] ?? {};
  return {
    type: entry.type,
    label: entry.label,
    group: entry.group,
    slots: entry.slots,
    fields: entry.fields,
    container: entry.container === true,
    skeleton: false,
    seo: { heading: entry.heading },
    ...override,
  };
}

/**
 * Closed registry. The `Record<SectionType, …>` annotation is the enforcement:
 * a new `SectionType` without an entry is a compile error.
 */
export const WIDGET_REGISTRY: Record<SectionType, WidgetMeta> = Object.fromEntries(
  SECTION_CATALOG.map((entry) => [entry.type, metaFor(entry)]),
) as Record<SectionType, WidgetMeta>;

export const WIDGET_TYPES = Object.keys(WIDGET_REGISTRY) as SectionType[];

export function widgetMeta(type: SectionType): WidgetMeta | undefined {
  return WIDGET_REGISTRY[type];
}

/** True when the widget needs the Phase 0.3 batched data resolver. */
export function isDataWidget(type: SectionType): boolean {
  return WIDGET_REGISTRY[type]?.data !== undefined || catalogEntry(type)?.templates !== undefined;
}
