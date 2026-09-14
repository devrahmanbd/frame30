/**
 * Phase 10.2 — `/` copy contract.
 *
 * Pure data module: no React, no JSX, no network. It is the typed transcript
 * of `docs/05-marketing/copy/01-home.md` for every band whose copy is *static*
 * marketing prose (hero, rails, product tour, themes, comparison, COD
 * economics, pricing framing, stories framing, final CTA).
 *
 * Two things deliberately do NOT live here, because they are not static copy:
 *   - Live numbers (orders/stores/rails/stats) — those come from the loader
 *     and are rendered by `StatBand`, which drops any metric it cannot verify.
 *   - The FAQ question/answer pairs — those stay in `src/lib/landing.ts`
 *     (`FAQ_ROWS`) plus the `en`/`bn` i18n dictionary, because the route's
 *     `head()` builds the `FAQPage` JSON-LD from the exact same source the
 *     page renders. Duplicating that text here would create a second place
 *     the two could drift apart.
 *
 * Every English string below has a Bangla twin sourced from the same deck
 * section, never a machine paraphrase — the deck's own BN lines are copied
 * verbatim so the two languages make the same claim.
 */

export type Bi = { en: string; bn?: string };

/* --------------------------------------------------------------------- hero */

export const HERO = {
  title: "Run your whole shop on one login — storefront, bKash, courier, counter.",
  titleBn: "বাংলাদেশে বিক্রি করুন। সারা বিশ্বে পাঠান।",
  sub: "Take the order, get paid on bKash, Nagad, card or COD, book SteadFast or Pathao and print the label — without leaving the order. No per-order commission, ever.",
  subBn: "স্টোরফ্রন্ট, পেমেন্ট, কুরিয়ার আর POS — এক প্ল্যাটফর্মে, বাংলায়, টাকায়।",
  ctaPrimary: "Create your store",
  ctaSecondary: "See a live store",
  note: "No hidden fees · no card · cancel anytime · export your data any time",
  proof: "Built in Dhaka for COD-heavy, Bangla-reading, mobile-money commerce — 4 payment rails, 4 couriers, 1 ledger.",
} as const;

/* -------------------------------------------------------------------- rails */

export const RAILS = {
  kicker: "Payment methods and couriers your customers already trust",
  kickerBn: "আপনার গ্রাহকদের পরিচিত পেমেন্ট মাধ্যম ও বিশ্বস্ত কুরিয়ার",
  note: "Every payment settles directly to your merchant account with zero platform escrow delay.",
  marks: [
    "bKash",
    "Nagad",
    "Rocket",
    "Upay",
    "Visa",
    "Mastercard",
    "Cash on delivery",
    "SteadFast",
    "Pathao",
    "RedX",
    "Paperfly",
  ],
} as const;

/* --------------------------------------------------------------- product tour */

export type TourRow = {
  id: string;
  direction: "left" | "right";
  title: string;
  body: string;
  proof: string;
};

export const TOUR_ROWS: readonly TourRow[] = [
  {
    id: "storefront",
    direction: "left",
    title: "Launch a storefront, not a ticket",
    body: "Pick a theme, drag sections, publish. Bangla and English from the same catalogue — no duplicate products, no translation plugin drifting out of sync.",
    proof: "Live in a day",
  },
  {
    id: "checkout",
    direction: "right",
    title: "Checkout that survives a COD market",
    body: "bKash, Nagad, card and cash on delivery in one flow, with fraud scoring before the courier is booked — so you catch a bad order before you pay for a failed delivery, not after.",
    proof: "4 rails, 1 checkout",
  },
  {
    id: "fulfilment",
    direction: "left",
    title: "Fulfilment without a second tab",
    body: "Book pickups, print labels and read delivery status inside the same order drawer. No copy-pasting an address between your storefront and a courier's separate merchant portal.",
    proof: "4 couriers",
  },
  {
    id: "dashboard",
    direction: "right",
    title: "Numbers you can act on tonight",
    body: "Revenue, return rate and rail mix per store, refreshed live — not a nightly CSV export someone has to remember to pull.",
    proof: "Live dashboard",
  },
  {
    id: "catalogue",
    direction: "left",
    title: "Catalogue hygiene that holds at scale",
    body: "Variants, stock thresholds and Bangla product copy live in one product record, so a size-out-of-stock in Sylhet doesn't quietly still show \"in stock\" to a buyer in Khulna.",
    proof: "One source of truth",
  },
  {
    id: "pos",
    direction: "right",
    title: "A POS that shares the same ledger",
    body: "Ring up a counter sale and it reconciles against the same inventory and revenue numbers as your online orders — no separate spreadsheet to merge at month end.",
    proof: "Online + offline, one ledger",
  },
] as const;

/* ------------------------------------------------------------------- themes */

export type ThemeCard = {
  id: string;
  name: string;
  useCase: string;
  body: string;
};

export const THEMES = {
  title: "Five themes. Pick the one that matches how you actually sell.",
  sub: "Every theme ships production-ready — no theme-store hunting, no premium unlock fee.",
  subBn: "পাঁচটি থিম। আপনি যেভাবে বিক্রি করেন, সেই অনুযায়ী একটি বেছে নিন।",
  cards: [
    {
      id: "classic",
      name: "Classic",
      useCase: "A broad catalogue, many categories",
      body: "A timeless wide grid built for apparel, homeware and general stores with 50+ SKUs. Category rails stay visible and filters sit above the fold.",
    },
    {
      id: "modern",
      name: "Modern",
      useCase: "Fashion, beauty, home décor",
      body: "An airy editorial lookbook where photography does the selling — wide-format hero imagery and generous whitespace that signals price tier.",
    },
    {
      id: "landing",
      name: "Landing",
      useCase: "A single hero product or campaign",
      body: "One hero, one offer, one CTA, repeated proof bands stacked to the fold — built for a launch or a paid-traffic campaign, not a multi-product catalogue.",
    },
    {
      id: "supershop",
      name: "Supershop",
      useCase: "Grocery, FMCG, small frequent baskets",
      body: "Grocery-aisle density with quick-add on every card, a sticky cart summary and aisle-style category chips instead of a wide hero.",
    },
    {
      id: "b2b",
      name: "B2B",
      useCase: "Wholesale, distributors, business buyers",
      body: "A quote-first wholesale layout: tiered pricing tables, minimum order quantities enforced at the cart, and a request-a-quote flow ahead of checkout.",
    },
  ],
} as const satisfies { title: string; sub: string; subBn: string; cards: ThemeCard[] };

/* --------------------------------------------------------------- comparison */

export type ComparisonRow = { id: string; label: string; framique: string; builder: string; marketplace: string; offline: string };

export const COMPARISON = {
  title: "What you stop paying for.",
  sub: "Merchants arrive here from three starting points. Here is the honest cost of each.",
  columns: {
    framique: "Framique",
    builder: "Generic page builder + plugins",
    marketplace: "Marketplace-only selling",
    offline: "Offline-only (shop + phone orders)",
  },
  rows: [
    {
      id: "settlement",
      label: "bKash / Nagad settlement",
      framique: "Reconciled per order automatically",
      builder: "Manual statement matching against a spreadsheet",
      marketplace: "Marketplace controls the payout schedule and cut",
      offline: "Manual cash count, no digital trail",
    },
    {
      id: "storefront",
      label: "Bangla storefront",
      framique: "First-class, one catalogue",
      builder: "Duplicate products or a translation plugin that drifts",
      marketplace: "Bangla support varies by marketplace, not yours to control",
      offline: "N/A — no storefront",
    },
    {
      id: "courier",
      label: "Courier booking",
      framique: "Inside the order drawer",
      builder: "Separate courier portal, copy-paste address",
      marketplace: "Marketplace's own courier, no choice",
      offline: "Manual phone call per delivery",
    },
    {
      id: "fee",
      label: "Per-order fee",
      framique: "None beyond your plan",
      builder: "None from the builder, but plugin fees stack",
      marketplace: "Commission on every sale, often 8–20%",
      offline: "None, but no reach beyond walk-in/word of mouth",
    },
    {
      id: "catalogue-ownership",
      label: "Catalogue ownership",
      framique: "Yours; export any time",
      builder: "Yours, but scattered across plugins",
      marketplace: "Marketplace's rules govern your listing, not you",
      offline: "Yours, but undigitized",
    },
    {
      id: "export",
      label: "Data export",
      framique: "CSV or API, any time",
      builder: "Depends on each plugin vendor",
      marketplace: "Limited or none — you don't own the customer record",
      offline: "N/A",
    },
    {
      id: "discoverability",
      label: "Discoverability outside the platform",
      framique: "Your own domain, your own SEO",
      builder: "Your own domain, SEO fragmented by plugin cruft",
      marketplace: "High marketplace traffic, but you rent every customer",
      offline: "None beyond existing footfall",
    },
    {
      id: "time-to-sale",
      label: "Time to first sale",
      framique: "Hours to a day",
      builder: "Days to weeks assembling plugins",
      marketplace: "Hours, but customer stays the marketplace's",
      offline: "Immediate, but ceiling is local foot traffic",
    },
  ],
  close:
    "Every hour spent reconciling bKash statements by hand, or every percentage point paid to a marketplace on every single order, is money and time not spent sourcing product or answering customers.",
  closeBn:
    "হাতে হাতে বিকাশ স্টেটমেন্ট মেলানোর প্রতিটি ঘণ্টা, বা মার্কেটপ্লেসকে দেওয়া প্রতিটি কমিশন — তা বিক্রি বাড়ানোর সুযোগ হারানো।",
} as const satisfies {
  title: string;
  sub: string;
  columns: Record<string, string>;
  rows: ComparisonRow[];
  close: string;
  closeBn: string;
};

/* ------------------------------------------------------------- COD economics */

export const COD = {
  title: "What a returned COD order actually costs you.",
  intro:
    "Cash on delivery is the majority payment method for first-time online buyers in Bangladesh, and it is also the single biggest hidden cost in the unit economics of a Bangladeshi storefront — not because of fraud, but because of return rate: the share of dispatched COD orders the customer refuses at the door. Below is a worked example with stated assumptions; substitute your own numbers.",
  assumptions:
 "Assumptions (stated, not measured): average order value BDT 1,200; product cost BDT 600; forward courier fee BDT 70; return courier fee (product coming back) BDT 60; packaging BDT 25; COD return rate 18% (a commonly cited range for unmoderated COD checkouts is 15–30%, before any fraud-scoring or address-verification step).",
  table: {
    columns: { success: "Successful delivery", returned: "Returned at doorstep" },
    rows: [
 { id: "collected", label: "Order value collected", success: "BDT 1,200", returned: "BDT 0" },
 { id: "product", label: "Product cost", success: "−BDT 600", returned: "−BDT 600 (not recovered until restocked)" },
 { id: "forward", label: "Forward courier fee", success: "−BDT 70", returned: "−BDT 70 (courier is paid whether or not the customer accepts)" },
 { id: "return", label: "Return courier fee", success: "BDT 0", returned: "−BDT 60" },
 { id: "packaging", label: "Packaging", success: "−BDT 25", returned: "−BDT 25 (not reusable)" },
 { id: "net", label: "Net result", success: "+BDT 505", returned: "−BDT 755" },
    ],
  },
  arithmetic:
 "With an 18% return rate, out of 100 dispatched orders, 82 succeed and 18 return. 82 × BDT 505 = BDT 41,410 gained; 18 × BDT 755 = BDT 13,590 lost. Net profit across 100 orders: BDT 27,820 — meaning the return rate alone consumed roughly a third of the gross profit the successful orders generated. Cut the return rate from 18% to 10% with the same volume, and net profit rises to BDT 37,900 — a 36% improvement in bottom-line profit with zero change in traffic or pricing.",
  levers: [
    "Phone verification before dispatch — an automated confirmation call or SMS-and-reply step catches orders placed on impulse or with a mistyped number before a courier fee is ever spent.",
    "Fraud and risk scoring at checkout — repeat-refusal phone numbers and mismatched delivery addresses are flagged before the order is booked, not after the courier reports a failed delivery.",
 "Partial prepayment nudges — offering a small bKash/Nagad advance (even BDT 50–100) at checkout, with COD covering the remainder, measurably filters low-intent orders because it asks for a small commitment before delivery.",
  ],
  caption:
    "These are worked assumptions for illustration, not a guarantee — run the same formula with your own AOV, return rate and courier fees.",
  captionBn:
    "এটি একটি ধারণাগত উদাহরণ, প্রতিশ্রুতি নয় — নিজের গড় অর্ডার মূল্য, রিটার্ন রেট ও কুরিয়ার খরচ দিয়ে হিসাব করুন।",
} as const;

/* --------------------------------------------------------------- pricing teaser */

export const PRICING_TEASER = {
  title: "Pricing that stays honest at scale.",
  sub: "Every plan includes bKash, Nagad, card and COD. No per-order tax on your growth.",
  subBn: "প্রতিটি প্ল্যানে বিকাশ, নগদ, কার্ড ও ক্যাশ অন ডেলিভারি অন্তর্ভুক্ত। বিক্রি বাড়লেও কোনো অতিরিক্ত কমিশন নেই।",
  ctaPrimary: "See all plans",
  ctaSecondary: "Talk to sales",
} as const;

/* ------------------------------------------------------------------- stories */

export const STORIES = {
  title: "Stores that grew on Framique.",
  sub: "Real merchants, real numbers. Pulled from their live dashboards.",
  cta: "Read the stories",
  empty: "Case studies are being verified with real merchants — check back soon.",
} as const;

/* --------------------------------------------------------------------- cta */

export const FINAL_CTA = {
  title: "Take your first order this afternoon, not this quarter.",
  titleBn: "আপনার প্রথম অর্ডার এক বিকেলের দূরত্বে।",
  sub: "Open the store, connect bKash, ship the first parcel — the platform is powerful enough to handle your real catalogue.",
  subBn: "স্টোর শুরু করুন, বিকাশ সংযুক্ত করুন, আজই একটি সত্যিকারের অর্ডার নিন।",
  ctaPrimary: "Create your store",
  ctaSecondary: "Book a 20-minute walkthrough",
  note: "No hidden fees · cancel anytime · export your data any time",
} as const;

/* ----------------------------------------------------------- how it works */

/**
 * Sequence beats adjectives: a visitor who can picture four concrete steps
 * commits far more readily than one asked to trust a capability list. Each
 * step names the effort ("about 20 minutes") because an unstated cost is
 * assumed to be large.
 */
export type HowStep = { id: string; step: string; title: string; body: string; effort: string };

export const HOW_IT_WORKS = {
  eyebrow: "How it works",
  title: "From signup to your first paid order in one afternoon.",
  sub: "Four steps, no developer, no plugin licence. You can stop after step two and still have a live store.",
  steps: [
    {
      id: "signup",
      step: "01",
      title: "Open your store",
      body: "Sign up with a phone number or email, pick your store name and a theme. Your storefront is live on a Framique subdomain before you add a single product.",
      effort: "About 5 minutes",
    },
    {
      id: "catalogue",
      step: "02",
      title: "Add products the way you already list them",
      body: "Type them in, or import a CSV your supplier already sends you. Variants, stock counts and Bangla product names live in one record — not in a second translated catalogue.",
      effort: "About 20 minutes for 20 SKUs",
    },
    {
      id: "rails",
      step: "03",
      title: "Connect bKash, Nagad, card and COD",
      body: "Paste your merchant credentials once. Every payment then reconciles against the order that produced it, so a settlement statement stops being a spreadsheet evening.",
      effort: "About 10 minutes per rail",
    },
    {
      id: "ship",
      step: "04",
      title: "Take the order, book the courier, get paid",
      body: "Fraud scoring runs before you pay for a pickup, the label prints from the order drawer, and delivery status writes itself back. COD cash is matched to orders when the courier settles.",
      effort: "Same day",
    },
  ],
} as const satisfies { eyebrow: string; title: string; sub: string; steps: readonly HowStep[] };

/* ------------------------------------------------------------- who it's for */

export type AudienceCard = { id: string; name: string; useCase: string; body: string };

/**
 * Entity coverage for search: the queries that actually convert are
 * "<business type> online store Bangladesh", not "ecommerce platform".
 */
export const AUDIENCES = {
  eyebrow: "Who it's for",
  title: "Built for how Bangladesh actually sells.",
  sub: "Facebook-first sellers, high-street shops going online, and brands outgrowing a marketplace stall.",
  cards: [
    {
      id: "facebook",
      name: "Facebook and Instagram sellers",
      useCase: "Comment-to-order sellers",
      body: "Stop losing orders in a DM thread. Send buyers to a checkout link that captures the address once, scores the order for fraud, and books the courier — while your page keeps doing what it already does well.",
    },
    {
      id: "retail",
      name: "Shops adding an online counter",
      useCase: "Existing high-street retail",
      body: "Your counter sales and your online orders draw down the same stock, so a shelf that empties in Mirpur stops selling on the website in the same second. One ledger at month end, not two.",
    },
    {
      id: "brand",
      name: "Brands leaving a marketplace",
      useCase: "8–20% commission today",
      body: "Own the domain, the customer record and the SEO. Export your catalogue and customers any time — the exit door stays unlocked, which is the only honest reason to walk in.",
    },
    {
      id: "wholesale",
      name: "Wholesalers and distributors",
      useCase: "B2B, quote-first",
      body: "Tiered pricing, minimum order quantities enforced at the cart, and a request-a-quote flow ahead of checkout — so your trade buyers stop negotiating over a phone call you cannot audit.",
    },
    {
      id: "grocery",
      name: "Grocery and FMCG",
      useCase: "Small, frequent baskets",
      body: "Aisle-dense layouts, quick-add on every card and a sticky basket, because a 22-item order dies on a theme designed for three-item fashion carts.",
    },
    {
      id: "digital",
      name: "Digital and service sellers",
      useCase: "Courses, files, bookings",
      body: "Sell a downloadable file or a service slot with the same checkout, payment rails and invoice trail as a physical product. No second tool, no separate payout.",
    },
  ],
} as const satisfies { eyebrow: string; title: string; sub: string; cards: readonly AudienceCard[] };

/* -------------------------------------------------------------- objections */

export type Objection = { id: string; worry: string; answer: string };

/**
 * Risk reversal, stated as the merchant states it. Naming the objection in the
 * buyer's own words lowers resistance far more than a benefit restated louder;
 * every answer here is a commitment we can actually keep.
 */
export const OBJECTIONS = {
  eyebrow: "Before you commit",
  title: "The four things merchants ask us first.",
  sub: "Answered plainly, because a vague answer at this point costs you the sale you were about to make.",
  rows: [
    {
      id: "lock-in",
      worry: "\"What if I want to leave?\"",
      answer: "Export products, orders and customers to CSV or through the API whenever you like — including on the free trial. There is no export fee and no notice period.",
    },
    {
      id: "technical",
      worry: "\"I'm not technical — will I get stuck?\"",
      answer: "Setup is a form and a theme picker, not a deployment. If you do get stuck, support answers in Bangla, and a 20-minute walkthrough is free whether or not you ever pay us.",
    },
    {
      id: "cod",
      worry: "\"COD returns eat my margin.\"",
      answer: "Orders are risk-scored before you pay for a pickup, repeat non-receivers are flagged, and every COD taka is matched to the order that produced it when the courier settles.",
    },
    {
      id: "price",
      worry: "\"Will the price change once I depend on it?\"",
      answer: "Plan pricing is published on the pricing page, with no per-order commission at any tier. Growth in your sales does not quietly grow our invoice.",
    },
  ],
} as const satisfies { eyebrow: string; title: string; sub: string; rows: readonly Objection[] };
