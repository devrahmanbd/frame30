/**
 * Songoskriti asset inventory — the single source of truth shared by the
 * gate (scripts/songoskriti-assets-check.mjs) and the generator
 * (scripts/gen-songoskriti-assets.mjs). Data and pure logic only: no fs,
 * no network.
 *
 * `name` is the shipped file name; `format` is authoritative and always
 * agrees with the name's extension. `minWidth`/`minHeight` are floors the
 * shipped file must meet (null = not applicable, e.g. SVG).
 */
export const ASSET_DIR = "public/ph/songoskriti";

export const BUDGETS = {
  maxFileBytes: 3_000_000,
  maxTotalBytes: 28_000_000,
  maxBytesPerPixel: { png: 2, jpeg: 1 },
};

/**
 * The format a file NAME claims — the claim, not the truth about the bytes.
 *
 * This is the ONE implementation: the gate compares the bytes against it
 * and the generator's write path refuses a payload that contradicts it. An
 * unknown extension claims no format at all (null), so a caller must
 * reject it rather than guess one.
 *
 * @param {string} name the file name to read
 * @returns {"jpeg" | "png" | "svg" | null} the claimed format, or null
 */
export function formatFromName(name) {
  const dot = name.lastIndexOf(".");
  const extension = dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "png") return "png";
  if (extension === "svg") return "svg";
  return null;
}

export const ASSETS = [
  {
    name: "campaign-men.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "editorial",
    generated: true,
    aspect: "3:4",
    prompt:
      "Festive Bengali men's panjabi and kurta folded on ivory linen for a " +
      "men's campaign editorial, terracotta and ivory palette, e-commerce " +
      "photograph, plain warm background, no text",
  },
  {
    name: "cat-jewelry.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Terracotta-and-gold Bengali temple necklace on ivory silk, jewelry " +
      "e-commerce category tile, centered, plain warm background, no text",
  },
  {
    name: "cat-kids.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Cheerful small Bengali festive kurta for a child in ivory with " +
      "terracotta trim flat-lay, e-commerce category tile, centered, plain " +
      "warm background, no text",
  },
  {
    name: "cat-living.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Handwoven Bengali kantha throw in terracotta and ivory folded on a " +
      "jute chair, home-living e-commerce category tile, warm light, no text",
  },
  {
    name: "cat-men.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Crisp ivory panjabi kurta with subtle terracotta embroidery flat-lay, " +
      "e-commerce category tile, centered, plain warm background, no text",
  },
  {
    name: "cat-newin.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Fresh festive Bengali outfit arrangement with marigold accents in " +
      "terracotta and ivory, new-arrivals e-commerce category tile, no text",
  },
  {
    name: "cat-women.png",
    format: "png",
    minWidth: 1024,
    minHeight: 1024,
    class: "category",
    generated: true,
    aspect: "1:1",
    prompt:
      "Elegant Bengali jamdani saree in terracotta and ivory draped flat-lay, " +
      "e-commerce category tile, centered, plain warm background, no text",
  },
  {
    name: "edit-festive-main.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "editorial",
    generated: true,
    aspect: "3:4",
    prompt:
      "Festive Bengali Eid clothing editorial still, folded terracotta and " +
      "ivory garments with marigold accents, warm side light, editorial " +
      "photograph, no text",
  },
  {
    name: "hero-artisans.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 768,
    class: "hero",
    generated: true,
    aspect: "16:9",
    prompt:
      "Bengali artisan workshop weaving kantha quilts, warm window light, " +
      "terracotta and ivory textiles, documentary e-commerce hero " +
      "photograph, no text",
  },
  {
    name: "hero-festive.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 768,
    class: "hero",
    generated: true,
    aspect: "16:9",
    prompt:
      "Festive Bengali Eid clothing market at golden hour, terracotta and " +
      "ivory fabric banners, editorial e-commerce hero photograph, warm " +
      "light, no text",
  },
  {
    name: "hero-weaves.jpg",
    format: "jpeg",
    minWidth: 1024,
    minHeight: 1024,
    class: "hero",
    generated: true,
    aspect: "1:1",
    prompt:
      "Close-up of a traditional Bengali handloom with terracotta jamdani " +
      "weave in progress, artisan hands, ivory threads, editorial craft " +
      "photograph, no text",
  },
  {
    name: "logo-lockup.svg",
    format: "svg",
    minWidth: null,
    minHeight: null,
    class: "brand",
    generated: false,
  },
  {
    name: "prod-necklace.png",
    format: "png",
    minWidth: 900,
    minHeight: 1200,
    class: "product",
    generated: true,
    aspect: "3:4",
    prompt:
      "Bengali terracotta temple necklace with gold accents upright on ivory " +
      "stand, e-commerce jewelry product photo, plain warm background, no text",
  },
  {
    name: "prod-panjabi.png",
    format: "png",
    minWidth: 900,
    minHeight: 1200,
    class: "product",
    generated: true,
    aspect: "3:4",
    prompt:
      "Ivory men's panjabi kurta with terracotta thread embroidery on a ghost " +
      "mannequin, e-commerce product photo, plain warm studio background, no text",
  },
  {
    name: "prod-saree.png",
    format: "png",
    minWidth: 900,
    minHeight: 1200,
    class: "product",
    generated: true,
    aspect: "3:4",
    prompt:
      "Terracotta jamdani saree with ivory motifs draped for e-commerce " +
      "product photo, plain warm studio background, no text",
  },
  {
    name: "ugc-1.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a Bengali woman in an ivory jamdani saree " +
      "holding a brass diya, warm indoor light, terracotta accents, no text",
  },
  {
    name: "ugc-2.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of folded terracotta kantha quilt on a " +
      "wooden stool, warm daylight, handmade texture, no text",
  },
  {
    name: "ugc-3.png",
    format: "png",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a Bengali festive kurta on a hanger in a " +
      "warm room, marigold accents, no text",
  },
  {
    name: "ugc-4.png",
    format: "png",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of stacked ivory and terracotta fabric bolts " +
      "in a weaver's workshop, warm daylight, no text",
  },
  {
    name: "ugc-5.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a silver filigree jhumka earring pair on " +
      "terracotta cloth, warm side light, no text",
  },
  {
    name: "ugc-6.jpg",
    format: "jpeg",
    minWidth: 896,
    minHeight: 1200,
    class: "ugc",
    generated: true,
    aspect: "3:4",
    prompt:
      "Customer-style photograph of a handwoven muslin saree draped over a " +
      "chair, soft daylight, ivory and warm tones, no text",
  },
];
