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
  ThemeAst,
  ThemeTokens,
} from "./builder-ast";
import { TEMPLATE_KEYS } from "./builder-ast";
import { toast } from "sonner";
import { demoCatalogFor } from "./demo-catalog";
import { previewSourceFor } from "./preview-sources";

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
): void {
  const el = event.target as HTMLElement | null;
  const submit = el?.closest?.(SUBMIT_CONTROL_SELECTOR) as HTMLElement | null;
  if (submit && submit.closest?.("form")) {
    event.preventDefault();
    event.stopPropagation();
    toast.info(PREVIEW_DISABLED_MESSAGE);
    return;
  }
  const anchor = el?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor) return;
  const action = previewClickAction(anchor.getAttribute("href"));
  if (action.kind === "blocked") {
    event.preventDefault();
    event.stopPropagation();
    toast.info(PREVIEW_DISABLED_MESSAGE);
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
export function handlePreviewCanvasSubmit(event: {
  preventDefault: () => void;
  stopPropagation: () => void;
}): void {
  event.preventDefault();
  event.stopPropagation();
  toast.info(PREVIEW_DISABLED_MESSAGE);
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
 * separate keys (never the raw string as `q`), and clears `q`/`max` when
 * leaving the search template so a previous `/search?max=…` click does not
 * leak into collection/product URLs.
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
  };
}

/**
 * Route `validateSearch` for `/theme-preview/$key`: template + focus plus
 * the preserved search query keys (`q`, `max`, strings ≤200) so refresh
 * keeps `?template=search&max=99900` instead of dropping it.
 */
export function validateThemePreviewSearch(search: Record<string, unknown>): {
  template: TemplateKey | undefined;
  focus: string | undefined;
  q: string | undefined;
  max: string | undefined;
} {
  const template =
    typeof search.template === "string" &&
    (TEMPLATE_KEYS as readonly string[]).includes(search.template)
      ? (search.template as TemplateKey)
      : undefined;
  return {
    template,
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
  header: (s: SectionBuilder) => Section[];
  footer: (s: SectionBuilder) => Section[];
  /**
   * Authored demo body per template. Return null for templates the theme
   * does not author — the engine synthesizes a generic demo body.
   */
  main: (template: TemplateKey, s: SectionBuilder) => Section[] | null;
};

export type ThemePreviewPreset = {
  key: string;
  themeName: string;
  author: string;
  tokens: ThemeTokens;
  templates: Record<TemplateKey, ThemeAst>;
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
};

/**
 * Generic demo body for templates a theme does not author. Static sections
 * only (heading + rich text always render; no data, no art, no theme copy),
 * opening with a heading so the page still owns its h1.
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
 * Assemble every template for a source: one shared id counter, shared
 * header/footer cloned under template-scoped ids (same convention as
 * withSearch in theme-blueprints), theme-authored mains where present,
 * generic synthesis where absent.
 */
export function assemblePreviewTemplates(
  source: PreviewThemeSource,
): Record<TemplateKey, ThemeAst> {
  let n = 0;
  const s: SectionBuilder = (type, props = {}) => {
    const section: Section = {
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    };
    return section;
  };
  const headerBase = source.header(s);
  const footerBase = source.footer(s);
  const reid = (sections: Section[], scope: string): Section[] =>
    sections.map((section) => ({ ...section, id: `${section.id}-${scope}` }));
  const templates = {} as Record<TemplateKey, ThemeAst>;
  for (const templateKey of TEMPLATE_KEYS) {
    templates[templateKey] = {
      header: reid(headerBase, templateKey),
      main: source.main(templateKey, s) ?? genericDemoMain(templateKey, s),
      footer: reid(footerBase, templateKey),
    };
  }
  return templates;
}

export function resolveThemePreview(key: string): ThemePreviewPreset | null {
  const source = previewSourceFor(key);
  if (!source) return null;
  return {
    key: source.key,
    themeName: source.themeName,
    author: source.author,
    tokens: source.tokens,
    templates: assemblePreviewTemplates(source),
  };
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
  /** Catalog art for a known product slug; absent for unknown slugs. */
  image?: string;
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
  return sections.map((section) => {
    if (!head && section.type === "heading") {
      head = true;
      return {
        ...section,
        props: { ...section.props, text: focus.title },
      };
    }
    if (
      !media &&
      focus.template === "product" &&
      focus.image &&
      section.type === "product_media"
    ) {
      media = true;
      return {
        ...section,
        props: { ...section.props, image1: focus.image },
      };
    }
    if (
      !rail &&
      section.type === "product_rail" &&
      section.props["source"] === "collection"
    ) {
      rail = true;
      return {
        ...section,
        props: {
          ...section.props,
          collection: focus.collection,
          heading: focus.title,
        },
      };
    }
    return section;
  });
}
