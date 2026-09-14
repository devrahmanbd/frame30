/**
 * Pure content module for `/pricing` (docs/05-marketing/copy/02-pricing.md).
 *
 * This file is deliberately free of React/JSX: it is a typed data contract
 * that the route consumes, and a data contract is the thing a copy reviewer
 * or a translator can diff without touching component code. Every string
 * here traces to a line in the copy deck; nothing is invented, and every
 * `[PLACEHOLDER]` number in the deck (per-seat add-on rate, exact plan price
 * examples, etc.) is omitted rather than guessed — live prices come from
 * `getPublicPlans()` in the route, never from this file.
 *
 * The worked cost examples (Section 4 of the deck) are explicitly labelled
 * "assumption" everywhere they appear, exactly as the deck requires, because
 * they are illustrative unit economics, not measured Framique statistics.
 */

export type Bilingual = { en: string; bn: string };

/** Hero band copy — Section 1 of the deck. */
export const HERO = {
  eyebrow: "Prices in BDT · VAT shown separately",
  title: "Pricing that stays honest at scale.",
  titleBn: "স্কেল বাড়লেও যে দামে সততা থাকে",
  sub: "Every plan includes bKash, Nagad, card and COD. No per-order tax on your growth — and below, we show you exactly what an order costs once rails, couriers and returns are counted.",
  subBn:
    "প্রতিটি প্ল্যানে বিকাশ, নগদ, কার্ড ও ক্যাশ অন ডেলিভারি অন্তর্ভুক্ত। বৃদ্ধির উপর কোনো প্রতি-অর্ডার কর নেই।",
  primaryCta: "Start 14-day trial",
  altCta: "See the fee breakdown",
} as const;

/**
 * Worked example — one COD order, Section 4 of the deck. Every "Notes" cell
 * ends with the word "assumption" wherever the deck marks it as such, so the
 * UI never has to re-derive which rows are illustrative.
 */
export type WorkedExampleRow = { id: string; label: string; amount: string; pct: string; note: string; strong?: boolean };

export const COD_WORKED_EXAMPLE: WorkedExampleRow[] = [
 { id: "order-value", label: "Order value", amount: "BDT 1,200", pct: "100%", note: "Customer-facing price" },
 { id: "cogs", label: "Cost of goods sold", amount: "−BDT 650", pct: "−54.2%", note: "Landed cost, assumption" },
  {
    id: "courier",
    label: "Courier delivery fee",
 amount: "−BDT 70",
    pct: "−5.8%",
    note: "Flat intra-city fee, assumption",
  },
  {
    id: "cod-fee",
    label: "COD collection fee",
 amount: "−BDT 24",
    pct: "−2.0%",
    note: "Courier charges ~2% of collected cash, assumption",
  },
 { id: "packaging", label: "Packaging", amount: "−BDT 25", pct: "−2.1%", note: "Poly mailer + label, assumption" },
  {
    id: "ad-cost",
    label: "Ad cost (amortised)",
 amount: "−BDT 180",
    pct: "−15.0%",
    note: "Blended CAC across converting + non-converting clicks, assumption",
  },
  {
    id: "returns",
    label: "Return-leg risk reserve",
 amount: "−BDT 25.20",
    pct: "−2.1%",
 note: "12% return rate × ~ BDT 210 average round-trip courier cost, amortised, assumption",
  },
  {
    id: "contribution",
    label: "Contribution before platform fee",
 amount: "BDT 225.80",
    pct: "18.8%",
    note: "",
    strong: true,
  },
] as const;

/** Worked example — same order settled digitally via bKash instead of COD. */
export const DIGITAL_WORKED_EXAMPLE: WorkedExampleRow[] = [
 { id: "order-value", label: "Order value", amount: "BDT 1,200", pct: "100%", note: "" },
 { id: "cogs", label: "Cost of goods sold", amount: "−BDT 650", pct: "−54.2%", note: "Same assumption" },
 { id: "courier", label: "Courier delivery fee", amount: "−BDT 70", pct: "−5.8%", note: "Same" },
  {
    id: "rail-fee",
    label: "bKash merchant rail fee",
 amount: "−BDT 22.20",
    pct: "−1.85%",
    note: "Rail-published merchant rate, assumption; charged by bKash, not Framique",
  },
 { id: "packaging", label: "Packaging", amount: "−BDT 25", pct: "−2.1%", note: "Same" },
 { id: "ad-cost", label: "Ad cost (amortised)", amount: "−BDT 180", pct: "−15.0%", note: "Same" },
  {
    id: "returns",
    label: "Return-leg risk reserve",
 amount: "−BDT 6.30",
    pct: "−0.5%",
    note: "Digital orders return less than COD; assumed 3% return rate",
  },
  {
    id: "contribution",
    label: "Contribution before platform fee",
 amount: "BDT 246.30",
    pct: "20.5%",
    note: "",
    strong: true,
  },
] as const;

export const FEE_ANATOMY = {
  title: "What a taka actually costs you.",
  sub: "The plan fee is one line on your P&L. These are the others — the ones every platform has, whether or not they show you the total.",
 codCaption: "Worked example — one COD order, BDT 1,200 order value (stated assumptions)",
  digitalCaption: "Same order, paid digitally via bKash instead of COD (stated assumptions)",
  takeaway:
 "COD collection fees plus the higher return rate they carry cost this merchant roughly BDT 20.50 more per order than the same sale settled digitally — before either merchant pays a single taka of platform fee.",
  footnote: "Assumption, not a Framique statistic.",
  calloutBn:
    "প্ল্যাটফর্ম ফি একটাই লাইন। বাকি খরচ — রেল, কুরিয়ার, রিটার্ন — সেগুলো সব প্ল্যাটফর্মেই থাকে, শুধু দেখানো হয় না।",
} as const;

/**
 * Section 6 — annual vs monthly, honest framing. No "always save" pitch: the
 * deck explicitly requires a table of when annual is and isn't the right call.
 */
export const BILLING_GUIDANCE = {
  title: "Annual isn't automatically the right call.",
  body: "Annual billing is two months free against monthly — a genuine 16.7% discount. It is the right choice once you're confident in your order volume for the next 12 months. It is the wrong choice if you are still validating demand, still deciding your theme, or likely to upgrade tiers mid-year: the unused portion of an annual plan is not refunded pro-rata against an upgrade, only credited toward the new tier's annual price.",
  bodyBn: "বার্ষিক বিলিং সবসময় সঠিক সিদ্ধান্ত নয়। আপনার অর্ডার ভলিউম সম্পর্কে নিশ্চিত হলে তবেই এটি বেছে নিন।",
  rows: [
    {
      id: "prelaunch",
      situation: "Pre-launch or first 90 days",
      billing: "Monthly",
      why: "You don't yet know your order volume; optionality is worth more than 16.7%",
    },
    {
      id: "stable",
      situation: "Stable ≥6 months of orders, same tier",
      billing: "Annual",
      why: "Discount is pure margin at this point",
    },
    {
      id: "upgrading",
      situation: "Expecting to upgrade tier within the year",
      billing: "Monthly, or annual on current tier only if the discount exceeds the likely proration loss",
      why: "Run your own numbers before committing",
    },
    {
      id: "seasonal",
      situation: "Seasonal business (e.g. Eid-heavy)",
      billing: "Monthly",
      why: "Volume swings mean the flat-fee break-even point moves month to month",
    },
  ],
} as const;

/** Section 7 — plan-choice decision tree, rendered as a plain question list. */
export const DECISION_TREE = {
  title: "Which plan fits, in four questions.",
  titleBn: "চারটি প্রশ্নে বুঝে নিন কোন প্ল্যান আপনার জন্য",
  questions: [
    {
      id: "q1",
      question: "Do you have a live product catalogue over 100 SKUs today?",
      no: "Starter is enough. Move up when you cross the SKU limit, not before.",
      yesNext: "q2",
    },
    {
      id: "q2",
      question: "Do you need more than one staff login, or fraud scoring on incoming COD orders?",
      no: "Starter still covers you.",
      yesNext: "q3",
    },
    {
      id: "q3",
      question: "Do you operate more than one physical outlet, or need POS at a till?",
      no: "Growth is the fit for most single-storefront D2C operations.",
      yesNext: "q4",
    },
    {
      id: "q4",
      question:
        "Do you need custom contractual terms, a dedicated SLA, or settlement terms outside the standard rail schedule?",
      no: "Scale covers multi-store and POS without a custom contract.",
      yesNext: null,
      yes: "Enterprise — talk to sales.",
    },
  ],
} as const;

/** Section 10 — migration and exit guarantees, rendered as a checklist. */
export const GUARANTEES = {
  title: "You can leave. Here's exactly how.",
  body: "Framique does not hold your data, your customer list, or your money hostage to keep you subscribed.",
  bodyBn: "আপনার ডেটা, কাস্টমার তালিকা বা অর্থ কখনো আটকে রাখা হয় না। যেকোনো সময় সম্পূর্ণ এক্সপোর্ট করা যায়।",
  items: [
    {
      id: "export",
      title: "Full data export",
      detail:
        "Products, orders, customers, and order history export as CSV/JSON on demand, from every plan, at any time — including during a paid subscription and during the 14-day trial.",
    },
    {
      id: "format",
      title: "No proprietary lock-in format",
      detail: "Exports use standard schemas compatible with common re-import tools, not a Framique-only format.",
    },
    {
      id: "payouts",
      title: "Payout independence",
      detail:
        "Rails settle to your own bKash/Nagad/bank account directly; Framique never custodies your funds, so there is no balance to release on exit.",
    },
    {
      id: "domain",
      title: "Domain portability",
      detail: "Custom domains you've connected remain yours; DNS records are never held by Framique.",
    },
    {
      id: "downgrade",
      title: "Downgrade path",
      detail:
        "Downgrade takes effect at the next billing cycle; if you're over the new tier's limit, the dashboard lists exactly which records to archive first — no automatic deletion.",
    },
    {
      id: "cancel",
      title: "Cancellation",
      detail:
        "Cancel any time; access continues until the end of the paid period, then the store pauses (not deletes) — data is retained and exportable for a stated retention window after pause.",
    },
  ],
} as const;

/** Section 11 — comparison against the two real alternatives merchants face. */
export const COMPARISON = {
  title: "Compared to the two paths you're actually choosing between.",
  marketplaceCaption: "Framique vs a marketplace commission model",
  marketplaceRows: [
    {
      id: "fee",
      dimension: "Fee structure",
      marketplace: "Percentage of order value, often stacked with a payment processing fee",
      framique: "Flat monthly fee, rail fees passed through at cost",
    },
    {
      id: "low-volume",
 dimension: "Cost at 50 orders/month, BDT 1,200 AOV",
 marketplace: "8% commission benchmark ≈ BDT 4,800/month",
      framique: "Flat plan fee shown on the cards above",
    },
    {
      id: "high-volume",
      dimension: "Cost at 1,000 orders/month, same AOV",
 marketplace: "8% commission ≈ BDT 96,000/month",
      framique: "Same flat fee — a materially smaller share of revenue as volume grows",
    },
    {
      id: "data",
      dimension: "Customer data ownership",
      marketplace: "Often restricted or shared with the marketplace",
      framique: "Store owns full customer and order data, exportable",
    },
    {
      id: "brand",
      dimension: "Storefront brand control",
      marketplace: "Limited — shared marketplace UI",
      framique: "Full theme control across 5 official themes",
    },
  ],
  diyCaption: "Framique vs self-hosting / DIY (own server + open-source cart)",
  diyRows: [
    {
      id: "upfront",
      dimension: "Upfront cost",
      diy: "Developer time to build storefront, payments, courier integration — frequently underestimated",
      framique: "Storefront, payment rails and courier integrations included from day one",
    },
    {
      id: "rails",
      dimension: "bKash/Nagad/Rocket/Upay integration",
      diy: "Built and maintained in-house, including reconciliation logic",
      framique: "Included, maintained centrally",
    },
    {
      id: "courier",
      dimension: "Courier booking (SteadFast, Pathao, RedX, Paperfly)",
      diy: "Built per-courier, each with its own API and failure modes",
      framique: "Included, one interface",
    },
    {
      id: "time",
      dimension: "Time to first sale",
      diy: "Weeks to months depending on developer availability",
      framique: "Days, inside the 14-day trial",
    },
  ],
  calloutBn: "মার্কেটপ্লেস কমিশন ভলিউম বাড়ার সাথে বাড়ে। আমাদের ফ্ল্যাট ফি বাড়ে না।",
} as const;

/** Section 12 — objections stated in the merchant's own words. Reuses the FaqBand shell. */
export const OBJECTIONS: { id: string; question: string; answer: string }[] = [
  {
    id: "risk",
    question: "\"A flat fee feels riskier than commission if I don't sell anything this month.\"",
    answer:
      "True at zero volume. That's what the 14-day trial and the monthly billing option are for — you're not locked into a flat fee before you've validated demand.",
  },
  {
    id: "fee-change",
    question: "\"What if bKash or a courier changes their fee and my costs jump?\"",
    answer:
      "Rail and courier fees are set by bKash, Nagad, the couriers and NBR-mandated VAT — not by Framique, and we don't mark them up.",
  },
  {
    id: "no-dev",
    question: "\"I don't have a developer — can I actually set this up myself?\"",
    answer:
      "Yes. The theme builder and payment/courier connections are configured through the dashboard, not code.",
  },
  {
    id: "missed-payment",
    question: "\"What happens to my store if I miss a payment?\"",
    answer:
      "The store pauses — it does not delete. Customer-facing pages go offline, but your data stays intact and exportable while paused.",
  },
  {
    id: "export-scope",
    question: "\"Can I really export everything, or is 'export' just my product list?\"",
    answer:
      "Full export includes products, orders, customer records and order history, in standard CSV/JSON, on every plan — not just higher tiers.",
  },
  {
    id: "cod-afterthought",
    question: "\"Is COD actually going to work well, or is that an afterthought?\"",
    answer:
      "COD is included on every plan including Starter — it's the dominant payment method for D2C orders in Bangladesh, not a secondary feature.",
  },
  {
    id: "switching",
    question: "\"Will switching from my current platform lose my order history?\"",
    answer:
      "Historical orders can be imported from a standard CSV export of your current platform; onboarding includes a mapping step so IDs aren't duplicated.",
  },
  {
    id: "global",
    question: "\"Why should I trust a Bangladesh-first platform over a global one like Shopify?\"",
    answer:
      "Global platforms treat bKash, Nagad, COD reconciliation and local courier booking as third-party plugins. Framique builds these as first-class, maintained integrations for exactly this market.",
  },
];

/**
 * Section 13 — the ten-question FAQ. These strings are passed verbatim into
 * both `<FaqBand>` and `buildGraph({ faq })`, per the hard rule that FAQPage
 * JSON-LD must match rendered text exactly.
 */
export const FAQ: { id: string; question: string; answer: string }[] = [
  { id: "vat", question: "Are prices inclusive of VAT?", answer: "Prices are shown ex-VAT; VAT is added at invoicing per NBR rules." },
  {
    id: "after-trial",
    question: "What happens after the trial?",
    answer: "Nothing is charged automatically. Pick a plan or your store pauses — your data stays.",
  },
  {
    id: "downgrade",
    question: "Can I downgrade?",
    answer: "Yes, at the next cycle. If you're over a limit we tell you exactly which records to archive first.",
  },
  {
    id: "payouts",
    question: "How do payouts work?",
    answer: "Rails settle to your own bKash / Nagad / bank account. Framique never holds your money.",
  },
  {
    id: "seats",
    question: "Do you charge per staff seat?",
    answer: "Seats are included per tier, not billed individually; extra seats beyond the tier limit are billed per seat.",
  },
  {
    id: "volume-fee",
    question: "Does the plan fee change if my order volume grows?",
    answer: "No. The plan fee is flat; only your effective per-order cost changes, and it falls as volume rises.",
  },
  {
    id: "courier-fees",
    question: "Which courier fees are included in the plan price?",
    answer:
      "None — courier delivery and COD collection fees are charged by the courier directly and shown as separate line items, never bundled into the plan fee.",
  },
  {
    id: "themes",
    question: "Can I switch themes after choosing a plan?",
    answer: "Yes, any of the 5 official themes are available on every plan at any time; switching themes does not affect billing.",
  },
  {
    id: "setup-fee",
    question: "Is there a setup fee?",
    answer: "No. The only charges are the plan fee (or nothing, on trial) and pass-through rail/courier fees on actual transactions.",
  },
  {
    id: "custom",
    question: "What if I need custom rate limits or a dedicated engineer?",
    answer: "That's the Enterprise tier — contact sales for a scoped quote; it is the only tier without a published flat price.",
  },
];

/** Section 14 — final CTA. */
export const FINAL_CTA = {
  title: "Bigger than a plan page?",
  titleBn: "প্ল্যান পেজের চেয়ে বড় কিছু দরকার?",
  body: "Custom limits, migration support, an SLA and a named engineer.",
  bodyBn: "কাস্টম লিমিট, মাইগ্রেশন সহায়তা, SLA এবং একজন নির্দিষ্ট ইঞ্জিনিয়ার।",
  primary: "Talk to sales",
  secondary: "See the security model",
} as const;
