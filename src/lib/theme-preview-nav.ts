/**
 * In-preview navigation (Envato-style demo browsing).
 *
 * Links inside a theme preview point at live storefront permalinks
 * (`/c/<slug>`, `/p/<slug>`, …) which 404 on platform hosts — there is no
 * merchant there. Instead of escaping the frame, the preview maps demo
 * links onto its own template tabs so every tap shows authored demo
 * content. Unmapped links (external, tel:, mailto:, anchors) return null
 * and keep default browser behavior.
 */
import type {
  Section,
  TemplateKey,
  ThemeAst,
  ThemeTokens,
} from "./builder-ast";
import { EMPTY_AST, TEMPLATE_KEYS } from "./builder-ast";
import { SONGOSKRITI_TOKENS } from "./themes/songoskriti/tokens";
import { buildHeaderMain } from "./themes/songoskriti/header";
import { buildFooterMain } from "./themes/songoskriti/footer";
import { buildHomepageMain } from "./themes/songoskriti/homepage";
import type { SectionBuilder } from "./themes/songoskriti/types";

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
 * Task 5 — restored preview route key resolution.
 *
 * The pre-purge route resolved `BLUEPRINT_PRESETS` from
 * `src/lib/theme-blueprints.ts` (removed in 1434a6b with the theme packs).
 * The restored route resolves keys here instead: `songoskriti` builds its
 * authored AST from the Task 1 builders + locked tokens; every other key
 * returns null so the route renders its 404 state.
 */
export type ThemePreviewPreset = {
  key: string;
  themeName: string;
  author: string;
  tokens: ThemeTokens;
  templates: Record<TemplateKey, ThemeAst>;
};

export function resolveThemePreview(key: string): ThemePreviewPreset | null {
  if (key !== "songoskriti") return null;
  let n = 0;
  const s: SectionBuilder = (type, props = {}) => {
    const section: Section = {
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    };
    return section;
  };
  const index: ThemeAst = {
    header: buildHeaderMain(s),
    main: buildHomepageMain(s),
    footer: buildFooterMain(s),
  };
  const templates = {} as Record<TemplateKey, ThemeAst>;
  for (const templateKey of TEMPLATE_KEYS) {
    templates[templateKey] = templateKey === "index" ? index : EMPTY_AST;
  }
  return {
    key: "songoskriti",
    themeName: "Songoskriti",
    author: "Framique",
    tokens: SONGOSKRITI_TOKENS,
    templates,
  };
}
