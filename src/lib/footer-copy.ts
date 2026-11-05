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
  heading: "",
  heading_bn: "",
  body: "",
  body_bn: "",
} as const;

export const NEWSLETTER = {
  heading: "Stay connected",
  heading_bn: "যুক্ত থাকুন",
  body: "Subscribe to receive updates directly to your inbox.",
  body_bn: "সরাসরি আপনার ইনবক্সে আপডেট পেতে সাবস্ক্রাইব করুন।",
  buttonLabel: "Subscribe",
  buttonLabel_bn: "সাবস্ক্রাইব করুন",
  consentText: "Unsubscribe anytime.",
  consentText_bn: "যেকোনো সময় আনসাবস্ক্রাইব করুন।",
} as const;

export const PAYMENT_MARKS = "";

/**
 * The বাংলা leg of the payment-marks line. Configurable per merchant.
 */
export const PAYMENT_MARKS_BN = "";

export const COLOPHON = {
  body: "",
  body_bn: "",
} as const;
