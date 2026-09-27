import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { flattenAst } from "@/lib/builder-ast";
import { rebaseMenuHref } from "@/lib/menus/menu";
import { isCustomHostPath } from "@/lib/storefront-url";
import { SONGOSKRITI_MEGA_MENU } from "@/lib/themes/songoskriti/header-fallback";
import { SlidersHorizontal, ChevronDown, X } from "lucide-react";
import { buildCollectionArchetype } from "@/lib/themes/songoskriti/archetypes";
import type { getStoreCollection } from "@/lib/storefront.functions";

export type CollectionPayload = Exclude<
  Awaited<ReturnType<typeof getStoreCollection>>,
  null
>;

export function CollectionView({ data }: { data: CollectionPayload }) {
  const { t } = useLang();
  const {
    merchant,
    collection,
    products,
    settings,
    ast,
    tokens,
    siteKit,
    menus,
    installedPlugins,
    themeKey,
  } = data;
  const slug = merchant.slug;
  const categories = menus?.header?.slice(0, 10) ?? [];
  const { location } = useRouterState();
  const custom = isCustomHostPath(location.pathname);

  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (filterOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [filterOpen]);

  // Theme-remediation Task 3: brand follows the installed theme key,
  // never the store slug or display name. A foreign theme on a
  // theme-named slug gets generic category navigation, not theme chrome.
  const isSongoskriti = themeKey === "songoskriti";

  // 1. Configuration based on collection
  let collectionType: "curated" | "department" | "category" | "campaign" =
    "category";
  let hasSubnav = false;
  let showHero = false;
  let heroImage = "";

  if (["new-in", "bestsellers"].includes(collection.slug)) {
    collectionType = "curated";
  } else if (["women", "men", "kids"].includes(collection.slug)) {
    collectionType = "department";
    hasSubnav = true;
    showHero = true;
    if (collection.slug === "women")
      heroImage = "/ph/songoskriti/songoskriti-hero.jpg";
    if (collection.slug === "men") heroImage = "/ph/songoskriti/cat-men.png";
  } else if (
    ["festive", "wedding", "eid", "heritage"].includes(collection.slug)
  ) {
    collectionType = "campaign";
    hasSubnav = true;
    showHero = true;
    heroImage = "/ph/songoskriti/hero-festive.png";
  } else {
    // normal category like sarees, panjabi
    hasSubnav = true; // might have sibling/children
  }

  // 2. Subnav Resolution
  let subnavItems: any[] = [];
  if (hasSubnav && isSongoskriti) {
    // Try to find this category in the mega menu
    const findInMenu = (items: any[], targetUrl: string): any => {
      for (const item of items) {
        if (item.url === targetUrl) return item;
        if (item.children) {
          const found = findInMenu(item.children, targetUrl);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findInMenu(SONGOSKRITI_MEGA_MENU, `/c/${collection.slug}`);
    if (node && node.children && node.children.length > 0) {
      subnavItems = node.children;
    } else {
      // If it's a leaf, maybe show its siblings
      // (Simplified: just show header menus if not in mega menu)
    }
  } else if (!isSongoskriti) {
    subnavItems = categories;
  }

  const grid = (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 pb-20">
      {/* --- BREADCRUMB --- */}
      <nav aria-label="Breadcrumb" className="py-6">
        <ol className="flex items-center space-x-2 text-[11px] uppercase tracking-[0.1em] font-medium text-foreground/60">
          <li>
            <Link
              to={custom ? "/" : "/store/$slug"}
              params={{ slug }}
              className="hover:text-foreground transition-colors"
            >
              Home
            </Link>
          </li>
          <li>
            <span className="mx-2">/</span>
          </li>
          <li className="text-foreground" aria-current="page">
            {collection.name}
          </li>
        </ol>
      </nav>

      {/* --- COLLECTION INTRO --- */}
      <div
        className={`mb-10 ${collectionType === "curated" ? "text-center md:text-left" : "text-center md:text-left"}`}
      >
        <h1 className="font-serif text-4xl sm:text-5xl text-foreground font-normal tracking-tight">
          {collection.name}
        </h1>
        {collection.description && (
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-foreground/80 md:mx-0 mx-auto font-sans">
            {collection.description}
          </p>
        )}
      </div>

      {/* --- SUBCATEGORY NAVIGATION REMOVED (Moved to Chrome) --- */}

      {/* --- OPTIONAL HERO --- */}
      {showHero && heroImage && (
        <div className="mb-12 aspect-[21/9] w-full overflow-hidden bg-muted/20">
          <img
            src={heroImage}
            alt={collection.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* --- TOOLBAR --- */}
      <div className="flex flex-wrap items-center justify-between py-6 border-b border-border/40 mb-10 gap-4 sticky top-[64px] bg-background z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterOpen(true)}
            className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-widest text-foreground hover:opacity-70 transition-opacity group"
          >
            <SlidersHorizontal
              className="size-[16px] text-foreground/60 group-hover:text-foreground"
              strokeWidth={1.5}
            />
            Filter
          </button>
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50 hidden md:block">
          {products.length} Products
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-widest text-foreground hover:opacity-70 transition-opacity group">
            <span className="text-foreground/50">Sort:</span> Featured
            <ChevronDown
              className="size-[14px] text-foreground/60"
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          {t(
            "No products in this collection yet.",
            "এই কালেকশনে এখনো কোনো পণ্য নেই।",
          )}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {products.map((p) => {
            const variants = p.product_variants ?? [];
            const min = variants.length
              ? Math.min(
                  ...variants.map((v) => Number(v.price_amount_minor_int)),
                )
              : 0;
            const inStock = variants.some((v) => v.stock_quantity > 0);

            // Generate visual badges based on collection type / product state
            let badge: string | null = null;
            if (collectionType === "curated" && collection.slug === "new-in") {
              badge = "NEW";
            } else if (
              collectionType === "curated" &&
              collection.slug === "bestsellers"
            ) {
              badge = "BESTSELLER";
            }

            const cardBody = (
              <>
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#f4f4f4] group-hover:bg-[#eaeaea] transition-colors">
                  <StoreImage
                    image={p.image ?? null}
                    fallbackSrc={p.image_url}
                    alt={p.title}
                    seed={p.id}
                    sizes="(max-width: 768px) 50vw, 300px"
                    className="size-full object-cover object-top transition-transform duration-[1.5s] group-hover:scale-[1.03]"
                  />
                  {badge && (
                    <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-foreground shadow-sm">
                      {badge}
                    </div>
                  )}
                  {!inStock && (
                    <div className="absolute bottom-3 left-3 bg-foreground/90 backdrop-blur-sm px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-background shadow-sm">
                      {t("Out of stock", "স্টক নেই")}
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-1">
                  <h2 className="text-[12px] font-medium leading-relaxed text-foreground tracking-wide line-clamp-1 font-sans">
                    {p.title}
                  </h2>
                  <p className="money text-[12px] font-medium tracking-wide text-foreground/70 font-sans">
                    {fmtMinor(min, merchant.currency_code)}
                  </p>
                </div>
              </>
            );

            return (
              <li key={p.id}>
                {custom ? (
                  <Link
                    to="/p/$productSlug"
                    params={{ productSlug: p.slug }}
                    className="group block"
                  >
                    {cardBody}
                  </Link>
                ) : (
                  <Link
                    to="/store/$slug/p/$productSlug"
                    params={{ slug, productSlug: p.slug }}
                    className="group block"
                  >
                    {cardBody}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {products.length > 0 && (
        <div className="mt-16 text-center">
          <button className="px-10 py-3.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground border border-foreground/20 hover:border-foreground/40 transition-colors bg-transparent">
            Load More
          </button>
        </div>
      )}

      {/* --- FILTER DRAWER --- */}
      {filterOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm transition-opacity"
            onClick={() => setFilterOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 w-full max-w-[360px] bg-background z-50 shadow-2xl flex flex-col transform transition-transform duration-300">
            <div className="flex items-center justify-between p-6 border-b border-border/40">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-foreground">
                Filters
              </h2>
              <button
                onClick={() => setFilterOpen(false)}
                className="text-foreground/60 hover:text-foreground transition-colors p-2 -mr-2"
              >
                <X className="size-[20px]" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Mock Filter Groups */}
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
                  Category
                </h3>
                <ul className="space-y-3">
                  {["Sarees", "Jamdani", "Festive", "Tangail"].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 rounded-sm border-foreground/30 accent-foreground"
                      />
                      <span className="text-[14px] text-foreground/80">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
                  Price
                </h3>
                <ul className="space-y-3">
                  {["Under 5000", "5000 - 10000", "Above 10000"].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 rounded-sm border-foreground/30 accent-foreground"
                      />
                      <span className="text-[14px] text-foreground/80">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
                  Availability
                </h3>
                <ul className="space-y-3">
                  {["In Stock", "Out of Stock"].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 rounded-sm border-foreground/30 accent-foreground"
                      />
                      <span className="text-[14px] text-foreground/80">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-6 border-t border-border/40 grid grid-cols-2 gap-4 bg-muted/10">
              <button
                onClick={() => setFilterOpen(false)}
                className="w-full py-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground border border-foreground/20 hover:border-foreground/40 transition-colors bg-transparent"
              >
                Clear All
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="w-full py-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-background bg-foreground hover:bg-foreground/90 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  let dynamicAst = ast;
  if (isSongoskriti && (!ast || ast.main.length === 0)) {
    const customMain = buildCollectionArchetype(
      collection.slug,
      collection.name,
    );
    if (customMain) {
      dynamicAst = ast
        ? { ...ast, main: customMain }
        : { header: [], main: customMain, footer: [] };
    }
  }

  const hasProductGrid = dynamicAst
    ? flattenAst(dynamicAst).some(
        (s) => s.type === "product_grid" || s.type === "product_rail",
      )
    : false;

  return (
    <PluginLayer plugins={installedPlugins}>
      <ThemeChrome
        template="collection"
        ast={dynamicAst}
        tokens={tokens}
        storeSlug={slug}
        themeKey={themeKey ?? null}
        merchantId={merchant.id}
        siteKit={siteKit}
        ownsPrimary={custom}
        chrome={
          <>
            <StoreHeader
              slug={slug}
              name={merchant.name}
              tagline={settings?.tagline}
              menus={menus}
              themeKey={themeKey ?? null}
            />
            {subnavItems.length > 0 && (
              <div className="bg-background border-b border-border/40 sticky top-[64px] z-30">
                <nav
                  aria-label="Subcategories"
                  className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 overflow-x-auto scrollbar-none"
                >
                  <ul className="flex items-center gap-8 min-w-max py-4">
                    {subnavItems.map((node) => {
                      if (!node.label) return null;
                      const href = rebaseMenuHref(
                        node.url || "#",
                        custom ? "" : `/store/${slug}`,
                      );
                      const isActive = location.pathname === href;
                      return (
                        <li key={node.id}>
                          <a
                            href={href}
                            className={`text-[12px] font-semibold tracking-[0.15em] uppercase transition-colors whitespace-nowrap ${
                              isActive
                                ? "text-foreground"
                                : "text-foreground/50 hover:text-foreground"
                            }`}
                          >
                            {node.label}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
            )}
          </>
        }
        productSlot={grid}
        {...(hasProductGrid ? {} : { collectionSlot: grid })}
        fallback={grid}
      />
    </PluginLayer>
  );
}
