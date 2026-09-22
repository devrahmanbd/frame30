# clothing-heritage nuclear rebuild — module contract

Each file owns ONE builder, no cross-imports between builders. Assembler
(`index.ts`, written by integrator, NOT the swarm) wires them.

## Files → exports

- `tokens.ts` → `export const HERITAGE_TOKEN_PARTIAL: Partial<ThemeTokens>`
  (brand #1A1A1A, accent #C45D3E, surface #FAF8F5, ink #2D2A26, radius 4px,
  container 1320px, density airy, typeScale expressive,
  fontPairing editorial-serif, fontDisplay "Playfair Display", fontBody Inter,
  shadow soft, motion subtle, dark {brand #FAF8F5, accent #D4784A,
  surface #1A1816, ink #F0EDE8}). Import type ThemeTokens from
  `../../builder-ast`. No logic.
- `header.ts` → `export function buildHeader(s: SectionBuilder): Section[]`
  Order: subbrand_bar (Aarong/Taaga/Taaga Man/Herstory/Aarong Earth + tagline
  "A Social Enterprise") → announcement_bar (m1-3 festive, dismissible true,
  rotateMs 5000) → utility_bar (note flagship hours, l1-3 Artisan
  stories/blog, Store locator/pages/stores, Track order/pages/track-order,
  showLanguage FALSE — StoreHeader owns the toggle) → mega_menu (label
  "Shop by Category", limit 8, columns 4).
- `footer.ts` → `export function buildFooter(s: SectionBuilder): Section[]`
  Order: support_strip (Customer Support & Concierge, 4 tiles) →
  footer_sitemap (Collections/Customer Care/Our Heritage/About Framique) →
  payment_icons (heading "Payment methods", marks COMMA-separated:
  "bKash, Nagad, Rocket, Visa, Mastercard, Cash on Delivery") →
  newsletter (festive drops) → rich_text colophon (flagship hours).
- `homepage.ts` → `export function buildHomepageMain(s: SectionBuilder): Section[]`
  15 sections, DOM order: hero_carousel (3 slides w/ caption+headline_bn,
  festive first) → trust_bar (i1-4 Icon/Title/Body) → department_grid
  (departments[8] image/name/name_bn/count/href) → product_rail ("New
  arrivals", collection new-in, limit 8, cardVariant editorial, showRating,
  promise) → collection_story (Puja campaign: eyebrow/heading/body/ctaLabel/
  ctaHref/imageUrl/scrim true) → lookbook (heading + i1-4 Image/Alt/Href,
  offset true) → textile_showcase (headline + items[4] image/title/subtitle:
  Jamdani/Tangail Taant/Nakshi Kantha/Pure Silk) → wedding_shop (heading/body
  + c1-3 Name/Href + buttonLabel/Href) → gift_finder (heading/body + o1-3
  Label/Query + buttonLabel) → heritage_story (eyebrow/headline/body/ctaLabel/
  ctaHref) → editorial_banner (eyebrow/headline/subhead/cta_label/cta_url) →
  testimonial_carousel (testimonials[2] quote/author) → rewards_club (heading/
  body + tier1-3 Name/Points + buttonLabel/Href) → subbrand_spotlight
  (heading/subheading + b1-4 Name/Tagline/Href) → marquee_strip (items[5]
  text rows: Handloom/Fair Trade/Artisan-Owned/Natural Dyes/Zero Plastic).
- `secondary.ts` → `export function buildSecondaryTemplates(
  s: SectionBuilder, header: () => Section[], footer: () => Section[],
): Record<"collection"|"product"|"page"|"blog"|"cart"|"checkout", TemplateMain>`
  where TemplateMain = `{ header: Section[]; main: Section[]; footer: Section[] }`.
  Keep current template shapes but fix props: heritage_story → headline variant,
  textile_showcase → items[], editorial_banner → headline/subhead variant,
  marquee → items[], empty headings filled, payment marks comma-separated.

## Prop contracts (renderer dual-read — either key works, prefer FIRST)

- heritage_story: headline|heading, eyebrow|caption, image, body,
  ctaLabel|buttonLabel, ctaHref|buttonHref, founder_quote/name, layout.
- textile_showcase: headline|heading, items[] {image,title,subtitle} (preferred).
- editorial_banner: headline|heading, subhead|body, cta_label|ctaLabel,
  cta_url|ctaHref, eyebrow, image, overlay.
- marquee_strip: items[] {text} (preferred).
- department_grid: departments[] {image,name|title,name_bn,count,href}.
- trust_bar: items[] {icon,title,body} OR iNIcon/iNTitle/iNBody.
- product_rail: heading/collection/limit/cardVariant/showRating/promise.
- lookbook: heading/iNImage/iNAlt/iNHref/offset.
- wedding_shop: heading/body/cNName/cNHref/buttonLabel/buttonHref.
- gift_finder: heading/body/oNLabel/oNQuery/buttonLabel.
- rewards_club: heading/body/tierNName/tierNPoints/buttonLabel/buttonHref.
- collection_story: eyebrow/heading/body/ctaLabel/ctaHref/imageUrl/scrim.
- subbrand_spotlight: heading/subheading/bNName/bNTagline/bNImage/bNHref.

## Rules

- SectionType values must exist in `src/lib/builder-ast.ts` SectionType union.
- Props values: string | number | boolean | rows[] only (PropValue).
- Bilingual: pass EN strings; factory auto-fills _bn from BLUEPRINT_BN.
  Hero slides keep explicit headline_bn (rows are NOT auto-translated).
- Demo hrefs: collections `/c/heritage-handloom /c/eid-festive
  /c/nakshi-kantha /c/artisan-essentials /c/taaga-fusion /c/aarong-earth`;
  products `/p/<slug>` (see src/lib/demo-catalog.ts HERITAGE_APPAREL).
- Images: `/api/public/ph/<dept>/<slug>.svg` placeholders only, never hotlinks.
- Write ONLY assigned files. Read renderers for prop names:
  heritage.tsx, apparel.tsx (lookbook/rewards/wedding/gift/collection_story),
  chrome.tsx (bars/mega/trust/payment), merch.tsx (product_rail).
