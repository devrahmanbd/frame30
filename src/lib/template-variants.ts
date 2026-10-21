/**
 * The CLOSED template-variant vocabulary.
 *
 * **Why a closed table at all.** The platform's variant machinery is
 * OPEN-ENDED by shape: `isVariantTemplateKey` (`src/lib/builder-ast.ts`)
 * accepts any `<known base>_<lowercase suffix>`, and `parseTemplates`
 * persists it. That is deliberate — the old theme-package per-page shape
 * (`page_<slug>`) is a legal persisted key, and dropping it would silently
 * discard a third-party package's layouts. But an open vocabulary has no
 * answer to "is this a template the platform routes to?", so a merchant's
 * typo (`blog_artcile`) would persist a template nothing ever renders, and
 * nothing would say so.
 *
 * So the vocabulary is closed **for authoring and for resolution**, and this
 * module is where it lives:
 *
 *  - `TEMPLATE_VARIANTS` — the table. Base key → the suffixes that base
 *    may carry. It is the ONLY place a variant may be added.
 *  - `variantKeysFor(base)` — the variant keys a base owns.
 *  - `baseTemplateKey(key)` — the inverse of `isVariantTemplateKey`: the
 *    base a key belongs to, or null.
 *  - `isKnownTemplateKey(key)` — a base key **or** a validated variant.
 *  - `resolveVariantAst(templates, base, suffix)` — the resolution the
 *    storefront routes use: the variant first, then the base, and NOTHING
 *    else. `resolveTemplate`'s `page`/`index` tail is never accepted — a
 *    route that finds no composition renders its own platform surface, never
 *    the homepage.
 *
 * Pure data and pure functions: no React, no DOM, no DB, no network.
 */
import {
  isTemplateKey,
  resolveTemplate,
  type TemplateKey,
  type TemplateMap,
  type TemplateMatch,
  type ThemeAst,
  type ThemeTemplates,
} from "./builder-ast";

/**
 * The closed table — the base key and the variants it may carry.
 *
 * - `blog`: the reader surfaces. `listing` is the blog index, `article` is
 *   the article detail. They are DIFFERENT compositions: the article's
 *   title, excerpt, cover and body are route context, so the detail's body
 *   is the theme's frame around them, not the listing's grid.
 * - `archive`: the content archives — a category, a tag, an author. The
 *   three content-archive routes that exist today (`/blog/category/$slug`,
 *   `/blog/tag/$slug`, `/blog/author/$slug`) carry no store subject, so
 *   these three are the archive key's supported KINDS (Decision D1′), not
 *   three storefront routes.
 */
export const TEMPLATE_VARIANTS = {
  blog: ["listing", "article"],
  archive: ["category", "tag", "author"],
} as const;

/** The base keys that own at least one variant. */
export type TemplateVariantBase = keyof typeof TEMPLATE_VARIANTS;

/** Every legal suffix, across every base. */
export type TemplateVariantSuffix =
  (typeof TEMPLATE_VARIANTS)[TemplateVariantBase][number];

/**
 * The variant keys of ONE base — derived from the table, so the two can
 * never disagree.
 */
type VariantKeyFor<B extends TemplateVariantBase> =
  `${B}_${(typeof TEMPLATE_VARIANTS)[B][number]}`;

/** A closed variant key — `blog_listing`, `blog_article`, … */
export type TemplateVariantKey =
  VariantKeyFor<"blog"> | VariantKeyFor<"archive">;

/**
 * Every variant key, DERIVED from the table so the two can never disagree.
 */
export const TEMPLATE_VARIANT_KEYS: readonly TemplateVariantKey[] = (
  Object.entries(TEMPLATE_VARIANTS) as [
    TemplateVariantBase,
    readonly TemplateVariantSuffix[],
  ][]
).flatMap(([base, suffixes]) =>
  suffixes.map((suffix) => `${base}_${suffix}` as TemplateVariantKey),
);

/**
 * The editor's labels for the variants. Bilingual, like every other label
 * map in the editor (`TEMPLATE_META`, `TEMPLATE_LABEL`).
 */
export const TEMPLATE_VARIANT_LABEL: Record<
  TemplateVariantKey,
  { en: string; bn: string; desc: { en: string; bn: string } }
> = {
  blog_listing: {
    en: "Blog listing",
    bn: "ব্লগ তালিকা",
    desc: {
      en: "The blog index — the terms rail, the article grid and the pager",
      bn: "ব্লগ ইনডেক্স — টপিক রেল, লেখার গ্রিড ও পেজার",
    },
  },
  blog_article: {
    en: "Blog article",
    bn: "ব্লগ লেখা",
    desc: {
      en: "One article — the frame around the story, the related reading and the newsletter",
      bn: "একটি লেখা — গল্পের আশপাশ, সম্পর্কিত লেখা ও নিউজলেটার",
    },
  },
  archive_category: {
    en: "Archive category",
    bn: "আর্কাইভ ক্যাটাগরি",
    desc: {
      en: "The articles of one category",
      bn: "একটি ক্যাটাগরির লেখাগুলো",
    },
  },
  archive_tag: {
    en: "Archive tag",
    bn: "আর্কাইভ ট্যাগ",
    desc: {
      en: "The articles of one tag",
      bn: "একটি ট্যাগের লেখাগুলো",
    },
  },
  archive_author: {
    en: "Archive author",
    bn: "আর্কাইভ লেখক",
    desc: {
      en: "The articles of one author",
      bn: "একজন লেখকের লেখাগুলো",
    },
  },
};

/** True when the value is a base key that owns at least one variant. */
export function isTemplateVariantBase(
  value: unknown,
): value is TemplateVariantBase {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TEMPLATE_VARIANTS, value)
  );
}

/**
 * The legal suffixes of one base — empty for a base that owns none.
 */
export function variantSuffixesFor(
  base: TemplateKey | string,
): readonly TemplateVariantSuffix[] {
  if (!isTemplateVariantBase(base)) return [];
  return TEMPLATE_VARIANTS[base];
}

/**
 * The variant keys one base owns — `[]` for a base that owns none.
 */
export function variantKeysFor(
  base: TemplateKey | string,
): readonly TemplateVariantKey[] {
  return variantSuffixesFor(base).map(
    (suffix) => `${base}_${suffix}` as TemplateVariantKey,
  );
}

/**
 * The variant key for a (base, suffix) pair, or null when the pair is not
 * in the closed table. THIS is the gate: nothing outside the table can be
 * addressed by a merchant or by a route.
 */
export function variantKeyFor(
  base: TemplateKey | string,
  suffix: string,
): TemplateVariantKey | null {
  if (!isTemplateVariantBase(base)) return null;
  const suffixes = TEMPLATE_VARIANTS[base] as readonly string[];
  if (!suffixes.includes(suffix)) return null;
  return `${base}_${suffix}` as TemplateVariantKey;
}

/**
 * The editor switcher's SECOND level: every base that owns variants, with
 * the variants it owns.
 *
 * The grouping is derived from the closed table, so the switcher can only
 * ever offer a suffix the platform routes to.
 */
export function templateVariantEntries(): {
  base: TemplateKey;
  variants: readonly TemplateVariantKey[];
}[] {
  const out: { base: TemplateKey; variants: readonly TemplateVariantKey[] }[] =
    [];
  for (const base of Object.keys(TEMPLATE_VARIANTS) as TemplateVariantBase[]) {
    const variants = variantKeysFor(base);
    if (!variants.length) continue;
    out.push({ base, variants });
  }
  return out;
}

/**
 * True when the value is a variant key INSIDE the closed table.
 *
 * `blog_listing` is true; `blog_anything` is false — even though
 * `isVariantTemplateKey` (the open-ended shape predicate) accepts it.
 */
export function isTemplateVariantKey(
  value: unknown,
): value is TemplateVariantKey {
  if (typeof value !== "string") return false;
  const sep = value.indexOf("_");
  if (sep < 1) return false;
  const base = value.slice(0, sep);
  const suffix = value.slice(sep + 1);
  if (!isTemplateVariantBase(base)) return false;
  return (TEMPLATE_VARIANTS[base] as readonly string[]).includes(suffix);
}

/**
 * The base a key belongs to — the inverse of `isVariantTemplateKey`.
 *
 * A base key is its own base; a validated variant resolves to its base;
 * anything else is null.
 */
export function baseTemplateKey(value: unknown): TemplateKey | null {
  if (typeof value !== "string") return null;
  if (isTemplateKey(value)) return value;
  if (!isTemplateVariantKey(value)) return null;
  const sep = value.indexOf("_");
  const base = value.slice(0, sep);
  return isTemplateKey(base) ? base : null;
}

/**
 * True when the platform KNOWS the key: a base key, or a variant inside the
 * closed table. This is the validator a route and the editor both use.
 */
export function isKnownTemplateKey(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (isTemplateKey(value)) return true;
  return isTemplateVariantKey(value);
}

/**
 * Resolve a surface's composition: the variant first, then the base.
 *
 * **Only a `"suffix"` or a `"base"` match is a composition.** A `"page"`,
 * `"index"` or `"empty"` match means the theme authored NOTHING for this
 * surface, and the caller renders its own platform surface — never the
 * homepage (the `→ index` tail of `resolveTemplate` is exactly the
 * behaviour this programme forbids on a storefront route).
 */
export function resolveVariantAst(
  templates: ThemeTemplates | TemplateMap | null | undefined,
  base: TemplateKey,
  suffix: string,
): { key: string; ast: ThemeAst; match: TemplateMatch } | null {
  if (!templates) return null;
  // The suffix must be in the closed table — an open-ended suffix is not a
  // surface the platform routes to.
  if (!variantKeyFor(base, suffix)) return null;
  const resolved = resolveTemplate(templates as ThemeTemplates, base, {
    suffix,
  });
  if (resolved.match !== "suffix" && resolved.match !== "base") return null;
  return resolved;
}
