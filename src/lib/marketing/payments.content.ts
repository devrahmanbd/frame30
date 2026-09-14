/**
 * `/payments` — copy contract (docs/05-marketing/copy/05-payments.md).
 *
 * Pure data module: no React, no JSX, no I/O. The route imports these typed
 * records and renders them through the shared band kit. Every Bangla string
 * here is copied verbatim from the deck's "Bangla variant" blocks; a band
 * with no Bangla variant in the deck simply has no `Bn` field, rather than a
 * machine-translated stand-in.
 *
 * The four-rail and rail-comparison bands deliberately do NOT retype rail
 * names, settlement days or refund support — those facts live once in
 * `src/lib/payment-rails.ts` (the same registry checkout and the admin rely
 * on) and this module only adds the marketing prose around them. If a rail's
 * settlement window changes in the registry, this page updates itself.
 */
import { PAYMENT_METHOD_CATALOG, type PaymentMethodKey } from "@/lib/payment-rails";

export type Bilingual = { en: string; bn?: string };

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

export const HERO = {
  eyebrow: { en: "Four rails · one ledger", bn: "চারটি রেল · একটি লেজার" },
  title: { en: "bKash, Nagad, card, COD — reconciled.", bn: "বিকাশ, নগদ, কার্ড, সিওডি — মিলিয়ে দেখা যায়।" },
  sub: {
    en: "Every taka settles against an order. Refunds, courier collections and payouts write to the same ledger, so nothing depends on a spreadsheet at month end.",
    bn: "প্রতিটি টাকা একটি অর্ডারের সাথে মিলে যায়। রিফান্ড, কুরিয়ার কালেকশন আর পেআউট একই লেজারে লেখা হয়।",
  },
  primaryCta: { en: "See the rails", bn: "রেলগুলো দেখুন" },
  altCta: { en: "Read the settlement docs", bn: "সেটেলমেন্ট ডকুমেন্ট দেখুন" },
} satisfies Record<string, Bilingual>;

/** Rail keys shown as small glass pills under the hero sub — names only, no brand logos. */
export const HERO_RAIL_PILLS: PaymentMethodKey[] = ["bkash", "nagad", "rocket", "upay", "card", "cod"];

/* -------------------------------------------------------------------------- */
/* Band 2 — the four rails (card grid)                                       */
/* -------------------------------------------------------------------------- */

export type RailCard = {
  id: string;
  /** Rail keys from the registry this card represents (one card can cover several MFS wallets). */
  methodKeys: PaymentMethodKey[];
  headline: Bilingual;
  detail: Bilingual;
};

export const FOUR_RAILS: RailCard[] = [
  {
    id: "mfs",
    methodKeys: ["bkash", "nagad", "rocket", "upay"],
    headline: { en: "The default for most baskets." },
    detail: {
      en: "Hosted or in-app checkout, webhook-confirmed, refund-to-wallet supported.",
    },
  },
  {
    id: "card",
    methodKeys: ["card"],
    headline: { en: "Runs on your existing merchant account." },
    detail: { en: "3-D Secure, chargeback events post to the order timeline." },
  },
  {
    id: "bank",
    methodKeys: ["bank_transfer"],
    headline: { en: "The rail procurement teams ask for." },
    detail: {
      en: "Redirect or manual reference match; settlement is bank-cleared, not instant.",
    },
  },
  {
    id: "cod",
    methodKeys: ["cod"],
    headline: { en: "Treated as a real method, not an exception." },
    detail: {
      en: "Fraud scored pre-booking, courier-collected, remittance reconciled.",
    },
  },
];

/** Comma-joined labels for a card's rails, read straight from the registry. */
export function railCardLabel(card: RailCard, lang: "en" | "bn"): string {
  return card.methodKeys
    .map((key) => (lang === "bn" ? PAYMENT_METHOD_CATALOG[key].labelBn : PAYMENT_METHOD_CATALOG[key].label))
    .join(", ");
}

/* -------------------------------------------------------------------------- */
/* Band 3 — rail comparison table                                            */
/* -------------------------------------------------------------------------- */

export type RailComparisonRow = {
  id: string;
  methodKeys: PaymentMethodKey[];
  settlementTiming: string;
  failureModes: string;
  refundPath: string;
  reconciliationDifficulty: string;
  bestFitBasket: string;
};

export const RAIL_COMPARISON: RailComparisonRow[] = [
  {
    id: "mfs",
    methodKeys: ["bkash", "nagad", "rocket", "upay"],
    settlementTiming: "Near-real-time confirmation; payout per your MFS cycle (commonly T+1 to T+3 — confirm with your provider)",
    failureModes: "PIN timeout, app-switch drop, insufficient balance, duplicate submission on slow networks",
    refundPath: "Refund-to-wallet via the same rail, usually 1–3 business days",
    reconciliationDifficulty: "Low — webhook gives a hard match to transaction ID",
    bestFitBasket: "Low to mid ticket, high frequency",
  },
  {
    id: "card",
    methodKeys: ["card"],
    settlementTiming: "Authorised instantly; settlement per your acquirer's cycle (commonly T+1 to T+5)",
    failureModes: "3-D Secure abandonment, issuer decline, expired card, OTP timeout",
    refundPath: "Refund to card, 5–14 business days depending on issuer",
    reconciliationDifficulty: "Medium — needs processor reference reconciled against gateway callback",
    bestFitBasket: "Mid to high ticket",
  },
  {
    id: "bank",
    methodKeys: ["bank_transfer"],
    settlementTiming: "Bank-cleared, typically same-day to T+2 depending on bank cutoff",
    failureModes: "Wrong reference number, delayed batch clearing, redirect drop-off",
    refundPath: "Manual bank transfer back, days not minutes",
    reconciliationDifficulty: "High — often needs a human to match a bank statement line to an order",
    bestFitBasket: "High ticket, B2B, wholesale",
  },
  {
    id: "cod",
    methodKeys: ["cod"],
    settlementTiming: "Cash collected on delivery; remitted by courier per their cycle (commonly weekly or twice-weekly)",
    failureModes: "Customer refusal at door, unreachable address, wrong address, partial acceptance",
    refundPath: "Non-event on accepted orders; on refusal, order reverts to unpaid/returned",
    reconciliationDifficulty: "High — depends entirely on courier remittance reports matching your order set",
    bestFitBasket: "Low to mid ticket, price-sensitive segments",
  },
];

export const RAIL_COMPARISON_NOTE: Bilingual = {
  en: "Numbers are typical ranges reported by merchants and PSPs operating in Bangladesh — confirm exact settlement cycles and MDR with your bKash/Nagad merchant agreement and your card acquirer, since terms vary by account tier.",
};

export const RAIL_DECISION_FRAMEWORK: Bilingual = {
 en: "If your average order value is under roughly BDT 1,000 and your audience is mobile-first, lead with MFS and keep COD as the fallback. Above roughly BDT 10,000 or with institutional buyers, expect bank transfer to carry a disproportionate share of revenue — build reconciliation around its slower, human-matched settlement rather than assuming it behaves like MFS. If COD exceeds roughly 40–50% of order volume, the risk playbook below is not optional.",
};

/* -------------------------------------------------------------------------- */
/* Band 4 — the reconciliation engine (ZRow, text-left)                      */
/* -------------------------------------------------------------------------- */

export const RECONCILIATION = {
  eyebrow: { en: "The reconciliation engine", bn: "রিকনসিলিয়েশন ইঞ্জিন — প্রতিটি টাকা একটি অর্ডারের সাথে মিলে যায়" },
  title: { en: "Reconciliation is the actual product here." },
  body: {
    en: "Not the checkout button. Every payment event writes an immutable row keyed to a rail transaction reference and an order ID — nothing is inferred from a total.",
  },
  bullets: [
    { en: "Idempotency keys prevent double-counting — a retried webhook is recognised and discarded, never credited twice." },
    { en: "Webhook retries are handled on both sides: the rail retries per its own backoff, and Framique's queue also polls the gateway's status API as a fallback." },
    { en: "Unmatched-taka queue: any settlement that cannot be matched automatically lands in a visible, owned, aged queue with the raw evidence attached." },
  ],
  proof: { en: "Exception queue with an owner and an age." },
  worked: {
    en: "A merchant processes 800 orders in a week — 500 bKash, 150 card, 50 bank transfer, 100 COD. In a spreadsheet process, the 50 bank transfers eat the most finance time (about 2.5 hours a week at 3 minutes per match) for 6% of order volume. Framique auto-matches the clean references and routes only the genuinely ambiguous ones to the unmatched-taka queue — cutting the manual load to roughly 15 minutes a week.",
  },
  flow: [
    { en: "Rail webhook" },
    { en: "Idempotency check" },
    { en: "Order match" },
    { en: "Ledger row" },
    { en: "Exception queue (if unmatched)" },
  ],
} satisfies Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Band 5 — refunds and partial refunds (ZRow, text-right)                  */
/* -------------------------------------------------------------------------- */

export const REFUNDS = {
  title: { en: "One refund, four consistent records." },
  body: {
    en: "A refund updates the order status, the payment record, the ledger and the customer's order timeline in one transaction — a refund that updates the ledger but not the order is exactly how merchants end up with support tickets that contradict their own accounting.",
  },
  bullets: [
    { en: "Full refunds reverse the original payment via the same rail where it supports reversal; where it doesn't, Framique tracks it as a manual-payout obligation until settled." },
    { en: "Partial refunds apply against the specific order line, so product-level margin and return-rate reporting stays accurate down to the SKU." },
 { en: "A partial refund on a BDT 3,500 order for one BDT 800 line item reduces recognised revenue to BDT 2,700 and flags only that SKU in returns analytics." },
  ],
  proof: { en: "One transaction, four consistent records." },
} satisfies Record<string, unknown>;

export const REFUND_SLA_ROWS: { id: string; methodKeys: PaymentMethodKey[]; typicalTime: string }[] = [
  { id: "mfs", methodKeys: ["bkash", "nagad", "rocket", "upay"], typicalTime: "1–3 business days" },
  { id: "card", methodKeys: ["card"], typicalTime: "5–14 business days (issuer-dependent)" },
  { id: "bank", methodKeys: ["bank_transfer"], typicalTime: "Manual, days" },
  { id: "cod", methodKeys: ["cod"], typicalTime: "N/A — unpaid orders simply revert" },
];

/* -------------------------------------------------------------------------- */
/* Band 6 — fraud scoring before courier booking (ZRow, text-left)          */
/* -------------------------------------------------------------------------- */

export const FRAUD_SCORING = {
  title: { en: "Scored before the courier is booked." },
  body: {
    en: "The costliest fraud event in Bangladeshi e-commerce isn't a stolen card — it's a COD order that ties up a courier slot, packaging and staff time, then gets refused. Framique scores every order for risk before booking, so a bad order costs a review-queue click, not a wasted delivery attempt.",
  },
  bullets: [
    { en: "Start at the default threshold and let two to four weeks of real order volume pass through untouched." },
    { en: "If false positives exceed roughly 20% of flagged orders, loosen the weakest-signal contributors first — usually basket anomaly." },
    { en: "If fraud is still reaching courier booking, tighten velocity and address-quality weights before adding new signals." },
    { en: "Re-check quarterly — fraud patterns shift with seasonal demand (Eid, Pohela Boishakh peaks)." },
  ],
  proof: { en: "Review queue instead of a lost parcel." },
} satisfies Record<string, unknown>;

export const FRAUD_SIGNALS: { id: string; label: Bilingual; active: boolean }[] = [
  { id: "velocity", label: { en: "Velocity — orders from one phone, device or address in a rolling window" }, active: true },
  { id: "blacklist", label: { en: "Blacklist match — your own repeat-refuser list or an opted-in shared list" }, active: true },
  { id: "address", label: { en: "Address quality — deliverable and specific, not vague or incomplete" }, active: true },
  { id: "basket", label: { en: "Basket anomaly — value or item mix well outside the usual pattern" }, active: false },
  { id: "device", label: { en: "Device / network signal — known VPN, datacenter IP, device reuse" }, active: true },
  { id: "honeypot", label: { en: "Honeypot fields — hidden fields a bot fills and a human never does" }, active: false },
  { id: "channel", label: { en: "Channel signal — unusually rapid, scripted-looking checkout completion" }, active: false },
];

/* -------------------------------------------------------------------------- */
/* Band 7 — COD risk management playbook (card grid + worked table)         */
/* -------------------------------------------------------------------------- */

export const COD_PLAYBOOK_TITLE: Bilingual = {
  en: "COD risk management — five levers",
  bn: "সিওডি ঝুঁকি ব্যবস্থাপনা — পাঁচটি ধাপ",
};

export type PlaybookCard = { id: string; number: number; title: Bilingual; body: Bilingual };

export const COD_PLAYBOOK: PlaybookCard[] = [
  {
    id: "otp",
    number: 1,
    title: { en: "OTP confirmation before dispatch" },
    body: { en: "An SMS code confirmed by the customer before the order ships cuts fake and impulsive orders — a customer who won't confirm rarely intended to accept the parcel." },
  },
  {
    id: "address",
    number: 2,
    title: { en: "Address quality checks" },
    body: { en: "Structured fields (division, district, thana, landmark), cross-checked against your courier's serviceable-area list before confirmation." },
  },
  {
    id: "repeat",
    number: 3,
    title: { en: "Repeat-refuser lists" },
    body: { en: "Every refused delivery is logged against phone and address. Crossing a threshold routes that identity to prepayment-required, not an outright block." },
  },
  {
    id: "nudge",
    number: 4,
    title: { en: "Prepayment nudges" },
    body: { en: "A small discount or free-shipping incentive at checkout to switch COD selections to MFS, lowering refusal-exposed order share." },
  },
  {
    id: "advance",
    number: 5,
    title: { en: "Partial advance" },
    body: { en: "For higher-ticket COD orders, a small non-refundable advance via MFS before dispatch filters out low-intent orders." },
  },
];

export type WorkedRow = { id: string; metric: Bilingual; before: string; after: string };

export const COD_WORKED_EXAMPLE_TITLE: Bilingual = {
  en: "Worked example — return-rate impact on margin",
};

export const COD_WORKED_EXAMPLE_ROWS: WorkedRow[] = [
 { id: "gov", metric: { en: "Weekly COD order value" }, before: "BDT 50,000", after: "BDT 50,000" },
  { id: "refusal", metric: { en: "Refusal rate" }, before: "20%", after: "8%" },
 { id: "lost", metric: { en: "Value lost to refusals" }, before: "BDT 10,000", after: "BDT 4,000" },
  {
    id: "cost",
 metric: { en: "Direct wasted delivery cost (≈ BDT 120/attempt)" },
 before: "≈ BDT 4,800 (~40 refused orders)",
 after: "≈ BDT 1,920 (~16 refused orders)",
  },
 { id: "saving", metric: { en: "Weekly saving from the playbook" }, before: "—", after: "≈ BDT 2,880" },
];

export const COD_WORKED_EXAMPLE_NOTE: Bilingual = {
  en: "Assumptions (average ticket, per-attempt cost, starting refusal rate) vary by category and courier contract — rerun this table with your own numbers. The reusable part is the calculation structure: refusal rate × order volume × per-attempt cost.",
};

/* -------------------------------------------------------------------------- */
/* Band 8 — chargebacks and disputes (single glass card)                    */
/* -------------------------------------------------------------------------- */

export const CHARGEBACKS = {
  title: { en: "Chargebacks and disputes" },
  body: {
    en: "Card chargebacks and MFS dispute cases are rarer in Bangladesh than in mature card markets, but they follow the card network's or provider's own process — Framique does not adjudicate disputes, since that authority sits with your acquirer or the rail provider.",
  },
  bullets: [
    { en: "Posts every chargeback or dispute notification your processor sends as a timeline event on the affected order." },
    { en: "Surfaces the evidence you already have — delivery confirmation, OTP timestamp, proof-of-delivery — in one place to respond to your processor." },
    { en: "Flags the customer identity for review on future orders if a dispute is upheld against you, feeding the same repeat-refuser mechanism used for COD risk." },
  ],
} satisfies Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Band 9 — checkout conversion design (ZRow, text-right)                   */
/* -------------------------------------------------------------------------- */

export const CHECKOUT_DESIGN = {
  eyebrow: { en: "Checkout — fewest fields, phone-first identity", bn: "চেকআউট — সবচেয়ে কম ফিল্ড, ফোন-প্রথম পরিচয়" },
  title: { en: "Fewest fields, phone-first identity." },
  body: {
    en: "Name, phone, structured address, payment method. Email is optional — a large share of COD and MFS customers don't treat email as their primary contact channel, and making it mandatory adds a drop-off point for no reconciliation benefit.",
  },
  bullets: [
    { en: "Phone-first identity: it's how the customer pays, how the OTP reaches them, how the courier reaches them, and how repeat-customer recognition works." },
    { en: "Bangla numerals (০–৯) as a per-store locale setting, not inferred from browser locale alone." },
    { en: "Structured address fields (division → district → thana → detail line) improve delivery accuracy and feed the address-quality fraud signal automatically." },
  ],
} satisfies Record<string, unknown>;

export const CHECKOUT_FIELDS: { id: string; field: Bilingual; required: string; why: Bilingual }[] = [
  { id: "name", field: { en: "Full name" }, required: "Yes", why: { en: "Delivery label, order record" } },
  { id: "phone", field: { en: "Phone number" }, required: "Yes", why: { en: "Payment identity, OTP, courier contact" } },
  { id: "address_area", field: { en: "Division / District / Thana" }, required: "Yes (structured)", why: { en: "Delivery accuracy, fraud signal" } },
  { id: "address_line", field: { en: "Detailed address line" }, required: "Yes", why: { en: "Delivery accuracy" } },
  { id: "email", field: { en: "Email" }, required: "No", why: { en: "Optional receipt delivery only" } },
  { id: "method", field: { en: "Payment method" }, required: "Yes", why: { en: "Rail selection" } },
  { id: "note", field: { en: "Order note" }, required: "No", why: { en: "Optional, e.g. landmark or instruction" } },
];

/* -------------------------------------------------------------------------- */
/* Band 10 — security: PCI, keys, tokens                                    */
/* -------------------------------------------------------------------------- */

export const SECURITY = {
  title: { en: "PCI, keys, tokens — named, not hyped" },
  body: {
    en: "Framique does not store raw card numbers on its own servers. Card entry is tokenised by your PCI-DSS-compliant gateway at the point of entry, and Framique stores and operates on the resulting token — the standard pattern for keeping a merchant's own PCI scope minimal (typically SAQ-A or SAQ-A-EP-equivalent; confirm with your acquirer or QSA).",
  },
  bullets: [
    { en: "Scoped API keys (read-only, write, webhook-signing) rather than one master key — a leaked read-only key cannot issue refunds or move payouts." },
    { en: "Webhook payloads are signed and verified on every inbound rail webhook before the contents are trusted." },
    { en: "Payment credentials in transit are TLS-encrypted; tokens and reference IDs at rest are encrypted; payments-module access is permissioned separately from general store admin access." },
  ],
} satisfies Record<string, unknown>;

export const SECURITY_KEY_SCOPES: { id: string; scope: Bilingual; grants: Bilingual }[] = [
  { id: "read", scope: { en: "read" }, grants: { en: "View orders, payments and ledger rows" } },
  { id: "write", scope: { en: "write" }, grants: { en: "Create orders, issue refunds" } },
  { id: "webhook", scope: { en: "webhook-signing" }, grants: { en: "Verify inbound rail webhooks only" } },
];

/* -------------------------------------------------------------------------- */
/* Band 11 — payouts and finance exports (ZRow, text-left)                  */
/* -------------------------------------------------------------------------- */

export const PAYOUTS = {
  title: { en: "Built for your accountant, not just your dashboard." },
  body: {
    en: "Every rail's incoming payments and every payout to your bank account are logged as ledger events, exportable in the format your accountant actually needs.",
  },
  bullets: [
    { en: "CSV export per period (day/week/month/custom range) and per rail — order ID, rail transaction reference, gross, fee, net, settlement date." },
    { en: "API export for accounting systems that pull data programmatically rather than via manual upload." },
    { en: "Payout summary view: for each bank deposit, the exact set of orders that sum to that amount." },
    { en: "Framique surfaces the transaction-level data your accountant needs for VAT/mushak filings, but does not determine VAT treatment or generate mushak challans itself — confirm with your accountant or current NBR guidance." },
  ],
  proof: { en: "Every bank deposit ties back to named orders." },
} satisfies Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Band 12 — built for developers                                           */
/* -------------------------------------------------------------------------- */

export const DEVELOPERS = {
  title: { en: "Built for developers" },
  body: {
    en: "Integrating Framique payments into a custom storefront, a headless frontend, or an existing ERP — the payments module is fully addressable via the REST API.",
  },
  endpoints: [
    { id: "history", code: "GET /orders/{id}/payments", desc: { en: "Full payment event history for an order — rail, status, amounts, timestamps." } },
    { id: "refund", code: "POST /payments/{id}/refund", desc: { en: "Trigger a full or partial refund; accepts a line-item breakdown." } },
    { id: "webhooks", code: "payment.confirmed · payment.failed · refund.completed · reconciliation.exception_created", desc: { en: "Webhook subscriptions — the last lets you build your own alerting on the unmatched-taka queue." } },
    { id: "idempotency", code: "Idempotency-Key header", desc: { en: "Supported on all mutating endpoints — your integration can safely retry without double-processing." } },
    { id: "sandbox", code: "Sandbox mode", desc: { en: "Simulated MFS/card/COD flows for integration testing before going live." } },
  ],
  docsLinks: [
    { id: "payments", href: "/docs/payments", label: { en: "/docs/payments — full API reference" } },
    { id: "webhooks", href: "/docs/webhooks", label: { en: "/docs/webhooks — signature verification and retry semantics" } },
    { id: "reconciliation", href: "/docs/reconciliation", label: { en: "/docs/reconciliation — ledger schema and the unmatched-taka queue" } },
  ],
} satisfies Record<string, unknown>;

/* -------------------------------------------------------------------------- */
/* Band 13 — FAQ (10 entries; identical strings feed FaqBand and JSON-LD)   */
/* -------------------------------------------------------------------------- */

export type FaqDeckEntry = { id: string; question: Bilingual; answer: Bilingual };

export const PAYMENTS_FAQ: FaqDeckEntry[] = [
  {
    id: "custody",
    question: { en: "Do you hold my money?", bn: "আপনারা কি আমার টাকা নিজেদের কাছে রাখেন?" },
    answer: {
      en: "No. Rails settle to your own bKash/Nagad/bank/acquirer accounts directly; Framique records and reconciles those settlements against your orders — it does not sit in the custody chain.",
      bn: "না। রেলগুলো সরাসরি আপনার নিজের বিকাশ/নগদ/ব্যাংক/অ্যাকোয়ারার অ্যাকাউন্টে সেটেল হয়; ফ্রেমিক শুধু সেই সেটেলমেন্ট আপনার অর্ডারের সাথে মিলিয়ে রেকর্ড রাখে।",
    },
  },
  {
    id: "card_processors",
    question: { en: "Which processors do you support for cards?" },
    answer: {
      en: "Any processor or acquiring bank you already hold a merchant account with, connected through Framique's gateway integration layer. Framique does not require you to switch acquirers.",
    },
  },
  {
    id: "cod_returns",
    question: { en: "How are COD returns and refusals handled?" },
    answer: {
      en: "A refusal or return posts against the original order and the courier trip that carried it, so your return rate is a measured figure from real events, not an estimate from a spreadsheet.",
    },
  },
  {
    id: "ledger_export",
    question: { en: "Can I export the ledger for my accountant?" },
    answer: {
      en: "Yes — CSV or API, filterable by period and by rail, with a payout-to-order tie-out view.",
    },
  },
  {
    id: "missed_webhook",
    question: { en: "What happens if a webhook from bKash or my card gateway is delayed or lost?" },
    answer: {
      en: "Framique relies on the rail's own retry mechanism plus a status-polling fallback, so a single missed webhook does not leave an order stuck.",
    },
  },
  {
    id: "partial_refund",
    question: { en: "Do you support partial refunds on multi-item orders?" },
    answer: {
      en: "Yes, at the line-item level — a partial refund updates only the affected SKU's revenue and returns figures, not the whole order.",
    },
  },
  {
    id: "cod_fraud",
    question: { en: "How is COD fraud actually reduced, not just detected?" },
    answer: {
      en: "Through the combination of OTP confirmation, structured address validation, a repeat-refuser list, prepayment nudges toward MFS, and optional partial advance on higher-ticket orders — used together, not any single measure alone.",
    },
  },
  {
    id: "card_storage",
    question: { en: "Do you store card numbers?" },
    answer: {
      en: "No. Card entry is tokenised by your PCI-DSS-compliant gateway; Framique stores and operates on the token, not the raw card number.",
    },
  },
  {
    id: "chargebacks",
    question: { en: "How do chargebacks get handled?" },
    answer: {
      en: "The dispute process itself runs through your acquirer or the rail's own scheme rules; Framique surfaces every dispute event on the order timeline and centralises the evidence you need to respond.",
    },
  },
  {
    id: "thresholds",
    question: { en: "Can I adjust fraud-scoring thresholds myself?" },
    answer: {
      en: "Yes — thresholds are merchant-configurable, not fixed platform-wide, because risk tolerance differs meaningfully by category and average order value.",
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Band 14 — final CTA                                                      */
/* -------------------------------------------------------------------------- */

export const FINAL_CTA = {
  title: { en: "Connect bKash today, take an order tonight.", bn: "আজই বিকাশ যুক্ত করুন, আজ রাতেই প্রথম অর্ডার নিন।" },
  body: {
    en: "Card and COD can follow in the same setup flow. Reconciliation starts on your first order, not your hundredth.",
    bn: "কার্ড আর সিওডি একই সেটআপে যোগ করা যায়। প্রথম অর্ডার থেকেই রিকনসিলিয়েশন শুরু হয়ে যায়।",
  },
  primaryCta: { en: "Start free — no card" },
  secondaryCta: { en: "Talk to sales" },
} satisfies Record<string, unknown>;
