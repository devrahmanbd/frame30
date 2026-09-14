# `/payments`

Route: `src/routes/payments.tsx` · Shell: marketing layout, dark canvas · Scope: payments, reconciliation, fraud, COD risk, security, finance exports, developer integration.

## SEO

- **Title** (58 chars): `Payments — bKash, Nagad, card, COD, reconciled | Framique`
- **Description** (158 chars): `Accept bKash, Nagad, Rocket, Upay, card and cash on delivery in one checkout. Every taka matches an order, with refunds and payouts you can audit line by line.`
- **og:title**: `bKash, Nagad, card, COD — reconciled.`
- **og:description**: `Every taka settles against an order. Fraud is scored before the courier is booked. Payouts you can audit line by line.`
- **og:image**: `/og/payments.png` (glass card grid render, aurora violet spotlight, Bangla numeral accent)
- **canonical**: `/payments` · **og:url**: `/payments`
- **JSON-LD**: `BreadcrumbList` (Home → Payments), `FAQPage` (10 entries below), `SoftwareApplication` sub-entity for the payments module referencing `applicationCategory: BusinessApplication`.
- **H1 rule**: exactly one `<h1>`, rendered in the hero; every subsequent band uses `<h2>`/`<h3>`. No band repeats the H1 string verbatim.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `bkash nagad payment gateway for ecommerce`
  - **Secondary**:
    - `online payment gateway bangladesh`
    - `cash on delivery reconciliation`
    - `card payment for bd online store`
    - `payment fraud screening bangladesh`
  - **Long-tail / question intents**:
    - `how to accept bkash payment on my website`
    - `reconcile cash on delivery remittance with orders`
    - `which payment gateway is best for bangladeshi ecommerce`
  - **Placement**: H1 (primary), four-rails band, rail comparison table caption, reconciliation band, COD-risk band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/payments`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

## Band order

1. Hero
2. The four rails
3. Rail comparison table
4. The reconciliation engine
5. Refunds and partial refunds
6. Fraud scoring before courier booking
7. COD risk management playbook (worked example)
8. Chargebacks and disputes
9. Checkout conversion design
10. Security — PCI, keys, tokens
11. Payouts and finance exports
12. Built for developers
13. FAQ
14. Final CTA

---

## 1. Hero — aurora spotlight

*Lever: specificity beats hype — naming the actual rails and the actual failure mode (unreconciled cash) signals domain competence before any claim is made.*

- **Eyebrow**: `Four rails · one ledger`
- **H1**: **bKash, Nagad, card, COD — reconciled.**
- **Sub**: Every taka settles against an order. Refunds, courier collections and payouts write to the same ledger, so nothing depends on a spreadsheet at month end.
- **Primary CTA**: `See the rails` (anchors to Band 2) · **Alt CTA**: `Read the settlement docs` (links to `/docs/payments`)
- **Bangla variants**:
  - Eyebrow: `চারটি রেল · একটি লেজার`
  - H1: **বিকাশ, নগদ, কার্ড, সিওডি — মিলিয়ে দেখা যায়।**
  - Sub: প্রতিটি টাকা একটি অর্ডারের সাথে মিলে যায়। রিফান্ড, কুরিয়ার কালেকশন আর পেআউট একই লেজারে লেখা হয়।
- **Design note**: canvas background, aurora violet + teal mesh at low alpha behind the headline, no gradient card in the hero itself. H1 uses `display-xl` (76px/-3.4px). Four small glass pill chips beneath the sub row the rail names (`bKash` `Nagad` `Rocket/Upay` `Card` `COD`) with their own brand-neutral icon marks — flat outline, not brand logos, to avoid trademark misuse; confirm logo usage rights with each PSP before shipping brand marks.

---

## 2. The four rails — glass card grid, 4-up → 2-up → 1-up

*Lever: categorisation reduces perceived complexity — four named rails feel finite and masterable, versus an open-ended "many payment methods."*

Bangladeshi checkout has to cover four structurally different payment behaviours, not four cosmetic buttons. Framique treats each rail as a first-class object with its own authorisation flow, failure surface and refund path — but every rail writes to the same order and ledger schema, so reporting never forks by method.

**Rail 1 — Mobile financial services (MFS): bKash, Nagad, Rocket, Upay**
The dominant rail for most Bangladeshi baskets. Checkout opens a hosted or in-app flow, the customer confirms with their MFS PIN, and Framique receives a webhook confirming or declining the transaction. Confirmation is typically fast — most flows resolve in seconds — but network and app-switch congestion during peak hours can add latency, so the checkout UI must hold state gracefully rather than let the customer resubmit and double-pay.

**Rail 2 — Cards: Visa, Mastercard, and locally issued cards**
Runs through your existing merchant account with your acquiring bank or payment gateway (Framique does not become your acquirer). Framique's gateway layer normalises the 3-D Secure challenge, authorisation, and capture events into the same order timeline as MFS. Chargeback and dispute events, when your processor reports them, post as timeline entries on the order.

**Rail 3 — Bank transfer / net banking**
For B2B and higher-ticket transactions, direct bank transfer or net-banking redirect is often the rail buyers actually prefer, even where MFS exists — procurement teams frequently require a bank-traceable transfer for their own accounting. Settlement is bank-cleared, not instant, so orders paid this way sit in a "payment pending confirmation" state until the bank feed or manual match closes it.

**Rail 4 — Cash on delivery (COD)**
Still the largest single rail by order count in much of Bangladesh's e-commerce market, and the one most platforms treat as an afterthought. Framique treats COD as a real payment method with a real settlement event: the courier collects, remits to you (per your courier's cash-collection cycle), and that remittance is matched to the original order the same way a bKash webhook is matched. COD is also the rail carrying the most risk — fake orders, refusals at the door, address failures — which is why it gets fraud scoring and a dedicated risk playbook (Bands 6–7).

| Rail | Card copy | Detail line |
|---|---|---|
| MFS (bKash, Nagad, Rocket, Upay) | The default for most baskets. | Hosted or in-app checkout, webhook-confirmed, refund-to-wallet supported. |
| Card (Visa, Mastercard) | Runs on your existing merchant account. | 3-D Secure, chargeback events post to the order timeline. |
| Bank / net banking | The rail procurement teams ask for. | Redirect or manual reference match; settlement is bank-cleared, not instant. |
| COD | Treated as a real method, not an exception. | Fraud scored pre-booking, courier-collected, remittance reconciled. |

**Design note**: 4-up glass card grid on canvas, each card `{components.glass-card}` with a small monochrome rail icon top-left, headline in `display-md`, detail in `body`/`ink-muted`. Cards collapse to 2-up at 900px, 1-up at 640px per the grid spec in DESIGN.md.

---

## 3. Rail comparison table — full-width, canvas band

*Lever: a structured comparison table lets a buyer self-serve the "which rail should I lead with" decision instead of reading four paragraphs and guessing — reduces decision fatigue.*

This is the table to bring into a finance or ops conversation. Numbers below are typical ranges reported by merchants and PSPs operating in Bangladesh; confirm exact settlement cycles and MDR with your specific bKash/Nagad merchant agreement and your card acquirer, since terms vary by account tier and are updated periodically by the providers.

| Rail | Typical settlement timing | Common failure modes | Refund path | Reconciliation difficulty | Best-fit basket size |
|---|---|---|---|---|---|
| MFS (bKash/Nagad/Rocket/Upay) | Near-real-time confirmation; merchant payout per your MFS settlement cycle (commonly T+1 to T+3 business days — confirm with your provider) | PIN entry timeout, app-switch drop, insufficient balance, duplicate submission on slow networks | Refund-to-wallet via the same rail, usually 1–3 business days | Low — webhook gives a hard match to transaction ID | Low to mid ticket, high frequency |
| Card (Visa/Mastercard) | Authorised instantly; settlement per your acquirer's cycle (commonly T+1 to T+5) | 3-D Secure abandonment, issuer decline, expired card, network timeout on OTP step | Refund to card, can take 5–14 business days depending on issuer | Medium — needs processor reference reconciled against gateway callback | Mid to high ticket |
| Bank transfer / net banking | Bank-cleared, typically same-day to T+2 depending on bank cutoff times | Wrong reference number, delayed batch clearing, redirect drop-off | Manual bank transfer back, days not minutes | High — often needs a human to match a bank statement line to an order | High ticket, B2B, wholesale |
| COD | Cash collected on delivery; remitted by courier per their cycle (commonly weekly or twice-weekly) | Customer refusal at door, unreachable address, wrong address, partial acceptance | Refund is a non-event on accepted orders; on refusal, order simply reverts to unpaid/returned | High — depends entirely on courier remittance reports matching your order set | Low to mid ticket, price-sensitive segments |

**Reading the table as a decision framework**: if your average order value is under roughly ৳1,000 and your audience is mobile-first, MFS should be your default rail with COD as the fallback. If you sell above roughly ৳10,000 or to institutional buyers, expect bank transfer to carry a disproportionate share of revenue even if it's a minority of order count — build your reconciliation process around that rail's slower, human-matched settlement rather than assuming it behaves like MFS. If COD exceeds roughly 40–50% of your order volume, the risk playbook in Band 7 is not optional — it directly protects margin.

**Bangla variant of table header row**: `রেল` · `সেটেলমেন্ট সময়` · `সাধারণ ব্যর্থতা` · `রিফান্ড পথ` · `মিলকরণের কঠিনতা` · `উপযুক্ত বাস্কেট সাইজ`

**Design note**: standard markdown-rendered table inside a full-width canvas band, hairline row dividers (`{colors.hairline-soft}`), header row in `ink` at full opacity, body rows in `ink-muted`. Table becomes a horizontally scrollable card stack below 640px with each rail as its own mini glass card — never a squeezed table on mobile.

---

## 4. The reconciliation engine — Z layout, text-left

*Lever: process transparency (showing the mechanism, not just the promise) builds trust with finance and ops buyers who have been burned by "trust us" payment claims before.*

Reconciliation is the actual product here — not the checkout button. The mechanism:

1. **Every payment event writes an immutable row** keyed to a rail transaction reference and an order ID. Nothing is inferred from a total; every row is a single event you can trace back to a specific webhook, gateway callback, or courier remittance line.
2. **Idempotency keys prevent double-counting.** Every inbound payment webhook carries (or is assigned) an idempotency key. If a rail retries a webhook — which MFS and card gateways routinely do on their end to guarantee delivery — Framique recognises the duplicate and discards it rather than crediting the order twice. This matters because a naive integration that doesn't dedupe webhooks will occasionally show a customer as having paid twice for one order, which then requires a manual refund to fix a problem that should never have existed.
3. **Webhook retries are handled on both sides.** If Framique's endpoint is briefly unreachable (deploy, network blip), the rail retries per its own backoff schedule and Framique's queue also polls the gateway's status API as a fallback, so a single missed webhook does not silently leave an order in "payment pending" forever.
4. **Unmatched-taka queue.** Any inbound settlement amount that cannot be matched to an order automatically — a bank transfer with a garbled reference, a COD remittance batch that doesn't sum cleanly against expected orders — lands in a dedicated queue with the raw evidence attached (bank line, courier manifest row, gateway payload). It is visible, has an age, and can be assigned an owner. This is the direct fix for the "spreadsheet night" failure mode most merchants describe: money arrives, nobody quite knows which order it belongs to, and it sits unresolved for weeks.

**Worked example**: a merchant processes 800 orders in a week — 500 via bKash, 150 via card, 50 via bank transfer, 100 COD. In a spreadsheet-based process, the bank transfers (50 orders) are the ones that eat finance time, because each requires opening the bank statement and matching a reference by eye; at even 3 minutes per match, that's 2.5 hours a week of manual work for 6% of order volume. Framique auto-matches transfers with a clean reference and routes only the genuinely ambiguous ones (typically under 10% of bank transfers) to the unmatched-taka queue — cutting the manual load to roughly 15 minutes a week.

*Proof strings*:
- `Exception queue with an owner and an age.`
- `Idempotency key on every webhook — no double-credited orders.`
- `Unmatched-taka queue: visible, owned, resolvable — not silent.`

**Bangla variant of section label**: `রিকনসিলিয়েশন ইঞ্জিন — প্রতিটি টাকা একটি অর্ডারের সাথে মিলে যায়`

**Design note**: text-left column with the numbered mechanism list; right column is a CSS-drawn flow diagram: `Rail webhook → Idempotency check → Order match → Ledger row → (if unmatched) Exception queue`. Diagram uses thin signal-blue connective lines on glass nodes, motion: nodes fade/slide in sequence on scroll-enter, once only.

---

## 5. Refunds and partial refunds — Z layout, text-right

*Lever: reducing perceived risk of the platform itself — a merchant who can picture exactly how a refund propagates trusts the system enough to grant refunds generously, which in turn improves their own customer experience.*

A refund in Framique is one transaction that updates four records at once: the order status, the payment record, the ledger, and the customer's order timeline. This atomicity matters — a refund that updates the ledger but not the order (or vice versa) is exactly how merchants end up with support tickets that contradict their own accounting.

**Full refunds** reverse the original payment via the same rail where the rail supports it (MFS refund-to-wallet, card refund-to-card). Where a rail doesn't support programmatic refund reversal (some bank transfer cases), Framique records the refund as a manual-payout obligation and tracks it until marked settled, so it never just disappears from the queue.

**Partial refunds** — for a damaged item within a multi-item order, or a negotiated partial return — apply against the specific order line, not just the order total, so your product-level margin and return-rate reporting stays accurate down to the SKU. A partial refund on a ৳3,500 order for one ৳800 line item reduces that order's recognised revenue to ৳2,700 and flags only that SKU in returns analytics — not the whole order.

**Refund SLAs by rail** (typical, confirm with your provider):

| Rail | Typical refund time to customer |
|---|---|
| MFS | 1–3 business days |
| Card | 5–14 business days (issuer-dependent) |
| Bank transfer | Manual, days |
| COD | N/A — unpaid orders simply revert; no cash to return unless a prepaid deposit was collected |

*Proof*: `One transaction, four consistent records.`

**Design note**: right-column narrative, left column shows a small before/after ledger snippet mock (glass card, monospace figures, signal-blue diff highlight on the changed row) illustrating a partial refund updating one SKU line.

---

## 6. Fraud scoring before courier booking — Z layout, text-left

*Lever: loss aversion — framing fraud prevention as "a lost parcel avoided" rather than an abstract security feature makes the benefit concrete and immediate to a merchant who has felt that specific loss.*

The costliest fraud event in Bangladeshi e-commerce isn't a stolen card — it's a COD order that ties up a courier slot, packaging, and staff time, then gets refused or is simply undeliverable. Framique scores every order for risk **before** the courier is booked, not after, so a bad order costs you a review-queue click, not a wasted delivery attempt.

**The signal list** (each contributes to a composite score, not a single pass/fail gate):

- **Velocity**: number of orders from the same phone number, device fingerprint, or shipping address in a rolling window (e.g., 3+ orders in 24 hours from one number is a flag, not an automatic block).
- **Blacklist match**: phone number or address present on your own repeat-refuser list (Band 7) or a shared negative list where you've opted in.
- **Address quality**: whether the address parses to a deliverable, specific location versus a vague or clearly incomplete string ("Dhaka" with no further detail).
- **Basket anomaly**: order value or item combination well outside the customer's or the store's typical pattern (e.g., first-time customer ordering 20 units of a single high-value item).
- **Device / network signal**: known VPN or datacenter IP ranges, device reuse across many distinct customer identities.
- **Honeypot fields**: hidden form fields that a human never fills but a bot script often does.
- **Channel signal**: orders arriving through unusually rapid, scripted-looking checkout completion times.

**How thresholds are tuned**: Framique ships with a conservative default threshold intended to catch obvious abuse without over-flagging genuine customers. From there, tuning is a merchant-level decision, not a platform-wide one, because risk tolerance genuinely differs by category — a ৳500 fashion accessory merchant can absorb far more refusals than a ৳15,000 electronics merchant. The recommended tuning loop:

1. Start at the default threshold and let two to four weeks of real order volume pass through untouched.
2. Pull the review-queue report: how many flagged orders were genuinely fraudulent versus false positives (real customers who got flagged and had to confirm manually).
3. If false positives exceed roughly 20% of flagged orders, loosen the threshold on the weakest-signal contributors (usually basket anomaly) first, since those are most prone to flagging legitimate first-time high-value customers.
4. If fraudulent orders are still reaching courier booking, tighten velocity and address-quality weights before adding new signals — most missed fraud is a threshold problem, not a missing-signal problem.
5. Re-check quarterly; fraud patterns shift with seasonal demand (Eid, Pohela Boishakh peaks attract more testing of the checkout by bad actors).

*Proof*: `Review queue instead of a lost parcel.`

**Design note**: left text column carries the numbered tuning loop; right column renders the signal list as a compact glass checklist card with small dot indicators (signal-blue for active, ink-muted for informational-only signals).

---

## 7. COD risk management playbook — glass card grid + worked example

*Lever: giving the merchant an operational playbook (not just a feature) transfers competence and positions Framique as a partner in margin protection, not merely a payment processor.*

COD risk is manageable with process, not just software. Framique's playbook combines five levers:

**1. OTP confirmation before dispatch.** An SMS one-time code sent to the customer's phone before the order ships, confirmed by the customer, cuts fake and impulsive orders substantially — a customer who won't confirm a code rarely intended to accept the parcel.

**2. Address quality checks.** Structured address fields (division, district, thana, specific landmark) instead of a single free-text box, cross-checked against your courier's serviceable-area list before the order is even confirmed, catches undeliverable addresses at order time instead of at the door.

**3. Repeat-refuser lists.** Every refused COD delivery is logged against the phone number and address. Once a threshold is crossed (e.g., two refusals in 60 days), that identity is automatically routed to "prepayment required" rather than blocked outright — this preserves the sale while removing the delivery risk.

**4. Prepayment nudges.** At checkout, customers who select COD can be offered a small discount or free-shipping incentive to switch to MFS instead. Because MFS is usually the customer's default payment habit anyway, this nudge often converts a meaningful share of COD selections without any friction, directly lowering your refusal-exposed order share.

**5. Partial advance.** For higher-ticket COD orders, requiring a small non-refundable advance (e.g., ৳100–৳200 via MFS) before dispatch filters out low-intent orders while still letting genuinely price-sensitive or trust-cautious customers pay the balance on delivery.

**Worked example — return-rate impact on margin**

Assume a merchant runs ৳50,000 in COD gross order value per week, with a 30% average gross margin, and a 20% COD refusal/return rate (a realistic pre-intervention figure for many Bangladeshi COD-heavy stores).

| Metric | Before playbook | After playbook (refusal rate cut to 8%) |
|---|---|---|
| Weekly COD order value | ৳50,000 | ৳50,000 |
| Refusal rate | 20% | 8% |
| Value lost to refusals | ৳10,000 | ৳4,000 |
| Delivery attempt cost per refused order (courier fee, packaging, staff time — assume ৳120 avg) | on ~40 refused orders (avg ticket ৳250): ৳4,800 | on ~16 refused orders: ৳1,920 |
| Net weekly cost of COD friction (lost margin + wasted delivery cost) | ৳10,000 × 30% margin-on-cost proxy is not the right lens here — the real cost is the wasted delivery spend plus the opportunity cost of the tied-up inventory and slot: **≈ ৳4,800 in direct wasted delivery cost** | **≈ ৳1,920 in direct wasted delivery cost** |
| Weekly saving from the playbook | — | **≈ ৳2,880**, before accounting for the OTP/address/advance measures reducing refusals further over time |

The assumptions above (average ticket, per-attempt cost, starting refusal rate) will vary by category and courier contract — rerun this table with your own numbers before presenting it internally; the structure of the calculation (refusal rate × order volume × per-attempt cost) is the reusable part, not the specific figures.

**Bangla variant of playbook headline**: `সিওডি ঝুঁকি ব্যবস্থাপনা — পাঁচটি ধাপ`

**Design note**: 5-up glass card grid (collapsing to 2-up, 1-up) for the levers, each with a numeral badge in signal blue; worked-example table rendered as a distinct canvas sub-band directly beneath, framed by a thin hairline top/bottom border to visually separate "playbook" from "arithmetic."

---

## 8. Chargebacks and disputes — glass card, canvas band

*Lever: proactive disclosure of a negative scenario (chargebacks) before the merchant encounters it themselves builds credibility — platforms that only describe the upside read as incomplete to an experienced merchant.*

Card chargebacks and MFS dispute cases are rarer in Bangladesh than in mature card markets, but they do happen, and they follow the card network's or MFS provider's own dispute process — Framique does not adjudicate disputes on your behalf, since that authority sits with your acquirer or the rail provider under their card network or scheme rules. What Framique does:

- Posts every chargeback or dispute notification your processor sends as a timeline event on the affected order, so it's visible next to the original payment and any fulfilment record.
- Surfaces the evidence you already have — delivery confirmation, OTP confirmation timestamp, courier proof-of-delivery — in one place so you can respond to your processor's dispute request without hunting across systems.
- Flags the customer identity (phone/address) for review on future orders if a dispute is upheld against you, feeding the same repeat-refuser mechanism used for COD risk.

Confirm your specific chargeback response windows and evidence requirements with your card acquirer and with bKash/Nagad merchant support directly — these timelines and formats are set by the providers and can change.

**Design note**: single glass card, `display-md` headline, three-bullet body, small caution-style icon (outline, not filled/red — keep the monochrome discipline; use `ink-muted` not a warning color, since DESIGN.md reserves color for signal/gradient use only).

---

## 9. Checkout conversion design — Z layout, text-right

*Lever: friction reduction — every field removed or pre-filled measurably raises completion rate; phone-first identity matches the actual primary identifier Bangladeshi customers use, rather than forcing an email-first pattern borrowed from Western checkout defaults.*

Checkout design decisions that measurably affect completion in this market:

**Fewest fields possible.** Name, phone, address (structured, not free text), payment method. Email is optional, not required — a large share of COD and MFS customers do not treat email as their primary contact channel, and making it mandatory adds a drop-off point for no reconciliation benefit, since phone number is already the unique identifier tied to the payment rail itself.

**Phone-first identity.** The phone number is the anchor: it's how the customer pays (MFS), how the OTP confirmation reaches them (Band 7), how the courier reaches them, and how repeat-customer recognition works across orders — one phone number should resolve to one customer record regardless of which name variant or address they typed.

**Bangla numerals as a first-class option.** Prices and order confirmations can render in Bangla numerals (০–৯) for stores whose audience expects them, controlled by a per-store locale setting rather than browser-detected only, since browser locale is an unreliable proxy for numeral preference in Bangladesh.

**Address entry as structured fields, not one text box.** Division → District → Thana/Upazila → detailed address line, each a discrete field. This does double duty: it improves delivery accuracy and it feeds the address-quality fraud signal from Band 6 automatically, without asking the customer to do anything differently.

**Checkout field checklist**:

| Field | Required? | Why |
|---|---|---|
| Full name | Yes | Delivery label, order record |
| Phone number | Yes | Payment identity, OTP, courier contact |
| Division/District/Thana | Yes (structured) | Delivery accuracy, fraud signal |
| Detailed address line | Yes | Delivery accuracy |
| Email | No | Optional receipt delivery only |
| Payment method | Yes | Rail selection |
| Order note | No | Optional, e.g. landmark or delivery instruction |

**Bangla variant of section label**: `চেকআউট — সবচেয়ে কম ফিল্ড, ফোন-প্রথম পরিচয়`

**Design note**: text-right narrative; left column shows a simplified checkout form mock in a glass card, phone field visually emphasized (subtle signal-blue focus ring per elevation level 3), Bangla-numeral price displayed beside the latin-numeral toggle to demonstrate the locale setting.

---

## 10. Security — PCI, keys, tokens — canvas band, two-column

*Lever: reducing perceived technical risk for the person actually accountable for compliance (often a co-founder or ops lead, not a developer) by naming the specific mechanisms rather than asserting "bank-grade security," a phrase experienced buyers have learned to distrust.*

Framique does not store raw card numbers on its own servers. Card entry is tokenised by your PCI-DSS-compliant gateway or processor at the point of entry, and Framique stores and operates on the resulting token, not the card data itself — this is the standard tokenisation pattern used to keep a merchant's own PCI compliance scope minimal (typically SAQ-A or SAQ-A-EP-equivalent, depending on your exact checkout integration; confirm your applicable SAQ level with your acquirer or QSA).

**API keys and secrets**: every store gets scoped API keys (read-only, write, webhook-signing) rather than one master key, so a leaked read-only key cannot be used to issue refunds or move payouts. Webhook payloads are signed, and Framique verifies the signature on every inbound rail webhook before trusting its contents, which prevents a spoofed webhook from crediting a fraudulent payment.

**Data handling**: payment credentials in transit are encrypted (TLS); tokens and reference IDs at rest are encrypted; access to the payments module within Framique is permissioned separately from general store admin access, so a staff account with catalog access doesn't automatically have refund authority.

This section intentionally avoids naming a specific compliance certification level or MDR percentage, since both vary by processor, account tier, and jurisdloved terms that change independently of Framique's own release cycle — treat this page as the mechanism explanation, and your PSP/acquirer agreement as the source of truth for exact rates and certifications.

**Design note**: two-column canvas band, left column prose, right column a small glass card showing a redacted "key scopes" table mock (`read`, `write`, `webhook-signing` rows with toggle-style indicators) to make the scoped-key concept visual rather than purely verbal.

---

## 11. Payouts and finance exports — Z layout, text-left

*Lever: speaking directly to the accountant/bookkeeper persona (who is often not the buyer but is the internal blocker) removes a common adoption friction — "will this work with our existing books" — before it's asked.*

Every rail's incoming payments and every payout to your bank account are logged as ledger events, exportable in the format your accountant actually needs:

- **CSV export**, per period (day/week/month/custom range) and per rail, with columns for order ID, rail transaction reference, gross amount, any rail fee if reported by the provider, net amount, and settlement date.
- **API export** for accounting systems that pull data programmatically rather than via manual CSV upload — see Band 12.
- **Payout summary view**: for each payout batch that lands in your bank account, the exact set of orders/transactions that sum to that batch amount, so a bookkeeper can tie a single bank deposit line back to named orders instead of trusting a lump sum.
- **VAT/mushak considerations**: Framique surfaces the transaction-level data your accountant needs to prepare VAT/mushak filings, but does not itself determine your VAT treatment or generate mushak challans — confirm applicable VAT treatment, invoicing format, and mushak requirements for your business type with your accountant or the NBR's current guidance, since these rules are set externally and can change.

**Design note**: left-column narrative; right column shows a compact "payout batch" glass card mock — a bank deposit amount at top, an expandable list of 4–5 contributing order rows beneath, each with a small checkmark to imply the tie-out is automatic. Monospace numerals for all figures, matching the reconciliation diagram treatment in Band 4.

---

## 12. Built for developers — glass card, canvas band, linking to `/docs`

*Lever: credibility signalling to a technical evaluator — a direct, unhyped link to real API/webhook documentation demonstrates the platform is not marketing-only vaporware.*

If you're integrating Framique payments into a custom storefront, a headless frontend, or an existing ERP, the payments module is fully addressable via the REST API:

- **`GET /orders/{id}/payments`** — the full payment event history for an order, including rail, status, amounts, and timestamps.
- **`POST /payments/{id}/refund`** — trigger a full or partial refund; accepts a line-item breakdown for partial refunds.
- **Webhook subscriptions** for `payment.confirmed`, `payment.failed`, `refund.completed`, and `reconciliation.exception_created` — the last one lets you build your own alerting on top of the unmatched-taka queue described in Band 4.
- **Idempotency-Key header** support on all mutating endpoints, matching the internal mechanism described in Band 4, so your own integration code can safely retry without double-processing.
- **Sandbox mode** with simulated MFS/card/COD flows for integration testing before going live with real rails.

**Further reading**: `/docs/payments` (full API reference), `/docs/webhooks` (signature verification and retry semantics), `/docs/reconciliation` (ledger schema and the unmatched-taka queue data model).

**Design note**: single glass card, monospace endpoint list, signal-blue text links to each `/docs/*` path (this is one of the few places on the marketing site where blue appears as inline text, consistent with DESIGN.md's "signal color only — links, focus" rule).

---

## 13. FAQ — canvas band, accordion rows

*Lever: FAQ answers pre-empt the specific objections that stall a payments decision (money custody, provider lock-in, dispute handling) — resolving them in the merchant's own words reduces sales-cycle friction.*

1. **Do you hold my money?**
   No. Rails settle to your own bKash/Nagad/bank/acquirer accounts directly; Framique records and reconciles those settlements against your orders — it does not sit in the custody chain.

2. **Which processors do you support for cards?**
   Any processor or acquiring bank you already hold a merchant account with, connected through Framique's gateway integration layer. Framique does not require you to switch acquirers.

3. **How are COD returns and refusals handled?**
   A refusal or return posts against the original order and the courier trip that carried it, so your return rate is a measured figure from real events, not an estimate from a spreadsheet.

4. **Can I export the ledger for my accountant?**
   Yes — CSV or API, filterable by period and by rail, with a payout-to-order tie-out view described in Band 11.

5. **What happens if a webhook from bKash or my card gateway is delayed or lost?**
   Framique relies on the rail's own retry mechanism plus a status-polling fallback, so a single missed webhook does not leave an order stuck; see Band 4 for the full mechanism.

6. **Do you support partial refunds on multi-item orders?**
   Yes, at the line-item level — a partial refund updates only the affected SKU's revenue and returns figures, not the whole order.

7. **How is COD fraud actually reduced, not just detected?**
   Through the combination described in Band 7 — OTP confirmation, structured address validation, a repeat-refuser list, prepayment nudges toward MFS, and optional partial advance on higher-ticket orders — used together, not any single measure alone.

8. **Do you store card numbers?**
   No. Card entry is tokenised by your PCI-DSS-compliant gateway; Framique stores and operates on the token, not the raw card number. See Band 10.

9. **How do chargebacks get handled?**
   The dispute process itself runs through your acquirer or the rail's own scheme rules; Framique surfaces every dispute event on the order timeline and centralises the evidence (delivery proof, OTP confirmation, timestamps) you need to respond. See Band 8.

10. **Can I adjust fraud-scoring thresholds myself?**
    Yes — thresholds are merchant-configurable, not fixed platform-wide, because risk tolerance differs meaningfully by category and average order value. See the tuning loop in Band 6.

**Bangla variant of FAQ #1** (representative sample): `আপনারা কি আমার টাকা নিজেদের কাছে রাখেন?` / `না। রেলগুলো সরাসরি আপনার নিজের বিকাশ/নগদ/ব্যাংক/অ্যাকোয়ারার অ্যাকাউন্টে সেটেল হয়; ফ্রেমিক শুধু সেই সেটেলমেন্ট আপনার অর্ডারের সাথে মিলিয়ে রেকর্ড রাখে।`

**Design note**: `{components.faq-row}` accordion, one open at a time, canvas background, hairline dividers, chevron rotates on open per the motion spec (opacity+transform only, 320–520ms).

---

## 14. Final CTA — gradient spotlight card

*Lever: urgency without hype — "tonight" is a concrete, near-term time horizon rather than a vague exhortation, and "no card" removes the final objection (cost/commitment) at the exact decision point.*

- **H2**: **Connect bKash today, take an order tonight.**
- **Sub**: Card and COD can follow in the same setup flow. Reconciliation starts on your first order, not your hundredth.
- **Primary CTA**: `Start free — no card`
- **Alt CTA**: `Talk to sales`
- **Bangla variant**:
  - H2: **আজই বিকাশ যুক্ত করুন, আজ রাতেই প্রথম অর্ডার নিন।**
  - Sub: কার্ড আর সিওডি একই সেটআপে যোগ করা যায়। প্রথম অর্ডার থেকেই রিকনসিলিয়েশন শুরু হয়ে যায়।
- **Design note**: `{components.gradient-spotlight-card}` in violet, `rounded.xxl`, white ink at ≥4.5:1 against the darkest gradient stop per DESIGN.md accessibility floor. This is the second and last gradient-spotlight moment on the page (the first being the low-alpha aurora mesh in the hero, which is atmosphere, not a card) — respecting the "one or two per long page" rule.

---

## Internal linking plan

- Hero alt CTA → `/docs/payments`
- Band 4 → `/docs/reconciliation`
- Band 12 → `/docs/payments`, `/docs/webhooks`, `/docs/reconciliation`
- Band 7 → `/couriers` (courier fulfilment page, for OTP/address-serviceability cross-reference)
- Band 10 → `/security` (if a dedicated trust/security page exists; otherwise anchor within this page)
- Band 11 → `/pos` (for merchants who reconcile in-store and online payments together) and `/analytics` (ledger data feeding revenue reporting)
- Final CTA primary → signup flow; alt → `/contact-sales`
- Footer of this page cross-links to `/pricing` (rail-related fee transparency) and `/couriers`

## Image brief

- Hero: no literal payment-card photography; abstract aurora mesh (violet/teal) behind type, optionally a subtle particle field suggesting "many small transactions" without literal iconography.
- Band 2: four flat monochrome outline icons for the rails — wallet/phone icon (MFS), card icon (Card), bank/building icon (Bank), box/hand icon (COD). No third-party brand logos without confirmed usage rights.
- Band 4: CSS/SVG-drawn flow diagram, not a photo or stock illustration — reinforces "this is a real mechanism," per DESIGN.md's preference for constructed UI over decorative imagery.
- Band 7: no photography of a delivery scenario; keep the worked-example table as the visual anchor.
- Band 9: checkout form mock rendered as an actual UI component snapshot (real typography, real spacing tokens), not a stylised illustration.

## Icon list

`wallet-phone` (MFS) · `credit-card` (Card) · `bank-building` (Bank) · `box-hand` (COD) · `link-chain` (reconciliation match) · `arrow-loop` (webhook retry) · `queue-tray` (unmatched-taka queue) · `refund-arrow` (refunds) · `shield-check` (fraud scoring, outline only, ink-muted, never a filled security badge) · `sms-bubble` (OTP) · `map-pin` (address quality) · `key` (API keys) · `download-tray` (exports) · `terminal` (developer band)

## Motion spec

- Band 2 and 7 card grids: staggered fade+translateY(12px→0) on scroll-enter, 380ms, `cubic-bezier(0.22, 1, 0.36, 1)`, once only, 60ms stagger between cards.
- Band 4 diagram: nodes appear in left-to-right sequence on scroll-enter, connective lines draw via `stroke-dashoffset` transition, 420ms per segment.
- Band 13 accordion: height + opacity transition on open/close, 320ms; chevron rotates 180deg over the same duration.
- Final CTA: magnetic hover on primary pill only, capped at 6px displacement, per DESIGN.md.
- All motion collapses to instant state changes under `prefers-reduced-motion: reduce`.

## Accessibility and Bangla notes

- All tables include a proper `<thead>`/`<th scope="col">` structure so screen readers announce column headers per cell — critical for the rail comparison table (Band 3) and the worked-example margin table (Band 7), which are otherwise dense.
- Bangla headline strings (`lang="bn"` subtrees) drop `letter-spacing` to 0 and use `{typography.bangla-display}` per DESIGN.md; no Bangla string ever inherits the latin `-3.4px` tracking value, which would clip matras.
- Bangla numeral toggle (Band 9) is a persisted per-store locale setting, not inferred from browser `Accept-Language` alone, since that header is an unreliable signal for numeral preference among Bangladeshi users on shared or default-locale devices.
- Color is never the sole carrier of state: the fraud-signal checklist (Band 6) and key-scope table (Band 10) pair any dot/toggle indicator with a text label, not color alone.
- Focus rings use the `{elevation.3}` signal-blue ring treatment consistently across the checkout mock, FAQ accordion, and CTA buttons — no custom focus styles per band.
- Body text on canvas (`ink-muted` on `#090909`) already clears 7:1 per DESIGN.md; no band overrides this with a lower-contrast custom tone.

## Measurement plan

- **Hero CTA click-through rate** (`See the rails` vs `Read the settlement docs`) — informs whether visitors are pre-sales-curious or evaluation-ready technical readers.
- **Rail comparison table scroll depth / dwell time** (Band 3) — a proxy for whether visitors are actively comparing rails for a real integration decision versus skimming.
- **FAQ expansion rate per question** — identifies which objections (custody, chargebacks, thresholds) are most live for the current traffic mix; questions with low expansion may be candidates for promotion earlier in the page.
- **`/docs/payments`, `/docs/webhooks`, `/docs/reconciliation` outbound click rate** from Band 12 — leading indicator of developer-led evaluations, distinct from the general merchant funnel.
- **Final CTA conversion rate**, split by whether the visitor scrolled past Band 7 (COD playbook) — tests whether the worked example is actually moving COD-heavy merchants to convert, versus card/MFS-only merchants who may convert earlier.
- **Bangla-locale variant conversion rate** versus latin-locale variant, tracked separately, to validate whether the Bangla numeral and copy variants are pulling their weight or need further localisation investment.
