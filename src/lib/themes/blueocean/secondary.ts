/**
 * BlueOcean secondary templates — Phase B enriched bodies.
 * Product storytelling (delivery promise, size guide, reviews, recently
 * viewed), merchandising collection (live grid, empty state, newsletter),
 * canonical blog (terms, archive, pager). All keys declared, all authored
 * strings twinned — publish-gate safe.
 */
import type { Section, TemplateKey } from "../../builder-ast";
import { withBlueoceanDefaults } from "./skins";
import type { SectionBuilder } from "./types";

export function buildSecondaryMain(
  s: SectionBuilder,
  template: TemplateKey,
): Section[] {
  const ws = withBlueoceanDefaults(s);
  switch (template) {
    case "product":
      return [
        ws("breadcrumb", { homeLabel: "Home" }),
        {
          ...ws("columns", {
            columns: 2,
            asymmetrical: true,
            gap: 48,
            padY: 24,
          }),
          children: [
            {
              ...ws("container", {}),
              children: [ws("product_media", { ratio: "3/4", zoom: true })],
            },
            {
              ...ws("container", {}),
              children: [
                ws("product_meta", { heading: "Product Name" }),
                ws("price_block", { size: "lg" }),
                ws("add_to_cart", {
                  label: "Add to Bag",
                  label_bn: "ব্যাগে যোগ করুন",
                  fullWidth: true,
                }),
                ws("delivery_promise", {
                  heading: "Delivery",
                  heading_bn: "ডেলিভারি",
                  insideLabel: "Inside Dhaka",
                  insideLabel_bn: "ঢাকার ভেতরে",
                  insideDays: "2–3 days",
                  insideDays_bn: "২–৩ দিন",
                  outsideLabel: "Outside Dhaka",
                  outsideLabel_bn: "ঢাকার বাইরে",
                  outsideDays: "4–6 days",
                  outsideDays_bn: "৪–৬ দিন",
                  note: "Cash on delivery available.",
                  note_bn: "ক্যাশ অন ডেলিভারি আছে।",
                }),
                ws("rich_text", {
                  body: "A considered piece for festive and everyday wear.",
                  body_bn: "উৎসব ও প্রতিদিনের পরার জন্য একটি ভাবনাচিন্তার সৃষ্টি।",
                  size: "sm",
                }),
                ws("size_guide", {
                  heading: "Size guide",
                  heading_bn: "সাইজ গাইড",
                  openLabel: "Size guide",
                  openLabel_bn: "সাইজ গাইড",
                  unit: "cm",
                  c1Label: "Chest",
                  c1Label_bn: "বুক",
                  c2Label: "Waist",
                  c2Label_bn: "কোমর",
                  c3Label: "Length",
                  c3Label_bn: "লম্বা",
                  note: "Runs true to size.",
                  note_bn: "সাইজ ঠিকঠাক হয়।",
                }),
                ws("accordion", {
                  i1Title: "Fabric & Care",
                  i1Title_bn: "ফ্যাব্রিক ও যত্ন",
                  i1Body: "Premium fabric. Dry clean recommended.",
                  i1Body_bn:
                    "প্রিমিয়াম ফ্যাব্রিক। ড্রাই ক্লিন করার পরামর্শ দেওয়া হলো।",
                }),
              ],
            },
          ],
        },
        ws("product_rail", {
          heading: "You May Also Like",
          heading_bn: "আপনার আরও পছন্দ হতে পারে",
          limit: 4,
          source: "related",
          skin: "editorial",
        }),
        ws("review_list", {
          heading: "Reviews",
          heading_bn: "রিভিউ",
          limit: 6,
          verifiedOnly: false,
          emptyText: "No reviews yet — be the first to share fit notes.",
          emptyText_bn: "এখনো রিভিউ নেই — ফিট নোট শেয়ার করুন।",
        }),
        ws("recently_viewed", {
          heading: "Recently Viewed",
          heading_bn: "সম্প্রতি দেখেছেন",
          limit: 6,
          showClear: true,
        }),
      ];
    case "collection":
      return [
        ws("breadcrumb", { homeLabel: "Home" }),
        ws("rich_text", {
          heading: "Collection",
          heading_bn: "কালেকশন",
          size: "lg",
          align: "center",
        }),
        ws("collection_grid", {
          heading: "",
          limit: 24,
          columns: 4,
          showCount: true,
          cardVariant: "standard",
        }),
        ws("empty_state", {
          heading: "Nothing here yet",
          heading_bn: "এখানে এখনো কিছু নেই",
          body: "New pieces land every week — browse the latest instead.",
          body_bn: "প্রতি সপ্তাহে নতুন পোশাক আসে — নতুন সংগ্রহ দেখুন।",
          clearLabel: "Shop new in",
          clearLabel_bn: "নতুন সংগ্রহ",
          showSuggestions: true,
          limit: 4,
        }),
        ws("newsletter", {
          heading: "Never miss a drop",
          heading_bn: "ড্রপ মিস করবেন না",
          body: "Restock and sale alerts for this collection.",
          body_bn: "এই কালেকশনের রিস্টক ও সেল অ্যালার্ট।",
          buttonLabel: "Subscribe",
          buttonLabel_bn: "সাবস্ক্রাইব",
          consentText: "Only drops and sales. Unsubscribe anytime.",
          consentText_bn: "শুধু ড্রপ ও সেল। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
        }),
      ];
    case "page":
      return [
        ws("rich_text", {
          heading: "Page Title",
          heading_bn: "পাতার শিরোনাম",
          size: "lg",
        }),
        ws("page_content", {}),
      ];
    case "blog":
      return [
        ws("blog_terms", {
          heading: "Journal",
          style: "pills",
          showCounts: true,
        }),
        ws("blog_archive", {
          heading: "",
          layout: "grid",
          columns: 3,
          limit: 9,
          showCover: true,
          showExcerpt: true,
          showMeta: true,
          emptyText: "No articles yet.",
        }),
        ws("blog_pager", { align: "center" }),
        ws("newsletter", {
          heading: "Stories, first inbox",
          heading_bn: "গল্প, সবার আগে ইনবক্সে",
          body: "Weave notes, craft stories and drop alerts.",
          body_bn: "বুনন নোট, কারুশিল্পের গল্প ও ড্রপ অ্যালার্ট।",
          buttonLabel: "Subscribe",
          buttonLabel_bn: "সাবস্ক্রাইব",
          consentText: "Only stories and drops. Unsubscribe anytime.",
          consentText_bn: "শুধু গল্প ও ড্রপ। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
        }),
      ];
    case "cart":
      return [
        ws("heading", {
          text: "Shopping Bag",
          text_bn: "শপিং ব্যাগ",
          align: "center",
        }),
        {
          ...ws("columns", { columns: 2, asymmetrical: true, gap: 48 }),
          children: [
            {
              ...ws("container", {}),
              children: [ws("page_content", {})],
            },
            {
              ...ws("container", {}),
              children: [
                ws("cart_summary", { checkoutLabel: "Proceed to Checkout" }),
              ],
            },
          ],
        },
        ws("product_rail", {
          heading: "Pairs Well With",
          heading_bn: "সাথে মানাবে",
          limit: 4,
          source: "recommended",
          skin: "editorial",
        }),
      ];
    case "checkout":
      return [
        ws("heading", {
          text: "Secure Checkout",
          text_bn: "নিরাপদ চেকআউট",
          align: "center",
        }),
        {
          ...ws("columns", { columns: 2, asymmetrical: true, gap: 48 }),
          children: [
            {
              ...ws("container", {}),
              children: [ws("page_content", {})],
            },
            {
              ...ws("container", {}),
              children: [
                ws("cart_summary", { checkoutLabel: "Confirm Order" }),
              ],
            },
          ],
        },
      ];
    case "search":
      return [
        ws("heading", {
          text: "Search Results",
          text_bn: "খোঁজার ফলাফল",
          align: "center",
        }),
        ws("collection_grid", {
          heading: "",
          limit: 16,
          columns: 4,
          showCount: false,
          cardVariant: "standard",
        }),
        ws("empty_state", {
          heading: "No matches found",
          heading_bn: "কিছু পাওয়া যায়নি",
          body: "Try a fabric, colour or occasion instead.",
          body_bn: "ফ্যাব্রিক, রঙ বা অনুষ্ঠান লিখে দেখুন।",
          clearLabel: "Browse new in",
          clearLabel_bn: "নতুন সংগ্রহ দেখুন",
          showSuggestions: true,
          limit: 4,
        }),
      ];
    case "account":
      return [
        ws("heading", { text: "My Account", text_bn: "আমার অ্যাকাউন্ট" }),
        ws("page_content", {}),
      ];
    case "index":
      return [];
  }
}
