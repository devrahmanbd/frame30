#!/usr/bin/env bun
/**
 * Seed Flame Fashion BD Catalog & Theme
 *
 * 1. Sets authentic /ph/songoskriti/ image URLs for all 20 merchant products.
 * 2. Seeds all missing navigation collections (sarees, panjabi, women, men, etc.).
 * 3. Links products to collection_products.
 * 4. Assembles fresh Songoskriti templates, adapts for merchant, and publishes new theme_version.
 */
import { createClient } from "@supabase/supabase-js";
import { resolveThemePreview } from "../src/lib/theme-preview-nav";
import { adaptThemeTemplatesForMerchant } from "../src/lib/themes/merchant-adapt";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(2);
}

const db = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MERCHANT_ID = "b47532e5-9649-4ebd-93a9-06fa2917c00e";
const MERCHANT_SLUG = "flame-fashion-bd";

console.log("=== Step 1: Updating Product Images ===");
const PRODUCT_IMAGE_MAP: Record<string, string> = {
  "tangail-taant-cotton-saree": "/ph/songoskriti/cat-women.png",
  "dhakai-jamdani-silk-saree": "/ph/songoskriti/prod-saree.png",
  "pure-silk-embroidered-panjabi": "/ph/songoskriti/prod-panjabi.png",
  "handcrafted-nakshi-kantha-quilt": "/ph/songoskriti/hero-artisans.jpg",
  "brass-filigree-chandbali-earrings": "/ph/songoskriti/cat-jewelry.png",
  "mirpur-katan-silk-saree": "/ph/songoskriti/hero-weaves.jpg",
  "comilla-handspun-khadi-kurta": "/ph/songoskriti/cat-men.jpg",
  "artisan-block-print-muslin-dupatta": "/ph/songoskriti/edit-festive-side.png",
  "embroidered-silk-salwar-suit": "/ph/songoskriti/edit-bridal-main.png",
  "tussar-silk-festive-koti": "/ph/songoskriti/edit-festive-main.jpg",
  "handcrafted-terracotta-dining-set": "/ph/songoskriti/cat-living.png",
  "casual-cotton-summer-fotua": "/ph/songoskriti/cat-men.jpg",
  "hand-painted-silk-festive-saree": "/ph/songoskriti/prod-saree.png",
  "fine-poplin-formal-pajama": "/ph/songoskriti/cat-men.jpg",
  "girls-embroidered-silk-ghagra-choli": "/ph/songoskriti/hero-festive.jpg",
  "hand-carved-brass-incense-burner": "/ph/songoskriti/cat-living.png",
  "taaga-bohemian-hand-embroidered-kurti": "/ph/songoskriti/hero-festive.jpg",
  "taaga-man-relaxed-linen-mandarin-shirt": "/ph/songoskriti/prod-panjabi.png",
  "aarong-earth-sandalwood-turmeric-handmade-soap": "/ph/songoskriti/craft-dye.png",
  "aarong-earth-wild-rose-ubtan-radiance-kit": "/ph/songoskriti/craft-embroidery.png",
};

for (const [slug, img] of Object.entries(PRODUCT_IMAGE_MAP)) {
  const { error } = await db
    .from("products")
    .update({ image_url: img })
    .eq("merchant_id", MERCHANT_ID)
    .eq("slug", slug);
  if (error) {
    console.error(`Failed to update image for product ${slug}:`, error);
  } else {
    console.log(`Updated product ${slug} -> ${img}`);
  }
}

console.log("\n=== Step 2: Seeding Missing Collections ===");
const COLLECTIONS_TO_SEED = [
  {
    slug: "women",
    name: "Women's Collection",
    description: "Timeless handcrafted sarees, kurtis, and festive ensembles.",
    products: [
      "dhakai-jamdani-silk-saree",
      "tangail-taant-cotton-saree",
      "mirpur-katan-silk-saree",
      "hand-painted-silk-festive-saree",
      "embroidered-silk-salwar-suit",
      "taaga-bohemian-hand-embroidered-kurti",
      "artisan-block-print-muslin-dupatta",
    ],
  },
  {
    slug: "sarees",
    name: "Signature Sarees",
    description: "Authentic Dhakai Jamdani, Tangail Taant, Mirpur Katan, and hand-painted pure silk sarees.",
    products: [
      "dhakai-jamdani-silk-saree",
      "tangail-taant-cotton-saree",
      "mirpur-katan-silk-saree",
      "hand-painted-silk-festive-saree",
    ],
  },
  {
    slug: "men",
    name: "Men's Collection",
    description: "Handspun khadi kurtas, pure silk embroidered panjabis, and festive kotis.",
    products: [
      "pure-silk-embroidered-panjabi",
      "comilla-handspun-khadi-kurta",
      "tussar-silk-festive-koti",
      "casual-cotton-summer-fotua",
      "taaga-man-relaxed-linen-mandarin-shirt",
      "fine-poplin-formal-pajama",
    ],
  },
  {
    slug: "panjabi",
    name: "Fine Panjabis",
    description: "Heritage handloom panjabis crafted from pure silk, tussar, and fine cotton.",
    products: [
      "pure-silk-embroidered-panjabi",
      "comilla-handspun-khadi-kurta",
      "tussar-silk-festive-koti",
      "taaga-man-relaxed-linen-mandarin-shirt",
    ],
  },
  {
    slug: "kids",
    name: "Kids & Children",
    description: "Delicately embroidered festive ghagra cholis and traditional attire.",
    products: ["girls-embroidered-silk-ghagra-choli"],
  },
  {
    slug: "festive",
    name: "Festive Collection",
    description: "Rich hues, metallic zari, and joyous silhouettes crafted for celebratory moments.",
    products: [
      "dhakai-jamdani-silk-saree",
      "mirpur-katan-silk-saree",
      "pure-silk-embroidered-panjabi",
      "tussar-silk-festive-koti",
      "embroidered-silk-salwar-suit",
      "girls-embroidered-silk-ghagra-choli",
    ],
  },
  {
    slug: "wedding",
    name: "Wedding & Bridal",
    description: "Opulent bridal Jamdani, pure Katan silks, and regal ceremonial ensembles.",
    products: [
      "dhakai-jamdani-silk-saree",
      "mirpur-katan-silk-saree",
      "pure-silk-embroidered-panjabi",
      "embroidered-silk-salwar-suit",
      "brass-filigree-chandbali-earrings",
    ],
  },
  {
    slug: "heritage",
    name: "Heritage Handloom",
    description: "Centuries-old weaving techniques preserved by master artisans across Bengal.",
    products: [
      "dhakai-jamdani-silk-saree",
      "tangail-taant-cotton-saree",
      "comilla-handspun-khadi-kurta",
      "handcrafted-nakshi-kantha-quilt",
    ],
  },
  {
    slug: "jewellery",
    name: "Handcrafted Jewellery",
    description: "Hand-engraved filigree, brass accents, and artisanal ornaments.",
    products: ["brass-filigree-chandbali-earrings"],
  },
  {
    slug: "living",
    name: "Living & Home Decor",
    description: "Terracotta dining sets, brass incense burners, and hand-stitched Nakshi Kantha.",
    products: [
      "handcrafted-nakshi-kantha-quilt",
      "handcrafted-terracotta-dining-set",
      "hand-carved-brass-incense-burner",
    ],
  },
  {
    slug: "jamdani",
    name: "Dhakai Jamdani",
    description: "UNESCO-recognized fine muslin weaves with geometric floral motifs.",
    products: ["dhakai-jamdani-silk-saree"],
  },
];

// Fetch all product IDs by slug
const { data: allProducts } = await db
  .from("products")
  .select("id, slug")
  .eq("merchant_id", MERCHANT_ID);

const productSlugToId = new Map((allProducts ?? []).map((p) => [p.slug, p.id]));

for (const col of COLLECTIONS_TO_SEED) {
  // Check if collection exists
  const { data: existing } = await db
    .from("collections")
    .select("id")
    .eq("merchant_id", MERCHANT_ID)
    .eq("slug", col.slug)
    .maybeSingle();

  let collectionId = existing?.id;
  if (!collectionId) {
    const { data: created, error: colErr } = await db
      .from("collections")
      .insert({
        merchant_id: MERCHANT_ID,
        name: col.name,
        slug: col.slug,
        description: col.description,
        is_published: true,
      })
      .select("id")
      .single();
    if (colErr || !created) {
      console.error(`Failed to create collection ${col.slug}:`, colErr);
      continue;
    }
    collectionId = created.id;
    console.log(`Created collection ${col.name} (${col.slug}) -> ${collectionId}`);
  } else {
    console.log(`Collection ${col.name} (${col.slug}) already exists -> ${collectionId}`);
  }

  // Map products
  for (const pSlug of col.products) {
    const pId = productSlugToId.get(pSlug);
    if (!pId) continue;
    const { error: linkErr } = await db
      .from("collection_products")
      .upsert(
        { collection_id: collectionId, product_id: pId },
        { onConflict: "collection_id,product_id" }
      );
    if (linkErr) {
      console.warn(`Error linking ${pSlug} to ${col.slug}:`, linkErr.message);
    }
  }
}

console.log("\n=== Step 3: Publishing Fresh Adapted Theme Version ===");
const { data: activeTheme, error: themeErr } = await db
  .from("store_themes")
  .select("id, name, published_version_id")
  .eq("merchant_id", MERCHANT_ID)
  .eq("is_active", true)
  .maybeSingle();

if (themeErr || !activeTheme) {
  console.error("No active theme found:", themeErr);
  process.exit(1);
}

// Get merchant settings for support email & phone
const { data: settings } = await db
  .from("merchant_settings")
  .select("support_email, support_phone")
  .eq("merchant_id", MERCHANT_ID)
  .maybeSingle();

// Load fresh theme definition from source code
const preset = resolveThemePreview("songoskriti");
if (!preset) {
  console.error("Failed to resolve songoskriti preview source");
  process.exit(1);
}

const adaptedTemplates = adaptThemeTemplatesForMerchant(preset.templates, {
  name: "Flame Fashion BD",
  supportEmail: settings?.support_email || "care@flamelancer.com",
  supportPhone: settings?.support_phone || "+880 96 1234 5678",
});

// Determine next version number
const { data: maxV } = await db
  .from("theme_versions")
  .select("version")
  .eq("theme_id", activeTheme.id)
  .order("version", { ascending: false })
  .limit(1)
  .maybeSingle();

const nextVersionNum = ((maxV?.version as number) || 5) + 1;
const now = new Date().toISOString();

console.log(`Publishing version v${nextVersionNum} for theme ${activeTheme.id}...`);

const { data: newVersion, error: insertErr } = await db
  .from("theme_versions")
  .insert({
    merchant_id: MERCHANT_ID,
    theme_id: activeTheme.id,
    version: nextVersionNum,
    status: "published",
    published_at: now,
    label: `Refined editorial storefront v${nextVersionNum}`,
    templates: adaptedTemplates as never,
    tokens: preset.tokens as never,
    source_registry_key: "songoskriti",
  })
  .select("id")
  .single();

if (insertErr || !newVersion) {
  console.error("Failed to insert new theme version:", insertErr);
  process.exit(1);
}

// Update store_themes.published_version_id
const { error: updateThemeErr } = await db
  .from("store_themes")
  .update({
    published_version_id: newVersion.id,
    updated_at: now,
  })
  .eq("id", activeTheme.id);

if (updateThemeErr) {
  console.error("Failed to update store_themes:", updateThemeErr);
  process.exit(1);
}

console.log(`Theme updated successfully to version v${nextVersionNum} (${newVersion.id})!`);
console.log("=== Seed script complete ===");
