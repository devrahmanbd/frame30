import { useState } from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { WidgetDataProvider } from "@/components/builder/WidgetDataContext";
import { ThemeChrome } from "@/components/store/ThemeChrome";

import { buildStoreHead } from "@/lib/theme-seo";
import { fontHeadLinks } from "@/lib/theme-fonts";
import { astJsonLd } from "@/lib/structured-data";
import { flattenAst } from "@/lib/builder-ast";

import { SupportWidget } from "@/components/store/SupportWidget";
import { CustomCodeBody, CustomCodeSurface } from "@/components/store/CustomCode";
import { verificationTags } from "@/lib/search-console";
import { getStorefront } from "@/lib/storefront.functions";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/store/$slug/")({
  loader: async ({ params }) => {
    const data = await getStorefront({ data: { slug: params.slug } });
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) {
      return { meta: [{ title: "Store unavailable" }, { name: "robots", content: "noindex" }] };
    }
    // Phase 4: merchant head snippet (verification metas, canonical/alternate
    // links, JSON-LD) is appended after the platform's own tags so it can
    // supplement but never silently replace them.
    const custom = loaderData.customCode?.headTags ?? [];
    const base = buildStoreHead({
      origin: loaderData.origin,
      path: `/store/${params.slug}`,
      storeName: loaderData.merchant.name,
      themeKey: loaderData.themeKey,
      tagline: loaderData.settings?.tagline ?? null,
      seo: loaderData.seo,
      products: loaderData.products.map((p) => ({
        title: p.title,
        slug: p.slug,
        image_url: p.image_url,
      })),
    });
    return {
      ...base,
      meta: [
        ...(base.meta ?? []),
        // Phase 5: search-engine ownership tags, server-rendered so a crawler
        // sees them on the very first fetch.
        ...verificationTags(loaderData.siteKit.verification),
        ...custom.filter((t) => t.tag === "meta").map((t) => t.attrs),
      ],
      // Phase 3: typography links are derived from this store's own pairing,
      // so a theme never pays for a family it does not use.
      links: [
        ...(base.links ?? []),
        ...fontHeadLinks(loaderData.tokens ?? { fontDisplay: "Noto Sans Bengali", fontBody: "Inter" }),
        ...custom.filter((t) => t.tag === "link").map((t) => t.attrs),
      ],
      scripts: [
        ...(base.scripts ?? []),
        // Phase 7.2: schema emitted by the widgets that are actually on the
        // page (FAQ, how-to, store locator, video), derived from the AST.
        ...astJsonLd(
          loaderData.ast,
          {
            storeName: loaderData.merchant.name,
            url: loaderData.origin ? `${loaderData.origin}/store/${params.slug}` : null,
          },
          flattenAst,
        ).map((node) => ({
          type: "application/ld+json",
          children: JSON.stringify(node).replace(/</g, "\\u003c"),
        })),
        ...custom
          .filter((t): t is Extract<typeof t, { tag: "script" }> => t.tag === "script")
          .map((t) => ({ ...t.attrs, children: t.children })),
      ],
    };
  },
  component: StorefrontHome,
  notFoundComponent: StoreMissing,
});

function StoreMissing() {
  const { t } = useLang();
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">{t("Store not found", "দোকান পাওয়া যায়নি")}</h1>
      <p className="mt-2 text-muted-foreground">{t("This storefront is not published.", "এই দোকানটি প্রকাশিত হয়নি।")}</p>
    </main>
  );
}

function StorefrontHome() {
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
  } = Route.useLoaderData();


  const slug = merchant.slug;
  const [term, setTerm] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);

  const q = term.trim().toLowerCase();
  const collectionMembers = collectionId
    ? new Set(
        (collections.find((c) => c.id === collectionId)?.collection_products ?? []).map(
          (cp) => cp.product_id,
        ),
      )
    : null;

  const visible = products.filter((p) => {
    if (q && !`${p.title} ${p.description ?? ""}`.toLowerCase().includes(q)) return false;
    if (categoryId && p.category_id !== categoryId) return false;
    if (collectionMembers && !collectionMembers.has(p.id)) return false;
    return true;
  });

  const catalog = (
    <>
      <section className="mt-8 space-y-3">
        <div>
          <label htmlFor="store-search" className="block text-xs font-medium text-muted-foreground">
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
          <div role="group" aria-label="Filter by collection" className="flex flex-wrap gap-2">
            <FilterChip active={!collectionId} onClick={() => setCollectionId(null)} label={t("All collections", "সব কালেকশন")} />
            {collections.map((c) => (
              <FilterChip
                key={c.id}
                active={collectionId === c.id}
                onClick={() => setCollectionId(collectionId === c.id ? null : c.id)}
                label={c.name}
              />
            ))}
          </div>
        )}

        {categories.length > 0 && (
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
            <FilterChip active={!categoryId} onClick={() => setCategoryId(null)} label={t("All categories", "সব ক্যাটাগরি")} />
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
        <span className="money text-sm font-normal text-muted-foreground">({visible.length})</span>
      </h2>
      {visible.length === 0 ? (
        <p className="mt-4 text-muted-foreground">{t("No products match this view.", "কোনো পণ্য পাওয়া যায়নি।")}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => {
            const variants = p.product_variants ?? [];
            const min = variants.length
              ? Math.min(...variants.map((v) => Number(v.price_amount_minor_int)))
              : 0;
            const inStock = variants.some((v) => v.stock_quantity > 0);
            return (
              <li key={p.id}>
                <Link
                  to="/store/$slug/p/$productSlug"
                  params={{ slug, productSlug: p.slug }}
                  className="group block overflow-hidden rounded-fq-lg border border-border bg-card transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div className="aspect-square bg-muted">
                    <StoreImage
                      image={p.image ?? null}
                      fallbackSrc={p.image_url}
                      alt={p.title}
                      sizes="(max-width: 768px) 50vw, 300px"
                      className="size-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <h3 className="line-clamp-2 text-sm font-medium">{p.title}</h3>
                    <p className="money mt-1 text-sm font-semibold">{fmtMinor(min, merchant.currency_code)}</p>
                    <p className={`mt-1 text-xs ${inStock ? "text-success-foreground" : "text-danger-foreground"}`}>
                      {inStock ? t("In stock", "স্টকে আছে") : t("Out of stock", "স্টক নেই")}
                    </p>
                  </div>
                </Link>
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
          <Link
            to="/store/$slug/c/$collectionSlug"
            params={{ slug, collectionSlug: c.slug }}
            className="block w-full rounded-fq-md border border-border bg-card px-4 py-3 text-left text-sm hover:bg-muted"
          >
            {c.name}
          </Link>
        </li>
      ))}
    </ul>
  );


  const defaultHero = (
    <section className="rounded-fq-lg border border-border bg-info-soft p-8">
      <h1 className="font-bangla-display text-3xl font-bold sm:text-4xl">{merchant.name}</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        {settings?.tagline ?? t("Fast delivery across Bangladesh — cash on delivery and mobile payments.", "বাংলাদেশজুড়ে দ্রুত ডেলিভারি — ক্যাশ অন ডেলিভারি ও মোবাইল পেমেন্ট।")}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2 text-xs">
        {(settings?.cod_enabled ?? true) && (
          <li className="rounded-full bg-warning-soft px-3 py-1 text-warning-foreground">{t("Cash on delivery", "ক্যাশ অন ডেলিভারি")}</li>
        )}
        {(settings?.mfs_enabled ?? true) && (
          <li className="rounded-full bg-success-soft px-3 py-1 text-success-foreground">bKash / Nagad</li>
        )}
        <li className="rounded-full bg-card px-3 py-1 text-muted-foreground">VAT included at checkout</li>
      </ul>
    </section>
  );

  // The published `index` template owns the page: header, main and footer
  // slots all come from the active theme, and this route only supplies the
  // live catalogue and collection data the theme's widgets ask for.
  return (
    <WidgetDataProvider bundle={widgetBundle} map={widgetData}>
      <CustomCodeSurface code={customCode} />
      <ThemeChrome
        template="index"
        ast={ast}
        tokens={tokens}
        storeSlug={slug}
        merchantId={merchant.id}
        siteKit={siteKit}
        chrome={
          <>
            <CustomCodeBody code={customCode} slot="start" />
            <StoreHeader slug={slug} name={merchant.name} tagline={settings?.tagline} />
            <SupportWidget slug={slug} />
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
