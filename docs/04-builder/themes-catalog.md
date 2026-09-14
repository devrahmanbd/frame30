# 04-builder — Theme Catalog (themes-catalog.md)

Status: Planning · Slice: S1 (spec) · Gate: approved ("go for it")
Owners: builder/runtime · storefront · product design
References: `04-builder/README.md` (data model) · `theme-runtime.md` (TR-1…TR-12) ·
`theme-registry.md` (registry/state — frozen) · `00-meta/design-system.md` §2 (tokens), §3 (color),
§4 (type), §5 (motion), §7 (a11y), §8 (perf gates), §9 (anti-slop), §10 (per-page template) ·
`06-payments/currency.md` (BDT integer minor units) · `03-storefront/i18n.md` (copy lives in
`c/{theme_id}/{locale}.json`)

Implementation note: this doc is the visual/ux spec for the 11 official themes. The registry and
runtime own state and behavior (`theme-registry.md`, `theme-runtime.md`) — this doc adds no tables,
RPCs, or events. Each theme ships as a `framique/<key>` package with `is_builtin: true` (registry §7
seed pattern), containing only AST + tokens + assets. Merchants remap brand → semantic tokens via
the builder brand editor (design-system §3.3); contrast is re-verified at publish.

---

## 1. Shared foundation (applies to all 11)

### 1.1 Token role map — never reinvented

| semantic token | role | source primitive |
| --- | --- | --- |
| `--fq-accent` / `--fq-accent-fg` | brand identity, primary action | BD Teal `#0d9488`-family |
| `--fq-danger` | sale/urgency, offer alert | Rickshaw Red `#e11d48`-family |
| `--fq-warning` | COD-pending, low-stock, warn | Bondhu Amber `#f59e0b`-family |
| `--fq-success` | paid / delivered / settled | Mint `#10b981`-family |
| `--fq-bg-canvas` / `--fq-text-*` | neutral canvas/text | Slate 50–950 |

Dark mode: semantic swap to dark surfaces; BD Teal brightens to the 400-range accent
(design-system §3.1). Status is never communicated by color alone — icon + text always (design §7).
Contrast: text ≥ 4.5:1, large text ≥ 3:1, UI borders ≥ 3:1.

### 1.2 Shared storefront scaffold

Sticky header (mark + cart) → category rail (horizontally scrollable chips, mobile-first) → hero →
offerings grid (container queries) → CTA block → checkout slot → footer equity strip. Sticky
mobile cart bar (design §6). One primary CTA per viewport; primary actions within thumb reach on
mobile; touch targets ≥ 44×44.

### 1.3 Shared money & typography rules

- BDT only: `amount_minor_int` integer minor units, `৳` prefix, **0 decimals** on product/cart
  lines; 2 decimals only on invoice/ledger lines (06-payments/currency.md). No floats anywhere.
- Totals, discounts, and promotion math are server-rendered and server-validated; a theme never
  computes money client-side (AGENTS.md §2 no-client-trusted rule).
- `font-variant-numeric: tabular-nums` on every price, quantity stepper, order number, countdown.
- Noto Sans Bengali variable 400–900; Latin fallback `system-ui`; `font-display: swap`; `lang="bn"`.
  Each theme sets Bangla display weight ≥ 700 on at least one heading surface (design §9.2); no
  all-caps Bengali (design §4).
- Motion from tokens only: fast 120ms / base 200ms / slow 300ms, `--fq-ease-out`;
  `prefers-reduced-motion` → opacity-only (design §5).
- Gates: CSS ≤ 60KB gz per theme, JS ≤ 100KB gz, hero ≤ 250KB (WebP/AVIF), LCP < 2.5s (design §8).

### 1.4 Catalog index

| # | theme_key | family | light canvas | signature element | hero CTA → action CTA |
| --- | --- | --- | --- | --- | --- |
| 1 | `framique/airviva` | Classic | slate-50 | jamdani dori/weave motif | "আপনার সাজে ঐতিহ্য" → "সংগ্রহ দেখুন" |
| 2 | `framique/sona` | Classic | warm white | gold laurel arch frame | "বিয়ের কালেকশন প্রস্তুত" → "কালেকশন দেখুন" |
| 3 | `framique/mithai` | Classic | milk white | tray-handle motif | "আজকের মিষ্টি দেখুন" |
| 4 | `framique/pathshala` | Classic | paper warm-white | bookmark thread + chapter markers | "পাঠশালা শুরু করুন" → "কিনুন" |
| 5 | `framique/impulse` | Modern | off-white | editorial cutout strip | "এক্সক্লুসিভ ড্রপ" → "সংগ্রহ দেখুন" |
| 6 | `framique/bazaar` | Modern | clean white | quantity stepper | "মোট ৳১২৩৪" → "চেকআউট" |
| 7 | `framique/circuit` | Modern | slate | PCB trace motif | "আগে কিনলে ছাড়" → "তুলনা করুন" |
| 8 | `framique/zoom` | Modern | bright neutral | magnifier-peek ring | "খেলনা নিন" ("ফ্রি ডেলিভারি") |
| 9 | `framique/krishok` | Sensory | slate-50 | freshness stamp + leaf-tip separators | "আজকের ফসল দেখুন" |
| 10 | `framique/probash` | Sensory | ivory | three-step care tray | "এক ট্যাচে কিনুন" |
| 11 | `framique/baking` | Sensory | cream | baking-bag squiggle + toasted stamp | "ফ্রেশ অর্ডার করুন" |

Every purchase CTA on a product card is "কার্টে যোগ করুন" unless a theme specifies a
whole-total CTA (bazaar §6.2 only).

---

## 2. Classic cluster — editorial, heritage, festivity

Four themes where the shop reads as love of craft: slow, airy, typography-forward; story first,
conversion second. Signature = the weave/arch/frame the layout hangs on.

### Design guidelines — theme `airviva` · ঐতিহ্য (heritage wear)

- **Intent:** the storefront feels like a warm heritage outlet — jamdani, thread, slow elegance;
  the product photo is the hero, not the chrome.
- **Key surfaces:** hero (jamdani macro), category rail (টিস, থ্রি-পিস, শাড়ি, পাঞ্জাবি), craft
  strip, offerings grid (2/3-col), product detail + size modal, cart, sticky mobile bar.
- **Palette emphasis:** teal-700 `--fq-accent` on slate-50 canvas (light); dark slate-900 canvas
  with teal-200 accent (thread glint); one-level card shadows; Rickshaw Red only for the sale tag.
- **Typography:** display 700–900 Bangla headlines; body 400; tabular-nums on money and badges.
- **Density:** airy editorial; generous 32/48px sections; mobile hero collapses to a one-column
  statement with the same CTA below.
- **Motion signature:** fade + 8px rise 250ms on hero; add-to-cart thread "weave" 180ms; hover
  lift translateY(-2px) + shadow-1→2; reduced-motion → opacity only.
- **A11y:** decorative motif `aria-hidden`; scrim under hero text keeps contrast ≥ 4.5:1; size
  select is a real radio group with visible focus ring.
- **Performance:** hero macro ≤ 250KB AVIF; craft strip lazy; preload Bangla subset (400 + chosen
  weight); LCP target < 2.5s.
- **Anti-slop:** jamdani close-up hero + dori/seam divider; "এখানে যা সংগৃহীত" headers instead of
  "Featured"; CTA ducks from "আপনার সাজে ঐতিহ্য" (curiosity) to "সংগ্রহ দেখুন" (action).

### Design guidelines — theme `sona` · সোনা (jewelry)

- **Intent:** jewelry that glamours without shouting — depth, gleam, trust for wedding-season
  purchases (বিয়ের আরজি flows mentioned in §3.4 builder flows only).
- **Key surfaces:** hero (macro on deep slate), "বিয়ের কালেকশন" rail, product grid with price
  chips, offer highlight, wishlist, variant (mesh/weight) radio, cart.
- **Palette emphasis:** amber-tinted `--fq-accent` on slate-900 (interior light), warm-white on
  light; gleam via gradated amber 300→600 tokens — never raw yellow; red for offer/alert,
  amber for "শুধু ২টি বাকি" with icon+label; mint for "স্টকে আছে".
- **Typography:** display 700 (not thin) Bangla; price row tabular + amber-on-slate contrast.
- **Density:** airy hero; dense product rows with 44px variant thumbnails.
- **Motion:** 120-160ms taps; wishlist heart pop 160ms; gift-box-open 200ms; hover lift;
  reduced-motion → opacity.
- **A11y:** `aria-live` on wishlist count; amber on slate ≥ 4.5:1; variant radios labelled visibly.
- **Performance:** hero ≤ 250KB WebP; gemmap tiles `loading=lazy` + `srcset`; close-ups ≤ 100KB.
- **Anti-slop:** gold is achieved with token accents, never raw hex; laurel arch frame signature;
  price always integer ৳ (e.g. ৳২৪,৫০০ — tabular).

### Design guidelines — theme `mithai` · মিষ্টি (sweets)

- **Intent:** sweetness in one glance — warm, fresh, safe to browse in a phone hand.
- **Key surfaces:** hero (fresh-cell close-up), "আজকের মিষ্টি" rail, categories (দই, জিলাপি,
  রসগোল্লা, হালুয়া), card with weight + price, COD chip, freshness chip, weight selector.
- **Palette emphasis:** milk-white surfaces; amber as both "freshness glow" and warning — never
  two ambers on one screen; mint for "ফ্রেশ"; success/paid states stay mint.
- **Typography:** display 700; price 700 tabular; badge counts tabular; no flavor emoji.
- **Density:** single-feature airy; 2-col cards; mobile 1-col stack with thumb-friendly add.
- **Motion:** 200ms bubble rise on enter; badge pulse 160ms once; add pop scale 1.06→1;
  reduced-motion → opacity.
- **A11y:** freshness is text ("ফ্রেশ ৬ ঘণ্টা"), not color alone; COD note as readable paragraph.
- **Performance:** hero ≤ 250KB; sugar glints as AVIF at 2 sizes; CLS-reserved card aspect.
- **Anti-slop:** tray-handle motif + Bengali drops per card; no generic cake art; integer ৳.

### Design guidelines — theme `pathshala` · পাঠশালা (books)

- **Intent:** a bookstore that reads like a reading corner — paper, quiet, generous for long
  titles; browsing is the joy, not just the check-out.
- **Key surfaces:** book-spine cascade hero, "নতুন" vs "জনপ্রিয়" tabs, book grid
  (cover+price+author), book detail with size selector, FAQ, "আজকের সেরা" badge, cart.
- **Palette emphasis:** paper warm-white canvas; ink-900 text; teal accent only on CTAs and date
  stamps; dark mode → parchment dark with amber moonlight accent. No greys-blue magazine grids.
- **Typography:** serif-leaning display, Noto Sans Bengali body; long titles wrap safely (never
  break conjuncts); italic used as accent, never sole channel.
- **Density:** airy; list rows 56px; book cards with fixed aspect (CLS-safe).
- **Motion:** page-fold 200ms on hover; shelf-slide 300ms stagger on load; bookmarks slide
  accordion 200ms; reduced-motion → opacity only.
- **A11y:** italic + weight/underline always paired; book cards focusable with visible ring;
  `aria-label` handles mixed scripts.
- **Performance:** serif+sans subsets (400,700 + chosen); covers ≤ 90KB each; lazy.
- **Anti-slop:** bookmark-thread motif, chapter markers on chapter stubs, reading-quote footer
  strip, "১৫% ছাড়ে বই" integer ৳ in amber chip.

---

## 3. Modern cluster — conversion-first

Clean, fast, big numbers; the shelf beats the story.

### Design guidelines — theme `impulse` · ইমপালস (street fashion)

- **Intent:** fast, funky, drop-culture energy; the fresh product clip is the hero.
- **Key surfaces:** hero cut-strip auto-rotator (pause on hover), "আজকের ড্রপ" rail, lookbook
  loop, product grid + price, size chips, stock amber tag, quick add.
- **Palette emphasis:** off-white canvas, teal `--fq-accent`, red only for % off, amber for stock;
  2px hard black borders as the frame line.
- **Typography:** dense 800 display; price big tabular; oversized numerals poke through cards.
- **Density:** 3-col grid (2-col mobile); info-dense but clean.
- **Motion:** 240ms card fade swap; deal countdown visible; hover zoom 1.03 over 300ms;
  reduced-motion → static.
- **A11y:** countdown is text + label, not color; grid keyboard order; focus ring.
- **Performance:** cut-strip ≤ 250KB total; grid via lazy; no autoplay (pausable carousel).
- **Anti-slop:** "হাম-অফ দি ড্রপ" stamp; Bangla street labels; pauseable, never autoplay.

### Design guidelines — theme `bazaar` · সুপারশপ (grocery/high-lo)

- **Intent:** the neighborhood bazaar — bright frugality, quantity first, list-flow shopping.
- **Key surfaces:** promo strip (24h, server-fed), category rail, 1-2-3 step grid, quantity
  stepper (integer only), cart tab, COD chip, savings line.
- **Palette emphasis:** white canvas; green (teal) for buys and money positives; red only for
  savings/sale strips; amber for COD; not both green and red on one line.
- **Typography:** totals are huge display tabular ("মোট ৳১২৩৪"); stepper digits tabular.
- **Money CTA:** whole-total CTA reads the server total — "মোট ৳১২৩৪" → "চেকআউট"; count and
  total always server-fed (no client math).
- **Motion:** stepper press 180ms; trolley drop 240ms on add; header-cart bounce slow token on
  count change; reduced-motion → static.
- **A11y:** stepper real buttons with aria-live on total; savings shown as % AND absolute ৳;
  promo countdown visible.
- **Performance:** strip server-liter; images ≤ 80KB; total inline; LCP hazard eliminated.
- **Anti-slop:** no discount confetti; barcode-strip motif; "বাংলাদেশের বাজার" chip + মৌসুমি
  collection rail; weights in kg with 500g steps.

### Design guidelines — theme `circuit` · সার্কিট (electronics)

- **Intent:** precision, warranty, comparison — no hype.
- **Key surfaces:** spec table, compare grid, warranty tile, price-area sparkline,
  "১২ মাস ওয়ারেন্টি" chip, cart.
- **Palette emphasis:** slate surfaces, teal accents, hairline borders; red only during real
  sales; dark mode teal glow ≤ 5% — never neon.
- **Typography:** display 800 for listing names; spec values tabular; model numbers mono-tabular.
- **Motion:** state transitions 200ms static→state; compare "draw" 300ms on hover;
  reduced-motion → none.
- **A11y:** comparison tables real `<th scope>`; sparkline has text alternative (description);
  visible focus.
- **Performance:** compare loads ≤ 2 ranges; sparkline tiny SVG; background ≤ 12KB.
- **Anti-slop:** phase-ground divider + pin-header icons; no robot emojis; language stays Bangla.

### Design guidelines — theme `zoom` · খেলনা (toys)

- **Intent:** joyful, zoomed-out, per-screen focus; parent peace of mind at checkout.
- **Key surfaces:** toy-shelf rail, age filter chips, brand strip, gift-wrap toggle, free
  delivery bar, "ভিন্ন" bubble.
- **Palette emphasis:** bright neutral + teal; play comes from the toy imagery itself, not neon;
  red/amber as message-only (flames etc. token).
- **Typography:** rounded display 700; price tabular.
- **Density:** generous cards; chunky, playful.
- **Motion:** bounce-in 180ms; hover wiggle 200ms; star-pop on saved; badge waggle;
  reduced-motion → opacity.
- **A11y:** ≥44px targets; ratings shown as stars+number; age groups labelled chips.
- **Performance:** animated peeks sprite-small; hero ≤ 250KB AVIF.
- **Anti-slop:** magnifier-peek ring + child-height line; product photos real (no clip-art).

---

## 4. Sensory cluster — freshness, honest care

### Design guidelines — theme `krishok` · কৃষক (farm/fresh)

- **Intent:** fresh-from-farm honesty; "আজকের ফসল" is the anchor claim.
- **Key surfaces:** version stamp ("আজকের ফসল"), roughness tag, "বছরের মৌসুম" rail, weight
  stepper (integer, kg/500g), family bundles, farm strip, cart.
- **Palette emphasis:** slate-50 light, teal accent, tobacco leaf green in success chips only;
  amber for warn; earth-brown for raw texture accents; never synthetic pure-blue.
- **Typography:** display 700–800; weights+ prices tabular (৫০০ গ্রাম • ৳৪০).
- **Motion:** strip unpack 120/200ms; stamp drop 240ms; hover lift; badge pace 60ms pulse only.
- **A11y:** stamp is a text badge ≥4.5:1; freshness with icon+label; exact weight/unit spelled.
- **Performance:** farm hero ≤ 250KB AVIF; produce photos lazy.
- **Anti-slop:** leaf-tip separators + "হাট বাজার" footer marker — place, not default.

### Design guidelines — theme `probash` · কসমেটিক্স (beauty/home-care for probashi families)

- **Intent:** familiar homecare and beauty goods for Bangladeshi families abroad — soft, caring,
  trust-bridging; gifts and refills over buzz.
- **Key surfaces:** routine strip (step 1–2–3), small-haul sets, scent selector (swatch), skin-type
  quiz (শুষ্ক / তৈলাক্ত / মিশ্র), refill widget, gift-to-Bangladesh rail, consent chip.
- **Consent (GDPR):** WhatsApp/marketing opt-in chip is never pre-checked; opt-out honored
  everywhere (AGENTS.md §2).
- **Palette emphasis:** ivory-soft canvas; token teal accent; blush only as success tints (no
  neon pink); amber for warning; statuses icon+label.
- **Typography:** rounded display 700 (warm), prices/sizes tabular.
- **Motion:** swatch tap 180ms; routine progress 300ms slow; "arrives home" pin-drop 200ms;
  reduced-motion → static.
- **A11y:** swatches are radio-thumbnails with labels (never color-only); grouped labels; ≥44px.
- **Performance:** hero ≤ 250KB; routine strip light; LCP-safe.
- **Anti-slop:** the "open-me care-tray" three-step reveal is the exclusive signature; copy is
  real Bangla ("ভালো থাকুন, প্রতিটি পালায়") not machine-translated tropes.

### Design guidelines — theme `baking` · বেকারি (bakery & cake)

- **Intent:** the honest bakery — "baked 2h ago", crust tones, freshness as proof-of-love.
- **Key surfaces:** "আজকের ওভেন" hero (limited daily bake), 6-item shortlist, freshness countdown
  ("ফ্রেশ ৬ ঘণ্টা"), crumb strip, custom-cake form, pickup vs delivery rail.
- **Palette emphasis:** warm-back rounded; teal CTAs; crust amber ONLY as oven marks/ambience;
  paper-white cards; sepia text scales.
- **Typography:** display 800; countdown mono-tabular; prices tabular integer.
- **Density:** small-oven 2-col items; cards chunky.
- **Motion:** crumb drift on hover 200ms; oven-door open 320ms slow; countdown ticking 60ms
  tabular; reduced-motion → text-only countdown.
- **A11y:** countdown not color-only; "fresh" flag a real sentence; pickup slot radio group with
  visible selected state.
- **Performance:** hero ≤ 250KB; countdown is SSR text + one DOM update; no clock lib.
- **Anti-slop:** baking-bag squiggle motif + toasted stamps; "কালকের রুটি হল না" honesty banner
  — the distinctiveness IS the honesty.

---

## 5. Verification matrix (all 11 pass)

Every theme section above passes design-system §9:

1. No purple-blue AI-gradient hero — each hero is token-driven and brand-specific.
2. Bangla display weight ≥700 on at least one display surface; Noto Sans Bengali variable
   400–900; no all-caps Bengali.
3. Iconography is one outline set per family; no emoji illustrations in hero, badge, or CTA.
4. Empty states designed per theme (e.g. bazaar: "ঝুড়ি খালি" illustration + "ফিরে বাজারে
   যান" button).
5. `prefers-reduced-motion` → opacity-only everywhere.
6. Real content previews: actual Bengali phrases, ৳ integers, concrete sellers (যশোর জিলাপি,
   শাড়ি ও থ্রি-পিস) — no lorem.
7. Radius/spacing/elevation from tokens; no bare 0/clamp; storefront radius xl/2xl per design.
8. Both light and dark modes are designed per theme (§2.1-§3.1 tokens).
9. Mobile-first layouts described in each section, sticky bars and thumb rails per §1.2.
10. axe CI hook on catalog snapshots once test harness is built — deferred to contract
    (see `.e2e/` plan).

**Money gate:** all 11 themes render server-validated ৳ integers — `amount_minor_int`, 0
decimals product/cart, 2 decimals only invoice, tabular-nums; no floats, no client totals,
no USD anywhere.

**Font gate:** Noto Sans Bengali variable + `system-ui` Latin; `font-display: swap`; subset
weights referenced; display ≥700 once per theme.

**Budget gate:** CSS ≤ 60KB gz, JS ≤ 100KB gz, hero ≤ 250KB, LCP < 2.5s (§1.3/§8).

---

## 6. Open items (out of scope here)

- Per-theme Figma prep from this spec (maintainers, after S2 runtime).
- USD variant blocked on pilot gate (06-payments/currency.md, USD-pilot gate).
- Theme editor screens in builder S7 will read this catalog as source-of-intent.