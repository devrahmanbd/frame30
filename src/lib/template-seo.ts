/**
 * Phase 3 — the pure half of the builder→storefront SEO bridge.
 *
 * The builder stores a `PageSeo` per template (`builder_template_seo`); the SEO
 * desk stores a `SeoOverride` per *entity* (`seo_meta`). A rendered page can be
 * covered by both, so precedence has to be stated once, in one pure function,
 * and reused by the storefront head, the sitemap and the tests.
 *
 * Precedence rules, deliberate:
 *  - **Entity beats template.** A product's own meta title is more specific
 *    than "every product page", so `seo_meta` wins where it has a value.
 *  - **Empty is not a value.** A blank field falls through to the next layer
 *    rather than blanking the page.
 *  - **`noindex` is a veto, never a vote.** If *either* layer hides the page it
 *    stays hidden: the destructive direction must never be won by a default.
 *  - **Canonical must be absolute.** A relative or `javascript:` canonical is
 *    dropped, so the route's own self-canonical is used instead.
 *
 * No IO, no clock: `template-seo.server` and `builder-seo.contract.test` call
 * the identical code path.
 */
import { EMPTY_PAGE_SEO, safeUrl, type PageSeo } from "./builder-seo";
import type { TemplateKey } from "./builder-ast";

/** The override shape `theme-seo`'s head builders consume. */
export type SeoOverride = {
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonical?: string | null;
  robotsIndex?: boolean;
  robotsFollow?: boolean;
  ogImageUrl?: string | null;
  faq?: { q: string; a: string }[];
};

/** Which template renders a given storefront route. */
export const ROUTE_TEMPLATE: Record<string, TemplateKey> = {
  store: "index",
  product: "product",
  collection: "collection",
  page: "page",
  cart: "cart",
  checkout: "checkout",
};

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

/** A stored template record projected onto the head-builder override shape. */
export function templateSeoToOverride(seo: PageSeo | null | undefined): SeoOverride | null {
  if (!seo) return null;
  const canonical = safeUrl(text(seo.canonical));
  const override: SeoOverride = {};
  const title = text(seo.title);
  const description = text(seo.description);
  const image = safeUrl(text(seo.ogImage));
  if (title) override.metaTitle = title;
  if (description) override.metaDescription = description;
  if (canonical) override.canonical = canonical;
  if (image) override.ogImageUrl = image;
  // Only assert the robots flags when the merchant actually hid the page:
  // asserting `true` would out-rank an entity-level noindex.
  if (seo.noindex) {
    override.robotsIndex = false;
    override.robotsFollow = false;
  }
  return Object.keys(override).length ? override : null;
}

/**
 * Entity override over template override. Returns `null` when neither layer
 * says anything, so callers can keep their existing "no override" branch.
 */
export function mergeSeoOverride(
  entity: SeoOverride | null | undefined,
  template: SeoOverride | null | undefined,
): SeoOverride | null {
  if (!entity && !template) return null;
  const pick = (key: "metaTitle" | "metaDescription" | "canonical" | "ogImageUrl") => {
    const own = text(entity?.[key]);
    if (own) return own;
    const inherited = text(template?.[key]);
    return inherited || undefined;
  };

  const merged: SeoOverride = {};
  const metaTitle = pick("metaTitle");
  const metaDescription = pick("metaDescription");
  const canonical = pick("canonical");
  const ogImageUrl = pick("ogImageUrl");
  if (metaTitle) merged.metaTitle = metaTitle;
  if (metaDescription) merged.metaDescription = metaDescription;
  if (canonical) merged.canonical = safeUrl(canonical) || undefined;
  if (ogImageUrl) merged.ogImageUrl = safeUrl(ogImageUrl) || undefined;
  if (entity?.faq?.length) merged.faq = entity.faq;

  // Hiding wins from either side; showing requires both to agree.
  const hidden = entity?.robotsIndex === false || template?.robotsIndex === false;
  const nofollow = entity?.robotsFollow === false || template?.robotsFollow === false;
  if (hidden) merged.robotsIndex = false;
  else if (entity?.robotsIndex === true || template?.robotsIndex === true) merged.robotsIndex = true;
  if (nofollow) merged.robotsFollow = false;
  else if (entity?.robotsFollow === true || template?.robotsFollow === true) merged.robotsFollow = true;

  if (Object.keys(merged).length === 0) return null;
  if (merged.canonical === undefined) delete merged.canonical;
  if (merged.ogImageUrl === undefined) delete merged.ogImageUrl;
  return merged;
}

/**
 * Whether the URLs rendered by a template may appear in `sitemap.xml`.
 * A sitemap entry for a `noindex` page is a crawl-budget bug and a Search
 * Console warning, so the two decisions read the same record.
 */
export function templateIndexable(record: PageSeo | null | undefined): boolean {
  return !(record?.noindex === true);
}

/** A record for a template with nothing stored yet. */
export function emptyTemplateSeo(): PageSeo {
  return { ...EMPTY_PAGE_SEO };
}
