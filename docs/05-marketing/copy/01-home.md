# `/` — Home

Route: `src/routes/index.tsx` · Shell: `PublicShell` · Scope: `.fq-site`

## SEO

- **Title** (57): `Framique — Commerce platform built for Bangladesh`
- **Description** (154): `Storefront, bKash and Nagad payments, courier fulfilment and POS in one platform. Bangla-first, BDT rails, live in a day. Start free — no card.`
- **og:title**: `Sell in Bangladesh. Ship worldwide.`
- **og:description**: `One platform for storefront, payments, fulfilment and POS — on BDT rails, in Bangla.`
- **og:type**: `website` · **canonical**: `/` · **og:url**: `/`
- **JSON-LD**: `Organization` + `WebSite` (root), `FAQPage` on this route only if the FAQ band ships verbatim.
- **H1**: one only — the hero line. Every other band opens at `h2`.
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `ecommerce platform bangladesh`
  - **Secondary**:
    - `online store bangladesh`
    - `bkash payment gateway for website`
    - `nagad ecommerce integration`
    - `cash on delivery ecommerce platform`
    - `bangla ecommerce website builder`
  - **Long-tail / question intents**:
    - `how to start an online store in bangladesh`
    - `best ecommerce platform for bkash and nagad`
    - `sell online in bangladesh with cash on delivery`
  - **Placement**: H1 + hero sub (primary), rails band (bkash/nagad), COD economics band (cash on delivery), themes band (website builder). Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

## Band order

hero → rails marquee → product tour (Z-flip, 6 rows) → themes showcase → numbers → comparison → COD economics worked example → pricing teaser → stories → FAQ → final CTA.

---

## 1. Hero — canvas + aurora

*Lever: processing fluency + specificity bias. Two nouns the visitor already owns ("Bangladesh", "worldwide"), zero jargon. The brain resolves concrete nouns faster than abstract category words like "platform" or "solution," so conversion lifts when the H1 avoids both.*

- **Eyebrow** (glass pill): `Built in Dhaka · bKash, Nagad, card, COD`
- **H1**: **Sell in Bangladesh. Ship worldwide.**
- **Sub**: Storefront, payments, courier and POS in one platform — in Bangla, on BDT rails, live in a day.
- **Primary CTA**: `Start free — no card`
- **Secondary CTA**: `See a live store`
- **Under-CTA microcopy** *(risk reversal)*: 14-day trial. Export your data any time. No setup fee.
- **BN H1**: বাংলাদেশে বিক্রি করুন। সারা বিশ্বে পাঠান।
- **BN sub**: স্টোরফ্রন্ট, পেমেন্ট, কুরিয়ার আর POS — এক প্ল্যাটফর্মে, বাংলায়, টাকায়।

**Design note**: hero sits on a low-alpha aurora mesh (violet → teal, 8% opacity), drifting on the standard 24–38s loop. The H1 uses `display-xxl` at desktop, dropping to `display-lg` under 640px so Bangla matras never clip. No gradient text — white ink only, per the Do/Don't rule against overusing chroma.

Underneath the two CTAs, a one-line proof strip anchors the promise in something checkable rather than aspirational: `Trusted by merchants shipping across Dhaka, Chattogram, Sylhet and beyond.` This avoids inventing a customer count while still signalling geographic reach, which matters to a Bangladeshi merchant deciding whether a platform understands their courier map.

## 2. Rails proof — glass strip marquee

*Lever: social proof by association. Marks, not adjectives — a merchant recognizes bKash's logo faster than they read the word "trusted," and recognition triggers a lower-friction trust judgment than reading claims.*

- **Kicker**: `Money moves on rails your customers already trust`
- Marks: bKash · Nagad · Rocket · Upay · Visa · Mastercard · COD · SteadFast · Pathao · RedX · Paperfly
- **Footnote**: Every rail settles against an order — no unmatched taka.
- **BN kicker**: আপনার গ্রাহক যেসব মাধ্যম আগে থেকেই বিশ্বাস করেন, টাকা সেভাবেই চলে

**Design note**: single glass strip, logos at 60% opacity resting, 100% on hover, scrolling marquee pauses on `prefers-reduced-motion`. This band exists to answer the merchant's first silent objection — "will this actually take bKash?" — before they scroll to the fold that explains it.

## 3. Product tour — Z / flip rows (glass grid), 6 rows

*Lever: processing fluency across the whole tour. Alternating 60/40 rows; one claim, one proof, one UI still each. Text left → right → left → right → left → right, so the eye never has to relearn a scan pattern mid-page.*

| # | Direction | H3 | Body | Proof chip |
|---|---|---|---|---|
| 1 | text-left | Launch a storefront, not a ticket | Pick a theme, drag sections, publish. Bangla and English from the same catalogue — no duplicate products, no translation plugin drifting out of sync. | `Live in a day` |
| 2 | text-right | Checkout that survives a COD market | bKash, Nagad, card and cash on delivery in one flow, with fraud scoring before the courier is booked — so you catch a bad order before you pay for a failed delivery, not after. | `4 rails, 1 checkout` |
| 3 | text-left | Fulfilment without a second tab | Book pickups, print labels and read delivery status inside the same order drawer. No copy-pasting an address between your storefront and a courier's separate merchant portal. | `4 couriers` |
| 4 | text-right | Numbers you can act on tonight | Revenue, return rate and rail mix per store, refreshed live — not a nightly CSV export someone has to remember to pull. | `Live dashboard` |
| 5 | text-left | Catalogue hygiene that holds at scale | Variants, stock thresholds and Bangla product copy live in one product record, so a size-out-of-stock in Sylhet doesn't quietly still show "in stock" to a buyer in Khulna. | `One source of truth` |
| 6 | text-right | A POS that shares the same ledger | Ring up a counter sale and it reconciles against the same inventory and revenue numbers as your online orders — no separate spreadsheet to merge at month end. | `Online + offline, one ledger` |

**Design note**: each row is a 60/40 glass grid, image or UI still occupies the 40% column, alternating sides on odd/even rows. Reveal-on-enter once, 420ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Proof chips use `button-glass` styling, not a badge component, to stay inside the two-surface hierarchy.

**Why six rows and not four**: the fourth capability (courier fulfilment) is the one most competitors bolt on as an integration; rows 5 and 6 (catalogue hygiene, unified POS ledger) are the two operational pain points Bangladeshi merchants report most often when moving off spreadsheets — they are proof the platform was built for the whole operation, not just the storefront.

## 4. Themes showcase — glass card grid (new band)

*Lever: choice architecture. Five options, each named for a use case rather than a design adjective, reduces decision fatigue versus an open-ended "customize everything" promise — and naming the exact count ("5 official themes") sets an honest, checkable expectation.*

**H2**: Five themes. Pick the one that matches how you actually sell.
**Sub**: Every theme ships production-ready — no theme-store hunting, no premium unlock fee.

**Classic** — a timeless wide grid built for a broad catalogue: apparel, homeware, general stores with 50+ SKUs across several categories. Use it when your merchandising problem is *navigation*, not persuasion — customers arrive knowing roughly what they want and need to find it fast. Category rails stay visible, filters sit above the fold, and product cards prioritize price and stock status over lifestyle imagery.

**Modern** — an airy editorial lookbook for brands where the photography does the selling: fashion, beauty, home décor. Wide-format hero imagery, generous whitespace, and a slower scroll rhythm trade density for atmosphere. Use it when your margin depends on perceived quality, because this theme's whitespace is itself a signal of price positioning — a cramped grid reads as a discount store even if the price tags say otherwise.

**Landing** — a single-product conversion page: one hero, one offer, one CTA, repeated proof bands stacked to the fold line. Built for a launch, a limited drop, or a paid-traffic campaign where every visitor should see the same linear argument in the same order. Do not use Landing for a multi-product catalogue — it actively suppresses category navigation because that navigation would be a conversion leak, not a convenience.

**Supershop** — grocery-aisle density with quick-add on every card, built for baskets of 10–30 low-consideration items rather than one considered purchase. Sticky cart summary, quantity steppers inline on the grid, and aisle-style category chips replace the wide hero — because a grocery buyer's job is speed and completeness, not inspiration. Pairs naturally with COD and cash-heavy checkout flows since basket sizes are small and frequent.

**B2B** — a quote-first wholesale layout: tiered pricing tables replace a single price tag, minimum order quantities are enforced at the cart, and a request-a-quote flow sits ahead of the standard checkout for buyers who need net-30 terms or bulk negotiation. Use it when your buyer is a business, not a household — the entire page removes impulse-purchase cues (countdown timers, "only 3 left") because a wholesale buyer is evaluating supplier reliability, not urgency.

### Pick your theme

| If your store is… | Choose | Because |
|---|---|---|
| A broad catalogue, many categories | Classic | Navigation-first grid, filters above the fold |
| Fashion, beauty, home décor | Modern | Photography-led, whitespace signals price tier |
| A single hero product or campaign | Landing | Linear proof stack, one CTA, no category leak |
| Grocery, FMCG, small frequent baskets | Supershop | Quick-add density, sticky cart, COD-friendly |
| Wholesale, distributors, business buyers | B2B | Tiered pricing, MOQ enforcement, quote flow |

**BN sub**: পাঁচটি থিম। আপনি যেভাবে বিক্রি করেন, সেই অনুযায়ী একটি বেছে নিন।

**Design note**: five glass cards, 3-up desktop / 2-up tablet / 1-up mobile, each with a single UI screenshot cropped to its signature interaction (Classic's filter rail, Supershop's quick-add stepper, B2B's tier table). No gradient spotlight here — five cards of equal visual weight communicates "five real, equal options," not "one hero product with four afterthoughts."

## 5. Numbers band — canvas, 4-up, count-up

*Lever: specificity bias. Read live from the database or the metric is omitted — never a decorative figure. A number the visitor can imagine being queried right now reads as evidence; a number that sounds rounded for effect reads as marketing and triggers skepticism, which is worse than showing no number at all.*

- Orders processed · Stores live · Rails supported · Median checkout time
- **Caption**: Live platform counters, not marketing estimates.

**Design note**: each stat count-up animates once on enter, 900ms ease-out, and freezes at the true polled value — no infinite looping counters, which read as fake. If any counter's underlying query is unavailable at render time, that tile is omitted from the grid rather than backfilled with a placeholder digit.

## 6. Comparison — surface-1 table, expanded to three alternatives

*Lever: loss aversion, applied against the three real alternatives a Bangladeshi merchant actually considers — not a straw-man competitor. Framing the cost of the status quo (what they're already doing) is more persuasive than framing the cost of a rival product, because the visitor already feels that cost.*

**H2**: What you stop paying for.
**Sub**: Merchants arrive here from three starting points. Here is the honest cost of each.

| | Framique | Generic page builder + plugins | Marketplace-only selling | Offline-only (shop + phone orders) |
|---|---|---|---|---|
| bKash / Nagad settlement | Reconciled per order automatically | Manual statement matching against a spreadsheet | Marketplace controls the payout schedule and cut | Manual cash count, no digital trail |
| Bangla storefront | First-class, one catalogue | Duplicate products or a translation plugin that drifts | Bangla support varies by marketplace, not yours to control | N/A — no storefront |
| Courier booking | Inside the order drawer | Separate courier portal, copy-paste address | Marketplace's own courier, no choice | Manual phone call per delivery |
| Per-order fee | None beyond your plan | None from the builder, but plugin fees stack | Commission on every sale, often 8–20% | None, but no reach beyond walk-in/word of mouth |
| Catalogue ownership | Yours; export any time | Yours, but scattered across plugins | Marketplace's rules govern your listing, not you | Yours, but undigitized |
| Data export | CSV or API, any time | Depends on each plugin vendor | Limited or none — you don't own the customer record | N/A |
| Discoverability outside the platform | Your own domain, your own SEO | Your own domain, SEO fragmented by plugin cruft | High marketplace traffic, but you rent every customer | None beyond existing footfall |
| Time to first sale | Hours to a day | Days to weeks assembling plugins | Hours, but customer stays the marketplace's | Immediate, but ceiling is local foot traffic |

**Close**: Every hour spent reconciling bKash statements by hand, or every percentage point paid to a marketplace on every single order, is money and time not spent sourcing product or answering customers.

**BN close**: হাতে হাতে বিকাশ স্টেটমেন্ট মেলানোর প্রতিটি ঘণ্টা, বা মার্কেটপ্লেসকে দেওয়া প্রতিটি কমিশন — তা বিক্রি বাড়ানোর সুযোগ হারানো।

## 7. Economics of a COD order — worked example (new band)

*Lever: concreteness effect. An abstract claim like "reduce your return rate" persuades far less than a worked table with explicit assumptions the reader can check against their own numbers — it lets the merchant do the math themselves rather than trust a marketing adjective.*

**H2**: What a returned COD order actually costs you.

Cash on delivery is the majority payment method for first-time online buyers in Bangladesh, and it is also the single biggest hidden cost in the unit economics of a Bangladeshi storefront — not because of fraud, but because of *return rate*: the share of dispatched COD orders the customer refuses at the door. Below is a worked example with stated assumptions; substitute your own numbers.

**Assumptions** (stated, not measured): average order value ৳1,200; product cost ৳600; forward courier fee ৳70; return courier fee (product coming back) ৳60; packaging ৳25; COD return rate 18% (a commonly cited range for unmoderated COD checkouts is 15–30%, before any fraud-scoring or address-verification step).

| Line item | Successful delivery | Returned at doorstep |
|---|---|---|
| Order value collected | ৳1,200 | ৳0 |
| Product cost | −৳600 | −৳600 (not recovered until restocked) |
| Forward courier fee | −৳70 | −৳70 (courier is paid whether or not the customer accepts) |
| Return courier fee | ৳0 | −৳60 |
| Packaging | −৳25 | −৳25 (not reusable) |
| **Net result** | **+৳505** | **−৳755** |

**The arithmetic that matters**: with an 18% return rate, out of 100 dispatched orders, 82 succeed and 18 return. 82 × ৳505 = ৳41,410 gained; 18 × ৳755 = ৳13,590 lost. Net profit across 100 orders: ৳27,820 — meaning the return rate alone consumed roughly a third of the gross profit the successful orders generated. Cut the return rate from 18% to 10% with the same volume, and net profit rises to 90 × ৳505 − 10 × ৳755 = ৳45,450 − ৳7,550 = ৳37,900 — a 36% improvement in bottom-line profit with zero change in traffic or pricing.

**Three levers that move this number, in the order Framique applies them:**

1. **Phone verification before dispatch** — an automated confirmation call or SMS-and-reply step catches orders placed on impulse or with a mistyped number before a courier fee is ever spent.
2. **Fraud and risk scoring at checkout** — repeat-refusal phone numbers and mismatched delivery addresses are flagged before the order is booked, not after the courier reports a failed delivery.
3. **Partial prepayment nudges** — offering a small bKash/Nagad advance (even ৳50–100) at checkout, with COD covering the remainder, measurably filters low-intent orders because it asks for a small commitment before delivery.

**Design note**: this band sits on canvas with a single surface-1 table — no gradient card, because a worked financial example should read as sober documentation, not a marketing highlight. A caption under the table restates: *These are worked assumptions for illustration, not a guarantee — run the same formula with your own AOV, return rate and courier fees.*

**BN note**: এটি একটি ধারণাগত উদাহরণ, প্রতিশ্রুতি নয় — নিজের গড় অর্ডার মূল্য, রিটার্ন রেট ও কুরিয়ার খরচ দিয়ে হিসাব করুন।

## 8. Pricing teaser — surface-1 cards, featured surface-2

*Lever: transparent framing reduces perceived risk more than a discount would — merchants who have been burned by marketplace commissions specifically look for the absence of a per-order tax.*

**H2**: Pricing that stays honest at scale.
**Sub**: Every plan includes bKash, Nagad, card and COD. No per-order tax on your growth.
**CTA**: `See all plans` · alt `Talk to sales`
**BN sub**: প্রতিটি প্ল্যানে বিকাশ, নগদ, কার্ড ও ক্যাশ অন ডেলিভারি অন্তর্ভুক্ত। বিক্রি বাড়লেও কোনো অতিরিক্ত কমিশন নেই।

**Design note**: three or four `pricing-card` tiles, the recommended tier promoted to `pricing-card-featured` (surface-2, one step brighter). No gradient spotlight on pricing — chroma is reserved for the FAQ-adjacent final CTA so pricing reads as a neutral, comparable decision rather than a sales push.

## 9. Stories — glass cards + one aurora spotlight

*Lever: authority + endowment. Real merchants, real receipts; no invented testimonials, no placeholder names, no fabricated quote. Absence of proof is more credible than fabricated proof.*

**H2**: Stores that grew on Framique.
**Sub**: Real merchants, real numbers. Pulled from their live dashboards.
**CTA**: `Read the stories`

**Placeholder rules for this band** (binding until real case studies exist):
- No name, logo, quote, or number may be invented to fill this band. If no verified merchant story exists yet, the band ships as an empty state: `Case studies are being verified with real merchants — check back soon`, with the CTA disabled or hidden.
- Once a story is available, it must cite metrics the merchant has agreed to disclose, sourced from their own dashboard, with an explicit date range (e.g., "Q2 2025, 6 months post-launch") — never an undated or rounded-for-effect figure.
- Photography must be the merchant's own product or storefront, not stock imagery standing in for them.
- One story may sit in an aurora spotlight card as the featured story; the rest remain glass cards at equal weight — mirroring the themes band's "no favourites beyond one" rule.

## 10. FAQ — canvas, native `<details>`, 10 questions

1. **Can I keep my current domain?** Yes. Point it at Framique and we issue the certificate automatically — there is no separate DNS product to buy or manual verification ticket to wait on.
2. **Do you take a cut of each order?** No. You pay your plan; rail fees go to bKash, Nagad or your card processor directly, at their published rates — Framique does not add a markup on top of the payment rail's own fee.
3. **Is the storefront really Bangla-first?** Bangla and English are the same catalogue with separate copy fields per product, not a translation plugin sitting on top of an English-only structure — so a price change or stock update applies to both languages at once.
4. **What if COD orders come back?** Returns are logged against the order and the courier, so your return rate is a measurable number you can act on — see the worked COD economics example above for how much a single percentage point of return rate is actually worth.
5. **Can I leave?** Export products, orders and customers to CSV or the API whenever you want. There is no minimum contract term that blocks an export, and no proprietary format that requires manual re-entry elsewhere.
6. **Which couriers can I book without leaving the order screen?** SteadFast, Pathao, RedX and Paperfly are integrated at checkout and fulfilment level today — you choose per order or set a default, and label printing happens from the same drawer.
7. **How does VAT/Mushak work on the platform?** Framique surfaces the fields needed to record VAT-relevant information per order (rate applied, invoice reference), but VAT/Mushak compliance is ultimately your obligation as the registered business — confirm your specific filing requirements with the NBR or your accountant, since thresholds and categories change by business type and turnover.
8. **What happens around Eid or Pohela Boishakh, when order volume spikes?** Seasonal spikes stress two things first: courier pickup capacity and checkout speed under concurrent load. Plan courier pickup windows a week ahead of the peak rather than the day of, and pre-verify high-volume SKUs' stock counts, since a stockout discovered mid-checkout during a traffic spike costs more in abandoned carts than any single marketing push recovers.
9. **Do I need a developer to launch?** No — the five official themes (Classic, Modern, Landing, Supershop, B2B) are drag-and-drop configurable. A developer becomes useful only if you want custom logic beyond the storefront, which the REST API supports.
10. **Is there a limit on how many products or orders I can have?** Plan tiers differ by feature access (advanced reporting, number of staff seats, API rate limits) rather than by an artificial cap on catalogue size — check the pricing page for the specific plan-by-plan breakdown before committing.

**BN Q1**: আমি কি আমার বর্তমান ডোমেইন রাখতে পারব? — হ্যাঁ। ডোমেইন পয়েন্ট করলেই সার্টিফিকেট স্বয়ংক্রিয়ভাবে ইস্যু হয়।

**Design note**: 10 rows on canvas, `faq-row` styling, single-open accordion behaviour with `<details>`/`<summary>` for native accessibility and no JS dependency for basic expand/collapse. JSON-LD `FAQPage` schema mirrors exactly these 10 Q&A pairs verbatim — no paraphrasing between the visible copy and the structured data, since mismatched schema risks a search-console penalty.

## 11. Final CTA — aurora spotlight card

*Lever: risk reversal, single decision. One card, one gradient, one choice — after ten bands of information, the final CTA deliberately narrows options rather than adding a third path, because decision fatigue at the bottom of a long page suppresses conversion more than at the top.*

**H2**: Your first order is one afternoon away.
**Sub**: Start free, connect bKash, and take a real order today.
**Primary**: `Start free — no card` · **Alt**: `Book a 20-minute walkthrough`
**BN H2**: আপনার প্রথম অর্ডার এক বিকেলের দূরত্বে।
**BN sub**: ফ্রি শুরু করুন, বিকাশ সংযুক্ত করুন, আজই একটি সত্যিকারের অর্ডার নিন।

**Design note**: single gradient-spotlight-card (violet-to-teal, per the "one or two gradient cards per long page" rule — this is the second, after the themes band stays flat). Magnetic hover capped at 6px on the primary pill only. Sits directly on canvas with generous section padding above and below so it reads as a deliberate close, not another row.

---

## Internal linking plan

- Hero secondary CTA (`See a live store`) → `/showcase` or a specific live storefront demo route.
- Themes showcase cards → `/themes/classic`, `/themes/modern`, `/themes/landing`, `/themes/supershop`, `/themes/b2b` (or equivalent theme detail routes) for deeper merchandising guidance per theme.
- Comparison band → `/pricing` (for the per-order-fee row) and `/docs/exports` (for the data-export row), so a skeptical reader can verify the claim rather than take it on faith.
- COD economics band → `/docs/fraud-scoring` and `/docs/courier-fulfilment` for merchants who want the mechanism behind the three levers, not just the arithmetic.
- Pricing teaser → `/pricing` (primary) and `/contact-sales` (alt).
- Stories band CTA → `/stories` index, disabled/hidden until real case studies exist per the placeholder rule.
- FAQ Q6 (couriers) → `/integrations/couriers`; FAQ Q7 (VAT) → `/docs/tax-and-compliance`.
- Final CTA primary → signup flow; alt → a bookable calendar route for a walkthrough.

## Image / graphics brief

- Hero: abstract aurora mesh background (violet/teal, 8% opacity, no literal photography) plus one foreground UI still of a live storefront on a device frame — real product screenshot, not a mockup illustration.
- Rails marquee: authentic vector logos for bKash, Nagad, Rocket, Upay, Visa, Mastercard, SteadFast, Pathao, RedX, Paperfly — monochrome-tinted to 60% opacity at rest, full colour on hover.
- Product tour: six UI stills, one per row, each cropped tightly to the specific interaction named in the H3 (theme editor drag handle, checkout rail selector, order drawer courier panel, live dashboard chart, product variant editor, POS counter-sale screen).
- Themes showcase: five screenshots, one per theme, each cropped to that theme's signature element (Classic's filter rail, Modern's full-bleed lookbook hero, Landing's single-CTA fold, Supershop's quick-add stepper grid, B2B's tiered price table).
- COD economics: no illustration — a clean data table only, to preserve the "sober documentation" tone.
- Final CTA: gradient card background only, no imagery layered on top, to keep the close visually quiet against ten preceding bands of content.

## Icon list

Storefront/theme icon, bKash/Nagad/card/COD payment icons, courier/box icon, dashboard/chart icon, catalogue/tag icon, POS/register icon, checkmark (risk reversal), export/download icon, shield (fraud scoring), phone/verification icon.

## Motion spec

- Reveal-on-enter once per band, opacity + 16px translate-Y, 320–420ms, `cubic-bezier(0.22, 1, 0.36, 1)` — never re-triggers on re-scroll.
- Aurora backgrounds drift on a 24–38s loop, low-alpha, never behind body text directly.
- Numbers band count-up: 900ms ease-out, freezes at true polled value, no looping.
- Rails marquee: continuous horizontal scroll, pauses on hover and under `prefers-reduced-motion`.
- Magnetic hover: primary CTA pills only, capped at 6px displacement.
- Everything collapses to instant/static state under `prefers-reduced-motion: reduce`.

## Accessibility + Bangla notes

- Body text (`ink-muted` on `canvas`) clears 7:1 contrast; gradient-card text uses white ink at ≥4.5:1 against the darkest gradient stop, checked per card since gradient stops vary (violet/magenta/orange/teal).
- FAQ uses native `<details>`/`<summary>` so screen readers and keyboard users get expand/collapse without custom ARIA wiring.
- All Bangla strings are marked `lang="bn"` at the element level so `bangla-display` typography rules apply and latin negative tracking is explicitly zeroed — matras must never clip in headline line-height.
- Bangla headline line-boxes stay at 1.35+ line-height per the design system rule, even inside otherwise-tight display type contexts like the hero H1.
- Every CTA label is unique text (not "Click here") so it is unambiguous when read out of visual context by assistive tech.
- Count-up numbers include an `aria-live="polite"` region only if the final value, not the animation, needs to be announced — the animation itself is decorative.

## Measurement

- Hero: primary vs secondary CTA click-through rate, split by detected locale (`bn` vs `en`) to see whether Bangla visitors convert differently on the same H1.
- Rails marquee: hover/tap rate per logo, as a proxy for which payment rail visitors are specifically checking for before continuing.
- Product tour: scroll-depth per row and time-in-view, to identify which of the six capabilities holds attention longest (a signal for which capability to lead with in future hero tests).
- Themes showcase: click-through rate per theme card and, downstream, actual theme selection rate at signup — to check whether the showcase's stated guidance matches real merchant behaviour.
- Numbers band: verify the counter query latency does not block first paint; log any instance where a counter is omitted due to unavailable data.
- Comparison table: which row (if any) drives hover/expand interaction longest, as a signal for which objection is strongest among visitors.
- COD economics band: time-on-band and scroll-past rate, since this is the densest content block on the page — a high bounce here signals the worked example needs simplifying, not cutting.
- Pricing teaser: click-through split between `See all plans` and `Talk to sales`, segmented by traffic source.
- FAQ: which questions are expanded most often, to prioritize which objections need earlier, more prominent treatment higher up the page in future iterations.
- Final CTA: conversion rate compared against the hero's primary CTA conversion rate, to measure whether the intervening content (bands 2–10) meaningfully lifts intent by the time a visitor reaches the bottom of the page.
