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
  body: "Songoskriti keeps Tangail, Jamdani and Nakshi Kantha weaving alive through fair artisan partnerships.",
  body_bn:
    "ন্যায্য তাঁতি অংশীদারিত্বে টাঙ্গাইল, জামদানি ও নকশি কাঁথার বুনন বাঁচিয়ে রাখে সংস্কৃতি।",
} as const;

export const NEWSLETTER = {
  heading: "First to the festive drops",
  heading_bn: "উৎসবের ড্রপ সবার আগে",
  body: "One letter per drop. Weaves, restocks and artisan stories — never spam.",
  body_bn:
    "প্রতি ড্রপে একটি চিঠি। বুনন, রিস্টক ও তাঁতিদের গল্প — কোনো স্প্যাম নয়।",
  buttonLabel: "Join the list",
  buttonLabel_bn: "তালিকায় যোগ দিন",
  consentText: "We email only for festive drops. Unsubscribe anytime.",
  consentText_bn:
    "শুধু উৎসবের ড্রপের জন্য ইমেইল পাঠাই। যেকোনো সময় আনসাবস্ক্রাইব করুন।",
} as const;

export const PAYMENT_MARKS =
  "bKash, Nagad, Rocket, Visa, Mastercard, Cash on Delivery";

export const COLOPHON = {
  body: "Flagships: Uttara · Gulshan · Chattogram — open 10am to 9pm.",
  body_bn: "ফ্ল্যাগশিপ: উত্তরা · গুলশান · চট্টগ্রাম — সকাল ১০টা থেকে রাত ৯টা।",
} as const;
