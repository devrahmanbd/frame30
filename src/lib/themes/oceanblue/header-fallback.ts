/**
 * Oceanblue header fallback chrome — theme-owned data.
 *
 * The 8-item Biba-scale fallback mega-menu tree (Category + Collection
 * columns per item), its বাংলা twin table, the logo lockup, and the
 * announcement-bar copy live here, authored by the theme. The shared
 * header resolves them through the key-driven config in
 * `components/store/theme-chrome.ts` (config, not theme code) — never by
 * branching on brand literals itself.
 *
 * Data only: no React, no network.
 */
export const OCEANBLUE_MEGA_MENU = [
  {
    id: "salwar-kameez",
    label: "Salwar Kameez",
    url: "/c/salwar-kameez",
    children: [
      {
        id: "sk-category",
        label: "Category",
        url: "/c/salwar-kameez",
        children: [
          { id: "sk-straight", label: "Straight Sets", url: "/c/straight-sets" },
          { id: "sk-anarkali", label: "Anarkali Sets", url: "/c/anarkali-sets" },
          { id: "sk-flared", label: "Flared Sets", url: "/c/flared-sets" },
          { id: "sk-fusion", label: "Fusion Sets", url: "/c/fusion-sets" },
          {
            id: "sk-lehenga",
            label: "Lehenga & Skirt Sets",
            url: "/c/lehenga-sets",
          },
        ],
      },
      {
        id: "sk-collection",
        label: "Collection",
        url: "/c/salwar-kameez",
        children: [
          { id: "sk-festive", label: "Festive", url: "/c/festive" },
          { id: "sk-wedding", label: "Wedding", url: "/c/wedding" },
          { id: "sk-new", label: "New Arrival", url: "/c/new-in" },
        ],
      },
    ],
  },
  {
    id: "kurtas-tops",
    label: "Kurtas & Tops",
    url: "/c/kurtas-tops",
    children: [
      {
        id: "kt-category",
        label: "Category",
        url: "/c/kurtas-tops",
        children: [
          { id: "kt-kurtas", label: "Kurtas", url: "/c/kurtas" },
          { id: "kt-kurtis", label: "Kurtis & Tops", url: "/c/kurtis-tops" },
          {
            id: "kt-shrugs",
            label: "Shrugs & Jackets",
            url: "/c/shrugs-jackets",
          },
          {
            id: "kt-dupatta",
            label: "Dupattas & Scarves",
            url: "/c/dupattas-scarves",
          },
        ],
      },
      {
        id: "kt-collection",
        label: "Collection",
        url: "/c/kurtas-tops",
        children: [
          { id: "kt-solids", label: "Classic Solids", url: "/c/solids" },
          { id: "kt-festive", label: "Festive", url: "/c/festive" },
          { id: "kt-workwear", label: "Workwear", url: "/c/workwear" },
        ],
      },
    ],
  },
  {
    id: "dresses",
    label: "Dresses",
    url: "/c/dresses",
    children: [
      {
        id: "dr-category",
        label: "Category",
        url: "/c/dresses",
        children: [
          { id: "dr-casual", label: "Casual", url: "/c/casual-dresses" },
          { id: "dr-festive", label: "Festive", url: "/c/festive-dresses" },
          { id: "dr-workwear", label: "Workwear", url: "/c/workwear-dresses" },
        ],
      },
      {
        id: "dr-collection",
        label: "Collection",
        url: "/c/dresses",
        children: [
          { id: "dr-aw", label: "Autumn Winter", url: "/c/autumn-winter" },
          { id: "dr-ss", label: "Spring Summer", url: "/c/spring-summer" },
        ],
      },
    ],
  },
  {
    id: "bottoms",
    label: "Bottoms",
    url: "/c/bottoms",
    children: [
      {
        id: "bt-category",
        label: "Category",
        url: "/c/bottoms",
        children: [
          {
            id: "bt-leggings",
            label: "Leggings & Churidar",
            url: "/c/leggings-churidar",
          },
          { id: "bt-pants", label: "Pants", url: "/c/pants" },
          { id: "bt-palazzo", label: "Palazzos", url: "/c/palazzos" },
          { id: "bt-salwar", label: "Salwar", url: "/c/salwar" },
          {
            id: "bt-skirts",
            label: "Skirts & Shararas",
            url: "/c/skirts-shararas",
          },
        ],
      },
    ],
  },
  {
    id: "girls",
    label: "Girls",
    url: "/c/girls",
    children: [
      {
        id: "gr-category",
        label: "Category",
        url: "/c/girls",
        children: [
          { id: "gr-suits", label: "Suit Sets", url: "/c/girls-suits" },
          { id: "gr-tops", label: "Tops & Tunics", url: "/c/girls-tops" },
          { id: "gr-frocks", label: "Frocks & Dresses", url: "/c/girls-frocks" },
          { id: "gr-lehenga", label: "Lehenga Sets", url: "/c/girls-lehenga" },
        ],
      },
      {
        id: "gr-collection",
        label: "Collection",
        url: "/c/girls",
        children: [
          { id: "gr-festive", label: "Festive", url: "/c/girls-festive" },
          { id: "gr-casual", label: "Casual", url: "/c/girls-casual" },
        ],
      },
    ],
  },
  {
    id: "jewellery",
    label: "Jewellery",
    url: "/c/jewellery",
    children: [
      {
        id: "jw-category",
        label: "Category",
        url: "/c/jewellery",
        children: [
          { id: "jw-earrings", label: "Earrings", url: "/c/earrings" },
          {
            id: "jw-necklaces",
            label: "Necklaces & Sets",
            url: "/c/necklaces-sets",
          },
          {
            id: "jw-bangles",
            label: "Bangles & Bracelets",
            url: "/c/bangles-bracelets",
          },
        ],
      },
    ],
  },
  {
    id: "collections",
    label: "Collections",
    url: "/c/collections",
    children: [
      {
        id: "cl-edits",
        label: "The Edits",
        url: "/c/collections",
        children: [
          { id: "cl-new", label: "New Arrival", url: "/c/new-in" },
          { id: "cl-wedding", label: "Wedding Splendor", url: "/c/wedding" },
          { id: "cl-festive", label: "Festive", url: "/c/festive" },
          { id: "cl-plus", label: "Plus Size", url: "/c/plus-size" },
          {
            id: "cl-exclusive",
            label: "Online Exclusive",
            url: "/c/online-exclusive",
          },
        ],
      },
    ],
  },
  {
    id: "sale",
    label: "Sale",
    url: "/c/sale",
    children: [
      {
        id: "sl-category",
        label: "Category",
        url: "/c/sale",
        children: [
          { id: "sl-suits", label: "Suit Sets", url: "/c/sale-suits" },
          { id: "sl-kurtas", label: "Kurtas & Tops", url: "/c/sale-kurtas" },
          { id: "sl-dresses", label: "Dresses", url: "/c/sale-dresses" },
          { id: "sl-bottoms", label: "Bottoms", url: "/c/sale-bottoms" },
          { id: "sl-girls", label: "Girls", url: "/c/sale-girls" },
        ],
      },
    ],
  },
];

/**
 * বাংলা twins for the hardcoded fallback tree above, keyed by the English
 * label. A missing key falls back to English (flagged, never blank).
 * Dashboard-designed menus (MenuItem) carry no `_bn` field, so they render
 * as-authored — this table only covers the fallback.
 */
export const OCEANBLUE_MENU_BN: Record<string, string> = {
  "Salwar Kameez": "সালোয়ার কামিজ",
  Category: "ক্যাটাগরি",
  Collection: "কালেকশন",
  "Straight Sets": "স্ট্রেইট সেট",
  "Anarkali Sets": "আনারকলি সেট",
  "Flared Sets": "ফ্লেয়ার্ড সেট",
  "Fusion Sets": "ফিউশন সেট",
  "Lehenga & Skirt Sets": "লেহেঙ্গা ও স্কার্ট সেট",
  Festive: "উৎসব",
  Wedding: "বিয়ে",
  "New Arrival": "নতুন এসেছে",
  "Kurtas & Tops": "কুর্তা ও টপস",
  Kurtas: "কুর্তা",
  "Kurtis & Tops": "কুর্তি ও টপস",
  "Shrugs & Jackets": "শ্রাগ ও জ্যাকেট",
  "Dupattas & Scarves": "দুপাট্টা ও স্কার্ফ",
  "Classic Solids": "ক্লাসিক সলিড",
  Workwear: "অফিস পোশাক",
  Dresses: "পোশাক",
  Casual: "ক্যাজুয়াল",
  "Autumn Winter": "শরৎ-শীত",
  "Spring Summer": "বসন্ত-গ্রীষ্ম",
  Bottoms: "বটমস",
  "Leggings & Churidar": "লেগিংস ও চুড়িদার",
  Pants: "প্যান্ট",
  Palazzos: "পালাজ্জো",
  Salwar: "সালোয়ার",
  "Skirts & Shararas": "স্কার্ট ও শারারা",
  Girls: "মেয়েরা",
  "Suit Sets": "স্যুট সেট",
  "Tops & Tunics": "টপস ও টিউনিক",
  "Frocks & Dresses": "ফ্রক ও পোশাক",
  "Lehenga Sets": "লেহেঙ্গা সেট",
  Jewellery: "গহনা",
  Earrings: "কানের দুল",
  "Necklaces & Sets": "নেকলেস ও সেট",
  "Bangles & Bracelets": "চুড়ি ও ব্রেসলেট",
  Collections: "কালেকশন",
  "The Edits": "বিশেষ সংগ্রহ",
  "Wedding Splendor": "বিয়ের জাঁকজমক",
  "Plus Size": "প্লাস সাইজ",
  "Online Exclusive": "শুধু অনলাইনে",
  Sale: "সেল",
};

/** Resolve a header node's display label (fallback tree is bilingual). */
export function oceanblueMenuLabel(
  label: string,
  t: (en: string, bn?: string) => string,
): string {
  return t(label, OCEANBLUE_MENU_BN[label]);
}

/** Logo lockup for oceanblue-shaped stores (clean wordmark SVG). */
export const OCEANBLUE_HEADER_LOGO = {
  src: "/ph/oceanblue/logo-lockup.svg",
  alt: "Oceanblue",
} as const;

/** Announcement-bar copy for the oceanblue header variant. */
export const OCEANBLUE_HEADER_ANNOUNCEMENT = {
  left: "EASY 7-DAY EXCHANGE",
  center: "Free delivery across Bangladesh on orders over BDT 2,000",
  center_bn: "২০০০ টাকার উপরে অর্ডারে সারা দেশে ফ্রি ডেলিভারি",
  // A full-width marquee strip — the shared header renders `items` as a
  // scrolling ticker instead of the default 3-column split bar.
  variant: "ticker",
  items: [
    { text: "EASY 7-DAY EXCHANGE", bn: "সহজ ৭ দিনের এক্সচেঞ্জ" },
    { text: "FREE DELIVERY OVER BDT 2,000", bn: "২০০০ টাকার উপরে ফ্রি ডেলিভারি" },
    { text: "CASH ON DELIVERY NATIONWIDE", bn: "সারা দেশে ক্যাশ অন ডেলিভারি" },
    { text: "SECURE CHECKOUT, EVERY ORDER", bn: "প্রতিটি অর্ডারে সিকিউর চেকআউট" },
    { text: "AW26 IS HERE", bn: "AW26 এসেছে" },
  ],
} as const;
