/**
 * Content module for `/about` — src/routes/about.tsx renders this, never the
 * reverse. Pure data: no React, no JSX, so it can be unit-tested and diffed
 * against the copy deck (`docs/05-marketing/copy/10-about.md`) without a DOM.
 *
 * Placeholder discipline: the deck marks several facts as TEMPLATE / pending
 * confirmation (`{{founder_name}}`, `{{founding_date}}`, exact COD-share
 * citation, headcount, timeline dates). None of those tokens are reproduced
 * here — inventing a plausible-looking number or name would be worse than
 * omitting the band entirely, per Principle 1 ("Ship what's true"). The Team
 * band therefore ships as the deck's own confirmed fallback copy (Band 8,
 * "Fallback copy if the team is not yet ready to appear individually"), and
 * the Timeline band (Band 11) is omitted outright — the deck says not to
 * render it until at least three rows carry confirmed dates, and none do yet.
 */

export type Bilingual = { en: string; bn: string };

/* -------------------------------------------------------------------- hero */

export const ABOUT_HERO = {
  eyebrow: "Dhaka, Bangladesh",
  title: "Built in Dhaka, for the way Bangladesh actually sells.",
  titleBn: "ঢাকায় তৈরি, বাংলাদেশ যেভাবে বেচাকেনা করে তার জন্য।",
  sub: "Cash on delivery, mobile wallets and Bangla storefronts aren't edge cases we patched in. They're the starting assumption of every table in our database.",
  subBn:
    "ক্যাশ অন ডেলিভারি, মোবাইল ওয়ালেট আর বাংলা স্টোরফ্রন্ট আমাদের কাছে ব্যতিক্রম নয় — এগুলোই আমাদের ডেটাবেসের ভিত্তি।",
  primaryCta: "Read the origin thesis",
  altCta: "See open roles",
} as const;

/* ------------------------------------------------------------ origin thesis */

export const THESIS = {
  eyebrow: "The origin thesis",
  title: "Most commerce software wasn't built for this market.",
  paragraphs: [
    "Most commerce software sold into Bangladesh was designed somewhere a credit card is the default payment method, a national address system is machine-parseable, and the storefront's primary language uses a single case and no conjunct consonants. None of that describes this market. When that software arrives here, \"localisation\" means a currency symbol, a translated button label, and a cash-on-delivery module maintained as a bolt-on plugin, usually by a third party, usually behind on updates.",
    "That gap doesn't stay theoretical. It shows up as a merchant reconciling COD collections against courier remittance in a spreadsheet at midnight because the platform's ledger assumes every order clears through a payment gateway the moment it's placed. It shows up as a Bangla product title clipped mid-word because the theme's line-height was tuned for Latin ascenders and descenders, not for matras that need vertical room. It shows up as an SMS-OTP checkout flow built for a market where every customer has a stable email address and a laptop, in a market where the phone number *is* the identity and the checkout happens on a mid-range Android device over 3G.",
    "We didn't start Framique to add a \"Bangladesh mode\" to an existing platform. We started it because the mismatch is structural — it lives in the data model, not the UI chrome — and structural mismatches can't be fixed with a translation file.",
  ],
  closingClaim:
    "Every row in that table is a decision we made once, in the schema or the type system, so it doesn't have to be re-decided — or worked around — by every merchant, every day. That's the thesis: commerce infrastructure that fits this market has to be built from the transaction outward, not from a Western storefront inward with a translation layer stapled on.",
} as const;

export type MismatchRow = {
  id: string;
  assumption: string;
  reality: string;
  breaks: string;
  answer: string;
};

/** The Band 2 evidence table, rendered by MatrixTable. */
export const MISMATCH_ROWS: MismatchRow[] = [
  {
    id: "payment-clearing",
    assumption: "Payment clears at checkout via card/gateway",
    reality: "The large majority of ecommerce orders in this market are cash on delivery, settled by the courier days later",
    breaks: "Order status, revenue recognition and refund logic all assume a payment event that hasn't happened yet",
    answer:
      "Order state machine has a first-class cod_pending_settlement state; revenue and payout ledgers reconcile against courier remittance, not a gateway webhook",
  },
  {
    id: "payment-method",
    assumption: "\"Payment method\" = card or PayPal",
    reality: "Mobile financial services — bKash, Nagad, Rocket — are the dominant digital rail",
    breaks: "MFS bolted on as an unmaintained plugin; webhook retries and partial-capture edge cases silently drop",
    answer:
      "bKash/Nagad/Rocket are core payment adapters behind the same idempotent charge/refund/payout contract as cards — not a plugin tier",
  },
  {
    id: "address-model",
    assumption: "Address = street, city, state, ZIP, machine-geocoded",
    reality: "Many delivery addresses are landmark-based (\"beside X mosque, 2nd lane\") and courier-zone-based, not GPS-precise",
    breaks: "Checkout forces invalid ZIP formats or silently mis-routes to the wrong courier hub",
    answer: "Address model captures courier zone + landmark field as first-class, not a \"notes\" afterthought",
  },
  {
    id: "typography",
    assumption: "One script, one case, fixed line-height tuned for Latin",
    reality: "Bangla script: no case, conjuncts, matras that extend above/below the baseline",
    breaks: "Bangla headlines clip descenders; negative letter-spacing (right for Latin) breaks legibility",
    answer:
      "A bangla-display typography token: zero letter-spacing, 1.35+ line-box, applied automatically to any lang=\"bn\" subtree",
  },
  {
    id: "fulfilment",
    assumption: "Fulfilment = one integrated carrier API",
    reality: "Merchants route between Pathao, Steadfast, RedX, Sundarban and others by zone, cost and reliability, often per order",
    breaks: "Single-carrier integrations force merchants into a courier's economics, not their own",
    answer: "Courier layer is a multi-provider abstraction merchants configure and switch without replatforming",
  },
  {
    id: "support",
    assumption: "Merchant support = ticket queue in a time zone 10+ hours away",
    reality: "Merchants need same-business-day answers in Bangla during BST hours, often about a stuck COD parcel",
    breaks: "A long ticket SLA on a problem that's costing a merchant sales today",
    answer: "Support operates in BST, in Bangla and English, with COD/courier issues treated as P1",
  },
  {
    id: "vat",
    assumption: "Tax/VAT logic assumes one national scheme, English-only invoices",
    reality: "Bangladesh VAT rules and invoice formatting change by legal year and require Bangla-legible receipts",
    breaks: "Manual invoice patching every fiscal year",
    answer: "VAT computation versioned per legal year in the ledger, invoices render Bangla by default",
  },
];

/* --------------------------------------------------------- operating principles */

export type Principle = {
  id: string;
  title: string;
  forbids: string;
  produced: string;
};

/** Band 3 — 8 operating principles, each falsifiable against a real decision. */
export const PRINCIPLES: Principle[] = [
  {
    id: "ship-whats-true",
    title: "1. Ship what's true",
    forbids: "publishing a metric, a customer count or a feature name before it is queryable in production.",
    produced:
      "this site has no \"trusted by X merchants\" banner until that number is pulled from a live query, not typed by marketing.",
  },
  {
    id: "merchant-owns-data",
    title: "2. The merchant owns the data",
    forbids: "any export flow that is throttled, paywalled, or missing fields present in the UI.",
    produced:
      "a full-account export (orders, customers, products, ledger) ships as a background job any merchant can trigger from settings, no support ticket required.",
  },
  {
    id: "local-first",
    title: "3. Local first, not local only",
    forbids: "treating BDT/COD/bKash support as a checkbox that blocks international growth.",
    produced:
      "currency is currency_code + amount_minor_int from day one, so a merchant selling in BDT today can add a USD price list without a schema migration.",
  },
  {
    id: "boring-where-it-counts",
    title: "4. Boring where it counts",
    forbids: "\"creative\" solutions in money, auth or tenancy — the three places a clever shortcut becomes an incident.",
    produced:
      "Redis runs noeviction on purpose. A dropped idempotency key would mean a customer gets double-charged; we would rather page an engineer at 3 a.m. than silently retry a charge.",
  },
  {
    id: "bangla-not-translation",
    title: "5. Bangla is not a translation layer",
    forbids: "applying Latin type rules (negative tracking, Latin line-height) to Bangla text and calling it \"localised.\"",
    produced:
      "the bangla-display token drops letter-spacing to zero and enforces a 1.35+ line box automatically on any lang=\"bn\" subtree — a theme cannot ship a Bangla headline that clips a matra.",
  },
  {
    id: "cash-is-a-method",
    title: "6. Cash is a payment method, not an exception",
    forbids: "modelling COD as a workaround inside a payment system designed around instant gateway settlement.",
    produced:
      "cod_pending_settlement is a first-class order state with its own reconciliation view against courier remittance — not a manual spreadsheet a merchant keeps on the side.",
  },
  {
    id: "observability-is-a-feature",
    title: "7. Observability is a product feature, not an internal nicety",
    forbids:
      "shipping a feature merchants depend on without a metric, a log line and a trace a support engineer can use to answer \"what happened to my order\" in minutes, not days.",
    produced:
      "every checkout, payout and webhook path is instrumented with withSpan before it ships — the same instrumentation we use to debug is the one the on-call engineer opens when a merchant reports a stuck order.",
  },
  {
    id: "no-lock-in",
    title: "8. No lock-in, including ours",
    forbids: "architecture choices that only make sense if a merchant is stuck.",
    produced:
      "self-hostable stack (Supabase on plain Postgres, Redis with a Valkey swap path), exportable data, and no proprietary storefront markup that only renders inside our runtime.",
  },
];

export const PRINCIPLE_SAMPLE_BN = {
  title: "অ্যাকাউন্টের ডেটার মালিক মার্চেন্ট।",
  forbids: "নিষেধ করে: এক্সপোর্ট ফিচার সীমিত রাখা বা পেওয়াল দেওয়া।",
  produced: "ফলাফল: সেটিংস থেকে যেকোনো সময় সম্পূর্ণ ডেটা এক্সপোর্ট করা যায়, সাপোর্ট টিকিট ছাড়াই।",
} as const;

/* ----------------------------------------------------- engineering philosophy */

export type EngineeringCard = { id: string; title: string; body: string };

export const ENGINEERING_HEADING = "Infrastructure decisions we don't revisit per feature.";

export const ENGINEERING_CARDS: EngineeringCard[] = [
  {
    id: "tenant-isolation",
    title: "Tenant isolation is enforced by the database, not remembered by developers",
    body: "Every tenant table carries merchant_id; Postgres row-level security enforces isolation through security-definer helpers (is_merchant_member, has_merchant_role). Isolation is a test suite — negative assertions run on every release, not a code-review hope.",
  },
  {
    id: "vendor-lock-in",
    title: "Zero vendor lock-in, by architecture rather than by promise",
    body: "The application only ever reads SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY and REDIS_URL — nothing in the codebase names a hosting provider. The same code path runs in a managed preview environment and on our own servers in production.",
  },
  {
    id: "self-hostable",
    title: "Self-hostable end to end",
    body: "Postgres, Redis, payments aggregation, search and the full observability stack (Prometheus, Loki, Sentry, Grafana, Alertmanager) run as pinned, versioned services we operate ourselves — not managed SaaS with per-seat billing pressure on the tools we use to debug our own platform.",
  },
  {
    id: "swap-path",
    title: "Every runtime dependency has a documented swap path",
    body: "Supabase self-hosted is plain Postgres underneath — portable to bare Postgres and our own auth if ever required. Redis is noeviction-tuned but Valkey/KeyDB-compatible. Payments run through provider adapters behind one idempotent contract, so adding or removing a rail doesn't touch checkout code.",
  },
  {
    id: "exportable",
    title: "Merchant data is exportable in full, on demand",
    body: "Not a CSV of the three most common tables — a full-account export (orders, customers, products, inventory movements, ledger entries) triggerable from account settings without a support request.",
  },
  {
    id: "observability",
    title: "Observability is a product feature",
    body: "Every checkout, payout and webhook path emits metrics, structured logs with trace_id/span_id, and traces through withSpan — a support engineer follows a merchant's stuck order from a Grafana panel to a Loki line to a Sentry trace in three clicks, because we designed the correlation, not because we happened to log enough.",
  },
];

/* ------------------------------------------------------------- design philosophy */

export const DESIGN_PHILOSOPHY = {
  eyebrow: "Design philosophy",
  title: "Bangla typography set the constraints. The five themes are what fit inside them.",
  paragraphs: [
    "Type systems built for Latin scripts assume every glyph sits between a baseline and a cap-height, with predictable ascenders and descenders. Bangla doesn't work that way: matras extend above the headline, and conjunct consonants stack vertically in ways that need genuine room, not a squeezed line-height borrowed from a Helvetica-tuned design system. Apply Latin negative tracking to Bangla — the aggressive, confident tracking that makes an English headline feel sharp — and Bangla text becomes harder to read, not sharper. Matras clip. Conjuncts collide.",
    "So the type system doesn't have \"a Bangla mode.\" It has a rule: any display token applied inside a lang=\"bn\" subtree drops its letter-spacing to zero and enforces a 1.35+ line box, automatically, regardless of which theme a merchant has chosen. That single rule — decided once, in the type token layer — is why every storefront a merchant builds on Framique renders Bangla product names correctly without a merchant ever touching a CSS property.",
    "From that constraint, and from the range of retail formats we saw merchants actually running — a boutique with five products and heavy storytelling, a 2,000-SKU wholesale catalogue, a B2B distributor quoting in bulk — five official themes emerged, not as marketing skins but as different answers to \"how much room does this catalogue need, and how much of it is Bangla-first.\"",
  ],
} as const;

export type ThemeRow = { id: string; theme: string; builtFor: string; optimises: string; bangla: string };

export const THEME_ROWS: ThemeRow[] = [
  {
    id: "classic",
    theme: "Classic",
    builtFor: "General retail, balanced catalogue size",
    optimises: "Familiar grid, low cognitive load for first-time online shoppers",
    bangla: "Bangla display at 1.4 line-box, product names never truncated mid-conjunct",
  },
  {
    id: "modern",
    theme: "Modern",
    builtFor: "Fashion, lifestyle, visual-first brands",
    optimises: "Large imagery, minimal chrome, editorial pacing",
    bangla: "Bangla headlines sit in oversized display slots with the same zero-tracking rule, no shrink-to-fit hacks",
  },
  {
    id: "landing",
    theme: "Landing",
    builtFor: "Single-product launches, campaign pages",
    optimises: "One conversion path, no competing navigation",
    bangla: "Bangla CTA copy set at button-token line-height so wallet names (bKash, Nagad) never wrap awkwardly",
  },
  {
    id: "supershop",
    theme: "Supershop",
    builtFor: "High-SKU grocery/FMCG catalogues",
    optimises: "Dense grid, fast filtering, price-forward cards",
    bangla: "Tabular numerals for BDT prices sit flush against Bangla unit labels without baseline drift",
  },
  {
    id: "b2b",
    theme: "B2B",
    builtFor: "Wholesale, bulk-order, quote-driven merchants",
    optimises: "Tables, tiered pricing, MOQ logic front and centre",
    bangla: "Bangla and English render at matched optical size in the same pricing table row — no language hierarchy",
  },
];

/* ------------------------------------------------------- how we decide what to build */

export const PRIORITISATION = {
  eyebrow: "How we decide what to build",
  title: "A public framework, not a black box.",
  intro:
    "Every roadmap request — from a merchant support ticket, a sales conversation, or an internal engineering proposal — is scored against the same four weighted criteria before it enters a sprint. The scoring is public internally and the outcome is traceable: any merchant can ask why a feature they requested ranked where it did.",
  outro:
    "A request needs a combined score above the current sprint threshold to be scheduled; below-threshold requests stay logged and re-scored every planning cycle as reach or evidence changes — nothing is silently dropped. Money, tenancy and auth changes always carry an additional gate regardless of score: an audit trail, a rollback-tested migration, and a negative-assertion test suite before merge. This is also why the roadmap sometimes says no to a request that would be an easy \"yes\" for an imported platform with different constraints — structural fit outranks a fast yes.",
} as const;

export type ScoringRow = { id: string; criterion: string; weight: string; measures: string; example: string };

export const SCORING_ROWS: ScoringRow[] = [
  {
    id: "structural-fit",
    criterion: "Structural fit",
    weight: "35%",
    measures: "Does this fix a mismatch in the core data model, or does it patch a symptom?",
    example:
      "A cod_pending_settlement reconciliation view scores high; a one-off CSV export for one merchant's edge case scores low",
  },
  {
    id: "reach",
    criterion: "Reach",
    weight: "25%",
    measures: "How many merchants, across how many themes/tiers, does this unblock?",
    example: "A courier-abstraction improvement affecting all five themes outranks a single-theme cosmetic request",
  },
  {
    id: "reversibility",
    criterion: "Reversibility risk",
    weight: "20%",
    measures: "Can we ship it, learn, and adjust without breaking tenant isolation, money correctness or data portability?",
    example: "A new storefront section block is fast to reverse; a ledger schema change is not, and is scoped accordingly",
  },
  {
    id: "time-to-value",
    criterion: "Time-to-merchant-value",
    weight: "20%",
    measures: "Does this reduce a merchant's cost or reconciliation time within one release cycle, or is the payoff distant?",
    example: "Faster courier-status sync scores higher than a long-horizon bet with no proven demand yet",
  },
];

/* ---------------------------------------------------------- how we make money */

export const REVENUE = {
  eyebrow: "How we make money",
  title: "We make money when merchants sell more, not when they're stuck.",
  body: [
    "Framique's revenue comes from subscription tiers and a small percentage on payments processed through our in-house payments aggregation layer — the same layer that handles bKash, Nagad, Rocket, card and BNPL. We do not charge for data export, do not charge extra to unlock a merchant's own analytics, and do not take a cut of COD collections settled directly between a merchant and their courier.",
    "That alignment matters for a structural reason: a platform that earns more when a merchant is confused, locked in, or paying for a feature they can't turn off has every incentive to keep the interface complicated and the exit expensive. A platform whose revenue tracks a merchant's actual sales volume has the opposite incentive — churn and stagnation cost us directly, so the roadmap is scored, in part, against whether it grows a merchant's revenue, not just our own feature count.",
    "This is also why self-hosting and full data export aren't compliance checkboxes here — they are a commitment that a merchant's ability to leave stays real, which is the only thing that keeps a subscription-and-take-rate business honest over time.",
  ],
  bodyBn:
    "মার্চেন্ট যখন বেশি বিক্রি করে, আমরা তখনই বেশি আয় করি — মার্চেন্ট আটকে থাকলে নয়। ডেটা এক্সপোর্টে কোনো চার্জ নেই, নিজস্ব অ্যানালিটিক্স আনলক করতে বাড়তি খরচ নেই।",
} as const;

/* ----------------------------------------------------------------------- team */

/**
 * Band 8 (Team) ships with the deck's own confirmed fallback copy, because no
 * team member has a confirmed, consented name/role/photo to publish yet. The
 * deck is explicit: a template with invented names is worse than the
 * fallback paragraph, and a stale headcount reads as dishonest, so no number
 * appears here either.
 */
export const TEAM_FALLBACK = {
  title: "The people building this.",
  body:
    "We're a small team in Dhaka — engineering, merchant success and support — building infrastructure we'd want to run our own store on. Team profiles are going up here as people opt in to appear publicly. In the meantime, our careers section lists what we're hiring for, and our contact page reaches the team directly.",
} as const;

/* -------------------------------------------------------------------- careers */

export const CAREERS = {
  title: "We're hiring in Dhaka.",
  titleBn: "আমরা ঢাকায় নিয়োগ দিচ্ছি।",
  sub: "Engineering, merchant support and merchant success. Remote-friendly within Bangladesh; BST core hours.",
  subBn: "ইঞ্জিনিয়ারিং, মার্চেন্ট সাপোর্ট এবং মার্চেন্ট সাকসেস টিমে। বাংলাদেশের ভেতরে রিমোট-ফ্রেন্ডলি।",
  primaryCta: "See open roles",
  altCta: "Send a speculative note",
  screensFor: [
    "Comfort with the structural constraints named in the origin thesis — this isn't a \"port a Shopify clone\" job.",
    "Bangla writing and reading fluency for support, merchant success and content roles.",
    "For engineering: willingness to work close to money, tenancy and auth with real rigor — this is not the team for \"ship fast, fix later\" on the ledger.",
  ],
} as const;

/* -------------------------------------------------------------- never commitments */

export type NeverCommitment = { id: string; clause: string; rationale: string };

export const NEVER_COMMITMENTS: NeverCommitment[] = [
  {
    id: "sell-customer-data",
    clause: "We will never sell or broker merchant customer data.",
    rationale: "Analytics stay inside the merchant's own account; we don't monetize a second time on data collected for their storefront.",
  },
  {
    id: "lock-in-format",
    clause: "We will never lock storefront data into a format only our runtime can read.",
    rationale: "Exports are structured, documented and importable elsewhere.",
  },
  {
    id: "cod-paid-tier",
    clause: "We will never make COD or MFS payments a paid add-on tier.",
    rationale: "They are core payment rails, not premium features, because for this market they are not optional.",
  },
  {
    id: "unbacked-metric",
    clause: "We will never publish a metric on this site that isn't backed by a live, queryable number.",
    rationale: "See \"Ship what's true.\"",
  },
  {
    id: "ticket-to-export",
    clause: "We will never require a support ticket to export data or close an account.",
    rationale: "Both are self-service.",
  },
  {
    id: "latin-rules-on-bangla",
    clause: "We will never apply Latin typographic rules to Bangla text and call it localisation.",
    rationale: "See Design Philosophy.",
  },
  {
    id: "cod-cut",
    clause: "We will never take a cut of COD cash settled directly between a merchant and their courier.",
    rationale: "See How We Make Money.",
  },
  {
    id: "no-audit-trail",
    clause: "We will never ship a money, tenancy or auth change without an audit trail and negative-assertion tests.",
    rationale: "No exceptions for deadline pressure.",
  },
];

export const NEVER_SAMPLE_BN =
  "আমরা কখনও মার্চেন্টের কাস্টমার ডেটা বিক্রি বা শেয়ার করব না। অ্যানালিটিক্স মার্চেন্টের নিজস্ব অ্যাকাউন্টের ভেতরেই থাকে।";

/* --------------------------------------------------------------------- FAQ */

export const ABOUT_FAQ: { id: string; question: string; answer: string }[] = [
  {
    id: "bangladesh-only",
    question: "Is Framique only for merchants selling in Bangladesh?",
    answer:
      "No. BDT and Bangla are the defaults, not a ceiling — see \"Local first, not local only\" in our principles. Merchants can add other currencies and languages as they expand; nothing about the core schema assumes BDT-only.",
  },
  {
    id: "vs-cod-plugin",
    question: "How is this different from installing a COD plugin on Shopify or WooCommerce?",
    answer:
      "A plugin adds a field to a payment flow designed around instant gateway settlement. Framique's order state machine has cod_pending_settlement as a native state from the schema up, so reconciliation against courier remittance is a built-in view, not a spreadsheet a merchant maintains separately.",
  },
  {
    id: "data-export",
    question: "Can I export all my data if I decide to leave?",
    answer:
      "Yes, in full, on demand, from account settings — orders, customers, products, inventory movements and ledger entries — with no support ticket and no throttling.",
  },
  {
    id: "self-hostable",
    question: "Is Framique open source or self-hostable?",
    answer:
      "The platform is built on a self-hostable stack: Postgres via self-hosted Supabase, Redis, an in-house payments aggregator, and a self-hosted observability stack.",
  },
  {
    id: "couriers",
    question: "Which couriers does Framique support?",
    answer:
      "Multiple providers behind a single abstraction merchants configure and switch between by zone, cost and reliability — see Engineering Philosophy.",
  },
  {
    id: "themes-customizable",
    question: "Do I have to use one of the five official themes, or can I customize further?",
    answer:
      "The five themes (Classic, Modern, Landing, Supershop, B2B) are starting points tuned for different catalogue shapes; each is customizable within the shared token system.",
  },
  {
    id: "bangla-typography",
    question: "How does Bangla typography actually work under the hood — is it just a font swap?",
    answer:
      "No — it's a token rule: any display type applied inside a lang=\"bn\" subtree automatically zeroes letter-spacing and enforces a taller line box, regardless of theme.",
  },
  {
    id: "outage-payout",
    question: "What happens to my payout if bKash or a courier has an outage?",
    answer:
      "Idempotent charge/refund/payout contracts and a Redis noeviction policy mean a retry never becomes a duplicate transaction; if a dependency is down, we fail loudly and page an engineer rather than silently degrade correctness.",
  },
  {
    id: "roadmap-influence",
    question: "How do you decide what feature to build next — can I influence it?",
    answer:
      "Every request is scored against four public criteria (structural fit, reach, reversibility risk, time-to-merchant-value). Support and sales requests enter the same scoring queue as internal proposals — there isn't a separate, opaque list.",
  },
  {
    id: "who-owns",
    question: "Who actually owns and operates Framique, and where is the company based?",
    answer:
      "Legal entity, address and incorporation details are published on our contact page and in this page's Organization structured data.",
  },
];

export const ABOUT_FAQ_SAMPLE_BN = {
  question: "আমি যদি প্ল্যাটফর্ম ছেড়ে যেতে চাই, আমার সব ডেটা এক্সপোর্ট করতে পারব কি?",
  answer:
    "হ্যাঁ, সম্পূর্ণ ডেটা — অর্ডার, কাস্টমার, পণ্য, ইনভেন্টরি এবং লেজার — যেকোনো সময় অ্যাকাউন্ট সেটিংস থেকে এক্সপোর্ট করা যায়, কোনো সাপোর্ট টিকিট ছাড়াই।",
} as const;

/* --------------------------------------------------------------------- CTA */

export const ABOUT_CTA = {
  title: "See it running before you take our word for it.",
  body: "Walk through a live demo storefront and admin, or talk to the team about migrating from what you run today.",
  primaryCta: "See open roles",
  secondaryCta: "Talk to us",
} as const;
