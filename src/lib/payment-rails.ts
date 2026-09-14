/**
 * Bangladesh payment rails — the checkout-facing catalogue (pure, no I/O).
 *
 * Bangladesh does not have "a payment gateway"; it has three distinct layers
 * a merchant picks from, and conflating them is how storefronts end up
 * offering bKash and nothing else:
 *
 *  1. **MFS wallets** — bKash, Nagad, Rocket, Upay, Tap, mCash, SureCash.
 *     Contracted one-by-one with the provider, each with its own credentials,
 *     settlement cadence and refund behaviour.
 *  2. **Bank wallets / direct rails** — Cellfin, BEFTN/RTGS transfer, card
 *     acquiring. Slower to onboard, cheaper per transaction.
 *  3. **Aggregators** — SSLCommerz, aamarPay, ShurjoPay, PortWallet. One
 *     contract fronts cards, internet banking and every wallet at once; the
 *     shopper picks the instrument on the aggregator's hosted page, so the
 *     storefront must render these as a single choice, not as a wallet.
 *
 * `payment_method` in the database is the authority for what may be stored;
 * this module is the authority for how each one *behaves* and what it is
 * called in Bangla. Anything money-shaped stays in minor units elsewhere —
 * there are no amounts here on purpose.
 */

export type MethodLayer = "cod" | "mfs" | "bank" | "card" | "aggregator";

export const PAYMENT_METHOD_KEYS = [
  "cod",
  // MFS wallets
  "bkash",
  "nagad",
  "rocket",
  "upay",
  "tap",
  "mcash",
  "surecash",
  // Bank wallet and direct rails
  "cellfin",
  "bank_transfer",
  "card",
  // Aggregators
  "sslcommerz",
  "aamarpay",
  "shurjopay",
  "portwallet",
  // Community plugins — unofficial, self-hosted, as-is (see payment-plugins.ts).
  "piprapay",
] as const;


export type PaymentMethodKey = (typeof PAYMENT_METHOD_KEYS)[number];

export type PaymentMethodSpec = {
  key: PaymentMethodKey;
  layer: MethodLayer;
  label: string;
  labelBn: string;
  /** Operator, so support can tell a merchant who to call when a rail stalls. */
  operator: string;
  /** Business days from capture to money in the merchant's settlement account. */
  settlementDays: number;
  /** Whether the rail can reverse a capture programmatically. */
  supportsRefund: boolean;
  /**
   * Whether a shopper is bounced to a hosted page. Aggregators and cards
   * always are; wallets are when the merchant uses the provider's checkout.
   */
  hostedRedirect: boolean;
  /** Instruments an aggregator fronts — empty for a single-instrument rail. */
  covers: MethodLayer[];
  /** The `provider_credentials.provider_key` this method charges through. */
  credentialKey: string | null;
  /**
   * `community` marks an unofficial contributed plugin: as-is, supported by the
   * gateway's own maintainers, and labelled "Unofficial" wherever it is shown.
   */
  support?: "community";
};


const spec = (s: PaymentMethodSpec) => s;

export const PAYMENT_METHOD_CATALOG: Record<PaymentMethodKey, PaymentMethodSpec> = {
  cod: spec({
    key: "cod",
    layer: "cod",
    label: "Cash on delivery",
    labelBn: "ক্যাশ অন ডেলিভারি",
    operator: "Courier",
    settlementDays: 7,
    supportsRefund: false,
    hostedRedirect: false,
    covers: [],
    credentialKey: null,
  }),
  bkash: spec({
    key: "bkash",
    layer: "mfs",
    label: "bKash",
    labelBn: "বিকাশ",
    operator: "bKash Limited",
    settlementDays: 2,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "bkash",
  }),
  nagad: spec({
    key: "nagad",
    layer: "mfs",
    label: "Nagad",
    labelBn: "নগদ",
    operator: "Nagad (Bangladesh Post Office)",
    settlementDays: 2,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "nagad",
  }),
  rocket: spec({
    key: "rocket",
    layer: "mfs",
    label: "Rocket",
    labelBn: "রকেট",
    operator: "Dutch-Bangla Bank",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "rocket",
  }),
  upay: spec({
    key: "upay",
    layer: "mfs",
    label: "Upay",
    labelBn: "উপায়",
    operator: "UCB Fintech",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "upay",
  }),
  tap: spec({
    key: "tap",
    layer: "mfs",
    label: "Tap",
    labelBn: "ট্যাপ",
    operator: "Trust Axiata Digital",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "tap",
  }),
  mcash: spec({
    key: "mcash",
    layer: "mfs",
    label: "mCash",
    labelBn: "এমক্যাশ",
    operator: "Islami Bank Bangladesh",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "mcash",
  }),
  surecash: spec({
    key: "surecash",
    layer: "mfs",
    label: "SureCash",
    labelBn: "শিওরক্যাশ",
    operator: "SureCash (Progoti Systems)",
    settlementDays: 4,
    supportsRefund: false,
    hostedRedirect: true,
    covers: [],
    credentialKey: "surecash",
  }),
  cellfin: spec({
    key: "cellfin",
    layer: "bank",
    label: "CellFin",
    labelBn: "সেলফিন",
    operator: "Islami Bank Bangladesh",
    settlementDays: 2,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "cellfin",
  }),
  bank_transfer: spec({
    key: "bank_transfer",
    layer: "bank",
    label: "Bank transfer (BEFTN / RTGS)",
    labelBn: "ব্যাংক ট্রান্সফার",
    operator: "Bangladesh Bank clearing",
    settlementDays: 1,
    supportsRefund: false,
    hostedRedirect: false,
    covers: [],
    credentialKey: "bank_transfer",
  }),
  card: spec({
    key: "card",
    layer: "card",
    label: "Card (Visa / Mastercard / Amex)",
    labelBn: "কার্ড",
    operator: "Acquiring PSO/PSP",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: [],
    credentialKey: "card_acquiring",
  }),
  sslcommerz: spec({
    key: "sslcommerz",
    layer: "aggregator",
    label: "SSLCOMMERZ",
    labelBn: "এসএসএলকমার্জ",
    operator: "SSL Wireless",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: ["card", "mfs", "bank"],
    credentialKey: "sslcommerz",
  }),
  aamarpay: spec({
    key: "aamarpay",
    layer: "aggregator",
    label: "aamarPay",
    labelBn: "আমারপে",
    operator: "Software Shop Limited",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: ["card", "mfs", "bank"],
    credentialKey: "aamarpay",
  }),
  shurjopay: spec({
    key: "shurjopay",
    layer: "aggregator",
    label: "ShurjoPay",
    labelBn: "সূর্যপে",
    operator: "shurjoMukhi",
    settlementDays: 3,
    supportsRefund: true,
    hostedRedirect: true,
    covers: ["card", "mfs", "bank"],
    credentialKey: "shurjopay",
  }),
  portwallet: spec({
    key: "portwallet",
    layer: "aggregator",
    label: "PortWallet",
    labelBn: "পোর্টওয়ালেট",
    operator: "PortWallet (EBL partner)",
    settlementDays: 4,
    supportsRefund: true,
    hostedRedirect: true,
    covers: ["card", "mfs", "bank"],
    credentialKey: "portwallet",
  }),
  // ---------------------------------------------------------------- community
  // Unofficial, contributed, self-hosted by the merchant. Framique neither
  // operates nor supports the gateway; the money path treats it with exactly the
  // same suspicion as a contracted rail (authenticated callback, server-side
  // verification, paisa-exact amount match).
  piprapay: spec({
    key: "piprapay",
    layer: "aggregator",
    label: "PipraPay (community)",
    labelBn: "পিপরাপে (কমিউনিটি)",
    operator: "PipraPay — self-hosted by the merchant",
    settlementDays: 0,
    supportsRefund: false,
    hostedRedirect: true,
    covers: ["mfs", "bank", "card"],
    credentialKey: "piprapay",
    support: "community",
  }),
};

/** Unofficial contributed rails, so the UI can label them without guessing. */
export const COMMUNITY_METHOD_KEYS = PAYMENT_METHOD_KEYS.filter(
  (k) => PAYMENT_METHOD_CATALOG[k].support === "community",
);

export function isCommunityMethod(key: string) {
  return (COMMUNITY_METHOD_KEYS as readonly string[]).includes(key);
}


export function isPaymentMethodKey(value: string): value is PaymentMethodKey {
  return (PAYMENT_METHOD_KEYS as readonly string[]).includes(value);
}

/** Every method that moves money online — i.e. everything except COD. */
export const ONLINE_METHOD_KEYS = PAYMENT_METHOD_KEYS.filter((k) => k !== "cod");

export function methodLabel(key: PaymentMethodKey, lang: "en" | "bn") {
  const s = PAYMENT_METHOD_CATALOG[key];
  return lang === "bn" ? s.labelBn : s.label;
}

export type MethodAvailability = {
  /** Merchant toggle for cash on delivery. */
  codEnabled: boolean;
  /** Merchant toggle for online rails as a whole. */
  onlineEnabled: boolean;
  /**
   * Methods the merchant has actually contracted (a live credential row).
   * An empty list means "no online rail configured", not "all of them".
   */
  configured: readonly string[];
};

/**
 * What the storefront may render. A rail the merchant has not contracted is
 * never offered — showing it would take an order the merchant cannot capture.
 */
export function availableMethods(av: MethodAvailability): PaymentMethodKey[] {
  const out: PaymentMethodKey[] = [];
  if (av.codEnabled) out.push("cod");
  if (!av.onlineEnabled) return out;
  for (const key of ONLINE_METHOD_KEYS) {
    if (av.configured.includes(key)) out.push(key);
  }
  return out;
}

/** Fails closed: an unknown or uncontracted method is never chargeable. */
export function assertMethodAllowed(method: string, av: MethodAvailability) {
  if (!isPaymentMethodKey(method)) return { ok: false as const, reason: "payment.unsupported_provider" };
  if (!availableMethods(av).includes(method)) {
    return { ok: false as const, reason: method === "cod" ? "payment.cod_unavailable" : "payment.rail_unavailable" };
  }
  return { ok: true as const, reason: null };
}

/** Grouped for the storefront radio list, aggregators last (they are a fallback). */
export const METHOD_GROUP_ORDER: MethodLayer[] = ["cod", "mfs", "bank", "card", "aggregator"];

export function groupMethods(keys: PaymentMethodKey[]) {
  return METHOD_GROUP_ORDER.map((layer) => ({
    layer,
    methods: keys.filter((k) => PAYMENT_METHOD_CATALOG[k].layer === layer),
  })).filter((g) => g.methods.length > 0);
}

/**
 * `provider_credentials.provider_key` mostly matches the checkout method key;
 * card acquiring is the one place they diverge (the credential is contracted
 * with an acquirer, the shopper just sees "Card").
 */
export function credentialKeyToMethod(providerKey: string): string {
  return providerKey === "card_acquiring" ? "card" : providerKey;
}
