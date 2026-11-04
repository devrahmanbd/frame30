/**
 * Shared header fallback copy — single source of truth.
 *
 * Mirrors the `footer-copy.ts` precedent: values ship verbatim (the
 * fallback mega-menu tree, its বাংলা twin table, the logo lockup, and
 * the announcement-bar copy), but the module lives outside `themes/` on
 * purpose. Shared chrome (`components/store/theme-chrome.ts`) is forbidden
 * from importing theme-specific modules, so shared fallback copy lives
 * here and theme lookups resolve through neutral names.
 *
 * `DEFAULT_HEADER_CHROME_KEY` names the theme whose verbatim fallback
 * ships as the shared default. The key-driven lookup in `theme-chrome.ts`
 * references only this constant, so shared chrome names no theme and
 * imports no theme module — the binding is data, not a branch.
 *
 * Data only: no React, no network. Bilingual EN/BN ships inline via
 * explicit `_bn` props so no dictionary entry is required.
 */
export const DEFAULT_HEADER_CHROME_KEY = "songoskriti" as const;

export const HEADER_FALLBACK_MENU = [
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
          { id: "ws-jamdani", label: "Dhakai Jamdani", url: "/c/jamdani" },
          {
            id: "ws-handloom",
            label: "Heritage Handloom",
            url: "/c/heritage-handloom",
          },
          { id: "ws-festive", label: "Festive Sarees", url: "/c/festive" },
          { id: "ws-all", label: "All Sarees", url: "/c/sarees" },
        ],
      },
      {
        id: "w-occasion",
        label: "Occasion",
        url: "/c/festive",
        children: [
          { id: "wo-eid", label: "Eid & Festive", url: "/c/eid-festive" },
          { id: "wo-wedding", label: "Wedding & Bridal", url: "/c/wedding" },
          { id: "wo-everyday", label: "Everyday Heritage", url: "/c/everyday" },
          { id: "wo-sarees", label: "Signature Sarees", url: "/c/sarees" },
        ],
      },
      {
        id: "w-modern",
        label: "Modern & Craft",
        url: "/c/taaga-fusion",
        children: [
          { id: "wm-taaga", label: "Taaga Fusion", url: "/c/taaga-fusion" },
          {
            id: "wm-artisan",
            label: "Artisan Essentials",
            url: "/c/artisan-essentials",
          },
          {
            id: "wm-jewellery",
            label: "Handcrafted Jewellery",
            url: "/c/jewellery",
          },
        ],
      },
      {
        id: "w-featured",
        label: "Featured",
        url: "/c/new-in",
        children: [
          { id: "wf-new", label: "New Arrivals", url: "/c/new-in" },
          { id: "wf-best", label: "Best Sellers", url: "/c/best-sellers" },
          { id: "wf-all", label: "All Women's Wear", url: "/c/women" },
        ],
      },
    ],
  },
  {
    id: "men",
    label: "Men",
    url: "/c/men",
    image: "/ph/songoskriti/cat-men.jpg",
    children: [
      {
        id: "m-panjabi",
        label: "Panjabi & Kurta",
        url: "/c/panjabi",
        children: [
          { id: "mp-fine", label: "Fine Panjabis", url: "/c/panjabi" },
          {
            id: "mp-handloom",
            label: "Heritage Handloom",
            url: "/c/heritage-handloom",
          },
          {
            id: "mp-artisan",
            label: "Artisan Essentials",
            url: "/c/artisan-essentials",
          },
          { id: "mp-all", label: "All Panjabis", url: "/c/panjabi" },
        ],
      },
      {
        id: "m-occasion",
        label: "Occasion",
        url: "/c/eid-festive",
        children: [
          { id: "mo-eid", label: "Eid Collection", url: "/c/eid-festive" },
          { id: "mo-wedding", label: "Wedding & Bridal", url: "/c/wedding" },
          { id: "mo-festive", label: "Festive Wear", url: "/c/festive" },
        ],
      },
      {
        id: "m-everyday",
        label: "Everyday & Casual",
        url: "/c/everyday",
        children: [
          { id: "me-everyday", label: "Everyday Heritage", url: "/c/everyday" },
          { id: "me-taaga", label: "Taaga Man", url: "/c/taaga-fusion" },
          {
            id: "me-trending",
            label: "Trending Styles",
            url: "/c/best-sellers",
          },
        ],
      },
      {
        id: "m-featured",
        label: "Featured",
        url: "/c/new-in",
        children: [
          { id: "mf-new", label: "New Arrivals", url: "/c/new-in" },
          { id: "mf-best", label: "Best Sellers", url: "/c/best-sellers" },
          { id: "mf-all", label: "All Men's Wear", url: "/c/men" },
        ],
      },
    ],
  },
  {
    id: "kids",
    label: "Kids",
    url: "/c/kids",
    image: "/ph/songoskriti/cat-kids.jpg",
    children: [
      {
        id: "k-festive",
        label: "Festive Kids",
        url: "/c/kids",
        children: [
          { id: "kf-ghagra", label: "Festive Ghagra Choli", url: "/c/kids" },
          {
            id: "kf-eid",
            label: "Eid Children's Wear",
            url: "/c/eid-festive",
          },
        ],
      },
      {
        id: "k-occasion",
        label: "Family Occasion",
        url: "/c/wedding",
        children: [
          {
            id: "ko-wedding",
            label: "Wedding & Celebration",
            url: "/c/wedding",
          },
          { id: "ko-festive", label: "Festive Collection", url: "/c/festive" },
        ],
      },
      {
        id: "k-featured",
        label: "Curated",
        url: "/c/new-in",
        children: [
          { id: "kfe-new", label: "New Festive Drops", url: "/c/new-in" },
          {
            id: "kfe-artisan",
            label: "Artisan Essentials",
            url: "/c/artisan-essentials",
          },
        ],
      },
      {
        id: "k-collections",
        label: "Collections",
        url: "/c/kids",
        children: [
          { id: "kc-all", label: "All Kids' Wear", url: "/c/kids" },
          {
            id: "kc-handloom",
            label: "Heritage Handloom",
            url: "/c/heritage-handloom",
          },
        ],
      },
    ],
  },
  {
    id: "festive",
    label: "Festive",
    url: "/c/festive",
    image: "/ph/songoskriti/hero-festive.jpg",
    children: [
      {
        id: "f-occ",
        label: "Occasions",
        url: "/c/festive",
        children: [
          { id: "fo-festive", label: "Festive Collection", url: "/c/festive" },
          { id: "fo-eid", label: "Eid & Festive", url: "/c/eid-festive" },
          { id: "fo-wedding", label: "Wedding & Bridal", url: "/c/wedding" },
        ],
      },
      {
        id: "f-attire",
        label: "Festive Attire",
        url: "/c/sarees",
        children: [
          { id: "fa-sarees", label: "Signature Sarees", url: "/c/sarees" },
          { id: "fa-panjabi", label: "Fine Panjabis", url: "/c/panjabi" },
          { id: "fa-jamdani", label: "Dhakai Jamdani", url: "/c/jamdani" },
        ],
      },
      {
        id: "f-living",
        label: "Living & Adornment",
        url: "/c/living",
        children: [
          {
            id: "fl-jewellery",
            label: "Handcrafted Jewellery",
            url: "/c/jewellery",
          },
          { id: "fl-living", label: "Living & Home Decor", url: "/c/living" },
          {
            id: "fl-wellness",
            label: "Botanical Wellness",
            url: "/c/aarong-earth",
          },
        ],
      },
      {
        id: "f-curated",
        label: "Curations",
        url: "/c/new-in",
        children: [
          { id: "fc-new", label: "New Arrivals", url: "/c/new-in" },
          { id: "fc-best", label: "Best Sellers", url: "/c/best-sellers" },
        ],
      },
    ],
  },
  {
    id: "heritage",
    label: "Heritage",
    url: "/c/heritage",
    image: "/ph/songoskriti/hero-artisans.jpg",
    children: [
      {
        id: "h-weaves",
        label: "Master Weaves",
        url: "/c/heritage",
        children: [
          { id: "hw-jamdani", label: "Dhakai Jamdani", url: "/c/jamdani" },
          {
            id: "hw-handloom",
            label: "Heritage Handloom",
            url: "/c/heritage-handloom",
          },
          { id: "hw-sarees", label: "Signature Sarees", url: "/c/sarees" },
        ],
      },
      {
        id: "h-crafts",
        label: "Folk Crafts & Living",
        url: "/c/living",
        children: [
          {
            id: "hc-kantha",
            label: "Nakshi Kantha Art",
            url: "/c/nakshi-kantha",
          },
          { id: "hc-living", label: "Living & Home Decor", url: "/c/living" },
          {
            id: "hc-jewellery",
            label: "Handcrafted Jewellery",
            url: "/c/jewellery",
          },
        ],
      },
      {
        id: "h-lifestyle",
        label: "Lifestyle & Wellness",
        url: "/c/aarong-earth",
        children: [
          {
            id: "hl-wellness",
            label: "Aarong Earth Wellness",
            url: "/c/aarong-earth",
          },
          {
            id: "hl-essentials",
            label: "Artisan Essentials",
            url: "/c/artisan-essentials",
          },
          { id: "hl-everyday", label: "Everyday Heritage", url: "/c/everyday" },
        ],
      },
      {
        id: "h-journal",
        label: "Artisan Journal",
        url: "/blog",
        children: [
          {
            id: "hj-weavers",
            label: "Master Weavers of Tangail",
            url: "/pages/master-weavers",
          },
          {
            id: "hj-kantha",
            label: "Nakshi Kantha Folk Art",
            url: "/pages/artisans",
          },
          { id: "hj-all", label: "The Journal Index", url: "/blog" },
        ],
      },
    ],
  },
  {
    id: "new-in",
    label: "New Arrivals",
    url: "/c/new-in",
    image: "/ph/songoskriti/cat-newin.png",
    children: [
      {
        id: "n-fresh",
        label: "Fresh Drops",
        url: "/c/new-in",
        children: [
          {
            id: "nf-new",
            label: "New Festive Arrivals",
            url: "/c/new-in",
          },
          {
            id: "nf-best",
            label: "Trending & Best Sellers",
            url: "/c/best-sellers",
          },
        ],
      },
      {
        id: "n-season",
        label: "Seasonal Highlights",
        url: "/c/eid-festive",
        children: [
          { id: "ns-eid", label: "Eid & Festive", url: "/c/eid-festive" },
          { id: "ns-wedding", label: "Wedding & Bridal", url: "/c/wedding" },
        ],
      },
      {
        id: "n-modern",
        label: "Modern Styles",
        url: "/c/taaga-fusion",
        children: [
          {
            id: "nm-taaga",
            label: "Taaga Bohemian Fusion",
            url: "/c/taaga-fusion",
          },
          {
            id: "nm-wellness",
            label: "Botanical Wellness",
            url: "/c/aarong-earth",
          },
        ],
      },
      {
        id: "n-explore",
        label: "Explore All",
        url: "/search",
        children: [
          { id: "ne-search", label: "Search Storefront", url: "/search" },
          {
            id: "ne-essentials",
            label: "Artisan Essentials",
            url: "/c/artisan-essentials",
          },
        ],
      },
    ],
  },
];

/**
 * বাংলা twins for the fallback tree above, keyed by the English label.
 * A missing key falls back to English (flagged, never blank).
 * Dashboard-designed menus (MenuItem) carry no `_bn` field, so they render
 * as-authored — this table only covers the fallback.
 */
export const HEADER_MENU_BN: Record<string, string> = {
  Women: "মহিলা",
  Sarees: "শাড়ি",
  Jamdani: "জামদানি",
  "Dhakai Jamdani": "ঢাকাই জামদানি",
  "Heritage Handloom": "ঐতিহ্যবাহী তাঁত",
  Tangail: "টাঙ্গাইল",
  Muslin: "মসলিন",
  Silk: "সিল্ক",
  Handloom: "হ্যান্ডলুম",
  Cotton: "সুতি",
  "Festive Sarees": "উৎসবের শাড়ি",
  "All Sarees": "সকল শাড়ি",
  Occasion: "উপলক্ষ",
  Eid: "ঈদ",
  "Eid & Festive": "ঈদ ও উৎসব",
  Wedding: "বিয়ে",
  "Wedding & Bridal": "বিয়ে ও ব্রাইডাল",
  Everyday: "প্রতিদিনের",
  "Everyday Heritage": "প্রতিদিনের ঐতিহ্য",
  Party: "পার্টি",
  "Modern & Craft": "আধুনিক ও কারুকাজ",
  "Taaga Fusion": "তাগা ফিউশন",
  "Taaga Bohemian Fusion": "তাগা বোহেমিয়ান ফিউশন",
  "Artisan Essentials": "কারুশিল্পের নিত্যপ্রয়োজনীয়",
  "Handcrafted Jewellery": "হস্তশিল্প অলঙ্কার",
  Featured: "বিশেষ",
  "New Arrivals": "নতুন সংগ্রহ",
  "Best Sellers": "সর্বাধিক বিক্রীত",
  Bestsellers: "সর্বাধিক বিক্রীত",
  "All Women's Wear": "নারীদের পোশাক",
  Men: "পুরুষ",
  "Panjabi & Kurta": "পাঞ্জাবি ও কুর্তা",
  "Fine Panjabis": "অভিজাত পাঞ্জাবি",
  Panjabi: "পাঞ্জাবি",
  "All Panjabis": "সকল পাঞ্জাবি",
  "Premium Panjabi": "প্রিমিয়াম পাঞ্জাবি",
  Festive: "উৎসব",
  "Eid Collection": "ঈদ সংগ্রহ",
  "Festive Wear": "উৎসবের পোশাক",
  Casual: "ক্যাজুয়াল",
  "Everyday & Casual": "প্রতিদিনের ও ক্যাজুয়াল",
  "Taaga Man": "তাগা ম্যান",
  "Trending Styles": "ট্রেন্ডিং স্টাইল",
  "All Men's Wear": "পুরুষদের পোশাক",
  Sets: "সেট",
  "Panjabi & Pajama": "পাঞ্জাবি ও পাজামা",
  "Family Matching": "পরিবারের মিল",
  Kids: "শিশু",
  "Festive Kids": "শিশুদের উৎসব পোশাক",
  "Festive Ghagra Choli": "উৎসবের ঘাগরা চোলি",
  "Eid Children's Wear": "ঈদের শিশু পোশাক",
  "Family Occasion": "পারিবারিক উপলক্ষ",
  "Wedding & Celebration": "বিয়ে ও উদযাপন",
  "Festive Collection": "উৎসব সংগ্রহ",
  Curated: "নির্বাচিত",
  "New Festive Drops": "নতুন উৎসব সমাহার",
  Boys: "ছেলেরা",
  Girls: "মেয়েরা",
  Dresses: "পোশাক",
  Lehengas: "লেহেঙ্গা",
  Collections: "কালেকশন",
  "All Kids' Wear": "শিশুদের সকল পোশাক",
  "Signature Sarees": "সিগনেচার শাড়ি",
  "The Modern Panjabi": "আধুনিক পাঞ্জাবি",
  Occasions: "উপলক্ষসমূহ",
  "Festive Attire": "উৎসবের সাজপোশাক",
  "Living & Adornment": "গৃহসজ্জা ও অলঙ্করণ",
  "Living & Home Decor": "গৃহসজ্জা ও উপকরণ",
  "Botanical Wellness": "ভেষজ যত্ন ও ওয়েলনেস",
  Curations: "সংকলন",
  "Festive Editorial": "উৎসবের গল্প",
  Mehendi: "মেহেদি",
  Sangeet: "সংগীত",
  Puja: "পূজা",
  Gifting: "উপহার",
  Heritage: "ঐতিহ্য",
  "Master Weaves": "সেরা বুনন শিল্প",
  "Folk Crafts & Living": "লোকশিল্প ও জীবনযাপন",
  "Nakshi Kantha Art": "নকশি কাঁথা শিল্প",
  "Nakshi Kantha Folk Art": "নকশি কাঁথা লোকশিল্প",
  "Lifestyle & Wellness": "জীবনধারা ও সুস্থতা",
  "Aarong Earth Wellness": "আড়ং আর্থ ওয়েলনেস",
  "Artisan Journal": "কারিগরের জার্নাল",
  "Master Weavers of Tangail": "টাঙ্গাইলের সেরা তাঁতি",
  "The Journal Index": "জার্নাল সূচি",
  "Fresh Drops": "নতুন আগমন",
  "New Festive Arrivals": "নতুন উৎসবের আগমন",
  "Trending & Best Sellers": "জনপ্রিয় ও সর্বাধিক বিক্রীত",
  "Seasonal Highlights": "সিজনের সেরা",
  "Modern Styles": "আধুনিক শৈলী",
  "Explore All": "সব দেখুন",
  "Search Storefront": "স্টোরে খুঁজুন",
  "Weaves & Craft": "বুনন ও কারুকাজ",
  "Rajshahi Silk": "রাজশাহী সিল্ক",
  "Nakshi Kantha": "নকশি কাঁথা",
  "Artisan Stories": "কারিগরের গল্প",
  "The Journal": "জার্নাল",
};

/** Resolve a header node's display label (fallback tree is bilingual). */
export function headerMenuLabel(
  label: string,
  t: (en: string, bn?: string) => string,
): string {
  return t(label, HEADER_MENU_BN[label]);
}

/** Logo lockup for fallback-chrome stores (hand-built SVG asset). */
export const HEADER_LOGO = {
  src: "/ph/songoskriti/logo-lockup.svg",
  alt: "Songoskriti",
} as const;

/** Announcement-bar copy for the luxury header variant. */
export const HEADER_ANNOUNCEMENT = {
  left: "EASY 7-DAY EXCHANGE",
  center: "Free delivery across Bangladesh on orders over BDT 5000",
  center_bn: "৫০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
} as const;
