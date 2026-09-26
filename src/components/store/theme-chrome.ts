/**
 * Theme-chrome port for the shared storefront header (Theme Independence Task 3).
 *
 * Per-key header config with a generic default. `StoreHeader` consumes this
 * port instead of branching on a theme slug, so shared chrome holds zero
 * per-theme conditionals. The songoskriti key registers its chrome here as
 * data (menu tree + logo reference); this module imports no theme-template
 * code — only the shared menu helpers and shared components' contracts.
 */
import {
  selectMobileMenu,
  type MenuNode,
  type StoreMenus,
} from "@/lib/menus/menu";

/** Minimal structural menu node for chrome config (label/url/template link). */
export interface ChromeMenuNode {
  id: string;
  label: string;
  url?: string;
  titleAttr?: string;
  newTab?: boolean;
  image?: string;
  children?: ChromeMenuNode[];
}

/**
 * Songoskriti mega-menu tree. Lives here (not in a theme folder) because it
 * is referenced by shared chrome; owned by the theme-chrome port, not by any
 * theme template module.
 */
export const SONGOSKRITI_MEGA_MENU: ChromeMenuNode[] = [
  {
    id: "women",
    label: "Women",
    url: "/c/women",
    image: "/ph/songoskriti/cat-women.png",
    children: [
      {
        id: "w-sarees",
        label: "Sarees",
        url: "/c/sarees",
        children: [
          { id: "ws-jamdani", label: "Jamdani", url: "/c/jamdani" },
          { id: "ws-tangail", label: "Tangail", url: "/c/tangail" },
          { id: "ws-muslin", label: "Muslin", url: "/c/muslin" },
          { id: "ws-silk", label: "Silk", url: "/c/silk" },
          { id: "ws-handloom", label: "Handloom", url: "/c/handloom" },
          { id: "ws-cotton", label: "Cotton", url: "/c/cotton" },
          { id: "ws-festive", label: "Festive Sarees", url: "/c/festive" },
        ],
      },
      {
        id: "w-occasion",
        label: "Occasion",
        url: "/c/occasion",
        children: [
          { id: "wo-eid", label: "Eid", url: "/c/eid" },
          { id: "wo-wedding", label: "Wedding", url: "/c/wedding" },
          { id: "wo-everyday", label: "Everyday", url: "/c/everyday" },
          { id: "wo-party", label: "Party", url: "/c/party" },
        ],
      },
      {
        id: "w-featured",
        label: "Featured",
        url: "/c/featured",
        children: [
          { id: "wf-new", label: "New Arrivals", url: "/c/new-in" },
          { id: "wf-best", label: "Bestsellers", url: "/c/bestsellers" },
        ],
      },
    ],
  },
  {
    id: "men",
    label: "Men",
    url: "/c/men",
    image: "/ph/songoskriti/cat-men.png",
    children: [
      {
        id: "m-panjabi",
        label: "Panjabi",
        url: "/c/panjabi",
        children: [
          {
            id: "mp-premium",
            label: "Premium Panjabi",
            url: "/c/premium-panjabi",
          },
          { id: "mp-silk", label: "Silk", url: "/c/silk-panjabi" },
          { id: "mp-handloom", label: "Handloom", url: "/c/handloom-panjabi" },
          { id: "mp-festive", label: "Festive", url: "/c/festive-panjabi" },
          { id: "mp-casual", label: "Casual", url: "/c/casual-panjabi" },
        ],
      },
      {
        id: "m-sets",
        label: "Sets",
        url: "/c/sets",
        children: [
          { id: "ms-set", label: "Panjabi & Pajama", url: "/c/panjabi-sets" },
          { id: "ms-family", label: "Family Matching", url: "/c/family" },
        ],
      },
    ],
  },
  {
    id: "kids",
    label: "Kids",
    url: "/c/kids",
    image: "/ph/songoskriti/cat-kids.png",
    children: [
      {
        id: "k-boys",
        label: "Boys",
        url: "/c/boys",
        children: [
          { id: "kb-panjabi", label: "Panjabi", url: "/c/boys-panjabi" },
          { id: "kb-sets", label: "Sets", url: "/c/boys-sets" },
        ],
      },
      {
        id: "k-girls",
        label: "Girls",
        url: "/c/girls",
        children: [
          { id: "kg-saree", label: "Sarees", url: "/c/girls-sarees" },
          { id: "kg-dresses", label: "Dresses", url: "/c/girls-dresses" },
          { id: "kg-lehenga", label: "Lehengas", url: "/c/girls-lehengas" },
        ],
      },
    ],
  },
  {
    id: "collections",
    label: "Collections",
    url: "/c",
    image: "/ph/songoskriti/hero-weaves.png",
    children: [
      {
        id: "c-featured",
        label: "Featured",
        url: "/c/featured",
        children: [
          {
            id: "cf-signature",
            label: "Signature Sarees",
            url: "/c/signature",
          },
          {
            id: "cf-modern",
            label: "The Modern Panjabi",
            url: "/c/modern-panjabi",
          },
          { id: "cf-everyday", label: "Everyday Heritage", url: "/c/everyday" },
        ],
      },
    ],
  },
  {
    id: "festive",
    label: "Festive",
    url: "/c/festive",
    image: "/ph/songoskriti/hero-festive.png",
    children: [
      {
        id: "f-occ",
        label: "Occasions",
        url: "/c/festive",
        children: [
          { id: "fo-eid", label: "Eid", url: "/c/eid" },
          { id: "fo-wedding", label: "Wedding", url: "/c/wedding" },
          { id: "fo-mehendi", label: "Mehendi", url: "/c/mehendi" },
          { id: "fo-sangeet", label: "Sangeet", url: "/c/sangeet" },
          { id: "fo-puja", label: "Puja", url: "/c/puja" },
          { id: "fo-gifting", label: "Gifting", url: "/c/gifting" },
        ],
      },
    ],
  },
  {
    id: "heritage",
    label: "Heritage",
    url: "/c/heritage",
    image: "/ph/songoskriti/hero-artisans.png",
    children: [
      {
        id: "h-weaves",
        label: "Weaves & Craft",
        url: "/c/heritage",
        children: [
          { id: "hw-jamdani", label: "Jamdani", url: "/c/jamdani" },
          { id: "hw-tangail", label: "Tangail", url: "/c/tangail" },
          { id: "hw-silk", label: "Rajshahi Silk", url: "/c/silk" },
          { id: "hw-kantha", label: "Nakshi Kantha", url: "/c/kantha" },
          { id: "hw-handloom", label: "Handloom", url: "/c/handloom" },
          {
            id: "hw-artisan",
            label: "Artisan Stories",
            url: "/blog/artisan-story",
          },
        ],
      },
    ],
  },
  {
    id: "new-in",
    label: "New Arrivals",
    url: "/c/new-in",
    image: "/ph/songoskriti/cat-newin.png",
    children: [],
  },
];

export type HeaderLogoKind = "lockup" | "text";
export type HeaderMenuVariant = "mega" | "dropdown";
export type HeaderTogglePlacement = "announcement" | "utility";

export interface HeaderChromeConfig {
  /** "lockup" renders the registered image mark; "text" the store name. */
  logoKind: HeaderLogoKind;
  logoSrc: string | null;
  logoAlt: string;
  textLogoHidden: boolean;
  /** Token-only color class for the text logo (never raw hex). */
  textLogoClass: string;
  /** "mega" renders the full-width 3-level panel; "dropdown" the compact menu. */
  menuVariant: HeaderMenuVariant;
  /** Where the language toggle lives on this chrome. */
  togglePlacement: HeaderTogglePlacement;
  showAnnouncement: boolean;
  /** Per-key menu override; null falls back to the merchant's menus prop. */
  themeMenu: ChromeMenuNode[] | null;
}

export const GENERIC_HEADER_CHROME: HeaderChromeConfig = {
  logoKind: "text",
  logoSrc: null,
  logoAlt: "",
  textLogoHidden: false,
  textLogoClass: "text-foreground",
  menuVariant: "dropdown",
  togglePlacement: "utility",
  showAnnouncement: false,
  themeMenu: null,
};

const HEADER_CHROME_REGISTRY: Record<string, HeaderChromeConfig> = {
  songoskriti: {
    logoKind: "lockup",
    logoSrc: "/ph/songoskriti/logo-lockup.svg",
    logoAlt: "Songoskriti",
    textLogoHidden: true,
    textLogoClass: "text-foreground",
    menuVariant: "mega",
    togglePlacement: "announcement",
    showAnnouncement: true,
    themeMenu: SONGOSKRITI_MEGA_MENU,
  },
};

/**
 * Resolve the header chrome for a storefront. Matches the slug first, then
 * the display name (case-insensitive); anything unregistered gets the
 * generic default. Callers never branch on a theme key themselves.
 */
export function resolveHeaderConfig(
  slug: string,
  name?: string | null,
): HeaderChromeConfig {
  const keys = [slug, name ?? ""].map((s) => s.trim().toLowerCase());
  for (const key of keys) {
    if (!key) continue;
    const hit = HEADER_CHROME_REGISTRY[key];
    if (hit) return hit;
  }
  return GENERIC_HEADER_CHROME;
}

/** Resolve header/mobile menus: per-key override wins, else the menus prop. */
export function resolveHeaderMenus(
  config: HeaderChromeConfig,
  menus?: Pick<StoreMenus, "header" | "mobile"> | null,
): { headerMenu: MenuNode[]; mobileMenu: MenuNode[] } {
  if (config.themeMenu) {
    const themed = config.themeMenu as unknown as MenuNode[];
    return { headerMenu: themed, mobileMenu: themed };
  }
  return {
    headerMenu: menus?.header ?? [],
    mobileMenu: menus ? selectMobileMenu(menus) : [],
  };
}
