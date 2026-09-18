/**
 * `/dashboard` navigation model — one declaration, three consumers.
 *
 * The shell renders it, the route gate refuses what the actor may not see, and
 * the command palette searches it. Permissions here are *affordances only*:
 * the server function behind every page still enforces `requirePermission`.
 */

import type { Permission } from "./authz";

export type IconKey =
  | "dashboard"
  | "analytics"
  | "orders"
  | "products"
  | "catalog"
  | "pages"
  | "collections"
  | "builder"
  | "pos"
  | "shipping"
  | "inventory"
  | "returns"
  | "gift"
  | "bundles"
  | "carts"
  | "customers"
  | "receipt"
  | "pricing"
  | "purchasing"
  | "subscriptions"
  | "tags"
  | "categories"
  | "marketing"
  | "ticket"
  | "users"
  | "send"
  | "articles"
  | "media"
  | "seo"
  | "marketplace"
  | "fraud"
  | "infra"
  | "ai"
  | "support"
  | "exports"
  | "apikeys"
  | "developers"
  | "rails"
  | "domains"
  | "security"
  | "plans"
  | "staff"
  | "approvals"
  | "activity"
  | "settings";

export type NavItem = {
  to: string;
  en: string;
  bn: string;
  icon: IconKey;
  /** Grant needed to see this destination. Absent = any active member. */
  permission?: Permission;
};

export type NavGroup = {
  key: string;
  en: string;
  bn: string;
  icon: IconKey;
  /** Where the top-level row navigates. Defaults to the first child. */
  to?: string;
  /** Primary tabs of the section — never more than five. */
  items: NavItem[];
  /** Secondary destinations of the same section, shown under a "More" menu. */
  more?: NavItem[];
};

/**
 * Eight sections, each with at most five tabs (Phase 5 of the console
 * redesign). Everything that used to own a sidebar row now lives as a tab of
 * the section it belongs to, or under that section's "More" menu; see
 * `docs/02-merchant/console-route-audit.md` for the full mapping.
 */
export const ADMIN_NAV: readonly NavGroup[] = [
  {
    key: "dashboard",
    en: "Dashboard",
    bn: "ড্যাশবোর্ড",
    icon: "dashboard",
    to: "/dashboard",
    items: [
      { to: "/dashboard", en: "Home", bn: "হোম", icon: "dashboard" },
      {
        to: "/dashboard/analytics",
        en: "Analytics",
        bn: "অ্যানালিটিক্স",
        icon: "analytics",
        permission: "analytics.read",
      },
      {
        to: "/dashboard/exports",
        en: "Exports",
        bn: "এক্সপোর্ট",
        icon: "exports",
        permission: "analytics.export",
      },
      {
        to: "/dashboard/experiments",
        en: "Experiments",
        bn: "এক্সপেরিমেন্ট",
        icon: "analytics",
        permission: "marketing.read",
      },
    ],
  },
  {
    key: "orders",
    en: "Orders",
    bn: "অর্ডার",
    icon: "orders",
    to: "/dashboard/orders",
    items: [
      {
        to: "/dashboard/orders",
        en: "All orders",
        bn: "সব অর্ডার",
        icon: "orders",
        permission: "orders.read",
      },
      {
        to: "/dashboard/returns",
        en: "Returns",
        bn: "রিটার্ন",
        icon: "returns",
        permission: "orders.read",
      },
      {
        to: "/dashboard/draft-orders",
        en: "Drafts",
        bn: "ড্রাফট",
        icon: "receipt",
        permission: "orders.read",
      },
      {
        to: "/dashboard/carts",
        en: "Abandoned",
        bn: "পরিত্যক্ত কার্ট",
        icon: "carts",
        permission: "orders.read",
      },
      {
        to: "/dashboard/shipping",
        en: "Shipping",
        bn: "শিপিং",
        icon: "shipping",
        permission: "shipping.read",
      },
    ],
    more: [{ to: "/dashboard/pos", en: "POS till", bn: "পিওএস", icon: "pos", permission: "pos.read" }],
  },
  {
    key: "products",
    en: "Products",
    bn: "পণ্য",
    icon: "products",
    to: "/dashboard/products",
    items: [
      {
        to: "/dashboard/products",
        en: "All products",
        bn: "সব পণ্য",
        icon: "products",
        permission: "catalog.read",
      },
      {
        to: "/dashboard/inventory",
        en: "Inventory",
        bn: "ইনভেন্টরি",
        icon: "inventory",
        permission: "inventory.read",
      },
      {
        to: "/dashboard/categories",
        en: "Organisation",
        bn: "সংগঠন",
        icon: "categories",
        permission: "catalog.read",
      },
      {
        to: "/dashboard/pricing",
        en: "Pricing",
        bn: "প্রাইসিং",
        icon: "pricing",
        permission: "catalog.read",
      },
    ],
    more: [
      {
        to: "/dashboard/collections",
        en: "Collections",
        bn: "কালেকশন",
        icon: "collections",
        permission: "catalog.read",
      },
      {
        to: "/dashboard/brands",
        en: "Brands",
        bn: "ব্র্যান্ড",
        icon: "tags",
        permission: "catalog.read",
      },
      {
        to: "/dashboard/bundles",
        en: "Bundles",
        bn: "বান্ডল",
        icon: "bundles",
        permission: "catalog.read",
      },
      {
        to: "/dashboard/subscriptions",
        en: "Subscriptions",
        bn: "সাবস্ক্রিপশন",
        icon: "subscriptions",
        permission: "catalog.read",
      },
      {
        to: "/dashboard/purchasing",
        en: "Purchasing",
        bn: "ক্রয়",
        icon: "purchasing",
        permission: "inventory.read",
      },
      {
        to: "/dashboard/bulk-editor",
        en: "Bulk editor",
        bn: "বাল্ক এডিটর",
        icon: "catalog",
        permission: "catalog.update",
      },
      {
        to: "/dashboard/catalog",
        en: "Catalog settings",
        bn: "ক্যাটালগ সেটিংস",
        icon: "catalog",
        permission: "catalog.read",
      },
    ],
  },
  {
    key: "customers",
    en: "Customers",
    bn: "ক্রেতা",
    icon: "customers",
    to: "/dashboard/customers",
    items: [
      {
        to: "/dashboard/customers",
        en: "All customers",
        bn: "সব ক্রেতা",
        icon: "customers",
        permission: "customers.read",
      },
      {
        to: "/dashboard/support",
        en: "Support",
        bn: "সাপোর্ট",
        icon: "support",
        permission: "customers.read",
      },
      {
        to: "/dashboard/reviews",
        en: "Reviews",
        bn: "রিভিউ",
        icon: "customers",
        permission: "customers.read",
      },
    ],
    more: [
      {
        to: "/dashboard/ai/assistant",
        en: "AI assistant",
        bn: "AI সহায়তা",
        icon: "ai",
        permission: "customers.read",
      },
    ],
  },
  {
    key: "content",
    en: "Content",
    bn: "কনটেন্ট",
    icon: "pages",
    to: "/dashboard/content/pages",
    items: [
      {
        to: "/dashboard/content/pages",
        en: "Pages",
        bn: "পেজ",
        icon: "pages",
        permission: "marketing.read",
      },
      {
        to: "/dashboard/content/posts",
        en: "Posts",
        bn: "পোস্ট",
        icon: "articles",
        permission: "marketing.read",
      },
      {
        to: "/dashboard/content/media",
        en: "Media",
        bn: "মিডিয়া",
        icon: "media",
        permission: "marketing.read",
      },
    ],
  },
  {
    key: "appearance",
    en: "Appearance",
    bn: "অ্যাপিয়ারেন্স",
    icon: "builder",
    to: "/dashboard/content/themes",
    items: [
      {
        to: "/dashboard/content/themes",
        en: "Themes",
        bn: "থিম",
        icon: "marketplace",
        permission: "themes.read",
      },
      {
        to: "/dashboard/builder",
        en: "Customize",
        bn: "কাস্টমাইজ",
        icon: "builder",
        permission: "themes.read",
      },
      {
        to: "/dashboard/content/menus",
        en: "Menus",
        bn: "মেনু",
        icon: "categories",
        permission: "marketing.read",
      },
    ],
  },
  {
    key: "plugins",
    en: "Plugins",
    bn: "প্লাগইন",
    icon: "catalog",
    to: "/dashboard/plugins",
    items: [
      {
        to: "/dashboard/plugins",
        en: "Installed Plugins",
        bn: "ইনস্টল করা প্লাগইন",
        icon: "infra",
        permission: "themes.read",
      },
      {
        to: "/dashboard/plugins/new",
        en: "Add New",
        bn: "নতুন প্লাগইন",
        icon: "marketplace",
        permission: "themes.read",
      },
    ],
  },
  {
    key: "marketing",
    en: "Marketing",
    bn: "মার্কেটিং",
    icon: "marketing",
    to: "/dashboard/marketing/campaigns",
    items: [
      {
        to: "/dashboard/marketing/campaigns",
        en: "Campaigns",
        bn: "ক্যাম্পেইন",
        icon: "send",
        permission: "marketing.read",
      },
      {
        to: "/dashboard/marketing/coupons",
        en: "Discounts",
        bn: "ডিসকাউন্ট",
        icon: "marketing",
        permission: "marketing.read",
      },
      {
        to: "/dashboard/marketing/subscribers",
        en: "Audience",
        bn: "সাবস্ক্রাইবার",
        icon: "users",
        permission: "marketing.read",
      },
    ],
    more: [
      {
        to: "/dashboard/gift-cards",
        en: "Gift cards",
        bn: "গিফট কার্ড",
        icon: "gift",
        permission: "marketing.read",
      },
      {
        to: "/dashboard/marketing/codes",
        en: "Code batches",
        bn: "কোড ব্যাচ",
        icon: "ticket",
        permission: "marketing.read",
      },
    ],
  },
  {
    key: "money",
    en: "Money",
    bn: "অর্থ",
    icon: "receipt",
    to: "/dashboard/payments",
    items: [
      {
        to: "/dashboard/payments",
        en: "Payments",
        bn: "পেমেন্ট",
        icon: "receipt",
        permission: "finance.read",
      },
      {
        to: "/dashboard/billing/invoices",
        en: "Invoices",
        bn: "ইনভয়েস",
        icon: "receipt",
        permission: "finance.read",
      },
      {
        to: "/dashboard/plans",
        en: "Plan & billing",
        bn: "প্ল্যান",
        icon: "plans",
        permission: "finance.read",
      },
      { to: "/dashboard/fraud", en: "Risk", bn: "ঝুঁকি", icon: "fraud", permission: "fraud.read" },
      {
        to: "/dashboard/settings/providers",
        en: "Payment rails",
        bn: "পেমেন্ট রেইল",
        icon: "rails",
        permission: "settings.read",
      },
    ],
    more: [
      {
        to: "/dashboard/fraud/ad-defense",
        en: "Ad defense",
        bn: "বিজ্ঞাপন সুরক্ষা",
        icon: "fraud",
        permission: "fraud.read",
      },
    ],
  },
  {
    key: "settings",
    en: "Settings",
    bn: "সেটিংস",
    icon: "settings",
    to: "/dashboard/settings",
    items: [
      {
        to: "/dashboard/settings",
        en: "General",
        bn: "সাধারণ",
        icon: "settings",
        permission: "settings.read",
      },
      { to: "/dashboard/staff", en: "Staff", bn: "স্টাফ", icon: "staff", permission: "staff.read" },
      {
        to: "/dashboard/settings/domains",
        en: "Domains",
        bn: "ডোমেইন",
        icon: "domains",
        permission: "settings.read",
      },
      {
        to: "/dashboard/settings/security",
        en: "Security",
        bn: "নিরাপত্তা",
        icon: "security",
        permission: "settings.read",
      },
      {
        to: "/dashboard/settings/seo",
        en: "SEO",
        bn: "এসইও",
        icon: "settings",
        permission: "settings.read",
      },
    ],
    more: [
      {
        to: "/dashboard/developers",
        en: "Developers",
        bn: "ডেভেলপার",
        icon: "developers",
        permission: "apikeys.read",
      },
      {
        to: "/dashboard/approvals",
        en: "Approvals",
        bn: "অনুমোদন",
        icon: "approvals",
        permission: "staff.read",
      },

      {
        to: "/dashboard/settings/api",
        en: "API keys",
        bn: "API কী",
        icon: "apikeys",
        permission: "apikeys.read",
      },
      {
        to: "/dashboard/settings/infrastructure",
        en: "Infrastructure",
        bn: "ইনফ্রাস্ট্রাকচার",
        icon: "infra",
        permission: "settings.read",
      },
      {
        to: "/dashboard/ai/settings",
        en: "AI Gateway",
        bn: "এআই গেটওয়ে",
        icon: "ai",
        permission: "settings.read",
      },
    ],
  },
];

/**
 * Destinations that live inside a section's pages rather than its tab strip
 * (detail views, sub-panels). They keep their permission so the route gate
 * stays as strict as before.
 */
export const HIDDEN_DESTINATIONS: readonly NavItem[] = [
  {
    to: "/dashboard/products/new",
    en: "New product",
    bn: "নতুন পণ্য",
    icon: "products",
    permission: "catalog.update",
  },
  {
    to: "/dashboard/fraud/audit",
    en: "Risk audit",
    bn: "ঝুঁকি অডিট",
    icon: "fraud",
    permission: "fraud.read",
  },
  {
    to: "/dashboard/marketplace/creator",
    en: "Creator studio",
    bn: "ক্রিয়েটর",
    icon: "marketplace",
    permission: "themes.read",
  },
  {
    to: "/dashboard/marketplace/versions",
    en: "App versions",
    bn: "ভার্সন",
    icon: "marketplace",
    permission: "themes.read",
  },
];

export function flattenNav(groups: readonly NavGroup[] = ADMIN_NAV): NavItem[] {
  return groups.flatMap((g) => [...g.items, ...(g.more ?? [])]);
}

/** Hides destinations the actor cannot use; drops groups left empty. */
export function filterNav(
  groups: readonly NavGroup[],
  allowed: (permission?: Permission) => boolean,
): NavGroup[] {
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => allowed(i.permission)),
      more: (g.more ?? []).filter((i) => allowed(i.permission)),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * The permission guarding a pathname, taken from the longest matching
 * destination. Used by the route gate when a route declares no `staticData`.
 */
export function permissionForPath(pathname: string): Permission | null {
  let best: NavItem | null = null;
  for (const item of [...flattenNav(), ...HIDDEN_DESTINATIONS]) {
    if (item.to === "/dashboard") continue;
    if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  return best?.permission ?? null;
}

export function isNavActive(pathname: string, to: string): boolean {
  return to === "/dashboard" ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}
