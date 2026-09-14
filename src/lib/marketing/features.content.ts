/**
 * `/features` — copy contract (docs/05-marketing/copy/03-features.md).
 *
 * Pure data module: no React, no JSX, no I/O. The route composes this typed
 * data onto the shared band kit (`@/components/public/bands`). Every Bangla
 * string here is copied verbatim from the deck's "বাংলা ..." blocks — a block
 * with no Bangla line in the deck simply has no `bn` field rather than a
 * machine-translated stand-in.
 *
 * This page is the internal-link spine of the marketing graph: each of the
 * six pillar deep-dive rows points onward to its own dedicated page
 * (`/builder`, `/payments`, `/fulfilment`) or, where no dedicated page exists
 * yet for that pillar, to the closest relevant page (`/security`, `/docs`)
 * so link equity never dead-ends on this hub.
 */

export type Bilingual = { en: string; bn?: string };

/* -------------------------------------------------------------------------- */
/* 1 — Hero                                                                   */
/* -------------------------------------------------------------------------- */

export const HERO = {
  eyebrow: { en: "Six pillars, one data model", bn: "ছয়টি স্তম্ভ, একটি ডেটা মডেল" },
  title: { en: "One platform. Every part of the sale.", bn: "একটি প্ল্যাটফর্ম। বিক্রির প্রতিটি ধাপ।" },
  sub: {
    en: "Storefront, catalogue, checkout, fulfilment, point of sale and analytics — designed as one system, not six plugins glued together with webhooks.",
  },
  primaryCta: { en: "Explore the builder" },
  altCta: { en: "See pricing" },
} satisfies Record<string, Bilingual>;

/* -------------------------------------------------------------------------- */
/* 2 — Pillar grid (6 glass cards, anchored)                                  */
/* -------------------------------------------------------------------------- */

export type PillarSummary = {
  id: string;
  anchor: string;
  title: Bilingual;
  line: Bilingual;
};

export const PILLARS: PillarSummary[] = [
  { id: "storefront", anchor: "#storefront", title: { en: "Storefront & builder" }, line: { en: "Sections, tokens, versions, instant rollback." } },
  { id: "catalogue", anchor: "#catalogue", title: { en: "Catalogue & inventory" }, line: { en: "Options, variants, stock and Bangla copy on one product." } },
  { id: "checkout", anchor: "#checkout", title: { en: "Checkout & payments" }, line: { en: "Four rails, one flow, tuned for COD-heavy baskets." } },
  { id: "fulfilment", anchor: "#fulfilment", title: { en: "Fulfilment & couriers" }, line: { en: "Labels, pickups and delivery status inside the order." } },
  { id: "pos", anchor: "#pos", title: { en: "POS & omnichannel" }, line: { en: "Same product, same stock, counter and web." } },
  { id: "analytics", anchor: "#analytics", title: { en: "Analytics & API" }, line: { en: "Revenue, returns and rail mix — live, and exportable." } },
];

/* -------------------------------------------------------------------------- */
/* 3 — Unified data model                                                     */
/* -------------------------------------------------------------------------- */

export const DATA_MODEL = {
  eyebrow: { en: "One product, many surfaces" },
  title: { en: "The unified data model." },
  intro: {
    en: "Most Bangladeshi merchants we've spoken with run at least three tools that each think they own the product record: a storefront theme, a spreadsheet for stock, and a courier panel for order status. Framique treats a product as one row with fan-out, not three rows kept in sync by hand.",
  },
  howItWorks: {
    en: "A product has a canonical ID. Everything else — its storefront listing, its POS button, its stock ledger entry, its analytics dimension, its order line item — reads and writes against that same ID. There is no import job, no CSV round-trip, no \"sync in progress\" spinner between your shop and your counter.",
  },
  worked: {
    en: "Assume a merchant sells a printed panjabi in three sizes and two colours — six SKUs from one product. A customer orders the medium, white variant from the storefront at 9:40pm. At 9:41pm the merchant sells the last medium, white unit in person at a physical counter using POS. Framique decrements the same stock ledger row twice, in order, and the storefront listing shows \"out of stock — this size\" before a third buyer can add it to cart. No separate stock file, no evening reconciliation.",
  },
} satisfies Record<string, Bilingual>;

export type DataModelRow = { id: string; edit: string; updates: string };
export const DATA_MODEL_ROWS: DataModelRow[] = [
  { id: "price", edit: "Price in the builder", updates: "Storefront price, POS price, API price, cart already open on a customer's phone (on next fetch)" },
  { id: "stock", edit: "Stock count at checkout", updates: "Available-to-sell number on storefront, POS, and low-stock alerts" },
  { id: "bn-name", edit: "Bangla product name", updates: "Storefront (bn locale), receipt printed at POS, order confirmation SMS" },
  { id: "variants", edit: "Variant options (size/colour)", updates: "SKU generation, per-variant stock, per-variant price, courier weight used for rate lookup" },
  { id: "webhook", edit: "Order status from courier webhook", updates: "Order timeline, customer tracking page, analytics fulfilment-time metric" },
];

/* -------------------------------------------------------------------------- */
/* 4–9 — Pillar deep-dives (ZRow + capability table + Tuesday narrative)      */
/* -------------------------------------------------------------------------- */

export type OnwardLink = { to: string; label: Bilingual };

export type PillarDeepDive = {
  id: string;
  anchor: string;
  direction: "left" | "right";
  eyebrow?: Bilingual;
  title: Bilingual;
  body: Bilingual;
  proof: Bilingual;
  /** Capability table for this pillar. Column shape varies per the deck. */
  columns: { id: string; label: string; highlight?: boolean }[];
  rows: { id: string; label: string; cells: Record<string, string> }[];
  tuesdayTitle: Bilingual;
  tuesday: Bilingual;
  /** Onward link into the dedicated deep-dive page for this pillar. */
  onward: OnwardLink;
};

export const PILLAR_DEEP_DIVES: PillarDeepDive[] = [
  {
    id: "storefront",
    anchor: "storefront",
    direction: "left",
    title: { en: "The builder is where the shop becomes yours." },
    body: {
      en: "Drag sections, edit design tokens, publish a version — with instant rollback if a change hurts conversion. Every publish is a snapshot, not an overwrite.",
    },
    proof: { en: "Every publish is a version. Every version can be restored.", bn: "প্রতিটি প্রকাশ একটি সংস্করণ। প্রতিটি সংস্করণ ফিরিয়ে আনা যায়।" },
    columns: [
      { id: "does", label: "What it does" },
      { id: "who", label: "Who uses it" },
    ],
    rows: [
      { id: "sections", label: "Section library", cells: { does: "Hero, product grid, testimonial-free trust bands, FAQ, footer — drag to reorder", who: "Store owner, no developer" } },
      { id: "tokens", label: "Token editor", cells: { does: "Colour, type scale, spacing per store, inherited by every section", who: "Store owner or designer" } },
      { id: "versions", label: "Version history", cells: { does: "Every publish snapshotted; rollback in one click", who: "Store owner" } },
      { id: "domain", label: "Custom domain", cells: { does: "Point your own domain, TLS issued automatically", who: "Store owner" } },
      { id: "drafts", label: "Draft/preview links", cells: { does: "Share an unpublished version before go-live", who: "Store owner, agency" } },
      { id: "mobile", label: "Mobile-first canvas", cells: { does: "Every section authored mobile-first, desktop is the enhancement", who: "Builder engine" } },
    ],
    tuesdayTitle: { en: "How a merchant actually uses this on a Tuesday" },
    tuesday: {
      en: "It's Eid-collection week. The merchant wants to swap the homepage hero for a festive banner without touching the rest of the site. She opens the builder, drags the existing hero section down one slot, drops in a new hero pointed at the Eid collection, and previews it on a draft link she sends to her business partner over WhatsApp. Her partner replies \"the button colour is too dark to read\" — she opens the token editor, nudges the CTA fill token, and the change propagates to every section using that token, not just the hero. She publishes. Forty minutes later a return customer complains the homepage looks different and she preferred the old layout — she opens version history and rolls back to the version from three days ago in one click, then re-applies just the button-colour fix on top of it.",
    },
    onward: { to: "/builder", label: { en: "See the full builder walkthrough" } },
  },
  {
    id: "catalogue",
    anchor: "catalogue",
    direction: "right",
    title: { en: "Catalogue that speaks Bangla natively." },
    body: {
      en: "Options and variants generate real SKUs, each with its own stock and price. Bangla names and descriptions live on the same product record — not a translated mirror site.",
    },
    proof: { en: "One SKU, two languages, one stock number.", bn: "একটি SKU, দুই ভাষা, একটি স্টক সংখ্যা।" },
    columns: [{ id: "does", label: "What it does" }],
    rows: [
      { id: "options", label: "Options & variants", cells: { does: "Up to 3 option dimensions (e.g. size, colour, material) auto-generate SKUs" } },
      { id: "stock", label: "Per-variant stock", cells: { does: "Each SKU carries its own available-to-sell count, reserved count, and reorder threshold" } },
      { id: "bilingual", label: "Bilingual fields", cells: { does: "Name, description and search tags stored per-locale on one product record" } },
      { id: "csv", label: "Bulk import/export", cells: { does: "CSV round-trip for merchants migrating an existing catalogue" } },
      { id: "alerts", label: "Low-stock alerts", cells: { does: "Threshold per SKU, notification to owner and to any staff role with catalogue access" } },
      { id: "category", label: "Category tree", cells: { does: "Nested categories with per-category storefront sort order" } },
    ],
    tuesdayTitle: { en: "How a merchant actually uses this on a Tuesday" },
    tuesday: {
      en: "A saree wholesaler restocks 40 units of a print across four colourways. She uploads a CSV with the new stock counts against existing SKU codes rather than recreating products from scratch. Before publishing the import, the system flags three rows where the SKU code doesn't match anything in the catalogue — likely a typo — so she fixes them in the CSV rather than silently creating four duplicate products. Stock updates instantly on the storefront and at the counter. That afternoon a customer messages in Bangla asking whether the maroon colourway is available in the largest size; the staff member checks the same product page, reads the Bangla name and description, and can answer from the same screen without switching to a translated mirror site.",
    },
    onward: { to: "/builder", label: { en: "See how catalogue data flows into the builder" } },
  },
  {
    id: "checkout",
    anchor: "checkout",
    direction: "left",
    title: { en: "Checkout built around cash on delivery." },
    body: {
      en: "COD is a first-class method, not a fallback: it carries its own fraud rules, its own return path and its own reconciliation, alongside bKash, Nagad, Rocket, Upay and card.",
    },
    proof: { en: "COD returns land back on the order, automatically.", bn: "COD রিটার্ন স্বয়ংক্রিয়ভাবে অর্ডারে ফিরে আসে।" },
    columns: [
      { id: "reconciliation", label: "Reconciliation" },
      { id: "use", label: "Typical use" },
    ],
    rows: [
      { id: "cod", label: "Cash on delivery (COD)", cells: { reconciliation: "Matched against courier remittance report per order", use: "Majority of first-time and rural buyers" } },
      { id: "bkash", label: "bKash", cells: { reconciliation: "Matched against bKash merchant statement, per transaction ID", use: "Repeat urban buyers, small-ticket" } },
      { id: "nagad", label: "Nagad", cells: { reconciliation: "Matched against Nagad settlement report", use: "Repeat urban buyers" } },
      { id: "rocket", label: "Rocket", cells: { reconciliation: "Matched against Rocket statement", use: "Legacy mobile-money customers" } },
      { id: "upay", label: "Upay", cells: { reconciliation: "Matched against Upay settlement", use: "Growing segment, telecom-linked wallets" } },
      { id: "card", label: "Card (Visa/Mastercard via gateway)", cells: { reconciliation: "Matched against gateway settlement batch", use: "Higher-ticket, urban, B2B" } },
    ],
    tuesdayTitle: { en: "How a merchant actually uses this on a Tuesday" },
    tuesday: {
      en: "A customer in Rangpur adds three items to cart and chooses COD, because they've never paid this shop before and don't want to send money to an unfamiliar bKash number first. The order is created immediately with a fraud score computed from the customer's phone number, delivery area and order value — this one clears. The merchant's staff hand it to the courier that afternoon. Two days later the customer refuses one item at the door. The courier logs a partial return; Framique receives that status and updates the order to reflect the returned item and the adjusted amount actually collected, without the merchant needing to manually edit the order total or issue a separate refund record.",
    },
    onward: { to: "/payments", label: { en: "See every rail, reconciled" } },
  },
  {
    id: "fulfilment",
    anchor: "fulfilment",
    direction: "right",
    title: { en: "Labels, pickups and delivery status inside the order." },
    body: {
      en: "Book a courier, print a label and watch delivery status update on the order timeline — no separate courier dashboard open in another tab.",
    },
    proof: { en: "One order. One timeline. Every courier update lands on it.", bn: "একটি অর্ডার। একটি টাইমলাইন। প্রতিটি কুরিয়ার আপডেট এখানেই আসে।" },
    columns: [
      { id: "booking", label: "Booking" },
      { id: "rate", label: "Rate lookup" },
      { id: "webhook", label: "Status webhook" },
    ],
    rows: [
      { id: "steadfast", label: "SteadFast", cells: { booking: "In-order booking", rate: "By weight + area", webhook: "Live" } },
      { id: "pathao", label: "Pathao Courier", cells: { booking: "In-order booking", rate: "By weight + area", webhook: "Live" } },
      { id: "redx", label: "RedX", cells: { booking: "In-order booking", rate: "By weight + area", webhook: "Live" } },
      { id: "paperfly", label: "Paperfly", cells: { booking: "In-order booking", rate: "By weight + area", webhook: "Live" } },
      { id: "manual", label: "Manual/own rider", cells: { booking: "Manual status entry", rate: "N/A", webhook: "Manual update" } },
    ],
    tuesdayTitle: { en: "How a merchant actually uses this on a Tuesday" },
    tuesday: {
      en: "Ten orders came in overnight. The merchant opens the order queue, filters to \"ready to ship,\" and books all ten with one courier in a single batch action rather than opening each order separately. Labels print as a single PDF batch. Two hours later, one parcel is marked \"failed delivery attempt\" by the courier's webhook; that status appears on the order timeline automatically and the order moves into a \"needs follow-up\" view without anyone refreshing a courier's own tracking page. The merchant calls the customer, reschedules, and re-books the same label rather than creating a duplicate order.",
    },
    onward: { to: "/fulfilment", label: { en: "See the full courier lifecycle" } },
  },
  {
    id: "pos",
    anchor: "pos",
    direction: "left",
    title: { en: "Same product, same stock, counter and web." },
    body: {
      en: "Ring up a sale at a physical counter and the storefront stock count moves in the same instant — because it's the same row, not a synced copy.",
    },
    proof: { en: "The counter and the storefront read the same stock ledger.", bn: "কাউন্টার এবং স্টোরফ্রন্ট একই স্টক লেজার পড়ে।" },
    columns: [{ id: "does", label: "What it does" }],
    rows: [
      { id: "counter", label: "Counter sale flow", cells: { does: "Barcode/search product, take payment (cash, bKash, card), print or SMS receipt" } },
      { id: "ledger", label: "Shared stock ledger", cells: { does: "Same availability number online and at counter, decremented at time of sale" } },
      { id: "offline", label: "Offline queue", cells: { does: "Counter can take sales during a connectivity drop; syncs when back online" } },
      { id: "shift", label: "Staff shift log", cells: { does: "Each POS sale is attributed to the logged-in staff account" } },
      { id: "returns", label: "Returns at counter", cells: { does: "Refund or exchange against the original order, whether it was placed online or in person" } },
    ],
    tuesdayTitle: { en: "How a merchant actually uses this on a Tuesday" },
    tuesday: {
      en: "A shop has a small storefront and a physical counter in the same neighbourhood. A walk-in buys the last unit of a scarf that's also listed online. The staff member rings it up at POS; the online listing shows out-of-stock before the next online visitor can add it to cart. Later that day the shop's internet drops for twenty minutes during a routine outage — the counter keeps taking sales locally and queues them, syncing the stock decrements the moment connectivity returns, rather than freezing the till or trusting an outdated printed stock sheet.",
    },
    onward: { to: "/fulfilment", label: { en: "See how POS and fulfilment share one ledger" } },
  },
  {
    id: "analytics",
    anchor: "analytics",
    direction: "right",
    title: { en: "Analytics you can defend in a meeting." },
    body: {
      en: "Every number traces to rows you can export. No modelled estimates, no rounded vanity metrics — and a REST API when you need the number somewhere else.",
    },
    proof: { en: "Every metric has a query behind it.", bn: "প্রতিটি মেট্রিকের পেছনে একটি কোয়েরি আছে।" },
    columns: [{ id: "does", label: "What it does" }],
    rows: [
      { id: "revenue", label: "Live revenue dashboard", cells: { does: "Orders, revenue, average order value, updated per new order" } },
      { id: "railmix", label: "Rail mix report", cells: { does: "Share of revenue by payment method (COD/bKash/Nagad/Rocket/Upay/card)" } },
      { id: "returns", label: "Return-rate report", cells: { does: "Returns by product, by rail, by delivery area" } },
      { id: "csv", label: "CSV export", cells: { does: "Any report exports to CSV with the underlying row-level data" } },
      { id: "api", label: "REST API", cells: { does: "Products, orders, inventory, customers — read and write, token-scoped" } },
      { id: "webhooks", label: "Webhook events", cells: { does: "Order created, order status changed, payment settled, stock threshold crossed" } },
    ],
    tuesdayTitle: { en: "How a merchant actually uses this on a Tuesday" },
    tuesday: {
      en: "At the end of the month, a merchant's accountant asks for the COD-versus-digital-payment split for a bank loan application. Rather than estimating, the merchant opens the rail-mix report, filters to the month, and exports the CSV — the accountant can trace every row back to an order ID if the bank asks for backup. Separately, the merchant's developer has built a small internal tool that emails a daily summary to the owner's phone; it polls the REST API for the previous day's orders rather than scraping the dashboard, because the numbers in the API and the numbers on screen are guaranteed to be the same query.",
    },
    onward: { to: "/docs", label: { en: "Read the API and webhook reference" } },
  },
];

/* -------------------------------------------------------------------------- */
/* 10 — Five official themes                                                  */
/* -------------------------------------------------------------------------- */

export const THEMES_HEADING = { en: "The five official themes — and when each fits" } satisfies Bilingual;
export const THEMES_INTRO = {
  en: "Framique ships five official themes today. Each is a starting point you can still edit token-by-token in the builder — choosing a theme is not a lock-in decision.",
} satisfies Bilingual;

export type ThemeCard = { id: string; name: string; builtFor: string; bands: string; trait: string };
export const THEMES: ThemeCard[] = [
  { id: "classic", name: "Classic", builtFor: "General retail, apparel, gifting", bands: "6–8 bands", trait: "Balanced grid, neutral type scale, safe default" },
  { id: "modern", name: "Modern", builtFor: "Fashion, beauty, higher-margin goods", bands: "5–7 bands", trait: "Larger imagery, tighter type, fewer bands per page" },
  { id: "landing", name: "Landing", builtFor: "Single-product or campaign launches", bands: "3–5 bands", trait: "Built to convert one SKU or one collection, minimal navigation" },
  { id: "supershop", name: "Supershop", builtFor: "Wide catalogues, groceries, multi-category", bands: "8–10 bands", trait: "Dense grid, category rail up front, search-forward" },
  { id: "b2b", name: "B2B", builtFor: "Wholesale, trade accounts, quote-based selling", bands: "6–9 bands", trait: "Login-gated pricing, quantity breaks, quote-request flow instead of instant checkout" },
];

export const THEMES_DECISION = {
  en: "If the catalogue is under 30 SKUs and centred on one collection, start with Landing. If it's a wide multi-category shop with daily repeat buyers, start with Supershop. If pricing depends on the buyer's account (trade, wholesale), start with B2B — its checkout flow assumes a login before price is shown. Everything else starts with Classic or Modern depending on whether the aesthetic priority is breadth (Classic) or image-led minimalism (Modern).",
} satisfies Bilingual;

/* -------------------------------------------------------------------------- */
/* 11 — Multi-language, Bangla-first                                          */
/* -------------------------------------------------------------------------- */

export const LANGUAGE = {
  eyebrow: { en: "Multi-language, Bangla-first" },
  title: { en: "Bangla is not a translated skin." },
  body: {
    en: "Product fields, storefront copy, receipts, SMS notifications and staff-facing labels are stored per-locale from the schema up. Type never clips a matra: Bangla display type keeps a 1.35+ line-height box and drops inherited Latin negative tracking to zero. A product page is one record, two reading experiences — editing the Bangla name field fills a locale slot on the same SKU, so stock, price and variant logic stay singular even when the storefront is bilingual.",
  },
} satisfies Record<string, Bilingual>;

export type LanguageRow = { id: string; surface: string; support: string };
export const LANGUAGE_ROWS: LanguageRow[] = [
  { id: "storefront", surface: "Storefront (customer-facing)", support: "Full: product, cart, checkout, order-status page" },
  { id: "pos", surface: "POS (staff-facing)", support: "Full: search, product labels, receipt" },
  { id: "sms", surface: "Order confirmation SMS", support: "Full, per-store default language setting" },
  { id: "analytics", surface: "Analytics dashboard", support: "English only today (see honesty band)" },
  { id: "admin", surface: "Admin/builder UI", support: "English only today (see honesty band)" },
];

/* -------------------------------------------------------------------------- */
/* 12 — Roles & permissions                                                   */
/* -------------------------------------------------------------------------- */

export const ROLES = {
  eyebrow: { en: "Roles & permissions" },
  title: { en: "Scoped by role, not by trust." },
  body: {
    en: "A shop is rarely run by one person. Framique scopes access by role rather than giving every logged-in staff member full owner access.",
  },
  tuesday: {
    en: "A shop owner hires a part-time counter assistant for Eid week. She's given the Counter/POS role — she can ring up sales and see stock, but cannot see the store's overall revenue report or change any product's price. When the temporary hire's contract ends, the owner deactivates the role in one action rather than needing to change a shared password everyone knew.",
  },
} satisfies Record<string, Bilingual>;

export type RoleRow = { id: string; role: string; see: string; can: string };
export const ROLE_ROWS: RoleRow[] = [
  { id: "owner", role: "Owner", see: "Everything", can: "Everything, including billing and staff management" },
  { id: "manager", role: "Manager", see: "Orders, catalogue, analytics", can: "Edit catalogue, process orders and returns, cannot change billing" },
  { id: "catalogue-staff", role: "Catalogue staff", see: "Products, stock", can: "Add/edit products and stock, cannot see revenue reports" },
  { id: "counter-staff", role: "Counter/POS staff", see: "Products, stock, POS sales", can: "Ring up sales, process counter returns, no storefront/builder access" },
  { id: "fulfilment-staff", role: "Fulfilment staff", see: "Orders, courier status", can: "Book couriers, print labels, update manual delivery status" },
  { id: "accountant", role: "Read-only/accountant", see: "Analytics, exports", can: "View and export reports, no edit access anywhere" },
];

/* -------------------------------------------------------------------------- */
/* 13 — Automation & webhooks                                                 */
/* -------------------------------------------------------------------------- */

export const AUTOMATION = {
  eyebrow: { en: "Automation & webhooks" },
  title: { en: "The escape hatch for technical buyers." },
  body: {
    en: "Not every workflow fits inside the dashboard. Webhooks and the REST API let a merchant or their developer react to events the moment they happen.",
  },
  worked: {
    en: "A merchant's supplier only accepts reorders by a specific spreadsheet format sent over email. Rather than checking stock manually every few days, the merchant's developer subscribes to inventory.threshold_crossed, and a small script formats the affected SKUs into the supplier's expected spreadsheet and emails it automatically the moment stock crosses the reorder line — turning a recurring manual check into a one-time integration.",
  },
} satisfies Record<string, Bilingual>;

export type AutomationRow = { id: string; event: string; use: string };
export const AUTOMATION_ROWS: AutomationRow[] = [
  { id: "order-created", event: "order.created", use: "Send a custom WhatsApp confirmation via a third-party messaging tool" },
  { id: "status-changed", event: "order.status_changed", use: "Trigger an SMS when a courier marks a parcel out for delivery" },
  { id: "payment-settled", event: "payment.settled", use: "Push a row into an external accounting spreadsheet or tool" },
  { id: "threshold", event: "inventory.threshold_crossed", use: "Notify a supplier's messaging channel to trigger a reorder" },
  { id: "customer-created", event: "customer.created", use: "Add the customer to an email or SMS marketing list" },
];

/* -------------------------------------------------------------------------- */
/* 14 — Performance budget                                                    */
/* -------------------------------------------------------------------------- */

export const PERFORMANCE = {
  eyebrow: { en: "Performance budget" },
  title: { en: "A budget, not a vague \"fast.\"" },
  body: {
    en: "Storefronts are judged on load time by both customers on mid-range Android phones over 3G/4G and by search engines. Framique enforces a performance budget at the platform level rather than leaving it to each theme's discretion.",
  },
} satisfies Record<string, Bilingual>;

export type PerformanceRow = { id: string; metric: string; budget: string; why: string };
export const PERFORMANCE_ROWS: PerformanceRow[] = [
  { id: "lcp", metric: "Largest Contentful Paint", budget: "≤ 2.5s on a simulated mid-tier Android + 4G profile", why: "Majority of storefront traffic in this market is mobile, not desktop" },
  { id: "js", metric: "Total JS shipped per storefront page", budget: "≤ 170KB gzipped", why: "Keeps parse/execute time low on lower-end CPUs" },
  { id: "images", metric: "Image delivery", budget: "Responsive srcset, WebP/AVIF with fallback, lazy below the fold", why: "Product photography is heavy; this keeps it from dominating load time" },
  { id: "ttfb", metric: "Time to first byte", budget: "≤ 400ms from a Bangladesh-region edge", why: "Checkout abandonment correlates strongly with delay at this exact step" },
];

/* -------------------------------------------------------------------------- */
/* 15 — What we do not do yet (scope honesty)                                 */
/* -------------------------------------------------------------------------- */

export const HONESTY_TITLE = { en: "What we do not do yet" } satisfies Bilingual;
export const HONESTY_INTRO = {
  en: "Framique is not everything. Being direct about the edges of the current product saves an evaluating merchant time and avoids a bad-fit sale.",
} satisfies Bilingual;

export const HONESTY_ITEMS: Bilingual[] = [
  { en: "No native marketplace listing sync (Daraz, Facebook Shop) yet — orders from those channels still need manual entry or a third-party connector." },
  { en: "No built-in accounting/VAT filing — analytics exports the row-level data; a bookkeeper or an external accounting tool still does the filing." },
  { en: "No multi-warehouse routing logic yet — stock is per-store today; a merchant with two physical warehouses currently manages them as one pooled stock number, not an automatic nearest-warehouse split." },
  { en: "No built-in email marketing composer — webhooks and the API can feed an external tool, but there is no native campaign builder inside Framique yet." },
  { en: "Admin/builder UI is English-only today — Bangla covers every customer-facing and staff-facing surface, but the merchant-side settings screens are not yet localised." },
  { en: "No offline-first storefront — the POS has an offline sale queue; the customer-facing storefront requires connectivity to load and checkout." },
];

/** Cross-link from the honesty band to the dedicated security/isolation page,
 *  since data-scope and access-control questions raised by this band are
 *  answered in full there. */
export const HONESTY_ONWARD: OnwardLink = { to: "/security", label: { en: "Read how access and data are scoped" } };

/* -------------------------------------------------------------------------- */
/* 16 — Comparison: one platform vs. stitching separate tools                 */
/* -------------------------------------------------------------------------- */

export const COMPARISON_TITLE = { en: "One platform vs. stitching separate tools" } satisfies Bilingual;

export type ComparisonRow = { id: string; task: string; stitched: string; framique: string };
export const COMPARISON_ROWS: ComparisonRow[] = [
  { id: "storefront", task: "Storefront", stitched: "One theme platform (often foreign hosting, foreign payment defaults)", framique: "Built in, Bangladesh-first payment defaults" },
  { id: "payments", task: "Payments", stitched: "Separate gateway integration per rail, manual reconciliation spreadsheet", framique: "bKash/Nagad/Rocket/Upay/card/COD reconciled against orders natively" },
  { id: "inventory", task: "Inventory sync between web and counter", stitched: "Manual recount or a third-party sync plugin, often lagging by hours", framique: "Same stock ledger, same instant" },
  { id: "courier", task: "Courier booking", stitched: "Log into each courier's own panel separately, copy tracking numbers back into orders by hand", framique: "Booked from the order, status returns automatically" },
  { id: "bilingual", task: "Bilingual catalogue", stitched: "Duplicate product records in two languages, kept in sync manually", framique: "One product, two locale fields" },
  { id: "reporting", task: "Reporting", stitched: "Export from each tool, reconcile in a spreadsheet before a meeting", framique: "One dashboard, exportable, one query per metric" },
  { id: "staff", task: "Staff access", stitched: "Shared logins or no access control at all", framique: "Role-scoped accounts per staff function" },
  { id: "failure", task: "Point of integration failure", stitched: "Each sync job is a place data can silently drift", framique: "One data model — nothing to keep \"in sync\" because there's one record" },
];

/* -------------------------------------------------------------------------- */
/* Integration marquee                                                        */
/* -------------------------------------------------------------------------- */

export const INTEGRATION_MARKS: string[] = [
  "bKash",
  "Nagad",
  "Rocket",
  "Upay",
  "Card",
  "Cash on delivery",
  "SteadFast",
  "Pathao Courier",
  "RedX",
  "Paperfly",
];

/* -------------------------------------------------------------------------- */
/* 17 — FAQ (10, verbatim — must match JSON-LD exactly)                       */
/* -------------------------------------------------------------------------- */

export type FaqItem = { id: string; question: Bilingual; answer: Bilingual };

export const FEATURES_FAQ: FaqItem[] = [
  {
    id: "rails",
    question: { en: "Does Framique support bKash, Nagad, Rocket and Upay at checkout, or only card payments?" },
    answer: { en: "All four local wallets, plus card and cash on delivery, are supported at checkout with per-rail reconciliation against orders." },
  },
  {
    id: "cod",
    question: { en: "Can I keep cash on delivery as my main payment method?" },
    answer: { en: "Yes. COD is treated as a first-class payment method with its own fraud rules and return handling, not a fallback bolted onto a card-first checkout." },
  },
  {
    id: "couriers",
    question: { en: "Which couriers can I book directly from an order?" },
    answer: { en: "SteadFast, Pathao Courier, RedX and Paperfly are integrated for in-order booking, label printing and status webhooks. Any other courier can be tracked with manual status updates." },
  },
  {
    id: "bangla",
    question: { en: "Is the storefront actually bilingual, or is Bangla just a translated overlay?" },
    answer: { en: "Bangla is stored as locale fields on the same product, order and customer records used by the English side — not a separate translated site kept in sync manually." },
  },
  {
    id: "themes",
    question: { en: "How many storefront themes are available, and can I customise them?" },
    answer: { en: "Five official themes ship today — Classic, Modern, Landing, Supershop and B2B. Every theme remains fully editable in the builder down to individual design tokens." },
  },
  {
    id: "stock",
    question: { en: "Do the physical counter and the online storefront share the same stock count?" },
    answer: { en: "Yes. POS and storefront read and write the same stock ledger row per SKU; a sale at the counter is reflected online in the same instant." },
  },
  {
    id: "roles",
    question: { en: "Can I limit what my staff can see and do?" },
    answer: { en: "Yes. Roles (owner, manager, catalogue staff, counter/POS staff, fulfilment staff, read-only) scope both visibility and edit rights per account." },
  },
  {
    id: "api",
    question: { en: "Is there an API if I need to connect Framique to another tool?" },
    answer: { en: "Yes. A REST API covers products, orders, inventory and customers, and webhooks fire on order, payment and inventory events for custom automation." },
  },
  {
    id: "scope",
    question: { en: "What doesn't Framique do today that I should know before switching?" },
    answer: { en: "No native marketplace sync (e.g. Daraz), no built-in accounting/VAT filing, no automatic multi-warehouse routing, and the admin/builder UI is English-only today — see the honesty section above for the full list." },
  },
  {
    id: "speed",
    question: { en: "How fast does the storefront load on an average customer's phone?" },
    answer: { en: "The platform enforces a budget of 2.5 seconds largest contentful paint on a simulated mid-tier Android device over a 4G connection, and caps shipped JavaScript per storefront page at 170KB gzipped." },
  },
];

/* -------------------------------------------------------------------------- */
/* 18 — Final CTA                                                             */
/* -------------------------------------------------------------------------- */

export const FINAL_CTA = {
  title: { en: "See it against your own catalogue.", bn: "আপনার নিজের ক্যাটালগে দেখুন।" },
  body: {
    en: "Import your products, connect one payment rail and one courier, and judge the whole system on real data — not a demo store.",
  },
  primaryCta: { en: "Start free — no card" },
  altCta: { en: "Book a walkthrough" },
} satisfies Record<string, Bilingual>;
