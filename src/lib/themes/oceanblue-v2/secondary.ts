import type { Section, TemplateKey } from "../../builder-ast";
import { withOceanblueV2Defaults } from "./skins";
import type { SectionBuilder } from "./types";

/**
 * Oceanblue-v2 installed secondary templates (spec §4).
 *
 * Same verified contract as v1: merchant starting compositions, distinct
 * from preview demo bodies (`preview.ts`), because the lint contract
 * differs — on route-headed templates (`product`, `collection`,
 * `account`, `page`, `blog`, `search`) the route supplies the `<h1>`, so
 * NO widget may claim it; on `cart`/`checkout` exactly one widget claims
 * it. Non-primary heading-capable widgets carry an explicit blank
 * `heading: ""` (absent keys still claim — see `blankHeading`).
 *
 * V2 deltas over v1: PDP gains the `sticky_buy_bar` (PDP-only per spec
 * §3 global rules); listing templates gain `filter_chips` next to the
 * sort toolbar. Context widgets stay on their own templates
 * (`isContextMismatch` is a publish-blocking error): product widgets on
 * `product`, cart widgets on `cart`/`checkout`, `page_content` on
 * `page`/`blog`.
 */
export function buildSecondaryMain(
  s: SectionBuilder,
  template: Exclude<TemplateKey, "index">,
): Section[] {
  s = withOceanblueV2Defaults(s);
  switch (template) {
    case "product":
      return [
        {
          ...s("columns", { columns: 2, asymmetrical: true, gap: 64, padY: 16 }),
          children: [
            {
              ...s("container", {}),
              children: [s("product_media", { ratio: "4/5" })],
            },
            {
              ...s("container", {}),
              children: [
                s("breadcrumb", { homeLabel: "Home", homeLabel_bn: "হোম" }),
                s("product_meta", {}),
                s("price_block", { showCompareAt: true }),
                s("add_to_cart", {
                  label: "Add to cart",
                  label_bn: "কার্টে যোগ করুন",
                  showQuantity: true,
                }),
              ],
            },
          ],
        },
        s("sticky_buy_bar", {
          label: "Add to cart",
          label_bn: "কার্টে যোগ করুন",
          showPrice: true,
          dockAfter: 320,
        }),
        s("rich_text", {
          heading: "Details",
          heading_bn: "বিবরণ",
          body: "Fabric, fit and care details live here — edit this text for your products.",
          body_bn:
            "কাপড়, ফিট ও যত্নের বিবরণ এখানে থাকবে — আপনার পণ্যের জন্য এই লেখা সম্পাদনা করুন।",
        }),
        s("product_rail", {
          heading: "Complete the look",
          heading_bn: "লুক সম্পূর্ণ করুন",
          limit: 4,
          source: "collection",
          collection: "festive",
          cardVariant: "standard",
          showRating: false,
          skin: "minimal",
        }),
      ];
    case "collection":
      return [
        s("filter_chips", { clearLabel: "Clear all" }),
        s("result_toolbar", { sortDefault: "Featured" }),
        s("product_grid", {
          heading: "",
          limit: 24,
          columns: 4,
          source: "collection",
          collection: "",
          skin: "cards",
        }),
        s("product_rail", {
          heading: "You may also like",
          heading_bn: "আপনার পছন্দ হতে পারে",
          limit: 8,
          source: "recommended",
          cardVariant: "standard",
          showRating: false,
          skin: "minimal",
        }),
      ];
    case "page":
      return [
        s("breadcrumb", { homeLabel: "Home", homeLabel_bn: "হোম" }),
        s("page_content", {}),
      ];
    case "blog":
      return [
        s("blog_terms", { heading: "", style: "pills", showCounts: true }),
        s("blog_archive", {
          heading: "",
          layout: "grid",
          columns: 3,
          limit: 9,
          showCover: true,
          showExcerpt: true,
          showMeta: true,
          emptyText: "No articles yet.",
          emptyText_bn: "এখনও কোনো নিবন্ধ নেই।",
        }),
        s("blog_pager", { align: "center" }),
        s("newsletter", {
          heading: "New drops, first inbox",
          heading_bn: "নতুন ড্রপ, সবার আগে ইনবক্সে",
          body: "New arrivals, restocks and sale alerts.",
          body_bn: "নতুন সংগ্রহ, রিস্টক ও সেল অ্যালার্ট।",
          buttonLabel: "Subscribe",
          buttonLabel_bn: "সাবস্ক্রাইব",
          consentText: "We email only for drops and sales. Unsubscribe anytime.",
          consentText_bn:
            "শুধু ড্রপ ও সেলের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
        }),
      ];
    case "search":
      return [
        s("filter_chips", { clearLabel: "Clear all" }),
        s("result_toolbar", { sortDefault: "Featured" }),
        s("product_grid", {
          heading: "",
          limit: 16,
          columns: 4,
          source: "collection",
          collection: "",
          skin: "cards",
        }),
      ];
    case "cart":
      return [
        {
          ...s("columns", { columns: 2, asymmetrical: true, gap: 64 }),
          children: [
            {
              ...s("container", {}),
              children: [
                s("cart_lines", {
                  heading: "Your bag",
                  heading_bn: "আপনার ব্যাগ",
                }),
              ],
            },
            {
              ...s("container", {}),
              children: [
                // Blank heading: cart_lines above owns this page's <h1>.
                s("cart_summary", {
                  heading: "",
                  heading_bn: "",
                  showCoupon: true,
                  showCta: true,
                  showFreeShipping: true,
                }),
              ],
            },
          ],
        },
        s("product_rail", {
          heading: "You may also like",
          heading_bn: "আপনার পছন্দ হতে পারে",
          limit: 4,
          source: "recommended",
          cardVariant: "standard",
          showRating: false,
          skin: "minimal",
        }),
      ];
    case "checkout":
      return [
        {
          ...s("columns", { columns: 2, asymmetrical: true, gap: 64 }),
          children: [
            {
              ...s("container", {}),
              children: [
                s("checkout_steps", {
                  heading: "",
                  step1: "Cart",
                  step2: "Details",
                  step3: "Payment",
                  step4: "Done",
                  activeStep: 2,
                }),
                s("rich_text", {
                  heading: "Contact & Shipping",
                  heading_bn: "যোগাযোগ ও শিপিং",
                  body: "Provide your delivery address and contact details.",
                  body_bn:
                    "আপনার ডেলিভারি ঠিকানা এবং যোগাযোগের তথ্য প্রদান করুন।",
                }),
                // Blank heading: cart_lines below owns this page's <h1>.
                s("payment_methods", {
                  heading: "",
                  heading_bn: "",
                }),
              ],
            },
            {
              ...s("container", {}),
              children: [
                s("cart_lines", {
                  heading: "Order review",
                  heading_bn: "অর্ডার পর্যালোচনা",
                }),
                s("cart_summary", {
                  heading: "",
                  heading_bn: "",
                  showCoupon: true,
                  showCta: false,
                  showFreeShipping: true,
                }),
              ],
            },
          ],
        },
      ];
    case "account":
      return [s("profile_card", {}), s("orders_list", {})];
  }
}
