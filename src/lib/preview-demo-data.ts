/**
 * Demo rows for theme preview (client-safe, pure).
 *
 * The preview frame has no merchant data, so data widgets would skeleton-spin
 * forever. This maps the theme's demo catalog into WidgetRows for every
 * collected request: priced BDT products with placeholder imagery and
 * store-shaped hrefs.
 */
import { demoCatalogFor } from "./demo-catalog";
import { themeDemoCatalogKey } from "./theme-preview-nav";
import { placeholderSeed } from "./placeholder";
import type { WidgetDataBundle, WidgetDataMap, WidgetRow } from "./widget-data";

/**
 * Demo rows for the account template (shopper-scoped in production).
 *
 * Row contract mirrors `src/components/builder/account.tsx`: orders carry the
 * order number in `title`, the raw status in `subtitle`, the server-priced
 * total in `priceMinor` and the ISO creation time in `date`; the profile row
 * carries name / email / phone in `title` / `subtitle` / `body`.
 */
const DEMO_ORDERS: WidgetRow[] = [
  {
    id: "demo-ord-1",
    title: "ORD-1001",
    subtitle: "delivered",
    priceMinor: 129900,
    currency: "BDT",
    date: "2026-09-10T10:00:00.000Z",
  },
  {
    id: "demo-ord-2",
    title: "ORD-1002",
    subtitle: "shipped",
    priceMinor: 54900,
    currency: "BDT",
    date: "2026-09-18T10:00:00.000Z",
  },
];

const DEMO_PROFILE: WidgetRow = {
  id: "demo-profile",
  title: "Demo Shopper",
  subtitle: "demo@example.com",
  body: "01700000000",
};

export function previewDemoMap(
  bundle: WidgetDataBundle,
  themeKey: string,
): WidgetDataMap {
  const catalog = demoCatalogFor(themeDemoCatalogKey(themeKey));
  const base: WidgetRow[] = catalog.products.map((p, i) => ({
    id: p.slug,
    title: p.title,
    href: `/p/${p.slug}`,
    subtitle: p.category,
    imageUrl:
      p.image_url ||
      `/api/public/ph/${placeholderSeed(p.category)}/${p.slug}.svg`,
    priceMinor: p.variants[0]?.price ?? 0,
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
    // Account-template sources (integration adds these to the
    // `WidgetDataSource` union): the preview frame has no shopper session,
    // so the server would resolve zero rows — demo rows keep the widgets
    // visible instead of parked on their sign-in prompt.
    // `as string` until the union grows `orders` / `profile`.
    if (req.source === "orders") {
      const rawLimit = (req.params as Record<string, unknown>)["limit"];
      const limit =
        typeof rawLimit === "number" && rawLimit > 0
          ? Math.min(rawLimit, DEMO_ORDERS.length)
          : DEMO_ORDERS.length;
      map[req.key] = DEMO_ORDERS.slice(0, limit);
      continue;
    }
    if (req.source === "profile") {
      map[req.key] = [DEMO_PROFILE];
      continue;
    }
    let rows = base;
    if (req.source === "collection") {
      const colParam = (req.params as Record<string, unknown>)["collection"];
      if (typeof colParam === "string" && colParam.trim()) {
        const slug = colParam.trim().toLowerCase();
        const filtered = base.filter((p) => {
          const prod = catalog.products.find((item) => item.slug === p.id);
          return prod?.collections?.includes(slug) || prod?.category === slug;
        });
        if (filtered.length > 0) {
          rows = filtered;
        }
      }
    }
    const rawLimit = (req.params as Record<string, unknown>)["limit"];
    const limit =
      typeof rawLimit === "number" && rawLimit > 0
        ? Math.min(rawLimit, rows.length)
        : Math.min(8, rows.length);
    map[req.key] = rows.slice(0, limit);
  }
  return map;
}
