# `/features`

Route: `src/routes/features.tsx`
Shell: marketing top-nav + footer. Canvas `{colors.canvas}` throughout; two spotlight cards max per viewport per DESIGN.md.
Scope: full product surface — storefront/builder, catalogue, checkout/payments, fulfilment/couriers, POS/omnichannel, analytics/API — plus data model, themes, language, roles, automation, performance, scope honesty, comparison, FAQ, CTA.

## SEO

- **Title** (58 chars): `Features — storefront, payments, fulfilment, analytics`
- **Description** (159 chars): `Catalogue, checkout, bKash/Nagad/Rocket/Upay, courier labels, POS and analytics as one Bangladesh-first system — not six tools stitched together with webhooks.`
- **og:title**: `One platform. Every part of the sale.`
- **og:description**: `Catalogue, checkout, fulfilment, POS and analytics on one data model, built for Bangladeshi commerce.`
- **canonical / og:url**: `/features`
- **JSON-LD**: `BreadcrumbList` (Home → Features) + `ItemList` of the six pillars (name, description, url anchor).
- **H1 rule**: exactly one H1 per page, in the hero; every band below uses H2, sub-bands use H3. No skipped heading levels.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `ecommerce platform features`
  - **Secondary**:
    - `online store builder features`
    - `multi channel inventory management bangladesh`
    - `pos and ecommerce in one system`
    - `bangla english product catalogue`
  - **Long-tail / question intents**:
    - `ecommerce platform with pos and courier integration`
    - `what features does an online store need in bangladesh`
  - **Placement**: H1 (primary), pillar grid card titles (one secondary each), data-model band (inventory), POS band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/features`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

## Band order

1. Hero
2. Pillar grid (6 glass cards, anchor links)
3. Unified data model band
4. Pillar 1 — Storefront & builder (Z row + sub-band)
5. Pillar 2 — Catalogue & inventory (flip row + sub-band)
6. Pillar 3 — Checkout & payments (Z row + sub-band)
7. Pillar 4 — Fulfilment & couriers (flip row + sub-band)
8. Pillar 5 — POS & omnichannel (Z row + sub-band)
9. Pillar 6 — Analytics & API (flip row + sub-band)
10. Five official themes band
11. Multi-language / Bangla-first band
12. Roles & permissions band
13. Automation & webhooks band
14. Performance budget band
15. What we do not do yet (honesty band)
16. Comparison table — Framique vs. stitching separate tools
17. FAQ (10)
18. Final CTA (aurora spotlight)

---

## 1. Hero

*Lever: specificity beats hype — naming the six pillars up front removes ambiguity about scope before the reader invests time.*

- **Eyebrow**: `Six pillars, one data model`
- **H1**: **One platform. Every part of the sale.**
- **Sub**: Storefront, catalogue, checkout, fulfilment, point of sale and analytics — designed as one system, not six plugins glued together with webhooks.
- **Primary CTA**: `Explore the builder` · **Alt**: `See pricing`
- **বাংলা eyebrow**: `ছয়টি স্তম্ভ, একটি ডেটা মডেল`
- **বাংলা H1**: **একটি প্ল্যাটফর্ম। বিক্রির প্রতিটি ধাপ।**

**Design note**: aurora mesh (violet, low alpha) behind the H1 only; product screenshot floats right on a glass card at elevation 2, 60/40 split, collapses to stacked at 900px.

---

## 2. Pillar grid — 6 glass cards, anchored

*Lever: a scannable map before the deep dive respects the reader's time and lets them jump straight to the pillar they came for.*

| Icon | Pillar | Line | Anchor |
|---|---|---|---|
| `layout-template` | Storefront & builder | Sections, tokens, versions, instant rollback. | `#storefront` |
| `package` | Catalogue & inventory | Options, variants, stock and Bangla copy on one product. | `#catalogue` |
| `credit-card` | Checkout & payments | Four rails, one flow, tuned for COD-heavy baskets. | `#checkout` |
| `truck` | Fulfilment & couriers | Labels, pickups and delivery status inside the order. | `#fulfilment` |
| `store` | POS & omnichannel | Same product, same stock, counter and web. | `#pos` |
| `bar-chart-3` | Analytics & API | Revenue, returns and rail mix — live, and exportable. | `#analytics` |

**Design note**: 3-up → 2-up at 900px → 1-up at 640px, per DESIGN.md grid rule. Each card links to its band; keyboard focus ring uses the 0.35-alpha blue focus token.

---

## 3. The unified data model — one product, many surfaces

*Lever: the "single source of truth" mental model is the strongest differentiator claim in this document — it must be taught, not asserted, so the reader can verify it against their own pain.*

Most Bangladeshi merchants we've spoken with run at least three tools that each think they own the product record: a storefront theme, a spreadsheet for stock, and a courier panel for order status. Framique treats a **product** as one row with fan-out, not three rows kept in sync by hand.

**How it works.** A product has a canonical ID. Everything else — its storefront listing, its POS button, its stock ledger entry, its analytics dimension, its order line item — reads and writes against that same ID. There is no import job, no CSV round-trip, no "sync in progress" spinner between your shop and your counter.

**What changes together, automatically:**

| You edit | What updates without a second click |
|---|---|
| Price in the builder | Storefront price, POS price, API price, cart already open on a customer's phone (on next fetch) |
| Stock count at checkout | Available-to-sell number on storefront, POS, and low-stock alerts |
| Bangla product name | Storefront (bn locale), receipt printed at POS, order confirmation SMS |
| Variant options (size/colour) | SKU generation, per-variant stock, per-variant price, courier weight used for rate lookup |
| Order status from courier webhook | Order timeline, customer tracking page, analytics fulfilment-time metric |

**Worked example.** Assume a merchant sells a printed panjabi in three sizes and two colours — six SKUs from one product. A customer orders the medium, white variant from the storefront at 9:40pm. At 9:41pm the merchant sells the last medium, white unit in person at a physical counter using POS. Framique decrements the same stock ledger row twice, in order, and the storefront listing shows "out of stock — this size" before a third buyer can add it to cart. No separate stock file, no evening reconciliation.

**Design note**: single glass card, elevation 2, centred diagram — one product node with four spokes (storefront, POS, API, analytics) redrawing on scroll-in, motion per DESIGN.md (opacity + transform, 320–520ms, once).

---

## 4. Storefront & builder

*Lever: loss aversion on control — merchants fear being boxed into a template; showing token-level edit + versioning removes that fear concretely.*

**text-left (Z row)**

**H2**: The builder is where the shop becomes yours.
Drag sections, edit design tokens, publish a version — with instant rollback if a change hurts conversion. Every publish is a snapshot, not an overwrite.
*Proof*: `Every publish is a version. Every version can be restored.`

**বাংলা proof**: `প্রতিটি প্রকাশ একটি সংস্করণ। প্রতিটি সংস্করণ ফিরিয়ে আনা যায়।`

### 4.1 Capability table

| Capability | What it does | Who uses it |
|---|---|---|
| Section library | Hero, product grid, testimonial-free trust bands, FAQ, footer — drag to reorder | Store owner, no developer |
| Token editor | Colour, type scale, spacing per store, inherited by every section | Store owner or designer |
| Version history | Every publish snapshotted; rollback in one click | Store owner |
| Custom domain | Point your own domain, TLS issued automatically | Store owner |
| Draft/preview links | Share an unpublished version before go-live | Store owner, agency |
| Mobile-first canvas | Every section authored mobile-first, desktop is the enhancement | Builder engine |

### 4.2 How a merchant actually uses this on a Tuesday

It's Eid-collection week. The merchant wants to swap the homepage hero for a festive banner without touching the rest of the site. She opens the builder, drags the existing hero section down one slot, drops in a new hero pointed at the Eid collection, and previews it on a draft link she sends to her business partner over WhatsApp. Her partner replies "the button colour is too dark to read" — she opens the token editor, nudges the CTA fill token, and the change propagates to every section using that token, not just the hero. She publishes. Forty minutes later a return customer complains the homepage looks different and she preferred the old layout — she opens version history and rolls back to the version from three days ago in one click, then re-applies just the button-colour fix on top of it.

**Design note**: 60/40 split, screenshot right showing token panel + section list; glass card elevation 2.

---

## 5. Catalogue & inventory

*Lever: reducing perceived effort — "one SKU, two languages" reframes bilingual catalogues from double-entry chore to a default state.*

**text-right (flip row)**

**H2**: Catalogue that speaks Bangla natively.
Options and variants generate real SKUs, each with its own stock and price. Bangla and English are two copies of one product, so a stock change is never two edits.
*Proof*: `One SKU, two languages, one stock number.`

**বাংলা proof**: `একটি SKU, দুই ভাষা, একটি স্টক সংখ্যা।`

### 5.1 Capability table

| Capability | What it does |
|---|---|
| Options & variants | Up to 3 option dimensions (e.g. size, colour, material) auto-generate SKUs |
| Per-variant stock | Each SKU carries its own available-to-sell count, reserved count, and reorder threshold |
| Bilingual fields | Name, description and search tags stored per-locale on one product record |
| Bulk import/export | CSV round-trip for merchants migrating an existing catalogue |
| Low-stock alerts | Threshold per SKU, notification to owner and to any staff role with catalogue access |
| Category tree | Nested categories with per-category storefront sort order |

### 5.2 How a merchant actually uses this on a Tuesday

A saree wholesaler restocks 40 units of a print across four colourways. She uploads a CSV with the new stock counts against existing SKU codes rather than recreating products from scratch. Before publishing the import, the system flags three rows where the SKU code doesn't match anything in the catalogue — likely a typo — so she fixes them in the CSV rather than silently creating four duplicate products. Stock updates instantly on the storefront and at the counter. That afternoon a customer messages in Bangla asking whether the maroon colourway is available in the largest size; the staff member checks the same product page, reads the Bangla name and description, and can answer from the same screen without switching to a translated mirror site.

**Design note**: flip row — image left, copy right (alternates from Pillar 1); category tree UI shown as nested glass rows.

---

## 6. Checkout & payments

*Lever: category-specific credibility — treating COD as first-class rather than a fallback signals the product was built for this market, not adapted from one that wasn't.*

**text-left (Z row)**

**H2**: Checkout built around cash on delivery.
COD is a first-class method, not a fallback: it carries its own fraud rules, its own return path and its own reconciliation, alongside bKash, Nagad, Rocket, Upay and card.
*Proof*: `COD returns land back on the order, automatically.`

**বাংলা proof**: `COD রিটার্ন স্বয়ংক্রিয়ভাবে অর্ডারে ফিরে আসে।`

### 6.1 Capability table

| Rail | Reconciliation | Typical use |
|---|---|---|
| Cash on delivery (COD) | Matched against courier remittance report per order | Majority of first-time and rural buyers |
| bKash | Matched against bKash merchant statement, per transaction ID | Repeat urban buyers, small-ticket |
| Nagad | Matched against Nagad settlement report | Repeat urban buyers |
| Rocket | Matched against Rocket statement | Legacy mobile-money customers |
| Upay | Matched against Upay settlement | Growing segment, telecom-linked wallets |
| Card (Visa/Mastercard via gateway) | Matched against gateway settlement batch | Higher-ticket, urban, B2B |

**Worked example — assumed figures for illustration.** A merchant runs 500 orders in a week: 340 COD, 110 bKash, 30 Nagad, 20 card. Without per-rail reconciliation, "cash collected" and "orders shipped" are two separate spreadsheets someone reconciles manually at week's end. With rail-aware checkout, each order carries its payment method as a first-class field, so the weekly close is a filter, not a project: sum COD orders against the courier's cash-remittance report, sum bKash orders against the bKash statement by transaction ID, and any mismatch surfaces as an unmatched row rather than a missing line in a spreadsheet.

### 6.2 How a merchant actually uses this on a Tuesday

A customer in Rangpur adds three items to cart and chooses COD, because they've never paid this shop before and don't want to send money to an unfamiliar bKash number first. The order is created immediately with a fraud score computed from the customer's phone number, delivery area and order value — this one clears. The merchant's staff hand it to the courier that afternoon. Two days later the customer refuses one item at the door. The courier logs a partial return; Framique receives that status and updates the order to reflect the returned item and the adjusted amount actually collected, without the merchant needing to manually edit the order total or issue a separate refund record.

**Design note**: 60/40 Z row; rail logos as small glass chips, not a marquee (that lives in the integration wall lower on the page).

---

## 7. Fulfilment & couriers

*Lever: reducing anxiety about the physical handoff — showing the courier status living inside the order (not a separate tracking tab) implies control without extra software.*

**text-right (flip row)**

**H2**: Labels, pickups and delivery status inside the order.
Book a courier, print a label and watch delivery status update on the order timeline — no separate courier dashboard open in another tab.
*Proof*: `One order. One timeline. Every courier update lands on it.`

**বাংলা proof**: `একটি অর্ডার। একটি টাইমলাইন। প্রতিটি কুরিয়ার আপডেট এখানেই আসে।`

### 7.1 Capability table

| Courier | Booking | Rate lookup | Status webhook |
|---|---|---|---|
| SteadFast | In-order booking | By weight + area | Live |
| Pathao Courier | In-order booking | By weight + area | Live |
| RedX | In-order booking | By weight + area | Live |
| Paperfly | In-order booking | By weight + area | Live |
| Manual/own rider | Manual status entry | N/A | Manual update |

### 7.2 How a merchant actually uses this on a Tuesday

Ten orders came in overnight. The merchant opens the order queue, filters to "ready to ship," and books all ten with one courier in a single batch action rather than opening each order separately. Labels print as a single PDF batch. Two hours later, one parcel is marked "failed delivery attempt" by the courier's webhook; that status appears on the order timeline automatically and the order moves into a "needs follow-up" view without anyone refreshing a courier's own tracking page. The merchant calls the customer, reschedules, and re-books the same label rather than creating a duplicate order.

**Design note**: flip row; timeline UI shown as vertical glass strip with courier status pills using semantic-success green only for "delivered."

---

## 8. POS & omnichannel

*Lever: consistency — a merchant who trusts the online stock number will only keep trusting it if the counter uses the identical number; this band exists to remove the "which system is right" doubt.*

**text-left (Z row)**

**H2**: Same product, same stock, counter and web.
Ring up a sale at a physical counter and the storefront stock count moves in the same instant — because it's the same row, not a synced copy.
*Proof*: `The counter and the storefront read the same stock ledger.`

**বাংলা proof**: `কাউন্টার এবং স্টোরফ্রন্ট একই স্টক লেজার পড়ে।`

### 8.1 Capability table

| Capability | What it does |
|---|---|
| Counter sale flow | Barcode/search product, take payment (cash, bKash, card), print or SMS receipt |
| Shared stock ledger | Same availability number online and at counter, decremented at time of sale |
| Offline queue | Counter can take sales during a connectivity drop; syncs when back online |
| Staff shift log | Each POS sale is attributed to the logged-in staff account |
| Returns at counter | Refund or exchange against the original order, whether it was placed online or in person |

### 8.2 How a merchant actually uses this on a Tuesday

A shop has a small storefront and a physical counter in the same neighbourhood. A walk-in buys the last unit of a scarf that's also listed online. The staff member rings it up at POS; the online listing shows out-of-stock before the next online visitor can add it to cart. Later that day the shop's internet drops for twenty minutes during a routine outage — the counter keeps taking sales locally and queues them, syncing the stock decrements the moment connectivity returns, rather than freezing the till or trusting an outdated printed stock sheet.

**Design note**: Z row; POS screenshot shown on a tablet-shaped glass frame to visually distinguish it from the storefront browser frame used elsewhere.

---

## 9. Analytics & API

*Lever: authority through verifiability — "every metric has a query behind it" pre-empts the skepticism merchants bring after being burned by vanity dashboards elsewhere.*

**text-right (flip row)**

**H2**: Analytics you can defend in a meeting.
Every number traces to rows you can export. No modelled estimates, no rounded vanity metrics — and a REST API when you need the number somewhere else.
*Proof*: `Every metric has a query behind it.`

**বাংলা proof**: `প্রতিটি মেট্রিকের পেছনে একটি কোয়েরি আছে।`

### 9.1 Capability table

| Capability | What it does |
|---|---|
| Live revenue dashboard | Orders, revenue, average order value, updated per new order |
| Rail mix report | Share of revenue by payment method (COD/bKash/Nagad/Rocket/Upay/card) |
| Return-rate report | Returns by product, by rail, by delivery area |
| CSV export | Any report exports to CSV with the underlying row-level data |
| REST API | Products, orders, inventory, customers — read and write, token-scoped |
| Webhook events | Order created, order status changed, payment settled, stock threshold crossed |

### 9.2 How a merchant actually uses this on a Tuesday

At the end of the month, a merchant's accountant asks for the COD-versus-digital-payment split for a bank loan application. Rather than estimating, the merchant opens the rail-mix report, filters to the month, and exports the CSV — the accountant can trace every row back to an order ID if the bank asks for backup. Separately, the merchant's developer has built a small internal tool that emails a daily summary to the owner's phone; it polls the REST API for the previous day's orders rather than scraping the dashboard, because the numbers in the API and the numbers on screen are guaranteed to be the same query.

**Design note**: flip row; chart UI is a real-looking line + bar combo, no invented numbers in copy — captions read "illustrative data" if a dashboard mock is used.

---

## 10. The five official themes — and when each fits

*Lever: reducing decision paralysis — naming exactly five, with a fit-for-purpose table, prevents the reader from either freezing or assuming there are more than there are.*

Framique ships five official themes today. Each is a starting point you can still edit token-by-token in the builder — choosing a theme is not a lock-in decision.

| Theme | Built for | Typical band count | Notable trait |
|---|---|---|---|
| Classic | General retail, apparel, gifting | 6–8 | Balanced grid, neutral type scale, safe default |
| Modern | Fashion, beauty, higher-margin goods | 5–7 | Larger imagery, tighter type, fewer bands per page |
| Landing | Single-product or campaign launches | 3–5 | Built to convert one SKU or one collection, minimal navigation |
| Supershop | Wide catalogues, groceries, multi-category | 8–10 | Dense grid, category rail up front, search-forward |
| B2B | Wholesale, trade accounts, quote-based selling | 6–9 | Login-gated pricing, quantity breaks, quote-request flow instead of instant checkout |

**Decision framework**: if the catalogue is under 30 SKUs and centred on one collection, start with Landing. If it's a wide multi-category shop with daily repeat buyers, start with Supershop. If pricing depends on the buyer's account (trade, wholesale), start with B2B — its checkout flow assumes a login before price is shown. Everything else starts with Classic or Modern depending on whether the aesthetic priority is breadth (Classic) or image-led minimalism (Modern).

**Design note**: 5-up card row → 2-up at 900px; each card shows a thumbnail crop of the theme's homepage, no gradient card usage here (reserve aurora for the two dedicated spotlight bands).

---

## 11. Multi-language, Bangla-first

*Lever: category ownership — most competitors treat Bangla as a translation layer bolted onto a Latin-first product; naming the structural difference (matra-safe line height, no inherited negative tracking) demonstrates rather than claims it.*

Bangla is not a translated skin over an English product. Product fields, storefront copy, receipts, SMS notifications and staff-facing labels are stored per-locale from the schema up. Two structural choices follow through the whole product:

- **Type never clips a matra.** Bangla display type keeps a 1.35+ line-height box and drops inherited Latin negative tracking to zero, so conjuncts and matras render at full height even inside a compact hero.
- **A product page is one record, two reading experiences.** Editing the Bangla name field does not create a second product; it fills a locale slot on the same SKU, so stock, price and variant logic stay singular even when the storefront is bilingual.

| Surface | Bangla support today |
|---|---|
| Storefront (customer-facing) | Full: product, cart, checkout, order-status page |
| POS (staff-facing) | Full: search, product labels, receipt |
| Order confirmation SMS | Full, per-store default language setting |
| Analytics dashboard | English only today (see honesty band) |
| Admin/builder UI | English only today (see honesty band) |

**Design note**: split-screen sample — same product card rendered in `lang="en"` and `lang="bn"`, same height, to visually prove the matra-safe claim rather than describe it.

---

## 12. Roles & permissions

*Lever: risk reduction for the owner — a named, scoped permission model reassures an owner who wants staff to use the system without being able to see revenue or change prices.*

A shop is rarely run by one person. Framique scopes access by role rather than giving every logged-in staff member full owner access.

| Role | Can see | Can do |
|---|---|---|
| Owner | Everything | Everything, including billing and staff management |
| Manager | Orders, catalogue, analytics | Edit catalogue, process orders and returns, cannot change billing |
| Catalogue staff | Products, stock | Add/edit products and stock, cannot see revenue reports |
| Counter/POS staff | Products, stock, POS sales | Ring up sales, process counter returns, no storefront/builder access |
| Fulfilment staff | Orders, courier status | Book couriers, print labels, update manual delivery status |
| Read-only/accountant | Analytics, exports | View and export reports, no edit access anywhere |

**How a merchant actually uses this on a Tuesday**: a shop owner hires a part-time counter assistant for Eid week. She's given the Counter/POS role — she can ring up sales and see stock, but cannot see the store's overall revenue report or change any product's price. When the temporary hire's contract ends, the owner deactivates the role in one action rather than needing to change a shared password everyone knew.

**Design note**: table rendered as glass rows with a small role-icon per row; no avatar imagery (avoid implying named testimonials).

---

## 13. Automation & webhooks

*Lever: showing the "escape hatch" for technical buyers — API/webhook depth signals the platform won't become a ceiling once the merchant outgrows point-and-click configuration.*

Not every workflow fits inside the dashboard. Webhooks and the REST API let a merchant or their developer react to events the moment they happen.

| Event | Typical automation built on it |
|---|---|
| `order.created` | Send a custom WhatsApp confirmation via a third-party messaging tool |
| `order.status_changed` | Trigger an SMS when a courier marks a parcel out for delivery |
| `payment.settled` | Push a row into an external accounting spreadsheet or tool |
| `inventory.threshold_crossed` | Notify a supplier's messaging channel to trigger a reorder |
| `customer.created` | Add the customer to an email or SMS marketing list |

**Worked example.** A merchant's supplier only accepts reorders by a specific spreadsheet format sent over email. Rather than checking stock manually every few days, the merchant's developer subscribes to `inventory.threshold_crossed`, and a small script formats the affected SKUs into the supplier's expected spreadsheet and emails it automatically the moment stock crosses the reorder line — turning a recurring manual check into a one-time integration.

**Design note**: code-block style card showing a minimal illustrative JSON payload for one event, monospace on `{colors.surface-1}`, no invented account data.

---

## 14. Performance budget

*Lever: trust through measurable commitment — a stated budget, not a vague "fast," gives technical buyers something to hold the product accountable to.*

Storefronts are judged on load time by both customers on mid-range Android phones over 3G/4G and by search engines. Framique enforces a performance budget at the platform level rather than leaving it to each theme's discretion.

| Metric | Budget | Why it matters here |
|---|---|---|
| Largest Contentful Paint | ≤ 2.5s on a simulated mid-tier Android + 4G profile | Majority of storefront traffic in this market is mobile, not desktop |
| Total JS shipped per storefront page | ≤ 170KB gzipped | Keeps parse/execute time low on lower-end CPUs |
| Image delivery | Responsive `srcset`, WebP/AVIF with fallback, lazy below the fold | Product photography is heavy; this keeps it from dominating load time |
| Time to first byte | ≤ 400ms from a Bangladesh-region edge | Checkout abandonment correlates strongly with delay at this exact step |

**Design note**: this band uses a plain data table, no gradient card — the tone here is engineering honesty, not celebration.

---

## 15. What we do not do yet

*Lever: honest scope-limiting builds more trust than an unqualified feature list — a buyer who catches one overclaim discounts every other claim on the page.*

Framique is not everything. Being direct about the edges of the current product saves an evaluating merchant time and avoids a bad-fit sale.

- **No native marketplace listing sync** (Daraz, Facebook Shop) yet — orders from those channels still need manual entry or a third-party connector.
- **No built-in accounting/VAT filing** — analytics exports the row-level data; a bookkeeper or an external accounting tool still does the filing.
- **No multi-warehouse routing logic yet** — stock is per-store today; a merchant with two physical warehouses currently manages them as one pooled stock number, not an automatic nearest-warehouse split.
- **No built-in email marketing composer** — webhooks and the API can feed an external tool, but there is no native campaign builder inside Framique yet.
- **Admin/builder UI is English-only today** — Bangla covers every customer-facing and staff-facing surface, but the merchant-side settings screens are not yet localised (tracked, see language band above).
- **No offline-first storefront** — the POS has an offline sale queue; the customer-facing storefront requires connectivity to load and checkout.

**Design note**: plain list on canvas, no icons implying "coming soon" badges with dates — avoid promising a timeline that isn't committed.

---

## 16. Comparison — one platform vs. stitching separate tools

*Lever: making the switching cost of the status quo visible — most merchants underestimate the ongoing tax of reconciling separate tools until it's itemised.*

| Task | Stitched tools (typical setup) | Framique |
|---|---|---|
| Storefront | One theme platform (often foreign hosting, foreign payment defaults) | Built in, Bangladesh-first payment defaults |
| Payments | Separate gateway integration per rail, manual reconciliation spreadsheet | bKash/Nagad/Rocket/Upay/card/COD reconciled against orders natively |
| Inventory sync between web and counter | Manual recount or a third-party sync plugin, often lagging by hours | Same stock ledger, same instant |
| Courier booking | Log into each courier's own panel separately, copy tracking numbers back into orders by hand | Booked from the order, status returns automatically |
| Bilingual catalogue | Duplicate product records in two languages, kept in sync manually | One product, two locale fields |
| Reporting | Export from each tool, reconcile in a spreadsheet before a meeting | One dashboard, exportable, one query per metric |
| Staff access | Shared logins or no access control at all | Role-scoped accounts per staff function |
| Point of integration failure | Each sync job is a place data can silently drift | One data model — nothing to keep "in sync" because there's one record |

**Design note**: this table can carry the page's second gradient-spotlight treatment behind the "Framique" column header only, per DESIGN.md's one-or-two-gradients-per-page rule; keep the "stitched tools" column flat/neutral to avoid looking like an attack ad — tone stays factual.

---

## 17. FAQ

*Lever: answering the specific objections a Bangladeshi merchant would actually raise, in their own framing, reduces the perceived risk of switching.*

1. **Does Framique support bKash, Nagad, Rocket and Upay at checkout, or only card payments?**
   All four local wallets, plus card and cash on delivery, are supported at checkout with per-rail reconciliation against orders.

2. **Can I keep cash on delivery as my main payment method?**
   Yes. COD is treated as a first-class payment method with its own fraud rules and return handling, not a fallback bolted onto a card-first checkout.

3. **Which couriers can I book directly from an order?**
   SteadFast, Pathao Courier, RedX and Paperfly are integrated for in-order booking, label printing and status webhooks. Any other courier can be tracked with manual status updates.

4. **Is the storefront actually bilingual, or is Bangla just a translated overlay?**
   Bangla is stored as locale fields on the same product, order and customer records used by the English side — not a separate translated site kept in sync manually.

5. **How many storefront themes are available, and can I customise them?**
   Five official themes ship today — Classic, Modern, Landing, Supershop and B2B. Every theme remains fully editable in the builder down to individual design tokens.

6. **Do the physical counter and the online storefront share the same stock count?**
   Yes. POS and storefront read and write the same stock ledger row per SKU; a sale at the counter is reflected online in the same instant.

7. **Can I limit what my staff can see and do?**
   Yes. Roles (owner, manager, catalogue staff, counter/POS staff, fulfilment staff, read-only) scope both visibility and edit rights per account.

8. **Is there an API if I need to connect Framique to another tool?**
   Yes. A REST API covers products, orders, inventory and customers, and webhooks fire on order, payment and inventory events for custom automation.

9. **What doesn't Framique do today that I should know before switching?**
   No native marketplace sync (e.g. Daraz), no built-in accounting/VAT filing, no automatic multi-warehouse routing, and the admin/builder UI is English-only today — see the honesty section above for the full list.

10. **How fast does the storefront load on an average customer's phone?**
    The platform enforces a budget of 2.5 seconds largest contentful paint on a simulated mid-tier Android device over a 4G connection, and caps shipped JavaScript per storefront page at 170KB gzipped.

**Design note**: `faq-row` component, single-open accordion, canvas background, no gradient in this band.

---

## 18. Final CTA — aurora spotlight

*Lever: specificity of the next step ("your own catalogue," not a generic demo) lowers the activation energy for a merchant already convinced by the deep dives above.*

**H2**: See it against your own catalogue.
**Sub**: Import your products, connect one payment rail and one courier, and judge the whole system on real data — not a demo store.
**Primary CTA**: `Start free — no card`
**Alt CTA**: `Book a walkthrough`

**বাংলা H2**: **আপনার নিজের ক্যাটালগে দেখুন।**

**Design note**: gradient-spotlight-card (violet, per DESIGN.md gradient-spotlight-card token), rounded-xxl, single card centred, no second gradient in the same viewport as the comparison table's spotlight column.

---

## Internal linking plan

- Pillar grid anchors (`#storefront`, `#catalogue`, `#checkout`, `#fulfilment`, `#pos`, `#analytics`) link to their own deep-dive bands within this page.
- "Explore the builder" (hero + mid-page) → `/product/builder` if it exists, else `/features#storefront`.
- "See pricing" (hero alt) → `/pricing`.
- Five themes band → `/themes` gallery if present, else anchors to theme thumbnails staying on-page.
- Comparison table's "Framique" column header → `/pricing#plans`.
- FAQ Q5 (themes) cross-links to the themes band anchor above it.
- FAQ Q9 (what we don't do) cross-links to `#scope-honesty` anchor on the same page.
- Final CTA "Book a walkthrough" → `/contact` or scheduling route.

## Image brief

- Hero: product screenshot on glass frame, builder canvas mid-edit, no fabricated customer names in visible order data — use placeholder order IDs like `#FQ-10231`.
- Pillar deep-dive rows: one UI screenshot per row (builder token panel, bilingual product edit screen, checkout rail selector, order timeline with courier status, POS counter screen on tablet frame, analytics dashboard).
- Unified data model band: custom diagram, not a screenshot — one node, four spokes.
- Five themes band: five homepage thumbnail crops, consistent aspect ratio.
- Bangla band: split-screen same product card in `lang="en"` / `lang="bn"`.
- Automation band: single JSON payload code block, not a screenshot.
- No stock photography of generic "happy shopkeeper" imagery; if photography is used at all, it should be UI-first, not lifestyle-first.

## Icon list (lucide, per band)

`layout-template`, `package`, `credit-card`, `banknote`, `truck`, `store`, `bar-chart-3`, `shield-check`, `languages`, `users`, `webhook`, `gauge`, `git-branch`, `check-circle-2`, `x-circle`, `arrow-right`.

## Motion spec

- All reveal-on-enter animation is opacity + transform only, 320–520ms, `cubic-bezier(0.22, 1, 0.36, 1)`, triggers once per DESIGN.md.
- Z/flip deep-dive rows: image and copy column each fade+translate in from their respective sides (image from its side, copy from the opposite), staggered 80ms.
- Unified data model diagram: spokes draw in sequentially, 120ms stagger per spoke, once on first viewport entry.
- Aurora spotlight cards (themes intro accent, final CTA) drift on a 24–38s loop per DESIGN.md; no drift on the comparison table's gradient column header (kept static so the table stays legible).
- Magnetic hover capped at 6px, primary CTA buttons only (`Start free — no card`, `Explore the builder`).
- Everything collapses to static state under `prefers-reduced-motion: reduce`.

## Accessibility & Bangla notes

- Single H1 in the hero; every pillar deep-dive uses H2; sub-bands (capability table + Tuesday narrative) use H3, never skipping to H4 without an H3 parent.
- All comparison-table and capability-table data is available as a real HTML `<table>` with `<th scope="col">`/`<th scope="row">`, not an image or div-grid, for screen-reader parity.
- Bangla strings render inside `lang="bn"` spans/elements so browsers apply correct hyphenation and font fallback; Latin negative tracking is explicitly zeroed for any element inheriting a display token inside a `lang="bn"` subtree, per DESIGN.md.
- Icon-only elements (role icons in the permissions table, courier logos in the integration wall) carry `aria-label` text equivalents; the integration marquee is `aria-live="off"` and fully keyboard-skippable.
- Colour is never the only signal: courier status pills pair colour with text label ("Delivered", not just green), and the comparison table's two columns are distinguished by column header text, not colour alone.
- Focus rings use the 0.35-alpha blue ring token at elevation 3 on every interactive element, including FAQ accordion triggers and table row links.
- Body copy against canvas maintains the 7:1 contrast floor stated in DESIGN.md; muted ink is never used for text that carries the sole meaning of a row (e.g. price, stock count).

## Measurement plan

- Scroll depth per band, specifically tracking completion rate through the six pillar deep-dives (proxy for whether the page is doing its educational job or being abandoned early).
- Click-through rate on each pillar-grid anchor link, to learn which pillar merchants self-select as their entry concern.
- FAQ expansion rate per question, to identify which objections are most common and candidates for promotion higher up the page.
- Comparison table dwell time (time-in-viewport), as a proxy for whether the stitched-tools framing is landing.
- Primary CTA click-through from hero vs. final CTA, split by whether the visitor expanded any FAQ item first (proxy for "needed convincing" vs. "already sold").
- "What we do not do yet" band dwell time and downstream conversion — tracking whether the honesty band correlates with higher-quality sign-ups (fewer support tickets asking for unbuilt features) rather than just watching for drop-off.
