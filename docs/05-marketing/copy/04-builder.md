# `/builder`

Route: `src/routes/builder.tsx` · Shell: marketing site header/footer, no app chrome · Scope: the visual theme/section builder — the surface a Bangladeshi merchant uses to assemble, brand, and publish a storefront without a developer.

## SEO

- **Title** (58 chars, 9 words): `Storefront builder — sections, tokens, versions, Bangla`
- **Description** (159 chars, 24 words): `Assemble your storefront from sections, edit design tokens once for the whole store, publish a version, and roll back in one click. Bangla and English from one catalogue.`
- **og:title**: `Design the storefront. Don't fight the theme.`
- **og:description**: `Drag sections, edit tokens, ship a version — with instant rollback and a Bangla-first catalogue.`
- **canonical**: `/builder` · **og:url**: `/builder`
- **JSON-LD**: `BreadcrumbList` (Home → Product → Builder), `SoftwareApplication` (name: Framique Builder, applicationCategory: BusinessApplication, operatingSystem: Web).
- **H1 rule**: exactly one H1 per render — the hero headline. Every subsequent band uses H2; sub-groups inside a band use H3. Bangla H1 variant renders in a `lang="bn"` span with `letter-spacing: 0`, never inheriting the latin display token's negative tracking.
- **og:type**: `website`
- **twitter:card**: `summary_large_image` · **twitter:title** mirrors `og:title` · **twitter:description** mirrors `og:description`
- **Keywords** — the page must earn these in body copy and headings; never stuff a `<meta name="keywords">` tag, it is ignored by search engines and reads as spam to reviewers.
  - **Primary**: `online store builder bangladesh`
  - **Secondary**:
    - `drag and drop storefront builder`
    - `ecommerce theme editor`
    - `bangla website builder`
    - `storefront sections and templates`
  - **Long-tail / question intents**:
    - `build an online store without a developer in bangladesh`
    - `ecommerce website builder with bangla support`
  - **Placement**: H1 (primary), canvas mock caption, sections band, themes decision-tree band. Bangla equivalents belong in the `lang="bn"` variants of the same blocks — never as a hidden duplicate paragraph.
- **URL rule**: canonical and `og:url` are **relative** (`/builder`) until a production domain is set, so preview, published and custom-domain traffic each canonicalise to themselves. Never bake `https://framique.com` into source.

## Band order

1. Hero (aurora)
2. Canvas mock — glass browser frame
3. Section-based editing model (Z rows)
4. Drafts, autosave, versioning, rollback, scheduled publish
5. The five official themes — merchandising guidance + decision table
6. Design tokens and brand consistency
7. Bangla + English from one catalogue
8. Custom fonts — licence attestation, weight budget
9. Custom code — sandboxing and secret scanning
10. Performance budgets — why LCP matters for BDT conversion (worked example)
11. Anatomy of a high-converting Bangladeshi product page (15-item checklist)
12. Your first hour in the builder (step-by-step)
13. Comparison vs generic page builders
14. Accessibility
15. FAQ (10)
16. Final CTA (gradient spotlight)

---

## 1. Hero — aurora

*Lever: specificity beats hype — the sub-headline names the exact mechanism (sections, tokens, rollback) instead of promising an outcome.*

- **Eyebrow**: `Visual builder · versioned`
- **H1**: **Design the storefront. Don't fight the theme.**
- **H1 বাংলা**: **স্টোরফ্রন্ট ডিজাইন করুন। থিমের সাথে লড়াই নয়।**
- **Sub**: Drag sections, edit tokens, ship a version — with instant rollback.
- **Sub বাংলা**: সেকশন টেনে আনুন, টোকেন এডিট করুন, একটি ভার্সন পাবলিশ করুন — সাথে সাথে রোলব্যাকের সুযোগসহ।
- **Primary CTA**: `Open a live demo` · **Alt CTA**: `See a store built with it`

**Design note**: canvas `#090909`, aurora mesh at low alpha behind the H1 only, drifting on a 24–38s loop. H1 uses `display-xl` (76px / 600 / -3.4px tracking); Bangla H1 span drops tracking to 0 and expands `line-height` to 1.35 so kars and matras are never clipped.

---

## 2. Canvas mock — glass browser frame

Layered still: section rail left, canvas centre, token panel right, rendered inside a glass browser chrome (`{components.glass-card}`, 1px light top edge, `backdrop-blur(16px)`).

**Caption**: `The same renderer draws the editor and the live store, so preview is not an approximation.`

**Caption বাংলা**: `এডিটর ও লাইভ স্টোর একই রেন্ডারার ব্যবহার করে, তাই প্রিভিউ কোনো অনুমান নয়।`

This is a structural claim, not a marketing flourish: most page builders run a simplified preview renderer that diverges from production CSS, web fonts, and JS at the margins — the classic "it looked right in the editor" complaint. Framique's editor iframe loads the identical theme bundle the storefront serves, so what you see in the canvas is pixel-identical to what a shopper on a Grameenphone 4G connection in Bogura sees.

---

## 3. Section-based editing model — Z rows

1. **text-left — Sections, not a page of HTML.**
   *Lever: chunking — a store becomes a short list of named, reorderable blocks instead of one continuous document, which lowers the cognitive load of "where do I click to change this."*
   Add a hero, a product grid, a testimonial strip, a Bangla-only announcement bar. Each section carries its own settings, its own Bangla copy, and its own visibility rules (device, audience segment, date window, A/B arm). Sections are drag-reordered on the rail; there is no way to "break the layout" by nesting divs incorrectly, because there are no divs to nest.
   **Proof**: `Per-section visibility by audience or experiment.`

2. **text-right — Tokens, not scattered CSS.**
   *Lever: single-point-of-control — changing one variable that fans out everywhere removes the fear of an incomplete edit.*
   Colour, radius, type scale, and spacing live in one panel. Change the accent colour once and every button, badge, and link across every section updates together — no hunting through forty section-level colour pickers left over from a theme you customised eighteen months ago.
   **Proof**: `One token, every section.`

3. **text-left — Versions, not fear.**
   *Lever: loss aversion neutralised — reversibility removes the psychological cost of trying something.*
   Every publish is a version with an author and a timestamp. Compare two versions side by side, restore an older one, or roll back mid-campcampaign without opening a support ticket.
   **Proof**: `Rollback is one click, not a restore ticket.`

4. **text-right — Custom code with a seatbelt.**
   *Lever: safe-to-fail sandboxing — advanced users get power without exposing the whole store to their mistakes.*
   Drop in HTML, a tracking pixel, or a third-party widget and it renders inside an isolated frame that cannot reach the DOM outside itself, so a broken script degrades gracefully instead of white-screening checkout.
   **Proof**: `Sandboxed widgets, isolated failures.`

**Design note**: alternate text-left/text-right per `Z/flip alternating rows` pattern; each row's proof line renders as a `caption` token pill in `{colors.surface-1}`.

---

## 4. Drafts, autosave, versioning, rollback, scheduled publish

*Lever: safety net — merchants edit more confidently when they know nothing can be lost or shipped by accident.*

Every keystroke in the builder writes to a **draft**, autosaved roughly every few seconds to a working copy that never touches the live store. Nothing you type in the canvas is visible to a shopper until you explicitly publish. This separation — draft vs. live — is the single most important safety property of the editing model, and it is why merchants can redesign a homepage during business hours without risk.

**The publish lifecycle:**

| Stage | What happens | Who sees it | Reversible? |
|---|---|---|---|
| Draft | Autosaved continuously as you edit | Only you, in the builder | N/A — it is not shipped |
| Preview link | Shareable URL renders the draft outside the editor | Anyone with the link | Yes, expires or is revoked anytime |
| Scheduled publish | Draft is queued for a future timestamp | No one, until the clock hits | Yes, cancel before the scheduled time |
| Published (live version) | Draft becomes the numbered live version | All storefront visitors | Roll back to any prior version, one click |
| Rolled back | An earlier version is restored as current | All storefront visitors | Yes, roll forward again if needed |

Versions are numbered and immutable: version 14 always means exactly the sections, copy, and tokens it meant the day it went live, even after you publish version 15. This matters for a very concrete reason — if a Friday evening Eid promotion campaign converts poorly, you can compare version 14 (the promo) against version 13 (the prior baseline) side by side, see exactly which sections changed, and roll back to 13 in one click without waiting for a developer or filing a ticket.

**Scheduled publish** decouples "when I finish the work" from "when the shopper sees it." A merchant working on a Ramadan sale page on a Tuesday night can queue it to go live at midnight before the first day of the sale, with zero manual action required at that hour.

**Design note**: version history renders as a vertical timeline in `{components.glass-card}`, each entry showing author avatar, relative timestamp, and a "Compare" pill; the currently-live version carries a `{colors.semantic-success}` dot.

---

## 5. The five official themes

*Lever: bounded choice — five well-differentiated options prevent decision paralysis while still covering the real range of Bangladeshi commerce use cases.*

Framique ships **five official themes**: Classic, Modern, Landing, Supershop, B2B. Each is a complete section library, token set, and default layout — not a colour skin on top of one generic template. Choosing the wrong theme early is the single most common cause of a merchant fighting their storefront for months; the paragraphs below exist to prevent that.

**Classic** is the theme for a merchant who sells a moderate, well-photographed catalogue — apparel, home goods, gift items — and wants the storefront to feel like a trustworthy, unhurried shop rather than a flash sale. It uses generous whitespace, a traditional top-nav-plus-mega-menu structure, and a product grid that privileges photography over badges and countdown timers. Merchandising guidance: use Classic when your product photography is genuinely strong, because the theme gives images the most room and offers the fewest visual crutches (no urgency banners baked into the grid) to compensate for weak imagery. It is the safest default for a first store and the easiest theme to hand to a small team, since its section library is the smallest and least likely to be misconfigured.

**Modern** is built for a merchant who wants sharper visual rhythm, tighter type, and a slightly more editorial feel — closer to a D2C brand site than a marketplace stall. It leans on larger imagery blocks, asymmetric grids, and a bolder type scale, and it rewards a merchant who has invested in a consistent visual identity (logo, colour, photography style) because the theme has fewer built-in guardrails and more open canvas. Merchandising guidance: choose Modern when you sell fewer SKUs at a higher price point and want each product to feel considered rather than commoditised — a 12–30 SKU jewellery, skincare, or lifestyle catalogue is the archetypal fit. Avoid Modern for a 500-SKU catalogue; its layouts are not optimised for dense browsing.

**Landing** is not a general storefront theme — it is a single-product or single-campaign theme built around one long-scrolling persuasive page rather than a catalogue-and-category structure. Merchandising guidance: use Landing when you are launching one hero SKU (a single gadget, a course, a limited drop) and want every pixel of the page arguing for that one purchase decision, with testimonial strips, FAQ, and a sticky buy bar doing the work a category page cannot. Do not use Landing as your only storefront if you plan to add a second product line later — you will need Classic, Modern, or Supershop as the catalogue expands, and Landing pages can live alongside them as campaign microsites.

**Supershop** is the highest-density theme, designed for catalogues in the hundreds-to-thousands of SKUs — grocery, electronics accessories, general merchandise. It front-loads filters, category rails, and a dense grid, and assumes the shopper arrives with a specific product in mind rather than browsing for inspiration. Merchandising guidance: choose Supershop when your customers search and filter more than they scroll, and when your margin comes from volume and repeat purchase rather than a premium unboxing moment. Supershop's product cards show price, discount badge, and stock status by default; strip them down manually if your catalogue is smaller than it looks.

**B2B** serves merchants who sell to other businesses rather than to individual consumers — wholesalers, distributors, manufacturers quoting bulk orders. It replaces the impulse-purchase patterns of the consumer themes with tiered pricing tables, minimum order quantity fields, a request-a-quote flow, and account-gated pricing that only shows once a buyer is signed in. Merchandising guidance: choose B2B only if a meaningful share of your revenue is quote-based or requires business verification before checkout; retrofitting a consumer theme with wholesale logic is far more fragile than starting on the theme built for it.

**Theme-choice decision table**

| If your situation is… | Choose | Because |
|---|---|---|
| First store, moderate catalogue, strong photography | Classic | Safest default, smallest section library, image-forward |
| Small high-margin catalogue, strong brand identity | Modern | Editorial layout rewards fewer, better products |
| One hero product or campaign launch | Landing | Single-purchase-decision page, not a catalogue |
| Hundreds to thousands of SKUs, filter-driven browsing | Supershop | Density and filters over inspiration |
| Wholesale, quote-based, or account-gated pricing | B2B | Tiered pricing and MOQ built in, not bolted on |
| Unsure, catalogue will grow past 50 SKUs in a year | Classic → migrate later | Cleanest section model to extend |

**Design note**: theme cards render in a 5-up grid at desktop → 2-up at 900px → 1-up at 640px, each card a `{components.pricing-card}` with a static screenshot, not a gradient spotlight (gradients are reserved for the final CTA and one mid-page highlight, per the scarce-aurora rule).

---

## 6. Design tokens and brand consistency

*Lever: single source of truth — a merchant who edits one token instead of forty section settings makes fewer inconsistent decisions.*

A token panel holds four families: **colour** (primary, accent, surface, text), **radius** (from sharp to fully rounded), **type scale** (a ratio-based ladder from caption to display), and **spacing** (a fixed step scale, not freeform pixel entry). Every section in every theme reads from these tokens rather than hard-coding its own values, so a brand refresh is a five-field edit, not a section-by-section rebuild.

**Worked example**: a merchant rebranding from a teal to a maroon accent for Pohela Boishakh changes one colour token. That single change updates the "Add to cart" button, the sale badge, the active nav underline, and the checkout progress bar simultaneously — four surfaces, one edit, zero risk of missing one of them and shipping a mismatched button colour on launch day.

Token changes are draft-scoped like everything else: a merchant can preview a full rebrand before publishing it, compare it against the live version, and discard it without consequence if it doesn't work.

---

## 7. Bangla + English from one catalogue

*Lever: reduced translation friction — a single content source per SKU removes the maintenance tax that causes bilingual catalogues to drift out of sync.*

Every product, section, and piece of storefront copy in Framique has one Bangla field and one English field living on the same record — not two parallel catalogues that must be kept in sync by hand. A shopper's browser or a manual language switch decides which one renders; the merchant edits both from the same product screen.

This matters commercially, not just operationally: a large share of Bangladeshi online shoppers convert better against Bangla product names, sizes, and care instructions even when they can read English, because purchase-stage cognitive load (understanding return policy, sizing, COD terms) is lower in the first language. A storefront that only offers English at checkout — even if the browsing experience is bilingual — reintroduces exactly the friction the bilingual catalogue was meant to remove.

**Bangla typography specifics carried into the builder**: any token applied to a `lang="bn"` subtree drops `letter-spacing` to 0 (Bengali conjuncts and matras clip under Latin negative tracking), and Bangla display text keeps a minimum 1.35 line-height box. These are enforced by the renderer, not left to merchant discipline — a merchant cannot accidentally ship clipped Bangla headlines by applying a Latin-tuned token.

---

## 8. Custom fonts — licence attestation and font-weight budget

*Lever: friction-as-feature — a licence checkbox and a weight ceiling are small frictions that prevent expensive downstream problems (a takedown notice, a slow storefront) that the merchant would otherwise only discover after the fact.*

Uploading a custom font requires an explicit licence attestation: the merchant confirms they hold a web-embedding licence for the exact weights being uploaded, and that confirmation is logged with a timestamp against the account. Framique does not verify licence terms with the foundry — this is a legal attestation step, not a rights-management product — but making it explicit and unavoidable is a deliberate design decision that reduces the number of merchants who discover, months later, an unlicensed font on their live storefront.

The **font-weight budget** exists for a performance reason: each additional weight of a custom font is a separate network request and a separate render-blocking asset on first paint. The builder enforces a soft ceiling — **two weights per custom font family** (typically one regular, one bold/medium) — and flags a warning if a merchant tries to load more. A five-weight display font "just in case a section needs it" is a common cause of a slow LCP that has nothing to do with product images.

**Worked example**: a merchant uploads a five-weight custom Bangla-Latin pairing for their brand headline. The builder warns that only two weights are budgeted; the merchant keeps Regular and SemiBold and defers Light, Medium, and Black. Measured effect: roughly 90–140 KB of font payload removed from the critical rendering path, which on a typical 4G Bangladeshi connection is on the order of several hundred milliseconds off first paint — often the difference between meeting and missing the 2.0s LCP target described below.

---

## 9. Custom code — sandboxing and secret scanning

*Lever: contained blast radius — advanced customisation is offered without letting a single mistake take down checkout.*

The custom code section accepts HTML, CSS, and script snippets — a live chat widget, a tracking pixel, a small interactive embed — and renders them inside an isolated iframe with no access to the parent page's DOM, cookies, or checkout state. If the embedded script throws an error or hangs, the failure is contained to that one section; the rest of the storefront, including checkout, keeps functioning.

Before any custom code snippet is saved, it passes through **secret scanning**: a pattern check for API keys, access tokens, and credential-shaped strings that a merchant might have pasted in by accident while copying a snippet from a vendor's dashboard (a startlingly common way secrets end up exposed on public storefronts). A match blocks the save and shows the merchant exactly which line triggered it, so the credential can be removed before it is ever published to a public HTML source.

**Design note**: the custom code editor uses a monospace `surface-2` panel with syntax highlighting; a blocked-save state shows a scarlet inline banner (the one permitted departure from the ink/ink-muted binary, reserved for destructive or blocking states) rather than a modal, so the merchant can fix the line without losing scroll position.

---

## 10. Performance budgets — why LCP matters for BDT conversion

*Lever: made-concrete abstraction — "fast" is meaningless to a merchant; a stated cost-per-second worked example is not.*

Largest Contentful Paint (LCP) — the time until the biggest visible element (almost always the hero image or hero text block) finishes rendering — is the performance metric most correlated with whether a Bangladeshi mobile shopper stays on a product page long enough to scroll to "Add to cart." The reason is infrastructural, not aesthetic: a large share of retail traffic in Bangladesh arrives over 3G/4G mobile data with variable latency, and every additional second of blank-screen wait before the page becomes useful is a second in which the shopper's attention — and their mobile data budget — is being spent on nothing.

**Framique's stated budgets** for any published storefront:

- Hero LCP asset ≤ 90 KB
- Any other image ≤ 140 KB
- LCP target ≤ 2.0 seconds on a simulated mid-tier Android / 4G profile
- Motion restricted to transform/opacity only (no layout-triggering animation)
- Full `prefers-reduced-motion` fallback on every animated element

**Worked example** (assumptions stated explicitly, not measured claims): assume a product page receives 10,000 mobile sessions in a month, and assume — as a commonly cited mobile-commerce rule of thumb — that conversion rate drops by roughly 7 percent for every additional second of load time beyond a 2–3 second threshold. If a merchant's hero image is unbudgeted at 900 KB instead of the 90 KB ceiling and that adds roughly 2.5 seconds to LCP on a typical 4G connection, and if the page was converting at 2.0 percent (200 orders) at the faster load time, a 2.5-second LCP regression at the stated 7 percent/second rate implies conversion could fall to roughly 1.65 percent (165 orders) — a difference of 35 orders that month. At an assumed average order value of 1,200 BDT, that is approximately 42,000 BDT of assumed monthly revenue attributable to one unbudgeted hero image. These figures are a worked illustration built on stated assumptions, not a measured result for any specific store — the arithmetic is the point, not the exact numbers.

The builder enforces the budgets at publish time: an oversized hero image is flagged with its actual file size and the ceiling it exceeds, and the merchant is offered an automatic compressed version before the version can go live.

---

## 11. Anatomy of a high-converting Bangladeshi product page

*Lever: checklist completeness — a merchant who can tick fifteen concrete items has done more real conversion work than one who "made the page look nice."*

A checklist for the product page a merchant is about to publish, in the order a shopper actually reads it:

1. **Product title in Bangla, with the English name in parentheses if it aids search** — many shoppers search by transliterated Bangla terms.
2. **Price shown in BDT with the Taka symbol, never a bare number** — ambiguity about currency erodes trust instantly.
3. **At least one image showing scale or the product in a hand/on a body** — flat product-only shots undersell size and fit.
4. **Discount badge only if the original price is genuinely shown struck through nearby** — an unsupported badge reads as manipulative.
5. **Stock status stated plainly** ("In stock", "Only 4 left", "Restocking [date]") rather than omitted.
6. **Delivery estimate by area** (inside Dhaka vs. outside Dhaka) — the single most-asked pre-purchase question in Bangladeshi ecommerce.
7. **COD availability stated explicitly**, since a meaningful share of shoppers will not complete checkout without confirming COD is offered.
8. **bKash/Nagad/Rocket/Upay logos shown near the price**, not buried at checkout, as a trust signal before commitment.
9. **Return/exchange policy in one sentence, in Bangla**, linked to the full policy rather than omitted.
10. **Size or variant guidance specific to the product category** (a size chart, a compatibility note) rather than a generic disclaimer.
11. **At least one section addressing a common pre-purchase doubt** (durability, authenticity, warranty) — an FAQ block or a short paragraph, not left unaddressed.
12. **A visible, sticky "Add to cart" / "Order now" action** that survives scroll on mobile.
13. **Related or complementary products below the fold**, not above it — cross-sell should not compete with the primary decision.
14. **Contact channel visible** (WhatsApp, phone, Messenger) for a shopper who wants to ask before buying — a common Bangladeshi purchase pattern for higher-value items.
15. **Page weight within budget** (see Section 10) — none of the above matters if the page has not finished loading.

**Design note**: this checklist ships inside the builder as an inline product-page audit panel, each item a togglable row with a pass/fail state computed from the actual section configuration where automatable (price format, COD badge presence, image count) and manually confirmed where not (policy clarity, doubt-addressing copy).

---

## 12. Your first hour in the builder — step by step

*Lever: implementation intention — a concrete first-session script converts intent to action far more reliably than a features list.*

1. **Minute 0–5 — Pick a theme.** Use the decision table in Section 5. If genuinely unsure and your catalogue will likely grow, start with Classic.
2. **Minute 5–15 — Set your four core tokens.** Primary colour, accent colour, corner radius, and base font. Everything downstream inherits these; do this before touching any section.
3. **Minute 15–20 — Edit the hero section.** Replace the placeholder headline and image with your own; enter both the Bangla and English fields, not just one.
4. **Minute 20–30 — Add your first product grid section and connect it to your catalogue.** Confirm price displays in BDT and that stock status is visible.
5. **Minute 30–35 — Add a delivery/COD/payment trust section** directly below the hero or product grid — see checklist items 6–8 above.
6. **Minute 35–45 — Preview on the shareable link on your own phone**, on mobile data if possible, not just on the office Wi-Fi.
7. **Minute 45–50 — Check the performance panel** and address any flagged oversized image before publishing.
8. **Minute 50–55 — Publish as version 1**, or schedule it for a specific launch time.
9. **Minute 55–60 — Bookmark the version history panel.** You now know how to roll back if anything about the next change goes wrong — which is the point of the whole model.

---

## 13. Comparison vs generic page builders

*Lever: contrast framing — naming the exact mechanism competitors lack is more persuasive than a generic superiority claim.*

| Capability | Generic page builder | Framique builder |
|---|---|---|
| Preview fidelity | Simplified preview renderer, can diverge from production | Same renderer for editor and live store |
| Bangla support | Often a bolted-on translation plugin | One catalogue, native Bangla + English fields, script-aware typography |
| Payment context | Generic card/PayPal assumptions | bKash/Nagad/Rocket/Upay/card/COD built into theme sections |
| Versioning | Usually undo history within a session only | Numbered, immutable, author-stamped versions with one-click rollback |
| Scheduled publish | Rare or third-party plugin | Native, queue a draft for a future timestamp |
| Font governance | Unlimited weights, no licence step | Licence attestation + two-weight budget enforced at upload |
| Custom code safety | Inline script, can break the whole page | Sandboxed iframe, isolated failure |
| Secret exposure risk | Unchecked | Secret scanning blocks save on credential-shaped strings |
| Performance enforcement | Advisory at best | Hard budgets enforced at publish time, with auto-compression offered |
| Themes offered | Often hundreds of undifferentiated templates | Five official themes, each purpose-built for a distinct merchandising situation |

The last row is a deliberate design choice, not a limitation: a marketplace of hundreds of templates optimises for browsing variety, not for merchandising fit, and it pushes the theme-choice decision onto a merchant who has no framework for making it. Five themes, each mapped to a specific business situation in Section 5's decision table, is a smaller but more honest promise.

---

## 14. Accessibility

The builder itself and every published storefront share the same accessibility baseline. Colour contrast: body text at `{colors.ink-muted}` on `{colors.canvas}` clears 7:1; any gradient spotlight card carrying text uses white ink at a minimum 4.5:1 against its darkest gradient stop. Focus states use the signal-blue ring (`{elevation.3}`) on every interactive element, including inside the token panel and section rail, never relying on colour alone — a focused button also gets a visible outline shift. Motion is transform/opacity only and fully collapses under `prefers-reduced-motion`, including the aurora drift and the magnetic hover on primary CTAs. Drag-and-drop section reordering has a keyboard-operable equivalent (move-up/move-down buttons revealed on focus), so a merchant using a screen reader or keyboard-only navigation is not locked out of the core editing action. Bangla text accessibility is structural rather than an afterthought: minimum 1.35 line-height on Bangla display type prevents matra clipping that would otherwise make headlines unreadable for low-vision users, and `lang="bn"` is set at the subtree level so screen readers switch pronunciation correctly mid-page for bilingual storefronts.

---

## 15. FAQ

1. **Do I need a developer to use the builder?** No. All fifteen checklist items in Section 11 and every theme in Section 5 are configurable through the section and token panels alone. Custom code and custom fonts are optional, developer-adjacent features for merchants who want them, not requirements.
2. **Can I switch themes after I've already built sections?** Yes, but section content does not automatically remap to a different theme's layout assumptions — expect to re-check each section after a theme switch, which is why the decision table in Section 5 is worth reading before starting.
3. **What exactly gets saved in a draft versus a published version?** Every edit autosaves to a draft immediately. Nothing in the draft is visible to shoppers until you explicitly publish or it reaches a scheduled publish time; publishing turns the current draft into a new, numbered, immutable version.
4. **How far back can I roll back?** To any prior published version, not just the immediately preceding one — version history is not limited to a single undo step.
5. **Can I preview a draft before anyone else sees it?** Yes, via a shareable preview link that renders the draft outside the editor, revocable at any time and never indexed.
6. **What happens if my custom font upload doesn't include a licence I actually hold?** The builder does not verify licence terms with the foundry; the attestation is a legal confirmation logged against your account, and responsibility for accuracy sits with the merchant.
7. **Why does the builder limit me to two weights per custom font?** Each additional weight is a separate render-blocking network request; two weights (regular + bold/medium) cover the vast majority of storefront typography needs without meaningfully harming LCP — see the worked example in Section 8.
8. **What happens if my custom code snippet contains an API key by accident?** The save is blocked and the exact triggering line is shown before anything is published; nothing with a credential-shaped string reaches the live storefront through this path.
9. **Does the Bangla and English catalogue require maintaining two separate product lists?** No — one product record holds both language fields; there is no second catalogue to keep in sync.
10. **What happens if I publish an oversized hero image?** The builder flags it at publish time with its actual file size against the 90 KB budget and offers an automatically compressed version before you can proceed, per Section 10.

---

## 16. Final CTA — gradient spotlight

**H2**: Build the first section in ten minutes.
**H2 বাংলা**: দশ মিনিটে প্রথম সেকশন তৈরি করুন।
**Primary CTA**: `Open a live demo` · **Alt CTA**: `Read the builder docs`

**Design note**: single `{components.gradient-spotlight-card}` (violet stop), the only gradient card on the page beyond the theme grid's static screenshots — respecting the one-or-two-gradients-per-long-page rule from DESIGN.md.

---

## Internal linking plan

- Hero primary CTA → `/demo` (live sandboxed builder instance)
- "See a store built with it" → `/showcase`
- Section 5 theme cards → `/themes/classic`, `/themes/modern`, `/themes/landing`, `/themes/supershop`, `/themes/b2b`
- Section 7 (Bangla catalogue) → `/localization`
- Section 10 (performance budgets) → `/performance` or the platform-wide `/why-fast` page
- Section 13 comparison table → `/vs/shopify`, `/vs/webflow` if those pages exist
- Final CTA alt → `/docs/builder`

## Image brief

- Hero: no photographic image — aurora gradient mesh only, per the scarce-atmosphere rule.
- Canvas mock (Section 2): a real screenshot of the three-pane builder UI (section rail, canvas, token panel) inside a glass browser frame — must be an actual product screenshot, not an illustration, to support the "same renderer" claim.
- Z-row proofs (Section 3): small inline UI captures per row (drag handle close-up, token panel close-up, version-history close-up, sandboxed-widget close-up).
- Theme grid (Section 5): one representative storefront screenshot per theme, consistent product category across all five for fair visual comparison (recommend: apparel item shown in Classic, Modern, Supershop, and B2B "wholesale apparel," Landing shown with a single hero SKU).
- Performance band (Section 10): a simple two-bar chart illustrating the worked LCP-vs-conversion example, labelled with the stated assumptions, not implied as measured data.

## Icon list

Section rail (layout-grid), token panel (sliders), version history (clock-rewind), rollback (undo-arrow), scheduled publish (calendar-clock), sandboxed code (shield-code), secret scanning (key-slash), font upload (type), performance budget (gauge), Bangla toggle (globe-language), COD badge (banknote), bKash/Nagad/Rocket/Upay (payment provider marks, licensed), checklist (check-square), accessibility (universal-access).

## Motion spec

Aurora mesh behind the hero: 24–38s drift loop, opacity/transform only. Z-rows reveal-on-enter once (translateY 12px → 0, opacity 0 → 1, 320–420ms, `cubic-bezier(0.22, 1, 0.36, 1)`), never re-triggering on re-scroll. Theme cards: no motion beyond a static hover lift (transform translateY(-2px), 200ms) — theme selection is a considered decision, not an impulse interaction, so no magnetic or bouncy affordances here. Version-history timeline entries fade/slide in on panel open, staggered 40ms apart, capped at 6 visible before a "load more." All motion collapses to instant state changes under `prefers-reduced-motion`.

## Accessibility + Bangla notes

All body copy pairs in this deck are provided in both English and Bangla for headline-level and CTA-level strings; full-paragraph Bangla localisation of the theme-guidance and performance-example prose is a documentation-team task outside this copy deck's scope, but the structural typography rules (0 letter-spacing, 1.35 minimum line-height, `lang="bn"` subtree scoping) apply to any Bangla rendering of this content without exception. Contrast, focus-ring, and reduced-motion requirements are stated per-band above where they diverge from the DESIGN.md defaults; where not restated, the DESIGN.md accessibility floors apply directly.

## Measurement plan

- **Hero → demo conversion rate**: click-through from `Open a live demo` primary CTA, segmented by theme eventually selected in the demo session.
- **Theme selection distribution**: which of the five themes first-time builder sessions choose, cross-referenced against catalogue size self-reported in onboarding, to validate the decision-table guidance in Section 5 against actual behaviour.
- **Time-to-first-publish**: elapsed time from first builder session start to first published version, benchmarked against the ten-minute claim in the final CTA and the sixty-minute walkthrough in Section 12.
- **Rollback usage rate**: percentage of published versions that are rolled back within 24 hours, as a proxy for whether the versioning safety net is functioning as intended (a very low rate could mean it is unused; a spike could flag a builder bug).
- **Performance-budget flag rate**: percentage of publish attempts that trigger an oversized-image or font-weight-budget warning, tracked over time to see whether the enforcement is educating merchants (falling rate) or being routinely ignored (flat/rising rate).
- **FAQ scroll depth and dwell**: which of the 10 FAQ entries get expanded most, to prioritise which topics need deeper documentation or an in-product tooltip.
