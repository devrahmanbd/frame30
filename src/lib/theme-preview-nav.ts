/**
 * In-preview navigation (Envato-style demo browsing).
 *
 * Links inside a theme preview point at live storefront permalinks
 * (`/c/<slug>`, `/p/<slug>`, …) which 404 on platform hosts — there is no
 * merchant there. Instead of escaping the frame, the preview maps demo
 * links onto its own template tabs so every tap shows authored demo
 * content. Unmapped links (external, tel:, mailto:, anchors) return null
 * and keep default browser behavior.
 */
import type {
  Section,
  TemplateKey,
  ThemeAst,
  ThemeTokens,
} from "./builder-ast";
import { SONGOSKRITI_TOKENS } from "./themes/songoskriti/tokens";
import { buildHeaderMain } from "./themes/songoskriti/header";
import { buildFooterMain } from "./themes/songoskriti/footer";
import { buildHomepageMain } from "./themes/songoskriti/homepage";
import type { SectionBuilder } from "./themes/songoskriti/types";

export function previewTemplateForHref(href: string): TemplateKey | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("#")) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(raw)) return null;
  // Absolute platform URLs (StoreHeader links) resolve same as root paths.
  const path = raw.replace(/^https?:\/\/[^/]+/i, "").split("?")[0]!;
  if (path === "/") return "index";
  if (path === "/search") return "search";
  if (path === "/cart") return "cart";
  if (path === "/checkout") return "checkout";
  if (path === "/c" || path.startsWith("/c/")) return "collection";
  if (path === "/p" || path.startsWith("/p/")) return "product";
  if (path === "/collections" || path.startsWith("/collections/"))
    return "collection";
  if (path === "/products" || path.startsWith("/products/"))
    return "product";
  if (path === "/blog" || path.startsWith("/blog/")) return "blog";
  if (
    path === "/pages" ||
    path.startsWith("/pages/") ||
    path === "/page" ||
    path.startsWith("/page/")
  )
    return "page";
  return null;
}

/* ------------------------------------------------- preview key resolver */

/**
 * Theme preview preset resolution.
 *
 * `songoskriti` builds its authored AST from the Task 1 builders + locked
 * tokens; every other key returns null so the route renders its 404 state.
 *
 * Every template authors demo content: navbar, category, footer and product
 * links must land on a rendered page, never on the empty state. Data rails
 * resolve through previewDemoMap; static sections carry copy marked as demo
 * where money or actions are involved. Ordering stays blocked — forms and
 * signup / order-tracking hrefs toast instead of acting.
 */
export type ThemePreviewPreset = {
  key: string;
  themeName: string;
  author: string;
  tokens: ThemeTokens;
  templates: Record<TemplateKey, ThemeAst>;
};

export function resolveThemePreview(key: string): ThemePreviewPreset | null {
  if (key !== "songoskriti") return null;
  let n = 0;
  const s: SectionBuilder = (type, props = {}) => {
    const section: Section = {
      id: `${type}-${n++}`,
      type,
      props: { ...props },
    };
    return section;
  };
  const headerBase = buildHeaderMain(s);
  const footerBase = buildFooterMain(s);
  // Ids must stay globally unique across templates sharing one counter, so
  // the shared header/footer nodes are cloned under a template-scoped id
  // (same convention as withSearch in theme-blueprints).
  const reid = (sections: Section[], scope: string): Section[] =>
    sections.map((section) => ({ ...section, id: `${section.id}-${scope}` }));
  const tpl = (scope: TemplateKey, main: Section[]): ThemeAst => ({
    header: reid(headerBase, scope),
    main,
    footer: reid(footerBase, scope),
  });
  const rail = (
    heading: string,
    heading_bn: string,
    collection: string,
    promise: string,
    promise_bn: string,
    limit = 8,
  ) =>
    s("product_rail", {
      heading,
      heading_bn,
      limit,
      source: "collection",
      collection,
      cardVariant: "editorial",
      showRating: true,
      promise,
      promise_bn,
    });
  const templates: Record<TemplateKey, ThemeAst> = {
    index: tpl("index", buildHomepageMain(s)),
    collection: tpl("collection", [
      s("heading", { text: "New in", text_bn: "নতুন এসেছে" }),
      rail(
        "New arrivals",
        "নতুন এসেছে",
        "new-in",
        "In stock · Dispatched in 24h",
        "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
      ),
      rail(
        "More to explore",
        "আরও দেখুন",
        "festive",
        "Loved across 64 districts",
        "সারা দেশে জনপ্রিয়",
      ),
    ]),
    product: tpl("product", [
      s("heading", {
        text: "Dhakai Jamdani Heritage Saree",
        text_bn: "ঢাকাই জামদানি হেরিটেজ শাড়ি",
      }),
      s("product_media", {
        image1: "/ph/songoskriti/prod-saree.png",
        image2: "/ph/songoskriti/prod-panjabi.png",
        image3: "/ph/songoskriti/prod-necklace.png",
        image4: "/ph/songoskriti/cat-women.png",
        ratio: "4/5",
      }),
      s("rich_text", {
        heading: "Details",
        heading_bn: "বিবরণ",
        body: "Demo product page. Prices and stock are sample data — ordering is disabled in preview.",
        body_bn:
          "ডেমো পণ্যের পাতা। দাম ও স্টক নমুনা তথ্য — প্রিভিউতে অর্ডার বন্ধ আছে।",
      }),
      rail(
        "Complete the look",
        "লুক সম্পূর্ণ করুন",
        "festive",
        "Loved across 64 districts",
        "সারা দেশে জনপ্রিয়",
        4,
      ),
    ]),
    page: tpl("page", [
      s("heading", { text: "Size guide", text_bn: "সাইজ গাইড" }),
      s("rich_text", {
        heading: "How to measure",
        heading_bn: "কীভাবে মাপবেন",
        body: "Demo article. Chest, waist and length guidance for panjabis, kurtas and saree blouses.",
        body_bn:
          "ডেমো নিবন্ধ। পাঞ্জাবি, কুর্তা ও শাড়ির ব্লাউজের জন্য মাপের নির্দেশনা।",
      }),
    ]),
    blog: tpl("blog", [
      s("heading", { text: "Journal", text_bn: "জার্নাল" }),
      s("image", {
        src: "/ph/songoskriti/hero-artisans.png",
        alt: "Artisans weaving on a wooden loom",
        ratio: "16/9",
        caption: "Artisan owned",
      }),
      s("rich_text", {
        heading: "Meet the makers",
        heading_bn: "কারিগরদের চিনুন",
        body: "Demo story. Kantha embroidery stitched by rural artisans — full articles ship with the theme.",
        body_bn:
          "ডেমো গল্প। গ্রামের কারিগরদের হাতে সেলাই করা কাঁথা — পূর্ণ নিবন্ধ থিমের সাথেই আসে।",
      }),
    ]),
    search: tpl("search", [
      s("heading", { text: "Search results", text_bn: "খোঁজার ফলাফল" }),
      s("rich_text", {
        heading: "Demo search",
        heading_bn: "ডেমো খোঁজ",
        body: "Live search runs on the storefront. Below is what a results rail looks like.",
        body_bn: "লাইভ খোঁজ দোকানে চলে। নিচে ফলাফলের একটি নমুনা দেখুন।",
      }),
      rail(
        "Popular right now",
        "এখন জনপ্রিয়",
        "festive",
        "Loved across 64 districts",
        "সারা দেশে জনপ্রিয়",
      ),
    ]),
    cart: tpl("cart", [
      s("heading", { text: "Your bag", text_bn: "আপনার ব্যাগ" }),
      s("rich_text", {
        heading: "Demo bag",
        heading_bn: "ডেমো ব্যাগ",
        body: "2 items · sample totals. Checkout is disabled in preview — your bag is safe.",
        body_bn:
          "২টি পণ্য · নমুনা মোট। প্রিভিউতে চেকআউট বন্ধ আছে — আপনার ব্যাগ নিরাপদ।",
      }),
      rail(
        "You may also like",
        "আপনার পছন্দ হতে পারে",
        "new-in",
        "In stock · Dispatched in 24h",
        "স্টকে আছে · ২৪ ঘণ্টায় ডিসপ্যাচ",
        4,
      ),
    ]),
    checkout: tpl("checkout", [
      s("heading", { text: "Checkout", text_bn: "চেকআউট" }),
      s("rich_text", {
        heading: "Demo checkout",
        heading_bn: "ডেমো চেকআউট",
        body: "Address, delivery and payment steps render here on the storefront. Placing orders is disabled in preview.",
        body_bn:
          "দোকানে এখানে ঠিকানা, ডেলিভারি ও পেমেন্টের ধাপ দেখা যায়। প্রিভিউতে অর্ডার করা বন্ধ আছে।",
      }),
      s("payment_icons", {
        heading: "We accept",
        marks: "bKash, Nagad, Rocket, Visa, Mastercard, Cash on delivery",
      }),
    ]),
    account: tpl("account", [
      s("heading", { text: "Account", text_bn: "অ্যাকাউন্ট" }),
      s("profile_card", {}),
      s("orders_list", {}),
    ]),
  };
  return {
    key: "songoskriti",
    themeName: "Songoskriti",
    author: "Framique",
    tokens: SONGOSKRITI_TOKENS,
    templates,
  };
}
