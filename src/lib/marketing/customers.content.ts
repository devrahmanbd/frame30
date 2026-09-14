/**
 * `/customers` copy — sourced verbatim from docs/05-marketing/copy/07-customers.md.
 *
 * This module is the single place the page's words live. It is deliberately
 * NOT allowed to contain a testimonial, a metric, a founder name or a photo:
 * the copy deck's integrity rule is "no number ships that isn't queryable
 * from that merchant's own dashboard by an internal reviewer" and today this
 * codebase has no consented-story pipeline wired up, so every "story" slot on
 * this page is either filled from the live `articles` table (via
 * `getLanding`) or rendered as an honest empty state — never a placeholder
 * dressed up as a real merchant. See the route file for how that split is
 * enforced at render time.
 *
 * Pure data: no React, no JSX, no network calls.
 */

export type Bilingual = { en: string; bn?: string };

/* -------------------------------------------------------------------- */
/* 1. Hero                                                                */
/* -------------------------------------------------------------------- */

export const HERO = {
  eyebrow: { en: "Consented stories · verified numbers", bn: "সম্মতিপ্রাপ্ত গল্প · যাচাইকৃত সংখ্যা" },
  title: "Stores that grew on Framique.",
  titleBn: "যেসব দোকান ফ্রেমিকে বেড়ে উঠেছে।",
  sub: "Real merchants, real numbers, real receipts. If we can't show you where a figure came from, it doesn't go on this page.",
  subBn: "প্রকৃত ব্যবসায়ী, প্রকৃত সংখ্যা, প্রকৃত রসিদ। কোনো সংখ্যার উৎস দেখাতে না পারলে, সেটা এই পাতায় থাকে না।",
  ctaPrimary: "Read the stories",
  ctaSecondary: "Start free — no card",
} as const;

/* -------------------------------------------------------------------- */
/* 2. The proof standard                                                  */
/* -------------------------------------------------------------------- */

export const PROOF_STANDARD = {
  eyebrow: "How we build this page",
  title: "The proof standard",
  sub: "Three commitments, held before a single story is written — so no reader has to take our word for what's checkable.",
  commitments: [
    {
      id: "consent",
      title: "Written consent, every time",
      body: "We email the merchant a consent form naming the exact figures, quote and photo we intend to publish. We do not publish until we get an explicit yes back, dated and filed.",
      breaks: "Publishing from a call transcript, or a metric the merchant didn't sign off on individually.",
    },
    {
      id: "dashboard",
      title: "Dashboard-sourced numbers only",
      body: "Every metric on a story card maps to a query an internal reviewer ran against that merchant's own analytics — order count, return rate, time-to-publish, GMV band. The source table and date range are named in a footnote.",
      breaks: "Self-reported numbers from a WhatsApp message, or numbers that can't be re-run.",
    },
    {
      id: "photos",
      title: "No fabricated people or photos",
      body: "Every founder photo is either the merchant's own (with consent) or the card ships with no photo — never a stock image standing in for a real person.",
      breaks: "Stock photography with a fabricated name, or an AI-generated \"founder\" headshot.",
    },
  ],
} as const;

/* -------------------------------------------------------------------- */
/* 3 & 4. Featured story + story grid — empty-state copy                 */
/* -------------------------------------------------------------------- */

export const STORY_SECTION = {
  eyebrow: "Case studies",
  title: "Read the stories",
  sub: "Every card below is a published article, sourced live — nothing here is written for this page alone.",
  // Shown only when the loader returns zero published stories. This is the
  // deck's own instruction for section 3: "this band is empty ... rather
  // than shipping placeholder copy dressed up as real."
  emptyTitle: "No stories have cleared the checklist yet.",
  emptyBody:
    "We publish a story only once it has written consent, independently re-queried numbers and a verbatim quote — see the proof standard above. Check back, or start free today and you could be one of the first.",
  cardCta: "Read the story",
} as const;

/* -------------------------------------------------------------------- */
/* 5. Segment archetypes                                                 */
/* -------------------------------------------------------------------- */

export type Archetype = {
  id: string;
  segment: string;
  theme: "Classic" | "Modern" | "Landing" | "Supershop" | "B2B";
  aov: string;
  catalogue: string;
  codShare: string;
  failureModes: string[];
  metrics: string[];
  plan: string;
  bnNote: string;
};

export const ARCHETYPES_INTRO = {
  eyebrow: "Recognise your own shop",
  title: "Five segment archetypes, matched to the five official themes",
  sub: "Operating profiles, not case studies — the range of numbers a healthy shop in that segment typically shows, drawn from category norms rather than attributed to a named merchant.",
} as const;

export const ARCHETYPES: Archetype[] = [
  {
    id: "fashion",
    segment: "Fashion boutique",
    theme: "Modern",
 aov: "BDT 800 – BDT 3,500 average order value",
    catalogue: "40–300 SKUs, frequent turnover (new drops every 1–3 weeks)",
    codShare: "55–75% cash on delivery — trust still being built with new buyers",
    failureModes: [
      "Size/fit returns eating margin",
      "Stockouts on the SKU driving the ad click",
      "Catalogue photos inconsistent across drops",
    ],
    metrics: ["Return rate by size/variant", "Ad-click-to-checkout conversion", "Restock lead time"],
    plan:
      "30-day plan: audit return reasons by variant, add a size guide to every product template, re-shoot the ten highest-return SKUs, set low-stock alerts on the SKUs driving 80% of traffic, then compare return rate and conversion against the week-1 baseline.",
    bnNote:
      "প্রোডাক্ট টাইটেল ও সাইজ লেবেলে বাংলা সংস্করণ থাকা উচিত (M/L/XL এর পাশে মিডিয়াম/লার্জ/এক্সট্রা লার্জ) — ফিট নিয়ে অনিশ্চয়তাই যেখানে বাংলা-প্রথম ক্রেতারা চেকআউট না করে হোয়াটসঅ্যাপে প্রশ্ন করে বসেন।",
  },
  {
    id: "neighbourhood",
    segment: "Neighbourhood shop (mudir dokan)",
    theme: "Classic",
 aov: "BDT 200 – BDT 900 average order value",
    catalogue: "100–600 SKUs, low turnover, high repeat-purchase overlap",
    codShare: "80–95% cash on delivery — established local trust, cash habit",
    failureModes: [
      "Manual price updates lag supplier price changes",
      "No visibility into which SKUs are profitable after courier cost",
      "Repeat customers still calling in orders instead of using the storefront",
    ],
    metrics: ["Repeat-purchase rate", "Net margin after courier cost per order", "Phone-order share vs storefront-order share"],
    plan:
      "30-day plan: flag SKUs where shelf price hasn't moved in 60+ days, compute per-order courier cost against AOV for the bottom 20% margin SKUs, send existing phone-order customers a pre-filled storefront link, then compare phone-order share against the week-1 baseline.",
    bnNote:
      "এই সেগমেন্ট সবচেয়ে বেশি বাংলা-প্রথম হতে পারে — প্রোডাক্টের নাম, ক্যাটাগরি ও স্টোরফ্রন্ট নিজেই ডিফল্টে বাংলা হওয়া উচিত, ইংরেজি টগল হিসেবে থাকুক, উল্টোটা নয়।",
  },
  {
    id: "single-product",
    segment: "Single-product drop",
    theme: "Landing",
 aov: "BDT 500 – BDT 4,000, single price point or narrow variant set",
    catalogue: "1–5 SKUs, campaign-driven, time-boxed",
    codShare: "40–60% cash on delivery — often ad-driven, colder traffic",
    failureModes: [
      "Checkout drop-off from missing trust signals on a brand-new domain",
      "Ad spend outpacing fulfilment capacity, causing delivery delays",
      "No plan for traffic after the drop sells out",
    ],
    metrics: ["Landing-page-to-checkout conversion", "Refund/return rate in the first 14 days", "Sell-out-to-restock gap"],
    plan:
      "30-day plan: instrument the page to see where visitors drop before checkout, cap ad spend to confirmed fulfilment capacity, pre-build a \"sold out — notify me\" state before the drop, then measure conversion and refund rate against the week-1 baseline.",
    bnNote:
      "কাউন্টডাউন ও স্টক-স্বল্পতার কপি অবশ্যই বাস্তব হতে হবে (আসল স্টক সংখ্যা, আসল সময়) — একটি বাড়িয়ে বলা \"৩টি বাকি\" কাউন্টার এই সেগমেন্টের ক্রেতাদের চিরতরে হারানোর সবচেয়ে দ্রুততম উপায়।",
  },
  {
    id: "grocery",
    segment: "Grocery / daily essentials",
    theme: "Supershop",
 aov: "BDT 600 – BDT 2,200, high basket-item count",
    catalogue: "500–3,000+ SKUs, high restock frequency, perishables mixed with shelf-stable",
    codShare: "60–80% cash on delivery",
    failureModes: [
      "No clear customer-facing rule for out-of-stock substitutions",
      "Delivery-window mismatches for perishables",
      "Search/category structure too shallow for basket sizes this large",
    ],
    metrics: ["Basket completion rate (started vs paid)", "Substitution acceptance rate", "Delivery-window adherence"],
    plan:
      "30-day plan: write one substitution policy and apply it consistently, separate perishable and non-perishable delivery windows, rebuild category depth around the top ten basket combinations, then compare basket completion rate against the week-1 baseline.",
    bnNote:
      "সার্চ, ফিল্টার ও কার্ট লাইন আইটেম জুড়ে একক ও পরিমাণের ভাষা (কেজি, লিটার, পিস, প্যাকেট) সামঞ্জস্যপূর্ণ হতে হবে — চেকআউটে ইউনিট-অসঙ্গতির বিভ্রান্তিতে গ্রোসারি সবচেয়ে বেশি সংবেদনশীল।",
  },
  {
    id: "b2b",
    segment: "Wholesale / B2B",
    theme: "B2B",
 aov: "BDT 15,000 – BDT 500,000+, highly variable by buyer tier",
    catalogue: "50–1,000 SKUs, often with tiered/negotiated pricing per buyer",
    codShare: "5–20% cash on delivery — invoice/bank-transfer and credit terms dominate",
    failureModes: [
      "No self-serve reorder path; every repeat order still goes through a call",
      "Price lists out of sync between quotes and what the storefront shows",
      "No audit trail for who approved a large order internally",
    ],
    metrics: ["Reorder rate without a sales call", "Quote-to-order lead time", "Price-list sync lag"],
    plan:
      "30-day plan: check how many of your top ten repeat buyers' last three orders went through a call versus self-serve, fix the most-quoted SKU category's pricing sync first, add an internal-approval note field to the order flow, then measure reorder-without-a-call rate against the week-1 baseline.",
    bnNote:
      "B2B ক্রেতারা প্রায়ই আলোচনার মাঝে ভাষা পাল্টান (ফোনে বাংলা, পিও-তে ইংরেজি) — স্টোরফ্রন্ট থেকে তৈরি প্রোডাক্ট ও প্রাইসিং ডকুমেন্ট দুই ভাষাতেই সাপোর্ট করা উচিত, ক্রেতাকে জিজ্ঞেস না করেই।",
  },
];

/* -------------------------------------------------------------------- */
/* 6. Metric definitions                                                 */
/* -------------------------------------------------------------------- */

export const METRIC_DEFINITIONS_INTRO = {
  eyebrow: "Compute it yourself",
  title: "Metric definitions",
  sub: "Every metric used anywhere on this page or in any published story is defined here, so a reader can compute the same number for their own shop and check our math.",
} as const;

export type MetricDefinition = {
  id: string;
  metric: string;
  formula: string;
  source: string;
  mistake: string;
};

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  { id: "aov", metric: "AOV (average order value)", formula: "Total order value ÷ number of orders, for a stated period", source: "Analytics → Orders → Summary", mistake: "Including cancelled/refunded orders inflates or deflates this — state whether they're excluded" },
  { id: "cod", metric: "COD share", formula: "COD orders ÷ total orders, for a stated period", source: "Analytics → Payments → Method breakdown", mistake: "Comparing COD share across periods with different promo mixes" },
  { id: "return", metric: "Return rate", formula: "Returned units ÷ shipped units, for a stated period", source: "Analytics → Fulfilment → Returns", mistake: "Measuring by order count instead of unit count hides partial returns" },
  { id: "repeat", metric: "Repeat-purchase rate", formula: "Customers with 2+ orders ÷ total customers, for a stated cohort window", source: "Analytics → Customers → Cohorts", mistake: "An unbounded \"all time\" window flatters any shop the longer it's been open" },
  { id: "basket", metric: "Basket completion rate", formula: "Orders paid ÷ carts started, for a stated period", source: "Analytics → Funnels → Checkout", mistake: "Excluding abandoned carts under a minimum value quietly inflates the rate" },
  { id: "ttp", metric: "Time-to-publish", formula: "Days from signup to first live, purchasable product", source: "Analytics → Store → Setup timeline", mistake: "Counting from \"account created\" instead of \"serious onboarding started\"" },
  { id: "margin", metric: "Net margin after courier cost", formula: "(Order value − COGS − courier cost) ÷ order value", source: "Analytics → Finance → Order profitability", mistake: "Using a flat estimated courier cost instead of the actual charged rate per zone" },
  { id: "sub", metric: "Substitution acceptance rate", formula: "Substituted-item orders accepted ÷ substituted-item orders offered", source: "Analytics → Fulfilment → Substitutions", mistake: "Counting silent non-response as acceptance rather than its own category" },
  { id: "quote", metric: "Quote-to-order lead time", formula: "Days from quote sent to order confirmed, median not mean", source: "Analytics → B2B → Quotes", mistake: "Using a mean skews heavily on one slow enterprise negotiation" },
  { id: "sync", metric: "Price-list sync lag", formula: "Days between a price change saved and it reflecting on every buyer-facing surface", source: "Analytics → B2B → Pricing audit log", mistake: "Treating \"saved\" and \"published\" as the same event" },
];

/* -------------------------------------------------------------------- */
/* 7. How to write your own case study                                   */
/* -------------------------------------------------------------------- */

export const CASE_STUDY_GUIDE = {
  eyebrow: "For merchants",
  title: "How to write your own case study",
  sub: "A short, honest framework any merchant can use for their own marketing, investor updates, or a Framique submission.",
  steps: [
    {
      id: "one-pair",
      title: "Pick one before/after pair, not five.",
      body: "A case study with one clear mechanism (\"we added a size guide, returns dropped\") is more credible and more useful than a list of everything that improved, because a reader can't tell which change caused what in a list of five.",
    },
    {
      id: "baseline",
      title: "State the period and the baseline.",
      body: "\"Return rate fell\" means nothing without \"from 18% to 11%, comparing the 30 days before the change to the 30 days after.\" Assume any period-free case study is cherry-picked.",
    },
    {
      id: "mechanism",
      title: "Separate correlation from mechanism.",
      body: "If return rate fell in the same month you also ran a sale, you have two changes and one result — either isolate the change (A/B it), or say plainly that two things changed at once and which you believe mattered more, and why.",
    },
    {
      id: "quote",
      title: "Quote yourself accurately.",
      body: "Write down what you actually think, not what sounds best. A specific, slightly awkward sentence reads as more real than a polished one.",
    },
    {
      id: "decide",
      title: "Decide what you won't publish.",
      body: "Every honest case study has a number that looks bad next to the good ones. Deciding in advance what stays private is not dishonesty — publishing a number you don't understand yet, to look impressive, is.",
    },
  ],
  checklist: [
    "Can I point to the exact dashboard screen this number came from?",
    "Have I named the time period?",
    "Would this number survive someone else re-running the query?",
    "Is the \"before\" state something that was actually true, not a strawman?",
    "If I removed the adjectives from this paragraph, would the facts still make the point?",
  ],
} as const;

/* -------------------------------------------------------------------- */
/* 8. Proof-of-platform                                                  */
/* -------------------------------------------------------------------- */

export const PROOF_OF_PLATFORM = {
  eyebrow: "Verifiable, not decorative",
  title: "Proof of platform",
  sub: "The figures below are read live from the platform's own database at request time — the same rule as everywhere else on this page: a number ships only if it's queryable, or it doesn't ship at all.",
  statusNote:
    "For live status, incident history and a trailing uptime log, see the status page — it is never hardcoded here, because a static uptime claim on a marketing page is exactly the kind of number this page refuses to print.",
  statusCta: "View platform status",
} as const;

/* -------------------------------------------------------------------- */
/* 9. Submit your story                                                  */
/* -------------------------------------------------------------------- */

export const SUBMIT_STORY = {
  title: "Want your store in this grid?",
  titleBn: "আপনার দোকান কি এই তালিকায় থাকতে চান?",
  sub: "Start free, and if it works out, we'll ask you — never before, and never without this checklist.",
  subBn: "বিনামূল্যে শুরু করুন, এবং কাজ করলে আমরা জিজ্ঞেস করব — তার আগে নয়।",
  ctaPrimary: "Submit your story",
  ctaSecondary: "Start free — no card",
  checklist: [
    "You've reviewed the exact numbers we intend to publish, sourced from your own dashboard",
    "You've reviewed the exact quote we intend to publish, and confirmed it's your words",
    "You've told us about any number or detail you'd rather we didn't include",
    "You've approved the specific photo we intend to use, if any — or approved that we publish with no photo",
    "You know who at your business has final sign-off, and they've seen the draft",
    "You know you can ask us to take the story down later, and how to reach us to do it",
  ],
} as const;

/* -------------------------------------------------------------------- */
/* 10. FAQ                                                                */
/* -------------------------------------------------------------------- */

export const FAQ = [
  {
    id: "select",
    question: "How do you decide which stories to publish?",
    answer:
      "We publish stories where the merchant has given written consent, the numbers can be independently re-queried against their dashboard, and the quote is verbatim. We don't select stories to fit a target narrative — we select stories that clear the checklist.",
  },
  {
    id: "paid",
    question: "Do merchants get paid or discounted for appearing here?",
    answer:
      "No. Appearing on this page is never a condition of pricing, and we don't offer incentives for participation, so the stories reflect what merchants would say anyway.",
  },
  {
    id: "stale",
    question: "What if a number changes after the story is published?",
    answer:
      "Every story has a review date. If a metric materially changes, we update or retire the card — we don't leave stale numbers live indefinitely.",
  },
  {
    id: "takedown",
    question: "Can a merchant ask us to take a story down?",
    answer:
      "Yes, at any time, for any reason, without needing to justify it. We remove it promptly and don't keep it live \"just archived\" somewhere findable.",
  },
  {
    id: "ratings",
    question: "Why don't you show ratings or star reviews on this page?",
    answer:
      "Because we don't yet have a verified review corpus we can stand behind with the same rigour as the rest of this page. We'll add review data only when we can source and verify it the same way we source everything else here.",
  },
  {
    id: "archetypes",
    question: "Are the segment archetypes real merchants?",
    answer:
      "No — they're operating profiles built from category norms, explicitly labelled as such, so readers can benchmark their own shop without us attributing invented numbers to a named business.",
  },
  {
    id: "cherry-pick",
    question: "How do I know a metric on this page isn't cherry-picked?",
    answer:
      "Every metric definition is public above, with the formula and the dashboard location — if you think a number is misleading, you can ask us exactly how it was computed, and we'll show our work.",
  },
  {
    id: "verified",
    question: "What counts as \"verified\" internally?",
    answer:
      "A named reviewer, other than the story's writer, re-runs the underlying query against the merchant's dashboard within 7 days of publish and initials the record.",
  },
  {
    id: "framework",
    question: "Can I use the case-study framework for my own business, unrelated to Framique?",
    answer: "Yes — it's a general framework for honest before/after writing, not specific to our platform.",
  },
  {
    id: "modest",
    question: "What happens if a merchant's numbers genuinely aren't impressive?",
    answer:
      "We either don't publish, or we publish the honest range with context — we don't inflate a modest result to make it \"story-worthy.\" A believable, modest story is worth more to future readers than an implausible, flattering one.",
  },
] as const;

/* -------------------------------------------------------------------- */
/* 11. Final CTA                                                         */
/* -------------------------------------------------------------------- */

export const FINAL_CTA = {
  title: "Want your store in this grid?",
  titleBn: "আপনার দোকান কি এই তালিকায় থাকতে চান?",
  sub: "Start free, and if it works we'll ask you — never before.",
  subBn: "বিনামূল্যে শুরু করুন — কাজ করলে আমরা জিজ্ঞেস করব, তার আগে নয়।",
  primary: "Start free — no card",
  secondary: "Talk to sales",
} as const;
