/**
 * Phase 3 — storefront side of the builder SEO bridge.
 *
 * The builder writes per-template SEO; this module is the only thing that reads
 * it on the render path, and it is written for the render path's constraints:
 *
 *  - **Fail soft, always.** A page must render even when this table is
 *    unreachable. Every failure returns the empty map, is counted and logged,
 *    and leaves the existing entity-level SEO in charge. Nothing here throws.
 *  - **Bounded.** A hard timeout keeps a slow read from holding SSR open, and
 *    the row count is capped at the size of the template catalogue.
 *  - **Cached per tenant, stale-while-revalidate.** One read serves every
 *    template of a store for the TTL; a stale entry is served instantly while
 *    it refreshes, so a cold cache costs one request, not one per page view.
 *  - **Tenant-keyed.** The cache key carries the merchant id, and the query
 *    filters by it, on top of the anon RLS policy that only exposes rows of
 *    active stores.
 *  - **Read with the publishable key.** Storefront rendering is anonymous; the
 *    service-role client is never used for it.
 */
import { publicClient } from "./pricing.server";
import { invalidate } from "./cache.server";
import { log } from "./observability.server";
import { renderRead } from "./render-read.server";
import { parsePageSeo, type PageSeo } from "./builder-seo";
import { TEMPLATE_KEYS, type TemplateKey } from "./builder-ast";
import {
  mergeSeoOverride,
  templateIndexable,
  templateSeoToOverride,
  type SeoOverride,
} from "./template-seo";

const keyFor = (merchantId: string) => `tpl-seo|${merchantId}`;

export type TemplateSeoMap = Partial<Record<TemplateKey, PageSeo>>;

const EMPTY_MAP: TemplateSeoMap = Object.freeze({});

type Row = {
  template: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  focus_keyword: string | null;
  noindex: boolean | null;
};

const SELECT =
  "template, title, description, canonical, og_title, og_description, og_image, focus_keyword, noindex, theme_id";

/**
 * Every template override a store has, keyed by template. Theme-scoped rows win
 * over the store-wide row for the same template, mirroring how the builder
 * resolves them, and an unknown template key is dropped instead of failing the
 * whole map (the catalogue can shrink under stored rows).
 */
export async function loadTemplateSeoMap(merchantId: string): Promise<TemplateSeoMap> {
  if (!merchantId) return EMPTY_MAP;
  return renderRead<TemplateSeoMap>({
    name: "template_seo.map",
    key: keyFor(merchantId),
    fallback: EMPTY_MAP,
    ttlSeconds: 120,
    staleSeconds: 600,
    timeoutMs: 1_500,
    context: { merchant_id: merchantId },
    load: async () => {
      const { data, error } = await publicClient()
        .from("builder_template_seo")
        .select(SELECT)
        .eq("merchant_id", merchantId)
        .limit(TEMPLATE_KEYS.length * 2);
      if (error) throw new Error(error.message);
      const known = new Set<string>(TEMPLATE_KEYS as readonly string[]);
      const map: TemplateSeoMap = {};
      const themed = new Set<string>();
      for (const row of (data ?? []) as (Row & { theme_id: string | null })[]) {
        const template = String(row.template ?? "");
        if (!known.has(template)) {
          log("warn", "storefront.template_seo.unknown_template", { merchant_id: merchantId, template });
          continue;
        }
        if (themed.has(template) && !row.theme_id) continue;
        if (row.theme_id) themed.add(template);
        map[template as TemplateKey] = parsePageSeo({
          title: row.title,
          description: row.description,
          canonical: row.canonical,
          ogTitle: row.og_title,
          ogDescription: row.og_description,
          ogImage: row.og_image,
          focusKeyword: row.focus_keyword,
          noindex: row.noindex === true,
        });
      }
      return map;
    },
  });
}

/** One template's stored record, or `null` when the merchant never set one. */
export async function templateSeoRecord(
  merchantId: string,
  template: TemplateKey,
): Promise<PageSeo | null> {
  const map = await loadTemplateSeoMap(merchantId);
  return map[template] ?? null;
}

/**
 * The head override for a rendered page: entity-level SEO first, the template
 * record behind it. Callers pass whatever `resolveSeo` returned and use the
 * result in its place.
 */
export async function resolveSeoWithTemplate(
  merchantId: string,
  template: TemplateKey,
  entity: SeoOverride | null | undefined,
): Promise<SeoOverride | null> {
  const record = await templateSeoRecord(merchantId, template);
  return mergeSeoOverride(entity ?? null, templateSeoToOverride(record));
}

/**
 * Templates the merchant hid from search. The sitemap builders subtract these
 * so a URL is never advertised and de-indexed at the same time.
 */
export async function hiddenTemplates(merchantId: string): Promise<Set<TemplateKey>> {
  const map = await loadTemplateSeoMap(merchantId);
  const hidden = new Set<TemplateKey>();
  for (const [template, record] of Object.entries(map)) {
    if (!templateIndexable(record)) hidden.add(template as TemplateKey);
  }
  return hidden;
}

/** Called by the builder write path so an edit is visible without a TTL wait. */
export function invalidateTemplateSeo(merchantId: string) {
  invalidate(keyFor(merchantId));
  invalidate(`sf-sitemap|`);
}
