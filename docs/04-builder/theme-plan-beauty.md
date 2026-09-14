# Theme Plan D — "Rupaboti" (cosmetics / makeup / skincare) · রূপবতী

Status: Planning · Target: `theme-presets.ts` preset + builder capability upgrade
Depends on: AST v3 nesting, container + style panel, data-bound widget contract — `docs/04-builder/theme-plan-marketplace.md` §3 · bilingual text layer — `docs/04-builder/theme-plan-electronics.md` §1 & §4
Companions: `theme-plan-marketplace.md` · `theme-plan-apparel.md` · `theme-plan-electronics.md`

---

## 0. Position

Rupaboti sells **suitability and trust**: does this shade match me, is it right for my skin type, is it authentic, is it safe. Circuit proves it with specs; Rupaboti proves it with shades, ingredients, routines and real faces. Same brick set, warmer building.

Reuses: all layout widgets, `product_grid`, `product_rail`, `facet_sidebar`, `cart_lines`, `cart_summary`, chrome + checkout, plus Atelier's `ugc_gallery`, `quick_view`, `cart_drawer`, `editorial_hero` and Circuit's `authenticity_badge`, `data_table`, bilingual text layer.

---

## 1. Bilingual design core (EN + বাংলা)

Inherits **all** of `theme-plan-electronics.md` §1 verbatim (one AST + `{en,bn}` props, Noto Sans Bengali variable, `--fq-bn-scale`, elastic widths, tabular ৳ integers, no all-caps Bangla, `dir="ltr"` islands for Latin terms). Additions specific to beauty:

| Rule | Implementation |
| --- | --- |
| Beauty vocabulary is bilingual-by-default | Skin type (শুষ্ক / তৈলাক্ত / মিশ্র / সংবেদনশীল), concern (ব্রণ, দাগ, বয়সের ছাপ), undertone (উষ্ণ / নিরপেক্ষ / শীতল) ship as **taxonomy terms with both labels**, not as free text — filters, quizzes and PDP chips all read the same term. |
| Ingredient names stay Latin, glossed in Bangla | `Niacinamide` + a Bangla gloss line beneath; INCI list always Latin, `dir="ltr"`. |
| Shade names are never translated | Shade name is a proper noun; the *descriptor* ("cool pink / শীতল গোলাপি") is localised. |
| Longer chips | Bangla concern chips run long — chips wrap to 2 lines, filter drawer scrolls, never truncates a term mid-conjunct. |
| Warm-tone contrast guard | Blush/nude tokens fail contrast easily. Text never sits on a pastel below 4.5:1; pastels are surfaces, ink is text. |
| Regulatory copy | Ingredient, expiry, batch and patch-test warnings are readable paragraphs in the chosen locale, never icon-only. |

---

## 2. Core design principles (opinionated)

| Principle | Rule |
| --- | --- |
| Skin-true colour | Product and shade imagery is colour-managed; swatches are real colour values from the variant record, shown on 3 skin-tone backdrops. Never a decorative approximation. |
| Soft, clean surfaces | Ivory canvas `#FFFBF8`, ink `#241E1C`, muted `#7A6E68`, one pigment (rose-clay) as accent, mint for "in stock / authentic", amber for "low stock / expiring", red only for real discount. No neon pink. |
| Rounded and generous | Radius 16/24px, pill buttons, soft one-level shadow, 80/112px section rhythm. |
| Routine over catalogue | The homepage sells a routine (AM/PM steps), not a grid. Steps link to filtered collections. |
| Guided selling | Shade finder and skin-type quiz are first-class widgets; results become a saved filter, not a dead end. |
| Proof before price | Authenticity, expiry/batch, dermatologist-tested claim and real UGC sit above the fold on PDP. |
| Motion is gentle | 180–300ms, `--fq-ease-soft`; swatch tap 180ms, routine step reveal 300ms, drawer slide. Transform/opacity only; reduced-motion → static. |
| Accessibility | Swatches are labelled radios (colour + name), never colour-only. Quiz is keyboard-complete. 44px targets. Scrim token under any text-on-image. |
| Performance | Swatch sprites, lazy UGC, hero ≤ 250KB AVIF, LCP < 2.5s, CSS ≤ 60KB gz, JS ≤ 100KB gz. |

Token additions: `--fq-pigment`, `--fq-ivory`, `--fq-ink-muted`, `--fq-ease-soft`, `--fq-swatch-ring`, `--fq-skin-tone-1..3`, `--fq-scrim`, `--fq-radius-soft`.

---

## 3. Additional widgets

`[N]` new · `[U]` upgrade.

| Widget | Type key | Notes |
| --- | --- | --- |
| Shade swatches **[U]** | `variant_picker` | `shade` mode: real hex/gradient chips, shade name + descriptor, sold-out state, "swatch on skin" preview. |
| Shade finder **[N]** | `shade_finder` | Undertone + depth questions → recommended shades (server-resolved to real variants). |
| Skin quiz **[N]** | `skin_quiz` | 4–6 steps (type, concerns, sensitivity, budget) → saved filter + product set. |
| Routine builder **[N]** | `routine_builder` | AM/PM numbered steps, add-all-to-cart, per-step swap. |
| Ingredient list **[N]** | `ingredient_list` | Key actives with % and Bangla gloss; full INCI in a disclosure. |
| Ingredient glossary **[N]** | `ingredient_glossary` | Term → plain-language explanation, linkable from PDP. |
| Free-from / claims **[N]** | `claim_chips` | Paraben-free, halal, cruelty-free, non-comedogenic — each with a source tooltip. |
| Skin-concern rail **[U]** | `product_rail` | `concern` variant with taxonomy chips as the rail header. |
| Before / after **[N]** | `before_after` | Slider or paired images with a mandatory disclaimer line. |
| Patch-test note **[N]** | `safety_note` | Warning paragraph + how-to-patch-test disclosure. |
| Expiry & batch **[N]** | `batch_info` | Mfg/expiry, batch code, "best used within N months of opening" (PAO). |
| Texture / finish **[N]** | `texture_strip` | Macro texture images + finish labels (matte, dewy, satin). |
| How to use **[N]** | `how_to_use` | Numbered steps with icons/short clip poster. |
| Refill / subscribe **[N]** | `refill_widget` | Refill SKU link + reorder cadence (server-priced). |
| Gift set builder **[N]** | `gift_builder` | Pick N items, gift box, message card, combined server total. |
| Sample / travel size **[N]** | `sample_picker` | Add a sample at checkout threshold. |
| Tone-inclusive gallery **[U]** | `ugc_gallery` | Filter UGC by skin tone/type. |
| Consultation CTA **[N]** | `consult_cta` | WhatsApp / call booking, consent chip **never pre-checked**. |
| Bestseller ranking **[N]** | `rank_list` | "Top 10 in সিরাম" numbered list with rank badges. |
| Loyalty / points **[N]** | `loyalty_strip` | Points earned on this order (server-valued). |

Rupaboti-specific: **20 widgets** (17 new, 3 upgrades).

---

## 4. Page-builder changes specific to this theme

Everything in `theme-plan-marketplace.md` §3 and `theme-plan-electronics.md` §4 applies. Additional:

1. **Swatch data binding** — variants gain `swatch: { hex | gradient | image }`; the builder never asks the merchant to hand-type colours per section.
2. **Taxonomy-aware props** — widgets can bind to a taxonomy (skin type, concern, undertone) and render its bilingual labels automatically.
3. **Quiz/flow primitive** — one shared multi-step form engine (state, validation, progress, result mapping) consumed by `shade_finder`, `skin_quiz` and `trade_in` (Circuit). Result = a saved filter URL, so it is shareable and SSR-able.
4. **Disclosure primitive** — accordion/tooltip used by ingredients, claims and safety notes, with an a11y-correct pattern implemented once.
5. **Media pair widget support** — `before_after` needs a paired-media prop type with a required disclaimer field (lint fails if empty).
6. **Consent-aware widgets** — any widget capturing contact (`consult_cta`, `back_in_stock`, newsletter) inherits an unchecked-by-default consent chip and honours opt-out (AGENTS.md §2).
7. **Bundle/total contract** — `gift_builder`, `routine_builder`, `refill_widget` post item sets to the server and render the returned total; client math is lint-forbidden.

---

## 5. "Rupaboti" theme composition

**Tokens** — ivory `#FFFBF8`, ink `#241E1C`, pigment rose-clay, mint success, amber warn, radius 16/24, section spacing 96px, font pair grotesk + Noto Sans Bengali (display weight 700+ once per page).

**index**
```
header: announcement_bar(authentic products / ফ্রি ডেলিভারি) · [logo | mega_menu(category × concern) | search | account · wishlist · cart_drawer]
main:   editorial_hero("আপনার ত্বকের জন্য / Made for your skin")
        skin_quiz(entry card)
        category_tiles(Makeup · Skincare · Hair · Fragrance · Tools)
        routine_builder(AM/PM showcase)
        product_rail("বেস্টসেলার", rank badges)
        concern rails ×3 (ব্রণ / দাগ / শুষ্কতা)
        claim_chips strip
        before_after(featured)
        ugc_gallery(tone filter)
        ingredient_glossary(teaser)
        newsletter(consent chip)
footer: footer_sitemap · payment_icons · trust_bar(authenticity, returns) · locale
```

**collection** — `category_header` · `facet_sidebar` (concern, skin type, shade family, finish, brand, price; drawer on mobile) · `result_toolbar` · `product_grid(cols=[2,3,4], swatch row on card, quick_view, wishlist)` · `shade_finder` injected after row 2 for shade categories · `pagination(load-more)`.

**product**
```
container(cols=[6,6])
  ├ product_media(gallery + texture_strip + swatch-on-skin)
  └ container(sticky)
      heading · authenticity_badge · rating_summary(compact)
      price_block · claim_chips
      variant_picker(shade) · shade_finder(trigger) · size/ml selector
      add_to_cart · wishlist · refill_widget
      batch_info · stock_delivery
      safety_note
ingredient_list (+ glossary links)
how_to_use
routine_builder("Pairs with")
before_after
review_list(skin-type filter) · product_qna
ugc_gallery(product-scoped, tone filter)
product_rail("একই সমস্যার জন্য / For the same concern")
```

**cart** — `cart_drawer` primary; `/cart` mirrors with `cart_lines`, `cart_summary`, `sample_picker`, `gift_builder`, `loyalty_strip`, free-shipping progress.

**checkout** — shared set, token-restyled; COD + gift message step; consent chips unchecked.

**page / blog** — skincare guides: 68ch measure, `ingredient_glossary` inline, `routine_builder` embeds, `before_after` breakouts.

---

## 6. Build order

1. Consume shared AST v3 + container + style panel (Plan A) and the bilingual text layer (Plan C §4.1–4.2).
2. Swatch data model + `variant_picker` shade mode + swatch-on-skin preview.
3. Disclosure primitive → `ingredient_list`, `claim_chips`, `safety_note`, `batch_info`.
4. Quiz/flow primitive → `skin_quiz`, `shade_finder` (result = saved filter URL).
5. Server-total bundles → `routine_builder`, `gift_builder`, `refill_widget`, `sample_picker`.
6. Proof set: `before_after` (+ disclaimer lint), UGC tone filter, `rank_list`, review skin-type filter.
7. Consent-aware capture widgets: `consult_cta`, `back_in_stock`, newsletter.
8. Preset AST + tokens + demo import (36 SKUs with real shade data, 5 categories, 6 concerns, 2 routines, bilingual copy).

## 7. Acceptance

- Preset parses and lints clean across all 7 templates in **both** locales.
- No text on a pastel surface below 4.5:1; swatches always carry an accessible name.
- Quiz and shade finder are keyboard-complete, SSR-able, and produce a shareable filter URL.
- Every total (routine, gift set, refill, cart) comes from the server as integer ৳ with tabular numerals.
- `before_after` cannot publish without a disclaimer; consent chips are never pre-checked.
- Reduced-motion: static; no autoplay media anywhere.
- Lighthouse perf ≥ 90 mobile; CSS ≤ 60KB gz, JS ≤ 100KB gz, LCP < 2.5s.
- ≥ 70% registry shared with Bazaar/Atelier/Circuit — verified by the no-theme-exclusive-renderer test.
