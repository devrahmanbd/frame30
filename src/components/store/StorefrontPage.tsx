import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreFooterMenus } from "@/components/store/StoreFooterMenus";
import { StoreImage } from "@/components/store/StoreImage";
import { isCustomHostPath } from "@/lib/storefront-url";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import {
  CustomCodeBody,
  CustomCodeSurface,
} from "@/components/store/CustomCode";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import type { getStorefront } from "@/lib/storefront.functions";

/** Resolved non-null payload of `getStorefront` — the single shape every
 * storefront home surface renders, whether reached via `/store/<slug>` or via
 * a merchant's active primary custom domain at `/`. */
export type StorefrontPayload = Exclude<
  Awaited<ReturnType<typeof getStorefront>>,
  null
>;

/**
 * Merchant storefront home. Rendered by the `/store/$slug` route and by `/`
 * when the request host resolves to an active custom domain. Deep links stay
 * `/store/<slug>/…` path URLs, which keep serving on both platform and custom
 * hosts (only the index path-URL redirects to the primary domain).
 */
export function StorefrontPage({ data }: { data: StorefrontPayload }) {
  const { t } = useLang();
  const {
    merchant,
    settings,
    products,
    categories,
    collections,
    ast,
    tokens,
    widgetBundle,
    widgetData,
    customCode,
    siteKit,
    preview,
    menus,
    themeKey,
  } = data;

  const slug = merchant.slug;
  const { location } = useRouterState();
  const custom = isCustomHostPath(location.pathname);
  const [term, setTerm] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const q = term.trim().toLowerCase();
  const collectionMembers = collectionId
    ? new Set(
        (
          collections.find((c) => c.id === collectionId)?.collection_products ??
          []
        ).map((cp) => cp.product_id),
      )
    : null;

  const visible = products.filter((p) => {
    if (q && !`${p.title} ${p.description ?? ""}`.toLowerCase().includes(q))
      return false;
    if (categoryId && p.category_id !== categoryId) return false;
    if (collectionMembers && !collectionMembers.has(p.id)) return false;
    return true;
  });

  const catalog = (
    <>
      <section className="mt-8 space-y-3">
        <div>
          <label
            htmlFor="store-search"
            className="block text-xs font-medium text-muted-foreground"
          >
            {t("Search products", "পণ্য খুঁজুন")}
          </label>
          <input
            id="store-search"
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={t("e.g. saree", "যেমন: শাড়ি")}
            className="mt-1 min-h-11 w-full max-w-md rounded-fq-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>

        {collections.length > 0 && (
          <div
            role="group"
            aria-label="Filter by collection"
            className="flex flex-wrap gap-2"
          >
            <FilterChip
              active={!collectionId}
              onClick={() => setCollectionId(null)}
              label={t("All collections", "সব কালেকশন")}
            />
            {collections.map((c) => (
              <FilterChip
                key={c.id}
                active={collectionId === c.id}
                onClick={() =>
                  setCollectionId(collectionId === c.id ? null : c.id)
                }
                label={c.name}
              />
            ))}
          </div>
        )}

        {categories.length > 0 && (
          <div
            role="group"
            aria-label="Filter by category"
            className="flex flex-wrap gap-2"
          >
            <FilterChip
              active={!categoryId}
              onClick={() => setCategoryId(null)}
              label={t("All categories", "সব ক্যাটাগরি")}
            />
            {categories.map((c) => (
              <FilterChip
                key={c.id}
                active={categoryId === c.id}
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                label={c.name}
              />
            ))}
          </div>
        )}
      </section>

      <h2 className="font-bangla-display mt-10 text-xl font-semibold">
        {t("All products", "সব পণ্য")}{" "}
        <span className="money text-sm font-normal text-muted-foreground">
          ({visible.length})
        </span>
      </h2>
      {visible.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          {t("No products match this view.", "কোনো পণ্য পাওয়া যায়নি।")}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => {
            const variants = p.product_variants ?? [];
            const min = variants.length
              ? Math.min(
                  ...variants.map((v) => Number(v.price_amount_minor_int)),
                )
              : 0;
            const inStock = variants.some((v) => v.stock_quantity > 0);
            const cardBody = (
              <>
                <div className="aspect-square bg-muted">
                  <StoreImage
                    image={p.image ?? null}
                    fallbackSrc={p.image_url}
                    alt={p.title}
                    seed={p.id}
                    sizes="(max-width: 768px) 50vw, 300px"
                    className="size-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <h3 className="line-clamp-2 text-sm font-medium">
                    {p.title}
                  </h3>
                  <p className="money mt-1 text-sm font-semibold">
                    {fmtMinor(min, merchant.currency_code)}
                  </p>
                  <p
                    className={`mt-1 text-xs ${inStock ? "text-success-foreground" : "text-danger-foreground"}`}
                  >
                    {inStock
                      ? t("In stock", "স্টকে আছে")
                      : t("Out of stock", "স্টক নেই")}
                  </p>
                </div>
              </>
            );
            const cardClass =
              "group block overflow-hidden rounded-fq-lg border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5";
            return (
              <li key={p.id}>
                {custom ? (
                  <Link
                    to="/p/$productSlug"
                    params={{ productSlug: p.slug }}
                    className={cardClass}
                  >
                    {cardBody}
                  </Link>
                ) : (
                  <Link
                    to="/store/$slug/p/$productSlug"
                    params={{ slug, productSlug: p.slug }}
                    className={cardClass}
                  >
                    {cardBody}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );

  const collectionSlot = (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {collections.map((c) => (
        <li key={c.id}>
          {custom ? (
            <Link
              to="/c/$collectionSlug"
              params={{ collectionSlug: c.slug }}
              className="block w-full rounded-fq-md border border-border bg-card px-4 py-3 text-left text-sm hover:bg-muted"
            >
              {c.name}
            </Link>
          ) : (
            <Link
              to="/store/$slug/c/$collectionSlug"
              params={{ slug, collectionSlug: c.slug }}
              className="block w-full rounded-fq-md border border-border bg-card px-4 py-3 text-left text-sm hover:bg-muted"
            >
              {c.name}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );

  const defaultHero = (
    <section className="rounded-fq-lg border border-border bg-info-soft p-8">
      <h1 className="font-bangla-display text-3xl font-bold sm:text-4xl">
        {merchant.name}
      </h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        {settings?.tagline ??
          t(
            "Fast delivery across Bangladesh — cash on delivery and mobile payments.",
            "বাংলাদেশজুড়ে দ্রুত ডেলিভারি — ক্যাশ অন ডেলিভারি ও মোবাইল পেমেন্ট।",
          )}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs">
        {(settings?.cod_enabled ?? true) && (
          <li className="rounded-full bg-warning-soft px-3 py-1 text-warning-foreground">
            {t("Cash on delivery", "ক্যাশ অন ডেলিভারি")}
          </li>
        )}
        {(settings?.mfs_enabled ?? true) && (
          <li className="rounded-full bg-success-soft px-3 py-1 text-success-foreground">
            bKash / Nagad
          </li>
        )}
        <li className="rounded-full bg-card px-3 py-1 text-muted-foreground">
          VAT included at checkout
        </li>
      </ul>
    </section>
  );

  // The published `index` template owns the page: header, main and footer
  // slots all come from the active theme, and this component only supplies the
  // live catalogue and collection data the theme's widgets ask for.
  return (
    <WidgetDataProvider bundle={widgetBundle} map={widgetData}>
      {preview && (
        <p
          role="status"
          className="bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
        >
          {t(
            "Previewing an unpublished draft — shoppers see the live theme.",
            "অপ্রকাশিত খসড়ার প্রিভিউ — ক্রেতারা লাইভ থিম দেখছেন।",
          )}
        </p>
      )}
      <CustomCodeSurface code={customCode} />
      <ThemeChrome
        template="index"
        ast={ast}
        tokens={tokens}
        storeSlug={slug}
        themeKey={themeKey ?? null}
        merchantId={merchant.id}
        siteKit={siteKit}
        chrome={
          <>
            <CustomCodeBody code={customCode} slot="start" />
            <StoreHeader
              slug={slug}
              name={merchant.name}
              tagline={settings?.tagline}
              storeTimezone={tokens?.timezone}
              allowCustomerTimezone={tokens?.allowCustomerTimezone}
              menus={menus}
              themeKey={themeKey ?? null}
            />
            {/* Storefront AI support disabled as of now — active on /dashboard and platform front pages */}
            {/* <SupportWidget slug={slug} /> */}
          </>
        }
        productSlot={catalog}
        collectionSlot={collectionSlot}
        fallback={
          <>
            {defaultHero}
            {catalog}
          </>
        }
      />
      {/* Phase 16 T4: dashboard-designed footer menu. Renders only when a
          footer location is claimed; otherwise the theme's static footer
          widgets stand alone as the fallback. */}
      {menus && <StoreFooterMenus slug={slug} nodes={menus.footer} />}
      <CustomCodeBody code={customCode} slot="end" />
    </WidgetDataProvider>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-9 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active
          ? "border-bd-teal-700 bg-bd-teal-700 text-background"
          : "border-border bg-card text-muted-foreground hover:bg-muted"
      }`}
    >
      {active ? "✓ " : ""}
      {label}
    </button>
  );
}
