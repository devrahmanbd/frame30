# `/pricing`

Route: `src/routes/pricing.tsx` · Shell: marketing shell, dark canvas, top-nav + footer
Scope: full pricing narrative — tiers, true unit economics of running a Bangladesh store, break-even math, plan-choice logic, migration guarantees, and objection handling. No invented numbers; every figure is either a live counter (`plan_definitions`, `rail_fee_schedule`) or a worked-example assumption, labelled as such.

## SEO

- **Title** (58): `Pricing — flat plans, real fee math, no lock-in | Framique`
- **Description** (156): `Flat monthly plans in BDT, no per-order platform fee. See the actual per-order cost breakdown — rails, courier, COD, returns — before you commit.`
- **og:title**: `Pricing that stays honest at scale.`
- **og:description**: `Every plan includes bKash, Nagad, card and COD. See what an order really costs before you launch.`
- **og:type**: `website`
- **canonical / og:url**: `/pricing`
- **JSON-LD**: `Product` + `Offer` per plan (built from `plan_definitions`, never hardcoded), `FAQPage` for the FAQ band, `BreadcrumbList` (Home → Pricing).
- **H1 rule**: one H1 in the hero only; every subsequent band opens on H2; sub-rows inside bands use H3. No band skips a heading level.
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `ecommerce platform pricing bangladesh`
  - **Secondary**:
    - `online store monthly cost bd`
    - `bkash transaction fee merchant`
    - `cash on delivery charge bangladesh`
    - `courier charge bangladesh ecommerce`
  - **Long-tail / question intents**:
    - `how much does an ecommerce website cost in bangladesh`
    - `real cost per order cash on delivery bangladesh`
    - `ecommerce platform without per order commission`
  - **Placement**: H1 + plan table intro (primary), fee-anatomy band (rail/courier/COD fees), break-even band (cost per order). Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/pricing`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

## Band order

1. Hero
2. Plan-tier table
3. What's included matrix
4. Fee anatomy — "what a taka actually costs you"
5. Break-even calculator
6. Annual vs monthly, honestly
7. Plan-choice decision tree
8. Theme-to-plan fit
9. Add-ons and limits
10. Migration and exit guarantees
11. Comparison — marketplace commission and DIY hosting
12. Objection handling
13. FAQ
14. Final CTA

---

## 1. Hero — canvas

*Lever: framing the decision as arithmetic, not faith — sets the tone that every claim below is checkable.*

- **Eyebrow**: `Prices in BDT · VAT shown separately`
- **H1**: **Pricing that stays honest at scale.**
- **Sub**: Every plan includes bKash, Nagad, card and COD. No per-order tax on your growth — and below, we show you exactly what an order costs once rails, couriers and returns are counted.
- **বাংলা H1**: `স্কেল বাড়লেও যে দামে সততা থাকে`
- **বাংলা sub**: `প্রতিটি প্ল্যানে বিকাশ, নগদ, কার্ড ও ক্যাশ অন ডেলিভারি অন্তর্ভুক্ত। বৃদ্ধির উপর কোনো প্রতি-অর্ডার কর নেই।`
- **Primary CTA**: `Start 14-day trial` · **Alt CTA**: `See the fee breakdown`
- **Toggle**: glass segmented control — `Monthly` / `Annual — 2 months free`
- **Design note**: hero sits on the low-alpha aurora mesh only (violet + teal, drifting 24–38s loop), no spotlight card here — the spotlight budget is reserved for the enterprise band at the end. Toggle uses `{components.button-glass}`; selected segment gets the `{elevation.3}` blue focus ring, never a fill.

---

## 2. Plan-tier table — 4-up glass/surface cards

*Lever: anchoring + choice architecture. The recommended tier is one surface step up (`surface-2` vs `surface-1`), never a coloured border or a badge that shouts.*

Tier names and prices below are carried over from the existing plan set. Framique's `plan_definitions` table is the source of truth at runtime — the marketing page renders live values, never a hardcoded string. Where the current spec has not fixed a number, it is marked `[PLACEHOLDER]` so engineering and finance can drop in the actual figure without a copy rewrite.

| Tier | Monthly price (BDT) | Annual price (BDT/mo, billed yearly) | Products limit | Staff seats | Payment methods | Trial |
|---|---|---|---|---|---|---|
| Starter | `[PLACEHOLDER — e.g. ৳990/mo]` | `[PLACEHOLDER]` | 100 SKUs | 1 | bKash, Nagad, COD | 14 days |
| Growth *(most chosen)* | `[PLACEHOLDER — e.g. ৳2,490/mo]` | `[PLACEHOLDER]` | 2,000 SKUs | 5 | bKash, Nagad, Rocket, Upay, card, COD | 14 days |
| Scale | `[PLACEHOLDER — e.g. ৳5,990/mo]` | `[PLACEHOLDER]` | Unlimited | 20 | All rails + multi-store routing | 14 days |
| Enterprise | Contact for a quote | Contact for a quote | Unlimited | Custom | All rails + negotiated settlement terms | Custom |

- **Starter** — Get your first 100 orders out the door. *For a new store testing demand.*
- **Growth** — Rails, couriers and staff, all included. *For a store doing daily volume.*
- **Scale** — Multi-store, POS and priority routing. *For a brand with outlets.*
- **Enterprise** — Custom limits, SLA and onboarding. *Contact for a quote.*

Per-card lines rendered from `plan_definitions`: products limit · staff seats · payment methods · trial days · plan features. If a value is null the card renders `Contact admin` — never a placeholder number in production. The `[PLACEHOLDER]` markers above exist only in this copy deck, not in shipped UI.

**বাংলা tier one-liners**:
- Starter: `আপনার প্রথম ১০০টি অর্ডার সফলভাবে সম্পন্ন করুন।`
- Growth: `পেমেন্ট রেল, কুরিয়ার ও স্টাফ — সব অন্তর্ভুক্ত।`
- Scale: `মাল্টি-স্টোর, POS ও অগ্রাধিকার রাউটিং।`
- Enterprise: `কাস্টম লিমিট, SLA এবং অনবোর্ডিং — কোট চান।`

**Design note**: 4-up grid → 2-up at 900px → accordion at 640px. Growth card uses `{components.pricing-card-featured}` (surface-2); the other three use `{components.pricing-card}` (surface-1). No ribbon graphic — the "most chosen" label is plain caption text, `{typography.caption}`, in `ink-muted`.

---

## 3. What's included — hairline matrix

*Lever: reducing perceived risk by making every inclusion checkable, row by row, rather than bundled into vague marketing language.*

Rows: bKash · Nagad · Rocket · Upay · Card · COD · Bangla storefront · Theme builder (5 official themes) · Courier booking (SteadFast, Pathao, RedX, Paperfly) · Fraud scoring · POS · API + webhooks · Staff roles · Audit log · Data export · Support channel.

| Feature | Starter | Growth | Scale | Enterprise |
|---|---|---|---|---|
| bKash / Nagad / COD | ✓ | ✓ | ✓ | ✓ |
| Rocket / Upay / Card | — | ✓ | ✓ | ✓ |
| Bangla storefront | ✓ | ✓ | ✓ | ✓ |
| Theme builder (5 themes) | ✓ | ✓ | ✓ | ✓ |
| Courier booking (4 couriers) | ✓ | ✓ | ✓ | ✓ |
| Fraud scoring | — | ✓ | ✓ | ✓ |
| POS | — | — | ✓ | ✓ |
| API + webhooks | — | ✓ | ✓ | ✓ |
| Staff roles | 1 seat | 5 seats | 20 seats | Custom |
| Audit log | — | ✓ | ✓ | ✓ |
| Data export | ✓ | ✓ | ✓ | ✓ |
| Support channel | Email | Email + chat | Priority chat | Named engineer |

**Design note**: sticky header at ≥900px, horizontally scrollable below with a fading edge mask, not a scrollbar. No zebra fill — rows are separated by `{colors.hairline-soft}` only. Checkmarks render as a single 16px glyph in `ink`, dashes in `ink-muted` at 40% opacity — never red/green semantic color, since absence of a feature is not an error state.

---

## 4. Fee anatomy — "what a taka actually costs you" — glass card, full worked P&L

*Lever: anchoring against the visitor's current, usually invisible, blended cost. Most store owners have never itemised this, so seeing it written down as a table is itself the persuasion.*

**H2**: What a taka actually costs you.
**Sub**: The plan fee is one line on your P&L. These are the others — the ones every platform has, whether or not they show you the total.

This section is the substantive teaching moment of the page: it walks a merchant through every cost that sits between an order and the money that clears into their bank account. Framique's own fee is flat; everything else below is a rail, courier, or operational cost that exists regardless of which platform is used — the difference is whether the platform lets you see it.

### Worked example — one COD order, stated assumptions

Assumptions (labelled, adjustable in the live break-even calculator described in Section 5):

- Order value: ৳1,200 (assumption)
- Cost of goods sold: ৳650, i.e. 54% of order value (assumption)
- Courier: intra-city delivery via a national courier, flat fee (assumption)
- COD collection fee: charged by the courier as a percentage of collected cash (assumption, varies by courier and city zone)
- Return rate: 12% of COD orders return to origin (assumption, typical for apparel/COD-heavy categories — not a Framique-measured statistic)
- Packaging: poly mailer + printed label (assumption)
- Ad cost: blended cost to acquire the order via paid social, amortised per order (assumption)
- Rail fee: not applicable to this order because it is COD; shown separately in the digital-payment variant below

| Line item | Amount (BDT) | % of order value | Notes |
|---|---|---|---|
| Order value | 1,200 | 100% | Customer-facing price |
| Cost of goods sold | −650 | −54.2% | Landed cost, assumption |
| Courier delivery fee | −70 | −5.8% | Flat intra-city fee, assumption |
| COD collection fee | −24 | −2.0% | Courier charges ~2% of collected cash, assumption |
| Packaging | −25 | −2.1% | Poly mailer + label, assumption |
| Ad cost (amortised) | −180 | −15.0% | Blended CAC across converting + non-converting clicks, assumption |
| Return-leg risk reserve | −25.20 | −2.1% | 12% return rate × ~৳210 average round-trip courier cost, amortised across all orders, assumption |
| **Contribution before platform fee** | **225.80** | **18.8%** | |
| Framique plan fee (amortised) | see below | varies | Flat fee ÷ monthly order volume |
| **Net contribution per order** | **varies by volume** | | |

**Worked example — same order, paid digitally (bKash) instead of COD:**

| Line item | Amount (BDT) | % of order value | Notes |
|---|---|---|---|
| Order value | 1,200 | 100% | |
| Cost of goods sold | −650 | −54.2% | Same assumption |
| Courier delivery fee | −70 | −5.8% | Same |
| bKash merchant rail fee | −22.20 | −1.85% | Rail-published merchant rate, assumption; charged by bKash, not by Framique |
| Packaging | −25 | −2.1% | Same |
| Ad cost (amortised) | −180 | −15.0% | Same |
| Return-leg risk reserve | −6.30 | −0.5% | Digital-payment orders typically return less than COD; assumed 3% return rate here |
| **Contribution before platform fee** | **246.30** | **20.5%** | |

**The point of the comparison**: COD collection fees plus the higher return rate they carry cost this merchant roughly ৳20.50 more per order than the same sale settled digitally — before either merchant pays a single taka of platform fee. This is why the fee-anatomy section separates rail cost, courier cost and platform cost into three distinct rows: a per-order marketplace commission bundles all three into one number you can't audit, while a flat plan fee at least isolates the one cost Framique controls.

**How the plan fee amortises**: take the monthly plan price and divide by expected monthly order count.

| Monthly orders | Growth plan fee ÷ orders | Effective platform cost per order |
|---|---|---|
| 50 | `[PLACEHOLDER plan price]` ÷ 50 | e.g. ৳2,490 ÷ 50 = ৳49.80 |
| 200 | `[PLACEHOLDER plan price]` ÷ 200 | e.g. ৳2,490 ÷ 200 = ৳12.45 |
| 1,000 | `[PLACEHOLDER plan price]` ÷ 1,000 | e.g. ৳2,490 ÷ 1,000 = ৳2.49 |

This is the mechanical reason a flat fee "stays honest at scale": the more orders a store processes, the smaller the per-order platform cost becomes. A per-order commission model does the opposite — cost per order stays constant no matter how much volume the merchant proves out, and often increases as the merchant qualifies for higher-tier promotional placement.

**বাংলা callout**: `প্ল্যাটফর্ম ফি একটাই লাইন। বাকি খরচ — রেল, কুরিয়ার, রিটার্ন — সেগুলো সব প্ল্যাটফর্মেই থাকে, শুধু দেখানো হয় না।`

**Design note**: this band renders as a full-width `{components.glass-card}` containing two stacked tables, each with a running total row in `ink` bold and every negative line in `ink-muted`. No red text for costs — color is reserved as a signal, not a valence indicator, per DESIGN.md. A small caption footnote under each table reads "Assumption, not a Framique statistic" and links to a methodology note.

---

## 5. Break-even calculator — interactive glass card

*Lever: letting the visitor plug in their own numbers converts an abstract claim into a personally verified one — self-generated conclusions are trusted more than stated ones.*

**H2**: Find your break-even order count.
**Sub**: Enter your numbers. We'll tell you how many orders a month it takes before the plan pays for itself against your current cost per order.

**Inputs** (all user-editable, all with inline units):

| Input | Type | Default | Notes |
|---|---|---|---|
| Average order value (BDT) | number | 1,200 | |
| Cost of goods sold (% of AOV) | slider 0–100% | 54% | |
| Courier fee per order (BDT) | number | 70 | Pulled from courier rate card if store has one connected |
| COD share of orders (%) | slider 0–100% | 65% | Bangladesh D2C average is COD-heavy; store-specific, not platform-wide |
| COD collection fee (%) | number | 2.0% | Editable per courier |
| Return rate — COD (%) | number | 12% | |
| Return rate — digital (%) | number | 3% | |
| Ad cost per order (BDT) | number | 180 | |
| Plan under evaluation | select | Growth | Pulls live price from `plan_definitions` |
| Current platform / marketplace commission (%), if switching | number | 8% | Used only in the comparison output |

**Outputs**:

- **Contribution per order at your inputs** — computed live, shown as a single large number in `{typography.display-md}`.
- **Break-even order count** — the number of orders/month where `plan fee ÷ orders = contribution per order under current commission model − contribution per order under Framique`. Rendered as: *"At your numbers, Framique's flat fee beats a `[commission %]` commission once you pass **`[N]` orders a month**."*
- **12-month projection chart** — line chart, contribution per order (Framique, flat) vs contribution per order (commission-based) as monthly order volume grows from 0 to a user-set ceiling. No animation beyond the standard reveal-on-enter; data draws in over 400ms once.

**Worked example output** (using the defaults above, commission benchmark 8%):

- Contribution per order (Framique, Growth plan, amortised at 200 orders/mo): ≈ ৳213.85
- Contribution per order (8% commission model, same inputs): ≈ ৳129.80
- Break-even order count: as low as 1 order/month at this AOV — because 8% of ৳1,200 (৳96) already exceeds the Growth plan's per-order amortised cost at any realistic volume. The calculator is deliberately built to show cases where flat pricing does *not* win at very low volume too — below roughly 10 orders/month, a percentage commission can be cheaper than a fixed monthly fee, and the calculator says so rather than hiding it.

**Design note**: this is the one interactive band on the page — all inputs are native range/number controls restyled to the glass token set, not custom canvas widgets, so screen readers and keyboard nav work without extra ARIA scaffolding. The output number uses a monospace tabular-nums variant of Manrope so digits don't jitter the layout as the user types.

---

## 6. Annual vs monthly — honest framing

*Lever: pre-empting the "annual is always better" reflex with an actual condition, which increases trust in every other number on the page.*

**H2**: Annual isn't automatically the right call.
**Body**: Annual billing is two months free against monthly — a genuine 16.7% discount. It is the right choice once you're confident in your order volume for the next 12 months. It is the wrong choice if you are still validating demand, still deciding your theme, or likely to upgrade tiers mid-year: the unused portion of an annual plan is not refunded pro-rata against an upgrade, only credited toward the new tier's annual price.

| Situation | Recommended billing | Why |
|---|---|---|
| Pre-launch or first 90 days | Monthly | You don't yet know your order volume; optionality is worth more than 16.7% |
| Stable ≥6 months of orders, same tier | Annual | Discount is pure margin at this point |
| Expecting to upgrade tier within the year | Monthly, or annual on current tier only if the annual discount exceeds the likely mid-year proration loss | Run the numbers in the calculator above before committing |
| Seasonal business (e.g. Eid-heavy) | Monthly | Volume swings mean the flat-fee break-even point moves month to month |

**বাংলা**: `বার্ষিক বিলিং সবসময় সঠিক সিদ্ধান্ত নয়। আপনার অর্ডার ভলিউম সম্পর্কে নিশ্চিত হলে তবেই এটি বেছে নিন।`

**Design note**: plain canvas band, no card — this is meant to read as advice, not a sales surface. Table uses the same hairline treatment as Section 3.

---

## 7. Plan-choice decision tree

*Lever: decision architecture — replacing "which plan sounds best" with a sequence of yes/no questions the merchant can answer factually about their own business.*

**H2**: Which plan fits, in four questions.

1. **Do you have a live product catalogue over 100 SKUs today?**
   - No → **Starter** is enough. Move up when you cross the SKU limit, not before.
   - Yes → go to 2.
2. **Do you need more than one staff login, or fraud scoring on incoming COD orders?**
   - No → **Starter** still covers you.
   - Yes → go to 3.
3. **Do you operate more than one physical outlet, or need POS at a till?**
   - No → **Growth** is the fit for most single-storefront D2C operations.
   - Yes → go to 4.
4. **Do you need custom contractual terms, a dedicated SLA, or settlement terms outside the standard rail schedule?**
   - No → **Scale** covers multi-store and POS without a custom contract.
   - Yes → **Enterprise** — talk to sales.

**Design note**: rendered as a vertical branching list on canvas, each question a `{components.faq-row}`-style block with the two branches indented beneath it — not a literal tree diagram graphic, since a text decision list is more accessible and translates cleanly to Bangla.

**বাংলা heading**: `চারটি প্রশ্নে বুঝে নিন কোন প্ল্যান আপনার জন্য`

---

## 8. Theme-to-plan fit

*Lever: reducing post-purchase uncertainty by mapping the abstract plan decision onto a concrete visual choice the merchant will make immediately after signing up.*

**H2**: Which of the 5 themes fits your plan.
**Body**: All five official themes — Classic, Modern, Landing, Supershop, B2B — are available on every plan; the mapping below is about typical merchant shape, not a feature gate.

| Theme | Typical merchant | Best-fit plan | Why |
|---|---|---|---|
| Classic | General retail, mixed catalogue | Starter, Growth | Balanced grid layout suits a broad SKU range without heavy customisation |
| Modern | Fashion, lifestyle, single-brand D2C | Growth | Full-bleed imagery and editorial layout reward a curated, mid-size catalogue |
| Landing | Single-product or campaign-led launches | Starter | One SKU, one funnel — matches Starter's lower SKU ceiling exactly |
| Supershop | High-SKU, high-frequency reorder categories (grocery, FMCG) | Scale | Dense grid and fast search infrastructure need Scale's higher limits |
| B2B | Wholesale, quote-based, account-gated pricing | Scale, Enterprise | Account-tiered pricing and staff-role permissions need the higher seat counts |

**Design note**: 5-up card row → 2-up at 900px, each card a small theme thumbnail (16:10) inside `{components.glass-card}`, plan-fit shown as caption text under the thumbnail, not a badge.

---

## 9. Add-ons and limits

*Lever: transparency on the edges of the plan reduces the fear of a surprise bill later — a known ceiling is less risky than an unknown one.*

**H2**: What happens at the edges of a plan.

| Add-on / limit event | What happens | Cost |
|---|---|---|
| Extra staff seat beyond tier limit | Added per seat, prorated to billing cycle | `[PLACEHOLDER per-seat rate]` |
| SKU limit reached | Store is notified at 90% of limit; new SKU creation blocks at 100% until archived or upgraded | No charge to view; upgrade required to add more |
| Additional storefront (multi-store) | Available from Scale upward | `[PLACEHOLDER per-store rate]` |
| Priority courier routing | Included from Scale upward; available as add-on on Growth | `[PLACEHOLDER add-on rate]` |
| API rate-limit increase | Included from Growth upward at standard limits; custom limits on Enterprise | Custom quote |
| Additional data export frequency (beyond on-demand) | Scheduled exports available from Growth upward | Included, no extra charge |

**বাংলা**: `প্ল্যানের সীমার কাছাকাছি পৌঁছালে ৯০% ব্যবহারে বিজ্ঞপ্তি দেওয়া হয় — কোনো লুকানো চার্জ নেই।`

**Design note**: plain hairline table on canvas, consistent with Section 3's matrix so the visitor recognises the pattern rather than parsing a new format.

---

## 10. Migration and exit guarantees — glass card

*Lever: removing switching-cost fear is a precondition for commitment — a merchant who believes they can leave freely is more willing to start.*

**H2**: You can leave. Here's exactly how.
**Body**: Framique does not hold your data, your customer list, or your money hostage to keep you subscribed.

| Guarantee | Detail |
|---|---|
| Full data export | Products, orders, customers, and order history export as CSV/JSON on demand, from every plan, at any time — including during a paid subscription and during the 14-day trial |
| No proprietary lock-in format | Exports use standard schemas compatible with common re-import tools, not a Framique-only format |
| Payout independence | Rails settle to your own bKash/Nagad/bank account directly; Framique never custodies your funds, so there is no balance to "release" on exit |
| Domain portability | Custom domains you've connected remain yours; DNS records are never held by Framique |
| Downgrade path | Downgrade takes effect at the next billing cycle; if you're over the new tier's limit, the dashboard lists exactly which records to archive first — no automatic deletion |
| Cancellation | Cancel any time; access continues until the end of the paid period, then the store pauses (not deletes) — data is retained and exportable for a stated retention window after pause |

**বাংলা**: `আপনার ডেটা, কাস্টমার তালিকা বা অর্থ কখনো আটকে রাখা হয় না। যেকোনো সময় সম্পূর্ণ এক্সপোর্ট করা যায়।`

**Design note**: single glass card, checklist layout with a small export icon per row, not a table — this band is meant to read as a promise, visually distinct from the data-dense tables around it.

---

## 11. Comparison — marketplace commission and DIY hosting

*Lever: contrast framing against the two most common alternatives a Bangladeshi merchant is actually choosing between, using the same worked-example numbers established in Section 4 so the comparison is internally consistent.*

**H2**: Compared to the two paths you're actually choosing between.

### vs a marketplace commission model

| Dimension | Marketplace (commission-based) | Framique (flat plan) |
|---|---|---|
| Fee structure | Percentage of order value, typically stacked with a payment processing fee | Flat monthly fee, rail fees passed through at cost |
| Cost at 50 orders/month, ৳1,200 AOV | 8% commission benchmark ≈ ৳4,800/month | `[PLACEHOLDER plan price]`/month, e.g. ৳2,490 |
| Cost at 1,000 orders/month, same AOV | 8% commission ≈ ৳96,000/month | Same flat fee, e.g. ৳2,490/month — a materially smaller share of revenue as volume grows |
| Customer data ownership | Often restricted or shared with the marketplace | Store owns full customer and order data, exportable |
| Storefront brand control | Limited — shared marketplace UI | Full theme control across 5 official themes |
| Pricing visibility | Total commission often bundled with hidden processing and ad-placement fees | Rail fee, courier fee and plan fee are shown as separate line items |

### vs self-hosting / DIY (own server + open-source cart)

| Dimension | DIY hosting | Framique |
|---|---|---|
| Upfront cost | Developer time to build storefront, payment integration, courier integration — real cost, frequently underestimated | Storefront, payment rails and courier integrations included from day one |
| bKash/Nagad/Rocket/Upay integration | Built and maintained in-house, including reconciliation logic | Included, maintained centrally |
| Courier booking (SteadFast, Pathao, RedX, Paperfly) | Built per-courier, each with its own API and failure modes | Included, one interface |
| Ongoing maintenance | Security patches, uptime, backups — owner's responsibility | Managed |
| Time to first sale | Weeks to months depending on developer availability | Days, inside the 14-day trial |
| Total cost at low volume | Can be cheaper if the owner is the developer and values their own time at zero | Flat plan fee, transparent from day one |

**বাংলা callout**: `মার্কেটপ্লেস কমিশন ভলিউম বাড়ার সাথে বাড়ে। আমাদের ফ্ল্যাট ফি বাড়ে না।`

**Design note**: two side-by-side tables inside one canvas band, divided by a vertical hairline at ≥900px, stacked at mobile. No "winner" column shading — the comparison is meant to let the merchant compute their own answer from the numbers, consistent with the calculator's honesty in Section 5 and 6.

---

## 12. Objection handling — 8 objections, real answers

*Lever: addressing the actual hesitation directly, in the merchant's own likely words, rather than deflecting into generic reassurance — specificity itself is the trust signal.*

**H2**: The questions you're actually asking before you commit.

1. **"A flat fee feels riskier than commission if I don't sell anything this month."**
   True at zero volume. That's what the 14-day trial and the monthly billing option are for — you're not locked into a flat fee before you've validated demand. Once you have consistent monthly orders, the break-even calculator in Section 5 shows exactly where flat pricing starts winning.

2. **"What if bKash or a courier changes their fee and my costs jump?"**
   Rail and courier fees are set by bKash, Nagad, the couriers and NBR-mandated VAT — not by Framique, and we don't mark them up. When a rail publishes a new rate, it shows up as a new number in the fee anatomy table, not a stealth increase to your plan price.

3. **"I don't have a developer — can I actually set this up myself?"**
   Yes. The theme builder and payment/courier connections are configured through the dashboard, not code. The trial period exists specifically so you can test this before paying.

4. **"What happens to my store if I miss a payment?"**
   The store pauses — it does not delete. Customer-facing pages go offline, but your product, order and customer data stays intact and exportable while paused.

5. **"Can I really export everything, or is 'export' just my product list?"**
   Full export includes products, orders, customer records and order history, in standard CSV/JSON — see the guarantee table in Section 10. This is available on every plan, not just higher tiers.

6. **"Is COD actually going to work well, or is that an afterthought?"**
   COD is included on every plan including Starter, and the fee anatomy in Section 4 is deliberately built around a COD worked example first, because COD is the dominant payment method for D2C orders in Bangladesh, not a secondary feature.

7. **"Will switching from my current platform lose my order history?"**
   Historical orders can be imported from a standard CSV export of your current platform; the onboarding flow includes a mapping step so order and customer IDs aren't duplicated. Ask your onboarding contact for the current import format if you're on a marketplace with restricted export.

8. **"Why should I trust a Bangladesh-first platform over a global one like Shopify?"**
   Global platforms treat bKash, Nagad, COD reconciliation and local courier booking as third-party plugins layered on top of a US-centric core — each with its own reliability ceiling. Framique builds these as first-class, maintained integrations, which is a narrower promise but one made for exactly this market's payment and fulfilment mix.

**বাংলা**: `আপনার আপত্তিগুলো সরাসরি — কোনো এড়িয়ে যাওয়া উত্তর নেই।`

**Design note**: eight `{components.faq-row}` blocks on canvas, objection stated as the visitor's own likely phrasing in quotes, answer directly beneath — visually distinct from the neutral-question FAQ band below by using quotation marks in the header text.

---

## 13. FAQ — native `<details>`, 10 questions

1. **Are prices inclusive of VAT?** Prices are shown ex-VAT; VAT is added at invoicing per NBR rules.
2. **What happens after the trial?** Nothing is charged automatically. Pick a plan or your store pauses — your data stays.
3. **Can I downgrade?** Yes, at the next cycle. If you're over a limit we tell you exactly which records to archive first.
4. **How do payouts work?** Rails settle to your own bKash / Nagad / bank account. Framique never holds your money.
5. **Do you charge per staff seat?** Seats are included per tier, not billed individually; extra seats beyond the tier limit are billed per seat, see Section 9.
6. **Does the plan fee change if my order volume grows?** No. The plan fee is flat; only your effective per-order cost changes, and it falls as volume rises — the mechanics are in Section 4.
7. **Which courier fees are included in the plan price?** None — courier delivery and COD collection fees are charged by the courier directly and shown as separate line items, never bundled into the plan fee.
8. **Can I switch themes after choosing a plan?** Yes, any of the 5 official themes are available on every plan at any time; switching themes does not affect billing.
9. **Is there a setup fee?** No. The only charges are the plan fee (or nothing, on trial) and pass-through rail/courier fees on actual transactions.
10. **What if I need custom rate limits or a dedicated engineer?** That's the Enterprise tier — contact sales for a scoped quote; it is the only tier without a published flat price because terms are negotiated per contract.

**বাংলা FAQ নমুনা**:
- `ট্রায়াল শেষে কী হয়?` — `স্বয়ংক্রিয়ভাবে কোনো চার্জ করা হয় না। প্ল্যান বেছে নিন অথবা স্টোর পজ হয়ে যাবে — আপনার ডেটা থেকে যাবে।`
- `পেআউট কীভাবে কাজ করে?` — `রেল সরাসরি আপনার নিজস্ব বিকাশ/নগদ/ব্যাংক অ্যাকাউন্টে সেটেল হয়। Framique কখনো আপনার টাকা ধরে রাখে না।`

**Design note**: native `<details>`/`<summary>`, no custom accordion JS — keeps this band functional without JavaScript and fully keyboard-navigable. Chevron rotates 180° on open, 200ms, matches the motion spec.

---

## 14. Final CTA — enterprise band, aurora spotlight

*Lever: single clear next action once every objection and number has been shown — this is the only spotlight card on the page besides the hero mesh, reserving visual weight for the close.*

**H2**: Bigger than a plan page?
**Sub**: Custom limits, migration support, an SLA and a named engineer.
**Primary CTA**: `Talk to sales` · **Alt CTA**: `See the security model`

**বাংলা**: `প্ল্যান পেজের চেয়ে বড় কিছু দরকার?` / `কাস্টম লিমিট, মাইগ্রেশন সহায়তা, SLA এবং একজন নির্দিষ্ট ইঞ্জিনিয়ার।`

**Design note**: single `{components.gradient-spotlight-card}` in violet, full-width on canvas, this is the only gradient card budget spent on the page apart from the low-alpha hero mesh — consistent with DESIGN.md's "one or two gradient cards per long page" rule. Primary CTA is the white pill; alt CTA is a glass pill beside it, not stacked below.

---

## Internal linking plan

- Hero alt CTA (`See the fee breakdown`) anchors to Section 4 in-page.
- Section 4 methodology footnote links to `/legal/pricing-methodology` (or a footnote modal if that route doesn't exist yet).
- Section 8 theme cards link to `/themes` filtered by theme slug.
- Section 10 migration guarantees link to `/security` (data handling detail) and `/docs/data-export`.
- Section 11 comparison band links to `/compare/marketplace` and `/compare/self-hosted` if those exist, otherwise to the blog category `/blog/unit-economics`.
- Section 12, objection 8, links to `/security` for the reliability claim.
- Final CTA alt links to `/security`.
- Footer standard links unchanged from global footer spec.

## Image / graphics brief

- Hero: no photographic image — aurora mesh gradient only (violet + teal), CSS/canvas-generated, not a raster asset.
- Section 2 tier cards: no imagery, typographic only.
- Section 4 worked P&L: no illustration; the tables themselves are the visual, set in tabular-nums Manrope.
- Section 5 calculator: line chart is the only chart asset on the page — 2 series (flat vs commission), rendered as SVG, stroke-only, no fill gradient beneath the lines to avoid competing with the aurora system.
- Section 8 theme cards: 5 thumbnail screenshots, 16:10, one per official theme, captured from the actual theme builder preview — never mockups.
- Section 14: gradient spotlight card, violet stop, no photographic content.

## Icon list

`check` (inclusion matrix), `dash` (non-inclusion, muted), `arrow-right` (CTA pills), `download` (export guarantee rows), `chevron-down` (FAQ/accordion), `sliders` (calculator inputs), `git-branch` (decision tree, used sparingly or omitted in favour of plain text per accessibility note below), `shield` (security/migration band), `trending-up` (break-even output).

## Motion spec

- Standard reveal-on-enter for every band: opacity 0→1 + translateY 12px→0, 380ms, `cubic-bezier(0.22, 1, 0.36, 1)`, once only, never on re-scroll.
- Aurora hero mesh drifts on a 28s loop, low alpha, paused entirely under `prefers-reduced-motion`.
- Calculator output number (Section 5) count-transitions over 240ms when inputs change — no spring bounce, linear ease-out only, since this is a data readout, not a celebratory moment.
- FAQ/accordion chevron rotates 180° over 200ms on open/close.
- Toggle segment (Monthly/Annual) slides its background pill over 220ms; no color crossfade.
- No parallax, no scroll-jacking anywhere on this route.

## Accessibility + Bangla notes

- All tables use real `<table>` markup with `<th scope="col">`/`<th scope="row">` where applicable — the fee anatomy and comparison tables are read out as structured data by screen readers, not divs.
- Calculator inputs are native `<input type="range">` / `<input type="number">` with associated `<label>` elements and `aria-describedby` pointing to the unit (BDT, %); output region uses `aria-live="polite"` so screen reader users hear the recomputed contribution and break-even figures without needing to re-focus.
- Objection and FAQ bands use native `<details>`/`<summary>` — functions without JavaScript, exposes correct expanded/collapsed state to assistive tech automatically.
- Every Bangla string listed above is rendered in `lang="bn"` spans so screen readers switch pronunciation correctly and `{typography.bangla-display}` drops latin negative tracking to 0, per DESIGN.md.
- Numerals in Bangla copy remain in Bangla-Latin digit form consistently (৳ and Arabic numerals, not Bengali numerals) to match how prices are actually displayed on Bangladeshi e-commerce sites and avoid a mismatch between spoken and written form for screen readers.
- Color is never the sole carrier of meaning: the inclusion matrix uses a glyph (check/dash) plus text alternative in the `aria-label`, not color alone, so the "no red/green for cost lines" design rule doesn't compromise usability.
- Minimum tap target 44×44px on all toggle, calculator slider handles and CTA pills, verified at the 640px breakpoint where the accordion layout is densest.

## Measurement plan

- **Primary conversion event**: `pricing_trial_start` fired on primary CTA click, tagged with the plan card it was clicked from (hero vs tier grid vs final CTA) to attribute which band actually drove the click.
- **Calculator engagement**: `pricing_calculator_input_change` fired on debounce (600ms) per field, to see which input merchants adjust most — signals which cost line is least understood or most contested.
- **Break-even output view**: `pricing_breakeven_computed` fired once per session when the output first renders with non-default inputs, paired with the computed break-even order count as a property, to build a distribution of real merchant break-even points over time.
- **Annual/Monthly toggle**: `pricing_billing_toggle` with the selected state, to measure what fraction of visitors self-select into annual before ever reaching the objection-handling band — a leading indicator of trust.
- **FAQ/objection expand rate**: `pricing_faq_expand` and `pricing_objection_expand` per item ID, to identify which objections are read most often and should be promoted higher up the page or into the hero sub-copy in future iterations.
- **Scroll depth**: measured at each band boundary (14 bands total) to see where drop-off concentrates — particularly whether visitors reach the fee-anatomy and calculator bands before leaving, since those are the substantive trust-building sections.
- **Downstream cohort**: join `pricing_trial_start` to actual trial-to-paid conversion by plan tier, to validate whether the theme-to-plan fit mapping in Section 8 correlates with lower churn (merchants on a theme suited to their plan tier retaining longer than mismatched ones).
