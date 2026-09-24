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
  if (path === "/products" || path.startsWith("/products/"))
    return "product";
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
