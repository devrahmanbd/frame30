/**
 * Shared footer fallback copy — single source of truth.
 *
 * The Songoskriti theme builder (`themes/songoskriti/footer.ts`), the theme
 * widget renderers (`components/builder/songoskriti.tsx`), and the generic
 * storefront fallback (`StoreFooterMenus`) read these same constants so
 * theme and fallback copy can never drift apart.
 *
 * Lives outside `themes/` on purpose: the shared widget layer is forbidden
 * from importing theme-specific modules (see `widget-registry.test.ts` →
 * "imports no theme-specific module"), so shared copy lives here.
 *
 * Data only: no React, no network. Bilingual EN/BN ships inline via
 * explicit `_bn` props so no dictionary entry is required.
 */
export const STATEMENT = {
  heading: "Woven in Bangladesh, worn everywhere",
  heading_bn: "বাংলাদেশে বোনা, পরা হয় সর্বত্র",
  body: "Keeping traditional handloom and artisanal craft alive through authentic heritage textiles.",
  body_bn:
    "ঐতিহ্যবাহী তাঁত ও টেক্সটাইল কারুশিল্পের সংরক্ষণ।",
} as const;

export const NEWSLETTER = {
  heading: "First to the festive drops",
  heading_bn: "উৎসবের ড্রপ সবার আগে",
  body: "Seasonal collections, authentic weaves, and festive arrivals.",
  body_bn:
    "মৌসুমি কালেকশন, আসল বুনন ও উৎসবের নতুন পোশাক।",
  buttonLabel: "Join the list",
  buttonLabel_bn: "তালিকায় যোগ দিন",
  consentText: "We email only for festive drops. Unsubscribe anytime.",
  consentText_bn:
    "শুধু উৎসবের ড্রপের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
} as const;

export const PAYMENT_MARKS = "Cash on Delivery";

/**
 * The বাংলা leg of the payment-marks line. Theme-authored only: the theme's
 * `footer_sitemap` carries it as `paymentsMarks_bn` (the EN side above stays
 * the shared constant the generic storefront fallback reads).
 */
export const PAYMENT_MARKS_BN = "ক্যাশ অন ডেলিভারি";

export const COLOPHON = {
  body: "Support & customer care.",
  body_bn: "সহায়তা ও গ্রাহক সেবা।",
} as const;
