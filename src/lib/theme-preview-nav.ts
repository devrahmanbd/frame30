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
import { demoCatalogFor } from "./demo-catalog";
import { previewSourceFor } from "./preview-sources";

export function previewTemplateForHref(href: string): TemplateKey | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return null;
  // Absolute platform URLs (StoreHeader links) resolve same as root paths.
  const path = raw.replace(/^https?:\/\/[^/]+/i, "").split("?")[0]!;
  if (path === "/") return "index";
  if (path === "/search") return "search";
  if (path === "/cart") return "cart";
  if (path === "/checkout") return "checkout";
  if (path === "/c" || path.startsWith("/c/")) return "collection";
  if (path === "/p" || path.startsWith("/p/")) return "product";
  if (path === "/collections" || path.startsWith("/collections/"))
    return "collection";
  if (path === "/products" || path.startsWith("/products/")) return "product";
  if (path === "/blog" || path.startsWith("/blog/")) return "blog";
  if (
    path === "/pages" ||
    path.startsWith("/pages/") ||
    path === "/page" ||
    path.startsWith("/page/")
  )
    return "page";
  return null;
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
    return { template, slug, title: humanizeSlug(slug), collection: "new-in" };
  }
  if (template === "product") {
    const match = catalog.products.find((p) => p.slug === slug);
    return {
      template,
      slug,
      title: match ? match.title : humanizeSlug(slug),
      collection: "new-in",
    };
  }
  return null;
}

/**
 * Render-time override for a focused template: the first heading takes the
 * focus title and the first collection-sourced rail takes the focus rows.
 * Authored AST untouched (ids stable, bundle keys align); remaining rails
 * stay as discovery. bn copy falls back to English by resolveBiText.
 */
export function applyDemoFocus(
  sections: Section[],
  focus: DemoFocus | null,
): Section[] {
  if (!focus) return sections;
  let head = false;
  let rail = false;
  return sections.map((section) => {
    if (!head && section.type === "heading") {
      head = true;
      return {
        ...section,
        props: { ...section.props, text: focus.title, text_bn: "" },
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
          heading_bn: "",
        },
      };
    }
    return section;
  });
}
