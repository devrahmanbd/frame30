import { describe, expect, it } from "vitest";
import { WIDGET_BY_KEY, newWidgetNode } from "./catalog";
import { contentControls } from "./controls";

/**
 * Ported theme widgets: every control key must exist in the widget
 * defaults, otherwise the settings panel edits a key the node never
 * carries. Batch 1 (engagement) + batch 2 (heritage + hero).
 */
const PORTED = [
  "faq",
  "marquee",
  "countdown",
  "banner",
  "trust_bar",
  "announcement_bar",
  "heritage_story",
  "editorial_banner",
  "editorial_hero",
  "lookbook",
  "hero",
  "textile_showcase",
  "department_grid",
  "story_trunk",
  "marquee_strip",
  "hero_carousel",
  "testimonial_carousel",
  "feature_row",
  "utility_bar",
  "footer_sitemap",
  "doc_links",
  "claim_chips",
  "texture_strip",
  "split_feature",
  "notice",
  "empty_state",
  "breadcrumb",
  "brand_strip",
  "subbrand_bar",
  "support_strip",
  "social_strip",
  "logo",
  "how_to_use",
  "buying_guide",
  "care_panel",
  "safety_note",
  "fit_note",
  "authenticity_badge",
  "sustain_badge",
  "discount_badge",
  "batch_info",
  "delivery_promise",
  "free_shipping_bar",
  "stock_delivery",
  "rank_list",
  "seller_card",
  "category_header",
  "collection_story",
  "brand_rail",
  "concern_rail",
  "back_in_stock",
  "price_block",
  "price_sparkline",
  "deal_card",
  "deal_strip",
  "sponsored_slot",
  "subbrand_spotlight",
  "size_guide",
  "routine_builder",
  "sample_picker",
  "shade_finder",
  "skin_quiz",
  "quiz",
  "consult_cta",
  "gift_builder",
  "bundle_builder",
  "shoppable_image",
  "compare_table",
  "spec_table",
  "spec_highlights",
  "ingredient_glossary",
  "ingredient_list",
  "ingredient_rail",
  "payment_methods",
  "payment_icons",
  "emi_calculator",
  "order_tracker",
  "product_grid",
  "product_rail",
  "product_media",
  "product_meta",
  "product_qna",
  "collection_grid",
  "account_cart",
  "cart_drawer",
  "cart_lines",
  "cart_summary",
  "checkout_steps",
  "search_command",
  "facet_sidebar",
  "pagination",
  "result_toolbar",
  "blog_archive",
  "blog_pager",
  "blog_terms",
  "review_list",
  "rating_summary",
  "recently_viewed",
  "wishlist_button",
  "compare_tray",
  "bundle_offer",
  "add_to_cart",
  "rewards_club",
  "wedding_shop",
  "gift_finder",
  "rich_text",
  "form",
  "nav_menu",
  "newsletter",
  "sticky_bar",
  "mega_menu",
  "buy_box",
  "variant_picker",
  "sticky_buy_bar",
  "filter_chips",
  "size_selector",
  "complete_the_look",
  "circle_categories",
  "store_locator",
  "ugc_gallery",
  "trade_in",
  "combo_card",
  "loyalty_strip",
  "warranty_panel",
  "before_after",
  "refill_widget",
  "quick_view",
  "department_strip",
  "columns",
] as const;

const COMMERCE_PORTED = new Set([
  "product_grid",
  "product_rail",
  "product_media",
  "product_meta",
  "product_qna",
  "collection_grid",
  "account_cart",
  "cart_drawer",
  "cart_lines",
  "cart_summary",
  "checkout_steps",
  "search_command",
  "facet_sidebar",
  "pagination",
  "result_toolbar",
  "review_list",
  "rating_summary",
  "recently_viewed",
  "wishlist_button",
  "compare_tray",
  "bundle_offer",
  "add_to_cart",
  "rewards_club",
  "wedding_shop",
  "gift_finder",
  "buy_box",
  "variant_picker",
  "sticky_buy_bar",
  "filter_chips",
  "size_selector",
  "complete_the_look",
  "circle_categories",
  "refill_widget",
  "quick_view",
]);

const MEDIA_PORTED = new Set(["ugc_gallery", "before_after"]);

const LAYOUT_PORTED = new Set(["columns"]);

describe("ported theme widgets", () => {
  for (const key of PORTED) {
    it(`${key} is registered with defaults`, () => {
      const def = WIDGET_BY_KEY[key];
      expect(def).toBeDefined();
      expect(def.label).toBeTruthy();
      expect(def.category).toBe(
        COMMERCE_PORTED.has(key)
          ? "commerce"
          : MEDIA_PORTED.has(key)
            ? "media"
            : LAYOUT_PORTED.has(key)
              ? "layout"
              : "general",
      );
    });

    it(`${key} controls match defaults`, () => {
      const def = WIDGET_BY_KEY[key];
      const keys = new Set(Object.keys(def.defaults));
      for (const control of contentControls(key)) {
        expect(
          keys.has(control.key),
          `${key}: control ${control.key} missing from defaults`,
        ).toBe(true);
      }
    });

    it(`${key} instantiates`, () => {
      const node = newWidgetNode(key);
      expect(node.el).toBe(key);
      expect(node.id).toBeTruthy();
    });
  }

  it("theme prop parity for flat props", () => {
    expect(WIDGET_BY_KEY.faq.defaults).toMatchObject({
      heading: "Frequently asked",
      q1: "",
      a1: "",
    });
    expect(WIDGET_BY_KEY.faq.defaults.items).toEqual([]);
    expect(WIDGET_BY_KEY.marquee.defaults).toMatchObject({
      text: "New arrivals every week",
      speed: 30,
      pauseOnHover: true,
    });
    expect(WIDGET_BY_KEY.countdown.defaults).toMatchObject({
      label: "Offer ends in",
      endsAt: "",
    });
    expect(WIDGET_BY_KEY.banner.defaults).toMatchObject({
      text: "Free delivery over BDT 2,000",
      tone: "info",
    });
    expect(WIDGET_BY_KEY.trust_bar.defaults).toMatchObject({
      i1Title: "Fast delivery",
    });
    expect(WIDGET_BY_KEY.trust_bar.defaults.items).toEqual([]);
    expect(WIDGET_BY_KEY.announcement_bar.defaults).toMatchObject({
      m1: "Free delivery over BDT 2,000",
      dismissible: true,
      rotateMs: 6000,
    });
    expect(WIDGET_BY_KEY.feature_row.defaults).toMatchObject({
      itemOne: "Cash on delivery",
      itemTwo: "Mobile payments",
      itemThree: "Nationwide shipping",
    });
    expect(WIDGET_BY_KEY.utility_bar.defaults).toMatchObject({
      note: "",
      l1Label: "",
      showLanguage: true,
    });
    expect(WIDGET_BY_KEY.footer_sitemap.defaults).toMatchObject({
      c1Title: "Shop",
      c1Links: "New in|/, Best sellers|/",
      c2Title: "Help",
    });
    expect(WIDGET_BY_KEY.doc_links.defaults).toMatchObject({
      heading: "Documents",
      d1Label: "User manual",
      d1Meta: "PDF",
    });
    expect(WIDGET_BY_KEY.claim_chips.defaults).toMatchObject({
      heading: "Tested & certified",
      c1Label: "",
      c1Source: "",
    });
    expect(WIDGET_BY_KEY.texture_strip.defaults).toMatchObject({
      heading: "Texture & finish",
      t1Image: "",
      t1Label: "",
    });
    expect(WIDGET_BY_KEY.split_feature.defaults).toMatchObject({
      heading: "Made to last",
      imageUrl: "",
      flip: false,
    });
    expect(WIDGET_BY_KEY.notice.defaults).toMatchObject({
      text: "",
      tone: "info",
      dismissible: false,
    });
    expect(WIDGET_BY_KEY.empty_state.defaults).toMatchObject({
      heading: "Nothing matches those filters",
      clearLabel: "Clear all filters",
      showSuggestions: true,
      limit: 4,
    });
    expect(WIDGET_BY_KEY.breadcrumb.defaults).toMatchObject({
      homeLabel: "Home",
    });
    expect(WIDGET_BY_KEY.brand_strip.defaults).toMatchObject({
      heading: "Shop by brand",
      limit: 12,
      columns: 4,
      kind: "brand",
    });
    expect(WIDGET_BY_KEY.subbrand_bar.defaults).toMatchObject({
      activeBrand: "Aarong",
      b1Name: "Aarong",
      b1Href: "/",
      b4Name: "Herstory",
      b5Name: "Grassroots",
    });
    expect(WIDGET_BY_KEY.support_strip.defaults).toMatchObject({
      heading: "Support",
      t1Title: "Hotline",
      t2Title: "WhatsApp",
    });
    expect(WIDGET_BY_KEY.social_strip.defaults).toMatchObject({
      heading: "@yourstore",
      i1Image: "",
    });
    expect(WIDGET_BY_KEY.logo.defaults).toMatchObject({
      image: "",
      href: "/",
      height: 40,
    });
    expect(WIDGET_BY_KEY.how_to_use.defaults).toMatchObject({
      heading: "How to use",
      s1Title: "",
      author: "",
    });
    expect(WIDGET_BY_KEY.buying_guide.defaults).toMatchObject({
      heading: "How to choose",
      l1Label: "",
      author: "",
    });
    expect(WIDGET_BY_KEY.care_panel.defaults).toMatchObject({
      heading: "Material & care",
      composition: "",
      open: false,
    });
    expect(WIDGET_BY_KEY.safety_note.defaults).toMatchObject({
      heading: "Patch test first",
      howToLabel: "How to patch test",
    });
    expect(WIDGET_BY_KEY.fit_note.defaults).toMatchObject({
      fit: "true",
      note: "",
      modelHeight: "",
    });
    expect(WIDGET_BY_KEY.authenticity_badge.defaults).toMatchObject({
      label: "Official product",
      verified: true,
      source: "",
    });
    expect(WIDGET_BY_KEY.sustain_badge.defaults).toMatchObject({
      heading: "",
      c1Label: "",
      c1Source: "",
    });
    expect(WIDGET_BY_KEY.discount_badge.defaults).toMatchObject({
      priceMinor: 80000,
      compareAtMinor: 100000,
    });
    expect(WIDGET_BY_KEY.batch_info.defaults).toMatchObject({
      heading: "Batch & expiry",
      mfgLabel: "Manufactured",
      paoMonths: 0,
    });
    expect(WIDGET_BY_KEY.delivery_promise.defaults).toMatchObject({
      heading: "Delivery",
      insideLabel: "Inside Dhaka",
      outsideDays: "2-4 working days",
    });
    expect(WIDGET_BY_KEY.free_shipping_bar.defaults).toMatchObject({
      freeShippingLabel: "Spend",
      freeShippingDone: "Free shipping unlocked.",
    });
    expect(WIDGET_BY_KEY.stock_delivery.defaults).toMatchObject({
      lowStockAt: 5,
      cutOff: "Order before 4pm for same-day dispatch",
    });
    expect(WIDGET_BY_KEY.rank_list.defaults).toMatchObject({
      heading: "Bestsellers",
      limit: 10,
    });
    expect(WIDGET_BY_KEY.seller_card.defaults).toMatchObject({
      linkLabel: "Visit store",
      rating: 0,
    });
    expect(WIDGET_BY_KEY.category_header.defaults).toMatchObject({
      heading: "All products",
      scrim: true,
      showBreadcrumb: true,
    });
    expect(WIDGET_BY_KEY.collection_story.defaults).toMatchObject({
      heading: "The story",
      scrim: true,
    });
    expect(WIDGET_BY_KEY.brand_rail.defaults).toMatchObject({
      heading: "Top brands",
      limit: 16,
    });
    expect(WIDGET_BY_KEY.concern_rail.defaults).toMatchObject({
      heading: "Shop by concern",
      terms: "acne,dark-spots,dryness",
      limit: 12,
    });
    expect(WIDGET_BY_KEY.back_in_stock.defaults).toMatchObject({
      heading: "Notify me when it's back",
      buttonLabel: "Notify me",
    });
    expect(WIDGET_BY_KEY.price_block.defaults).toMatchObject({
      showCompareAt: true,
      note: "",
    });
    expect(WIDGET_BY_KEY.price_sparkline.defaults).toMatchObject({
      heading: "Price history",
      emptyText: "No price history yet.",
      days: 90,
    });
    expect(WIDGET_BY_KEY.deal_card.defaults).toMatchObject({
      heading: "Deal of the day",
      badgeLabel: "Save",
      ctaLabel: "Shop now",
    });
    expect(WIDGET_BY_KEY.deal_strip.defaults).toMatchObject({
      heading: "Today's deals",
      limit: 8,
      cardVariant: "compact",
    });
    expect(WIDGET_BY_KEY.sponsored_slot.defaults).toMatchObject({
      heading: "Featured",
      limit: 4,
    });
    expect(WIDGET_BY_KEY.subbrand_spotlight.defaults).toMatchObject({
      heading: "Our Sub-Brands",
      b1Name: "TAAGA",
      b4Name: "AARONG EARTH",
    });
    expect(WIDGET_BY_KEY.size_guide.defaults).toMatchObject({
      heading: "Size guide",
      unit: "cm",
      c1Label: "Chest",
      r1Label: "S",
    });
    expect(WIDGET_BY_KEY.routine_builder.defaults).toMatchObject({
      heading: "Build your routine",
      amLabel: "Morning",
      pmLabel: "Night",
      limit: 4,
    });
    expect(WIDGET_BY_KEY.sample_picker.defaults).toMatchObject({
      heading: "Pick a free sample",
      thresholdText: "Free sample over",
      limit: 4,
    });
    expect(WIDGET_BY_KEY.shade_finder.defaults).toMatchObject({
      heading: "Find your shade",
      undertonePrompt: "What is your undertone?",
      handle: "",
    });
    expect(WIDGET_BY_KEY.skin_quiz.defaults).toMatchObject({
      heading: "Skin quiz",
      typePrompt: "Your skin type?",
      resultPath: "/search",
    });
    expect(WIDGET_BY_KEY.quiz.defaults).toMatchObject({
      heading: "Find your match",
      resultBase: "/",
      q1Multiple: false,
    });
    expect(WIDGET_BY_KEY.consult_cta.defaults).toMatchObject({
      heading: "Talk to a beauty advisor",
      whatsappLabel: "WhatsApp",
      buttonLabel: "Book a consult",
    });
    expect(WIDGET_BY_KEY.gift_builder.defaults).toMatchObject({
      heading: "Build a gift set",
      size: 3,
      limit: 8,
    });
    expect(WIDGET_BY_KEY.bundle_builder.defaults).toMatchObject({
      heading: "Build your bundle",
      limit: 4,
      buttonLabel: "Add bundle",
    });
    expect(WIDGET_BY_KEY.shoppable_image.defaults).toMatchObject({
      heading: "Shop the look",
      limit: 4,
      p1x: 25,
      p1y: 30,
    });
    expect(WIDGET_BY_KEY.compare_table.defaults).toMatchObject({
      caption: "Compare products",
      limit: 4,
      r1Label: "Price",
    });
    expect(WIDGET_BY_KEY.spec_table.defaults).toMatchObject({
      columnLabel: "This product",
      grouped: true,
    });
    expect(WIDGET_BY_KEY.spec_highlights.defaults).toMatchObject({
      heading: "At a glance",
      columns: 4,
      t1Label: "Chipset",
    });
    expect(WIDGET_BY_KEY.ingredient_glossary.defaults).toMatchObject({
      heading: "Ingredient glossary",
    });
    expect(WIDGET_BY_KEY.ingredient_list.defaults).toMatchObject({
      heading: "Key ingredients",
      inciLabel: "Full ingredients (INCI)",
    });
    expect(WIDGET_BY_KEY.ingredient_rail.defaults).toMatchObject({
      heading: "Shop by ingredient",
      i1Name: "Niacinamide",
      limit: 12,
    });
    expect(WIDGET_BY_KEY.payment_methods.defaults).toMatchObject({
      heading: "Payment method",
      emptyText: "No payment method is available right now.",
    });
    expect(WIDGET_BY_KEY.payment_icons.defaults).toMatchObject({
      heading: "We accept",
    });
    expect(WIDGET_BY_KEY.emi_calculator.defaults).toMatchObject({
      heading: "EMI plans",
      perMonthLabel: "per month",
    });
    expect(WIDGET_BY_KEY.order_tracker.defaults).toMatchObject({
      heading: "Order status",
      step1: "Placed",
      step4: "Delivered",
    });
    expect(WIDGET_BY_KEY.product_grid.defaults).toMatchObject({
      heading: "Products",
      limit: 12,
      columns: 4,
      cardVariant: "standard",
      density: "comfortable",
      showRating: false,
      promise: "",
    });
    expect(WIDGET_BY_KEY.product_rail.defaults).toMatchObject({
      heading: "Trending now",
      limit: 12,
      source: "collection",
      cardVariant: "compact",
    });
    expect(WIDGET_BY_KEY.product_media.defaults).toMatchObject({
      ratio: "1/1",
      showThumbnails: true,
      zoom: true,
      altText: "",
    });
    expect(WIDGET_BY_KEY.product_meta.defaults).toMatchObject({
      heading: "Product details",
    });
    expect(WIDGET_BY_KEY.product_qna.defaults).toMatchObject({
      heading: "Questions and answers",
      askLabel: "Ask a question",
      q1: "",
      a1: "",
    });
    expect(WIDGET_BY_KEY.product_qna.defaults.items).toEqual([]);
    expect(WIDGET_BY_KEY.collection_grid.defaults).toMatchObject({
      heading: "Collections",
      limit: 8,
      columns: 4,
      showCount: true,
    });
    expect(WIDGET_BY_KEY.account_cart.defaults).toMatchObject({
      accountLabel: "Account",
      cartLabel: "Cart",
      showCount: true,
    });
    expect(WIDGET_BY_KEY.cart_drawer.defaults).toMatchObject({
      heading: "Your cart",
      triggerLabel: "Cart",
      ctaLabel: "Checkout",
      showCoupon: false,
    });
    expect(WIDGET_BY_KEY.cart_lines.defaults).toMatchObject({
      heading: "Your items",
      removeLabel: "Remove",
      emptyText: "Your cart is empty.",
    });
    expect(WIDGET_BY_KEY.cart_summary.defaults).toMatchObject({
      heading: "Order summary",
      totalLabel: "Total",
      ctaLabel: "Checkout",
      showCoupon: true,
    });
    expect(WIDGET_BY_KEY.checkout_steps.defaults).toMatchObject({
      heading: "Checkout progress",
      step1: "Cart",
      activeStep: 1,
    });
    expect(WIDGET_BY_KEY.search_command.defaults).toMatchObject({
      placeholder: "Search products",
      buttonLabel: "Search",
      limit: 6,
    });
    expect(WIDGET_BY_KEY.facet_sidebar.defaults).toMatchObject({
      heading: "Filters",
      limit: 24,
      clearLabel: "Clear all",
    });
    expect(WIDGET_BY_KEY.pagination.defaults).toMatchObject({
      mode: "numbered",
      moreLabel: "Load more",
      prevLabel: "Previous",
      nextLabel: "Next",
    });
    expect(WIDGET_BY_KEY.result_toolbar.defaults).toMatchObject({
      countLabel: "products",
      showSort: true,
      sortLabel: "Sort",
    });
    expect(WIDGET_BY_KEY.blog_archive.defaults).toMatchObject({
      layout: "grid",
      columns: 3,
      limit: 9,
      emptyText: "No articles yet.",
    });
    expect(WIDGET_BY_KEY.blog_pager.defaults).toMatchObject({
      align: "center",
    });
    expect(WIDGET_BY_KEY.blog_terms.defaults).toMatchObject({
      style: "pills",
      showCounts: true,
    });
    expect(WIDGET_BY_KEY.review_list.defaults).toMatchObject({
      heading: "Reviews",
      limit: 6,
      sort: "recent",
      emptyText: "No reviews yet.",
    });
    expect(WIDGET_BY_KEY.rating_summary.defaults).toMatchObject({
      heading: "Customer ratings",
      showHistogram: true,
      verifiedOnly: false,
    });
    expect(WIDGET_BY_KEY.recently_viewed.defaults).toMatchObject({
      heading: "Recently viewed",
      limit: 6,
      showClear: true,
    });
    expect(WIDGET_BY_KEY.wishlist_button.defaults).toMatchObject({
      addLabel: "Save",
      savedLabel: "Saved",
      showCount: false,
    });
    expect(WIDGET_BY_KEY.compare_tray.defaults).toMatchObject({
      heading: "Compare",
      compareLabel: "Compare now",
      compareHref: "/compare",
      limit: 8,
    });
    expect(WIDGET_BY_KEY.bundle_offer.defaults).toMatchObject({
      heading: "Build your bundle",
      buttonLabel: "Calculate total",
      i1Label: "",
      i1VariantId: "",
    });
    expect(WIDGET_BY_KEY.add_to_cart.defaults).toMatchObject({ label: "Add to cart", showQuantity: true });
    expect(WIDGET_BY_KEY.rewards_club.defaults).toMatchObject({ heading: "My Rewards", tier1Name: "Silver", tier2Points: "5,000+ points", buttonHref: "/pages/rewards" });
    expect(WIDGET_BY_KEY.wedding_shop.defaults).toMatchObject({ heading: "The Wedding Shop", c1Name: "Bridal Sarees", c1Href: "/c/bridal", buttonHref: "/c/wedding" });
    expect(WIDGET_BY_KEY.gift_finder.defaults).toMatchObject({ heading: "Find the perfect gift", o1Label: "For Her", o1Query: "saree", buttonHref: "/search" });
    expect(WIDGET_BY_KEY.rich_text.defaults).toMatchObject({ heading: "", body: "Tell customers about your store." });
    expect(WIDGET_BY_KEY.form.defaults).toMatchObject({ heading: "Send us a message", buttonLabel: "Send", showPhone: true });
    expect(WIDGET_BY_KEY.nav_menu.defaults).toMatchObject({ heading: "", layout: "row", align: "left" });
    expect(WIDGET_BY_KEY.newsletter.defaults).toMatchObject({ heading: "Stay in touch", buttonLabel: "Subscribe", consentText: "" });
    expect(WIDGET_BY_KEY.sticky_bar.defaults).toMatchObject({ text: "Free delivery over BDT 2,000", ctaLabel: "", position: "bottom" });
    expect(WIDGET_BY_KEY.mega_menu.defaults).toMatchObject({ label: "Shop", limit: 8, columns: 4 });
    expect(WIDGET_BY_KEY.buy_box.defaults).toMatchObject({ handle: "", label: "Add to cart", showQuantity: true, showCompareAt: true });
    expect(WIDGET_BY_KEY.variant_picker.defaults).toMatchObject({ heading: "Choose an option", mode: "chip", handle: "" });
    expect(WIDGET_BY_KEY.sticky_buy_bar.defaults).toMatchObject({ label: "Add to cart", showPrice: true, dockAfter: 320 });
    expect(WIDGET_BY_KEY.filter_chips.defaults).toMatchObject({ clearLabel: "Clear all", emptyText: "", showWhenEmpty: false });
    expect(WIDGET_BY_KEY.size_selector.defaults).toMatchObject({ heading: "Size", notifyLabel: "Notify me", guideLabel: "Size guide" });
    expect(WIDGET_BY_KEY.complete_the_look.defaults).toMatchObject({ heading: "Complete the look", limit: 4, buttonLabel: "Add all" });
    expect(WIDGET_BY_KEY.circle_categories.defaults).toMatchObject({ heading: "Shop by Category", c1Title: "Women's Sarees", c1Href: "/collections/womens" });
    expect(WIDGET_BY_KEY.store_locator.defaults).toMatchObject({ heading: "Visit us", s1Name: "", s3Phone: "" });
    expect(WIDGET_BY_KEY.ugc_gallery.defaults).toMatchObject({ heading: "As worn by you", limit: 6, note: "" });
    expect(WIDGET_BY_KEY.trade_in.defaults).toMatchObject({ heading: "Trade in your old device", buttonLabel: "Get a quote", consentText: "" });
    expect(WIDGET_BY_KEY.combo_card.defaults).toMatchObject({ heading: "Combo pack", buttonLabel: "Add combo to cart", limit: 3 });
    expect(WIDGET_BY_KEY.loyalty_strip.defaults).toMatchObject({ label: "Points on this order", handle: "" });
    expect(WIDGET_BY_KEY.warranty_panel.defaults).toMatchObject({ heading: "Warranty", months: 12, official: true });
    expect(WIDGET_BY_KEY.before_after.defaults).toMatchObject({ heading: "Real results", beforeLabel: "Before", disclaimer: "Individual results vary. Images are unretouched." });
    expect(WIDGET_BY_KEY.refill_widget.defaults).toMatchObject({ heading: "Refill & save", c1Value: "30", buttonLabel: "Subscribe" });
    expect(WIDGET_BY_KEY.quick_view.defaults).toMatchObject({ heading: "Quick view", buttonLabel: "Quick view", limit: 6 });
    expect(WIDGET_BY_KEY.department_strip.defaults).toMatchObject({ heading: "", limit: 12 });
    expect(WIDGET_BY_KEY.columns.defaults).toMatchObject({ columns: 2, gap: 24, maxW: "container" });
  });
});
