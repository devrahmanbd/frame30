/**
 * `/fulfilment` copy — a pure data module.
 *
 * This file is the typed transcription of `docs/05-marketing/copy/06-fulfilment.md`.
 * It owns strings and structured records only: no React, no JSX, no server
 * imports, no invented numbers. The route file (`src/routes/fulfilment.tsx`)
 * is the only consumer, and it renders every entry here verbatim so the FAQ
 * passed into `buildGraph` for the FAQPage JSON-LD can never drift from what
 * a visitor (or a crawler) actually reads on the page.
 *
 * Courier *names* are deliberately NOT duplicated here — they already live in
 * the courier registry (`CARRIER_PROFILES` in `src/lib/courier-adapters.server.ts`),
 * which is the single source of truth the product itself reads from. The
 * route loader reads that registry (server-side only, since it lives in a
 * `.server.ts` module) and merges it with the SLA/coverage copy below, keyed
 * by the same `code` field, so a courier rename in the product never leaves
 * this marketing page holding a stale name.
 */

import type { Bilingual } from "@/lib/marketing-seo";

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

export const hero = {
  eyebrow: "Four couriers · one drawer",
  title: "From order to doorstep, tracked.",
  titleBn: "অর্ডার থেকে দোরগোড়া পর্যন্ত, ট্র্যাক করা অবস্থায়।",
  sub:
    "Courier labels, pickups and delivery status without leaving the dashboard. No courier panel logins, no spreadsheet, no copy-pasted tracking numbers.",
  subBn: "কুরিয়ার লেবেল, পিকআপ আর ডেলিভারি স্ট্যাটাস — ড্যাশবোর্ড ছাড়া কোথাও যেতে হবে না।",
  primaryCta: "Book a walkthrough",
  altCta: "See supported couriers",
} as const;

/* -------------------------------------------------------------------------- */
/* §2 Courier wall (marquee) + §5.2 SLA reference table                       */
/* -------------------------------------------------------------------------- */

/** Caption line under the courier wall. */
export const courierWallNote =
  "One credential per courier, entered once in Settings → Couriers. Nothing to re-key per order.";

/**
 * §5.2 reference comparison table, keyed by the same `code` the courier
 * registry uses (steadfast / pathao / redx / paperfly), plus a synthetic
 * `manual` row for the "own rider" option the deck treats as first-class.
 * Values are the couriers' published terms as shown in the deck — not a
 * Framique guarantee — which is why every cell is prose, never a number
 * dressed up as measured data.
 */
export type CourierSlaRow = {
  code: string;
  insideDhaka: string;
  outsideDhaka: string;
  cutoff: string;
  remittance: string;
  returnWindow: string;
};

export const courierSlaRows: CourierSlaRow[] = [
  {
    code: "steadfast",
    insideDhaka: "Full metro",
    outsideDhaka: "Wide, most districts",
    cutoff: "Same-day if booked before contracted cut-off",
    remittance: "Weekly, per your contract",
    returnWindow: "Per courier policy",
  },
  {
    code: "pathao",
    insideDhaka: "Full metro",
    outsideDhaka: "Major districts",
    cutoff: "Same-day, tight cut-off",
    remittance: "Weekly or twice-weekly, per your contract",
    returnWindow: "Per courier policy",
  },
  {
    code: "redx",
    insideDhaka: "Full metro",
    outsideDhaka: "Wide, most districts",
    cutoff: "Same-day if booked before contracted cut-off",
    remittance: "Weekly, per your contract",
    returnWindow: "Per courier policy",
  },
  {
    code: "paperfly",
    insideDhaka: "Full metro",
    outsideDhaka: "Widest rural reach, per operator claims",
    cutoff: "Next-day standard",
    remittance: "Weekly, per your contract",
    returnWindow: "Per courier policy",
  },
  {
    code: "manual",
    insideDhaka: "Your defined zone",
    outsideDhaka: "N/A",
    cutoff: "Your own SOP",
    remittance: "Same-day cash-in-hand",
    returnWindow: "Your own policy",
  },
];

/** The deck's fifth, first-class tile — not in the product's courier registry. */
export const manualCourier = { name: "Manual / own rider", nameBn: "নিজস্ব রাইডার" } as const;

export const courierSlaNote =
  "Values are couriers' published terms shown for comparison — not a Framique guarantee, and not a substitute for your signed contract.";

/* -------------------------------------------------------------------------- */
/* §3 Order lifecycle state machine                                          */
/* -------------------------------------------------------------------------- */

/** The seven on-rail states plus the two exit branches, in rail order. */
export const lifecycleStates = [
  "Placed",
  "Confirmed",
  "Packed",
  "Picked up",
  "In transit",
  "Delivered",
] as const;

export const lifecycleExitBranches = ["Returned", "Lost"] as const;

export const lifecycleCaption =
  "Returned and Lost are both exits from In transit, not from Delivered — a parcel does not need to reach the doorstep to leave the pipeline.";

export type LifecycleRow = {
  id: string;
  state: string;
  trigger: string;
  automatic: string;
  visibleTo: string;
};

export const lifecycleRows: LifecycleRow[] = [
  {
    id: "placed",
    state: "Placed",
    trigger: "Customer completes checkout (or staff creates a manual order)",
    automatic:
      "Inventory soft-reserved; order confirmation sent by SMS/email/WhatsApp; fraud/COD risk score attached if enabled",
    visibleTo: "Staff, customer",
  },
  {
    id: "confirmed",
    state: "Confirmed",
    trigger: "Staff clicks Confirm, or auto-confirm rule passes (e.g. prepaid, or COD under a risk threshold)",
    automatic: 'Order enters the pick queue; hard inventory allocation; "Confirmed" Bangla SMS sent',
    visibleTo: "Staff, customer",
  },
  {
    id: "packed",
    state: "Packed",
    trigger: "Staff marks items packed against the pick-list",
    automatic: "Package weight/dimensions locked for courier rate calc; label becomes eligible for generation",
    visibleTo: "Staff",
  },
  {
    id: "picked_up",
    state: "Picked up",
    trigger: "Courier scans the label or staff marks manual handover",
    automatic:
      'Pickup timestamp and courier consignment ID attached to the order; "On the way" SMS sent',
    visibleTo: "Staff, customer, courier",
  },
  {
    id: "in_transit",
    state: "In transit",
    trigger: "Courier webhook posts an intermediate scan",
    automatic: "Each scan appended to the public tracking timeline; ETA recalculated if the courier supplies one",
    visibleTo: "Staff, customer",
  },
  {
    id: "delivered",
    state: "Delivered",
    trigger: "Courier webhook posts final delivery scan, or staff manually confirms cash-in-hand",
    automatic:
      'COD amount posted to the remittance ledger as "awaited"; inventory deduction finalized; delivery SMS + review-request trigger sent',
    visibleTo: "Staff, customer",
  },
  {
    id: "returned",
    state: "Returned",
    trigger: "Courier webhook posts RTO/return scan, or staff processes a customer-initiated return",
    automatic:
      "Return reason captured; stock optionally auto-restocked pending inspection; return counted against that courier's return-rate metric",
    visibleTo: "Staff",
  },
  {
    id: "lost",
    state: "Lost",
    trigger:
      "Staff marks lost after courier confirms non-recovery, or after an SLA-breach investigation closes with no resolution",
    automatic:
      'Inventory written off; case flagged for courier claim; excluded from delivery-rate KPI as a distinct category from "returned"',
    visibleTo: "Staff",
  },
];

/* -------------------------------------------------------------------------- */
/* §4 Multi-courier booking (Z row)                                          */
/* -------------------------------------------------------------------------- */

export const drawerZRow = {
  eyebrow: "Inside the order drawer",
  title: "One drawer, not four portals.",
  body:
    "Open the order, pick a courier from the same panel that shows the customer's address and items, generate a label, and request a pickup. The courier's API call happens behind the button; nothing you type goes into a second tab.",
  proof: "Zero copy-paste between tabs.",
  proofBn: "কোনো ট্যাব-বদল নেই।",
  bullets: [
    "Suggests a courier based on destination, weight, fragility and COD value — pre-selected but always overridable.",
    "Shows the courier's live quoted rate for that weight band before you commit, not after the label prints.",
    "Generates and previews the label as a PDF thumbnail inside the drawer; bulk printing is available from the order list.",
    "Requests pickup with a chosen time window, subject to that courier's cut-off.",
    "Writes the Confirmed → Packed → Picked up events automatically as each step completes.",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* §5.1 Courier selection decision framework (cards)                        */
/* -------------------------------------------------------------------------- */

export const decisionFramework = {
  title: "The courier selection decision framework",
  sub:
    "No single courier wins every parcel. The right choice depends on four variables you already know at pack time — treat courier selection as a decision tree, not a default.",
  cards: [
    {
      id: "destination",
      title: "Destination zone",
      body:
        "Inside Dhaka metro: weigh pickup cut-off and same-day options. Outside Dhaka: confirm the courier's stated coverage actually includes the customer's upazila.",
    },
    {
      id: "weight",
      title: "Weight band",
      body:
        "Under 1 kg, most couriers price similarly — optimize for return rate. 1–5 kg, watch step changes at 2–3 kg. Over 5 kg, confirm the courier accepts bulky items at all.",
    },
    {
      id: "fragility",
      title: "Fragility or liquid",
      body:
        "Prefer couriers with declared fragile-handling and signature-on-delivery where offered; note the choice on the pick-list so packing uses extra void fill.",
    },
    {
      id: "cod",
      title: "COD value and remittance tolerance",
      body:
        "High COD value with a long remittance cycle: favor a faster-remitting courier or require partial advance above a threshold. Low COD value: optimize for coverage instead.",
    },
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* §6 Returns & RTO reduction (Z row + worked example)                      */
/* -------------------------------------------------------------------------- */

export const returnsZRow = {
  eyebrow: "Returns and RTO",
  title: "Return-to-origin is a data problem that surfaces at the courier.",
  body:
    "Address and phone verification before confirmation catch most RTOs before a courier ever touches the parcel. A confirmation message for COD orders above a value threshold filters out impulse or mistaken checkouts. Courier-level return-rate tracking turns RTO into a fact you can renegotiate terms with.",
  bullets: [
    "Address and phone verification before confirmation.",
    "A confirmation call or SMS for COD orders above a value threshold you set.",
    "Courier-level return-rate tracking, per courier per month.",
  ],
} as const;

export const rtoWorkedExample = {
  title: "What a 4-point RTO improvement is worth",
 assumptions: "600 COD orders/month, average order value 1,200 BDT , gross margin 32%, current RTO rate 14%.",
  perRtoCost:
 "Round-trip courier fee (120 BDT out + 100 BDT return = 220 BDT ) plus lost contribution margin (1,200 × 0.32 = 384 BDT ) — 604 BDT per RTO.",
 before: "600 × 14% = 84 RTOs × 604 BDT = 50,736 BDT /month",
 after: "600 × 10% = 60 RTOs × 604 BDT = 36,240 BDT /month",
 monthlySaving: "14,496 BDT ",
 annualizedSaving: "173,952 BDT ",
  caption:
    "Recompute this with your own AOV, margin and RTO rate under Analytics → Returns; the formula is (orders × RTO% × (round-trip fee + AOV × margin)).",
} as const;

export const rtoChecklist = [
  "Address field requires area/thana selection, not free text, for Dhaka and major-district addresses.",
  "Phone number format validated (11-digit BD mobile) at checkout, before payment step.",
  "COD orders above your set threshold trigger a confirmation SMS with amount and courier name.",
  "Orders unconfirmed after 48 hours auto-flag to the exceptions queue, not silently expire.",
  'Return reason is a required field on every RTO event — distinct rows in Analytics, not one bucket.',
  "Monthly return-rate-per-courier review is a standing item, not ad hoc.",
];

/* -------------------------------------------------------------------------- */
/* §7 Address quality and phone verification                                */
/* -------------------------------------------------------------------------- */

export const verificationZRow = {
  eyebrow: "Address quality and phone verification",
  title: "Two structured fields do most of the work.",
  body:
    "A cascading area selector (division → district → upazila/thana) backs the free-text street line, so 'outside coverage' is caught at checkout, not at pickup. Phone numbers are format-validated to 11-digit BD mobile prefixes, with optional OTP verification for COD orders above your risk threshold, sent via the same SMS gateway used for order notifications.",
  bullets: [
    "Cascading division → district → upazila/thana selector, free text remains only for house/road number.",
    "11-digit BD mobile format validation at the field level.",
    "Optional OTP verification for COD orders above your risk threshold — one SMS integration, not two.",
  ],
  otpPromptBn: "আপনার অর্ডার নিশ্চিত করতে এই কোডটি লিখুন: {code}",
} as const;

/* -------------------------------------------------------------------------- */
/* §8 Packing and pick-list workflow                                        */
/* -------------------------------------------------------------------------- */

export const packingSteps = [
  { id: "batch", title: "Batch into a pick-list", body: "Generated from Confirmed-state orders, grouped by SKU location or by order age." },
  { id: "pick", title: "Pick against the list", body: "SKU, quantity and bin location across all orders in the batch — one walk fulfills multiple orders." },
  { id: "weigh", title: "Pack and weigh", body: "Actual weight/dimensions lock the courier rate calculation and flag a mismatch against the product's stored weight." },
  { id: "mark", title: "Mark packed", body: "Packing is a gate: the system will not let a label print for an order still in Confirmed state." },
  { id: "batch_pickup", title: "Batch pickup request", body: "One pickup request covers a courier's whole packed-and-labeled batch instead of one request per parcel." },
] as const;

export const packingChecklist = [
  "Pick-list grouped by bin location, not by order number.",
  "Each line shows product image thumbnail, not just SKU code.",
  "Fragile-flagged items surface a packing-material reminder at the pack step.",
  "Weight variance beyond a set tolerance blocks label generation until confirmed by a second staff member.",
  "Batch pickup grouped by courier and by pickup time window.",
];

/* -------------------------------------------------------------------------- */
/* §9 Inventory reservation and oversell prevention                         */
/* -------------------------------------------------------------------------- */

export type StockStateRow = { id: string; state: string; when: string; countedAsAvailable: string };

export const stockStateRows: StockStateRow[] = [
  { id: "on_hand", state: "On hand", when: "Physically in the warehouse, uncommitted", countedAsAvailable: "Yes" },
  {
    id: "soft_reserved",
    state: "Soft-reserved",
    when: "Order Placed, payment not yet settled or COD not yet confirmed",
    countedAsAvailable: "No — decremented from available immediately",
  },
  {
    id: "hard_allocated",
    state: "Hard-allocated",
    when: "Order Confirmed",
    countedAsAvailable: "No — locked to that order specifically",
  },
  { id: "deducted", state: "Deducted", when: "Order Delivered", countedAsAvailable: "No — permanently removed from on-hand" },
  {
    id: "restocked",
    state: "Restocked",
    when: "Order Returned and inspection passed",
    countedAsAvailable: "Yes, once inspection completes",
  },
];

export const oversellCaption =
  "Soft reservations that never reach Confirmed release back to available stock automatically after a configurable timeout — commonly 30–60 minutes for payment orders, longer for COD orders pending a confirmation call.";

/* -------------------------------------------------------------------------- */
/* §10 Delivery-status webhooks and Bangla notifications                    */
/* -------------------------------------------------------------------------- */

export type NotificationRow = { id: string; trigger: string; channel: string; en: string; bn: string };

export const notificationRows: NotificationRow[] = [
  {
    id: "confirmed",
    trigger: "Confirmed",
    channel: "SMS",
    en: "Your order #{id} is confirmed and being packed.",
    bn: "আপনার অর্ডার #{id} নিশ্চিত হয়েছে, প্যাক করা হচ্ছে।",
  },
  {
    id: "picked_up",
    trigger: "Picked up",
    channel: "SMS",
    en: "Your order #{id} is on its way with {courier}.",
    bn: "আপনার অর্ডার #{id} {courier}-এর মাধ্যমে যাত্রা শুরু করেছে।",
  },
  {
    id: "out_for_delivery",
    trigger: "In transit (out for delivery)",
    channel: "SMS",
    en: "Your parcel is out for delivery today.",
    bn: "আপনার পার্সেল আজ ডেলিভারির জন্য বের হয়েছে।",
  },
  {
    id: "delivered",
    trigger: "Delivered",
    channel: "SMS + review request",
    en: "Delivered. Thank you for your order — rate your experience: {link}",
    bn: "ডেলিভারি সম্পন্ন। ধন্যবাদ — আপনার অভিজ্ঞতা জানান: {link}",
  },
  {
    id: "returned",
    trigger: "Returned",
    channel: "SMS",
    en: "Your order #{id} could not be delivered and is being returned. We'll contact you.",
    bn: "আপনার অর্ডার #{id} ডেলিভারি সম্ভব হয়নি, ফেরত পাঠানো হচ্ছে। আমরা যোগাযোগ করব।",
  },
];

export const notificationCaption =
  "Each row is independently toggleable per merchant — high-touch WhatsApp support can disable SMS for 'In transit' and keep only 'Confirmed' and 'Delivered'.";

/* -------------------------------------------------------------------------- */
/* §11 Exceptions queue                                                      */
/* -------------------------------------------------------------------------- */

export const exceptionCards = [
  { id: "no_confirmation", title: "No confirmation after 48 hours", body: "COD order sits in Placed with no confirmation call logged (threshold configurable)." },
  { id: "no_pickup", title: "No pickup scan after cut-off", body: "Label generated, but the courier never scanned it, past the courier's stated cut-off plus a grace window." },
  { id: "no_transit", title: "No transit scan for N days", body: "Parcel picked up but gone quiet — threshold configurable per courier, since transit times differ inside vs outside Dhaka." },
  { id: "failed_attempt", title: "Delivery attempted but not completed", body: "No rescheduled attempt logged within 24 hours." },
] as const;

export const exceptionsCaption =
  "Each exception surfaces with the order, the courier, the last known event, and time elapsed since that event — sorted oldest-first.";

/* -------------------------------------------------------------------------- */
/* §12 Remittance reconciliation                                            */
/* -------------------------------------------------------------------------- */

export type LedgerRow = { id: string; state: string; meaning: string };

export const remittanceLedgerRows: LedgerRow[] = [
  { id: "awaited", state: "Awaited", meaning: "Order Delivered, COD amount logged, courier has not yet paid out." },
  { id: "remitted", state: "Remitted", meaning: "Courier payout received and matched to one or more orders." },
  {
    id: "short",
    state: "Short",
    meaning: "Remitted amount doesn't match the sum of matched orders — flagged for manual reconciliation.",
  },
  {
    id: "disputed",
    state: "Disputed",
    meaning: "Order marked Delivered by courier webhook, but no matching remittance after the courier's stated cycle has passed.",
  },
];

export const remittanceWorkedCheck =
 "45 Delivered orders in a remittance cycle, COD total 54,200 BDT . Courier pays 52,900 BDT . The 1,300 BDT gap is flagged Short, with the underlying order-level amounts listed so the specific orders responsible can be raised with the courier directly.";

/* -------------------------------------------------------------------------- */
/* §13 Peak-season capacity checklist                                       */
/* -------------------------------------------------------------------------- */

export const peakSeason = {
  title: "Peak-season capacity checklist: Eid and Pohela Boishakh",
  sub:
    "Order volume during Eid-ul-Fitr, Eid-ul-Adha and Pohela Boishakh windows routinely multiplies baseline daily volume. Plan against capacity, not just demand.",
  items: [
    "Confirm each courier's own stated peak-season cut-off changes in advance.",
    "Pre-negotiate a temporary rate or priority-pickup arrangement if peak volume will meaningfully exceed your contracted volume.",
    "Increase the soft-reservation timeout for payment orders if gateway load is expected to slow checkout completion.",
    "Stage packing materials and box sizes for your peak-week forecast, not your average week.",
    "Schedule extra confirmation-call staffing for the COD confirmation step.",
    "Set a temporary, explicit delivery-delay notice on the storefront and in the Confirmed SMS.",
    "Review the exceptions queue daily, not weekly, during the peak window.",
    "Reconcile remittance more frequently during and immediately after the peak window.",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* §14 Comparison: Framique vs spreadsheet + courier panels                  */
/* -------------------------------------------------------------------------- */

export type ComparisonRow = { id: string; task: string; spreadsheet: string; framique: string };

export const comparisonRows: ComparisonRow[] = [
  { id: "choose_courier", task: "Choosing a courier per order", spreadsheet: "Manual judgment call, no data", framique: "Suggested by the decision framework, always overridable" },
  { id: "generate_label", task: "Generating a label", spreadsheet: "Log into courier panel, re-type address", framique: "Generated from the order, address already there" },
  { id: "request_pickup", task: "Requesting pickup", spreadsheet: "Separate action per courier panel", framique: "Batch request from the order list" },
  { id: "track_status", task: "Tracking status", spreadsheet: "Check each courier's tracking page manually", framique: "Webhook-driven timeline on the order and a public customer page" },
  { id: "customer_msgs", task: "Customer \u201cwhere is my order\u201d messages", spreadsheet: "Manual reply, per message", framique: "Bangla notifications sent automatically at each state" },
  { id: "return_rate", task: "Return rate per courier", spreadsheet: "Not tracked, or tracked manually in a separate sheet", framique: "Automatic per-courier, per-month metric" },
  { id: "remittance_matching", task: "COD remittance matching", spreadsheet: "Manual line-by-line against a courier statement", framique: "Auto-matched, exceptions surfaced as Short/Disputed" },
  { id: "oversell", task: "Oversell prevention", spreadsheet: "Manual stock check, error-prone at volume", framique: "Soft-reservation at order placement, real-time" },
  { id: "exceptions", task: "Exceptions (stalled orders)", spreadsheet: "Discovered when a customer complains", framique: "Surfaced automatically by elapsed-time thresholds" },
  { id: "peak_readiness", task: "Peak-season readiness", spreadsheet: "Ad hoc, remembered from last year if at all", framique: "Checklist and capacity settings built into the same dashboard" },
];

export const comparisonCaption =
  "The spreadsheet doesn't disappear because it was bad at its job — it disappears because a state machine and a webhook do the same job without the re-typing.";

/* -------------------------------------------------------------------------- */
/* §15 FAQ — verbatim source for both the rendered rows and the JSON-LD      */
/* -------------------------------------------------------------------------- */

export type FulfilmentFaqEntry = { id: string; question: Bilingual; answer: Bilingual };

/**
 * English is the deck's shipped copy verbatim. The deck does not provide a
 * Bangla FAQ variant for `/fulfilment`, so `bn` mirrors `en` here rather than
 * inventing a translation — `buildGraph`'s FAQPage always reads the `en`
 * string, and the route only renders a `bn` block when one is deliberately
 * authored, per the "no hidden duplicate" rule in the deck's SEO section.
 */
export const faqEntries: FulfilmentFaqEntry[] = [
  {
    id: "one-or-all-couriers",
    question: { en: "Do I need all four couriers, or can I use just one?", bn: "চারটি কুরিয়ারই কি লাগবে, নাকি একটি দিয়েই চলবে?" },
    answer: {
      en: "Use as many or as few as you want. The courier wall and the decision framework are most useful with two or more, since they let you compare, but a single-courier setup works identically — the drawer just won't show alternatives.",
      bn: "যতগুলো দরকার ততগুলোই ব্যবহার করুন। দুই বা তার বেশি কুরিয়ারে তুলনা করা সহজ হয়, তবে একটি কুরিয়ার দিয়েও ড্রয়ার একইভাবে কাজ করে।",
    },
  },
  {
    id: "webhook-downtime",
    question: { en: "What happens if a courier's webhook goes down temporarily?", bn: "কুরিয়ারের ওয়েবহুক সাময়িক বন্ধ থাকলে কী হয়?" },
    answer: {
      en: "The order stays in its last known state; staff can manually advance it if they have confirmation from the courier through another channel (call, app), and the manual update writes the same order-event log entry a webhook would.",
      bn: "অর্ডার তার শেষ জানা অবস্থাতেই থাকে; কুরিয়ারের সাথে অন্য মাধ্যমে (কল, অ্যাপ) নিশ্চিত হলে স্টাফ ম্যানুয়ালি এগিয়ে নিতে পারেন।",
    },
  },
  {
    id: "own-rider",
    question: { en: "Can I use my own delivery riders instead of a third-party courier?", bn: "থার্ড-পার্টি কুরিয়ারের বদলে নিজস্ব রাইডার ব্যবহার করা যাবে কি?" },
    answer: {
      en: "Yes — Manual / own rider is a first-class courier option in the drawer, with the same state machine, minus the label-generation and webhook steps, which are replaced by manual status updates from your staff.",
      bn: "হ্যাঁ — ড্রয়ারে নিজস্ব রাইডার একটি সম্পূর্ণ অপশন, একই স্টেট মেশিনসহ, শুধু লেবেল ও ওয়েবহুক ধাপগুলো ম্যানুয়াল আপডেট দিয়ে প্রতিস্থাপিত হয়।",
    },
  },
  {
    id: "return-rate-calc",
    question: { en: "How is the return rate per courier calculated?", bn: "প্রতি কুরিয়ারের রিটার্ন রেট কীভাবে হিসাব হয়?" },
    answer: {
      en: "Returned-state orders in a given month, divided by total orders shipped with that courier in the same month, shown in Analytics → Returns, filterable by return reason.",
      bn: "একই মাসে সেই কুরিয়ারে পাঠানো মোট অর্ডারের বিপরীতে Returned-স্টেট অর্ডারের অনুপাত, Analytics → Returns-এ দেখা যায়।",
    },
  },
  {
    id: "risk-score-autocancel",
    question: { en: "Does the risk score for COD orders auto-cancel anything?", bn: "সিওডি অর্ডারের রিস্ক স্কোর কি স্বয়ংক্রিয়ভাবে বাতিল করে?" },
    answer: {
      en: "No. It routes to manual review or blocks auto-confirmation; a human always makes the final confirm/cancel decision unless you explicitly configure an auto-cancel rule for a specific risk threshold.",
      bn: "না। এটি ম্যানুয়াল রিভিউতে পাঠায় বা অটো-কনফার্ম আটকায়; নির্দিষ্টভাবে নিয়ম সেট না করলে চূড়ান্ত সিদ্ধান্ত সবসময় একজন মানুষ নেন।",
    },
  },
  {
    id: "remittance-dispute",
    question: { en: "What if the courier's remittance amount is short and they dispute the shortfall?", bn: "কুরিয়ারের রেমিট্যান্স কম হলে এবং তারা তা নিয়ে দ্বিমত করলে কী হয়?" },
    answer: {
      en: "The Short ledger state keeps the specific order IDs and delivery timestamps attached, which is the evidence trail for that conversation with the courier — Framique doesn't adjudicate the dispute, it documents it.",
      bn: "Short লেজার স্টেটে নির্দিষ্ট অর্ডার আইডি ও ডেলিভারি সময় সংরক্ষিত থাকে — Framique বিরোধ নিষ্পত্তি করে না, শুধু প্রমাণ রাখে।",
    },
  },
  {
    id: "guest-tracking",
    question: { en: "Can customers track their order without creating an account?", bn: "কাস্টমাররা কি অ্যাকাউন্ট ছাড়াই অর্ডার ট্র্যাক করতে পারবেন?" },
    answer: {
      en: "Yes — the public tracking page is a link tied to the order ID and phone number, sent in the Confirmed SMS, with no login required.",
      bn: "হ্যাঁ — Confirmed এসএমএসে পাঠানো লিংক দিয়ে অর্ডার আইডি ও ফোন নম্বরের ভিত্তিতে ট্র্যাক করা যায়, লগইন লাগে না।",
    },
  },
  {
    id: "restock-after-return",
    question: { en: "Does inventory get restocked automatically after a return?", bn: "রিটার্নের পর স্টক কি স্বয়ংক্রিয়ভাবে ফিরে যোগ হয়?" },
    answer: {
      en: "Only after inspection is marked passed; a returned item sits in a pending-inspection state so a damaged return doesn't silently go back into sellable stock.",
      bn: "শুধু পরিদর্শন পাস হলেই — এর আগ পর্যন্ত রিটার্ন হওয়া পণ্য পেন্ডিং-ইনস্পেকশন অবস্থায় থাকে।",
    },
  },
  {
    id: "peak-season-lead-time",
    question: { en: "How far in advance should I set up peak-season settings?", bn: "পিক-সিজনের সেটিংস কতদিন আগে ঠিক করা উচিত?" },
    answer: {
      en: "At least two to three weeks before Eid or Pohela Boishakh, so the reservation-timeout and staffing adjustments are live before the volume spike, not adjusted reactively mid-spike.",
      bn: "ঈদ বা পহেলা বৈশাখের অন্তত দুই-তিন সপ্তাহ আগে, যাতে রিজার্ভেশন-টাইমআউট ও স্টাফিং সমন্বয় ভিড় শুরুর আগেই কার্যকর থাকে।",
    },
  },
  {
    id: "switch-from-spreadsheet",
    question: { en: "What data do I need to switch from a spreadsheet workflow?", bn: "স্প্রেডশিট থেকে সরে আসতে কী কী ডেটা লাগবে?" },
    answer: {
      en: "Your current product list with weights (for rate calculation), courier credentials for each courier you already use, and your historical order data if you want return-rate history to populate from day one rather than starting fresh.",
      bn: "ওজনসহ বর্তমান পণ্য তালিকা, ব্যবহৃত প্রতিটি কুরিয়ারের ক্রেডেনশিয়াল, এবং চাইলে পুরনো অর্ডার ডেটা যাতে রিটার্ন-রেট ইতিহাস প্রথম দিন থেকেই থাকে।",
    },
  },
];

/* -------------------------------------------------------------------------- */
/* §16 Final CTA                                                             */
/* -------------------------------------------------------------------------- */

export const finalCta = {
  title: "Stop reconciling parcels by hand.",
  titleBn: "পার্সেল হাতে হিসাব করা বন্ধ করুন।",
  body: "Every state change, every label, every remitted taka — one ledger, not four browser tabs.",
  bodyBn: "প্রতিটি স্টেট পরিবর্তন, প্রতিটি লেবেল, প্রতিটি ফেরত টাকা — একটি খাতায়, চারটি ট্যাবে নয়।",
  primaryCta: "Book a walkthrough",
  altCta: "Start free — no card",
} as const;
