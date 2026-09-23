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
const HANDLOOM_APPAREL: DemoCatalog = {
  categories: [
    {
      slug: "womens",
      name: "Women's Wear",
      description: "Authentic sarees, salwars and artisanal tunics.",
    },
    {
      slug: "mens",
      name: "Men's Wear",
      description: "Fine silk and khadi panjabis, kurtas and waistcoats.",
    },
    {
      slug: "kids",
      name: "Kids & Teens",
      description:
        "Festive attire and handloom garments for young celebrations.",
    },
    {
      slug: "living",
      name: "Living & Crafts",
      description: "Nakshi kantha quilts, ceramics and heritage home textiles.",
    },
    {
      slug: "jewelry",
      name: "Handcrafted Jewelry",
      description: "Traditional filigree and brass jewelry by master artisans.",
    },
    {
      slug: "taaga",
      name: "Taaga & Taaga Man",
      description: "Bohemian youth fusion and modern urban relaxed wear.",
    },
    {
      slug: "beauty",
      name: "Aarong Earth",
      description:
        "Pure botanical wellness, handmade cold-pressed soaps and herbal skincare.",
    },
  ],
  collections: [
    {
      slug: "heritage-handloom",
      name: "Heritage Handloom",
      description: "Authentic Tangail and Jamdani weaves.",
    },
    {
      slug: "eid-festive",
      name: "Eid & Festive Collection",
      description: "Celebrate occasions in timeless elegance.",
    },
    {
      slug: "nakshi-kantha",
      name: "Nakshi Kantha Art",
      description: "Generational folk embroidery from rural Bengal.",
    },
    {
      slug: "artisan-essentials",
      name: "Artisan Essentials",
      description: "Slow, conscious craftsmanship for everyday elegance.",
    },
    {
      slug: "taaga-fusion",
      name: "Taaga Bohemian Fusion",
      description:
        "Contemporary cuts, earthy dyes and modern ethnic silhouettes.",
    },
    {
      slug: "aarong-earth",
      name: "Aarong Earth Botanical Wellness",
      description:
        "Handmade organic skincare rooted in Bengal's herbal wisdom.",
    },
    {
      slug: "new-in",
      name: "New Festive Arrivals",
      description: "Freshly off the looms for this festive season.",
    },
    {
      slug: "best-sellers",
      name: "Trending & Best Sellers",
      description: "Customer favorite artisan masterpieces.",
    },
    {
      slug: "womens",
      name: "Women's Wear",
      description: "Sarees, salwars and artisanal tunics.",
    },
    {
      slug: "mens",
      name: "Men's Wear",
      description: "Silk and khadi panjabis, kurtas and waistcoats.",
    },
    {
      slug: "kids",
      name: "Kids & Teens",
      description: "Festive handloom garments for the young.",
    },
    {
      slug: "living",
      name: "Living & Crafts",
      description: "Nakshi kantha quilts and home textiles.",
    },
    {
      slug: "jewelry",
      name: "Handcrafted Jewelry",
      description: "Filigree and brass by master artisans.",
    },
    {
      slug: "taaga",
      name: "Taaga & Taaga Man",
      description: "Bohemian fusion and relaxed urban wear.",
    },
    {
      slug: "taaga-man",
      name: "Taaga Man",
      description: "Relaxed menswear with an artisan soul.",
    },
    {
      slug: "herstory",
      name: "Herstory",
      description: "Womenswear celebrating her story.",
    },
    {
      slug: "beauty",
      name: "Aarong Earth",
      description: "Botanical wellness and herbal skincare.",
    },
    {
      slug: "festive-sale",
      name: "Festive Sale",
      description: "Discounted festive edits, limited batches.",
    },
    {
      slug: "wedding",
      name: "Wedding & Occasion Wear",
      description: "Bridal sarees, groom panjabis and gifting.",
    },
    {
      slug: "home-decor",
      name: "Home & Living Crafts",
      description: "Quilts, ceramics and artisan decor.",
    },
    {
      slug: "bridal-sarees",
      name: "Bridal Sarees",
      description: "Jamdani and katan sarees for the big day.",
    },
    {
      slug: "groom-panjabis",
      name: "Groom Panjabis",
      description: "Silk panjabis cut for celebrations.",
    },
    {
      slug: "festive-gifting",
      name: "Festive Gifting",
      description: "Jewelry, wellness and keepsakes to gift.",
    },
  ],
  products: [
    {
      slug: "tangail-taant-cotton-saree",
      title: "Tangail Taant Handloom Cotton Saree",
      description:
        "Woven on a traditional wooden pit loom in Delduar, Tangail. 100% fine combed cotton with contrast zari border. Includes 80cm unstitched blouse piece. Model is 168cm.",
      category: "womens",
      collections: ["heritage-handloom", "eid-festive", "bridal-sarees", "festive-sale", "herstory", "wedding", "womens"],
      tags: ["saree", "handloom", "cotton", "tangail"],
      image_url: "/api/public/ph/womens/tangail-taant-cotton-saree.svg",
      variants: [
        {
          name: "Crimson Red & Gold",
          sku: "HRT-TGT-RED",
          price: 385000,
          compare_at: 450000,
          stock: 25,
        },
        {
          name: "Royal Indigo & Ivory",
          sku: "HRT-TGT-IND",
          price: 385000,
          compare_at: 450000,
          stock: 18,
        },
        {
          name: "Mustard Yellow & Charcoal",
          sku: "HRT-TGT-MUS",
          price: 385000,
          compare_at: 450000,
          stock: 12,
        },
      ],
    },
    {
      slug: "dhakai-jamdani-silk-saree",
      title: "Dhakai Jamdani Heritage Saree",
      description:
        "Authentic Sonargaon Dhakai Jamdani featuring geometric flora motifs. Handcrafted by master weavers using fine mulberry silk and metallic threads. Dry clean only.",
      category: "womens",
      collections: ["heritage-handloom", "eid-festive", "bridal-sarees", "festive-sale", "herstory", "wedding", "womens"],
      tags: ["jamdani", "silk", "saree", "heritage"],
      image_url: "/ph/songoskriti/prod-saree.png",
      variants: [
        {
          name: "Emerald Green & Rose Gold",
          sku: "HRT-JMD-EMR",
          price: 1850000,
          compare_at: 2200000,
          stock: 6,
        },
        {
          name: "Midnight Black & Antique Gold",
          sku: "HRT-JMD-BLK",
          price: 1850000,
          compare_at: 2200000,
          stock: 8,
        },
      ],
    },
    {
      slug: "pure-silk-embroidered-panjabi",
      title: "Pure Silk Embroidered Panjabi",
      description:
        "Tailored from pure Rajshahi silk with subtle kantha embroidery along the placket and cuffs. Finished with genuine mother-of-pearl buttons. Model is 182cm wearing size 40.",
      category: "mens",
      collections: ["eid-festive", "artisan-essentials", "festive-sale", "groom-panjabis", "mens", "taaga-man", "wedding"],
      tags: ["panjabi", "silk", "rajshahi", "mens"],
      image_url: "/ph/songoskriti/prod-panjabi.png",
      variants: [
        {
          name: "Size 38 - Pearl Ivory",
          sku: "HRT-PNJ-38IV",
          price: 495000,
          compare_at: 580000,
          stock: 20,
        },
        {
          name: "Size 40 - Pearl Ivory",
          sku: "HRT-PNJ-40IV",
          price: 495000,
          compare_at: 580000,
          stock: 30,
        },
        {
          name: "Size 42 - Pearl Ivory",
          sku: "HRT-PNJ-42IV",
          price: 495000,
          compare_at: 580000,
          stock: 25,
        },
        {
          name: "Size 44 - Pearl Ivory",
          sku: "HRT-PNJ-44IV",
          price: 495000,
          compare_at: 580000,
          stock: 15,
        },
        {
          name: "Size 40 - Midnight Navy",
          sku: "HRT-PNJ-40NV",
          price: 495000,
          compare_at: 580000,
          stock: 18,
        },
        {
          name: "Size 42 - Midnight Navy",
          sku: "HRT-PNJ-42NV",
          price: 495000,
          compare_at: 580000,
          stock: 22,
        },
      ],
    },
    {
      slug: "handcrafted-nakshi-kantha-quilt",
      title: "Handcrafted Nakshi Kantha Quilt",
      description:
        "Heritage folk embroidery hand-stitched by rural women artisans of Jessore. Over 180 hours of meticulous running-stitch needlework on layered natural cotton.",
      category: "living",
      collections: ["nakshi-kantha", "heritage-handloom", "festive-sale", "home-decor", "living"],
      tags: ["nakshi kantha", "quilt", "living", "handcrafted"],
      image_url: "/api/public/ph/living/handcrafted-nakshi-kantha-quilt.svg",
      variants: [
        {
          name: "Queen (88x96 in) - Tree of Life",
          sku: "HRT-NKS-Q01",
          price: 850000,
          compare_at: 980000,
          stock: 10,
        },
        {
          name: "King (108x108 in) - Folk Floral",
          sku: "HRT-NKS-K01",
          price: 1150000,
          compare_at: 1350000,
          stock: 7,
        },
      ],
    },
    {
      slug: "brass-filigree-chandbali-earrings",
      title: "Hand-Engraved Brass Filigree Earrings",
      description:
        "Traditional artisan metalcraft from Dhamrai. Hand-cut and engraved brass with 22k antique gold plating and freshwater pearl droplets.",
      category: "jewelry",
      collections: ["eid-festive", "artisan-essentials", "festive-gifting", "festive-sale", "jewelry", "wedding"],
      tags: ["jewelry", "brass", "filigree", "earrings"],
      image_url: "/ph/songoskriti/prod-necklace.png",
      variants: [
        {
          name: "Antique Gold & Pearl",
          sku: "HRT-JWL-01",
          price: 185000,
          compare_at: 220000,
          stock: 40,
        },
      ],
    },
    {
      slug: "mirpur-katan-silk-saree",
      title: "Mirpur Katan Silk Festive Saree",
      description:
        "Traditional Mirpur Benarasi Katan silk saree woven with floral zari jaal and ornate pallu. Handcrafted with dyed mulberry silk warp and pure metallic zari weft for grand occasions.",
      category: "womens",
      collections: ["eid-festive", "heritage-handloom", "bridal-sarees", "festive-sale", "herstory", "wedding", "womens"],
      tags: ["katan", "silk", "saree", "mirpur", "festive"],
      image_url: "/api/public/ph/womens/mirpur-katan-silk-saree.svg",
      variants: [
        {
          name: "Burgundy Maroon & Antique Gold",
          sku: "HRT-KTN-MRN",
          price: 1450000,
          compare_at: 1650000,
          stock: 8,
        },
        {
          name: "Deep Royal Blue & Silver Zari",
          sku: "HRT-KTN-BLU",
          price: 1450000,
          compare_at: 1650000,
          stock: 6,
        },
      ],
    },
    {
      slug: "comilla-handspun-khadi-kurta",
      title: "Comilla Hand-Spun Khadi Kurta",
      description:
        "Crafted from authentic hand-spun and hand-woven Comilla Khadi cotton. Natural texture with breathable comfort, styled with wooden coconut-shell buttons. Model is 178cm wearing size 40.",
      category: "mens",
      collections: ["artisan-essentials", "heritage-handloom", "festive-sale", "groom-panjabis", "mens", "taaga-man"],
      tags: ["khadi", "kurta", "cotton", "mens", "handloom"],
      image_url: "/api/public/ph/mens/comilla-handspun-khadi-kurta.svg",
      variants: [
        {
          name: "Size 38 - Natural Off-White",
          sku: "HRT-KHD-38OW",
          price: 285000,
          compare_at: 320000,
          stock: 18,
        },
        {
          name: "Size 40 - Natural Off-White",
          sku: "HRT-KHD-40OW",
          price: 285000,
          compare_at: 320000,
          stock: 24,
        },
        {
          name: "Size 42 - Natural Off-White",
          sku: "HRT-KHD-42OW",
          price: 285000,
          compare_at: 320000,
          stock: 20,
        },
        {
          name: "Size 40 - Olive Sage",
          sku: "HRT-KHD-40OL",
          price: 285000,
          compare_at: 320000,
          stock: 15,
        },
      ],
    },
    {
      slug: "artisan-block-print-muslin-dupatta",
      title: "Hand-Block Printed Fine Muslin Dupatta",
      description:
        "Featherlight Bengal muslin embellished with geometric woodblock motifs using organic indigo and madder root dyes. Hand-tasseled borders by artisan craft clusters.",
      category: "womens",
      collections: ["artisan-essentials", "eid-festive", "festive-sale", "herstory", "wedding", "womens"],
      tags: ["muslin", "dupatta", "blockprint", "natural-dye", "womens"],
      image_url: "/api/public/ph/womens/artisan-block-print-muslin-dupatta.svg",
      variants: [
        {
          name: "Indigo Blue & White",
          sku: "HRT-DUP-IND",
          price: 225000,
          compare_at: 260000,
          stock: 30,
        },
        {
          name: "Madder Terracotta & Beige",
          sku: "HRT-DUP-TER",
          price: 225000,
          compare_at: 260000,
          stock: 22,
        },
      ],
    },
    {
      slug: "embroidered-silk-salwar-suit",
      title: "Embroidered Pure Silk Salwar Suit",
      description:
        "Luxurious three-piece ensemble crafted from pure Rajshahi silk with delicate zari and resham thread embroidery. Accompanied by silk trousers and a printed organza dupatta. Dry clean only.",
      category: "womens",
      collections: ["eid-festive", "heritage-handloom", "festive-sale", "herstory", "wedding", "womens"],
      tags: ["silk", "salwar", "kameez", "festive", "womens"],
      image_url: "/api/public/ph/womens/embroidered-silk-salwar-suit.svg",
      variants: [
        {
          name: "Size 36 - Ruby Crimson",
          sku: "HRT-SLW-36RB",
          price: 950000,
          compare_at: 1100000,
          stock: 12,
        },
        {
          name: "Size 38 - Ruby Crimson",
          sku: "HRT-SLW-38RB",
          price: 950000,
          compare_at: 1100000,
          stock: 15,
        },
        {
          name: "Size 40 - Ruby Crimson",
          sku: "HRT-SLW-40RB",
          price: 950000,
          compare_at: 1100000,
          stock: 10,
        },
        {
          name: "Size 38 - Sage Pistachio",
          sku: "HRT-SLW-38SG",
          price: 950000,
          compare_at: 1100000,
          stock: 14,
        },
      ],
    },
    {
      slug: "tussar-silk-festive-koti",
      title: "Tussar Silk Festive Waistcoat Koti",
      description:
        "Sleeveless festive layering waistcoat tailored from textured wild Tussar silk. Features mandarin collar, welt pockets, and antique metal buttons. Model is 180cm wearing size 40.",
      category: "mens",
      collections: ["eid-festive", "artisan-essentials", "festive-sale", "mens", "taaga-man", "wedding"],
      tags: ["koti", "waistcoat", "tussar", "silk", "mens"],
      image_url: "/api/public/ph/mens/tussar-silk-festive-koti.svg",
      variants: [
        {
          name: "Size 38 - Natural Golden Tussar",
          sku: "HRT-KOT-38GT",
          price: 385000,
          compare_at: 440000,
          stock: 16,
        },
        {
          name: "Size 40 - Natural Golden Tussar",
          sku: "HRT-KOT-40GT",
          price: 385000,
          compare_at: 440000,
          stock: 20,
        },
        {
          name: "Size 42 - Natural Golden Tussar",
          sku: "HRT-KOT-42GT",
          price: 385000,
          compare_at: 440000,
          stock: 18,
        },
        {
          name: "Size 40 - Charcoal Black",
          sku: "HRT-KOT-40CH",
          price: 385000,
          compare_at: 440000,
          stock: 15,
        },
      ],
    },
    {
      slug: "handcrafted-terracotta-dining-set",
      title: "Handcrafted Clay & Ceramic Tableware Set",
      description:
        "Artisan clay pottery and tableware wheel-thrown by heritage potters in Rayer Bazar. Glazed with lead-free food-safe finish and kiln-fired for durability. Set of 6 bowls and 1 serving platter.",
      category: "living",
      collections: ["heritage-handloom", "artisan-essentials", "festive-sale", "home-decor", "living"],
      tags: ["terracotta", "pottery", "tableware", "living", "handcrafted"],
      image_url: "/api/public/ph/living/handcrafted-terracotta-dining-set.svg",
      variants: [
        {
          name: "7-Piece Dinner Set - Earth Ochre",
          sku: "HRT-POT-OCH",
          price: 420000,
          compare_at: 480000,
          stock: 12,
        },
        {
          name: "7-Piece Dinner Set - Slate Glaze",
          sku: "HRT-POT-SLT",
          price: 450000,
          compare_at: 520000,
          stock: 8,
        },
      ],
    },
    {
      slug: "casual-cotton-summer-fotua",
      title: "Fine Cotton Casual Summer Fotua",
      description:
        "Airy and lightweight short-sleeved casual fotua handwoven from breathable Bangladeshi cotton. Styled with band collar, relaxed silhouette, and coconut shell buttons for everyday ease.",
      category: "mens",
      collections: ["artisan-essentials", "festive-sale", "mens", "taaga-man"],
      tags: ["fotua", "cotton", "casual", "mens", "summer"],
      image_url: "/api/public/ph/mens/casual-cotton-summer-fotua.svg",
      variants: [
        {
          name: "Size M - Sky Blue Melange",
          sku: "HRT-FOT-MSKY",
          price: 165000,
          compare_at: 195000,
          stock: 25,
        },
        {
          name: "Size L - Sky Blue Melange",
          sku: "HRT-FOT-LSKY",
          price: 165000,
          compare_at: 195000,
          stock: 30,
        },
        {
          name: "Size XL - Sky Blue Melange",
          sku: "HRT-FOT-XSKY",
          price: 165000,
          compare_at: 195000,
          stock: 20,
        },
        {
          name: "Size L - Olive Khadi Stripe",
          sku: "HRT-FOT-LOLV",
          price: 165000,
          compare_at: 195000,
          stock: 22,
        },
      ],
    },
    {
      slug: "hand-painted-silk-festive-saree",
      title: "Hand-Painted Pure Silk Festive Saree",
      description:
        "Pure Rajshahi mulberry silk draped in artistic floral motifs hand-painted with eco-friendly dyes by women artisans. Features a lustrous drape and coordinated unstitched blouse fabric.",
      category: "womens",
      collections: ["new-in", "heritage-handloom", "eid-festive", "bridal-sarees", "festive-sale", "herstory", "wedding", "womens"],
      tags: ["silk", "saree", "handpainted", "festive", "womens"],
      image_url: "/api/public/ph/womens/hand-painted-silk-festive-saree.svg",
      variants: [
        {
          name: "Blush Peach & Gold",
          sku: "HRT-PNT-PCH",
          price: 1250000,
          compare_at: 1450000,
          stock: 10,
        },
        {
          name: "Ivory Cream & Sage",
          sku: "HRT-PNT-CRM",
          price: 1250000,
          compare_at: 1450000,
          stock: 8,
        },
      ],
    },
    {
      slug: "fine-poplin-formal-pajama",
      title: "Fine Poplin Cotton Formal Pajama Trouser",
      description:
        "Essential companion for festive panjabis. Tailored from 100% breathable poplin cotton with elasticated drawstring waistband and deep side pockets. Cut for crisp drape and ease.",
      category: "mens",
      collections: ["artisan-essentials", "best-sellers", "festive-sale", "mens", "taaga-man"],
      tags: ["pajama", "cotton", "mens", "essentials"],
      image_url: "/api/public/ph/mens/fine-poplin-formal-pajama.svg",
      variants: [
        {
          name: "Size 38 - Crisp White",
          sku: "HRT-PJM-38W",
          price: 125000,
          compare_at: 150000,
          stock: 35,
        },
        {
          name: "Size 40 - Crisp White",
          sku: "HRT-PJM-40W",
          price: 125000,
          compare_at: 150000,
          stock: 40,
        },
        {
          name: "Size 42 - Crisp White",
          sku: "HRT-PJM-42W",
          price: 125000,
          compare_at: 150000,
          stock: 30,
        },
      ],
    },
    {
      slug: "girls-embroidered-silk-ghagra-choli",
      title: "Girls Embroidered Silk Ghagra Choli Set",
      description:
        "Festive three-piece ensemble for young celebrations. Pure silk choli with delicate threadwork, flared ghagra skirt with metallic lace border, and a contrast featherlight dupatta.",
      category: "kids",
      collections: ["eid-festive", "new-in", "festive-sale", "kids", "wedding"],
      tags: ["kids", "ghagra", "choli", "silk", "girls", "festive"],
      image_url: "/api/public/ph/kids/girls-embroidered-silk-ghagra-choli.svg",
      variants: [
        {
          name: "Age 6-8 Yrs - Coral Rose",
          sku: "HRT-KID-06CR",
          price: 425000,
          compare_at: 490000,
          stock: 15,
        },
        {
          name: "Age 8-10 Yrs - Coral Rose",
          sku: "HRT-KID-08CR",
          price: 450000,
          compare_at: 520000,
          stock: 18,
        },
        {
          name: "Age 10-12 Yrs - Coral Rose",
          sku: "HRT-KID-10CR",
          price: 485000,
          compare_at: 550000,
          stock: 12,
        },
      ],
    },
    {
      slug: "hand-carved-brass-incense-burner",
      title: "Hand-Carved Brass Incense Burner & Candle Set",
      description:
        "Artisan cast-brass ritual incense burner and decorative candle stand hand-etched by the master coppersmiths of Dhamrai. Antiqued patina with perforated floral lid for fragrant living.",
      category: "living",
      collections: ["artisan-essentials", "best-sellers", "festive-sale", "home-decor", "living"],
      tags: ["brass", "decor", "living", "handcrafted", "incense"],
      image_url: "/api/public/ph/living/hand-carved-brass-incense-burner.svg",
      variants: [
        {
          name: "2-Piece Artisan Brass Set",
          sku: "HRT-DEC-BRS",
          price: 295000,
          compare_at: 350000,
          stock: 20,
        },
      ],
    },
    {
      slug: "taaga-bohemian-hand-embroidered-kurti",
      title: "Taaga Bohemian Hand-Embroidered Tunic Kurti",
      description:
        "Effortless youth contemporary style by Taaga. Cut from breathable handspun cotton with geometric kantha yoke embroidery, tassel tie neckline, and relaxed bell sleeves. Pair with denim or cigarette pants.",
      category: "taaga",
      collections: ["taaga-fusion", "new-in", "festive-gifting", "festive-sale", "taaga"],
      tags: ["taaga", "kurti", "tunic", "boho", "womens", "cotton"],
      image_url: "/api/public/ph/taaga/taaga-bohemian-hand-embroidered-kurti.svg",
      variants: [
        {
          name: "Size S - Rust Ochre",
          sku: "TGA-KRT-SRST",
          price: 245000,
          compare_at: 285000,
          stock: 25,
        },
        {
          name: "Size M - Rust Ochre",
          sku: "TGA-KRT-MRST",
          price: 245000,
          compare_at: 285000,
          stock: 35,
        },
        {
          name: "Size L - Rust Ochre",
          sku: "TGA-KRT-LRST",
          price: 245000,
          compare_at: 285000,
          stock: 20,
        },
        {
          name: "Size M - Forest Emerald",
          sku: "TGA-KRT-MEMR",
          price: 245000,
          compare_at: 285000,
          stock: 28,
        },
      ],
    },
    {
      slug: "taaga-man-relaxed-linen-mandarin-shirt",
      title: "Taaga Man Relaxed Linen Mandarin Collar Shirt",
      description:
        "Contemporary urban casual wear for men by Taaga Man. Premium pre-washed breathable linen-cotton blend with wooden button detail, welt chest pocket, and rolled-tab cuffs for tropical ease.",
      category: "taaga",
      collections: ["taaga-fusion", "artisan-essentials", "festive-gifting", "festive-sale", "taaga"],
      tags: ["taaga", "mens", "linen", "shirt", "casual"],
      image_url: "/api/public/ph/taaga/taaga-man-relaxed-linen-mandarin-shirt.svg",
      variants: [
        {
          name: "Size M - Natural Sand",
          sku: "TGM-SHT-MSND",
          price: 225000,
          compare_at: 265000,
          stock: 30,
        },
        {
          name: "Size L - Natural Sand",
          sku: "TGM-SHT-LSND",
          price: 225000,
          compare_at: 265000,
          stock: 35,
        },
        {
          name: "Size XL - Natural Sand",
          sku: "TGM-SHT-XSND",
          price: 225000,
          compare_at: 265000,
          stock: 20,
        },
        {
          name: "Size L - Indigo Slub",
          sku: "TGM-SHT-LIND",
          price: 225000,
          compare_at: 265000,
          stock: 25,
        },
      ],
    },
    {
      slug: "aarong-earth-sandalwood-turmeric-handmade-soap",
      title: "Aarong Earth Sandalwood & Wild Turmeric Cold-Pressed Soap",
      description:
        "Authentic herbal bath bar from Aarong Earth. Handcrafted with cold-pressed virgin coconut oil, pure Mysore sandalwood paste, and wild Kasturi turmeric. 100% vegan, SLS and paraben free.",
      category: "beauty",
      collections: ["aarong-earth", "best-sellers", "beauty", "festive-gifting", "festive-sale"],
      tags: [
        "beauty",
        "soap",
        "herbal",
        "sandalwood",
        "turmeric",
        "aarong-earth",
      ],
      image_url:
        "/api/public/ph/aarong-earth-sandalwood-turmeric-handmade-soap.svg",
      variants: [
        {
          name: "125g Herbal Bar",
          sku: "AE-SOP-SND125",
          price: 32000,
          compare_at: 38000,
          stock: 120,
        },
        {
          name: "Set of 3 Gift Pack (3x125g)",
          sku: "AE-SOP-SNDSET3",
          price: 88000,
          compare_at: 96000,
          stock: 60,
        },
      ],
    },
    {
      slug: "aarong-earth-wild-rose-ubtan-radiance-kit",
      title: "Aarong Earth Wild Rose Water & Herbal Ubtan Glow Kit",
      description:
        "Complete traditional bridal skincare ritual by Aarong Earth. Includes pure steam-distilled Kashmiri rose water mist (100ml) and slow-stone-ground herbal ubtan powder (150g) enriched with saffron, sandalwood, and gram flour.",
      category: "beauty",
      collections: ["aarong-earth", "new-in", "beauty", "festive-gifting", "festive-sale"],
      tags: [
        "beauty",
        "rosewater",
        "ubtan",
        "skincare",
        "aarong-earth",
        "herbal",
      ],
      image_url: "/api/public/ph/beauty/aarong-earth-wild-rose-ubtan-radiance-kit.svg",
      variants: [
        {
          name: "2-Piece Facial Radiance Ritual",
          sku: "AE-KIT-GLOW01",
          price: 75000,
          compare_at: 89000,
          stock: 45,
        },
      ],
    },
  ],
};

/** grocery — authentic high-volume hypermarket & daily-needs catalogue in BDT minor units. */
const GROCERY: DemoCatalog = {
  categories: [
    {
      slug: "fresh-produce",
      name: "Fruits & Vegetables",
      description:
        "Farm fresh seasonal vegetables, fresh herbs and juicy fruits.",
    },
    {
      slug: "dairy-eggs",
      name: "Dairy & Eggs",
      description: "Fresh milk, farm brown eggs, butter, cheese, and yogurt.",
    },
    {
      slug: "meat-fish",
      name: "Fish & Meat",
      description:
        "Fresh formalin-free river fish, premium beef, mutton, and poultry.",
    },
    {
      slug: "cooking-staples",
      name: "Cooking & Staples",
      description: "Rice, flour, lentils, cooking oils, ghee, and pure spices.",
    },
    {
      slug: "beverages-snacks",
      name: "Snacks & Beverages",
      description: "Tea, coffee, biscuits, juices, crisps, and confectionery.",
    },
    {
      slug: "household-care",
      name: "Household & Cleaning",
      description:
        "Laundry detergents, dishwash, surface cleaners, and hygiene essentials.",
    },
  ],
  collections: [
    {
      slug: "daily-basket",
      name: "Daily Basket",
      description: "Must-have kitchen staples for everyday cooking.",
    },
    {
      slug: "fresh-today",
      name: "Fresh Today",
      description: "Fresh harvest received this morning from local farms.",
    },
    {
      slug: "flash-savings",
      name: "Flash Savings",
      description: "Discounted bundles and limited-time grocery deals.",
    },
    {
      slug: "organic-wellness",
      name: "Organic & Wellness",
      description:
        "Cold-pressed oils, organic honey, chia seeds, and whole grains.",
    },
    {
      slug: "bestsellers",
      name: "Best Sellers",
      description: "Most ordered household essentials across the city.",
    },
  ],
  products: [
    {
      slug: "pran-premium-miniket-rice-5kg",
      title: "Pran Premium Miniket Rice 5kg",
      description:
        "Premium long-grain Miniket rice, carefully sortex-cleaned and aged for aromatic everyday meals. Cooked grains remain slender, separate, and non-sticky.",
      category: "cooking-staples",
      collections: ["daily-basket", "bestsellers"],
      tags: ["rice", "miniket", "staple", "pran", "grains"],
      image_url: "/api/public/ph/pran-premium-miniket-rice-5kg.svg",
      variants: [
        {
          name: "5kg Sealed Poly Bag",
          sku: "GRO-RIC-MIN5",
          price: 41000,
          compare_at: 45000,
          stock: 60,
        },
      ],
    },
    {
      slug: "rupchanda-fortified-soybean-oil-5l",
      title: "Rupchanda Fortified Soybean Oil 5 Litre",
      description:
        "Vitamin A and D fortified pure refined soybean oil. Low absorb technology retains food crispness while supporting family heart wellness in every preparation.",
      category: "cooking-staples",
      collections: ["daily-basket", "flash-savings", "bestsellers"],
      tags: ["oil", "soybean", "cooking", "rupchanda", "staples"],
      image_url: "/api/public/ph/rupchanda-fortified-soybean-oil-5l.svg",
      variants: [
        {
          name: "5 Litre Pet Jar",
          sku: "GRO-OIL-RUP5",
          price: 89000,
          compare_at: 94500,
          stock: 45,
        },
      ],
    },
    {
      slug: "farm-fresh-brown-eggs-12pcs",
      title: "Farm Fresh Grade-A Brown Eggs 12 Pieces",
      description:
        "Antibiotic-free Grade-A brown poultry eggs sourced daily from bio-secure layer farms. Rich orange yolks packed with protein and essential nutrients.",
      category: "dairy-eggs",
      collections: ["daily-basket", "fresh-today", "bestsellers"],
      tags: ["eggs", "farm", "protein", "breakfast", "dairy"],
      image_url: "/api/public/ph/farm-fresh-brown-eggs-12pcs.svg",
      variants: [
        {
          name: "12-Piece Safe Carton",
          sku: "GRO-EGG-BRN12",
          price: 15500,
          compare_at: 17500,
          stock: 80,
        },
      ],
    },
    {
      slug: "fresh-padma-hilsa-fish-1kg",
      title: "Fresh Padma River Hilsa Fish (1kg - 1.2kg Whole)",
      description:
        "Authentic silver Padma river Ilish procured at dawn from Chandpur landing stations. 100% formalin-free, delivered chilled in ice packs with intact scales and natural aroma.",
      category: "meat-fish",
      collections: ["fresh-today", "flash-savings"],
      tags: ["fish", "ilish", "hilsa", "padma", "fresh", "seafood"],
      image_url: "/api/public/ph/fresh-padma-hilsa-fish-1kg.svg",
      variants: [
        {
          name: "1kg - 1.2kg Whole Chilled Fish",
          sku: "GRO-FSH-HIL1K",
          price: 185000,
          compare_at: 210000,
          stock: 25,
        },
      ],
    },
    {
      slug: "aarong-dairy-pasteurised-liquid-milk-1l",
      title: "Aarong Dairy Pure Pasteurised Liquid Milk 1 Litre",
      description:
        "Fresh cow milk sourced from rural dairy cooperatives, pasteurised and homogenised to lock in 3.5% minimum natural milk fat. Safe and nourishing for the whole family.",
      category: "dairy-eggs",
      collections: ["daily-basket", "fresh-today", "bestsellers"],
      tags: ["milk", "dairy", "aarong", "fresh", "beverage"],
      image_url: "/api/public/ph/aarong-dairy-pasteurised-liquid-milk-1l.svg",
      variants: [
        {
          name: "1 Litre Pouch Pack",
          sku: "GRO-MLK-AAR1L",
          price: 9500,
          compare_at: 10000,
          stock: 90,
        },
      ],
    },
    {
      slug: "aci-pure-iodized-salt-1kg",
      title: "ACI Pure Vacuum Evaporated Iodized Salt 1kg",
      description:
        "Triple-refined vacuum evaporated salt infused with potassium iodate. Free-flowing, crystal clear crystals dissolve evenly to enhance daily cooking flavours.",
      category: "cooking-staples",
      collections: ["daily-basket"],
      tags: ["salt", "iodized", "aci", "cooking", "staples"],
      image_url: "/api/public/ph/aci-pure-iodized-salt-1kg.svg",
      variants: [
        {
          name: "1kg Poly Pack",
          sku: "GRO-SLT-ACI1K",
          price: 4200,
          compare_at: 4500,
          stock: 120,
        },
      ],
    },
    {
      slug: "teer-whole-wheat-atta-2kg",
      title: "Teer Whole Wheat Atta 2kg",
      description:
        "Milled from selected golden whole wheat grains retaining natural bran and dietary fibre. Yields soft, fluffy rotis that stay tender for hours after cooking.",
      category: "cooking-staples",
      collections: ["daily-basket", "bestsellers"],
      tags: ["atta", "flour", "wheat", "teer", "staples", "roti"],
      image_url: "/api/public/ph/teer-whole-wheat-atta-2kg.svg",
      variants: [
        {
          name: "2kg Food Grade Poly Bag",
          sku: "GRO-FLR-TER2K",
          price: 13000,
          compare_at: 14500,
          stock: 70,
        },
      ],
    },
    {
      slug: "fresh-red-potatoes-bogura-5kg",
      title: "Fresh Red Potatoes (Bogura) 5kg Net Bag",
      description:
        "Soil-fresh red round potatoes harvested directly from fertile Bogura fields. Firm texture and naturally sweet earthiness ideal for aloo bhorta, curries, and roasts.",
      category: "fresh-produce",
      collections: ["fresh-today", "daily-basket", "bestsellers"],
      tags: ["potatoes", "vegetables", "fresh", "produce", "bogura"],
      image_url: "/api/public/ph/fresh-red-potatoes-bogura-5kg.svg",
      variants: [
        {
          name: "5kg Ventilated Net Bag",
          sku: "GRO-VEG-POT5K",
          price: 22000,
          compare_at: 25000,
          stock: 55,
        },
      ],
    },
    {
      slug: "fresh-deshi-red-onion-1kg",
      title: "Fresh Deshi Red Onion 1kg",
      description:
        "Crisp local red onions with intense aroma and sharp flavour. Essential base for Bangladeshi gravies, meat marinades, and fresh salads.",
      category: "fresh-produce",
      collections: ["fresh-today", "daily-basket"],
      tags: ["onion", "vegetables", "fresh", "deshi", "produce"],
      image_url: "/api/public/ph/fresh-deshi-red-onion-1kg.svg",
      variants: [
        {
          name: "1kg Net Weight Pack",
          sku: "GRO-VEG-ONN1K",
          price: 11000,
          compare_at: 12500,
          stock: 65,
        },
      ],
    },
    {
      slug: "radhuni-turmeric-powder-200g",
      title: "Radhuni Pure Turmeric Powder 200g Pack",
      description:
        "Ground from premium hand-picked turmeric roots using cryogenic grinding to preserve bright golden colour, active curcumin, and pungent earthy scent.",
      category: "cooking-staples",
      collections: ["daily-basket"],
      tags: ["turmeric", "spices", "radhuni", "cooking", "curcumin"],
      image_url: "/api/public/ph/radhuni-turmeric-powder-200g.svg",
      variants: [
        {
          name: "200g Moisture Barrier Foil Pack",
          sku: "GRO-SPC-TUR200",
          price: 9500,
          compare_at: 11000,
          stock: 85,
        },
      ],
    },
    {
      slug: "fresh-farm-broiler-chicken-skin-off-1kg",
      title: "Fresh Halal Broiler Chicken (Cleaned & Cut 1kg)",
      description:
        "Strictly 100% Halal slaughtered broiler chicken, dressed, descaled, and curry-cut into standard uniform pieces. Vacuum-sealed under hygienic food-grade facility.",
      category: "meat-fish",
      collections: ["fresh-today", "daily-basket"],
      tags: ["chicken", "meat", "halal", "poultry", "fresh"],
      image_url: "/api/public/ph/fresh-farm-broiler-chicken-skin-off-1kg.svg",
      variants: [
        {
          name: "1kg Net Cleaned Curry Cut",
          sku: "GRO-MET-CHK1K",
          price: 21500,
          compare_at: 24000,
          stock: 40,
        },
      ],
    },
    {
      slug: "dano-daily-pushti-milk-powder-500g",
      title: "Dano Daily Pushti Full Cream Milk Powder 500g",
      description:
        "Fortified instant full cream milk powder enriched with 26 essential vitamins, iron, and calcium. Rich creamy taste for daily tea, coffee, and dessert preparation.",
      category: "dairy-eggs",
      collections: ["daily-basket", "flash-savings"],
      tags: ["milk-powder", "dairy", "dano", "beverage", "tea"],
      image_url: "/api/public/ph/dano-daily-pushti-milk-powder-500g.svg",
      variants: [
        {
          name: "500g Foil Refill Pack",
          sku: "GRO-MLK-DAN500",
          price: 43000,
          compare_at: 47000,
          stock: 50,
        },
      ],
    },
    {
      slug: "ispahani-mirzapore-best-leaf-tea-400g",
      title: "Ispahani Mirzapore Best Leaf Tea 400g Foil Pack",
      description:
        "Blended from the finest tender tea leaves harvested in high-altitude tea gardens of Sylhet. Delivers intense rich liquor, invigorating aroma, and deep amber colour.",
      category: "beverages-snacks",
      collections: ["daily-basket", "bestsellers"],
      tags: ["tea", "ispahani", "beverage", "sylhet", "chai"],
      image_url: "/api/public/ph/ispahani-mirzapore-best-leaf-tea-400g.svg",
      variants: [
        {
          name: "400g Aroma Protect Foil Pack",
          sku: "GRO-BEV-TEA400",
          price: 24000,
          compare_at: 26000,
          stock: 75,
        },
      ],
    },
    {
      slug: "maggi-2-minute-noodles-masala-8pack",
      title: "Nestle Maggi 2-Minute Masala Noodles (8-Pack Family Pack)",
      description:
        "The beloved family comfort food made with roasted aromatic spices and quality wheat flour noodles. Quick, delicious, and iron-fortified for hearty tea-time snacks.",
      category: "beverages-snacks",
      collections: ["daily-basket", "flash-savings"],
      tags: ["noodles", "maggi", "snacks", "nestle", "masala"],
      image_url: "/api/public/ph/maggi-2-minute-noodles-masala-8pack.svg",
      variants: [
        {
          name: "8-Pack Family Economy Pack",
          sku: "GRO-SNK-MAG8P",
          price: 18000,
          compare_at: 20000,
          stock: 65,
        },
      ],
    },
    {
      slug: "surf-excel-quick-wash-detergent-powder-1kg",
      title: "Surf Excel Quick Wash Detergent Powder 1kg",
      description:
        "Advanced stain-removal formulation penetrates fabric fibres quickly to dissolve tough stains while preserving fabric colours and releasing a long-lasting floral freshness.",
      category: "household-care",
      collections: ["daily-basket", "bestsellers"],
      tags: ["detergent", "cleaning", "laundry", "surf-excel", "household"],
      image_url:
        "/api/public/ph/surf-excel-quick-wash-detergent-powder-1kg.svg",
      variants: [
        {
          name: "1kg Poly Pouch",
          sku: "GRO-HSE-SRF1K",
          price: 28500,
          compare_at: 32000,
          stock: 55,
        },
      ],
    },
    {
      slug: "kazi-kazi-organic-raw-mustard-honey-250g",
      title: "Kazi & Kazi Organic Raw Sundarban Honey 250g Glass Jar",
      description:
        "100% natural, unpasteurised raw wild honey collected from natural blossom apiaries. Rich in natural pollens, enzymes, and antioxidants with amber clarity.",
      category: "cooking-staples",
      collections: ["organic-wellness"],
      tags: ["honey", "organic", "wellness", "sundarban", "raw"],
      image_url: "/api/public/ph/kazi-kazi-organic-raw-mustard-honey-250g.svg",
      variants: [
        {
          name: "250g Glass Hex Jar",
          sku: "GRO-ORG-HNY250",
          price: 38000,
          compare_at: 42000,
          stock: 35,
        },
      ],
    },
  ],
};

/** General store — flagship multi-category marketplace with electronics, fashion, home, grocery & beauty. */
const SUPERSHOP_CATALOG: DemoCatalog = {
  categories: [
    {
      slug: "electronics",
      name: "Electronics & Gadgets",
      description:
        "Smartphones, premium earbuds, smartwatches, fast chargers, and accessories.",
    },
    {
      slug: "fashion",
      name: "Fashion & Lifestyle",
      description:
        "Men's polo shirts, pure cotton sarees, running sneakers, chronograph watches, and eyewear.",
    },
    {
      slug: "home-living",
      name: "Home & Kitchen Living",
      description:
        "Granite cookware sets, rechargeable fans, kitchen blenders, thermal flasks, and memory foam pillows.",
    },
    {
      slug: "beauty",
      name: "Beauty & Personal Care",
      description:
        "Invisible gel sunscreens, brightening vitamin C serums, and dermatologist-tested skincare.",
    },
    {
      slug: "grocery",
      name: "Daily Groceries & Essentials",
      description:
        "Aromatic Chinigura rice, organic Sundarban honey, and cold-pressed mustard oil.",
    },
  ],
  collections: [
    {
      slug: "flash-sale",
      name: "Flash Sale",
      description:
        "Limited-time flash discounts with up to 70% off retail prices.",
    },
    {
      slug: "todays-deals",
      name: "Today's Deals",
      description: "Hand-picked daily price drops across all top categories.",
    },
    {
      slug: "best-sellers",
      name: "Best Sellers",
      description: "Most popular and highly-rated products across Bangladesh.",
    },
    {
      slug: "daraz-mall",
      name: "Official Brand Stores",
      description:
        "100% authentic products directly from certified brand distributors.",
    },
    {
      slug: "electronics",
      name: "Top Deals in Electronics & Gadgets",
      description:
        "Bestselling smartphones, audio devices, smart wearables, and chargers.",
    },
    {
      slug: "fashion",
      name: "Trending in Fashion & Lifestyle",
      description:
        "Latest seasonal styles, ethnic wear, comfortable footwear, and casual basics.",
    },
    {
      slug: "home-living",
      name: "Home & Living Essentials",
      description: "Kitchenware, appliances, and home comfort essentials.",
    },
    {
      slug: "daily-essentials",
      name: "Daily Groceries & Pantry",
      description:
        "Farm-fresh aromatic rice, pure raw honey, and pantry staples.",
    },
  ],
  products: [
    {
      slug: "pro-5g-smartphone-8gb-128gb",
      title: "Pro 5G Smartphone 8GB/128GB — AMOLED 120Hz",
      description:
        "6.67-inch FHD+ AMOLED 120Hz display, Snapdragon 5G Octa-Core processor, 64MP OIS quad camera, 5000mAh battery with 67W Turbo Charging. 1-year official brand warranty.",
      category: "electronics",
      collections: ["flash-sale", "electronics", "best-sellers", "daraz-mall"],
      tags: ["smartphone", "5g", "amoled", "mobile"],
      image_url: "/api/public/ph/pro-5g-smartphone-8gb-128gb.svg",
      variants: [
        {
          name: "8GB / 128GB - Phantom Black",
          sku: "SUP-PHN-BLK",
          price: 2499900,
          compare_at: 2999900,
          stock: 45,
        },
        {
          name: "8GB / 256GB - Glacier Blue",
          sku: "SUP-PHN-BLU",
          price: 2799900,
          compare_at: 3299900,
          stock: 30,
        },
      ],
    },
    {
      slug: "anc-wireless-earbuds-pro",
      title: "Active Noise Cancelling Wireless Earbuds Pro",
      description:
        "Hybrid 42dB Active Noise Cancellation, 11mm dynamic drivers, Bluetooth 5.3, 36 hours total battery with wireless charging case, IPX5 water resistance.",
      category: "electronics",
      collections: ["flash-sale", "electronics", "todays-deals"],
      tags: ["earbuds", "audio", "anc", "bluetooth"],
      image_url: "/api/public/ph/anc-wireless-earbuds-pro.svg",
      variants: [
        {
          name: "Glossy White",
          sku: "SUP-EAR-WHT",
          price: 249000,
          compare_at: 380000,
          stock: 80,
        },
        {
          name: "Matte Black",
          sku: "SUP-EAR-BLK",
          price: 249000,
          compare_at: 380000,
          stock: 65,
        },
      ],
    },
    {
      slug: "ultra-slim-smartwatch-2",
      title: "Ultra-Slim Smartwatch 2.0 with Bluetooth Calling",
      description:
        "1.96-inch HD curved AMOLED screen, 120+ sports modes, 24/7 heart rate and SpO2 sensor, Bluetooth phone calling, 10-day battery life.",
      category: "electronics",
      collections: ["electronics", "best-sellers", "daraz-mall"],
      tags: ["smartwatch", "fitness", "bluetooth", "gadgets"],
      image_url: "/api/public/ph/ultra-slim-smartwatch-2.svg",
      variants: [
        {
          name: "Obsidian Black",
          sku: "SUP-WTC-BLK",
          price: 325000,
          compare_at: 450000,
          stock: 50,
        },
        {
          name: "Silver Metal Strap",
          sku: "SUP-WTC-SLV",
          price: 365000,
          compare_at: 490000,
          stock: 25,
        },
      ],
    },
    {
      slug: "gan-65w-fast-charger-trio",
      title: "65W GaN Fast Wall Charger — 2x USB-C + USB-A",
      description:
        "Next-gen Gallium Nitride (GaN) technology, charges laptop, tablet and phone simultaneously. Power Delivery 3.0, folding plug, multi-protection safety.",
      category: "electronics",
      collections: ["flash-sale", "electronics", "todays-deals"],
      tags: ["charger", "gan", "usb-c", "fast-charging"],
      image_url: "/api/public/ph/gan-65w-fast-charger-trio.svg",
      variants: [
        {
          name: "White 65W",
          sku: "SUP-CHG-WHT",
          price: 145000,
          compare_at: 195000,
          stock: 120,
        },
      ],
    },
    {
      slug: "20000mah-fast-charge-powerbank",
      title: "20000mAh Power Bank 22.5W Two-Way Fast Charge",
      description:
        "High-density polymer battery, dual USB-A output and USB-C input/output, digital LED battery percentage display, flight-approved.",
      category: "electronics",
      collections: ["electronics", "best-sellers"],
      tags: ["powerbank", "battery", "fast-charge"],
      image_url: "/api/public/ph/20000mah-fast-charge-powerbank.svg",
      variants: [
        {
          name: "Carbon Black",
          sku: "SUP-PB-BLK",
          price: 189000,
          compare_at: 240000,
          stock: 95,
        },
      ],
    },
    {
      slug: "mens-premium-pique-polo",
      title: "Men's Premium Combed Pique Cotton Polo Shirt",
      description:
        "220gsm 100% combed compact cotton pique, ribbed collar and cuffs, mother-of-pearl buttons, pre-shrunk and bio-washed for lasting softness.",
      category: "fashion",
      collections: ["fashion", "best-sellers", "daraz-mall"],
      tags: ["polo", "menswear", "cotton", "apparel"],
      image_url: "/api/public/ph/mens-premium-pique-polo.svg",
      variants: [
        {
          name: "Navy Blue / M",
          sku: "SUP-POL-NVM",
          price: 89000,
          compare_at: 125000,
          stock: 40,
        },
        {
          name: "Navy Blue / L",
          sku: "SUP-POL-NVL",
          price: 89000,
          compare_at: 125000,
          stock: 45,
        },
        {
          name: "Maroon / M",
          sku: "SUP-POL-MRM",
          price: 89000,
          compare_at: 125000,
          stock: 35,
        },
      ],
    },
    {
      slug: "handloom-tangail-jamdani-saree",
      title: "Tangail Pure Cotton Handloom Jamdani Saree",
      description:
        "Traditional geometric floral weave on fine count pure cotton yarn by master weavers of Tangail. 5.5 meters length with matching unstitched blouse piece.",
      category: "fashion",
      collections: ["flash-sale", "fashion", "best-sellers"],
      tags: ["saree", "jamdani", "handloom", "womenswear"],
      image_url: "/api/public/ph/handloom-tangail-jamdani-saree.svg",
      variants: [
        {
          name: "Royal Teal & Gold",
          sku: "SUP-SAR-TEL",
          price: 345000,
          compare_at: 480000,
          stock: 20,
        },
        {
          name: "Crimson Red & Black",
          sku: "SUP-SAR-RED",
          price: 345000,
          compare_at: 480000,
          stock: 15,
        },
      ],
    },
    {
      slug: "lightweight-breathable-running-sneakers",
      title: "Lightweight Breathable Mesh Running Sneakers",
      description:
        "Engineered breathable flyknit upper, shock-absorbing EVA cushioned midsole, anti-skid rubber outsole. Ergonomic fit for daily running and training.",
      category: "fashion",
      collections: ["fashion", "todays-deals", "daraz-mall"],
      tags: ["sneakers", "shoes", "running", "footwear"],
      image_url: "/api/public/ph/lightweight-breathable-running-sneakers.svg",
      variants: [
        {
          name: "Flame Red / 41",
          sku: "SUP-SNK-R41",
          price: 195000,
          compare_at: 280000,
          stock: 30,
        },
        {
          name: "Flame Red / 42",
          sku: "SUP-SNK-R42",
          price: 195000,
          compare_at: 280000,
          stock: 25,
        },
        {
          name: "Stealth Black / 42",
          sku: "SUP-SNK-B42",
          price: 195000,
          compare_at: 280000,
          stock: 35,
        },
      ],
    },
    {
      slug: "classic-chronograph-mens-watch",
      title: "Classic Chronograph Men's Water-Resistant Watch",
      description:
        "Japanese quartz movement, 3 functional sub-dials, date display, scratch-resistant mineral crystal glass, genuine leather strap, 30m water resistance.",
      category: "fashion",
      collections: ["fashion", "best-sellers"],
      tags: ["watch", "chronograph", "accessories", "leather"],
      image_url: "/api/public/ph/classic-chronograph-mens-watch.svg",
      variants: [
        {
          name: "Brown Leather / Rose Gold",
          sku: "SUP-WTC-BRN",
          price: 215000,
          compare_at: 320000,
          stock: 28,
        },
      ],
    },
    {
      slug: "polarized-uv400-retro-sunglasses",
      title: "Polarized UV400 Classic Retro Sunglasses",
      description:
        "HD polarized TAC lenses block 100% UVA/UVB rays, durable lightweight acetate frame with reinforced metal hinges. Includes protective travel hardcase.",
      category: "fashion",
      collections: ["flash-sale", "fashion", "todays-deals"],
      tags: ["sunglasses", "polarized", "eyewear"],
      image_url: "/api/public/ph/polarized-uv400-retro-sunglasses.svg",
      variants: [
        {
          name: "Glossy Black / Dark Grey",
          sku: "SUP-SGL-BLK",
          price: 65000,
          compare_at: 99000,
          stock: 90,
        },
      ],
    },
    {
      slug: "nonstick-granite-cookware-set-5pc",
      title: "5-Piece Non-Stick Granite Cookware Set with Glass Lids",
      description:
        "Eco-friendly 5-layer German granite non-stick coating, 100% PFOA-free. Induction and gas stove compatible base. Includes 24cm casserole, 28cm kadai, 24cm fry pan and tempered glass lids.",
      category: "home-living",
      collections: ["home-living", "best-sellers", "daraz-mall"],
      tags: ["cookware", "kitchen", "nonstick", "granite"],
      image_url: "/api/public/ph/nonstick-granite-cookware-set-5pc.svg",
      variants: [
        {
          name: "Granite Grey 5-Piece",
          sku: "SUP-CW-GRY",
          price: 485000,
          compare_at: 650000,
          stock: 22,
        },
      ],
    },
    {
      slug: "rechargeable-oscillating-desk-fan",
      title: "High-Speed Rechargeable Oscillating Desk Fan 8000mAh",
      description:
        "Powerful brushless silent motor, 120-degree auto-oscillation, 4 speed settings, built-in LED night light. 8000mAh battery delivers up to 14 hours of cool breeze on a single charge.",
      category: "home-living",
      collections: ["flash-sale", "home-living", "todays-deals"],
      tags: ["fan", "rechargeable", "appliances", "cooling"],
      image_url: "/api/public/ph/rechargeable-oscillating-desk-fan.svg",
      variants: [
        {
          name: "Polar White",
          sku: "SUP-FAN-WHT",
          price: 265000,
          compare_at: 340000,
          stock: 40,
        },
      ],
    },
    {
      slug: "heavy-duty-750w-kitchen-blender",
      title: "750W Heavy-Duty Multi-Purpose Kitchen Blender & Grinder",
      description:
        "100% copper motor, 3 stainless steel jars for wet grinding, dry spices and chutney making. Overload protection circuit breaker and 3-speed rotary control with pulse.",
      category: "home-living",
      collections: ["home-living", "best-sellers"],
      tags: ["blender", "grinder", "kitchen", "appliances"],
      image_url: "/api/public/ph/heavy-duty-750w-kitchen-blender.svg",
      variants: [
        {
          name: "Silver & Maroon / 3 Jars",
          sku: "SUP-BLN-SLV",
          price: 375000,
          compare_at: 499000,
          stock: 35,
        },
      ],
    },
    {
      slug: "insulated-thermal-flask-1000ml",
      title: "Double-Wall Insulated Stainless Steel Thermal Flask 1000ml",
      description:
        "Food-grade 304 stainless steel vacuum insulation, keeps beverages piping hot for 18 hours or ice cold for 24 hours. Sweat-proof powder coated exterior.",
      category: "home-living",
      collections: ["home-living", "todays-deals"],
      tags: ["flask", "bottle", "thermal", "insulated"],
      image_url: "/api/public/ph/insulated-thermal-flask-1000ml.svg",
      variants: [
        {
          name: "Matte Black 1000ml",
          sku: "SUP-FLK-BLK",
          price: 95000,
          compare_at: 140000,
          stock: 65,
        },
      ],
    },
    {
      slug: "ergonomic-memory-foam-pillow",
      title: "Ergonomic Contour Memory Foam Cervical Bed Pillow",
      description:
        "High-density slow-rebound memory foam ergonomically shaped to support cervical spine alignment, alleviating neck and shoulder tension. Breathable removable bamboo cover.",
      category: "home-living",
      collections: ["home-living", "best-sellers"],
      tags: ["pillow", "memoryfoam", "bedding", "home"],
      image_url: "/api/public/ph/ergonomic-memory-foam-pillow.svg",
      variants: [
        {
          name: "Standard Orthopedic",
          sku: "SUP-PLW-STD",
          price: 120000,
          compare_at: 175000,
          stock: 50,
        },
      ],
    },
    {
      slug: "premium-chinigura-aromatic-rice-5kg",
      title: "Premium Chinigura Aromatic Rice 5kg — Fresh Harvest",
      description:
        "Finest fragrant Chinigura rice from Dinajpur farms, naturally aged for rich polao and biryani aroma. 100% sortex-cleaned, pure and organic grains from this season's fresh harvest.",
      category: "grocery",
      collections: ["daily-essentials", "best-sellers", "daraz-mall"],
      tags: [
        "rice",
        "chinigura",
        "organic",
        "fresh",
        "harvest",
        "pantry",
        "kg",
      ],
      image_url: "/api/public/ph/premium-chinigura-aromatic-rice-5kg.svg",
      variants: [
        {
          name: "5kg Sealed Poly Bag",
          sku: "SUP-RIC-5KG",
          price: 65000,
          compare_at: 72000,
          stock: 150,
        },
      ],
    },
    {
      slug: "pure-sundarban-organic-raw-honey-500g",
      title: "Pure Sundarban Organic Raw Honey 500g",
      description:
        "100% natural, unheated and unfiltered wild floral honey harvested directly from the deep mangrove forests of Sundarban. Rich in natural antioxidants and enzymes.",
      category: "grocery",
      collections: ["flash-sale", "daily-essentials", "todays-deals"],
      tags: ["honey", "organic", "raw", "sundarban", "natural"],
      image_url: "/api/public/ph/pure-sundarban-organic-raw-honey-500g.svg",
      variants: [
        {
          name: "500g Glass Jar",
          sku: "SUP-HNY-500",
          price: 58000,
          compare_at: 68000,
          stock: 85,
        },
      ],
    },
    {
      slug: "cold-pressed-mustard-oil-1l",
      title: "Cold-Pressed Pure Mustard Oil 1 Litre — Ghani Fresh",
      description:
        "Traditional wooden cold-pressed (Ghani) pure mustard oil from first-grade yellow mustard seeds. Pungent aroma and natural vitamins preserved without chemicals.",
      category: "grocery",
      collections: ["daily-essentials", "best-sellers"],
      tags: ["oil", "mustard", "coldpressed", "ghani", "cooking"],
      image_url: "/api/public/ph/cold-pressed-mustard-oil-1l.svg",
      variants: [
        {
          name: "1 Litre Food-Grade Bottle",
          sku: "SUP-OIL-1L",
          price: 34000,
          compare_at: 39000,
          stock: 110,
        },
      ],
    },
    {
      slug: "spf50-invisible-sunscreen-gel-50g",
      title: "SPF 50+ PA++++ Broad Spectrum Invisible Sunscreen Gel 50g",
      description:
        "Ultra-lightweight water-gel sunscreen with zero white cast, non-comedogenic and grease-free. Infused with Niacinamide and Cica for calm, protected skin under harsh tropical sun.",
      category: "beauty",
      collections: ["flash-sale", "todays-deals", "daraz-mall"],
      tags: ["sunscreen", "skincare", "spf50", "beauty"],
      image_url: "/api/public/ph/spf50-invisible-sunscreen-gel-50g.svg",
      variants: [
        {
          name: "50g Tube",
          sku: "SUP-SUN-50G",
          price: 89000,
          compare_at: 115000,
          stock: 75,
        },
      ],
    },
    {
      slug: "vitamin-c-hyaluronic-brightening-serum",
      title: "Vitamin C 15% + Hyaluronic Acid Brightening Facial Serum 30ml",
      description:
        "Potent antioxidant formula with ethyl ascorbic acid, pure hyaluronic acid and ferulic acid. Fades dark spots, evens skin tone and boosts collagen for radiant, glowing skin.",
      category: "beauty",
      collections: ["best-sellers", "daraz-mall"],
      tags: ["serum", "vitaminc", "skincare", "glow"],
      image_url: "/api/public/ph/vitamin-c-hyaluronic-brightening-serum.svg",
      variants: [
        {
          name: "30ml Dropper Bottle",
          sku: "SUP-SER-30M",
          price: 75000,
          compare_at: 110000,
          stock: 90,
        },
      ],
    },
  ],
};

/** songoskriti — heritage storefront demo (product images: Task-3 placeholders; generator swaps in /ph/songoskriti/* when key lands): jamdani, panjabi, khadi, kantha and brass craft. BDT minor units; image refs point at public/ph/songoskriti/* final paths (files land via Task 3 generation; placeholder fallback covers gaps). */
const SONGOSKRITI: DemoCatalog = {
  categories: [
    {
      slug: "women",
      name: "Women",
      description: "Handloom sarees and festive drapes woven in Tangail and Sonargaon.",
    },
    {
      slug: "men",
      name: "Men",
      description: "Rajshahi silk panjabis and breathable khadi kurtas.",
    },
    {
      slug: "kids",
      name: "Kids",
      description: "Festive silk sets for young celebrations.",
    },
    {
      slug: "living",
      name: "Home & Living",
      description: "Nakshi kantha quilts and artisan home textiles.",
    },
    {
      slug: "jewellery",
      name: "Jewellery",
      description: "Hand-engraved brass pieces from Dhamrai metalworkers.",
    },
    {
      slug: "new-in",
      name: "New In",
      description: "Fresh off the loom for this festive season.",
    },
  ],
  collections: [
    {
      slug: "new-in",
      name: "New Arrivals",
      description: "This season's festive drop.",
    },
    {
      slug: "bestsellers",
      name: "Bestsellers",
      description: "Most loved handloom staples.",
    },
    {
      slug: "festive",
      name: "Eid & Festive",
      description: "Celebration dressing in handwoven silk and cotton.",
    },
    {
      slug: "wedding",
      name: "Wedding",
      description: "Bridal sarees, groom panjabis and gifting.",
    },
    {
      slug: "gifting",
      name: "Gifting",
      description: "Kantha, brass and keepsakes to gift.",
    },
  ],
  products: [
    {
      slug: "rajshahi-silk-festive-panjabi",
      title: "Rajshahi Silk Festive Panjabi",
      description:
        "Pure Rajshahi silk panjabi with subtle kantha stitch along the placket and mother-of-pearl buttons. Model is 182cm and wears size 40.",
      category: "men",
      collections: ["new-in", "festive", "wedding"],
      tags: ["panjabi", "silk", "festive", "mens"],
      image_url: "/ph/songoskriti/prod-panjabi.png",
      variants: [
        {
          name: "Size 40 - Ivory",
          sku: "SNK-PNJ-40IV",
          price: 495000,
          compare_at: 580000,
          stock: 12,
        },
        {
          name: "Size 42 - Ivory",
          sku: "SNK-PNJ-42IV",
          price: 495000,
          compare_at: 580000,
          stock: 9,
        },
        {
          name: "Size 40 - Midnight Navy",
          sku: "SNK-PNJ-40NV",
          price: 495000,
          stock: 7,
        },
      ],
    },
    {
      slug: "dhakai-jamdani-heritage-saree",
      title: "Dhakai Jamdani Heritage Saree",
      description:
        "Authentic Sonargaon Dhakai Jamdani with floral jall motifs in mulberry silk. Includes 80cm unstitched blouse piece. Model is 170cm.",
      category: "women",
      collections: ["new-in", "festive", "wedding"],
      tags: ["jamdani", "saree", "silk", "handloom"],
      image_url: "/ph/songoskriti/prod-saree.png",
      variants: [
        {
          name: "Emerald & Rose Gold",
          sku: "SNK-JAM-EMR",
          price: 1850000,
          compare_at: 2200000,
          stock: 5,
        },
        {
          name: "Crimson & Gold",
          sku: "SNK-JAM-CRM",
          price: 1850000,
          stock: 4,
        },
      ],
    },
    {
      slug: "comilla-khadi-casual-kurta",
      title: "Comilla Handspun Khadi Kurta",
      description:
        "Authentic handspun Comilla khadi cotton with coconut-shell buttons. Breathable everyday cut. Model is 178cm and wears size 40.",
      category: "men",
      collections: ["bestsellers"],
      tags: ["khadi", "kurta", "cotton", "handloom"],
      image_url: "/api/public/ph/mens/comilla-handspun-khadi-kurta.svg",
      variants: [
        {
          name: "Size M - Natural Off-White",
          sku: "SNK-KHD-MOL",
          price: 285000,
          compare_at: 320000,
          stock: 18,
        },
        {
          name: "Size L - Natural Off-White",
          sku: "SNK-KHD-LOL",
          price: 285000,
          compare_at: 320000,
          stock: 14,
        },
      ],
    },
    {
      slug: "jessore-nakshi-kantha-quilt",
      title: "Jessore Nakshi Kantha Quilt",
      description:
        "Hand-stitched running-stitch kantha on layered natural cotton by Jessore craftswomen. Queen size, 88 x 96 in.",
      category: "living",
      collections: ["bestsellers", "gifting"],
      tags: ["kantha", "quilt", "handloom", "living"],
      image_url: "/api/public/ph/living/handcrafted-nakshi-kantha-quilt.svg",
      variants: [
        {
          name: "Queen - Tree of Life",
          sku: "SNK-NKS-QTL",
          price: 850000,
          compare_at: 980000,
          stock: 8,
        },
      ],
    },
    {
      slug: "dhamrai-brass-heritage-necklace",
      title: "Dhamrai Brass Heritage Necklace",
      description:
        "Hand-cut and engraved brass necklace with 22k antique gold plating by Dhamrai metalworkers.",
      category: "jewellery",
      collections: ["festive", "wedding", "gifting"],
      tags: ["jewellery", "brass", "necklace", "artisan"],
      image_url: "/ph/songoskriti/prod-necklace.png",
      variants: [
        {
          name: "Antique Gold",
          sku: "SNK-NKL-GLD",
          price: 185000,
          compare_at: 220000,
          stock: 20,
        },
      ],
    },
    {
      slug: "girls-silk-festive-ghagra-choli",
      title: "Girls Silk Festive Ghagra Choli Set",
      description:
        "Three-piece festive set in pure silk with a threadwork choli, flared ghagra skirt and contrast dupatta.",
      category: "kids",
      collections: ["new-in", "festive", "gifting"],
      tags: ["kids", "silk", "festive", "ghagra"],
      variants: [
        {
          name: "Age 8-10 Yrs - Coral Rose",
          sku: "SNK-KID-08CR",
          price: 450000,
          compare_at: 520000,
          stock: 10,
        },
      ],
    },
  ],
};

export const DEMO_CATALOGS = {
  apparel: APPAREL,
  marketplace: MARKETPLACE,
  electronics: ELECTRONICS,
  handloom: HANDLOOM_APPAREL,
  beauty: BEAUTY,
  general: SUPERSHOP_CATALOG,
  songoskriti: SONGOSKRITI,
} as const satisfies Record<string, DemoCatalog>;

export type DemoCatalogKey = keyof typeof DEMO_CATALOGS;

/** Falls back to the marketplace spread for any unknown vertical key. */
export function demoCatalogFor(verticalKey: string): DemoCatalog {
  return DEMO_CATALOGS[verticalKey as DemoCatalogKey] ?? MARKETPLACE;
}
