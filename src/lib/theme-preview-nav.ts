/**
 * In-preview navigation (Envato-style demo browsing).
 *
 * Links inside a theme preview point at live storefront permalinks
 * (`/c/<slug>`, `/p/<slug>`, …) which 404 on platform hosts — there is no
 * merchant there. Instead of escaping the frame, the preview maps demo
 * links onto its own template tabs so every tap shows authored demo
 * content. Unmapped links (external, tel:, mailto:, anchors) return null
 * and keep default browser behavior.
 *
 * Theme-agnostic by design: this module never names a theme, imports no
 * theme folder, and carries no theme copy. Themes plug in through the
 * `PreviewThemeSource` port (implemented per theme, wired in
 * `preview-sources`); templates a theme does not author get a generic
 * engine-synthesized demo body so no link ever lands on an empty page.
 */
import type {
  Section,
  SectionBuilder,
  TemplateKey,
  TemplateMatch,
  ThemeAst,
  ThemeTemplates,
  ThemeTokens,
} from "./builder-ast";
import { TEMPLATE_KEYS, resolveTemplate } from "./builder-ast";
import {
  TEMPLATE_VARIANT_KEYS,
  baseTemplateKey,
  isTemplateVariantKey,
  resolveVariantAst,
  type TemplateVariantKey,
} from "./template-variants";
import { demoCatalogFor } from "./demo-catalog";
import { previewSourceFor } from "./preview-sources";
import type { InstalledThemeRef } from "./preview-sources";
import {
  MAX_VARIATION_KEY_LENGTH,
  VARIATION_KEY_RE,
  applyVariationTokens,
  variationForKey,
  type ThemeVariation,
} from "./theme-variations";

export type PreviewTarget = {
  template: TemplateKey;
  slug: string | null;
  query: string | null;
};

const BLOCKED_HREF_RE =
  /(^|\/)(order|track|sign-?in|sign-?up|login|register)([/?#]|$)/i;

export function isPreviewBlockedHref(href: string): boolean {
  const path = href.split(/[?#]/, 1)[0] ?? "";
  return BLOCKED_HREF_RE.test(path);
}

export function previewTargetForHref(href: string): PreviewTarget | null {
  if (!href) return null;
  href = href.trim();
  if (!href || href.startsWith("#")) return null;
  if (/^(mailto:|tel:)/i.test(href)) return null;
  if (/^https?:\/\//i.test(href)) {
    try {
      const u = new URL(href);
      if (typeof window === "undefined" || u.origin !== window.location.origin)
        return null;
      href = u.pathname + u.search + u.hash;
    } catch {
      return null;
    }
  }
  if (!href.startsWith("/")) return null;
  if (isPreviewBlockedHref(href)) return null;
  const [pathRaw, queryRaw] = href.split("?", 2);
  const path = (pathRaw ?? "").toLowerCase();
  const rest = path.replace(/^\/store\/[^/]+/, "") || "/";
  const query = queryRaw?.split("#", 1)[0] ?? null;
  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^\/p\/([^/?#]+)/)))
    return { template: "product", slug: m[1]!, query };
  if ((m = rest.match(/^\/products?(?:\/([^/?#]+))?/)))
    return { template: "product", slug: m[1] ?? null, query };
  if ((m = rest.match(/^\/c\/([^/?#]+)/)))
    return { template: "collection", slug: m[1]!, query };
  if ((m = rest.match(/^\/collections?(?:\/([^/?#]+))?/)))
    return { template: "collection", slug: m[1] ?? null, query };
  if (rest === "/search" || rest === "/search/")
    return { template: "search", slug: null, query };
  if (rest === "/cart" || rest === "/cart/")
    return { template: "cart", slug: null, query };
  if (rest === "/checkout" || rest === "/checkout/")
    return { template: "checkout", slug: null, query };
  if (rest === "/account" || rest.startsWith("/account/"))
    return { template: "account", slug: null, query };
  if ((m = rest.match(/^\/pages?\/([^/?#]+)/)))
    return { template: "page", slug: m[1]!, query };
  if (rest === "/blog" || rest.startsWith("/blog/")) {
    const sm = rest.match(/^\/blog\/([^/?#]+)/);
    return { template: "blog", slug: sm?.[1] ?? null, query };
  }
  if (rest === "/" || rest === "/index" || rest === "/home")
    return { template: "index", slug: null, query };
  return null;
}

export function previewTemplateForHref(href: string): TemplateKey | null {
  return previewTargetForHref(href)?.template ?? null;
}

export type PreviewClickAction =
  | { kind: "blocked" }
  | { kind: "switch"; target: PreviewTarget }
  | { kind: "allow" };

export function previewClickAction(
  href: string | null | undefined,
): PreviewClickAction {
  if (!href || href.startsWith("#")) return { kind: "allow" };
  if (isPreviewBlockedHref(href)) return { kind: "blocked" };
  const target = previewTargetForHref(href);
  return target ? { kind: "switch", target } : { kind: "allow" };
}

/* ------------------------------ preview canvas interception */

export type PreviewCanvasClickEvent = {
  // `unknown` keeps the fake-event stubs in the node-env suite assignable;
  // the handler only reads `closest` through a guarded cast.
  target: unknown;
  preventDefault: () => void;
  stopPropagation: () => void;
};

/** Toast copy shown whenever a preview action is blocked. */
export const PREVIEW_DISABLED_MESSAGE = "Disabled in preview";

const SUBMIT_CONTROL_SELECTOR = 'button[type="submit"],input[type="submit"]';

/**
 * Capture-phase click interception for the preview canvas: submit controls
 * inside any form and signup / order-tracking links are blocked with a
 * toast, while product / collection / search / page / blog / cart /
 * checkout / account / home links report their target through `switchTo`
 * (template + focus slug + raw search query) so the frame can swap content
 * and sync the URL. Product/collection links additionally report their slug
 * through switchTo so the demo renders the clicked collection, not a
 * static page. Everything else passes through untouched.
 */
export function handlePreviewCanvasClick(
  event: PreviewCanvasClickEvent,
  switchTo: (
    template: TemplateKey,
    focus: string | null,
    query: string | null,
  ) => void,
  notify: (message: string) => void,
): void {
  const el = event.target as HTMLElement | null;
  const submit = el?.closest?.(SUBMIT_CONTROL_SELECTOR) as HTMLElement | null;
  if (submit && submit.closest?.("form")) {
    event.preventDefault();
    event.stopPropagation();
    notify(PREVIEW_DISABLED_MESSAGE);
    return;
  }
  const anchor = el?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return;
  const action = previewClickAction(anchor.getAttribute("href"));
  if (action.kind === "blocked") {
    event.preventDefault();
    event.stopPropagation();
    notify(PREVIEW_DISABLED_MESSAGE);
  } else if (action.kind === "switch") {
    event.preventDefault();
    event.stopPropagation();
    switchTo(
      action.target.template,
      action.target.slug !== null &&
        (action.target.template === "collection" ||
          action.target.template === "product")
        ? action.target.slug
        : null,
      action.target.query,
    );
  }
}

/**
 * Capture-phase submit interception for the preview canvas: newsletter,
 * contact, coupon and every other form is blocked with a toast. Runs in
 * capture so widget `onSubmit` handlers (contact API, coupon state) never
 * fire.
 */
export function handlePreviewCanvasSubmit(
  event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  },
  notify: (message: string) => void,
): void {
  event.preventDefault();
  event.stopPropagation();
  notify(PREVIEW_DISABLED_MESSAGE);
}

/* ---------------------------------- preview search query round-trip */

const PREVIEW_SEARCH_QUERY_LIMIT = 200;

const PREVIEW_FOCUS_RE = /^[a-z0-9]+(?:-[a-z0-9]+){0,7}$/;

/**
 * Parse the raw in-canvas search query (`/search?max=99900` → `"max=99900"`)
 * into separate preview search keys. Only `q` and `max` survive (strings
 * ≤200); everything else is dropped so the preview URL stays refresh-safe.
 */
export function parsePreviewSearchQuery(raw: string | null): {
  q?: string;
  max?: string;
} {
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const out: { q?: string; max?: string } = {};
  for (const key of ["q", "max"] as const) {
    const value = params.get(key);
    if (value !== null && value !== "")
      out[key] = value.slice(0, PREVIEW_SEARCH_QUERY_LIMIT);
  }
  return out;
}

/**
 * Search updater for the preview frame's `navigate({ to: ".", search })`:
 * writes the focused slug under the `?focus=` contract (never `?slug=` —
 * merchant-less redirects use `focus`), writes the parsed query as
 * separate keys (never the raw string as `q`), clears `q`/`max` when
 * leaving the search template so a previous `/search?max=…` click does not
 * leak into collection/product URLs, and clears the UNSUPPORTED request
 * (`unsupportedTemplate`) so an answered request never lingers in the URL.
 */
export function previewSearchForSwitch(
  template: TemplateKey,
  focus: string | null,
  query: string | null,
  prev: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...prev,
    template,
    ...(focus ? { focus } : { focus: undefined }),
    ...(template === "search"
      ? { q: undefined, max: undefined, ...parsePreviewSearchQuery(query) }
      : { q: undefined, max: undefined }),
    // Switching to a template ENDS the unsupported request: the visitor is
    // on a template the theme authors, so the key they asked for is
    // answered and must not linger in the URL.
    unsupportedTemplate: undefined,
  };
}

/**
 * The longest template key the preview accepts from the URL.
 *
 * A template key is a short token; anything longer is not a key a merchant
 * could have typed, and the preview never echoes it back into the canvas.
 */
const PREVIEW_TEMPLATE_KEY_LIMIT = 64;

/**
 * A key-shaped template token: alphanumerics, dashes and underscores.
 *
 * The preview host PRINTS the requested key inside the unsupported panel
 * (`src/components/store/ThemePreviewFrame.tsx:136-151`), so the value that
 * reaches it is bounded and key-shaped — never markup, never an unbounded
 * string.
 */
const PREVIEW_TEMPLATE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Route `validateSearch` for `/theme-preview/$key`: template + focus plus
 * the preserved search query keys (`q`, `max`, strings ≤200) so refresh
 * keeps `?template=search&max=99900` instead of dropping it.
 */
export function validateThemePreviewSearch(search: Record<string, unknown>): {
  template: TemplateKey | TemplateVariantKey | undefined;
  /**
   * The REQUESTED template key when it is NOT one of the template keys.
   *
   * Decision D1': an unsupported template is an EXPLICIT state, never a
   * silent homepage redirect. The key therefore has to REACH the preview
   * host, which resolves it against the theme's authored bodies and renders
   * the named "not supported by this theme" panel for a key it does not have
   * (`src/components/store/ThemePreviewFrame.tsx:575-578`). `template` above
   * keeps its meaning — a key the platform knows — and this field carries
   * the request the platform does not know. `archive` is a KNOWN key now
   * (the content archive is a first-class template, Decision D1'), and so is
   * every key of the CLOSED variant vocabulary (`blog_listing`,
   * `blog_article`, `archive_category`, …) — the platform routes to those,
   * so they travel in `template` and the host resolves them through the
   * variant rule. The keys that reach this field are the ones the platform
   * still does not know. It is OPTIONAL in the type (like
   * `variation` and `mock_order`) so the routes that navigate INTO the
   * preview with a known template keep their own search shape.
   *
   * The validation is IDEMPOTENT: the key is read back from this field when
   * `template` is absent, so a second validation pass (TanStack Router
   * validates the search more than once per request) carries the request
   * forward instead of dropping it. See the comment at the `rawTemplate`
   * binding below for the measured consequence of a non-idempotent
   * validation.
   */
  unsupportedTemplate?: string | undefined;
  focus: string | undefined;
  q: string | undefined;
  max: string | undefined;
  variation?: string | undefined;
  mock_order?: "success" | "pending" | "failed";
} {
  // The requested key is read from `template` OR from the carried
  // `unsupportedTemplate` — the validation MUST be IDEMPOTENT.
  //
  // Why: TanStack Router validates a route's search MORE THAN ONCE per
  // request. `matchRoutesLightweight` folds `validateSearch` into the
  // accumulated search, and the SSR canonicalisation
  // (`@tanstack/router-core/dist/esm/load-server.js`, `loadServerRoute`)
  // builds the canonical URL with `_includeValidateSearch: true`, which runs
  // `validateSearch` over that already-validated search AGAIN. The second
  // pass used to read `template` only — and by then `template` was already
  // `undefined` for an unknown key — so the second pass DROPPED the carried
  // request, the canonical URL came out as the BARE path, and the router
  // answered `?template=blog_anything` with a 307 to the bare path, which
  // renders the homepage composition instead of the explicit unsupported
  // panel.
  //
  // Reading the carried key back makes the validation idempotent: the
  // canonical URL keeps the request, and the canonical URL is stable (a
  // request for it validates to itself — no redirect loop).
  const rawTemplate =
    typeof search.template === "string"
      ? search.template
      : typeof search.unsupportedTemplate === "string"
        ? search.unsupportedTemplate
        : "";
  const template = (TEMPLATE_KEYS as readonly string[]).includes(rawTemplate)
    ? (rawTemplate as TemplateKey)
    : // A CLOSED VARIANT key (`blog_listing`, `blog_article`, …) is a
      // KNOWN template: the platform routes to it, so it travels in the
      // known slot and the preview host resolves it through the variant
      // rule (the variant first, then its base). A key OUTSIDE the closed
      // table is still the unsupported request.
      isTemplateVariantKey(rawTemplate)
      ? rawTemplate
      : undefined;
  return {
    template,
    unsupportedTemplate:
      template === undefined &&
      rawTemplate.length > 0 &&
      rawTemplate.length <= PREVIEW_TEMPLATE_KEY_LIMIT &&
      PREVIEW_TEMPLATE_KEY_RE.test(rawTemplate)
        ? rawTemplate
        : undefined,
    focus:
      typeof search.focus === "string" &&
      search.focus.length <= 64 &&
      PREVIEW_FOCUS_RE.test(search.focus)
        ? search.focus
        : undefined,
    q:
      typeof search.q === "string"
        ? (search.q as string).slice(0, PREVIEW_SEARCH_QUERY_LIMIT)
        : undefined,
    max:
      typeof search.max === "string"
        ? (search.max as string).slice(0, PREVIEW_SEARCH_QUERY_LIMIT)
        : undefined,
    // Theme variation deep-link (`?variation=minimal`): slug-shaped only;
    // unknown keys resolve to the base theme downstream (default fallback).
    variation:
      typeof search.variation === "string" &&
      search.variation.length <= MAX_VARIATION_KEY_LENGTH &&
      VARIATION_KEY_RE.test(search.variation)
        ? search.variation
        : undefined,
    mock_order:
      search.mock_order === "success" ||
      search.mock_order === "pending" ||
      search.mock_order === "failed"
        ? search.mock_order
        : undefined,
  };
}

/* ------------------------------------------------- preview key resolver */

/**
 * Port a theme implements to plug into the preview engine. Implemented per
 * theme (see `lib/themes/<name>/preview.ts`), consumed only through the
 * `preview-sources` registry — never imported by the engine directly.
 */
export type PreviewThemeSource = {
  key: string;
  themeName: string;
  author: string;
  tokens: ThemeTokens;
  /**
   * Merchant-pickable theme variations (Track T): token + default-skin
   * overlays only. Absent/empty means the theme ships the base look alone.
   */
  variations?: ThemeVariation[];
  header: (template: TemplateKey, s: SectionBuilder) => Section[];
  footer: (template: TemplateKey, s: SectionBuilder) => Section[];
  /**
   * Authored demo body per template. Return null for templates the theme
   * does not author — the engine synthesizes a generic demo body.
   */
  main: (template: TemplateKey, s: SectionBuilder) => Section[] | null;
  /**
   * Authored demo body per VARIANT (`blog_listing`, `blog_article`, …).
   *
   * OPTIONAL: a theme that ships no variant body keeps the exact behaviour
   * it had before this port existed — the variant map is simply empty and
   * every variant falls back to its base template. Return null for a
   * variant the theme does not author.
   */
  variantMain?: (
    variant: TemplateVariantKey,
    s: SectionBuilder,
  ) => Section[] | null;
};

export type ThemePreviewPreset = {
  key: string;
  themeName: string;
  author: string;
  tokens: ThemeTokens;
  /**
   * The theme's AUTHORED bodies — a **PARTIAL** map.
   *
   * A template the theme does not author stays ABSENT from it: the preview
   * host turns an absent key into its explicit "not supported by this theme"
   * panel. The map used to be TOTAL, and that totality is what forced the
   * engine to SYNTHESISE a body for every key it knew (the plan's **D4**) —
   * a silent generic fallback dressed as a theme page.
   */
  templates: Partial<Record<TemplateKey, ThemeAst>>;
  /**
   * The theme's authored VARIANT bodies, keyed `blog_listing` / `blog_article`.
   *
   * A SEPARATE map, never folded into `templates`: the base map is the
   * template-key space the preview host resolves against, and a key the
   * platform does not know must stay ABSENT from it (the host turns an
   * absent key into its explicit "not supported by this theme" panel).
   */
  variants: Record<string, ThemeAst>;
  /** Active theme variation (null = base theme, the default fallback). */
  variation: ThemeVariation | null;
  /** Every variation the theme ships (empty when it ships none). */
  variations: ThemeVariation[];
};

const GENERIC_TITLES: Record<TemplateKey, [string, string]> = {
  index: ["Home", "হোম"],
  product: ["Product", "পণ্য"],
  collection: ["Collection", "কালেকশন"],
  account: ["Account", "অ্যাকাউন্ট"],
  page: ["Page", "পাতা"],
  blog: ["Blog", "ব্লগ"],
  cart: ["Your bag", "আপনার ব্যাগ"],
  checkout: ["Checkout", "চেকআউট"],
  search: ["Search results", "খোঁজার ফলাফল"],
  archive: ["Archive", "আর্কাইভ"],
};

/**
 * The distinctness gate's REFERENCE body — the yardstick the gate measures a
 * theme's own body against (`src/lib/themes/songoskriti/template-distinctness.ts`),
 * not a synthesiser: the preview never renders it, because a template the
 * theme does not author stays absent from the map (the plan's **D4**).
 * Static sections only (heading + rich text always render; no data, no art,
 * no theme copy), opening with a heading so the reference body owns its h1.
 */
export function genericDemoMain(
  template: TemplateKey,
  s: SectionBuilder,
): Section[] {
  const [text, text_bn] = GENERIC_TITLES[template];
  return [
    s("heading", { text, text_bn }),
    s("rich_text", {
      heading: text,
      heading_bn: text_bn,
      body: "Demo page. The live theme authors this template — what you see here is the engine fallback.",
      body_bn:
        "ডেমো পাতা। লাইভ থিম এই টেমপ্লেটটি নিজে সাজায় — এখানে ইঞ্জিনের বিকল্প দেখছেন।",
    }),
  ];
}

/**
 * Assemble every template a source AUTHORS: one shared id counter, shared
 * header/footer cloned under template-scoped ids (same convention as
 * withSearch in theme-blueprints), and the theme-authored main.
 *
 * **A template the theme does not author stays ABSENT from the map.** The
 * engine never synthesises a body for it: the preview host's existing
 * `unsupported` branch renders the explicit "not supported by this theme"
 * panel instead (the plan's **D4**). `genericDemoMain` STAYS in this module
 * — it is the distinctness gate's REFERENCE body
 * (`src/lib/themes/songoskriti/template-distinctness.ts`), the yardstick the
 * gate measures a theme's own body against, not a synthesiser.
 */
export function assemblePreviewTemplates(
  source: PreviewThemeSource,
): Partial<Record<TemplateKey, ThemeAst>> {
  let n = 0;
  const s: SectionBuilder = (type, props = {}) => {
    const section: Section = {
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    };
    return section;
  };
  const reid = (sections: Section[], scope: string): Section[] =>
    sections.map((section) => ({ ...section, id: `${section.id}-${scope}` }));
  const templates: Partial<Record<TemplateKey, ThemeAst>> = {};
  for (const templateKey of TEMPLATE_KEYS) {
    const main = source.main(templateKey, s);
    // A template the theme does not author is ABSENT — never synthesised.
    if (!main) continue;
    const headerBase = source.header(templateKey, s);
    const footerBase = source.footer(templateKey, s);
    templates[templateKey] = {
      header: reid(headerBase, templateKey),
      main,
      footer: reid(footerBase, templateKey),
    };
  }
  return templates;
}

/**
 * Assemble the theme's VARIANT bodies — `blog_listing`, `blog_article`, …
 *
 * A SEPARATE map from the base templates (see `ThemePreviewPreset`): the
 * base map is the template-key space the preview host resolves against, and
 * a key the platform does not know must stay ABSENT from it.
 *
 * A variant carries the header and footer of its BASE template (scoped
 * under the variant's own id, so two variants of one base never collide)
 * and its own authored main. A theme that ships no variant body yields an
 * empty map — the exact behaviour it had before the port existed.
 */
export function assemblePreviewVariants(
  source: PreviewThemeSource,
): Record<string, ThemeAst> {
  const variants: Record<string, ThemeAst> = {};
  if (!source.variantMain) return variants;
  let n = 0;
  const s: SectionBuilder = (type, props = {}) => {
    const section: Section = {
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    };
    return section;
  };
  const reid = (sections: Section[], scope: string): Section[] =>
    sections.map((section) => ({ ...section, id: `${section.id}-${scope}` }));
  for (const variant of TEMPLATE_VARIANT_KEYS) {
    const main = source.variantMain(variant, s);
    if (!main) continue;
    const base = baseTemplateKey(variant);
    if (!base) continue;
    variants[variant] = {
      header: reid(source.header(base, s), variant),
      main,
      footer: reid(source.footer(base, s), variant),
    };
  }
  return variants;
}

/**
 * Resolve a preview preset by key. K2: installed artifact authoritative — when
 * the caller passes the merchant `installed` set (array, even empty) the key
 * resolves ONLY from that set and uninstalled/unknown keys fail closed to
 * null (route renders 404, never a silent wrong theme). Legacy null/undefined
 * (no merchant context, build tooling) resolves from the static registry.
 */
export function resolveThemePreview(
  key: string,
  variationKey?: string | null,
  installed?: readonly InstalledThemeRef[] | null,
): ThemePreviewPreset | null {
  const source = previewSourceFor(key, variationKey ?? undefined, installed);
  if (!source) return null;
  // The source factory already builds with the variation applied; the
  // metadata lookup + idempotent token merge here keep resolvers that
  // bypass the factory honest. Unknown keys fall back to the base theme.
  const variations = source.variations ?? [];
  const variation = variationForKey(variations, variationKey);
  return {
    key: source.key,
    themeName: source.themeName,
    author: source.author,
    tokens: applyVariationTokens(source.tokens, variation),
    templates: assemblePreviewTemplates(source),
    variants: assemblePreviewVariants(source),
    variation,
    variations,
  };
}

/* --------------------------- Phase 2A — preview fallback resolution ---------
 *
 * A preview target resolves through the shared suffix → base → generic
 * chain (builder-ast `resolveTemplate`), so the frame never lands on an
 * empty page: a row suffix wins first, then the clicked slug's variant
 * (`page_<slug>` keeps old theme-package per-page ASTs working), then the
 * base template, then generic `page`, then `index`.
 */
export function resolvePreviewAst(
  templates: ThemeTemplates,
  target: PreviewTarget,
  opts: { suffix?: unknown } = {},
): { key: string; ast: ThemeAst; match: TemplateMatch } {
  return resolveTemplate(templates, target.template, {
    suffix: opts.suffix,
    slug: target.slug,
  });
}

/**
 * Resolve a VARIANT body in the preview — the same rule the storefront
 * routes use: the variant first, then its BASE template, and NOTHING else.
 *
 * A `"page"`, `"index"` or `"empty"` match means the theme authored no
 * composition for that surface; the caller renders its own platform surface
 * instead (never the homepage).
 */
export function resolvePreviewVariantAst(
  templates: ThemeTemplates,
  variant: string,
): { key: string; ast: ThemeAst; match: TemplateMatch } | null {
  if (!isTemplateVariantKey(variant)) return null;
  const base = baseTemplateKey(variant);
  if (!base) return null;
  const suffix = variant.slice(variant.indexOf("_") + 1);
  return resolveVariantAst(templates, base, suffix);
}

/* --------------------------------------- demo focus (slug-aware preview) */

export type DemoFocus = {
  template: TemplateKey;
  /** Clicked slug, as authored in the link. */
  slug: string;
  /** Display heading: catalog name when known, humanized slug otherwise. */
  title: string;
  /** Collection key backing the data rails. */
  collection: string;
  /** Primary catalog art for a known product slug; absent for unknown slugs. */
  image?: string;
  /** Ordered gallery images (image1–image4) for product_media widget injection. */
  images?: string[];
};

const humanizeSlug = (slug: string): string =>
  slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Collection";

/**
 * Resolve a clicked product/collection slug to demo rows + display title.
 * Known catalog slugs render their own rows under their own name; unknown
 * slugs fall back to new-in rows under a humanized title, so the page
 * always changes with the link instead of repeating one static demo.
 */
export function resolveDemoFocus(
  themeKey: string,
  template: TemplateKey,
  slug: string | null | undefined,
): DemoFocus | null {
  if (!slug) return null;
  const catalog = demoCatalogFor(themeKey);
  if (template === "collection") {
    const match = catalog.collections.find((c) => c.slug === slug);
    if (match) return { template, slug, title: match.name, collection: slug };
    // Category slugs (e.g. /c/women) carry no dedicated collection: reuse
    // the collection field with the category slug so rails resolve rows by
    // product.category (see previewDemoMap collection branch).
    const category = catalog.categories.find((c) => c.slug === slug);
    if (category)
      return { template, slug, title: category.name, collection: slug };
    return { template, slug, title: humanizeSlug(slug), collection: "new-in" };
  }
  if (template === "product") {
    const match = catalog.products.find((p) => p.slug === slug);
    return {
      template,
      slug,
      title: match ? match.title : humanizeSlug(slug),
      collection: "new-in",
      image: match?.image_url,
      images: match?.images,
    };
  }
  return null;
}

/**
 * Render-time override for a focused template: the first heading takes the
 * focus title, the first collection-sourced rail takes the focus rows, and
 * (product focus with known catalog art only) the first product_media takes
 * the catalog image as image1. Authored AST untouched (ids stable, bundle
 * keys align); remaining rails and media stay as discovery. Unknown product
 * slugs carry no art, so their static media renders unchanged. bn copy
 * falls back to English by resolveBiText.
 */
export function applyDemoFocus(
  sections: Section[],
  focus: DemoFocus | null,
): Section[] {
  if (!focus) return sections;
  let head = false;
  let rail = false;
  let media = false;

  function walk(nodes: Section[]): Section[] {
    // Finder descends into container/columns children: product detail
    // bodies nest product_media (and friends) under columns > container,
    // so a top-level find would miss them. First-match flags stay
    // document-order across the whole subtree.
    let dirty = false;
    const out = nodes.map((section) => {
      // Preserve reference identity for untouched sections (tests pin
      // `toBe` on the tail): only clone when this node actually changes.
      let next: Section = section;

      if (
        !head &&
        (section.type === "heading" || section.type === "category_header")
      ) {
        head = true;
        next = { ...section, props: { ...section.props, text: focus!.title } };
      }

      if (
        !media &&
        focus!.template === "product" &&
        next.type === "product_media"
      ) {
        media = true;
        // Do not inject static image props so that it falls back to the dynamic DemoProductMediaGallery via ContextSlot
      }

      const isCollectionBound =
        next.type === "product_grid" ||
        (next.type === "product_rail" && next.props["source"] === "collection");
      if (!rail && isCollectionBound) {
        rail = true;
        next = {
          ...next,
          props: {
            ...next.props,
            collection: focus!.collection,
            heading: focus!.title,
          },
        };
      }

      const kids = next.children;
      if (kids) {
        const walked = walk(kids);
        if (walked !== kids) {
          next = { ...next, children: walked };
        }
      }

      if (next !== section) dirty = true;
      return next;
    });
    return dirty ? out : nodes;
  }

  return walk(sections);
}
