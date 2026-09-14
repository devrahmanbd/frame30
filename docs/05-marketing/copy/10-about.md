# `/about`

New route: `src/routes/about.tsx`
**Shell**: public marketing shell, dark canvas throughout, no light-mode fallback.
**Scope**: brand narrative + thesis page. No pricing, no product screenshots deep-dive — those live on `/product` and `/pricing`. This page argues *why Framique exists* and backs the argument with evidence, not adjectives.

---

## SEO

- **Title** (58 chars): `About Framique — commerce infrastructure built for Bangladesh`
- **Description** (159 chars): `Why imported commerce software mis-serves a COD-heavy, Bangla-reading, mobile-money market — our principles, engineering choices, roadmap process and team.`
- **og:title**: `Built in Dhaka, for the way Bangladesh actually sells.`
- **og:description**: `A commerce platform where bKash, Nagad, COD and Bangla are in the data model — not bolted on as a plugin.`
- **canonical**: `/about`
- **og:url**: `/about`
- **og:image**: `/og/about.png` (aurora violet mesh, white wordmark, Bangla subhead sample — see Image Brief)
- **JSON-LD**: `Organization` —
  ```json
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Framique",
    "url": "https://framique.com",
    "logo": "https://framique.com/logo.svg",
    "foundingDate": "{{founding_date}}",
    "founders": [{ "@type": "Person", "name": "{{founder_name}}" }],
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "{{street_address}}",
      "addressLocality": "Dhaka",
      "postalCode": "{{postal_code}}",
      "addressCountry": "BD"
    },
    "sameAs": ["{{linkedin_url}}", "{{facebook_url}}"]
  }
  ```
  Plus `BreadcrumbList` (`Home / About`).
- **H1 rule**: exactly one `<h1>` on the page — the hero headline. All band headings are `<h2>`; sub-claims inside a band are `<h3>`. Table captions and card titles are never headings.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `bangladesh commerce infrastructure company`
  - **Secondary**:
    - `ecommerce software built in dhaka`
    - `bangla first commerce platform`
    - `local ecommerce saas bangladesh`
  - **Long-tail / question intents**:
    - `why global ecommerce platforms fail bangladeshi merchants`
    - `company building commerce software in dhaka`
  - **Placement**: H1 (primary), thesis band, principles band, team band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/about`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

---

## Band order

1. Hero
2. The origin thesis (with mismatch evidence table)
3. Operating principles (8, cards)
4. Engineering philosophy
5. Design philosophy → the 5 themes
6. How we decide what to build (prioritisation framework + scoring table)
7. How we make money (and why it matters)
8. Team (template)
9. Careers
10. What we will never do
11. Timeline (template)
12. FAQ
13. Final CTA

---

## 1. Hero — aurora hero, canvas

*Lever: specificity beats claim — naming the exact frictions (COD, bKash, Bangla) signals insider credibility before any argument is made.*

- **Eyebrow**: `Dhaka, Bangladesh`
- **H1**: **Built in Dhaka, for the way Bangladesh actually sells.**
- **Sub**: Cash on delivery, mobile wallets and Bangla storefronts aren't edge cases we patched in. They're the starting assumption of every table in our database.
- **Primary CTA**: `Read the origin thesis` (anchors to Band 2)
- **Alt CTA**: `See open roles`
- **বাংলা — H1**: **ঢাকায় তৈরি, বাংলাদেশ যেভাবে বেচাকেনা করে তার জন্য।**
- **বাংলা — Sub**: ক্যাশ অন ডেলিভারি, মোবাইল ওয়ালেট আর বাংলা স্টোরফ্রন্ট আমাদের কাছে ব্যতিক্রম নয় — এগুলোই আমাদের ডেটাবেসের ভিত্তি।

**Design note**: aurora mesh (violet → magenta, low alpha, 24–38s drift) behind display type; no product screenshot in this hero — the page opens on argument, not UI. Eyebrow in `{caption}` token, ink-muted. H1 at `display-xl`, negative tracking per DESIGN.md. CTA row: white pill primary, glass pill alt.

---

## 2. The origin thesis — canvas, one column with embedded evidence table

*Lever: problem-first framing — naming the mechanism of failure (localisation-as-afterthought) makes the alternative feel inevitable rather than promotional.*

Most commerce software sold into Bangladesh was designed somewhere a credit card is the default payment method, a national address system is machine-parseable, and the storefront's primary language uses a single case and no conjunct consonants. None of that describes this market. When that software arrives here, "localisation" means a currency symbol, a translated button label, and a cash-on-delivery module maintained as a bolt-on plugin, usually by a third party, usually behind on updates.

That gap doesn't stay theoretical. It shows up as a merchant reconciling COD collections against courier remittance in a spreadsheet at midnight because the platform's ledger assumes every order clears through a payment gateway the moment it's placed. It shows up as a Bangla product title clipped mid-word because the theme's line-height was tuned for Latin ascenders and descenders, not for matras that need vertical room. It shows up as an SMS-OTP checkout flow built for a market where every customer has a stable email address and a laptop, in a market where the phone number *is* the identity and the checkout happens on a mid-range Android device over 3G.

We didn't start Framique to add a "Bangladesh mode" to an existing platform. We started it because the mismatch is structural — it lives in the data model, not the UI chrome — and structural mismatches can't be fixed with a translation file.

### The mismatch, concretely

| What imported platforms assume | What the Bangladesh market actually does | What breaks | Framique's structural answer |
|---|---|---|---|
| Payment clears at checkout via card/gateway | 60–80%+ of ecommerce orders (merchant-reported ranges vary; see `{{cod_share_citation}}`) are cash on delivery, settled by the courier days later | Order status, revenue recognition and refund logic all assume a payment event that hasn't happened yet | Order state machine has a first-class `cod_pending_settlement` state; revenue and payout ledgers reconcile against courier remittance, not a gateway webhook |
| "Payment method" = card or PayPal | Mobile financial services — bKash, Nagad, Rocket — are the dominant digital rail | MFS bolted on as an unmaintained plugin; webhook retries and partial-capture edge cases silently drop | bKash/Nagad/Rocket are core payment adapters behind the same idempotent `charge`/`refund`/`payout` contract as cards — not a plugin tier |
| Address = street, city, state, ZIP, machine-geocoded | Many delivery addresses are landmark-based ("beside X mosque, 2nd lane") and courier-zone-based, not GPS-precise | Checkout forces invalid ZIP formats or silently mis-routes to the wrong courier hub | Address model captures courier zone + landmark field as first-class, not a "notes" afterthought |
| One script, one case, fixed line-height tuned for Latin | Bangla script: no case, conjuncts, matras that extend above/below the baseline | Bangla headlines clip descenders, letter-spacing negative-tracking (right for Latin) breaks legibility | `bangla-display` typography token: zero letter-spacing, 1.35+ line-box, applied automatically to any `lang="bn"` subtree |
| Fulfilment = one integrated carrier API (their market's UPS/FedEx equivalent) | Merchants route between Pathao, Steadfast, RedX, Sundarban and others by zone, cost and reliability, often per order | Single-carrier integrations force merchants into a courier's economics, not their own | Courier layer is a multi-provider abstraction merchants configure and switch without replatforming |
| Merchant support = ticket queue in a time zone 10+ hours away | Merchants need same-business-day answers in Bangla during BST hours, often about a stuck COD parcel | 48-hour ticket SLA on a problem that's costing a merchant sales today | Support operates in BST, in Bangla and English, with COD/courier issues treated as P1 |
| Tax/VAT logic assumes one national scheme, English-only invoices | Bangladesh VAT rules and invoice formatting change by legal year and require Bangla-legible receipts | Manual invoice patching every fiscal year | VAT computation versioned per legal year in the ledger, invoices render Bangla by default |

Every row in that table is a decision we made once, in the schema or the type system, so it doesn't have to be re-decided — or worked around — by every merchant, every day. That's the thesis: **commerce infrastructure that fits this market has to be built from the transaction outward, not from a Western storefront inward with a translation layer stapled on.**

*{{cod_share_citation}} — confirm exact COD-share statistic and source (e.g. LightCastle, BBS, or internal merchant cohort data) before publish; do not ship an unsourced percentage.*

**Design note**: table renders as a real markdown/HTML table on desktop (canvas background, hairline row dividers, ink-muted for the "what breaks" column, ink for the "answer" column); collapses to stacked glass cards per row at ≤640px, each card showing the four fields as labelled rows.

---

## 3. Operating principles — glass card grid (Z rhythm), 8 cards

*Lever: principles paired with a forbidden behaviour and a real product decision make values falsifiable — a visitor can check whether we actually did the thing, which is what makes a values list credible instead of decorative.*

### 1. Ship what's true
**Forbids**: publishing a metric, a customer count or a feature name before it is queryable in production.
**Produced**: this site has no "trusted by X merchants" banner until that number is pulled from a live query, not typed by marketing. See `{{customer_count_verification}}`.

### 2. The merchant owns the data
**Forbids**: any export flow that is throttled, paywalled, or missing fields present in the UI.
**Produced**: a full-account export (orders, customers, products, ledger) ships as a background job any merchant can trigger from settings, no support ticket required.

### 3. Local first, not local only
**Forbids**: treating BDT/COD/bKash support as a checkbox that blocks international growth.
**Produced**: currency is `currency_code` + `amount_minor_int` from day one (see Engineering Philosophy), so a merchant selling in BDT today can add a USD price list without a schema migration.

### 4. Boring where it counts
**Forbids**: "creative" solutions in money, auth or tenancy — the three places a clever shortcut becomes an incident.
**Produced**: Redis runs `noeviction` on purpose. A dropped idempotency key would mean a customer gets double-charged; we would rather page an engineer at 3 a.m. than silently retry a charge.

### 5. Bangla is not a translation layer
**Forbids**: applying Latin type rules (negative tracking, Latin line-height) to Bangla text and calling it "localised."
**Produced**: the `bangla-display` token drops letter-spacing to zero and enforces a 1.35+ line box automatically on any `lang="bn"` subtree — a theme cannot ship a Bangla headline that clips a matra.

### 6. Cash is a payment method, not an exception
**Forbids**: modelling COD as a workaround inside a payment system designed around instant gateway settlement.
**Produced**: `cod_pending_settlement` is a first-class order state with its own reconciliation view against courier remittance — not a manual spreadsheet a merchant keeps on the side.

### 7. Observability is a product feature, not an internal nicety
**Forbids**: shipping a feature merchants depend on without a metric, a log line and a trace a support engineer can use to answer "what happened to my order" in minutes, not days.
**Produced**: every checkout, payout and webhook path is instrumented with `withSpan` before it ships — the same instrumentation we use to debug is the one the on-call engineer opens when a merchant reports a stuck order.

### 8. No lock-in, including ours
**Forbids**: architecture choices that only make sense if a merchant is stuck.
**Produced**: self-hostable stack (Supabase on plain Postgres, Redis with a Valkey swap path), exportable data, and no proprietary storefront markup that only renders inside our runtime.

**বাংলা — sample card (Principle 2)**:
**অ্যাকাউন্টের ডেটার মালিক মার্চেন্ট।**
নিষেধ করে: এক্সপোর্ট ফিচার সীমিত রাখা বা পেওয়াল দেওয়া।
ফলাফল: সেটিংস থেকে যেকোনো সময় সম্পূর্ণ ডেটা এক্সপোর্ট করা যায়, সাপোর্ট টিকিট ছাড়াই।

**Design note**: 8 cards in a Z rhythm (alternating left/right emphasis across rows of 2 on desktop, 1-up ≤640px), `glass-card` component, `rounded-xl`, hairline top edge. Card header in `display-md`; the "Forbids" / "Produced" pair in `body` with `caption`-weight labels in `ink-muted`. No numbers/badges beyond the ordinal already in the heading.

---

## 4. Engineering philosophy — glass card grid, 2×3

*Lever: technical specificity as trust signal — buyers evaluating "build vs. imported SaaS" verify claims against architecture, not slogans, so this band trades in named mechanisms.*

**H2**: Infrastructure decisions we don't revisit per feature.

### Tenant isolation is enforced by the database, not remembered by developers
Every tenant table carries `merchant_id`; Postgres row-level security enforces isolation through security-definer helpers (`is_merchant_member`, `has_merchant_role`). Isolation is a test suite — `.e2e/specs/tenant_isolation.spec.ts` runs negative assertions on every release, not a code-review hope.

### Zero vendor lock-in, by architecture rather than by promise
The application only ever reads `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `REDIS_URL` — nothing in the codebase names a hosting provider. The same code path runs in a managed preview environment and on our own servers in production.

### Self-hostable end to end
Postgres, Redis, payments aggregation, search and the full observability stack (Prometheus, Loki, Sentry, Grafana, Alertmanager) run as pinned, versioned services we operate ourselves — not managed SaaS with per-seat billing pressure on the tools we use to debug our own platform.

### Every runtime dependency has a documented swap path
Supabase self-hosted is plain Postgres underneath — portable to bare Postgres and our own auth if ever required. Redis is `noeviction`-tuned but Valkey/KeyDB-compatible. Payments run through provider adapters behind one idempotent contract, so adding or removing a rail doesn't touch checkout code.

### Merchant data is exportable in full, on demand
Not a CSV of the three most common tables — a full-account export (orders, customers, products, inventory movements, ledger entries) triggerable from account settings without a support request.

### Observability is a product feature
Every checkout, payout and webhook path emits metrics (`incr`/`observe`), structured logs with `trace_id`/`span_id`, and traces through `withSpan` — a support engineer follows a merchant's stuck order from a Grafana panel to a Loki line to a Sentry trace in three clicks, because we designed the correlation, not because we happened to log enough.

**Design note**: 6 cards, `surface-1` fill (one step above canvas — this band reads as "structural," not atmospheric, so no gradient cards here). Each card: bold one-line claim as card title (`display-md`, ink), 2–3 sentence body (`body`, ink-muted). Icon set: database-lock, no-chain-link, server-stack, arrows-swap, download-cloud, activity-pulse — line icons, 1.5px stroke, ink-muted, 24px.

---

## 5. Design philosophy — canvas, two-column (Z flip) into theme showcase

*Lever: showing the causal chain from constraint (Bangla typography) to output (5 themes) makes the design system feel like an engineering answer to a real problem rather than a stylistic preference.*

**H2**: Bangla typography set the constraints. The five themes are what fit inside them.

Type systems built for Latin scripts assume every glyph sits between a baseline and a cap-height, with predictable ascenders and descenders. Bangla doesn't work that way: matras extend above the headline, and conjunct consonants stack vertically in ways that need genuine room, not a squeezed line-height borrowed from a Helvetica-tuned design system. Apply Latin negative tracking to Bangla — the aggressive, confident -4.5% tracking that makes an English headline feel sharp — and Bangla text becomes harder to read, not sharper. Matras clip. Conjuncts collide.

So the type system doesn't have "a Bangla mode." It has a rule: any display token applied inside a `lang="bn"` subtree drops its letter-spacing to zero and enforces a 1.35+ line box, automatically, regardless of which theme a merchant has chosen. That single rule — decided once, in the type token layer — is why every storefront a merchant builds on Framique renders Bangla product names correctly without a merchant ever touching a CSS property.

From that constraint, and from the range of retail formats we saw merchants actually running — a boutique with five products and heavy storytelling, a 2,000-SKU wholesale catalogue, a B2B distributor quoting in bulk — five official themes emerged, not as marketing skins but as different answers to "how much room does this catalogue need, and how much of it is Bangla-first."

| Theme | Built for | What its layout optimises | Bangla typography treatment |
|---|---|---|---|
| **Classic** | General retail, balanced catalogue size | Familiar grid, low cognitive load for first-time online shoppers | Bangla display at 1.4 line-box, product names never truncated mid-conjunct |
| **Modern** | Fashion, lifestyle, visual-first brands | Large imagery, minimal chrome, editorial pacing | Bangla headlines sit in oversized display slots with the same zero-tracking rule, no shrink-to-fit hacks |
| **Landing** | Single-product launches, campaign pages | One conversion path, no competing navigation | Bangla CTA copy set at button-token line-height so wallet names (bKash, Nagad) never wrap awkwardly |
| **Supershop** | High-SKU grocery/FMCG catalogues | Dense grid, fast filtering, price-forward cards | Tabular numerals for BDT prices sit flush against Bangla unit labels (কেজি, লিটার) without baseline drift |
| **B2B** | Wholesale, bulk-order, quote-driven merchants | Tables, tiered pricing, MOQ logic front and centre | Bangla and English render at matched optical size in the same pricing table row — no visual "which language is primary" hierarchy |

Every theme shares the same canvas rules from `DESIGN.md`: near-black artboard is the storefront default option, white Geist display type, glass surfaces with a 1px light edge, and the signal-blue accent reserved for links and focus states, never a button fill. What differs between themes is density and rhythm, not the underlying commitment to Bangla being a first-class script rather than a checkbox.

**Design note**: two-column intro (headline + prose left, aurora-mesh Bangla type close-up illustration right) flips into a 5-up card row at 900px→2-up→1-up. Each theme card: name, one-line descriptor, matched-optical-size Bangla/English sample string as the card's visual proof point. Link each card to its `/themes/{slug}` detail page (internal linking plan below).

---

## 6. How we decide what to build — canvas, framework + scoring table

*Lever: publishing the scoring mechanism itself (not just outcomes) lets a skeptical technical buyer audit our incentives directly, which is more persuasive than a roadmap.*

**H2**: A public framework, not a black box.

Every roadmap request — from a merchant support ticket, a sales conversation, or an internal engineering proposal — is scored against the same four weighted criteria before it enters a sprint. The scoring is public internally and the outcome is traceable: any merchant can ask why a feature they requested ranked where it did.

| Criterion | Weight | What it measures | Example |
|---|---|---|---|
| **Structural fit** | 35% | Does this fix a mismatch in the core data model (like the COD/MFS/Bangla rows in Band 2), or does it patch a symptom? | A `cod_pending_settlement` reconciliation view scores high; a one-off CSV export for one merchant's edge case scores low |
| **Reach** | 25% | How many merchants, across how many themes/tiers, does this unblock? | A courier-abstraction improvement affecting all five themes outranks a single-theme cosmetic request |
| **Reversibility risk** | 20% | Can we ship it, learn, and adjust without breaking tenant isolation, money correctness or data portability? (Money/tenancy/auth changes score lower on speed, higher on required rigor — see Principle 4.) | A new storefront section block is fast to reverse; a ledger schema change is not, and is scoped accordingly |
| **Time-to-merchant-value** | 20% | Does this reduce a merchant's cost or reconciliation time within one release cycle, or is the payoff distant and speculative? | Faster courier-status sync scores higher than a long-horizon AI-merchandising bet with no proven demand yet |

A request needs a combined score above the current sprint threshold to be scheduled; below-threshold requests stay logged and re-scored every planning cycle as reach or evidence changes — nothing is silently dropped. Money, tenancy and auth changes always carry an additional gate regardless of score: a `[A]`-risk audit trail, a rollback-tested migration, and a negative-assertion test suite before merge, per the engineering decision record in `SYSTEM.md`.

This is also why the roadmap sometimes says no to a request that would be an easy "yes" for an imported platform with different constraints. A feature that only works because payment clears at checkout doesn't belong here until it's rebuilt against a ledger that treats COD as a first-class state — see Band 2. Structural fit outranks a fast yes.

**Design note**: framework intro as prose, scoring table below it (canvas background, hairline dividers, weight column right-aligned tabular numerals). Optional interactive element (non-blocking, progressive enhancement): a static example scorecard shown as a glass card beside the table, illustrating one real request scored across all four criteria — confirm with product before publishing a specific real example, or use `{{example_scored_request}}` placeholder.

---

## 7. How we make money — canvas, one column

*Lever: transparent incentive-alignment disclosure reduces the buyer's fear of a hidden agenda (upsell traps, dark-pattern fees) more effectively than a values statement alone.*

**H2**: We make money when merchants sell more, not when they're stuck.

Framique's revenue comes from subscription tiers (see `/pricing`) and a small percentage on payments processed through our in-house payments aggregation layer — the same layer that handles bKash, Nagad, Rocket, card and BNPL. We do not charge for data export, do not charge extra to unlock a merchant's own analytics, and do not take a cut of COD collections settled directly between a merchant and their courier.

That alignment matters for a structural reason: a platform that earns more when a merchant is confused, locked in, or paying for a feature they can't turn off has every incentive to keep the interface complicated and the exit expensive. A platform whose revenue tracks a merchant's actual sales volume has the opposite incentive — churn and stagnation cost us directly, so the roadmap in Band 6 is scored, in part, against whether it grows a merchant's revenue, not just our own feature count.

This is also why self-hosting and full data export aren't compliance checkboxes here (Bands 3 and 4) — they are a commitment that a merchant's ability to leave stays real, which is the only thing that keeps a subscription-and-take-rate business honest over time.

**বাংলা**: মার্চেন্ট যখন বেশি বিক্রি করে, আমরা তখনই বেশি আয় করি — মার্চেন্ট আটকে থাকলে নয়। ডেটা এক্সপোর্টে কোনো চার্জ নেই, নিজস্ব অ্যানালিটিক্স আনলক করতে বাড়তি খরচ নেই।

**Design note**: single glass-card pull-quote for the opening line ("We make money when merchants sell more, not when they're stuck.") set in `display-md`, surrounded by supporting prose in `body`. Link to `/pricing` inline, not as a CTA button — this band argues, it doesn't sell.

---

## 8. Team — TEMPLATE, glass card grid

*Lever: named, verifiable people (not stock founder mythology) build more trust than an anonymous "our team" paragraph — but only if every fact is true, so this band ships as a template pending confirmation.*

**H2**: The people building this.

> **TEMPLATE — DO NOT PUBLISH WITHOUT CONFIRMING EVERY FIELD BELOW.** No name, title, headcount, or tenure in this band may be invented. Replace each placeholder only with a fact confirmed by the named individual's consent and by HR/leadership sign-off.

**Facts to confirm before publish:**
- [ ] Legal company name and founding date (`{{founding_date}}`) — for JSON-LD and any "since {{year}}" copy.
- [ ] Founder name(s) and title(s) — `{{founder_name}}`, `{{founder_title}}`. Do not publish a founder photo/bio without written consent.
- [ ] Current headcount range, if disclosed at all (`{{headcount_band}}`, e.g. "a team of engineers, merchant success and support in Dhaka" — avoid a specific number unless confirmed and current, since headcount changes and a stale number reads as dishonest).
- [ ] Which team members have consented to appear by name/photo (`{{consented_member_list}}`). Only these appear; everyone else is represented by role only, if at all.
- [ ] Any prior company/product affiliations claimed in a bio — verify, don't infer from LinkedIn.

**Card template (repeat per consented member):**

> **Photo**: `{{member_photo}}` (real photo, not stock — if no photo consent, omit the card entirely rather than substitute a placeholder avatar)
> **Name**: `{{member_name}}`
> **Role**: `{{member_role}}`
> **One line**: `{{member_one_line}}` — a specific fact ("built the payments idempotency layer"), never a generic superlative ("passionate about ecommerce")

**Fallback copy if the team is not yet ready to appear individually** (use this instead of invented names):

**H2**: The people building this.
**Body**: We're a small team in Dhaka — engineering, merchant success and support — building infrastructure we'd want to run our own store on. Team profiles are going up here as people opt in to appear publicly. In the meantime, `/careers` lists what we're hiring for, and `/contact` reaches the team directly.

**Design note**: 3-up card grid → 2-up → 1-up, `glass-card`, consented photos only, `rounded-xl`, name in `display-md`, role in `caption` ink-muted. If fallback copy is used instead of cards, render as a single centered glass card with the fallback text and a `See open roles` link.

---

## 9. Careers — gradient-spotlight card

*Lever: specific, current openings (not "join our team" vagueness) filter for candidates who've actually read the page, and signal the team is real and growing.*

**H2**: We're hiring in Dhaka.
**Sub**: Engineering, merchant support and merchant success. Remote-friendly within Bangladesh; BST core hours.
**Primary CTA**: `See open roles`
**Alt CTA**: `Send a speculative note`

**What we screen for** (short list, honest about it):
- Comfort with the constraints in Band 2 — this isn't a "port a Shopify clone" job.
- Bangla writing and reading fluency for support, merchant success and content roles.
- For engineering: willingness to work close to money, tenancy and auth with the rigor in Principle 4 — this is not the team for "ship fast, fix later" on the ledger.

**বাংলা — H2**: **আমরা ঢাকায় নিয়োগ দিচ্ছি।**
**বাংলা — Sub**: ইঞ্জিনিয়ারিং, মার্চেন্ট সাপোর্ট এবং মার্চেন্ট সাকসেস টিমে। বাংলাদেশের ভেতরে রিমোট-ফ্রেন্ডলি।

**Design note**: gradient-spotlight-card (violet stop), `rounded-xxl`, white ink at ≥4.5:1 against the darkest gradient stop per DESIGN.md accessibility floor. One spotlight card max in this viewport — do not pair with another gradient card above or below the fold, per the Do/Don't rule against stacking gradient cards.

---

## 10. What we will never do — canvas, list band

*Lever: an explicit negative-commitments list is more credible than a positive values list because it constrains future behaviour in a way a reader can hold us to.*

**H2**: Commitments, not aspirations.

- **We will never sell or broker merchant customer data.** Analytics stay inside the merchant's own account; we don't monetize a second time on data collected for their storefront.
- **We will never lock storefront data into a format only our runtime can read.** Exports are structured, documented and importable elsewhere — see Engineering Philosophy.
- **We will never make COD or MFS payments a paid add-on tier.** They are core payment rails, not premium features, because for this market they are not optional.
- **We will never publish a metric on this site that isn't backed by a live, queryable number.** See Principle 1.
- **We will never require a support ticket to export data or close an account.** Both are self-service.
- **We will never apply Latin typographic rules to Bangla text and call it localisation.** See Design Philosophy.
- **We will never take a cut of COD cash settled directly between a merchant and their courier.** See How We Make Money.
- **We will never ship a money, tenancy or auth change without the audit trail and negative-assertion tests described in `SYSTEM.md` §6.** No exceptions for deadline pressure.

**বাংলা — sample**: আমরা কখনও মার্চেন্টের কাস্টমার ডেটা বিক্রি বা শেয়ার করব না। অ্যানালিটিক্স মার্চেন্টের নিজস্ব অ্যাকাউন্টের ভেতরেই থাকে।

**Design note**: flat list on canvas (no cards) — deliberately plainer treatment than the principles band, signalling these are constraints, not brand flourishes. Each item starts with a bold "We will never..." clause in `body` weight-500, ink; the rationale clause in ink-muted. Thin hairline divider between items, no bullets/icons.

---

## 11. Timeline — TEMPLATE, canvas horizontal band

*Lever: a dated build history substitutes for "trust us" with "here's what happened, in order" — but only with confirmed dates.*

**H2**: How we got here.

> **TEMPLATE — every date below must be confirmed against real records (incorporation documents, changelog, release tags) before publish. Do not estimate or round a date for narrative effect.**

| Date (confirm) | Milestone | Evidence to cite |
|---|---|---|
| `{{founding_date}}` | Framique founded in Dhaka | Incorporation record |
| `{{first_merchant_date}}` | First merchant storefront live | Internal changelog / order-1 record |
| `{{mfs_launch_date}}` | bKash/Nagad/Rocket payment rails launched | Release tag / `docs/06-payments/` changelog |
| `{{self_host_date}}` | Self-hosted Supabase + Redis + observability stack in production | `ops/` changelog |
| `{{themes_launch_date}}` | Five official themes (Classic, Modern, Landing, Supershop, B2B) shipped | Theme release notes |
| `{{today_or_latest_milestone}}` | `{{latest_milestone_description}}` | `{{latest_milestone_evidence}}` |

**Design note**: horizontal scroll-snap timeline on desktop (dot-and-line on a hairline track), collapses to a vertical stacked list ≤900px. Dates in tabular numerals. Do not render this band at all until at least three rows have confirmed dates — a timeline with all placeholders reads worse than no timeline.

---

## 12. FAQ — accordion, canvas, 10 items

*Lever: pre-answering the skeptical questions a technical or financial buyer would ask privately removes the reason to bounce and search a competitor's answer instead.*

1. **Is Framique only for merchants selling in Bangladesh?**
   No. BDT and Bangla are the defaults, not a ceiling — see "Local first, not local only" in our principles. Merchants can add other currencies and languages as they expand; nothing about the core schema assumes BDT-only.

2. **How is this different from installing a COD plugin on Shopify or WooCommerce?**
   A plugin adds a field to a payment flow designed around instant gateway settlement. Framique's order state machine has `cod_pending_settlement` as a native state from the schema up, so reconciliation against courier remittance is a built-in view, not a spreadsheet a merchant maintains separately. See the mismatch table in Band 2.

3. **Can I export all my data if I decide to leave?**
   Yes, in full, on demand, from account settings — orders, customers, products, inventory movements and ledger entries — with no support ticket and no throttling. See "The merchant owns the data."

4. **Is Framique open source or self-hostable?**
   The platform is built on a self-hostable stack (Postgres via self-hosted Supabase, Redis, an in-house payments aggregator, and a self-hosted observability stack). `{{open_source_license_status}}` — confirm current licensing/source-availability position before publishing a specific claim here.

5. **Which couriers does Framique support?**
   Multiple providers behind a single abstraction merchants configure and switch between by zone, cost and reliability — see Engineering Philosophy. Confirm the current named list against `{{active_courier_integration_list}}` before publishing specific courier names, since integrations are added over time.

6. **Do I have to use one of the five official themes, or can I customize further?**
   The five themes (Classic, Modern, Landing, Supershop, B2B) are starting points tuned for different catalogue shapes; each is customizable within the token system described in `DESIGN.md`. Deeper theme-building detail lives on `/themes`.

7. **How does Bangla typography actually work under the hood — is it just a font swap?**
   No — it's a token rule: any display type applied inside a `lang="bn"` subtree automatically zeroes letter-spacing and enforces a taller line box, regardless of theme. See Design Philosophy.

8. **What happens to my payout if bKash or a courier has an outage?**
   Idempotent charge/refund/payout contracts and a Redis `noeviction` policy mean a retry never becomes a duplicate transaction; if a dependency is down, we fail loudly and page an engineer rather than silently degrade correctness. See Engineering Philosophy and `SYSTEM.md` §4.5.

9. **How do you decide what feature to build next — can I influence it?**
   Every request is scored against four public criteria (structural fit, reach, reversibility risk, time-to-merchant-value); see Band 6. Support and sales requests enter the same scoring queue as internal proposals — there isn't a separate, opaque list.

10. **Who actually owns and operates Framique, and where is the company based?**
    Legal entity, address and incorporation details are published on `/contact` and in this page's `Organization` JSON-LD. `{{legal_entity_name}}` and `{{registration_details}}` must be confirmed and kept in sync between `/about` and `/contact` before publish.

**বাংলা — sample (FAQ 3)**:
**প্রশ্ন**: আমি যদি প্ল্যাটফর্ম ছেড়ে যেতে চাই, আমার সব ডেটা এক্সপোর্ট করতে পারব কি?
**উত্তর**: হ্যাঁ, সম্পূর্ণ ডেটা — অর্ডার, কাস্টমার, পণ্য, ইনভেন্টরি এবং লেজার — যেকোনো সময় অ্যাকাউন্ট সেটিংস থেকে এক্সপোর্ট করা যায়, কোনো সাপোর্ট টিকিট ছাড়াই।

**Design note**: `faq-row` component, canvas background, `rounded-md`, single-open accordion (opening one closes the previous), chevron rotates 180° on open (`prefers-reduced-motion` disables rotation transition, keeps instant state change). Questions in `body` weight-500 ink; answers in `body` ink-muted, `lang="bn"` spans get the Bangla display token rule where headline-weight, but FAQ body Bangla stays at body-token size with the same zero-tracking rule applied.

---

## 13. Final CTA — gradient-spotlight, canvas

*Lever: closing on the same specific frictions named in the hero (not a generic "get started") reinforces that the whole page argued one coherent thesis.*

**H2**: Built for cash, wallets and Bangla — not around them.
**Sub**: See how the platform handles COD reconciliation, bKash/Nagad payouts and Bangla storefronts in one system.
**Primary CTA**: `Explore the product`
**Alt CTA**: `Talk to us`

**বাংলা — H2**: **নগদ, ওয়ালেট আর বাংলার জন্য তৈরি — শুধু এগুলোর "সাপোর্ট" নয়।**

**Design note**: single gradient-spotlight-card (magenta or teal stop — alternate from the careers band's violet so the page doesn't repeat the same gradient twice), full-width within container, white pill primary CTA, glass pill alt. This is the second and last gradient card on the page — DESIGN.md's "scarce" rule caps a long page at one or two.

---

## Internal linking plan

- Band 2 (origin thesis) → `/product#payments` (COD/MFS handling detail) and `/pricing` (no export/analytics upsell claim substantiated there).
- Band 5 (design philosophy) → `/themes` index and each `/themes/{classic|modern|landing|supershop|b2b}` detail page from its respective card.
- Band 6 (prioritisation) → `/changelog` or `/roadmap` if such a page exists, so "public framework" is backed by a visible artifact of decisions made under it.
- Band 7 (revenue) → `/pricing` inline link.
- Band 8 (team) → `/careers` (full listing) and `/contact`.
- Band 9 (careers) → `/careers` full listings page; alt CTA opens a `mailto:` or contact form scoped to "speculative."
- Band 10 (commitments) → `/legal/privacy` for the data-sale commitment, `/security` if that page exists.
- FAQ item 10 → `/contact` for NAP/legal entity detail (shared JSON-LD `Organization` block, per the original NAP note).
- Final CTA → `/product` and `/contact`.

---

## Image brief

- **Hero**: no product screenshot; aurora violet/magenta mesh only, per DESIGN.md hero treatment. If a supporting image is required for og:image, use a close crop of the mesh with the wordmark and Bangla subhead sample — never a stock photo of a "team high-fiving."
- **Band 2 evidence table**: no illustrative image; the table is the visual.
- **Band 5 theme showcase**: one representative storefront crop per theme card, screenshotted from the actual theme (not a mockup), showing at least one Bangla product name in situ to prove the typography claim — do not use lorem-ipsum or English-only placeholder catalogues in these crops.
- **Band 8 team**: real, consented photographs only, consistent crop (square, neutral background) if/when published; no stock headshots, no illustrated avatars as a substitute.
- **Band 11 timeline**: no imagery required; if used, small monochrome icon per milestone type (launch, integration, infra), not photography.

---

## Icon list

`shield-lock` (tenant isolation) · `unlink` (zero lock-in) · `server-stack` (self-hostable) · `arrows-swap` (exportable/swap path) · `activity-pulse` (observability) · `wallet` (MFS payments) · `banknote` (COD) · `type` (Bangla typography) · `scale-balance` (prioritisation framework) · `chevron-down` (FAQ accordion) · `arrow-up-right` (external/internal links). All line icons, 1.5px stroke, `ink-muted` default / `ink` on hover, 20–24px depending on band density.

---

## Motion spec

- Hero aurora mesh: continuous drift, 24–38s loop, opacity+transform only.
- Bands 3, 4, 5 card grids: reveal-on-enter once (staggered 60–80ms per card in a row), never re-triggers on re-scroll.
- Band 6 scoring table: no motion beyond standard reveal — a table of criteria should not animate row-by-row in a way that delays reading.
- Band 9 / 13 gradient-spotlight cards: reveal-on-enter with a subtle scale-in (0.98→1.00) over 420ms, `cubic-bezier(0.22, 1, 0.36, 1)`; magnetic hover capped at 6px on the primary CTA only, per DESIGN.md.
- Band 11 timeline: horizontal scroll-snap on desktop uses native scroll, no JS-driven parallax.
- Band 12 FAQ: chevron rotation 200ms; content height auto-animates 280ms.
- All motion collapses to static state changes under `prefers-reduced-motion: reduce` — no exceptions, including the aurora drift (freezes on a mid-loop frame rather than jumping to frame 0).

---

## Accessibility + Bangla notes

- Single `<h1>` (hero); all band titles `<h2>`; sub-claims `<h3>` — verified against the H1 rule in SEO block.
- Evidence table (Band 2) and scoring table (Band 6) use real `<table>` markup with `<caption>` and scoped `<th>` headers, not styled `<div>` grids, so screen readers announce row/column relationships correctly.
- Every `lang="bn"` span or block gets `lang="bn"` in markup (not just visual font-switching) so screen readers switch pronunciation correctly.
- Bangla display token never inherits Latin negative tracking; enforced at the token layer per DESIGN.md, verified visually in Band 2/5 Bangla samples during QA — check for matra clipping specifically in the Bangla H1 and FAQ Bangla samples.
- Contrast: body ink-muted on canvas must clear 7:1 (DESIGN.md floor); gradient-spotlight card text (Bands 9, 13) must clear 4.5:1 against the darkest gradient stop — verify both gradient choices (violet in Band 9, magenta/teal in Band 13) against this floor before shipping, since some gradient stops are lighter than others.
- FAQ accordion: full keyboard operability (Enter/Space toggles, arrow-key navigation between questions optional but recommended), `aria-expanded` state on trigger, `aria-controls` linking trigger to panel.
- All interactive targets ≥44px on mobile per SYSTEM.md §7 mobile-first baseline, including FAQ row triggers and theme card links in Band 5.
- Timeline band (11) must remain operable via keyboard/screen reader in its vertical fallback layout — do not make the horizontal scroll-snap the only accessible path.

---

## Measurement plan

- **Scroll depth per band**: track band 2 (thesis), band 6 (prioritisation), band 8 (team) completion rate — these are the highest-effort read bands and the best signal of whether the thesis lands versus gets skimmed.
- **CTA click-through by variant**: hero primary (`Read the origin thesis`) vs. alt (`See open roles`) — tells us whether visitors arrive skeptical (want the argument) or ready (want the job/product).
- **FAQ expand rate per question**: identifies which objections are most live; questions 2, 3 and 8 (differentiation, data ownership, reliability) are the predicted top three — validate against actual data post-launch.
- **Internal link click-through** from Band 5 theme cards to `/themes/{slug}` — validates whether the design-philosophy argument converts into theme evaluation.
- **Careers CTA conversion** (`See open roles` clicks → application starts) tracked separately from the hero's identical-labeled alt CTA, to distinguish "curious visitor" traffic from "job-seeker" traffic landing directly on `/about`.
- **Time-on-page vs. bounce for evidence table (Band 2)**: a table this dense either engages a serious buyer or triggers an immediate bounce; segment by traffic source (organic search vs. paid vs. referral) to see which channel's visitors are the intended audience for this page.
- **JSON-LD / rich-result monitoring**: confirm `Organization` structured data validates and surfaces correctly in search console once `{{founder_name}}`, `{{founding_date}}` and address placeholders are resolved — a page shipped with template tokens still in the JSON-LD is a shipping blocker, not a follow-up.

---

## Pre-publish checklist (placeholders that must be resolved)

- [ ] `{{founder_name}}`, `{{founder_title}}`, founder consent for any bio/photo
- [ ] `{{founding_date}}`
- [ ] `{{street_address}}`, `{{postal_code}}`, `{{linkedin_url}}`, `{{facebook_url}}` (NAP, shared with `/contact`)
- [ ] `{{cod_share_citation}}` — sourced COD-share statistic or remove the parenthetical
- [ ] `{{customer_count_verification}}` — confirm no unqueried metric ships
- [ ] `{{headcount_band}}`, `{{consented_member_list}}`, per-member `{{member_*}}` fields or use fallback team copy
- [ ] `{{example_scored_request}}` — real or omitted, never invented
- [ ] Timeline dates: `{{first_merchant_date}}`, `{{mfs_launch_date}}`, `{{self_host_date}}`, `{{themes_launch_date}}`, `{{latest_milestone_description}}` + evidence — timeline band withheld if fewer than 3 confirmed
- [ ] `{{open_source_license_status}}`, `{{active_courier_integration_list}}`, `{{legal_entity_name}}`, `{{registration_details}}`
