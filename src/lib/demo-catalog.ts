/**
 * Phase 4 — per-vertical demo catalogues.
 *
 * `theme_import_demo` accepts a `_catalog` payload, so the sample store a
 * merchant lands in matches the theme they picked: apparel gets sizes and
 * colourways, electronics gets specs and warranty, beauty gets shades, and the
 * marketplace preset gets a broad multi-category spread. Every row the RPC
 * writes is flagged `is_demo`, so `theme_purge_demo` fully reverses it.
 */

export type DemoVariant = {
  name: string;
  sku?: string;
  /** Minor units in the merchant's currency. */
  price: number;
  compare_at?: number;
  stock?: number;
};

export type DemoProduct = {
  slug: string;
  title: string;
  description: string;
  category: string;
  collections: string[];
  tags?: string[];
  variants: DemoVariant[];
};

export type DemoCatalog = {
  categories: { slug: string; name: string; description?: string }[];
  collections: { slug: string; name: string; description?: string }[];
  products: DemoProduct[];
};

/** apparel — sizes, colourways, fabric and model measurements in the copy. */
const APPAREL: DemoCatalog = {
  categories: [
    { slug: "womens", name: "Women", description: "Everyday and occasion wear." },
    { slug: "mens", name: "Men", description: "Shirts, kurtas and outerwear." },
  ],
  collections: [
    { slug: "new-in", name: "New In", description: "This week's arrivals." },
    { slug: "everyday-edit", name: "The Everyday Edit", description: "Wardrobe staples." },
  ],
  products: [
    {
      slug: "handloom-cotton-saree",
      title: "Handloom Cotton Saree",
      description:
        "Woven on a pit loom in Tangail. 100% cotton, 5.5m with blouse piece. Model is 168cm and wears one size.",
      category: "womens",
      collections: ["new-in"],
      tags: ["cotton", "handloom", "saree"],
      variants: [
        { name: "Indigo", sku: "APP-SAR-IND", price: 349000, compare_at: 420000, stock: 12 },
        { name: "Terracotta", sku: "APP-SAR-TER", price: 349000, stock: 8 },
      ],
    },
    {
      slug: "oversized-poplin-shirt",
      title: "Oversized Poplin Shirt",
      description: "Crisp 120gsm cotton poplin, drop shoulder, mother-of-pearl buttons. Model is 180cm and wears M.",
      category: "mens",
      collections: ["new-in", "everyday-edit"],
      tags: ["shirt", "cotton"],
      variants: [
        { name: "White / S", sku: "APP-POP-WS", price: 189000, stock: 20 },
        { name: "White / M", sku: "APP-POP-WM", price: 189000, stock: 18 },
        { name: "Sage / L", sku: "APP-POP-SL", price: 189000, stock: 6 },
      ],
    },
    {
      slug: "linen-blend-trouser",
      title: "Linen Blend Trouser",
      description: "55% linen, 45% viscose. Elasticated back waist, 28in inseam. Model is 172cm and wears 30.",
      category: "womens",
      collections: ["everyday-edit"],
      tags: ["linen", "trouser"],
      variants: [
        { name: "Sand / 28", sku: "APP-LIN-S28", price: 229000, stock: 10 },
        { name: "Sand / 30", sku: "APP-LIN-S30", price: 229000, stock: 14 },
      ],
    },
    {
      slug: "quilted-cotton-jacket",
      title: "Quilted Cotton Jacket",
      description: "Hand-quilted nakshi lining, two patch pockets, unlined cuffs. Model is 175cm and wears M.",
      category: "mens",
      collections: ["new-in"],
      tags: ["outerwear", "quilted"],
      variants: [{ name: "Charcoal / M", sku: "APP-QLT-CM", price: 545000, compare_at: 620000, stock: 5 }],
    },
  ],
};

/** marketplace — deliberately broad, multi-category, mixed price bands. */
const MARKETPLACE: DemoCatalog = {
  categories: [
    { slug: "home", name: "Home & Living" },
    { slug: "grocery", name: "Grocery" },
    { slug: "gadgets", name: "Gadgets" },
    { slug: "fashion", name: "Fashion" },
  ],
  collections: [
    { slug: "todays-deals", name: "Today's Deals", description: "Time-limited price drops." },
    { slug: "best-sellers", name: "Best Sellers" },
  ],
  products: [
    {
      slug: "stainless-steel-cookware-set",
      title: "5-Piece Stainless Steel Cookware Set",
      description: "Tri-ply base, induction-ready, dishwasher safe. Includes two saucepans, a kadai and lids.",
      category: "home",
      collections: ["todays-deals", "best-sellers"],
      tags: ["kitchen", "cookware"],
      variants: [{ name: "5-piece", sku: "MKT-CKW-5", price: 489000, compare_at: 650000, stock: 30 }],
    },
    {
      slug: "premium-basmati-rice-5kg",
      title: "Premium Basmati Rice 5kg",
      description: "Aged 12 months, extra-long grain, sourced from a single mill.",
      category: "grocery",
      collections: ["best-sellers"],
      tags: ["rice", "pantry"],
      variants: [
        { name: "5kg", sku: "MKT-RIC-5", price: 92000, stock: 120 },
        { name: "10kg", sku: "MKT-RIC-10", price: 175000, stock: 60 },
      ],
    },
    {
      slug: "wireless-earbuds-anc",
      title: "Wireless Earbuds with ANC",
      description: "Hybrid active noise cancellation, 32h with case, USB-C, IPX5.",
      category: "gadgets",
      collections: ["todays-deals"],
      tags: ["audio", "anc"],
      variants: [{ name: "Black", sku: "MKT-EAR-BLK", price: 349000, compare_at: 449000, stock: 45 }],
    },
    {
      slug: "cotton-crew-tee-3pack",
      title: "Cotton Crew Tee — 3 Pack",
      description: "180gsm combed cotton, pre-shrunk, ribbed collar.",
      category: "fashion",
      collections: ["best-sellers"],
      tags: ["tshirt", "basics"],
      variants: [
        { name: "M", sku: "MKT-TEE-M", price: 129000, stock: 80 },
        { name: "L", sku: "MKT-TEE-L", price: 129000, stock: 75 },
      ],
    },
    {
      slug: "rechargeable-table-fan",
      title: "Rechargeable Table Fan",
      description: "8000mAh, up to 9 hours per charge, three speeds, USB-C.",
      category: "home",
      collections: ["todays-deals"],
      tags: ["fan", "rechargeable"],
      variants: [{ name: "White", sku: "MKT-FAN-WHT", price: 275000, stock: 22 }],
    },
  ],
};

/** electronics — specs, EMI-friendly price bands, warranty in the copy. */
const ELECTRONICS: DemoCatalog = {
  categories: [
    { slug: "laptops", name: "Laptops" },
    { slug: "audio", name: "Audio" },
    { slug: "accessories", name: "Accessories" },
  ],
  collections: [
    { slug: "emi-available", name: "EMI Available", description: "0% EMI up to 12 months." },
    { slug: "just-launched", name: "Just Launched" },
  ],
  products: [
    {
      slug: "ultrabook-14-i7",
      title: "Ultrabook 14\" Core i7",
      description:
        "14in 2.8K OLED 120Hz · Core i7-13700H · 16GB LPDDR5 · 1TB NVMe · 75Wh · 1.29kg. 2-year international warranty.",
      category: "laptops",
      collections: ["emi-available", "just-launched"],
      tags: ["laptop", "oled", "emi"],
      variants: [
        { name: "16GB / 1TB", sku: "ELC-UB14-16-1T", price: 16500000, stock: 7 },
        { name: "32GB / 2TB", sku: "ELC-UB14-32-2T", price: 19900000, stock: 3 },
      ],
    },
    {
      slug: "over-ear-anc-headphones",
      title: "Over-Ear ANC Headphones",
      description: "40mm drivers · LDAC · 45dB hybrid ANC · 40h playback · multipoint. 1-year warranty.",
      category: "audio",
      collections: ["emi-available"],
      tags: ["headphones", "anc"],
      variants: [
        { name: "Graphite", sku: "ELC-HP-GRA", price: 2450000, compare_at: 2900000, stock: 15 },
        { name: "Silver", sku: "ELC-HP-SIL", price: 2450000, stock: 9 },
      ],
    },
    {
      slug: "gan-charger-100w",
      title: "100W GaN Charger",
      description: "2× USB-C PD 3.1 + 1× USB-A · foldable pins · 100W total. 18-month warranty.",
      category: "accessories",
      collections: ["just-launched"],
      tags: ["charger", "gan", "usb-c"],
      variants: [{ name: "100W", sku: "ELC-GAN-100", price: 620000, stock: 40 }],
    },
    {
      slug: "27-inch-4k-monitor",
      title: "27\" 4K IPS Monitor",
      description: "3840×2160 · 144Hz · 95% DCI-P3 · HDMI 2.1 + USB-C 90W PD. 3-year panel warranty.",
      category: "accessories",
      collections: ["emi-available"],
      tags: ["monitor", "4k", "emi"],
      variants: [{ name: "27in 4K", sku: "ELC-MON-27", price: 5800000, compare_at: 6500000, stock: 6 }],
    },
  ],
};

/** beauty — shades, ingredients and routine step in the copy. */
const BEAUTY: DemoCatalog = {
  categories: [
    { slug: "skincare", name: "Skincare" },
    { slug: "makeup", name: "Makeup" },
    { slug: "haircare", name: "Haircare" },
  ],
  collections: [
    { slug: "the-routine", name: "The Routine", description: "Cleanse, treat, protect." },
    { slug: "shade-finder", name: "Shade Finder" },
  ],
  products: [
    {
      slug: "niacinamide-serum",
      title: "Niacinamide 10% + Zinc Serum",
      description:
        "Step 2 — Treat. Niacinamide 10%, zinc PCA 1%, panthenol. Fragrance-free, non-comedogenic, pH 5.5. 30ml.",
      category: "skincare",
      collections: ["the-routine"],
      tags: ["serum", "niacinamide"],
      variants: [{ name: "30ml", sku: "BTY-NIA-30", price: 145000, stock: 60 }],
    },
    {
      slug: "gel-cleanser",
      title: "Gentle Gel Cleanser",
      description: "Step 1 — Cleanse. Coco-glucoside, glycerin, allantoin. Sulphate-free, suits sensitive skin. 150ml.",
      category: "skincare",
      collections: ["the-routine"],
      tags: ["cleanser"],
      variants: [{ name: "150ml", sku: "BTY-CLN-150", price: 98000, stock: 85 }],
    },
    {
      slug: "silk-finish-foundation",
      title: "Silk Finish Foundation",
      description: "Buildable medium coverage, 12h wear, hyaluronic acid + squalane. Six shades across warm and neutral.",
      category: "makeup",
      collections: ["shade-finder"],
      tags: ["foundation", "shades"],
      variants: [
        { name: "120 Porcelain", sku: "BTY-FDN-120", price: 210000, stock: 18 },
        { name: "230 Honey", sku: "BTY-FDN-230", price: 210000, stock: 24 },
        { name: "340 Almond", sku: "BTY-FDN-340", price: 210000, stock: 21 },
        { name: "450 Cocoa", sku: "BTY-FDN-450", price: 210000, stock: 14 },
      ],
    },
    {
      slug: "rice-water-hair-mask",
      title: "Rice Water Hair Mask",
      description: "Weekly treatment. Fermented rice water, amla, hydrolysed keratin. Silicone-free. 200ml.",
      category: "haircare",
      collections: ["the-routine"],
      tags: ["hair", "mask"],
      variants: [{ name: "200ml", sku: "BTY-MSK-200", price: 132000, compare_at: 160000, stock: 35 }],
    },
  ],
};

export const DEMO_CATALOGS = {
  atelier: APPAREL,
  bazaar: MARKETPLACE,
  circuit: ELECTRONICS,
  rupaboti: BEAUTY,
} as const satisfies Record<string, DemoCatalog>;

export type DemoCatalogKey = keyof typeof DEMO_CATALOGS;

/** Falls back to the marketplace spread for any non-blueprint theme key. */
export function demoCatalogFor(themeKey: string): DemoCatalog {
  return DEMO_CATALOGS[themeKey as DemoCatalogKey] ?? MARKETPLACE;
}
