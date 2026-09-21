/**
 * Demo rows for theme preview (client-safe, pure).
 *
 * The preview frame has no merchant data, so data widgets would skeleton-spin
 * forever. This maps the theme's demo catalog into WidgetRows for every
 * collected request: priced BDT products with placeholder imagery and
 * store-shaped hrefs.
 */
import { demoCatalogFor } from "./demo-catalog";
import { placeholderSeed } from "./placeholder";
import type { WidgetDataBundle, WidgetDataMap, WidgetRow } from "./widget-data";

export function previewDemoMap(
  bundle: WidgetDataBundle,
  themeKey: string,
): WidgetDataMap {
  const catalog = demoCatalogFor(themeKey);
  const base: WidgetRow[] = catalog.products.map((p, i) => ({
    id: p.slug,
    title: p.title,
    href: `/p/${p.slug}`,
    subtitle: p.category,
    imageUrl:
      p.image_url ||
      `/api/public/ph/${placeholderSeed(p.category)}/${p.slug}.svg`,
    priceMinor: p.price ?? p.variants[0]?.price ?? 0,
    compareAtMinor:
      p.variants[0] &&
      typeof (p.variants[0] as { compare_at?: unknown }).compare_at === "number"
        ? ((p.variants[0] as { compare_at: number }).compare_at as number)
        : undefined,
    currency: "BDT",
    inStock: true,
    rating: 5,
    reviewCount: 40 + ((i * 37) % 120),
  }));
  const map: WidgetDataMap = {};
  // Taxonomy-sourced widgets (menus, department strips) get collections,
  // not products — otherwise a menubar renders product names.
  const taxRows: WidgetRow[] = catalog.collections.map((c) => ({
    id: `demo-${c.slug}`,
    title: c.name,
    href: `/c/${c.slug}`,
    subtitle: c.description,
    priceMinor: 0,
    currency: "BDT",
    inStock: true,
  }));
  for (const req of bundle.requests) {
    if (req.source === "taxonomy") {
      const rawLimit = (req.params as Record<string, unknown>)["limit"];
      const limit =
        typeof rawLimit === "number" && rawLimit > 0
          ? Math.min(rawLimit, taxRows.length)
          : Math.min(8, taxRows.length);
      map[req.key] = taxRows.slice(0, limit);
      continue;
    }
    const rawLimit = (req.params as Record<string, unknown>)["limit"];
    const limit =
      typeof rawLimit === "number" && rawLimit > 0
        ? Math.min(rawLimit, base.length)
        : Math.min(8, base.length);
    map[req.key] = base.slice(0, limit);
  }
  return map;
}
