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
  image_url?: string;
};

export type DemoCatalog = {
  categories: { slug: string; name: string; description?: string }[];
  collections: { slug: string; name: string; description?: string }[];
  products: DemoProduct[];
};

/** apparel — sizes, colourways, fabric and model measurements in the copy. */
const APPAREL: DemoCatalog = {
  categories: [
    {
      slug: "womens",
      name: "Women",
      description:
        "Tailored handloom dresses, wide-leg flax trousers and breathable separates.",
    },
    {
      slug: "mens",
      name: "Men",
      description:
        "Relaxed poplin shirts, wild tussar panjabis, unstructured jackets and trousers.",
    },
    {
      slug: "handloom-craft",
      name: "Handloom & Craft",
      description:
        "Heirloom weaves straight from master weaving families in Tangail and Rajshahi.",
    },
    {
      slug: "accessories",
      name: "Accessories & Objects",
      description:
        "Handcrafted brass jewellery, woven stoles and vegetable-tanned leather.",
    },
  ],
  collections: [
    {
      slug: "new-in",
      name: "New In",
      description: "This week's limited studio drops.",
    },
    {
      slug: "everyday-edit",
      name: "The Everyday Edit",
      description: "Breathable wardrobe staples cut for comfort.",
    },
    {
      slug: "artisan-silk",
      name: "Artisan Silk & Handloom",
      description: "Woven on traditional wooden pit looms.",
    },
    {
      slug: "capsule-wardrobe",
      name: "The Capsule Wardrobe",
      description: "Versatile pieces designed to interchange effortlessly.",
    },
  ],
  products: [
    {
      slug: "handloom-cotton-saree",
      title: "Tangail Taant Handloom Cotton Saree",
      description:
        "Woven on a traditional wooden pit loom in Delduar, Tangail. 100% fine combed cotton with contrast zari border. Breathable in humidity, softer with every wash. Includes 80cm unstitched blouse piece. Model is 168cm and wears one size.",
      category: "handloom-craft",
      collections: ["new-in", "artisan-silk"],
      tags: ["cotton", "handloom", "saree", "tangail"],
      image_url: "/api/public/ph/handloom-cotton-saree.svg",
      variants: [
        {
          name: "Indigo",
          sku: "APP-SAR-IND",
          price: 349000,
          compare_at: 420000,
          stock: 12,
        },
        { name: "Terracotta", sku: "APP-SAR-TER", price: 349000, stock: 8 },
        {
          name: "Ochre Olive",
          sku: "APP-SAR-OCH",
          price: 349000,
          compare_at: 420000,
          stock: 10,
        },
      ],
    },
    {
      slug: "oversized-poplin-shirt",
      title: "Oversized Pure Poplin Shirt",
      description:
        "Crisp 120gsm organic cotton poplin, drop shoulder tailoring, genuine mother-of-pearl buttons. Pre-washed for soft hand-feel. Model is 180cm and wears size M.",
      category: "mens",
      collections: ["new-in", "everyday-edit", "capsule-wardrobe"],
      tags: ["shirt", "cotton", "menswear", "oversized"],
      image_url: "/api/public/ph/oversized-poplin-shirt.svg",
      variants: [
        { name: "White / S", sku: "APP-POP-WS", price: 289000, stock: 20 },
        { name: "White / M", sku: "APP-POP-WM", price: 289000, stock: 18 },
        { name: "White / L", sku: "APP-POP-WL", price: 289000, stock: 15 },
        {
          name: "Sage / M",
          sku: "APP-POP-SM",
          price: 289000,
          compare_at: 320000,
          stock: 12,
        },
        {
          name: "Sage / L",
          sku: "APP-POP-SL",
          price: 289000,
          compare_at: 320000,
          stock: 8,
        },
      ],
    },
    {
      slug: "linen-blend-trouser",
      title: "Relaxed Linen Wide-Leg Trouser",
      description:
        "Tailored from 60% Belgian flax linen and 40% natural viscose. Elasticated back waistband with deep side slash pockets and 28in inseam. Model is 172cm and wears size 30.",
      category: "womens",
      collections: ["everyday-edit", "capsule-wardrobe"],
      tags: ["linen", "trouser", "minimalist", "wide-leg"],
      image_url: "/api/public/ph/linen-blend-trouser.svg",
      variants: [
        { name: "Sand / 28", sku: "APP-LIN-S28", price: 329000, stock: 10 },
        { name: "Sand / 30", sku: "APP-LIN-S30", price: 329000, stock: 14 },
        { name: "Sand / 32", sku: "APP-LIN-S32", price: 329000, stock: 12 },
        {
          name: "Charcoal / 30",
          sku: "APP-LIN-C30",
          price: 329000,
          compare_at: 380000,
          stock: 9,
        },
      ],
    },
    {
      slug: "quilted-cotton-jacket",
      title: "Hand-Quilted Nakshi Artisan Jacket",
      description:
        "Hand-quilted running stitch on layered natural cotton by rural craftswomen in Jessore. Features unlined cuffs, two generous patch pockets and horn-button closure. Model is 175cm and wears size M.",
      category: "mens",
      collections: ["new-in", "artisan-silk"],
      tags: ["outerwear", "quilted", "nakshi", "jacket"],
      image_url: "/api/public/ph/quilted-cotton-jacket.svg",
      variants: [
        {
          name: "Charcoal / M",
          sku: "APP-QLT-CM",
          price: 645000,
          compare_at: 720000,
          stock: 8,
        },
        {
          name: "Charcoal / L",
          sku: "APP-QLT-CL",
          price: 645000,
          compare_at: 720000,
          stock: 6,
        },
        {
          name: "Indigo / M",
          sku: "APP-QLT-IM",
          price: 645000,
          compare_at: 720000,
          stock: 7,
        },
      ],
    },
    {
      slug: "dhakai-jamdani-silk-saree",
      title: "Heritage Dhakai Jamdani Silk Saree",
      description:
        "Authentic Sonargaon hand-loomed Jamdani with intricate floral jall motifs. Spun from fine mulberry silk and metallic threads over 140 artisan loom hours. Model is 170cm and wears one size.",
      category: "handloom-craft",
      collections: ["new-in", "artisan-silk"],
      tags: ["jamdani", "silk", "heritage", "handloom"],
      image_url: "/api/public/ph/dhakai-jamdani-silk-saree.svg",
      variants: [
        {
          name: "Crimson Gold",
          sku: "APP-JAM-CRG",
          price: 1450000,
          compare_at: 1680000,
          stock: 5,
        },
        {
          name: "Midnight Emerald",
          sku: "APP-JAM-MDE",
          price: 1450000,
          compare_at: 1680000,
          stock: 4,
        },
      ],
    },
    {
      slug: "tussar-silk-kurta",
      title: "Hand-Embroidered Tussar Silk Kurta",
      description:
        "Pure Rajshahi wild tussar silk featuring delicate kantha stitch along the placket and mandarin collar. Natural textured drape. Model is 182cm and wears size 40.",
      category: "mens",
      collections: ["everyday-edit", "artisan-silk"],
      tags: ["kurta", "panjabi", "tussar", "silk"],
      image_url: "/api/public/ph/tussar-silk-kurta.svg",
      variants: [
        {
          name: "Natural Raw / 38",
          sku: "APP-TUS-N38",
          price: 485000,
          compare_at: 550000,
          stock: 10,
        },
        {
          name: "Natural Raw / 40",
          sku: "APP-TUS-N40",
          price: 485000,
          compare_at: 550000,
          stock: 12,
        },
        {
          name: "Natural Raw / 42",
          sku: "APP-TUS-N42",
          price: 485000,
          compare_at: 550000,
          stock: 8,
        },
      ],
    },
    {
      slug: "pleated-wrap-dress",
      title: "Organic Khadi Pleated Wrap Dress",
      description:
        "Handspun khadi cotton dyed with botanical pigments. Kimono sleeve, asymmetric wrap closure and soft waist tie. Model is 174cm and wears size S.",
      category: "womens",
      collections: ["everyday-edit", "capsule-wardrobe"],
      tags: ["dress", "khadi", "organic", "wrap"],
      image_url: "/api/public/ph/pleated-wrap-dress.svg",
      variants: [
        {
          name: "Terracotta / S",
          sku: "APP-WRP-TS",
          price: 420000,
          compare_at: 480000,
          stock: 11,
        },
        {
          name: "Terracotta / M",
          sku: "APP-WRP-TM",
          price: 420000,
          compare_at: 480000,
          stock: 9,
        },
        {
          name: "Ochre Clay / M",
          sku: "APP-WRP-OM",
          price: 420000,
          compare_at: 480000,
          stock: 7,
        },
      ],
    },
    {
      slug: "raw-silk-bandhgala-blazer",
      title: "Tailored Raw Silk Bandhgala Blazer",
      description:
        "Structured unlined jacket cut from heavyweight hand-spun Matka raw silk. Finished with bespoke brass buttons and clean welt pockets. Model is 185cm and wears size 40.",
      category: "mens",
      collections: ["new-in", "capsule-wardrobe"],
      tags: ["blazer", "jacket", "silk", "tailored"],
      image_url: "/api/public/ph/raw-silk-bandhgala-blazer.svg",
      variants: [
        {
          name: "Slate Grey / 38",
          sku: "APP-BND-S38",
          price: 890000,
          compare_at: 1050000,
          stock: 6,
        },
        {
          name: "Slate Grey / 40",
          sku: "APP-BND-S40",
          price: 890000,
          compare_at: 1050000,
          stock: 8,
        },
        {
          name: "Deep Navy / 40",
          sku: "APP-BND-N40",
          price: 890000,
          compare_at: 1050000,
          stock: 5,
        },
      ],
    },
    {
      slug: "hand-dyed-indigo-kimono",
      title: "Botanical Indigo Hand-Dyed Robe",
      description:
        "Dyed in fermented natural indigo vats in Jamalpur. 100% breathable cotton cambric with self-fabric sash and generous deep pockets. Model is 176cm and wears one size.",
      category: "womens",
      collections: ["new-in", "everyday-edit"],
      tags: ["indigo", "robe", "kimono", "botanical"],
      image_url: "/api/public/ph/hand-dyed-indigo-kimono.svg",
      variants: [
        {
          name: "Deep Indigo",
          sku: "APP-ROB-IND",
          price: 385000,
          compare_at: 450000,
          stock: 14,
        },
        {
          name: "Shibori Wave",
          sku: "APP-ROB-SHB",
          price: 425000,
          compare_at: 490000,
          stock: 8,
        },
      ],
    },
    {
      slug: "chanderi-silk-dupatta",
      title: "Featherweight Chanderi Silk Stole",
      description:
        "Translucent handloom cotton-silk blend with woven zari geometric end borders. Designed as an effortless finishing layer. Length 2.4m. Hand wash cold only.",
      category: "accessories",
      collections: ["artisan-silk", "capsule-wardrobe"],
      tags: ["dupatta", "stole", "chanderi", "silk"],
      image_url: "/api/public/ph/chanderi-silk-dupatta.svg",
      variants: [
        {
          name: "Pale Gold",
          sku: "APP-DUP-GLD",
          price: 195000,
          compare_at: 240000,
          stock: 16,
        },
        {
          name: "Dusty Rose",
          sku: "APP-DUP-RSE",
          price: 195000,
          compare_at: 240000,
          stock: 12,
        },
      ],
    },
    {
      slug: "brass-filigree-cuff",
      title: "Hand-Engraved Brass Filigree Cuff",
      description:
        "Crafted by heritage metal artisans in Dhamrai. Pierced and hand-carved solid brass with 22k antique gold electroplate and satin brushed finish. Fits wrists up to 18cm.",
      category: "accessories",
      collections: ["new-in", "capsule-wardrobe"],
      tags: ["jewelry", "brass", "filigree", "artisan"],
      image_url: "/api/public/ph/brass-filigree-cuff.svg",
      variants: [
        { name: "Antique Gold", sku: "APP-JWL-CUF", price: 220000, stock: 20 },
      ],
    },
    {
      slug: "minimalist-leather-tote",
      title: "Full-Grain Vegetable Tanned Leather Tote",
      description:
        "Constructed from 2.2mm supple vegetable-tanned leather in Hazaribagh. Raw interior, reinforced handles with 10in drop, interior slip phone pocket. W40cm x H36cm x D12cm.",
      category: "accessories",
      collections: ["everyday-edit", "capsule-wardrobe"],
      tags: ["leather", "tote", "bag", "handcrafted"],
      image_url: "/api/public/ph/minimalist-leather-tote.svg",
      variants: [
        {
          name: "Cognac Tan",
          sku: "APP-BAG-COG",
          price: 750000,
          compare_at: 890000,
          stock: 9,
        },
        {
          name: "Espresso Black",
          sku: "APP-BAG-BLK",
          price: 750000,
          compare_at: 890000,
          stock: 7,
        },
      ],
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
    {
      slug: "todays-deals",
      name: "Today's Deals",
      description: "Time-limited price drops.",
    },
    { slug: "best-sellers", name: "Best Sellers" },
  ],
  products: [
    {
      slug: "stainless-steel-cookware-set",
      title: "5-Piece Stainless Steel Cookware Set",
      description:
        "Tri-ply base, induction-ready, dishwasher safe. Includes two saucepans, a kadai and lids.",
      category: "home",
      collections: ["todays-deals", "best-sellers"],
      tags: ["kitchen", "cookware"],
      variants: [
        {
          name: "5-piece",
          sku: "MKT-CKW-5",
          price: 489000,
          compare_at: 650000,
          stock: 30,
        },
      ],
    },
    {
      slug: "premium-basmati-rice-5kg",
      title: "Premium Basmati Rice 5kg",
      description:
        "Aged 12 months, extra-long grain, sourced from a single mill.",
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
      description:
        "Hybrid active noise cancellation, 32h with case, USB-C, IPX5.",
      category: "gadgets",
      collections: ["todays-deals"],
      tags: ["audio", "anc"],
      variants: [
        {
          name: "Black",
          sku: "MKT-EAR-BLK",
          price: 349000,
          compare_at: 449000,
          stock: 45,
        },
      ],
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
      variants: [
        { name: "White", sku: "MKT-FAN-WHT", price: 275000, stock: 22 },
      ],
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
    {
      slug: "emi-available",
      name: "EMI Available",
      description: "0% EMI up to 12 months.",
    },
    { slug: "just-launched", name: "Just Launched" },
  ],
  products: [
    {
      slug: "ultrabook-14-i7",
      title: 'Ultrabook 14" Core i7',
      description:
        "14in 2.8K OLED 120Hz · Core i7-13700H · 16GB LPDDR5 · 1TB NVMe · 75Wh · 1.29kg. 2-year international warranty.",
      category: "laptops",
      collections: ["emi-available", "just-launched"],
      tags: ["laptop", "oled", "emi"],
      variants: [
        {
          name: "16GB / 1TB",
          sku: "ELC-UB14-16-1T",
          price: 16500000,
          stock: 7,
        },
        {
          name: "32GB / 2TB",
          sku: "ELC-UB14-32-2T",
          price: 19900000,
          stock: 3,
        },
      ],
    },
    {
      slug: "over-ear-anc-headphones",
      title: "Over-Ear ANC Headphones",
      description:
        "40mm drivers · LDAC · 45dB hybrid ANC · 40h playback · multipoint. 1-year warranty.",
      category: "audio",
      collections: ["emi-available"],
      tags: ["headphones", "anc"],
      variants: [
        {
          name: "Graphite",
          sku: "ELC-HP-GRA",
          price: 2450000,
          compare_at: 2900000,
          stock: 15,
        },
        { name: "Silver", sku: "ELC-HP-SIL", price: 2450000, stock: 9 },
      ],
    },
    {
      slug: "gan-charger-100w",
      title: "100W GaN Charger",
      description:
        "2× USB-C PD 3.1 + 1× USB-A · foldable pins · 100W total. 18-month warranty.",
      category: "accessories",
      collections: ["just-launched"],
      tags: ["charger", "gan", "usb-c"],
      variants: [
        { name: "100W", sku: "ELC-GAN-100", price: 620000, stock: 40 },
      ],
    },
    {
      slug: "27-inch-4k-monitor",
      title: '27" 4K IPS Monitor',
      description:
        "3840×2160 · 144Hz · 95% DCI-P3 · HDMI 2.1 + USB-C 90W PD. 3-year panel warranty.",
      category: "accessories",
      collections: ["emi-available"],
      tags: ["monitor", "4k", "emi"],
      variants: [
        {
          name: "27in 4K",
          sku: "ELC-MON-27",
          price: 5800000,
          compare_at: 6500000,
          stock: 6,
        },
      ],
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
    {
      slug: "the-routine",
      name: "The Routine",
      description: "Cleanse, treat, protect.",
    },
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
      description:
        "Step 1 — Cleanse. Coco-glucoside, glycerin, allantoin. Sulphate-free, suits sensitive skin. 150ml.",
      category: "skincare",
      collections: ["the-routine"],
      tags: ["cleanser"],
      variants: [
        { name: "150ml", sku: "BTY-CLN-150", price: 98000, stock: 85 },
      ],
    },
    {
      slug: "silk-finish-foundation",
      title: "Silk Finish Foundation",
      description:
        "Buildable medium coverage, 12h wear, hyaluronic acid + squalane. Six shades across warm and neutral.",
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
      description:
        "Weekly treatment. Fermented rice water, amla, hydrolysed keratin. Silicone-free. 200ml.",
      category: "haircare",
      collections: ["the-routine"],
      tags: ["hair", "mask"],
      variants: [
        {
          name: "200ml",
          sku: "BTY-MSK-200",
          price: 132000,
          compare_at: 160000,
          stock: 35,
        },
      ],
    },
  ],
};

/** Aarong-grade heritage apparel, handloom sarees, silk panjabis and living crafts. */
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
