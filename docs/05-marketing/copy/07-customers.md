# `/customers` — Stories + Proof

Route: `src/routes/customers.tsx` · Shell: marketing (dark canvas, top-nav, footer) · Scope: public, no auth

## SEO

- **Title** (58 chars, 8 words): `Customer stories — verified numbers from Framique merchants`
- **Description** (156 chars, 24 words): `Real Bangladeshi merchants running catalogue, bKash/Nagad/Rocket payments and courier fulfilment on Framique — with numbers pulled from live dashboards, not press releases.`
- **og:title**: `Stores that grew on Framique.`
- **og:description**: `Real merchants, real numbers, real receipts — every figure sourced, every quote consented.`
- **canonical**: `/customers` · **og:url**: `/customers`
- **JSON-LD**: `BreadcrumbList` (Home → Customers), `ItemList` of published stories (name, url, image — only for stories with signed consent), no `Review`/`AggregateRating` schema until a real review corpus exists.
- **H1 rule**: exactly one `<h1>`, in the hero, plain text (no gradient text mask) so screen readers get a clean announcement.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `bangladeshi online store case studies`
  - **Secondary**:
    - `ecommerce success story bangladesh`
    - `merchant results framique`
    - `online business growth bangladesh`
  - **Long-tail / question intents**:
    - `how bangladeshi merchants grow an online store`
    - `real numbers from bangladeshi ecommerce stores`
  - **Placement**: H1 (primary), story card headlines, segment-archetype band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/customers`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

> **Integrity rule, stated once and enforced everywhere below**: no story ships without the merchant's written, dated consent; no number ships that isn't queryable from that merchant's own dashboard by an internal reviewer; no photo of a "founder" who does not exist; no rounding a number in the story's favour. If a number can't be verified this week, it is removed from the card, not softened into a vague claim. This page is proof-of-platform, not a hype reel — treat every fabricated placeholder as a broken build.

## Band order

1. Hero
2. The proof standard (how we build this page)
3. Featured story — aurora spotlight card (TEMPLATE only until real consent exists)
4. Story grid — glass cards (TEMPLATE grid)
5. Five segment archetypes × 5 official themes — operating profiles
6. Metric definitions — compute-it-yourself band
7. How to write your own case study (merchant-facing guide)
8. Proof-of-platform — uptime, status, live counters
9. Submit your story — consent checklist
10. FAQ (10)
11. Final CTA

---

## 1. Hero

*Lever: specificity over superlative — a claim you can check beats a claim you can't.*

- **Eyebrow**: `Consented stories · verified numbers`
- **H1**: **Stores that grew on Framique.**
- **Sub**: Real merchants, real numbers, real receipts. If we can't show you where a figure came from, it doesn't go on this page.
- **Primary CTA**: `Read the stories` (scrolls to grid) · **Alt CTA**: `Start free — no card`
- **বাংলা — Eyebrow**: `সম্মতিপ্রাপ্ত গল্প · যাচাইকৃত সংখ্যা`
- **বাংলা — H1**: **যেসব দোকান ফ্রেমিকে বেড়ে উঠেছে।**
- **বাংলা — Sub**: প্রকৃত ব্যবসায়ী, প্রকৃত সংখ্যা, প্রকৃত রসিদ। কোনো সংখ্যার উৎস দেখাতে না পারলে, সেটা এই পাতায় থাকে না।

**Design note**: canvas band, no gradient mesh under the H1 (this page earns trust through restraint, not atmosphere) — one thin hairline rule under the sub separates hero from the proof-standard band, signalling "read this before the stories."

---

## 2. The proof standard

*Lever: pre-emptive objection handling — state the rules before anyone can accuse you of gaming them.*

Three commitments, each a glass card, canvas band:

| Commitment | What it means in practice | What breaks it |
|---|---|---|
| **Written consent, every time** | We email the merchant a consent form naming the exact figures, quote and photo we intend to publish. We do not publish until we get an explicit yes back, dated and filed. | Publishing from a call transcript. Publishing a metric the merchant didn't sign off on individually. |
| **Dashboard-sourced numbers only** | Every metric on a story card maps to a query an internal reviewer ran against that merchant's own analytics — order count, return rate, time-to-publish, GMV band. The source table and date range are named in a footnote. | Self-reported numbers from a WhatsApp message. Numbers older than the stated period. Numbers that can't be re-run. |
| **No fabricated people or photos** | Every founder photo is either the merchant's own (with consent) or the card ships with no photo — never a stock image standing in for a real person. | Stock photography captioned with a fabricated name. AI-generated "founder" headshots. |

**Design note**: three cards, equal weight, no card allowed to look more "impressive" than another via size — proof standard should read as procedural, not promotional.

---

## 3. Featured story — aurora spotlight card

**STATUS: TEMPLATE. Do not populate with invented details. This is the shape a real story fills, not a real story.**

Structure (single large gradient-spotlight card, violet or teal stop, `{components.gradient-spotlight-card}`):

- **Merchant name**: `{{merchant_name}}` — first name + shop name only, never full legal name unless the merchant requests it
- **Category / city**: `{{category}} · {{city}}`
- **One-sentence situation** (past tense, what was true before): `{{before_situation}}` — e.g. the *shape* is "ran orders over WhatsApp with no catalogue," not an invented sentence
- **What changed** (past tense, one sentence, mechanism not adjective): `{{mechanism_of_change}}`
- **Three metric chips**, each sourced: `{{metric_1_label}}: {{metric_1_value}}` / `{{metric_2_label}}: {{metric_2_value}}` / `{{metric_3_label}}: {{metric_3_value}}`
- **Pull-quote**: `{{verbatim_quote}}` — must be the merchant's own words, lightly trimmed for length only, never rewritten for punch
- **CTA**: `Read the full story`

**Publication checklist before this card goes live** (all must be true):
1. Signed consent form on file, dated within 12 months
2. All three metrics independently re-queried by someone other than the writer, within 7 days of publish
3. Quote read back to the merchant and confirmed verbatim
4. Photo (if any) is the merchant's own, consented separately from the text
5. A named internal reviewer's initials attached to the story record

**Design note**: this band is empty (falls back to the next best available real story, or is hidden entirely) rather than shipping placeholder copy dressed up as real — the moment a real story clears the checklist above, it becomes the featured card.

---

## 4. Story grid — glass cards

**STATUS: TEMPLATE grid — repeats the card shape below for each published, consented story.**

Grid: 3-up desktop → 2-up at 900px → 1-up at 640px, `{components.glass-card}`.

Per card:
- Cover image: 16:9, `loading="lazy"`, explicit width/height, AVIF with WebP fallback, alt text describing the shop (not the merchant's face)
- `{{merchant_name}}` · `{{category}}`
- One metric chip: `{{primary_metric_label}}: {{primary_metric_value}}`
- One-line outcome, mechanism-based: `{{one_line_outcome}}`
- Link: `Read the story →`

**The intake questionnaire we send every merchant before writing a story**

We do not interview freeform and write from memory — we send this exact form, and every published sentence must trace back to an answer on it.

| # | Question | Why we ask it |
|---|---|---|
| 1 | What was the business doing before Framique — platform, process, biggest daily annoyance? | Grounds the "before" sentence in fact, not assumption |
| 2 | What is the single change you'd point to first? | Prevents us inventing a "mechanism of change" |
| 3 | Pick the three numbers you're proudest of this quarter, and tell us which dashboard screen they're on | Lets us verify instead of trusting recall |
| 4 | Is there a number you'd rather we didn't publish, even if it's good? | Respects merchant discretion over their own data |
| 5 | May we quote you directly? If yes, which sentence from this conversation? | Keeps quotes verbatim by design |
| 6 | May we use a photo of you or your shop? If yes, which one, and do we have your permission to publish it here specifically? | Separates image consent from text consent |
| 7 | Is there a competitor, platform or process you'd like us to avoid naming, even indirectly? | Avoids accidental disputes we can't defend |
| 8 | Who should approve the final draft before it goes live — you, or someone else at your business? | Establishes a single accountable sign-off |
| 9 | Can we contact your customers for a supporting quote, or should the story stay merchant-only? | Sets the boundary before we ask anyone else |
| 10 | Any date after which this story should be reviewed or retired (e.g., seasonal business, numbers likely to change)? | Prevents stale numbers sitting online indefinitely |

**Design note**: cards use surface lift, not gradient — gradients are reserved for the one featured spotlight card per page, per DESIGN.md's "one or two gradients per long page" rule.

---

## 5. Five segment archetypes — matched to the five official themes

*Lever: recognition — a reader should find their own shop in one of these five profiles within seconds, and immediately see what "good" looks like for a shop like theirs, not a generic benchmark.*

These are **operating profiles**, not case studies — they describe the range of numbers a healthy shop in that segment typically shows, drawn from category norms, not attributed to a named merchant. Each maps to one of the five official Framique themes: **Classic, Modern, Landing, Supershop, B2B.**

### 5.1 Fashion boutique → **Modern** theme

| Attribute | Typical range |
|---|---|
| AOV band | ৳800 – ৳3,500 |
| Catalogue size | 40 – 300 SKUs, frequent turnover (new drops every 1–3 weeks) |
| COD share | 55–75% (trust still being built with new buyers) |
| Top 3 failure modes | (1) Size/fit returns eating margin (2) Stockouts on the SKU driving the ad click (3) Catalogue photos inconsistent across drops, hurting perceived quality |
| Metrics that matter | Return rate by size/variant · Ad-click-to-checkout conversion · Restock lead time |
| 30-day improvement plan | Week 1: audit return reasons by variant, tag size-related returns separately from quality-related ones. Week 2: add a size guide to every product page template, re-shoot the 10 highest-return SKUs on a consistent background. Week 3: set low-stock alerts on the 20 SKUs driving 80% of traffic. Week 4: compare return rate and conversion against week 1 baseline; keep only the changes that moved both. |

**বাংলা note**: product titles and size labels should carry Bangla variants (`M/L/XL` alongside `মিডিয়াম/লার্জ/এক্সট্রা লার্জ`) since fit vocabulary is where Bangla-first buyers most often bounce to a WhatsApp question instead of checking out.

### 5.2 Neighbourhood shop (mudir dokan / general store) → **Classic** theme

| Attribute | Typical range |
|---|---|
| AOV band | ৳200 – ৳900 |
| Catalogue size | 100 – 600 SKUs, low turnover, high repeat-purchase overlap |
| COD share | 80–95% (established local trust, cash habit) |
| Top 3 failure modes | (1) Manual price updates lag supplier price changes (2) No visibility into which SKUs are actually profitable after courier cost (3) Repeat customers still calling in orders instead of using the storefront |
| Metrics that matter | Repeat-purchase rate · Net margin after courier cost per order · Phone-order share vs storefront-order share |
| 30-day improvement plan | Week 1: pull last month's supplier invoices, flag SKUs where shelf price hasn't moved in 60+ days. Week 2: compute per-order courier cost against AOV for the bottom 20% margin SKUs, decide which to drop or reprice. Week 3: send existing phone-order customers a one-time storefront link with their usual basket pre-filled. Week 4: compare phone-order share against week 1; the goal isn't zero phone orders, it's a falling trend. |

**বাংলা note**: this is the segment most likely to be entirely Bangla-first — product names, categories and the storefront itself should default to Bangla, with English as the toggle, not the reverse.

### 5.3 Single-product drop → **Landing** theme

| Attribute | Typical range |
|---|---|
| AOV band | ৳500 – ৳4,000 (single price point or narrow variant set) |
| Catalogue size | 1 – 5 SKUs, campaign-driven, time-boxed |
| COD share | 40–60% (often ad-driven, colder traffic than repeat shops) |
| Top 3 failure modes | (1) Checkout drop-off because trust signals are missing on a brand-new domain (2) Ad spend outpacing fulfilment capacity, causing delivery delays that generate refund requests (3) No plan for what happens to traffic after the drop sells out |
| Metrics that matter | Landing-page-to-checkout conversion · Refund/return rate in the first 14 days · Sell-out-to-restock gap (days the page stayed live with nothing to sell) |
| 30-day improvement plan | Week 1: instrument the page to see where visitors drop before checkout — image, price, or shipping-cost reveal. Week 2: cap ad spend to match confirmed fulfilment capacity, not aspirational capacity. Week 3: pre-build a "sold out — notify me" state before the drop, not after. Week 4: measure conversion and refund rate against week 1; if refunds are rising with conversion, the bottleneck is fulfilment, not marketing. |

**বাংলা note**: countdown and stock-scarcity copy must be literal and current (real stock counts, real close times) — Bangla-first buyers on this theme are the most price- and trust-sensitive segment, and an inflated "3 left" counter is the fastest way to lose them permanently.

### 5.4 Grocery / daily essentials → **Supershop** theme

| Attribute | Typical range |
|---|---|
| AOV band | ৳600 – ৳2,200, high basket-item count |
| Catalogue size | 500 – 3,000+ SKUs, high restock frequency, perishables mixed with shelf-stable |
| COD share | 60–80% |
| Top 3 failure modes | (1) Substitution handling — item goes out of stock mid-order, no clear customer-facing rule (2) Delivery-window mismatches for perishables (3) Search/category structure too shallow for basket sizes this large |
| Metrics that matter | Basket completion rate (started vs paid) · Substitution acceptance rate · Delivery-window adherence |
| 30-day improvement plan | Week 1: define one written substitution policy (same brand, same category, or ask-first) and apply it consistently. Week 2: separate perishable and non-perishable delivery windows in the storefront so customers aren't promised same-slot delivery for both. Week 3: rebuild category depth around the top 10 basket combinations, not the supplier's own catalogue hierarchy. Week 4: compare basket completion rate against week 1; a rising substitution-acceptance rate alongside stable completion means the policy is working, not just being tolerated. |

**বাংলা note**: unit and quantity language (কেজি, লিটার, পিস, প্যাকেট) must be consistent across search, filters and the cart line item — grocery is the segment most sensitive to unit-mismatch confusion at checkout.

### 5.5 Wholesale / B2B → **B2B** theme

| Attribute | Typical range |
|---|---|
| AOV band | ৳15,000 – ৳500,000+, highly variable by buyer tier |
| Catalogue size | 50 – 1,000 SKUs, often with tiered/negotiated pricing per buyer |
| COD share | Low (5–20%) — invoice/bank-transfer and credit terms dominate over COD |
| Top 3 failure modes | (1) No self-serve reorder path, every repeat order still goes through a phone call (2) Price lists out of sync between what sales quotes and what the storefront shows (3) No audit trail for who approved a large order internally at the buyer's business |
| Metrics that matter | Reorder rate without a sales call · Quote-to-order lead time · Price-list sync lag (days between a price change and it reflecting everywhere) |
| 30-day improvement plan | Week 1: identify your top 10 repeat buyers and check how many of their last three orders went through a call versus self-serve. Week 2: fix the single most-quoted SKU category's pricing sync first — the one with the shortest patience for a wrong price. Week 3: add a lightweight internal-approval note field to the order flow so buyer-side approvals are visible in one place. Week 4: measure reorder-without-a-call rate against week 1; treat any drop in quote-to-order lead time as the leading indicator, since B2B trust compounds slowly. |

**বাংলা note**: B2B buyers frequently switch languages mid-negotiation (Bangla on the phone, English in the PO) — product and pricing documents generated from the storefront should support both without the buyer having to ask.

**Design note**: five cards in a horizontal-scroll row on mobile, 3-up-then-2-up grid on desktop, each tagged with its theme name as a small caption chip so the connection to the actual product themes is explicit, not implied.

---

## 6. Metric definitions — compute it yourself

*Lever: transparency as differentiation — publishing the formula is what makes the number believable.*

Every metric used anywhere on this page or in any published story is defined here, so a reader can compute the same number for their own shop and check our math.

| Metric | Formula | Source in Framique dashboard | Common mistake to avoid |
|---|---|---|---|
| **AOV (average order value)** | Total order value ÷ number of orders, for a stated period | Analytics → Orders → Summary | Including cancelled/refunded orders inflates or deflates this — state whether they're excluded |
| **COD share** | COD orders ÷ total orders, for a stated period | Analytics → Payments → Method breakdown | Comparing COD share across periods with different promo mixes (a COD-only campaign will spike this temporarily) |
| **Return rate** | Returned units ÷ shipped units, for a stated period | Analytics → Fulfilment → Returns | Measuring by order count instead of unit count hides partial returns |
| **Repeat-purchase rate** | Customers with 2+ orders ÷ total customers, for a stated cohort window | Analytics → Customers → Cohorts | Using an unbounded "all time" window makes any shop look better the longer it's been open — always state the window |
| **Basket completion rate** | Orders paid ÷ carts started, for a stated period | Analytics → Funnels → Checkout | Excluding abandoned carts under a minimum value quietly inflates the rate |
| **Time-to-publish** | Days from signup to first live, purchasable product | Analytics → Store → Setup timeline | Counting from "account created" instead of "serious onboarding started" if there was a long gap |
| **Net margin after courier cost** | (Order value − COGS − courier cost) ÷ order value | Analytics → Finance → Order profitability | Using a flat estimated courier cost instead of the actual charged rate per zone |
| **Substitution acceptance rate** | Substituted-item orders accepted ÷ substituted-item orders offered | Analytics → Fulfilment → Substitutions | Counting silent non-response as acceptance rather than as its own category |
| **Quote-to-order lead time** | Days from quote sent to order confirmed, median not mean | Analytics → B2B → Quotes | Using a mean skews heavily on one slow enterprise negotiation — always report median for this one |
| **Price-list sync lag** | Days between a price change being saved and it reflecting on every buyer-facing surface | Analytics → B2B → Pricing audit log | Treating "saved" and "published" as the same event when they may not be |

**Design note**: this table renders as a real markdown/HTML table, not cards — a definitions band should look like reference material, not marketing.

---

## 7. How to write your own case study

*Lever: reciprocity — teach merchants to do this well themselves, whether or not they ever submit to us, and some will submit to us because we taught them how.*

A short, honest framework any merchant can use for their own marketing, investor updates, or a Framique submission:

**Step 1 — Pick one before/after pair, not five.** A case study with one clear mechanism ("we added a size guide, returns dropped") is more credible and more useful than a list of everything that improved, because a reader can't tell which change caused what in a list of five.

**Step 2 — State the period and the baseline.** "Return rate fell" means nothing without "from 18% to 11%, comparing the 30 days before the change to the 30 days after." Anyone reading a case study without a stated period should assume it's cherry-picked.

**Step 3 — Separate correlation from mechanism.** If return rate fell in the same month you also ran a sale, you have two changes and one result — you cannot claim the size guide did it. Either isolate the change (A/B it) or say plainly "two things changed at once, and we believe the size guide was the larger factor, because X."

**Step 4 — Quote yourself accurately.** If you're the one being quoted, write down what you actually think, not what sounds best. A specific, slightly awkward sentence ("we stopped losing the Friday-night orders") reads as more real than a polished one ("we transformed our operations").

**Step 5 — Decide what you won't publish.** Every honest case study has a number that looks bad next to the good ones (maybe conversion held flat while margin improved). Deciding in advance what stays private is not dishonesty — publishing a number you don't actually understand yet, in order to look impressive, is.

**A minimal self-audit checklist before you publish anything:**

- [ ] Can I point to the exact dashboard screen this number came from?
- [ ] Have I named the time period?
- [ ] Would this number survive someone else re-running the query?
- [ ] Is the "before" state something that was actually true, not a strawman?
- [ ] If I removed the adjectives from this paragraph, would the facts still make the point?

**Design note**: numbered steps as a vertical rhythm on canvas, each step a short paragraph — no glass cards here, this band should read like a guide, not a promotion.

---

## 8. Proof-of-platform

*Lever: verifiable > decorative — a live, boring number is more persuasive than a big, round one.*

This band never uses invented percentages ("99.9% uptime," "10,000+ merchants") unless the figure is (a) currently true and (b) linked to a live, independently checkable source. Where we don't yet have that source, the slot stays empty rather than filled with a plausible-sounding placeholder.

| Element | What it shows | Source |
|---|---|---|
| **Live status** | Current platform status (operational / degraded / incident), pulled from the real status page, not hardcoded | `status.framique.com` (or equivalent), embedded live, not screenshotted |
| **Uptime figure** | Trailing 90-day uptime percentage, if and only if the status provider publishes a verifiable historical log | Status provider's public history page, linked directly |
| **Live counters** | Only counters backed by a real, refreshing query against production data (e.g., "stores live right now"), never a static number typed into copy | Internal analytics, refreshed on page load, with a visible "as of {{timestamp}}" label |
| **Incident history link** | A link to the actual incident log, good or bad | Same status provider |

**What this band explicitly avoids**: a wall of made-up merchant-count or GMV figures with no link; a "trusted by" logo strip of businesses that haven't consented to being named; comparative uptime claims against competitors we haven't independently measured.

**Design note**: canvas band, monospace-leaning numeral treatment for the live figures (visually distinct from marketing display type, signalling "this is a readout, not a headline") — a small pulsing dot next to "operational" only if status is genuinely live-fetched, never decorative.

---

## 9. Submit your story

*Lever: low-friction reciprocity — make it easy to say yes, and explicit about what saying yes means.*

- **H2**: Want your store in this grid?
- **Sub**: Start free, and if it works out, we'll ask you — never before, and never without this checklist.
- **Primary CTA**: `Submit your story` (opens intake form, Section 4's questionnaire) · **Alt CTA**: `Start free — no card`

**The consent checklist we walk through with every merchant before publishing anything** (shown on-page, not buried in a PDF):

- [ ] You've reviewed the exact numbers we intend to publish, sourced from your own dashboard
- [ ] You've reviewed the exact quote we intend to publish, and confirmed it's your words
- [ ] You've told us about any number or detail you'd rather we didn't include
- [ ] You've approved the specific photo we intend to use, if any — or approved that we publish with no photo
- [ ] You know who at your business has final sign-off, and they've seen the draft
- [ ] You know you can ask us to take the story down later, and how to reach us to do it

**বাংলা — H2**: আপনার দোকান কি এই তালিকায় থাকতে চান?
**বাংলা — Sub**: বিনামূল্যে শুরু করুন, এবং কাজ করলে আমরা জিজ্ঞেস করব — তার আগে নয়।

**Design note**: the checklist renders as a real checklist (not prose) directly beneath the CTA, on canvas — showing the process before asking for the submission is itself a trust signal.

---

## 10. FAQ

1. **How do you decide which stories to publish?** We publish stories where the merchant has given written consent, the numbers can be independently re-queried against their dashboard, and the quote is verbatim. We don't select stories to fit a target narrative — we select stories that clear the checklist.
2. **Do merchants get paid or discounted for appearing here?** No. Appearing on this page is never a condition of pricing, and we don't offer incentives for participation, so the stories reflect what merchants would say anyway.
3. **What if a number changes after the story is published?** Every story has a review date. If a metric materially changes, we update or retire the card — we don't leave stale numbers live indefinitely.
4. **Can a merchant ask us to take a story down?** Yes, at any time, for any reason, without needing to justify it. We remove it promptly and don't keep it live "just archived" somewhere findable.
5. **Why don't you show ratings or star reviews on this page?** Because we don't yet have a verified review corpus we can stand behind with the same rigour as the rest of this page. We'll add review data only when we can source and verify it the same way we source everything else here.
6. **Are the segment archetypes in Section 5 real merchants?** No — they're operating profiles built from category norms, explicitly labelled as such, so readers can benchmark their own shop without us attributing invented numbers to a named business.
7. **How do I know a metric on this page isn't cherry-picked?** Every metric definition is public in Section 6, with the formula and the dashboard location — if you think a number is misleading, you can ask us exactly how it was computed, and we'll show our work.
8. **What counts as "verified" internally?** A named reviewer, other than the story's writer, re-runs the underlying query against the merchant's dashboard within 7 days of publish and initials the record.
9. **Can I use the case-study framework in Section 7 for my own business, unrelated to Framique?** Yes — it's a general framework for honest before/after writing, not specific to our platform.
10. **What happens if a merchant's numbers genuinely aren't impressive?** We either don't publish, or we publish the honest range with context — we don't inflate a modest result to make it "story-worthy." A believable, modest story is worth more to future readers than an implausible, flattering one.

**Design note**: standard `{components.faq-row}` accordion on canvas, one open panel at a time, no auto-expand on load.

---

## 11. Final CTA

*Lever: consistency with the page's own standard — the CTA repeats the same restraint as the rest of the page.*

- **H2**: Want your store in this grid?
- **Sub**: Start free, and if it works we'll ask you — never before.
- **Primary**: `Start free — no card` · **Alt**: `Talk to sales`
- **বাংলা — H2**: আপনার দোকান কি এই তালিকায় থাকতে চান?
- **বাংলা — Sub**: বিনামূল্যে শুরু করুন — কাজ করলে আমরা জিজ্ঞেস করব, তার আগে নয়।

**Design note**: gradient-spotlight card band (second and last gradient use on this page, per DESIGN.md's scarcity rule — Section 3's featured card was the first) — magnetic hover on the primary pill only, capped at 6px per motion spec.

---

## Internal linking plan

- Hero `Read the stories` → in-page anchor to Section 4 grid
- Hero/CTA `Start free — no card` → `/signup`
- Individual story cards → `/customers/{{slug}}` (individual story detail route, out of scope for this page but linked)
- Section 5 archetype cards → `/themes#{{theme-slug}}` (Classic, Modern, Landing, Supershop, B2B theme detail anchors)
- Section 6 metric names → `/docs/analytics#{{metric-slug}}` where a fuller definitions doc exists
- Section 9 `Submit your story` → `/customers/submit` (intake form route)
- FAQ item 5 (ratings) → `/trust` or `/security` if such a trust-centre page exists, otherwise omitted
- Final CTA `Talk to sales` → `/contact-sales`

## Image brief

- No stock photography of people anywhere on this page. Every photo is either a real, consented merchant/shop photo or absent.
- Story-grid covers: 16:9, genuine product/shop photography from the merchant, colour-graded consistently (single LUT or preset) so the grid doesn't look visually disjointed despite varied source quality — consistency in post-processing, never in the underlying facts.
- Archetype cards (Section 5): no photography — use theme-preview thumbnails (actual UI screenshots of the Classic/Modern/Landing/Supershop/B2B themes) since these are category profiles, not real merchants.
- Proof-of-platform band: no photography, numeral/readout treatment only.

## Icon list

`check-circle` (consent checklist, proof standard), `shield-check` (proof standard), `bar-chart` (metric definitions), `clock` (time-to-publish, lead time metrics), `refresh-cw` (live counters), `activity` (status/uptime), `arrow-up-right` (card links), `message-square` (quotes), `map-pin` (city), `tag` (category).

## Motion spec

Reveal-on-enter for story cards and archetype cards, opacity + 12px translate-y, 380ms, `cubic-bezier(0.22, 1, 0.36, 1)`, staggered 60ms per card, once only. Live counters in Section 8 fade-update on refresh (no counting-up animation — a counting-up animation on a real number reads as performative). Aurora drift only on the two spotlight cards (Sections 3 and 11), 24–38s loop, paused under `prefers-reduced-motion`. FAQ accordion: height + opacity, 240ms, no bounce.

## Accessibility notes

- H1 is plain text, one per page, in the hero only; Sections 2–11 use H2/H3 in document order with no skipped levels.
- Every metric chip has a text label, not colour alone, distinguishing positive/negative direction (e.g. an explicit "↓ return rate" label, not just green/red).
- Tables in Sections 5 and 6 use real `<table>` markup with `<th scope="col">`/`<th scope="row">` so screen readers can navigate cell-by-header, not divs styled as tables.
- All checklists (Sections 3, 9) render as native `<ul>` with `role="list"` preserved (avoid `list-style: none` stripping list semantics without an ARIA role restoration) and each item is independently focusable if interactive.
- Live status dot (Section 8) has a text-equivalent state (`Operational`) adjacent to it, never colour-only.
- Consent language throughout uses plain sentence structure (no idioms) so it translates cleanly and machine-translates reasonably as a fallback where a Bangla string isn't yet localised.

## Bangla notes

- Bangla headline strings use `{typography.bangla-display}` exclusively — zero inherited latin letter-spacing, 1.35+ line-height so matras in words like "বেড়ে" or "সম্মতিপ্রাপ্ত" are never clipped by a tight box.
- Segment archetype "বাংলা note" callouts (Section 5) are load-bearing content, not decoration — they describe real language-switching behaviour specific to that segment and should not be cut in a translation pass.
- Numerals in metric tables (Section 6) and proof-of-platform (Section 8) use Bangla-locale numeral formatting when the page is served in `lang="bn"`, with the underlying value unchanged — formatting differs, the number does not.
- Consent checklist and intake questionnaire (Sections 3, 4, 9) must ship a full Bangla translation before this page goes live for Bangla-first merchants, since these are the sections merchants must genuinely understand, not just skim — this is the one place on the page where translation quality directly gates informed consent.

## Measurement plan

- **Primary conversion event**: `customers_page_start_free_click` (hero + final CTA), segmented by whether the visitor scrolled past Section 5 (archetype recognition) before clicking, as a proxy for whether the page taught them something before converting.
- **Secondary event**: `customers_page_submit_story_click` (Section 9) — track volume and completion rate of the intake form itself, since this page's other job is sourcing future stories, not just converting readers.
- **Engagement signal**: scroll depth to Section 6 (metric definitions) and Section 7 (write-your-own-case-study) — these are the two "genuinely useful, no strings attached" bands; sustained time-on-band here is a proxy for whether the page is being read as reference material by merchants who aren't ready to sign up yet, which matters for long-run trust even without an immediate conversion.
- **Integrity metric (internal, not customer-facing)**: percentage of published story cards with a reviewer-initialled verification record less than 90 days old — this is the health metric for the whole page's premise, tracked quarterly, reported to whoever owns this page's editorial process.
- **A/B candidate**: featured-story band (Section 3) present vs. absent, once real stories exist in volume, to test whether a single spotlighted story lifts grid engagement or whether the grid alone converts equally well — do not run this test using template/placeholder content.
