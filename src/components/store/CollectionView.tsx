import { useState, useEffect, useRef } from "react";
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
  diagnostics?: MenuDiagnostic[];
};

export type MenuDiagnostic = {
  code:
    | "non_collection_destination"
    | "invalid_slug"
    | "unpublished_or_stale_collection";
  url: string;
  label: string;
};

/**
 * Dynamically derives collection hierarchy and discovery pills from
 * merchant navigation menus, eliminating hardcoded department taxonomies
 * and ensuring unpublished collections (e.g. Taaga Fusion) never leak.
 * Validates that destinations are legitimate collection URLs and prevents
 * transforming non-collection routes (e.g. /pages/contact, /blog/...) into /c/...
 */
export function deriveCollectionHierarchy({
  collectionSlug,
  menuTree,
  fallbackMenu = HEADER_FALLBACK_MENU,
  publishedCollectionSlugs,
}: {
  collectionSlug: string;
  menuTree?: {
    id?: string;
    label: string;
    label_bn?: string;
    url: string;
    children?: unknown[];
  }[];
  fallbackMenu?: typeof HEADER_FALLBACK_MENU;
  publishedCollectionSlugs?: string[];
}): DepartmentContext {
  const sourceTree =
    menuTree && menuTree.length > 0 ? menuTree : fallbackMenu;

  type NavItem = {
    id?: string;
    label: string;
    label_bn?: string;
    url: string;
    children?: NavItem[];
  };

  const diagnostics: MenuDiagnostic[] = [];

  const extractCollectionSlug = (url: string): string | null => {
    if (!url) return null;
    const trimmed = (url || "").trim().split("?")[0];
    if (trimmed.startsWith("/c/")) {
      const slug = trimmed.slice(3).replace(/^\/+|\/+$/g, "");
      return slug && !slug.includes("/") ? slug.toLowerCase() : null;
    }
    if (trimmed.startsWith("/collections/")) {
      const slug = trimmed.slice(13).replace(/^\/+|\/+$/g, "");
      return slug && !slug.includes("/") ? slug.toLowerCase() : null;
    }
    return null;
  };

  const isSlugPublished = (slug: string): boolean => {
    if (!publishedCollectionSlugs || publishedCollectionSlugs.length === 0) {
      return true;
    }
    return publishedCollectionSlugs.includes(slug);
  };

  const target = collectionSlug.toLowerCase().trim();

  const collectChildPills = (node: NavItem): DiscoveryPill[] => {
    const pills: DiscoveryPill[] = [];
    if (!node.children || node.children.length === 0) return pills;
    for (const child of node.children) {
      const cSlug = extractCollectionSlug(child.url);
      if (cSlug) {
        if (!isSlugPublished(cSlug)) {
          diagnostics.push({
            code: "unpublished_or_stale_collection",
            url: child.url,
            label: child.label,
          });
        } else if (!pills.some((p) => p.slug === cSlug)) {
          pills.push({
            slug: cSlug,
            label: child.label,
            label_bn: child.label_bn,
          });
        }
      } else if (child.url && !child.url.startsWith("#")) {
        diagnostics.push({
          code: "non_collection_destination",
          url: child.url,
          label: child.label,
        });
      }
      if (child.children && child.children.length > 0) {
        for (const grandchild of child.children) {
          const gcSlug = extractCollectionSlug(grandchild.url);
          if (gcSlug) {
            if (!isSlugPublished(gcSlug)) {
              diagnostics.push({
                code: "unpublished_or_stale_collection",
                url: grandchild.url,
                label: grandchild.label,
              });
            } else if (!pills.some((p) => p.slug === gcSlug)) {
              pills.push({
                slug: gcSlug,
                label: grandchild.label,
                label_bn: grandchild.label_bn,
              });
            }
          } else if (grandchild.url && !grandchild.url.startsWith("#")) {
            diagnostics.push({
              code: "non_collection_destination",
              url: grandchild.url,
              label: grandchild.label,
            });
          }
        }
      }
    }
    return pills;
  };

  const searchTree = (
    items: NavItem[],
    parentItem?: NavItem,
  ): {
    node: NavItem;
    parent?: ParentCategory;
    siblings: DiscoveryPill[];
  } | null => {
    for (const item of items) {
      const itemSlug = extractCollectionSlug(item.url);
      if (itemSlug === target) {
        const parentSlug = parentItem
          ? extractCollectionSlug(parentItem.url)
          : null;
        const parent =
          parentItem && parentSlug && isSlugPublished(parentSlug)
            ? {
                slug: parentSlug,
                name: parentItem.label,
                name_bn: parentItem.label_bn,
              }
            : undefined;
        const siblings: DiscoveryPill[] = [];
        for (const i of items) {
          const sSlug = extractCollectionSlug(i.url);
          if (sSlug) {
            if (!isSlugPublished(sSlug)) {
              diagnostics.push({
                code: "unpublished_or_stale_collection",
                url: i.url,
                label: i.label,
              });
            } else {
              siblings.push({
                slug: sSlug,
                label: i.label,
                label_bn: i.label_bn,
              });
            }
          } else if (i.url && !i.url.startsWith("#")) {
            diagnostics.push({
              code: "non_collection_destination",
              url: i.url,
              label: i.label,
            });
          }
        }
        return { node: item, parent, siblings };
      }
      if (item.children && item.children.length > 0) {
        const found = searchTree(item.children, item);
        if (found) return found;
      }
    }
    return null;
  };

  const match = searchTree(sourceTree as NavItem[]);

  if (match) {
    const childPills = collectChildPills(match.node);
    if (childPills.length > 0) {
      const pills: DiscoveryPill[] = [
        {
          slug: collectionSlug,
          label: `All ${match.node.label}`,
          label_bn: match.node.label_bn
            ? `সকল ${match.node.label_bn}`
            : undefined,
        },
        ...childPills.filter((p) => p.slug !== collectionSlug),
      ];
      return { parent: match.parent, pills, diagnostics };
    }
    if (match.siblings.length > 1) {
      return { parent: match.parent, pills: match.siblings, diagnostics };
    }
    if (match.parent) {
      return { parent: match.parent, pills: [], diagnostics };
    }
  }

  return { pills: [], diagnostics };
}

export type CollectionProduct = CollectionPayload["products"][number];

export type FilterFacetOption = {
  tag: string;
  label: string;
  label_bn?: string;
  count: number;
};

export const KNOWN_TAG_LABELS: Record<string, { en: string; bn: string }> = {
  jamdani: { en: "Dhakai Jamdani", bn: "ঢাকাই জামদানি" },
  silk: { en: "Pure Silk", bn: "সিল্ক" },
  cotton: { en: "Handloom Cotton", bn: "সুতি" },
  handloom: { en: "Handloom / Taant", bn: "তাঁত" },
  tangail: { en: "Tangail Taant", bn: "টাঙ্গাইল তাঁত" },
  katan: { en: "Katan Silk", bn: "কাতান" },
  handpainted: { en: "Hand-Painted", bn: "হ্যান্ড-পেইন্টেড" },
  festive: { en: "Festive Wear", bn: "উৎসবের পোশাক" },
  heritage: { en: "Heritage", bn: "ঐতিহ্য" },
  womens: { en: "Women's", bn: "নারী" },
  mens: { en: "Men's", bn: "পুরুষ" },
  muslin: { en: "Fine Muslin", bn: "মসলিন" },
  dupatta: { en: "Dupatta", bn: "ওড়না" },
  blockprint: { en: "Block Print", bn: "ব্লক প্রিন্ট" },
  panjabi: { en: "Panjabi", bn: "পাঞ্জাবি" },
  rajshahi: { en: "Rajshahi Silk", bn: "রাজশাহী সিল্ক" },
  "nakshi kantha": { en: "Nakshi Kantha", bn: "নকশী কাঁথা" },
  quilt: { en: "Handcrafted Quilt", bn: "কাঁথা" },
  living: { en: "Living & Decor", bn: "হোম ও লিভিং" },
  jewelry: { en: "Jewelry", bn: "গহনা" },
  brass: { en: "Brass Craft", bn: "পিতল" },
  earrings: { en: "Earrings", bn: "কানের দুল" },
  terracotta: { en: "Terracotta", bn: "পোড়ামাটি" },
  casual: { en: "Casual Wear", bn: "দৈনন্দিন পোশাক" },
  linen: { en: "Linen", bn: "লিনেন" },
  khadi: { en: "Handspun Khadi", bn: "খাদি" },
};

export const PRICE_OPTIONS = [
  { key: "all", en: "All Prices", bn: "সকল মূল্য" },
  { key: "under_5000", en: "Under ৳5,000", bn: "৳৫,০০০ এর নিচে" },
  { key: "5000_10000", en: "৳5,000 - ৳10,000", bn: "৳৫,০০০ - ৳১০,০০০" },
  { key: "above_10000", en: "Above ৳10,000", bn: "৳১০,০০০ এর উপরে" },
] as const;

export const AVAILABILITY_OPTIONS = [
  { key: "all", en: "All Products", bn: "সকল পণ্য" },
  { key: "in_stock", en: "In Stock Only", bn: "স্টকে আছে" },
  { key: "out_of_stock", en: "Out of Stock", bn: "স্টক নেই" },
] as const;

/**
 * Extract genuine weave/material options based on actual product tags in the collection.
 * Does not fabricate facets or attributes; excludes redundant collection-level tags.
 */
export function extractWeaveFacets(
  products: readonly { tags?: string[] }[],
  collectionSlug: string,
): FilterFacetOption[] {
  const counts = new Map<string, number>();
  for (const p of products) {
    const tags = p.tags ?? [];
    for (const rawTag of tags) {
      const tag = rawTag.toLowerCase().trim();
      if (!tag || tag.startsWith("care:")) continue;
      // Skip redundant collection tag
      if (
        tag === collectionSlug.toLowerCase() ||
        (collectionSlug === "sarees" && tag === "saree") ||
        (collectionSlug === "women" && tag === "womens")
      ) {
        continue;
      }
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const facets: FilterFacetOption[] = [];
  for (const [tag, count] of counts.entries()) {
    const known = KNOWN_TAG_LABELS[tag];
    facets.push({
      tag,
      label: known ? known.en : tag.charAt(0).toUpperCase() + tag.slice(1),
      label_bn: known?.bn,
      count,
    });
  }

  return facets.sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

export type ProductPricingAndStock = {
  priceMinMinor: number;
  priceMaxMinor: number;
  prices: number[];
  inStock: boolean;
  hasInventoryInfo: boolean;
  stockQuantity: number | null;
  variants: { price: number; stock: number | null; inStock: boolean }[];
  hasPrice: boolean;
  isOutOfStock: boolean;
  isPriceRange: boolean;
};

/**
 * Unified product price and stock resolver for simple products and multi-variant products.
 * Guarantees a single source of truth across card display, filtering, sorting, and facet counts.
 */
export function resolveProductPricingAndStock(
  p: CollectionProduct,
): ProductPricingAndStock {
  const rawVariants = (p.product_variants ?? []).filter(Boolean);
  const variants = rawVariants.map((v) => {
    const price = Number(v.price_amount_minor_int) || 0;
    const stock =
      v.stock_quantity != null ? Number(v.stock_quantity) : null;
    return {
      price,
      stock,
      inStock: stock != null ? stock > 0 : true,
    };
  });

  let prices: number[] = [];
  if (variants.length > 0) {
    prices = variants.map((v) => v.price);
  } else {
    const pFields = p as unknown as {
      price_amount_minor_int?: number;
      price_min_minor_int?: number;
      price_minor_int?: number;
      price?: number;
    };
    const productPrice =
      Number(pFields.price_amount_minor_int) ||
      Number(pFields.price_min_minor_int) ||
      Number(pFields.price_minor_int) ||
      (typeof pFields.price === "number"
        ? Math.round(pFields.price * 100)
        : 0);
    prices = productPrice > 0 ? [productPrice] : [0];
  }

  const priceMinMinor = prices.length > 0 ? Math.min(...prices) : 0;
  const priceMaxMinor = prices.length > 0 ? Math.max(...prices) : 0;

  let inStock = true;
  let hasInventoryInfo = false;
  let stockQuantity: number | null = null;

  if (variants.length > 0) {
    const trackedVariants = variants.filter((v) => v.stock != null);
    if (trackedVariants.length > 0) {
      hasInventoryInfo = true;
      stockQuantity = trackedVariants.reduce(
        (acc, v) => acc + (v.stock ?? 0),
        0,
      );
      inStock = trackedVariants.some((v) => (v.stock ?? 0) > 0);
    } else {
      const pAny = p as unknown as { status?: string; stock_status?: string };
      if (
        pAny.stock_status === "out_of_stock" ||
        pAny.status === "inactive" ||
        pAny.status === "draft"
      ) {
        hasInventoryInfo = true;
        inStock = false;
      } else {
        hasInventoryInfo = false;
        inStock = true;
      }
    }
  } else {
    const pAny = p as unknown as {
      stock_quantity?: number | null;
      inventory_quantity?: number | null;
      stock_status?: string | null;
      is_in_stock?: boolean | null;
      available?: boolean | null;
      status?: string | null;
    };
    if (typeof pAny.stock_quantity === "number") {
      hasInventoryInfo = true;
      stockQuantity = pAny.stock_quantity;
      inStock = pAny.stock_quantity > 0;
    } else if (typeof pAny.inventory_quantity === "number") {
      hasInventoryInfo = true;
      stockQuantity = pAny.inventory_quantity;
      inStock = pAny.inventory_quantity > 0;
    } else if (pAny.stock_status === "out_of_stock") {
      hasInventoryInfo = true;
      stockQuantity = 0;
      inStock = false;
    } else if (pAny.stock_status === "in_stock") {
      hasInventoryInfo = true;
      inStock = true;
    } else if (pAny.is_in_stock === false || pAny.available === false) {
      hasInventoryInfo = true;
      stockQuantity = 0;
      inStock = false;
    } else if (pAny.is_in_stock === true || pAny.available === true) {
      hasInventoryInfo = true;
      inStock = true;
    } else if (
      pAny.status === "inactive" ||
      pAny.status === "draft" ||
      pAny.status === "archived"
    ) {
      hasInventoryInfo = true;
      stockQuantity = 0;
      inStock = false;
    } else {
      hasInventoryInfo = false;
      stockQuantity = null;
      inStock = true;
    }
  }

  const hasPrice = priceMinMinor > 0;
  const isOutOfStock = !inStock;
  const isPriceRange = priceMinMinor !== priceMaxMinor && variants.length > 1;

  return {
    priceMinMinor,
    priceMaxMinor,
    prices,
    inStock,
    hasInventoryInfo,
    stockQuantity,
    variants,
    hasPrice,
    isOutOfStock,
    isPriceRange,
  };
}

/**
 * Pure filter logic: checks exact tag membership (no title substring matching),
 * BDT price brackets, and stock availability across both simple products and
 * multi-variant products using one consistent data contract.
 */
export function filterCollectionProducts(
  products: readonly CollectionProduct[],
  filters: {
    availability: "all" | "in_stock" | "out_of_stock";
    price: "all" | "under_5000" | "5000_10000" | "above_10000";
    tags: readonly string[];
    minPriceBDT?: number | null;
    maxPriceBDT?: number | null;
  },
): CollectionProduct[] {
  return products.filter((p) => {
    const info = resolveProductPricingAndStock(p);

    // Availability filter
    if (filters.availability === "in_stock" && !info.inStock) return false;
    if (filters.availability === "out_of_stock" && info.inStock) return false;

    // Price bracket filtering (BDT minor units: 5,000 BDT = 500,000 minor)
    if (filters.price === "under_5000") {
      const matches = info.variants.length > 0
        ? info.variants.some((v) => v.price < 500000)
        : info.priceMinMinor < 500000;
      if (!matches) return false;
    }
    if (filters.price === "5000_10000") {
      const matches = info.variants.length > 0
        ? info.variants.some((v) => v.price >= 500000 && v.price <= 1000000)
        : info.priceMinMinor >= 500000 && info.priceMinMinor <= 1000000;
      if (!matches) return false;
    }
    if (filters.price === "above_10000") {
      const matches = info.variants.length > 0
        ? info.variants.some((v) => v.price > 1000000)
        : info.priceMinMinor > 1000000;
      if (!matches) return false;
    }

    // Flexible custom BDT range if supplied:
    // Evaluates against the SAME variant so one variant doesn't satisfy min while another satisfies max
    const minMinor =
      filters.minPriceBDT != null && filters.minPriceBDT > 0
        ? filters.minPriceBDT * 100
        : null;
    const maxMinor =
      filters.maxPriceBDT != null && filters.maxPriceBDT > 0
        ? filters.maxPriceBDT * 100
        : null;

    if (minMinor != null || maxMinor != null) {
      const matches = info.variants.length > 0
        ? info.variants.some((v) => {
            if (minMinor != null && v.price < minMinor) return false;
            if (maxMinor != null && v.price > maxMinor) return false;
            return true;
          })
        : (() => {
            if (minMinor != null && info.priceMinMinor < minMinor) return false;
            if (maxMinor != null && info.priceMinMinor > maxMinor) return false;
            return true;
          })();
      if (!matches) return false;
    }

    // Weave / Material / Tag filter (exact tag membership, no title matching)
    if (filters.tags.length > 0) {
      const pTags = ((p as { tags?: string[] }).tags ?? []).map((t) =>
        t.toLowerCase(),
      );
      const match = filters.tags.some((tag) =>
        pTags.includes(tag.toLowerCase()),
      );
      if (!match) return false;
    }

    return true;
  });
}

/**
 * Pure sort logic: featured, price ascending, price descending, alphabetical title.
 * Works seamlessly with both simple and multi-variant products.
 */
export function sortCollectionProducts(
  products: readonly CollectionProduct[],
  sortBy: "featured" | "price_asc" | "price_desc" | "title",
): CollectionProduct[] {
  return [...products].sort((a, b) => {
    if (sortBy === "price_asc") {
      const aInfo = resolveProductPricingAndStock(a);
      const bInfo = resolveProductPricingAndStock(b);
      return aInfo.priceMinMinor - bInfo.priceMinMinor || a.title.localeCompare(b.title);
    }
    if (sortBy === "price_desc") {
      const aInfo = resolveProductPricingAndStock(a);
      const bInfo = resolveProductPricingAndStock(b);
      return bInfo.priceMinMinor - aInfo.priceMinMinor || a.title.localeCompare(b.title);
    }
    if (sortBy === "title") {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });
}

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

  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [filterAvailability, setFilterAvailability] = useState<
    "all" | "in_stock" | "out_of_stock"
  >("all");
  const [filterPrice, setFilterPrice] = useState<
    "all" | "under_5000" | "5000_10000" | "above_10000"
  >("all");
  const [minPriceBDT, setMinPriceBDT] = useState<number | null>(null);
  const [maxPriceBDT, setMaxPriceBDT] = useState<number | null>(null);
  const [minPriceInput, setMinPriceInput] = useState<string>("");
  const [maxPriceInput, setMaxPriceInput] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<
    "featured" | "price_asc" | "price_desc" | "title"
  >("featured");
  const [visibleCount, setVisibleCount] = useState<number>(12);
  const [openDropdown, setOpenDropdown] = useState<
    "weave" | "price" | "avail" | null
  >(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset pagination to first page whenever any filter or sort option changes
  useEffect(() => {
    setVisibleCount(12);
  }, [
    filterAvailability,
    filterPrice,
    minPriceBDT,
    maxPriceBDT,
    selectedTags,
    sortBy,
  ]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    if (openDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [openDropdown]);

  useEffect(() => {
    if (mobileFilterOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileFilterOpen]);

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
    ["sarees", "jamdani", "heritage-handloom"].includes(collection.slug)
  ) {
    collectionType = "department";
    // Flagship saree/weave collections: same editorial hero treatment as
    // top-level departments. Only renders for the songoskriti theme key.
    if (isSongoskriti) {
      showHero = true;
      if (collection.slug === "sarees")
        heroImage = "/ph/songoskriti/prod-saree.png";
      if (
        collection.slug === "jamdani" ||
        collection.slug === "heritage-handloom"
      )
        heroImage = "/ph/songoskriti/hero-weaves.jpg";
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

  // 2. Department & Subcategory Hierarchy Resolution (dynamically derived)
  const deptContext = deriveCollectionHierarchy({
    collectionSlug: collection.slug,
    menuTree: menus?.header,
    fallbackMenu: HEADER_FALLBACK_MENU,
    publishedCollectionSlugs: data.publishedCollectionSlugs,
  });
  const parentInfo: ParentCategory | null = deptContext.parent ?? null;
  let subnavPills: DiscoveryPill[] = deptContext.pills;

  if (subnavPills.length === 0 && categories.length > 0) {
    subnavPills = categories.map((cat) => ({
      slug: (cat.url || "").replace(/^\/c\//, "").replace(/^\//, ""),
      label: cat.label,
    }));
  }

  // Meaningful facets extracted dynamically from actual products in this collection
  const baseFacets = extractWeaveFacets(products, collection.slug);

  // Dynamically recalculate facet counts against products matching active price & availability filters
  const candidateProducts = filterCollectionProducts(products, {
    availability: filterAvailability,
    price: filterPrice,
    minPriceBDT,
    maxPriceBDT,
    tags: [],
  });
  const candidateFacetCounts = new Map(
    extractWeaveFacets(candidateProducts, collection.slug).map((f) => [
      f.tag,
      f.count,
    ]),
  );

  const availableFacets: FilterFacetOption[] = baseFacets.map((facet) => ({
    ...facet,
    count: candidateFacetCounts.get(facet.tag) ?? 0,
  }));

  const filteredProducts = filterCollectionProducts(products, {
    availability: filterAvailability,
    price: filterPrice,
    minPriceBDT,
    maxPriceBDT,
    tags: selectedTags,
  });

  const sortedProducts = sortCollectionProducts(filteredProducts, sortBy);
  const displayedProducts = sortedProducts.slice(0, visibleCount);

  const activeFiltersCount =
    (filterAvailability !== "all" ? 1 : 0) +
    (filterPrice !== "all" || minPriceBDT != null || maxPriceBDT != null ? 1 : 0) +
    selectedTags.length;

  const clearAllFilters = () => {
    setFilterAvailability("all");
    setFilterPrice("all");
    setMinPriceBDT(null);
    setMaxPriceBDT(null);
    setMinPriceInput("");
    setMaxPriceInput("");
    setSelectedTags([]);
  };

  const renderFilterControls = (prefix: string) => (
    <div className="space-y-6">
      {/* 1. Weave / Craft / Fabric (if any exist for this collection) */}
      {availableFacets.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
            {t("Weave & Material", "তাঁত ও উপাদান")}
          </h3>
          <ul className="space-y-2">
            {availableFacets.map((facet) => {
              const isChecked = selectedTags.includes(facet.tag);
              const facetLabel =
                lang === "bn" && facet.label_bn ? facet.label_bn : facet.label;
              const id = `${prefix}-facet-${facet.tag}`;
              return (
                <li
                  key={facet.tag}
                  className="flex items-center justify-between text-[13px]"
                >
                  <label
                    htmlFor={id}
                    className="flex items-center gap-2.5 cursor-pointer text-foreground/80 hover:text-foreground select-none"
                  >
                    <input
                      type="checkbox"
                      id={id}
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedTags([...selectedTags, facet.tag]);
                        } else {
                          setSelectedTags(
                            selectedTags.filter((t) => t !== facet.tag),
                          );
                        }
                      }}
                      className="size-4 rounded-xs border-border/80 text-foreground accent-foreground focus:ring-0 cursor-pointer"
                    />
                    <span>{facetLabel}</span>
                  </label>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {facet.count}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 2. Price Range (BDT) */}
      <div className="space-y-3 pt-4 border-t border-border/30">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
          {t("Price Range", "মূল্য সীমা")}
        </h3>
        <ul className="space-y-2">
          {PRICE_OPTIONS.map((opt) => {
            const id = `${prefix}-price-${opt.key}`;
            const isSelected =
              filterPrice === opt.key && minPriceBDT == null && maxPriceBDT == null;
            return (
              <li key={opt.key} className="flex items-center text-[13px]">
                <label
                  htmlFor={id}
                  className="flex items-center gap-2.5 cursor-pointer text-foreground/80 hover:text-foreground select-none"
                >
                  <input
                    type="radio"
                    id={id}
                    name={`${prefix}-price`}
                    checked={isSelected}
                    onChange={() => {
                      setFilterPrice(opt.key);
                      setMinPriceBDT(null);
                      setMaxPriceBDT(null);
                      setMinPriceInput("");
                      setMaxPriceInput("");
                    }}
                    className="size-4 text-foreground accent-foreground focus:ring-0 cursor-pointer"
                  />
                  <span>{lang === "bn" ? opt.bn : opt.en}</span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="pt-2 space-y-1.5">
          <span className="text-[11px] font-medium text-muted-foreground block">
            {t("Custom Range (BDT)", "কাস্টম সীমা (টাকা)")}
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              placeholder="Min ৳"
              value={minPriceInput}
              onChange={(e) => {
                const val = e.target.value;
                setMinPriceInput(val);
                const num = val === "" ? null : Number(val);
                setMinPriceBDT(num != null && !isNaN(num) && num >= 0 ? num : null);
                if (filterPrice !== "all") setFilterPrice("all");
              }}
              className="w-full h-8 px-2 text-xs border border-border/70 rounded-xs bg-background focus:outline-none focus:border-foreground"
            />
            <span className="text-muted-foreground text-xs">–</span>
            <input
              type="number"
              min={0}
              placeholder="Max ৳"
              value={maxPriceInput}
              onChange={(e) => {
                const val = e.target.value;
                setMaxPriceInput(val);
                const num = val === "" ? null : Number(val);
                setMaxPriceBDT(num != null && !isNaN(num) && num >= 0 ? num : null);
                if (filterPrice !== "all") setFilterPrice("all");
              }}
              className="w-full h-8 px-2 text-xs border border-border/70 rounded-xs bg-background focus:outline-none focus:border-foreground"
            />
          </div>
        </div>
      </div>

      {/* 3. Availability */}
      <div className="space-y-3 pt-4 border-t border-border/30">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
          {t("Availability", "উপলব্ধতা")}
        </h3>
        <ul className="space-y-2">
          {AVAILABILITY_OPTIONS.map((opt) => {
            const id = `${prefix}-avail-${opt.key}`;
            const isSelected = filterAvailability === opt.key;
            return (
              <li key={opt.key} className="flex items-center text-[13px]">
                <label
                  htmlFor={id}
                  className="flex items-center gap-2.5 cursor-pointer text-foreground/80 hover:text-foreground select-none"
                >
                  <input
                    type="radio"
                    id={id}
                    name={`${prefix}-avail`}
                    checked={isSelected}
                    onChange={() => setFilterAvailability(opt.key)}
                    className="size-4 text-foreground accent-foreground focus:ring-0 cursor-pointer"
                  />
                  <span>{lang === "bn" ? opt.bn : opt.en}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

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

      {/* ── 3. Merchandising Horizontal Filter & Sort Toolbar ── */}
      <div
        ref={dropdownRef}
        aria-label={t("Filter products", "পণ্য ফিল্টার")}
        className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 mb-8"
      >
        <div className="py-3 border-y border-border/60 sticky top-[64px] bg-background/95 backdrop-blur-xs z-20">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Mobile filter trigger */}
              <button
                onClick={() => setMobileFilterOpen(true)}
                className="lg:hidden flex items-center gap-2 text-[12px] font-medium uppercase tracking-widest text-foreground hover:opacity-70 transition-opacity group cursor-pointer"
              >
                <SlidersHorizontal
                  className="size-[16px] text-foreground/60 group-hover:text-foreground"
                  strokeWidth={1.5}
                />
                {t("Filter", "ফিল্টার")}
                {activeFiltersCount > 0 && (
                  <span className="ml-1 inline-flex size-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Desktop Horizontal Filter Dropdowns */}
              <div className="hidden lg:flex items-center gap-2.5">
                {/* 1. Weave & Material Dropdown */}
                {availableFacets.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenDropdown(
                          openDropdown === "weave" ? null : "weave",
                        )
                      }
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-[12px] font-medium tracking-wide uppercase transition-colors cursor-pointer border ${
                        selectedTags.length > 0
                          ? "bg-foreground text-background border-foreground font-semibold"
                          : "bg-background text-foreground/80 hover:text-foreground border-border/70 hover:border-border"
                      }`}
                    >
                      <span>{t("Weave & Material", "তাঁত ও উপাদান")}</span>
                      {selectedTags.length > 0 && (
                        <span className="size-4 rounded-full bg-background text-foreground text-[10px] font-bold inline-flex items-center justify-center">
                          {selectedTags.length}
                        </span>
                      )}
                      <ChevronDown
                        className={`size-3.5 transition-transform duration-200 ${openDropdown === "weave" ? "rotate-180" : ""}`}
                      />
                    </button>

                    <div
                      className={`absolute top-full left-0 mt-2 w-72 bg-background border border-border/80 shadow-lg p-4 z-40 ${
                        openDropdown === "weave" ? "block" : "hidden"
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/40">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("Select Weave", "তাঁত বাছাই")}
                        </span>
                        {selectedTags.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedTags([])}
                            className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                          >
                            {t("Clear", "মুছুন")}
                          </button>
                        )}
                      </div>
                      <ul className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {availableFacets.map((facet) => {
                          const isChecked = selectedTags.includes(facet.tag);
                          const facetLabel =
                            lang === "bn" && facet.label_bn
                              ? facet.label_bn
                              : facet.label;
                          return (
                            <li
                              key={facet.tag}
                              className="flex items-center justify-between text-[13px]"
                            >
                              <label className="flex items-center gap-2.5 cursor-pointer text-foreground/85 hover:text-foreground select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedTags([
                                        ...selectedTags,
                                        facet.tag,
                                      ]);
                                    } else {
                                      setSelectedTags(
                                        selectedTags.filter(
                                          (t) => t !== facet.tag,
                                        ),
                                      );
                                    }
                                  }}
                                  className="size-4 rounded-xs border-border/80 text-foreground accent-foreground cursor-pointer"
                                />
                                <span>{facetLabel}</span>
                              </label>
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {facet.count}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}

                {/* 2. Price Range Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDropdown(
                        openDropdown === "price" ? null : "price",
                      )
                    }
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-[12px] font-medium tracking-wide uppercase transition-colors cursor-pointer border ${
                      filterPrice !== "all" || minPriceBDT != null || maxPriceBDT != null
                        ? "bg-foreground text-background border-foreground font-semibold"
                        : "bg-background text-foreground/80 hover:text-foreground border-border/70 hover:border-border"
                    }`}
                  >
                    <span>
                      {minPriceBDT != null || maxPriceBDT != null
                        ? minPriceBDT != null && maxPriceBDT != null
                          ? `৳${minPriceBDT.toLocaleString()}–৳${maxPriceBDT.toLocaleString()}`
                          : minPriceBDT != null
                            ? `≥ ৳${minPriceBDT.toLocaleString()}`
                            : `≤ ৳${maxPriceBDT!.toLocaleString()}`
                        : filterPrice === "all"
                          ? t("Price", "মূল্য")
                          : lang === "bn"
                            ? PRICE_OPTIONS.find((o) => o.key === filterPrice)?.bn
                            : PRICE_OPTIONS.find((o) => o.key === filterPrice)?.en}
                    </span>
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-200 ${openDropdown === "price" ? "rotate-180" : ""}`}
                    />
                  </button>

                  <div
                    className={`absolute top-full left-0 mt-2 w-72 bg-background border border-border/80 shadow-lg p-4 z-40 ${
                      openDropdown === "price" ? "block" : "hidden"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/40">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("Price (BDT)", "মূল্য সীমা")}
                      </span>
                      {(filterPrice !== "all" || minPriceBDT != null || maxPriceBDT != null) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFilterPrice("all");
                            setMinPriceBDT(null);
                            setMaxPriceBDT(null);
                            setMinPriceInput("");
                            setMaxPriceInput("");
                          }}
                          className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                        >
                          {t("Reset", "রিসেট")}
                        </button>
                      )}
                    </div>
                    <ul className="space-y-2">
                      {PRICE_OPTIONS.map((opt) => (
                        <li
                          key={opt.key}
                          className="flex items-center text-[13px]"
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer text-foreground/85 hover:text-foreground select-none">
                            <input
                              type="radio"
                              name="desktop-toolbar-price"
                              checked={
                                filterPrice === opt.key &&
                                minPriceBDT == null &&
                                maxPriceBDT == null
                              }
                              onChange={() => {
                                setFilterPrice(opt.key);
                                setMinPriceBDT(null);
                                setMaxPriceBDT(null);
                                setMinPriceInput("");
                                setMaxPriceInput("");
                                setOpenDropdown(null);
                              }}
                              className="size-4 text-foreground accent-foreground cursor-pointer"
                            />
                            <span>{lang === "bn" ? opt.bn : opt.en}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    <div className="pt-3 mt-3 border-t border-border/40 space-y-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                        {t("Custom Range (BDT)", "কাস্টম সীমা (টাকা)")}
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          placeholder="Min ৳"
                          value={minPriceInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMinPriceInput(val);
                            const num = val === "" ? null : Number(val);
                            setMinPriceBDT(
                              num != null && !isNaN(num) && num >= 0
                                ? num
                                : null,
                            );
                            if (filterPrice !== "all") setFilterPrice("all");
                          }}
                          className="w-full h-8 px-2 text-xs border border-border/70 rounded-xs bg-background focus:outline-none focus:border-foreground"
                        />
                        <span className="text-muted-foreground text-xs">–</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="Max ৳"
                          value={maxPriceInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMaxPriceInput(val);
                            const num = val === "" ? null : Number(val);
                            setMaxPriceBDT(
                              num != null && !isNaN(num) && num >= 0
                                ? num
                                : null,
                            );
                            if (filterPrice !== "all") setFilterPrice("all");
                          }}
                          className="w-full h-8 px-2 text-xs border border-border/70 rounded-xs bg-background focus:outline-none focus:border-foreground"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Availability Dropdown */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenDropdown(
                        openDropdown === "avail" ? null : "avail",
                      )
                    }
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 text-[12px] font-medium tracking-wide uppercase transition-colors cursor-pointer border ${
                      filterAvailability !== "all"
                        ? "bg-foreground text-background border-foreground font-semibold"
                        : "bg-background text-foreground/80 hover:text-foreground border-border/70 hover:border-border"
                    }`}
                  >
                    <span>
                      {filterAvailability === "all"
                        ? t("Availability", "উপলব্ধতা")
                        : lang === "bn"
                          ? AVAILABILITY_OPTIONS.find(
                              (o) => o.key === filterAvailability,
                            )?.bn
                          : AVAILABILITY_OPTIONS.find(
                              (o) => o.key === filterAvailability,
                            )?.en}
                    </span>
                    <ChevronDown
                      className={`size-3.5 transition-transform duration-200 ${openDropdown === "avail" ? "rotate-180" : ""}`}
                    />
                  </button>

                  <div
                    className={`absolute top-full left-0 mt-2 w-56 bg-background border border-border/80 shadow-lg p-4 z-40 ${
                      openDropdown === "avail" ? "block" : "hidden"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-border/40">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("Availability", "উপলব্ধতা")}
                      </span>
                      {filterAvailability !== "all" && (
                        <button
                          type="button"
                          onClick={() => setFilterAvailability("all")}
                          className="text-[11px] text-muted-foreground hover:text-foreground underline cursor-pointer"
                        >
                          {t("Reset", "রিসেট")}
                        </button>
                      )}
                    </div>
                    <ul className="space-y-2">
                      {AVAILABILITY_OPTIONS.map((opt) => (
                        <li
                          key={opt.key}
                          className="flex items-center text-[13px]"
                        >
                          <label className="flex items-center gap-2.5 cursor-pointer text-foreground/85 hover:text-foreground select-none">
                            <input
                              type="radio"
                              name="desktop-toolbar-avail"
                              checked={filterAvailability === opt.key}
                              onChange={() => {
                                setFilterAvailability(opt.key);
                                setOpenDropdown(null);
                              }}
                              className="size-4 text-foreground accent-foreground cursor-pointer"
                            />
                            <span>{lang === "bn" ? opt.bn : opt.en}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 cursor-pointer"
                  >
                    {t("Clear all", "সব মুছুন")}
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-foreground/60">
                {sortedProducts.length}{" "}
                {sortedProducts.length === 1
                  ? t("Product", "পণ্য")
                  : t("Products", "পণ্যসমূহ")}
              </div>

              <div className="relative inline-flex items-center">
                <span className="hidden sm:inline text-[12px] text-foreground/50 mr-2 uppercase tracking-widest">
                  {t("Sort:", "বাছাই:")}
                </span>
                <select
                  aria-label={t("Sort collection", "কালেকশন সাজান")}
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(
                      e.target.value as
                        "featured" | "price_asc" | "price_desc" | "title",
                    )
                  }
                  className="appearance-none bg-transparent pr-5 py-1 text-[12px] font-medium uppercase tracking-widest text-foreground hover:opacity-70 transition-opacity cursor-pointer focus:outline-hidden"
                >
                  <option
                    value="featured"
                    className="bg-background text-foreground"
                  >
                    {t("Featured", "সেরা")}
                  </option>
                  <option
                    value="price_asc"
                    className="bg-background text-foreground"
                  >
                    {t("Price: Low to High", "মূল্য: কম থেকে বেশি")}
                  </option>
                  <option
                    value="price_desc"
                    className="bg-background text-foreground"
                  >
                    {t("Price: High to Low", "মূল্য: বেশি থেকে কম")}
                  </option>
                  <option
                    value="title"
                    className="bg-background text-foreground"
                  >
                    {t("Name: A to Z", "নাম: ক থেকে জ্ঞ")}
                  </option>
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-0 size-[14px] text-foreground/60"
                  strokeWidth={1.5}
                />
              </div>
            </div>
          </div>

          {/* Active filter chips */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-border/20">
              {selectedTags.map((tag) => {
                const facet = availableFacets.find((f) => f.tag === tag);
                const label =
                  lang === "bn" && facet?.label_bn
                    ? facet.label_bn
                    : (facet?.label ?? tag);
                return (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/40"
                  >
                    {label}
                    <button
                      onClick={() =>
                        setSelectedTags(selectedTags.filter((t) => t !== tag))
                      }
                      className="hover:opacity-70 p-0.5 cursor-pointer"
                      aria-label={`Remove ${label} filter`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}

              {filterPrice !== "all" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/40">
                  {lang === "bn"
                    ? PRICE_OPTIONS.find((o) => o.key === filterPrice)?.bn
                    : PRICE_OPTIONS.find((o) => o.key === filterPrice)?.en}
                  <button
                    onClick={() => setFilterPrice("all")}
                    className="hover:opacity-70 p-0.5 cursor-pointer"
                    aria-label="Remove price filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {(minPriceBDT != null || maxPriceBDT != null) && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/40">
                  {minPriceBDT != null && maxPriceBDT != null
                    ? `৳${minPriceBDT.toLocaleString()} – ৳${maxPriceBDT.toLocaleString()}`
                    : minPriceBDT != null
                      ? `≥ ৳${minPriceBDT.toLocaleString()}`
                      : `≤ ৳${maxPriceBDT!.toLocaleString()}`}
                  <button
                    onClick={() => {
                      setMinPriceBDT(null);
                      setMaxPriceBDT(null);
                      setMinPriceInput("");
                      setMaxPriceInput("");
                    }}
                    className="hover:opacity-70 p-0.5 cursor-pointer"
                    aria-label="Remove price filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              {filterAvailability !== "all" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-foreground border border-border/40">
                  {lang === "bn"
                    ? AVAILABILITY_OPTIONS.find(
                        (o) => o.key === filterAvailability,
                      )?.bn
                    : AVAILABILITY_OPTIONS.find(
                        (o) => o.key === filterAvailability,
                      )?.en}
                  <button
                    onClick={() => setFilterAvailability("all")}
                    className="hover:opacity-70 p-0.5 cursor-pointer"
                    aria-label="Remove availability filter"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              )}

              <button
                onClick={clearAllFilters}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 ml-1 cursor-pointer"
              >
                {t("Clear all", "সব মুছুন")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Full-Width Merchandising Product Grid ── */}
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10">
        <div className="w-full">
          {sortedProducts.length === 0 ? (
            <div className="py-20 text-center space-y-4">
              <p className="text-muted-foreground text-[15px]">
                {products.length === 0
                  ? t(
                      "No products in this collection yet.",
                      "এই কালেকশনে এখনো কোনো পণ্য নেই।",
                    )
                  : t(
                      "No products match your selected filters.",
                      "বাছাইকৃত ফিল্টারে কোনো পণ্য পাওয়া যায়নি।",
                    )}
              </p>
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="px-6 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-background bg-foreground hover:bg-foreground/90 transition-colors cursor-pointer"
                >
                  {t("Clear all filters", "সব ফিল্টার মুছুন")}
                </button>
              )}
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:gap-x-6 sm:gap-y-12">
                  {displayedProducts.map((p) => {
                    const info = resolveProductPricingAndStock(p);
                    const min = info.priceMinMinor;
                    const inStock = info.inStock;

                    // NEW / BESTSELLER assigned from product data (tags/attributes), never by collection slug
                    const pTags = ((p as { tags?: string[] }).tags ?? []).map(
                      (t) => t.toLowerCase(),
                    );
                    let badge: string | null = null;
                    if (
                      pTags.includes("new") ||
                      pTags.includes("new-in") ||
                      pTags.includes("new-arrival")
                    ) {
                      badge = "NEW";
                    } else if (
                      pTags.includes("bestseller") ||
                      pTags.includes("best-seller") ||
                      pTags.includes("trending")
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

                {sortedProducts.length > displayedProducts.length && (
                  <div className="mt-16 text-center">
                    <button
                      onClick={() => setVisibleCount((prev) => prev + 12)}
                      className="px-10 py-3.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-foreground border border-foreground/20 hover:border-foreground/40 transition-colors bg-transparent cursor-pointer"
                    >
                      {t("Load More", "আরো দেখুন")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      {/* ── 5. Compact Mobile Filter Sheet (Immediate updates, no Apply buffering) ── */}
      {mobileFilterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileFilterOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 w-full max-w-[340px] bg-background z-50 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-border/40">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-foreground">
                {t("Filters", "ফিল্টার")}
                {activeFiltersCount > 0 && ` (${activeFiltersCount})`}
              </h2>
              <button
                onClick={() => setMobileFilterOpen(false)}
                className="text-foreground/60 hover:text-foreground transition-colors p-2 -mr-2 cursor-pointer"
                aria-label="Close filters"
              >
                <X className="size-[20px]" strokeWidth={1.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {renderFilterControls("mobile")}
            </div>

            <div className="p-4 border-t border-border/40 grid grid-cols-2 gap-3 bg-muted/10">
              <button
                onClick={clearAllFilters}
                disabled={activeFiltersCount === 0}
                className="w-full py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground border border-foreground/20 hover:border-foreground/40 disabled:opacity-40 transition-colors bg-transparent cursor-pointer"
              >
                {t("Clear All", "মুছে ফেলুন")}
              </button>
              <button
                onClick={() => setMobileFilterOpen(false)}
                className="w-full py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-background bg-foreground hover:bg-foreground/90 transition-colors cursor-pointer"
              >
                {t(
                  `Show ${sortedProducts.length} Products`,
                  `${sortedProducts.length}টি পণ্য দেখুন`,
                )}
              </button>
            </div>
          </div>
        </div>
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
  // result_toolbar (ROUTE_REPLACED in preview-safety contract). Filter them and
  // any generic announcement bars, breadcrumbs, and product rails from the theme
  // AST to guarantee a clean, spacious editorial fashion landing page.
  const cleanAst = dynamicAst
    ? {
        ...dynamicAst,
        main: dynamicAst.main.filter(
          (s) =>
            s.type !== "category_header" &&
            s.type !== "result_toolbar" &&
            s.type !== "announcement_bar" &&
            s.type !== "breadcrumb" &&
            s.type !== "product_rail",
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
            showAnnouncement={false}
            supportEmail={settings?.support_email}
          />
        }
        productSlot={grid}
        {...(hasProductGrid ? {} : { collectionSlot: grid })}
        fallback={grid}
      />
    </PluginLayer>
  );
}
