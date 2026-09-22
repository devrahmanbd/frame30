/**
 * clothing-heritage nuclear rebuild — secondary templates.
 *
 * Reuses the current template section ORDER from theme-blueprints.ts, with
 * every prop fixed to the CONTRACT preferred keys (headline variant for
 * heritage_story / editorial_banner, items[] for textile_showcase /
 * marquee_strip, no empty-string headings).
 */
import type { Section } from "../../builder-ast";
import type { SectionBuilder } from "./types";

type SecondaryTemplates = Record<
  "collection" | "product" | "page" | "blog" | "cart" | "checkout",
  { header: Section[]; main: Section[]; footer: Section[] }
>;

const TEXTILES = [
  {
    image: "/api/public/ph/heritage-handloom/jamdani.svg",
    title: "Jamdani",
    subtitle: "Dhakai Jamdani royal drape",
  },
  {
    image: "/api/public/ph/heritage-handloom/tangail-taant.svg",
    title: "Tangail Taant",
    subtitle: "Tangail handloom taant cotton saree",
  },
  {
    image: "/api/public/ph/heritage-handloom/nakshi-kantha.svg",
    title: "Nakshi Kantha",
    subtitle: "Hand-embroidered nakshi kantha",
  },
  {
    image: "/api/public/ph/heritage-handloom/pure-silk.svg",
    title: "Pure Silk",
    subtitle: "Rajshahi pure silk festive panjabi",
  },
];

const MARQUEE_ITEMS = [
  { text: "Handloom" },
  { text: "Fair Trade" },
  { text: "Artisan-Owned" },
  { text: "Natural Dyes" },
  { text: "Zero Plastic" },
];

export function buildSecondaryTemplates(
  s: SectionBuilder,
  header: () => Section[],
  footer: () => Section[],
): SecondaryTemplates {
  void header;
  return {
    /* ---- collection ---- */
    collection: {
      header: [s("breadcrumb", { homeLabel: "Home" })],
      main: [
        s("category_header", {
          heading: "Heritage Craft Collection",
          body: "Filter by artisan district, weave type, size, and occasion.",
          showCount: true,
          showBreadcrumb: true,
          homeLabel: "Home",
        }),
        s("filter_chips", {
          clearLabel: "Clear all",
          emptyText: "No filters applied.",
        }),
        s("facet_sidebar", {
          heading: "Filters",
          limit: 12,
          showCategories: true,
          showKinds: true,
          showPrice: true,
          showStock: true,
          drawerLabel: "Filters",
          clearLabel: "Clear all",
          categoryLabel: "Category",
          kindLabel: "Type",
          priceLabel: "Price",
          stockLabel: "Availability",
          inStockLabel: "In stock only",
        }),
        s("result_toolbar", {
          countLabel: "pieces",
          showSort: true,
          showDensity: false,
          filtersLabel: "Filters",
          sortLabel: "Sort",
        }),
        s("product_grid", {
          heading: "All handcrafted pieces",
          limit: 16,
          columns: 4,
          cardVariant: "editorial",
        }),
        s("product_rail", {
          heading: "Trending now",
          collection: "best-sellers",
          limit: 8,
          cardVariant: "editorial",
          showRating: true,
          promise: "Crafted in limited small batches",
        }),
        s("textile_showcase", {
          headline: "Featured textiles",
          items: TEXTILES,
        }),
        s("pagination", {
          mode: "more",
          moreLabel: "Load more",
          prevLabel: "Previous",
          nextLabel: "Next",
          pageLabel: "Page",
        }),
        s("empty_state", {
          heading: "Nothing matches those filters",
          body: "Try removing a filter or two.",
          clearLabel: "Clear all",
          showSuggestions: true,
          limit: 4,
        }),
      ],
      footer: footer(),
    },
    /* ---- product detail page ---- */
    product: {
      header: [s("breadcrumb", { homeLabel: "Home" })],
      main: [
        s("product_media", {
          ratio: "4/3",
          showThumbnails: true,
          zoom: true,
        }),
        s("split_feature", {
          eyebrow: "Heritage collection",
          heading: "Handcrafted with care",
          body: "Each piece tells a story of artisan skill and generational craft traditions.",
          ctaLabel: "Our heritage",
          ctaHref: "/pages/about",
          flip: false,
        }),
        s("price_block", {
          showCompareAt: true,
          note: "All government taxes & VAT included.",
        }),
        s("stock_delivery", {
          lowStockAt: 8,
          cutOff: "Order within 2 hrs for same-day dispatch in Dhaka",
        }),
        s("size_selector", {
          heading: "Select a size",
          notifyLabel: "Notify me",
          guideLabel: "Size guide",
        }),
        s("size_guide", {
          heading: "Garment size guide",
          openLabel: "Open size guide",
          unit: "in",
          c1Label: "Chest",
          c2Label: "Length",
          c3Label: "Sleeve",
          r1Label: "38",
          r1c1: 40,
          r1c2: 40,
          r1c3: 24,
          r2Label: "40",
          r2c1: 42,
          r2c2: 42,
          r2c3: 25,
          r3Label: "42",
          r3c1: 44,
          r3c2: 44,
          r3c3: 25,
          r4Label: "44",
          r4c1: 46,
          r4c2: 45,
          r4c3: 26,
          note: "All measurements are in inches. Garment laid flat.",
        }),
        s("fit_note", {
          fit: "true",
          note: "Tailored fit through the chest, comfortable through the waist.",
          modelHeight: "Model is 182cm",
          modelSize: "Wearing size 40",
        }),
        s("add_to_cart", { label: "Add to bag", showQuantity: true }),
        s("wishlist_button", {
          addLabel: "Save for later",
          savedLabel: "Saved",
          showCount: true,
        }),
        s("delivery_promise", {
          heading: "Delivery & Returns",
          insideLabel: "Inside Dhaka",
          insideDays: "Same-day or next-day",
          outsideLabel: "Outside Dhaka",
          outsideDays: "48-72 hours",
          note: "Carefully packed in eco-friendly protective wrapping.",
        }),
        s("care_panel", {
          heading: "Fabric & craft care",
          composition: "100% handspun cotton & mulberry silk",
          care: "Dry clean recommended. Iron on reverse side on low heat.",
          origin: "Handwoven in Tangail & Sonargaon, Bangladesh",
          open: false,
        }),
        s("textile_showcase", {
          headline: "Textile details",
          items: TEXTILES,
        }),
        s("testimonial_carousel", {
          testimonials: [
            {
              quote:
                "The Jamdani saree exceeded all expectations. The texture, fall, and intricate motif work are truly world-class.",
              author: "Farhana Ahmed, Gulshan, Dhaka",
            },
          ],
        }),
        s("support_strip", {
          heading: "Need help?",
          t1Title: "Order Tracking",
          t1Body: "Real-time dispatch updates",
          t1Href: "/pages/track-order",
          t2Title: "Size Guide",
          t2Body: "Find your perfect fit",
          t2Href: "/pages/size-guide",
          t3Title: "Returns",
          t3Body: "7-day hassle-free exchanges",
          t3Href: "/pages/returns",
          t4Title: "Contact Us",
          t4Body: "Personal styling helpline",
          t4Href: "/pages/contact",
        }),
        s("back_in_stock", {
          heading: "Sold out in your size?",
          body: "Our master artisans produce small batches. Leave your email for restock notification.",
          buttonLabel: "Notify me",
          consentText: "I agree to receive one restock email.",
        }),
        s("rating_summary", {
          heading: "Customer ratings",
          showHistogram: true,
          verifiedOnly: true,
        }),
        s("review_list", {
          heading: "Customer reviews",
          limit: 5,
          sort: "recent",
          verifiedOnly: true,
          emptyText: "No reviews yet.",
        }),
        s("product_rail", {
          heading: "More from this craft",
          collection: "heritage-handloom",
          limit: 6,
          cardVariant: "editorial",
          showRating: true,
        }),
        s("sticky_buy_bar", {
          label: "Add to bag",
          showPrice: true,
        }),
      ],
      footer: footer(),
    },
    /* ---- about / contact / fullwidth pages ---- */
    page: {
      header: [s("breadcrumb", { homeLabel: "Home" })],
      main: [
        s("heritage_story", {
          eyebrow: "Our story",
          headline: "Preserving Bengal's 500-year-old handloom heritage",
          body: "How community-led weaving clusters are empowering women artisans across rural Bangladesh.",
          ctaLabel: "Meet the artisans",
          ctaHref: "/blog/master-weavers",
        }),
        s("editorial_banner", {
          eyebrow: "Our mission",
          headline: "Fair trade, from loom to wardrobe",
          subhead:
            "Every purchase directly supports artisan families across 64 districts. No middlemen, no exploitation — just dignity and craft.",
          cta_label: "Our charter",
          cta_url: "/pages/fair-trade",
        }),
        s("marquee_strip", { items: MARQUEE_ITEMS }),
        s("story_trunk", {
          heading: "Five decades of craft",
          t1Title: "Founded 1972",
          t1Body: "Born from a vision to preserve Bengal's weaving traditions",
          t2Title: "65,000+ artisans",
          t2Body: "Rural craftspeople across 64 districts",
          t3Title: "Zero plastic",
          t3Body: "Biodegradable jute and paper packaging",
        }),
        s("testimonial_carousel", {
          testimonials: [
            {
              quote:
                "The Jamdani saree exceeded all expectations. The texture, fall, and intricate motif work are truly world-class.",
              author: "Farhana Ahmed, Gulshan, Dhaka",
            },
            {
              quote:
                "Authentic handloom quality at a fair price. My family has worn Aarong for three generations.",
              author: "Tanvir Rahman, Banani, Dhaka",
            },
          ],
        }),
        s("page_content", {}),
        s("store_locator", {
          heading: "Visit our flagships",
          s1Name: "Uttara Flagship",
          s1Address: "Sector 3, Uttara, Dhaka",
          s1Hours: "10am - 9pm",
          s2Name: "Gulshan Galleria",
          s2Address: "Gulshan Avenue, Dhaka",
          s2Hours: "10am - 9pm",
          s3Name: "Chattogram GEC",
          s3Address: "GEC Circle, Chattogram",
          s3Hours: "10am - 9pm",
        }),
        s("form", {
          heading: "",
          body: "We'd love to hear from you. Fill out the form below and our team will get back to you within 24 hours.",
          nameLabel: "Your name",
          emailLabel: "Email address",
          phoneLabel: "Phone (optional)",
          messageLabel: "Your message",
          buttonLabel: "Send message",
          successText: "Thank you! We'll be in touch soon.",
          consentText: "I agree to receive a reply to my message.",
        }),
        s("faq", {
          heading: "Frequently asked questions",
          q1: "What are your delivery timelines?",
          a1: "Orders within Dhaka city are delivered within 24-48 hours. Nationwide deliveries across all 64 districts take 48-72 hours via premium courier.",
          q2: "Can I exchange an item at a physical store?",
          a2: "Yes! Any item purchased online can be exchanged at any Framique flagship outlet in Dhaka, Chattogram, or Sylhet within 7 days with the original invoice.",
          q3: "Are your handloom fabrics pre-shrunk?",
          a3: "All our pure cotton and silk garments undergo traditional pre-wash finishing. Follow our care guidelines for minimal shrinkage.",
        }),
        s("support_strip", {
          heading: "How can we help?",
          t1Title: "Order Tracking",
          t1Body: "Real-time dispatch updates",
          t1Href: "/pages/track-order",
          t2Title: "Store Locator",
          t2Body: "Find your nearest flagship",
          t2Href: "/pages/stores",
          t3Title: "Size & Fit Advice",
          t3Body: "Personal styling helpline",
          t3Href: "/pages/size-guide",
          t4Title: "Easy Exchanges",
          t4Body: "7-day doorstep exchange",
          t4Href: "/pages/returns",
        }),
      ],
      footer: footer(),
    },
    /* ---- blog ---- */
    blog: {
      header: [s("breadcrumb", { homeLabel: "Home" })],
      main: [
        s("blog_terms", {
          heading: "Explore by topic",
          style: "pills",
          showCounts: true,
        }),
        s("blog_archive", {
          heading: "Heritage journal",
          layout: "grid",
          columns: 3,
          limit: 9,
          showCover: true,
          showExcerpt: true,
          showMeta: true,
          emptyText: "No articles yet.",
        }),
        s("heritage_story", {
          eyebrow: "The heritage journal",
          headline: "Preserving Bengal's 500-year-old handloom heritage",
          body: "How community-led weaving clusters are empowering women artisans across rural Bangladesh.",
          ctaLabel: "Read the story",
          ctaHref: "/blog/handloom-heritage",
        }),
        s("blog_pager", { align: "center" }),
        s("newsletter", {
          heading: "Join the heritage guild",
          body: "Receive intimate stories from weaver villages and private invitations to seasonal drops.",
          buttonLabel: "Subscribe",
        }),
      ],
      footer: footer(),
    },
    /* ---- cart ---- */
    cart: {
      header: [],
      main: [
        s("free_shipping_bar", {
          freeShippingLabel: "Add",
          freeShippingSuffix: "more for free nationwide delivery",
          freeShippingDone: "Free delivery unlocked",
        }),
        s("cart_lines", { heading: "" }),
        s("cart_summary", {
          heading: "Order summary",
          ctaLabel: "Proceed to checkout",
          showCta: true,
          showCoupon: true,
          showFreeShipping: true,
        }),
        s("heading", {
          text: "Your shopping bag",
          level: "h2",
          align: "left",
        }),
        s("trust_bar", {
          i1Icon: "delivery",
          i1Title: "Nationwide 48h dispatch",
          i1Body: "Fast, tracked delivery across 64 districts",
          i2Icon: "returns",
          i2Title: "7-day easy exchange",
          i2Body: "Return or exchange in any flagship store",
          i3Icon: "secure",
          i3Title: "100% genuine craft",
          i3Body: "Certified handloom & fair trade co-ops",
          i4Icon: "support",
          i4Title: "Dedicated helpline",
          i4Body: "Live customer assistance 10am - 9pm",
        }),
        s("payment_methods", {
          heading: "",
          note: "Secure encrypted transaction.",
          emptyText: "No payment method is enabled yet.",
        }),
        s("rich_text", {
          heading: "Handcrafted guarantee",
          body: "Each piece is individually inspected for weaving excellence before dispatch. Cash on delivery available.",
        }),
        s("product_grid", {
          heading: "Complementary crafts",
          limit: 4,
          columns: 4,
          cardVariant: "editorial",
        }),
      ],
      footer: footer(),
    },
    /* ---- checkout ---- */
    checkout: {
      header: [s("banner", { text: "Secure checkout", tone: "info" })],
      main: [
        s("payment_methods", {
          heading: "",
          note: "Payments are processed server-side.",
          emptyText: "No payment method is enabled yet.",
        }),
        s("checkout_steps", {
          heading: "Checkout",
          step1: "Bag",
          step2: "Address",
          step3: "Payment",
          step4: "Done",
          activeStep: 3,
        }),
        s("cart_lines", { heading: "" }),
        s("cart_summary", { heading: "Order summary" }),
        s("delivery_promise", {
          heading: "Delivery",
          insideLabel: "Inside Dhaka",
          insideDays: "1-2 days",
          outsideLabel: "Outside Dhaka",
          outsideDays: "2-4 days",
          note: "Courier charge shown at checkout.",
        }),
      ],
      footer: [
        s("feature_row", {
          itemOne: "7-day easy exchange",
          itemTwo: "bKash / Nagad",
          itemThree: "Nationwide courier",
        }),
      ],
    },
  };
}
