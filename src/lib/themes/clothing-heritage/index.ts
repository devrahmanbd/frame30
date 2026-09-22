/**
 * clothing-heritage nuclear rebuild — assembler.
 *
 * Builders live beside this file (tokens/header/footer/homepage/secondary);
 * this module binds the section factory and composes the preset. The old
 * inline `clothingHeritage()` in `theme-blueprints.ts` re-exports from here.
 */
import { DEFAULT_TOKENS } from "../../builder-ast";
import type {
  Section,
  TemplateKey,
  ThemeAst,
  ThemeTokens,
} from "../../builder-ast";
import type { ThemePreset } from "../../theme-presets";
import { BLUEPRINT_BN } from "../../theme-blueprints.bn";
import { sectionFactory } from "../../theme-section";
import { HERITAGE_TOKEN_PARTIAL } from "./tokens";
import { buildHeader } from "./header";
import { buildFooter } from "./footer";
import { buildHomepageMain } from "./homepage";
import { buildSecondaryTemplates } from "./secondary";
import type { SectionBuilder } from "./types";

const KEY = "clothing-heritage";

/**
 * Search reuses the collection listing with a query H1 (same precedent as the
 * other blueprints): ids are re-scoped so they stay globally unique.
 */
function withSearch(
  key: string,
  templates: Omit<Record<TemplateKey, ThemeAst>, "search">,
): Record<TemplateKey, ThemeAst> {
  const make = sectionFactory(BLUEPRINT_BN);
  const base = templates.collection;
  const reid = (sections: Section[]): Section[] =>
    sections.map((section) => ({ ...section, id: `${section.id}-search` }));
  return {
    ...templates,
    search: {
      header: reid(base.header),
      main: [
        make(key, "heading", {
          text: "Search results",
          level: "h1",
          align: "left",
        }),
        ...reid(base.main.filter((section) => section.type !== "heading")),
      ],
      footer: reid(base.footer),
    },
  };
}

export function clothingHeritage(): ThemePreset {
  const make = sectionFactory(BLUEPRINT_BN);
  const s: SectionBuilder = (type, props, extras) =>
    make(KEY, type, props, extras ?? {});
  const header = () => buildHeader(s);
  const footer = () => buildFooter(s);
  const tokens: ThemeTokens = {
    ...DEFAULT_TOKENS,
    ...HERITAGE_TOKEN_PARTIAL,
  };
  const secondary = buildSecondaryTemplates(s, header, footer);
  return {
    key: KEY,
    nameEn: "Clothing Heritage",
    nameBn: "ক্লোদিং হেরিটেজ",
    summaryEn:
      "Aarong-grade heritage clothing storefront with mega menus, artisan stories, lookbooks and fit guides.",
    summaryBn:
      "মেগা মেনু, তাঁতির গল্প, লুকবুক ও ফিট গাইডসহ আড়ং-মানের ঐতিহ্যবাহী পোশাক স্টোরফ্রন্ট।",
    category: "fashion",
    version: "2.0.0",
    api: "^3.0.0",
    sortOrder: 65,
    tokens,
    templates: withSearch(KEY, {
      index: { header: header(), main: buildHomepageMain(s), footer: footer() },
      collection: secondary.collection,
      product: secondary.product,
      page: secondary.page,
      blog: secondary.blog,
      cart: secondary.cart,
      checkout: secondary.checkout,
    }),
  };
}
