/**
 * Songoskriti header fallback chrome — theme-owned data (Task 2).
 *
 * Moved verbatim out of the shared `StoreHeader` chrome so generic
 * renderers carry zero brand content: the fallback mega-menu tree, its
 * বাংলা twin table, the logo lockup, and the announcement-bar copy live
 * here, authored by the theme. The shared header resolves them through the
 * key-driven config in `components/store/theme-chrome.ts` (config, not
 * theme code) — never by branching on brand literals itself.
 *
 * Data only: no React, no network.
 */
export const SONGOSKRITI_MEGA_MENU = [
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

/**
 * বাংলা twins for the hardcoded fallback tree above, keyed by the English
 * label. A missing key falls back to English (flagged, never blank).
 * Dashboard-designed menus (MenuItem) carry no `_bn` field, so they render
 * as-authored — this table only covers the fallback.
 */
export const SONGOSKRITI_MENU_BN: Record<string, string> = {
  Women: "মহিলা",
  Sarees: "শাড়ি",
  Jamdani: "জামদানি",
  Tangail: "টাঙ্গাইল",
  Muslin: "মসলিন",
  Silk: "সিল্ক",
  Handloom: "হ্যান্ডলুম",
  Cotton: "সুতি",
  "Festive Sarees": "উৎসবের শাড়ি",
  Occasion: "উপলক্ষ",
  Eid: "ঈদ",
  Wedding: "বিয়ে",
  Everyday: "প্রতিদিনের",
  Party: "পার্টি",
  Featured: "বিশেষ",
  "New Arrivals": "নতুন সংগ্রহ",
  Bestsellers: "সর্বাধিক বিক্রীত",
  Men: "পুরুষ",
  Panjabi: "পাঞ্জাবি",
  "Premium Panjabi": "প্রিমিয়াম পাঞ্জাবি",
  Festive: "উৎসব",
  Casual: "ক্যাজুয়াল",
  Sets: "সেট",
  "Panjabi & Pajama": "পাঞ্জাবি ও পাজামা",
  "Family Matching": "পরিবারের মিল",
  Kids: "শিশু",
  Boys: "ছেলেরা",
  Girls: "মেয়েরা",
  Dresses: "পোশাক",
  Lehengas: "লেহেঙ্গা",
  Collections: "কালেকশন",
  "Signature Sarees": "সিগনেচার শাড়ি",
  "The Modern Panjabi": "আধুনিক পাঞ্জাবি",
  "Everyday Heritage": "প্রতিদিনের ঐতিহ্য",
  Occasions: "উপলক্ষসমূহ",
  Mehendi: "মেহেদি",
  Sangeet: "সংগীত",
  Puja: "পূজা",
  Gifting: "উপহার",
  Heritage: "ঐতিহ্য",
  "Weaves & Craft": "বুনন ও কারুকাজ",
  "Rajshahi Silk": "রাজশাহী সিল্ক",
  "Nakshi Kantha": "নকশি কাঁথা",
  "Artisan Stories": "কারিগরের গল্প",
};

/** Resolve a header node's display label (fallback tree is bilingual). */
export function songoskritiMenuLabel(
  label: string,
  t: (en: string, bn?: string) => string,
): string {
  return t(label, SONGOSKRITI_MENU_BN[label]);
}

/** Logo lockup for songoskriti-shaped stores (Task 3 asset: hand-built SVG). */
export const SONGOSKRITI_HEADER_LOGO = {
  src: "/ph/songoskriti/logo-lockup.svg",
  alt: "Songoskriti",
} as const;

/** Announcement-bar copy for the luxury header variant. */
export const SONGOSKRITI_HEADER_ANNOUNCEMENT = {
  left: "EASY 7-DAY EXCHANGE",
  center: "Free delivery across Bangladesh on orders over BDT 5000",
  center_bn: "৫০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
} as const;
