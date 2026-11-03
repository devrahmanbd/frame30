import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ThemeChrome } from "@/components/store/ThemeChrome";
import { PluginLayer } from "@/components/store/PluginLayer";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreImage } from "@/components/store/StoreImage";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { flattenAst } from "@/lib/builder-ast";
import { isCustomHostPath } from "@/lib/storefront-url";
import { HEADER_FALLBACK_MENU } from "@/lib/header-copy";
import { SlidersHorizontal, ChevronDown, X } from "lucide-react";
import { buildCollectionArchetype } from "@/lib/themes/songoskriti/archetypes";
import type { getStoreCollection } from "@/lib/storefront.functions";

export type CollectionPayload = Exclude<
  Awaited<ReturnType<typeof getStoreCollection>>,
  null
>;

type DiscoveryPill = {
  slug: string;
  label: string;
  label_bn?: string;
};

type ParentCategory = {
  slug: string;
  name: string;
  name_bn?: string;
};

type DepartmentContext = {
  parent?: ParentCategory;
  pills: DiscoveryPill[];
};

/**
 * Editorial department taxonomy: maps major fashion departments and subcategories
 * to their parent relationships and curated discovery pills.
 */
const DEPARTMENT_TAXONOMY: Record<string, DepartmentContext> = {
  women: {
    pills: [
      { slug: "women", label: "All Women", label_bn: "সকল কালেকশন" },
      { slug: "sarees", label: "Sarees", label_bn: "শাড়ি" },
      { slug: "jamdani", label: "Dhakai Jamdani", label_bn: "ঢাকাই জামদানি" },
      {
        slug: "heritage-handloom",
        label: "Heritage Handloom",
        label_bn: "ঐতিহ্যবাহী তাঁত",
      },
      { slug: "festive", label: "Festive", label_bn: "উৎসব" },
      {
        slug: "wedding",
        label: "Wedding & Bridal",
        label_bn: "বিয়ে ও ব্রাইডাল",
      },
      { slug: "taaga-fusion", label: "Taaga Fusion", label_bn: "তাগা ফিউশন" },
      { slug: "jewellery", label: "Jewellery", label_bn: "গহনা" },
      { slug: "new-in", label: "New Arrivals", label_bn: "নতুন আগমন" },
      { slug: "best-sellers", label: "Best Sellers", label_bn: "জনপ্রিয়" },
    ],
  },
  sarees: {
    parent: { slug: "women", name: "Women", name_bn: "নারী" },
    pills: [
      { slug: "sarees", label: "All Sarees", label_bn: "সকল শাড়ি" },
      { slug: "jamdani", label: "Dhakai Jamdani", label_bn: "ঢাকাই জামদানি" },
      {
        slug: "heritage-handloom",
        label: "Heritage Handloom",
        label_bn: "ঐতিহ্যবাহী তাঁত",
      },
      { slug: "festive", label: "Festive Sarees", label_bn: "উৎসবের শাড়ি" },
      { slug: "wedding", label: "Bridal Sarees", label_bn: "ব্রাইডাল শাড়ি" },
      { slug: "women", label: "All Women", label_bn: "সকল কালেকশন" },
    ],
  },
  jamdani: {
    parent: { slug: "sarees", name: "Sarees", name_bn: "শাড়ি" },
    pills: [
      { slug: "jamdani", label: "Dhakai Jamdani", label_bn: "ঢাকাই জামদানি" },
      { slug: "sarees", label: "All Sarees", label_bn: "সকল শাড়ি" },
      {
        slug: "heritage-handloom",
        label: "Heritage Handloom",
        label_bn: "ঐতিহ্যবাহী তাঁত",
      },
      { slug: "festive", label: "Festive", label_bn: "উৎসব" },
      { slug: "wedding", label: "Wedding", label_bn: "বিয়ে" },
    ],
  },
  "heritage-handloom": {
    parent: { slug: "women", name: "Women", name_bn: "নারী" },
    pills: [
      {
        slug: "heritage-handloom",
        label: "Heritage Handloom",
        label_bn: "ঐতিহ্যবাহী তাঁত",
      },
      { slug: "jamdani", label: "Dhakai Jamdani", label_bn: "ঢাকাই জামদানি" },
      { slug: "sarees", label: "Sarees", label_bn: "শাড়ি" },
      { slug: "nakshi-kantha", label: "Nakshi Kantha", label_bn: "নকশী কাঁথা" },
      {
        slug: "panjabi",
        label: "Handloom Panjabi",
        label_bn: "তাঁতের পাঞ্জাবি",
      },
    ],
  },
  festive: {
    parent: { slug: "women", name: "Women", name_bn: "নারী" },
    pills: [
      { slug: "festive", label: "All Festive", label_bn: "উৎসব কালেকশন" },
      { slug: "eid-festive", label: "Eid Festive", label_bn: "ঈদ কালেকশন" },
      {
        slug: "wedding",
        label: "Wedding & Bridal",
        label_bn: "বিয়ে ও ব্রাইডাল",
      },
      { slug: "sarees", label: "Festive Sarees", label_bn: "উৎসবের শাড়ি" },
      { slug: "panjabi", label: "Festive Panjabi", label_bn: "উৎসবের পাঞ্জাবি" },
      { slug: "groom", label: "Groom Wear", label_bn: "বরের পোশাক" },
    ],
  },
  wedding: {
    parent: {
      slug: "festive",
      name: "Festive & Occasion",
      name_bn: "উৎসব ও অনুষ্ঠান",
    },
    pills: [
      {
        slug: "wedding",
        label: "Wedding & Bridal",
        label_bn: "বিয়ে ও ব্রাইডাল",
      },
      { slug: "groom", label: "Groom & Sherwani", label_bn: "বর ও শেরওয়ানি" },
      { slug: "sarees", label: "Bridal Sarees", label_bn: "ব্রাইডাল শাড়ি" },
      { slug: "jamdani", label: "Dhakai Jamdani", label_bn: "ঢাকাই জামদানি" },
      { slug: "jewellery", label: "Bridal Jewellery", label_bn: "ব্রাইডাল গহনা" },
      { slug: "mehendi", label: "Mehendi", label_bn: "মেহেদি" },
      { slug: "sangeet", label: "Sangeet", label_bn: "সংগীত" },
    ],
  },
  "taaga-fusion": {
    parent: { slug: "women", name: "Women", name_bn: "নারী" },
    pills: [
      { slug: "taaga-fusion", label: "Taaga Fusion", label_bn: "তাগা ফিউশন" },
      {
        slug: "artisan-essentials",
        label: "Artisan Essentials",
        label_bn: "কারিগর কালেকশন",
      },
      { slug: "jewellery", label: "Jewellery", label_bn: "গহনা" },
      { slug: "women", label: "All Women", label_bn: "নারী কালেকশন" },
      { slug: "new-in", label: "New In", label_bn: "নতুন আগমন" },
    ],
  },
  "artisan-essentials": {
    parent: {
      slug: "taaga-fusion",
      name: "Modern & Craft",
      name_bn: "আধুনিক ও কারুশিল্প",
    },
    pills: [
      {
        slug: "artisan-essentials",
        label: "Artisan Essentials",
        label_bn: "কারিগর কালেকশন",
      },
      { slug: "taaga-fusion", label: "Taaga Fusion", label_bn: "তাগা ফিউশন" },
      {
        slug: "heritage-handloom",
        label: "Heritage Handloom",
        label_bn: "ঐতিহ্যবাহী তাঁত",
      },
      { slug: "nakshi-kantha", label: "Nakshi Kantha", label_bn: "নকশী কাঁথা" },
    ],
  },
  jewellery: {
    parent: { slug: "women", name: "Women", name_bn: "নারী" },
    pills: [
      { slug: "jewellery", label: "All Jewellery", label_bn: "সকল গহনা" },
      { slug: "wedding", label: "Bridal Sets", label_bn: "ব্রাইডাল সেট" },
      { slug: "taaga-fusion", label: "Contemporary", label_bn: "আধুনিক গহনা" },
      { slug: "sarees", label: "Sarees Match", label_bn: "শাড়ির গহনা" },
    ],
  },
  men: {
    pills: [
      { slug: "men", label: "All Men", label_bn: "সকল কালেকশন" },
      {
        slug: "panjabi",
        label: "Panjabi & Kurta",
        label_bn: "পাঞ্জাবি ও কুর্তা",
      },
      { slug: "groom", label: "Groom & Wedding", label_bn: "বর ও বিয়ে" },
      {
        slug: "heritage-handloom",
        label: "Heritage Handloom",
        label_bn: "ঐতিহ্যবাহী তাঁত",
      },
      { slug: "everyday", label: "Everyday Wear", label_bn: "দৈনন্দিন পোশাক" },
      { slug: "festive", label: "Festive Wear", label_bn: "উৎসবের পোশাক" },
      { slug: "new-in", label: "New Arrivals", label_bn: "নতুন আগমন" },
      { slug: "best-sellers", label: "Best Sellers", label_bn: "জনপ্রিয়" },
    ],
  },
  panjabi: {
    parent: { slug: "men", name: "Men", name_bn: "পুরুষ" },
    pills: [
      { slug: "panjabi", label: "All Panjabis", label_bn: "সকল পাঞ্জাবি" },
      { slug: "groom", label: "Groom & Wedding", label_bn: "বর ও শেরওয়ানি" },
      {
        slug: "heritage-handloom",
        label: "Heritage Handloom",
        label_bn: "তাঁত পাঞ্জাবি",
      },
      { slug: "eid-festive", label: "Eid Festive", label_bn: "ঈদ কালেকশন" },
      { slug: "everyday", label: "Everyday Kurta", label_bn: "দৈনন্দিন কুর্তা" },
      { slug: "men", label: "All Men", label_bn: "সকল কালেকশন" },
    ],
  },
  groom: {
    parent: { slug: "men", name: "Men", name_bn: "পুরুষ" },
    pills: [
      { slug: "groom", label: "Groom & Wedding", label_bn: "বর ও বিয়ে" },
      { slug: "panjabi", label: "Panjabis", label_bn: "পাঞ্জাবি" },
      {
        slug: "wedding",
        label: "Wedding Collection",
        label_bn: "বিয়ে কালেকশন",
      },
      { slug: "festive", label: "Festive Wear", label_bn: "উৎসব" },
    ],
  },
  everyday: {
    parent: { slug: "men", name: "Men", name_bn: "পুরুষ" },
    pills: [
      { slug: "everyday", label: "Everyday Wear", label_bn: "দৈনন্দিন পোশাক" },
      {
        slug: "panjabi",
        label: "Casual Panjabi",
        label_bn: "ক্যাজুয়াল পাঞ্জাবি",
      },
      { slug: "men", label: "All Men", label_bn: "সকল পুরুষ কালেকশন" },
    ],
  },
  "eid-festive": {
    parent: { slug: "festive", name: "Festive", name_bn: "উৎসব" },
    pills: [
      { slug: "eid-festive", label: "Eid Festive", label_bn: "ঈদ কালেকশন" },
      { slug: "panjabi", label: "Men's Panjabi", label_bn: "পুরুষের পাঞ্জাবি" },
      { slug: "sarees", label: "Festive Sarees", label_bn: "উৎসবের শাড়ি" },
      { slug: "kids", label: "Kids Festive", label_bn: "কিডস কালেকশন" },
      { slug: "family", label: "Family Outfits", label_bn: "ফ্যামিলি আউটফিট" },
    ],
  },
  living: {
    pills: [
      { slug: "living", label: "All Living", label_bn: "সকল হোম ও লিভিং" },
      { slug: "nakshi-kantha", label: "Nakshi Kantha", label_bn: "নকশী কাঁথা" },
      {
        slug: "heritage",
        label: "Heritage Craft",
        label_bn: "ঐতিহ্যবাহী কারুশিল্প",
      },
      { slug: "gifting", label: "Gift Items", label_bn: "উপহার সামগ্রী" },
      {
        slug: "aarong-earth",
        label: "Aarong Earth",
        label_bn: "আড়ং আর্থ",
      },
    ],
  },
  "nakshi-kantha": {
    parent: {
      slug: "living",
      name: "Living & Heritage",
      name_bn: "হোম ও ঐতিহ্য",
    },
    pills: [
      { slug: "nakshi-kantha", label: "Nakshi Kantha", label_bn: "নকশী কাঁথা" },
      { slug: "heritage", label: "Heritage Craft", label_bn: "কারুশিল্প" },
      { slug: "living", label: "Home & Living", label_bn: "হোম ও লিভিং" },
      { slug: "gifting", label: "Gifting", label_bn: "উপহার" },
    ],
  },
  kids: {
    pills: [
      { slug: "kids", label: "All Kids", label_bn: "সকল কিডস" },
      { slug: "family", label: "Family Matching", label_bn: "ফ্যামিলি কম্বো" },
      { slug: "eid-festive", label: "Eid & Festive", label_bn: "ঈদ ও উৎসব" },
      { slug: "new-in", label: "New Arrivals", label_bn: "নতুন আগমন" },
    ],
  },
  family: {
    parent: { slug: "kids", name: "Kids & Family", name_bn: "কিডস ও পরিবার" },
    pills: [
      { slug: "family", label: "Family Sets", label_bn: "ফ্যামিলি সেট" },
      { slug: "kids", label: "Kids Wear", label_bn: "কিডস পোশাক" },
      { slug: "eid-festive", label: "Eid Matching", label_bn: "ঈদ ম্যাচিং" },
      { slug: "festive", label: "Festive", label_bn: "উৎসব" },
    ],
  },
  "new-in": {
    pills: [
      { slug: "new-in", label: "New Arrivals", label_bn: "নতুন আগমন" },
      { slug: "best-sellers", label: "Best Sellers", label_bn: "জনপ্রিয় পণ্য" },
      { slug: "women", label: "Women", label_bn: "নারী" },
      { slug: "men", label: "Men", label_bn: "পুরুষ" },
      { slug: "festive", label: "Festive", label_bn: "উৎসব" },
      { slug: "living", label: "Living", label_bn: "লিভিং" },
    ],
  },
  "best-sellers": {
    pills: [
      { slug: "best-sellers", label: "Best Sellers", label_bn: "সেরা বিক্রিত" },
      { slug: "new-in", label: "New Arrivals", label_bn: "নতুন আগমন" },
      { slug: "women", label: "Women", label_bn: "নারী" },
      { slug: "men", label: "Men", label_bn: "পুরুষ" },
      { slug: "sarees", label: "Sarees", label_bn: "শাড়ি" },
      { slug: "panjabi", label: "Panjabi", label_bn: "পাঞ্জাবি" },
    ],
  },
};

export function CollectionView({ data }: { data: CollectionPayload }) {
  const { t, lang } = useLang();
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
  let showHero = false;
  let heroImage = "";

  if (["new-in", "bestsellers", "best-sellers"].includes(collection.slug)) {
    collectionType = "curated";
  } else if (["women", "men", "kids"].includes(collection.slug)) {
    collectionType = "department";
    // Fix round: the songoskriti brand heroes follow the installed theme
    // key — a foreign theme on these slugs gets the generic grid, never
    // theme art. (kids sets no image either way; showHero stays false.)
    if (isSongoskriti) {
      showHero = true;
      if (collection.slug === "women")
        heroImage = "/ph/songoskriti/cat-women.png";
      if (collection.slug === "men") heroImage = "/ph/songoskriti/cat-men.jpg";
    }
  } else if (
    ["festive", "wedding", "eid", "heritage"].includes(collection.slug)
  ) {
    collectionType = "campaign";
    // Fix round: same key gate as above — campaign art is theme-owned.
    if (isSongoskriti) {
      showHero = true;
      heroImage = "/ph/songoskriti/hero-festive.jpg";
    }
  }

  // 2. Department & Subcategory Hierarchy Resolution
  let parentInfo: ParentCategory | null = null;
  let subnavPills: DiscoveryPill[] = [];

  const taxonomy = DEPARTMENT_TAXONOMY[collection.slug];
  if (taxonomy) {
    parentInfo = taxonomy.parent ?? null;
    subnavPills = taxonomy.pills;
  } else {
    // Try to find in HEADER_FALLBACK_MENU tree
    const findInTree = (
      items: typeof HEADER_FALLBACK_MENU,
      targetSlug: string,
      parent?: ParentCategory,
    ): { parent: ParentCategory | null; pills: DiscoveryPill[] } | null => {
      for (const item of items) {
        const itemSlug = item.url.replace(/^\/c\//, "");
        if (itemSlug === targetSlug) {
          const pills: DiscoveryPill[] = (item.children ?? []).map((c) => ({
            slug: c.url.replace(/^\/c\//, ""),
            label: c.label,
          }));
          return { parent: parent ?? null, pills };
        }
        if (item.children) {
          const found = findInTree(item.children as typeof HEADER_FALLBACK_MENU, targetSlug, {
            slug: itemSlug,
            name: item.label,
          });
          if (found) return found;
        }
      }
      return null;
    };

    const treeMatch = findInTree(HEADER_FALLBACK_MENU, collection.slug);
    if (treeMatch && treeMatch.pills.length > 0) {
      parentInfo = treeMatch.parent;
      subnavPills = treeMatch.pills;
    } else if (categories.length > 0) {
      subnavPills = categories.map((cat) => ({
        slug: (cat.url || "").replace(/^\/c\//, "").replace(/^\//, ""),
        label: cat.label,
      }));
    }
  }

  const grid = (
    <div className="w-full pb-20">
      {/* ── 1. Full-Visual Landing Page Hero / Header ── */}
      {showHero && heroImage ? (
        <div className="relative w-full aspect-[16/7] sm:aspect-[21/8] lg:aspect-[24/8] min-h-[280px] sm:min-h-[360px] lg:min-h-[420px] overflow-hidden bg-neutral-900 mb-8 sm:mb-12">
          <img
            src={heroImage}
            alt={collection.name}
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20" />
          <div className="relative h-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col justify-end pb-8 sm:pb-12 text-white">
            <nav aria-label="Breadcrumb" className="mb-3 sm:mb-4">
              <ol className="flex items-center flex-wrap gap-1.5 text-[11px] uppercase tracking-[0.15em] font-medium text-white/70">
                <li>
                  <Link
                    to={custom ? "/" : "/store/$slug"}
                    params={{ slug }}
                    className="hover:text-white transition-colors"
                  >
                    {t("Home", "হোম")}
                  </Link>
                </li>
                {parentInfo && (
                  <>
                    <li>
                      <span className="text-white/40">/</span>
                    </li>
                    <li>
                      <Link
                        to={
                          custom
                            ? "/c/$collectionSlug"
                            : "/store/$slug/c/$collectionSlug"
                        }
                        params={
                          custom
                            ? { collectionSlug: parentInfo.slug }
                            : { slug, collectionSlug: parentInfo.slug }
                        }
                        className="hover:text-white transition-colors"
                      >
                        {lang === "bn" && parentInfo.name_bn
                          ? parentInfo.name_bn
                          : parentInfo.name}
                      </Link>
                    </li>
                  </>
                )}
                <li>
                  <span className="text-white/40">/</span>
                </li>
                <li className="text-white font-semibold" aria-current="page">
                  {collection.name}
                </li>
              </ol>
            </nav>
            <h1
              style={{ color: "#ffffff" }}
              className="font-serif text-3xl sm:text-5xl lg:text-6xl !text-white font-normal tracking-tight drop-shadow-sm"
            >
              {collection.name}
            </h1>
            {collection.description && (
              <p
                style={{ color: "rgba(255, 255, 255, 0.9)" }}
                className="mt-3 sm:mt-4 max-w-2xl text-[14px] sm:text-[16px] leading-relaxed !text-white/90 font-sans font-light drop-shadow-sm"
              >
                {collection.description}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 pt-6 sm:pt-10 pb-6 border-b border-border/40 mb-6">
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex items-center flex-wrap gap-1.5 text-[11px] uppercase tracking-[0.15em] font-medium text-foreground/60">
              <li>
                <Link
                  to={custom ? "/" : "/store/$slug"}
                  params={{ slug }}
                  className="hover:text-foreground transition-colors"
                >
                  {t("Home", "হোম")}
                </Link>
              </li>
              {parentInfo && (
                <>
                  <li>
                    <span className="text-foreground/40">/</span>
                  </li>
                  <li>
                    <Link
                      to={
                        custom
                          ? "/c/$collectionSlug"
                          : "/store/$slug/c/$collectionSlug"
                      }
                      params={
                        custom
                          ? { collectionSlug: parentInfo.slug }
                          : { slug, collectionSlug: parentInfo.slug }
                      }
                      className="hover:text-foreground transition-colors"
                    >
                      {lang === "bn" && parentInfo.name_bn
                        ? parentInfo.name_bn
                        : parentInfo.name}
                    </Link>
                  </li>
                </>
              )}
              <li>
                <span className="text-foreground/40">/</span>
              </li>
              <li className="text-foreground font-semibold" aria-current="page">
                {collection.name}
              </li>
            </ol>
          </nav>
          <div className="max-w-3xl">
            <h1 className="font-serif text-3xl sm:text-5xl text-foreground font-normal tracking-tight">
              {collection.name}
            </h1>
            {collection.description && (
              <p className="mt-3 text-[15px] sm:text-[16px] leading-relaxed text-foreground/75 font-sans">
                {collection.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── 2. Curated Subcategory Discovery Rail ── */}
      {subnavPills.length > 0 && (
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 mb-8">
          <nav
            aria-label="Subcategories"
            className="overflow-x-auto scrollbar-none pb-2 -mx-4 px-4 sm:mx-0 sm:px-0"
          >
            <ul className="flex items-center gap-2.5 min-w-max">
              {subnavPills.map((pill) => {
                const isActive = collection.slug === pill.slug;
                const pillLabel =
                  lang === "bn" && pill.label_bn ? pill.label_bn : pill.label;
                const pillCls = `inline-flex items-center px-4 py-2 rounded-full text-[12px] font-medium tracking-wide transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-foreground text-background font-semibold shadow-xs"
                    : "bg-muted/40 hover:bg-muted text-foreground/75 hover:text-foreground border border-border/50"
                }`;
                return (
                  <li key={pill.slug}>
                    {custom ? (
                      <Link
                        to="/c/$collectionSlug"
                        params={{ collectionSlug: pill.slug }}
                        className={pillCls}
                      >
                        {pillLabel}
                      </Link>
                    ) : (
                      <Link
                        to="/store/$slug/c/$collectionSlug"
                        params={{ slug, collectionSlug: pill.slug }}
                        className={pillCls}
                      >
                        {pillLabel}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}

      {/* ── 3. Merchandising Filter & Sort Toolbar ── */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 mb-8">
        <div className="flex flex-wrap items-center justify-between py-4 border-y border-border/40 gap-4 sticky top-[64px] bg-background/95 backdrop-blur-xs z-20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterOpen(true)}
              className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-widest text-foreground hover:opacity-70 transition-opacity group cursor-pointer"
            >
              <SlidersHorizontal
                className="size-[16px] text-foreground/60 group-hover:text-foreground"
                strokeWidth={1.5}
              />
              {t("Filter", "ফিল্টার")}
            </button>
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50 hidden md:block">
            {products.length}{" "}
            {products.length === 1
              ? t("Product", "পণ্য")
              : t("Products", "পণ্যসমূহ")}
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-widest text-foreground hover:opacity-70 transition-opacity group cursor-pointer">
              <span className="text-foreground/50">{t("Sort:", "বাছাই:")}</span>{" "}
              {t("Featured", "সেরা")}
              <ChevronDown
                className="size-[14px] text-foreground/60"
                strokeWidth={1.5}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── 4. Merchandising Product Grid ── */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10">
        {products.length === 0 ? (
          <p className="py-16 text-center text-muted-foreground">
            {t(
              "No products in this collection yet.",
              "এই কালেকশনে এখনো কোনো পণ্য নেই।",
            )}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-12 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-16 lg:grid-cols-4 lg:gap-x-8">
            {products.map((p) => {
              const variants = p.product_variants ?? [];
              const min = variants.length
                ? Math.min(
                    ...variants.map((v) => Number(v.price_amount_minor_int)),
                  )
                : 0;
              const inStock = variants.some((v) => v.stock_quantity > 0);

              let badge: string | null = null;
              if (collectionType === "curated" && collection.slug === "new-in") {
                badge = "NEW";
              } else if (
                collectionType === "curated" &&
                (collection.slug === "bestsellers" ||
                  collection.slug === "best-sellers")
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
                      sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
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
                    <p className="text-[13px] sm:text-[14px] font-medium leading-snug text-foreground tracking-wide line-clamp-2 font-serif">
                      {p.title}
                    </p>
                    <p className="money text-[13px] font-medium tracking-wide text-foreground/80 font-sans mt-0.5">
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
      </div>

      {products.length > 0 && (
        <div className="mt-16 text-center">
          <button className="px-10 py-3.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground border border-foreground/20 hover:border-foreground/40 transition-colors bg-transparent cursor-pointer">
            {t("Load More", "আরো দেখুন")}
          </button>
        </div>
      )}

      {/* ── 5. Slide-Over Filter Drawer ── */}
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
                {t("Filters", "ফিল্টার")}
              </h2>
              <button
                onClick={() => setFilterOpen(false)}
                className="text-foreground/60 hover:text-foreground transition-colors p-2 -mr-2 cursor-pointer"
              >
                <X className="size-[20px]" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
                  {t("Category", "ক্যাটাগরি")}
                </h3>
                <ul className="space-y-3">
                  {["Sarees", "Jamdani", "Festive", "Tangail"].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 rounded-sm border-foreground/30 accent-foreground"
                      />
                      <span className="text-[14px] text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
                  {t("Price Range", "মূল্য সীমা")}
                </h3>
                <ul className="space-y-3">
                  {[
                    "Under ৳5,000",
                    "৳5,000 - ৳10,000",
                    "Above ৳10,000",
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 rounded-sm border-foreground/30 accent-foreground"
                      />
                      <span className="text-[14px] text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/50">
                  {t("Availability", "উপলব্ধতা")}
                </h3>
                <ul className="space-y-3">
                  {["In Stock", "Out of Stock"].map((f) => (
                    <li key={f} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 rounded-sm border-foreground/30 accent-foreground"
                      />
                      <span className="text-[14px] text-foreground/80">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-6 border-t border-border/40 grid grid-cols-2 gap-4 bg-muted/10">
              <button
                onClick={() => setFilterOpen(false)}
                className="w-full py-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground border border-foreground/20 hover:border-foreground/40 transition-colors bg-transparent cursor-pointer"
              >
                {t("Clear All", "মুছে ফেলুন")}
              </button>
              <button
                onClick={() => setFilterOpen(false)}
                className="w-full py-3.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-background bg-foreground hover:bg-foreground/90 transition-colors cursor-pointer"
              >
                {t("Apply", "প্রয়োগ করুন")}
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

  // CollectionView supplies its own designed surface for category_header and
  // result_toolbar (ROUTE_REPLACED in preview-safety contract). Filter them from
  // the theme AST to prevent duplicate headers/toolbars.
  const cleanAst = dynamicAst
    ? {
        ...dynamicAst,
        main: dynamicAst.main.filter(
          (s) => s.type !== "category_header" && s.type !== "result_toolbar",
        ),
      }
    : dynamicAst;

  const hasProductGrid = cleanAst
    ? flattenAst(cleanAst).some(
        (s) => s.type === "product_grid" || s.type === "product_rail",
      )
    : false;

  return (
    <PluginLayer plugins={installedPlugins}>
      <ThemeChrome
        template="collection"
        containerClassName="w-full"
        ast={cleanAst}
        tokens={tokens}
        storeSlug={slug}
        themeKey={themeKey ?? null}
        merchantId={merchant.id}
        siteKit={siteKit}
        ownsPrimary={custom}
        chrome={
          <StoreHeader
            slug={slug}
            name={merchant.name}
            tagline={settings?.tagline}
            menus={menus}
            themeKey={themeKey ?? null}
          />
        }
        productSlot={grid}
        {...(hasProductGrid ? {} : { collectionSlot: grid })}
        fallback={grid}
      />
    </PluginLayer>
  );
}
