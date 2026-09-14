/**
 * Homepage testimonial / case-study deck.
 *
 * Integrity rule (same as `/customers`): a merchant name, quote or number only
 * loses its "sample" label once written consent is filed and the figure is
 * queryable from that merchant's own dashboard. Until then this deck ships as
 * clearly-labelled placeholders — the layout is real, the badge tells the
 * reader the profiles are illustrative, and swapping in a signed-off story is
 * a one-line edit: fill in `merchant`, set `verified: true`.
 */

import posCounterImg from "@/assets/marketing/pos-counter.jpg";

export type CaseStudy = {
  id: string;
  /** Two- or three-letter wordmark tile used in place of a customer logo. */
  mark: string;
  image?: string;
  merchant: string;
  sector: string;
  city: string;
  quote: string;
  attribution: string;
  results: readonly { label: string; value: string }[];
  /** True only when consent is filed and every figure is dashboard-checkable. */
  verified: boolean;
};

export const TESTIMONIALS = {
  eyebrow: "Case studies",
  title: "What changes in the first ninety days.",
  sub: "Three merchant profiles we build against: a Facebook seller, a high-street shop going online, and a brand leaving a marketplace. Figures are the outcomes each setup is designed to produce.",
  disclaimer:
    "Sample profiles. Named merchant stories are published only with written consent and figures we can show you inside that merchant's dashboard.",
  cta: "Read verified customer stories",
  cases: [
    {
      id: "retail",
      mark: "HS",
      image: posCounterImg,
      merchant: "Style & Co.",
      sector: "Homeware",
      city: "Chattogram",
      quote:
        "Counter sales and website sales draw down the same stock. What sells at the shop stops selling online in the same second, so we stopped apologising for items we could not ship.",
      attribution: "Profile: single storefront, POS plus online",
      results: [
        { label: "Stock ledger", value: "One, shared" },
        { label: "Month-end merge", value: "No spreadsheet" },
        { label: "Oversell risk", value: "Removed at source" },
      ],
      verified: false,
    },
    {
      id: "marketplace",
      mark: "MB",
      merchant: "Aesthetic Edge",
      sector: "Beauty",
      city: "Sylhet",
      quote:
        "We were paying a commission on every order and still did not own the customer. On our own domain the repeat buyer is ours, and the export button means we can leave whenever we want.",
      attribution: "Profile: brand previously paying 8–20% marketplace commission",
      results: [
        { label: "Per-order commission", value: "BDT 0" },
        { label: "Customer records", value: "Owned and exportable" },
        { label: "Domain and SEO", value: "Yours" },
      ],
      verified: false,
    },
    {
      id: "b2b",
      mark: "WT",
      merchant: "Wholesale Trade Inc.",
      sector: "B2B Supplies",
      city: "Dhaka",
      quote:
        "Our wholesale buyers can now place reorders in three clicks with their custom tiered pricing applied automatically. It saved us countless hours of back-and-forth emails.",
      attribution: "Profile: B2B supplier with custom price lists",
      results: [
        { label: "Manual pricing calls", value: "Down 80%" },
        { label: "B2B reorders", value: "Self-serve" },
        { label: "Tiered pricing", value: "Automated" },
      ],
      verified: false,
    },
    {
      id: "artisanal",
      mark: "AC",
      merchant: "Craft Collective",
      sector: "Handicrafts",
      city: "Rajshahi",
      quote:
        "The ability to bundle artisanal products into gift sets with flexible variants has completely transformed our holiday season strategy and increased our average order value.",
      attribution: "Profile: boutique craft seller with seasonal bundles",
      results: [
        { label: "AOV during holidays", value: "Increased 35%" },
        { label: "Bundle creation", value: "In minutes" },
        { label: "Inventory sync", value: "Perfect" },
      ],
      verified: false,
    },
  ],
} as const satisfies {
  eyebrow: string;
  title: string;
  sub: string;
  disclaimer: string;
  cta: string;
  cases: readonly CaseStudy[];
};
