/**
 * `/faq` copy contract — pure data, no React, no network.
 *
 * The page renders these exact strings and the route's `head()` builds the
 * `FAQPage` JSON-LD from the same array, so the answer a crawler reads is the
 * answer a visitor reads. Every claim here is one the platform actually keeps;
 * anything unverified belongs in a support conversation, not on this page.
 */

export type FaqQa = { id: string; question: string; answer: string };
export type FaqSection = { id: string; title: string; blurb: string; rows: readonly FaqQa[] };

export const FAQ_HERO = {
  eyebrow: "Answers before the sales call",
  title: "Framique, answered in plain language.",
  sub: "Pricing, payment settlement, cash on delivery, data ownership, compliance and support — the 24 questions merchants send us most, answered without a form in the way.",
  ctaPrimary: "Start free — no card",
  ctaSecondary: "Ask us something else",
} as const;

export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    blurb: "What the first afternoon actually looks like.",
    rows: [
      {
        id: "how-long",
        question: "How long does it take to open a store?",
        answer:
          "Most merchants have a live storefront on a Framique subdomain within an hour: sign up, name the store, pick a theme, add your first products. Connecting bKash or Nagad adds roughly ten minutes per rail because you paste merchant credentials you already hold.",
      },
      {
        id: "developer",
        question: "Do I need a developer?",
        answer:
          "No. Setup is a form and a theme picker — there is nothing to deploy, host or patch. A developer is only useful if you want to build a custom theme or call the REST API, and both are documented rather than gated behind a partner programme.",
      },
      {
        id: "migrate",
        question: "Can I move my existing products across?",
        answer:
          "Yes. Import a CSV of products, variants and stock counts, or push them through the API. Order history from another platform can be imported as records so your customer list and revenue reporting are not split across two tools.",
      },
      {
        id: "trial",
        question: "What is included in the free trial?",
        answer:
          "Fourteen days of the full platform — every theme, all payment rails in test mode, courier booking and the POS. No card is required to start, and the trial does not convert to a paid plan on its own.",
      },
      {
        id: "domain",
        question: "Can I use my own domain?",
        answer:
          "Yes. Point a .com.bd or any other domain at your store and Framique issues and renews the TLS certificate automatically. You keep ownership of the domain and can move it away at any point.",
      },
      {
        id: "bangla",
        question: "Is the storefront available in Bangla?",
        answer:
          "Bangla and English come from a single catalogue record, so one product carries both names, descriptions and slugs. There is no duplicate product tree and no translation plugin to drift out of date.",
      },
    ],
  },
  {
    id: "payments",
    title: "Payments and settlement",
    blurb: "Where the money lands and how it is matched.",
    rows: [
      {
        id: "rails",
        question: "Which payment methods are supported?",
        answer:
          "bKash, Nagad, Rocket, Upay, Visa and Mastercard through a card acquirer, bank transfer and cash on delivery — all in one checkout, and all reconciled against the order that produced them.",
      },
      {
        id: "commission",
        question: "Do you take a commission on my sales?",
        answer:
          "No. You pay your plan fee and nothing per order. Your payment provider and courier charge their own published rates directly to you; Framique does not mark them up or take a slice.",
      },
      {
        id: "settlement",
        question: "How does settlement reconciliation work?",
        answer:
          "Every gateway callback and settlement file is matched to the order that generated it, so an unmatched taka is flagged rather than quietly absorbed. You can see, per order, which rail paid, when it settled and what fee was deducted.",
      },
      {
        id: "payout",
        question: "Does Framique hold my money?",
        answer:
          "No. Funds move from your customer to your own merchant account with the payment provider. Framique records and reconciles the transaction; it is never in the payout path.",
      },
      {
        id: "refunds",
        question: "Can I issue partial refunds?",
        answer:
          "Yes — full or line-level refunds, with the refund written back against the original payment record so your revenue reporting and settlement view stay consistent.",
      },
    ],
  },
  {
    id: "cod",
    title: "Cash on delivery and fulfilment",
    blurb: "The part imported platforms get wrong.",
    rows: [
      {
        id: "cod-risk",
        question: "How do you reduce failed COD deliveries?",
        answer:
          "Every order is risk-scored before you pay for a pickup, using order value, address history, phone reuse and prior non-receipt. High-risk orders can be held for a confirmation call instead of shipped blind.",
      },
      {
        id: "blacklist",
        question: "Can I block repeat non-receivers?",
        answer:
          "Yes. Phone numbers and addresses with a history of refusing deliveries are flagged automatically, and you can maintain your own blocklist that applies across all your stores.",
      },
      {
        id: "couriers",
        question: "Which couriers can I book from inside Framique?",
        answer:
          "SteadFast, Pathao, RedX and Paperfly. Pickups are booked, labels printed and delivery status read inside the same order drawer — no second portal and no copy-pasted address.",
      },
      {
        id: "cod-cash",
        question: "How is COD cash matched to orders?",
        answer:
          "When the courier settles, each remitted amount is matched to the delivered order it belongs to, so a shortfall shows up as a named order rather than a gap in a spreadsheet.",
      },
    ],
  },
  {
    id: "pricing",
    title: "Pricing and plans",
    blurb: "What you pay, and what changes it.",
    rows: [
      {
        id: "plans",
        question: "How is Framique priced?",
        answer:
          "A flat monthly plan fee in BDT, published on the pricing page. Plans differ by staff seats, stores and feature depth — not by how much you sell.",
      },
      {
        id: "overage",
        question: "Will my bill grow if my sales grow?",
        answer:
          "Not automatically. There is no per-order fee at any tier, so a good month does not enlarge the invoice. You only move up a plan when you need more seats, stores or a specific capability.",
      },
      {
        id: "cancel",
        question: "Can I cancel at any time?",
        answer:
          "Yes, from the billing screen, with no notice period and no cancellation fee. Your data stays exportable through the end of the paid period.",
      },
      {
        id: "vat",
        question: "Do you issue a VAT invoice?",
        answer:
          "Yes. Every payment produces a dated invoice with your business name and BIN where you have supplied one, downloadable as a PDF from the billing screen.",
      },
    ],
  },
  {
    id: "data",
    title: "Data, security and compliance",
    blurb: "Who can see what, and how you leave.",
    rows: [
      {
        id: "export",
        question: "Can I export my data?",
        answer:
          "Products, orders, customers and invoices export to CSV, or through the REST API, at any time — including during the free trial. There is no export fee and no lock-in clause.",
      },
      {
        id: "isolation",
        question: "How is my data kept separate from other merchants?",
        answer:
          "Every table is scoped by merchant and enforced in the database with Postgres row-level security, so isolation does not depend on application code remembering a filter. API keys are scoped per store and per permission.",
      },
      {
        id: "cards",
        question: "Do you store card numbers?",
        answer:
          "No. Card details are captured by the acquirer's hosted flow and never reach Framique servers, which keeps card data out of scope for your business as well as ours.",
      },
      {
        id: "certification",
        question: "Are you certified against a compliance standard?",
        answer:
          "We publish the controls we operate on the security page and do not claim a certification we do not hold. If your procurement team needs specific documentation, ask us and we will tell you plainly what exists today.",
      },
      {
        id: "legal",
        question: "Where are the terms, privacy and refund policies?",
        answer:
          "All of them live on the legal page, versioned and dated in Bangla and English, so you can see exactly which version applied on any given day.",
      },
    ],
  },
  {
    id: "support",
    title: "Support and reliability",
    blurb: "Who answers, when, and in which language.",
    rows: [
      {
        id: "support-hours",
        question: "How do I reach support?",
        answer:
          "Phone, email and in-dashboard chat during published business hours, answered in Bangla or English by people who work on the platform rather than a script-reading outsourced tier.",
      },
      {
        id: "walkthrough",
        question: "Can someone walk me through it?",
        answer:
          "Yes — a 20-minute guided walkthrough is free whether or not you ever pay us. Book it from the contact page and bring your actual catalogue.",
      },
      {
        id: "uptime",
        question: "What happens if the platform goes down?",
        answer:
          "Storefront, checkout, payment and admin health are published live on the status page along with the incident log, so you find out from us rather than from a customer.",
      },
    ],
  },
] as const;

/** Flat list used for the FAQPage JSON-LD and the on-page search index. */
export const FAQ_ALL: readonly FaqQa[] = FAQ_SECTIONS.flatMap((section) => section.rows);

export const FAQ_CTA = {
  title: "Still deciding?",
  sub: "Ask the question that is actually blocking you — a person answers, usually the same working day.",
  ctaPrimary: "Talk to us",
  ctaSecondary: "See pricing",
  note: "14-day free trial · no card required · export your data any time",
} as const;
