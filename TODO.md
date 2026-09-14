# Framique Master Execution Plan & Design/SEO Audit (TODO.md)

> **Status**: Living Execution Blueprint  
> **Semrush API Key**: `semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd`  
> **Target Standards**: `DESIGN.md`, Hallmark Skill Guidelines, OKLCH Comfort Contrast, Google Search Essentials, WCAG 2.1 AAA  

---
## 🚨 Active Critical Issues & Vulnerabilities (Identified Sept 11, 2026)

### 1. Critical Vulnerabilities & Auth Flaws (Must Fix Immediately)
- [ ] **Exposed Production Credentials:** Exposed raw SSH IPs, GitHub PATs, Supabase DB passwords, JWT Secrets, Kong API Keys, and SMTP passwords. **Action Required:** Immediate rotation of all credentials on the live server.
- [ ] **Cross-Pollination of Auth (B2C vs B2B):** A user signing up at `/auth?mode=signup` is intended to be a customer (B2C) for a store. However, because they are just a Supabase Auth User, they can navigate to `/admin`, pass the initial auth check, and trigger the `/onboarding` flow to instantly become a Merchant (B2B). There is currently no strict segregation of "Customer" vs "Merchant" at the registration level.
- [ ] **`/root` Platform Owner Dashboard Broken/Missing:** The `/root` route no longer resolves properly or has become disconnected in the routing tree, locking out the platform owner.
- [ ] **Pervasive Security Gaps:** As noted, the website is "fully full of bugs and vulnerabilities" requiring a comprehensive security audit of row-level security (RLS) policies and SSR loader guards.

### 2. High Priority Architecture Flaws
- [ ] **Custom Domain Edge Resolution:** The custom domain logic (`mystore.com.bd` -> tenant injection) is weak. The application needs edge-level interception (via `resolveTenantCanaryRoute` in `server.ts`) to read the `Host` header, resolve the `merchant_id` from the `domains` table, and inject `x-framique-tenant-id` before hydration.
- [ ] **Automated SSL & ACME Challenges:** The ACME challenge route exists (`[.]well-known.acme-challenge.$token.ts`) but lacks a robust background worker/cron to automatically request, validate, and reload HAProxy with new SSL certs for custom domains.
- [ ] **Hardcoded Storefronts vs. Modular Themes:** To truly compete with Shopify/Webflow, `store.$slug.index.tsx` cannot be a hardcoded React page. The system requires a dynamic JSON-based AST or Liquid-style templating engine so merchants can drag-and-drop components without altering core repo code.

### 3. Recently Fixed
- [x] **Multi-Tenant Portal Bleeding:** Enforced strict persona boundaries (Platform Admin vs Merchant vs Customer) at the server-loader level (`beforeLoad` in `admin.tsx` and `dashboard.tsx`) to prevent TanStack router state bleeding and infinite redirects.



## 1. Comprehensive Design & Architecture Audit

> **Honest Verdict after measuring all 12 public pages at phone, tablet and desktop**:  
> **Responsiveness is solid, contrast and polish are not yet at Hallmark grade.**

### 1.1 What Passes
- **Zero sideways scrolling** on every page at 375px, 768px and 1440px.
- **Buttons keep their natural size** on tablet/desktop while expanding to full width on mobile viewports.
- **Tablet shows real multi-column layouts** instead of dropping everything into an endless single-column scroll.

### 1.2 What Fails
- **Text contrast**: The Facebook blue on white measures about **4.1:1** — just under the 4.5:1 readable minimum, and it's used ~150 times (links, labels). The muted grey body text is worse, around **3.4–3.9:1**. The lime accent text on light panels is essentially unreadable.
- **Small tap targets**: 18–20 controls on Pricing, 13 on Blog and 11 on Solutions are under the 44px minimum, even on phones.
- **Two conflicting definitions of the same grid rule** exist in the stylesheet; the first one is dead code (`@utility fq-grid-field` around line 759), so some sections don't get the spacing they were designed with.
- **Eye smoothness**: The pages read as competent but busy — too many accent colours competing per screen and inconsistent vertical rhythm between sections. Hallmark-grade means fewer colours, one accent per screen, and one repeated spacing scale.

### 1.3 State of Fixes & Precision Breakdown

| Problem Area | Diagnosis & Exact Fix Applied | Status |
| :--- | :--- | :--- |
| **Facebook Blue Contrast (was ~4.1:1)** | Swapped hardcoded blue for a slightly darker shade (`oklch(0.48 0.23 255)` / `#1360D4`, **5.2:1** on canvas) that clears the readable-contrast minimum. Routed through single token `--color-primary` / `--fq-signal` so it never drifts again. | **APPLIED & TESTED** |
| **Muted Grey Text Contrast (was 3.4–3.9:1)** | Calibrated `--color-muted-foreground` to `oklch(0.40 0.018 25)` (**5.5:1** on canvas) to clear the 4.5:1 WCAG AA readable floor. | **APPLIED & TESTED** |
| **Dead Grid Rule around Line 759** | Located dead conflicting `@utility fq-grid-field` at line 746-761 in `src/styles.css` and deleted it. | **APPLIED & TESTED** |
| **Small Tap Targets (< 44px)** | Enlarged GMV presets on Pricing, category filter buttons on Features, courier & destination toggles on Fulfilment, and rail presets on Payments to `min-h-[44px]`. | **APPLIED & TESTED** |
| **Hero Responsive Layout** | Imposed `min-h-[75vh] lg:min-h-[680px]` desktop floor with flex centering, 2-column Split Screen at `md` (768px), and compact mobile typography clamp. | **APPLIED & TESTED** |

---

### 1.4 Modern Flex & Grid Layout Patterns Roadmap
We must continue streamlining all public pages using deliberate modern layout patterns:
1. **Split Screen**: Hero sections, pricing fee comparisons, and feature head-to-heads (50/50 or 60/40 balanced split).
2. **Bento Grids**: Asymmetrical 3-column and 4-column cards with mixed col-span/row-span for high visual density and engagement.
3. **Magazine Layout**: Editorial long-form reading in `/blog`, `/about`, and `/docs` with sticky sidebars, drop caps, pull quotes, and visual breaks.
4. **Container-Free Breathing Sections**: Edge-to-edge subtle gradients, generous 96px section padding, and subtle divider strokes replacing rigid card containers.
5. **Z-Pattern (Zig-Zag)**: Alternating text-left/image-right and image-left/text-right feature stories to guide natural eye movement.
6. **F-Pattern**: Scannable headings, bulleted value propositions, and bolded lead metrics for documentation and technical pages.
7. **Symmetry vs. Asymmetry**: Approximate horizontal symmetry for comparison tables; deliberate asymmetry in Bento highlights to emphasize primary value props.
8. **Mobile Touch Architecture**: Every interactive button must stretch to full width (`w-full sm:w-auto`) with a minimum 44px tap target floor (`min-h-[44px]`).

---

## 2. Integrated UI/UX, Motion & Engineering Skills Stack

Our implementation directly executes the directives from the 21 specified core design and motion skills:

1. **`claudedesignskills`**: Intentional typographic scale, rhythm hierarchy, scannable information architecture.
2. **`gsap-skills`**: Cinematic scroll-triggered choreography and pin animations.
3. **`vercel-agent-skills`**: Edge runtime optimization, streaming server components, zero-CLS layout stabilization.
4. **`shadcn-ui-mcp-server`**: Accessible Radix primitives with customized Framique tokens.
5. **`taste-skill`**: Restraint over decoration; eliminating generic AI slop and visual clutter.
6. **`ui-ux-pro-max-skill`**: High-conversion checkout flows, cognitive load reduction, micro-feedback loops.
7. **`motion-framer`**: Declarative layout animations, tab cross-fades, and responsive layout morphing.
8. **`gsap-utils`**: Interpolation, clamp, snap, and responsive breakpoint math.
9. **`gsap-performance`**: `will-change`, `transform3d`, sub-pixel rendering, and memory leak cleanup on unmount.
10. **`gsap-react`**: `useGSAP` hook lifecycle management and SSR hydration safety.
11. **`gsap-frameworks`**: Seamless integration with TanStack Router and modern reactive frameworks.
12. **`gsap-timeline`**: Coordinated multi-stage sequencing for Hero entrance and interactive demos.
13. **`gsap-scrolltrigger`**: Scroll-scrubbed progress bars, sticky pinning, and reveal-on-scroll effects.
14. **`gsap-plugins`**: Flip, Draggable, and SplitText for advanced interactive widgets.
15. **`gsap-core`**: High-performance tweening engine for smooth 60fps micro-interactions.
16. **`react-native-skills`**: Cross-platform touch-first patterns, 44px minimum tap targets, gesture feedback.
17. **`react-best-practices`**: Immutability, zero unnecessary re-renders, accessible ARIA roles.
18. **`design-taste-frontend`**: Fine-tuned spatial rhythm, micro-borders, and tactile elevation.
19. **`frontend-design`**: CSS Grid/Flex mastery, container queries, clamp typography, fluid spacing.
20. **`hallmark`**: Slop-test compliance, OKLCH comfort contrast, anti-window rules, bilingual line boxes.
21. **`anthropics-skills`**: Clear, concise, highly structured technical execution and documentation.

---

## 3. The 42 SEO Skills: Site-Wide & Page-by-Page Architecture

Equipped with Semrush API Key: `semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd`.

### 3.1 The 42 SEO Disciplines Matrix

| # | Skill Name | Strategic Execution for Framique |
| :--- | :--- | :--- |
| 1 | **`seo`** | Master technical architecture: canonical URLs, meta titles (<60 chars), meta descriptions (<155 chars). |
| 2 | **`seo-semrush`** | Live keyword tracking, competitive position maps, domain search analytics via Semrush API key. |
| 3 | **`seo-ahrefs`** | Backlink profile monitoring, referring domain acquisition, anchor text hygiene. |
| 4 | **`seo-audit`** | Automated crawl health: zero 4xx/5xx errors, zero broken redirect chains, clean status codes. |
| 5 | **`seo-backlinks`** | Digital PR strategy targeting Bangladeshi fintech, courier blogs, and merchant communities. |
| 6 | **`seo-bing`** | Bing Webmaster Tools setup, IndexNow instant URL submission API for new blog posts. |
| 7 | **`seo-cluster`** | Topic cluster mapping: Pillar pages (Payments, Logistics) connected to deep-dive articles. |
| 8 | **`seo-competitor-pages`** | Direct comparison hubs: "Framique vs Shopify Bangladesh", "Framique vs WooCommerce COD". |
| 9 | **`seo-content`** | EEAT compliance, practical merchant guides, real data points (courier rates, MFS charges). |
| 10 | **`seo-content-brief`** | Structured authoring templates specifying exact target keywords, entities, and heading tags. |
| 11 | **`seo-dataforseo`** | Localized Dhaka and divisional SERP scraping and keyword volume benchmarking. |
| 12 | **`seo-drift`** | Algorithmic ranking decay detection, search intent drift alerts, and content refresh schedules. |
| 13 | **`seo-ecommerce`** | Multi-tenant schema: `Product`, `Offer`, `AggregateRating`, `MerchantReturnPolicy`. |
| 14 | **`seo-firecrawl`** | Headless DOM crawling to ensure SSR HTML completely renders without client JS dependencies. |
| 15 | **`seo-flow`** | PageRank sculpting: high-equity home/pricing links flowing into high-conversion feature pages. |
| 16 | **`seo-geo`** | Bangladesh national & divisional targeting (`geo.region: BD-13`, `geo.placename: Dhaka`). |
| 17 | **`seo-google`** | Google Search Console API synchronization, core search essentials, helpful content validation. |
| 18 | **`seo-hreflang`** | Exact bidirectional tags: `en-BD`, `bn-BD`, and `x-default` across all bilingual marketing pages. |
| 19 | **`seo-image-gen`** | Generation of search-targeted infographics, data visuals, and visual guides with rich prompt alts. |
| 20 | **`seo-images`** | Next-gen AVIF/WebP formats, explicit `width`/`height` to avoid CLS, XML Image Sitemap. |
| 21 | **`seo-local`** | Exact NAP consistency (`ORG_NAP`), Google Business Profile schema, local Dhaka office schema. |
| 22 | **`seo-maps`** | `GeoCoordinates` (`23.7925, 90.4078`), Gulshan/Banani map schema, local business citations. |
| 23 | **`seo-page`** | Single descriptive H1 per page, logical H2/H3 outline, semantic HTML5 sectioning elements. |
| 24 | **`seo-plan`** | 12-month commercial keyword dominance plan for e-commerce software in Bangladesh. |
| 25 | **`seo-profound`** | Latent semantic entity enrichment: linking "bKash" to Central Bank regulations, "Pathao" to API nodes. |
| 26 | **`seo-programmatic`** | Scalable dynamic landing pages: `/solutions/courier/[district]`, `/solutions/payments/[rail]`. |
| 27 | **`seo-schema`** | Comprehensive JSON-LD graphs: `Organization`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`. |
| 28 | **`seo-seranking`** | Daily desktop and mobile SERP rank tracking across top 200 target e-commerce keywords. |
| 29 | **`seo-sitemap`** | Dynamic `sitemap.xml`, version-controlled `docs.sitemap.xml`, and `blog.xml` RSS feeds. |
| 30 | **`seo-sxo`** | Search Experience Optimization: TTFB < 200ms, 1-tap mobile CTAs, zero searcher bounce. |
| 31 | **`seo-technical`** | Clean `robots.txt`, Brotli compression, strict canonical paths, noindex on internal search. |
| 32 | **`seo-unlighthouse`** | Automated Lighthouse auditing pipeline validating 100/100 SEO & Accessibility scores. |
| 33 | **`seo-rank-tracker`** | Tracking Bangla voice and vernacular search queries ("বিকাশ দিয়ে অনলাইন শপ"). |
| 34 | **`seo-serp`** | SERP feature optimization: rich FAQ snippets, sitelinks search box, author knowledge graphs. |
| 35 | **`seo-intent`** | Intent classification: Informational (Blog), Commercial (Features), Transactional (Pricing/Signup). |
| 36 | **`seo-canonical`** | Strict trailing-slash and protocol normalization to prevent duplicate URL indexing. |
| 37 | **`seo-redirects`** | Immutable 301 redirect map for legacy URLs, 410 Gone for purged endpoints, zero soft-404s. |
| 38 | **`seo-cwv`** | Core Web Vitals: LCP < 1.8s, INP < 100ms, CLS < 0.02 on throttled 4G mobile networks. |
| 39 | **`seo-internal-links`** | Contextual in-body links, related article clusters, breadcrumb trail microdata. |
| 40 | **`seo-rich-snippets`** | Rating stars, software category badges, pricing currency formatting in BDT (`৳`). |
| 41 | **`seo-open-graph`** | Dedicated 1200x630px social cards with localized Bangla/English branding for Facebook and WhatsApp. |
| 42 | **`seo-meta-audit`** | Automated CI validation: blocking builds on missing meta descriptions or duplicate H1 tags. |

---

## 4. Page-by-Page Design, Motion & Icon Architecture

> **Anti-Slop Directives (`frontend-design`, `design-taste-frontend`, `hallmark`)**:
> - **Hero is a Thesis**: Open with the most characteristic artifact of the subject's world (live 1-tap checkout, thermal print preview, Taka savings scale).
> - **Single Chromatic Signal**: Exactly one primary signal (`--fq-signal` / `#1360D4`, **5.2:1** WCAG AA contrast) + subtle pink focal pip (`#F43F5E`) on warm blush canvas (`#FAF6F7` with `#FFF1F3`).
> - **Zero Re-drawn Chrome**: Never hand-build fake browser dots or faux OS title bars. Real content stands on its own.
> - **Zero Fabricated Metrics**: No fake "+47% conversion" or "50,000+ happy merchants". Real, verifiable milestones only.
> - **Zero Italic Headers**: Display headers remain upright roman (`font-style: normal`).
> - **Touch-First Floor**: Every single interactive button enforces `min-h-[44px]` with full width on mobile (`w-full sm:w-auto`).
> - **AI Generation Prompts**: Every graphic placeholder must have an explicit `alt="Prompt: ..."` production prompt.

---

### 4.1 Homepage (`/`)
- **Design Read & Subject Thesis**:
  - *Reading*: Flagship commercial platform for serious Bangladeshi merchants upgrading from manual Facebook/WhatsApp DM chaos to automated omnichannel infrastructure.
  - *Dials*: `VARIANCE: 8` | `MOTION: 7` | `DENSITY: 4`
  - *Thesis*: A living commerce engine connecting 1-tap bKash/Nagad checkout, automated Pathao/Steadfast dispatch, and synchronized multi-location inventory.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: 60/40 desktop split (`min-h-[85vh] lg:min-h-[720px]`), balanced 50/50 tablet split, stacked mobile with fluid typography (`clamp(2.2rem, 5vw, 4.2rem)`).
  - **3-Column Asymmetrical Bento Grid**: High visual density highlighting 1-Tap Checkout, Instant Settlement, and Courier Dispatch.
  - **Z-Pattern Narrative**: Alternating product stories (Storefront Builder → Inventory Ledger → Shipping Hub).
  - **Container-Free Proof Band**: Edge-to-edge subtle gradient with generous 96px padding.
- **Motion, Animations & Transitions**:
  - *Atmospheric Canvas*: `shadergradient.co` ambient calm rose and indigo fluid mesh canvas (`#FFF1F3` to `#FAF6F7`) with 0.05 canvas grain for soothing eye comfort.
  - *3D Interactive Hero*: `spline.design` interactive 3D merchant tablet model with soft mouse-tracking parallax and studio lighting.
  - *Header Micro-Island*: `skiper-ui.com` dynamic island navigation pill with live simulated order activity ticker.
  - *Merchant Showcase*: `skiper-ui.com` image reveal with smooth cursor trail on merchant storefront previews.
  - *Typographic Shaders*: `text-effects.colorion.co` `fx-aurora` on primary headline and `fx-spotlight` on feature subheadings.
  - *Spring Physics*: `animmasterlab.dev` spring dampening on card hover interactions (`stiffness: 260, damping: 20`).
  - *Section Flow*: `swishy.ai` fluid cross-fade transition between hero and bento showcase.
- **Iconography Systems & Micro-Interactions**:
  - *Core Value Props*: `lordicons.com` animated JSON icons (stroke 1.5, primary `#1360D4`, accent `#F43F5E`) for speed, POS sync, and ledger automation.
  - *Fintech & Courier Badges*: `Icons8` official verified vector badges for bKash, Nagad, Rocket, Upay, Pathao, and Steadfast.
  - *Interactive Buttons*: `itshover.com` directional hover icons with magnetic pull on primary CTAs.
  - *Navigational Controls*: `lucide-animated.com` animated hamburger-to-close toggle and search drawer transition.
- **Image Placeholders & AI Generation Prompts**:
  1. **Main Hero 3D Dashboard**:
     - *Alt Prompt*: `"Prompt: A high-resolution 3D UI render of a modern e-commerce dashboard for a Bangladeshi merchant, displaying bKash, Nagad, and Card live settlement graphs, clean typography, dark obsidian glassmorphism cards with soft rose pink accents, isometric angle, photorealistic studio lighting, soft ambient glow, Figma design aesthetic, 8k resolution, aspect ratio 16:10."`
  2. **1-Tap Mobile Checkout**:
     - *Alt Prompt*: `"Prompt: Photorealistic smartphone mockup held in hands in a Dhaka coffee shop, displaying a clean 1-tap mobile checkout screen in Bengali and English, showing bKash payment confirmation and instant order success badge, cinematic natural lighting, shallow depth of field, 8k resolution, aspect ratio 4:3."`
  3. **Automated Courier Dispatch**:
     - *Alt Prompt*: `"Prompt: A sleek 3D isometric illustration of thermal shipping labels printing from a modern thermal printer, labeled with Steadfast and Pathao courier barcodes, parcel boxes on a minimalist wooden studio table, soft warm lighting, hyper-detailed, clean modern aesthetics, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-ecommerce`, `seo-schema`, `seo-geo`, `seo-semrush`, `seo-cwv`.
  - *Target Keywords*: `ecommerce platform bangladesh`, `online shop builder dhaka`, `bkash ecommerce gateway`, `pathao delivery integration`.
  - *Meta Title*: `Framique | The Commerce Operating System for Bangladesh`
  - *Meta Description*: `Launch and scale your online business in Bangladesh with 1-tap bKash/Nagad checkout, automated Pathao/Steadfast delivery, and zero monthly platform fees.`

---

### 4.2 Pricing Page (`/pricing`)
- **Design Read & Subject Thesis**:
  - *Reading*: Commercial transparency manifesto combating predatory hidden commissions and plugin fees.
  - *Dials*: `VARIANCE: 6` | `MOTION: 4` | `DENSITY: 3`
  - *Thesis*: A transparent, interactive Taka savings calculator proving exact margin retention compared to foreign platforms.
- **Layout & Flex/Grid Architecture**:
  - **Centered F-Pattern Hero**: Fluid GMV slider (`৳20,000` to `৳5,000,000/mo`) with live annual savings readouts.
  - **Split-Screen Rail Comparison**: Zero-Fee Cash on Delivery Rail vs 1.5% Direct Digital MFS Gateway.
  - **3-Column Asymmetrical Bento Cards**: Starter (৳0/mo), Growth (৳2,490/mo), Scale (৳6,990/mo) with prominent 44px preset selectors.
  - **Container-Free Comparison Table**: Clean vertical dividers, sticky header row, zero horizontal scroll on mobile viewports.
- **Motion, Animations & Transitions**:
  - *Calculator Physics*: `animmasterlab.dev` numeric scrub spring physics; numbers roll with zero jitter on slider drag.
  - *Recommended Tier Glow*: `vengenceui.com` subtle animated border glow (`oklch(0.48 0.23 255 / 0.35)`) on the Growth tier card.
  - *Micro-Context*: `skiper-ui.com` "Vercel Tooltip" on fee line items for micro-contextual explanations.
  - *Metric Highlight*: `text-effects.colorion.co` `fx-spotlight` animating across the total annual savings metric.
  - *Billing Toggle*: `ripplix.com` subtle ripple expansion when toggling between Monthly and Annual billing.
- **Iconography Systems & Micro-Interactions**:
  - *Feature Checklist*: `potlabicons.com` lightweight animated SVG checkmarks drawing smoothly on viewport entrance.
  - *Currency & Money Glyphs*: `iconsax.io` dual-tone linear wallet, card, and Taka banknote glyphs.
  - *CTA Micro-Motion*: `itshover.com` directional arrow shift (`translateX(4px)`) on button hover.
- **Image Placeholders & AI Generation Prompts**:
  1. **Transparent Taka Savings Visual**:
     - *Alt Prompt*: `"Prompt: Minimalist 3D rendered infographic showing comparison scales of merchant profits: on one side, a heavy cut taken by foreign platforms; on the other side, Framique's flat zero-commission 100% merchant profit balance with crisp Bangladeshi Taka banknotes, studio lighting, clean soft pink and slate blue backdrop, 8k resolution, aspect ratio 16:9."`
  2. **Cash-on-Delivery Risk Shield**:
     - *Alt Prompt*: `"Prompt: A clean 3D isometric representation of a protective shield hovering over a stack of parcel boxes and cash envelopes, symbolizing OTP-verified Cash on Delivery protection for Bangladeshi online merchants, soft warm studio lighting, 8k resolution, aspect ratio 4:3."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-intent`, `seo-rich-snippets`, `seo-schema`, `seo-competitor-pages`.
  - *Target Keywords*: `ecommerce platform pricing bangladesh`, `shopify alternative bangladesh cost`, `free online store builder dhaka`.
  - *Meta Title*: `Simple, Transparent Pricing | Framique Bangladesh`
  - *Meta Description*: `Calculate your savings with Framique. Zero percent commission on Cash on Delivery, flat low rates on bKash/Nagad, and no hidden server fees.`

---

### 4.3 Features Page (`/features`)
- **Design Read & Subject Thesis**:
  - *Reading*: Deep architectural sandbox for technical founders, retail brand owners, and agency builders.
  - *Dials*: `VARIANCE: 9` | `MOTION: 6` | `DENSITY: 5`
  - *Thesis*: An interactive capability sandbox proving that Framique is an omnichannel operating system, not just a storefront theme.
- **Layout & Flex/Grid Architecture**:
  - **Asymmetrical Split Screen Hero**: Live interactive architecture sandbox responding to feature filter pills.
  - **6-Card Multi-Span Bento Grid**: Mixed row/column spans covering Storefront, Inventory Ledger, MFS Engine, Logistics, Retail POS, and Fraud Shield.
  - **Sticky Category Filter Dock**: Centered bottom floating dock (`min-h-[44px]` buttons) with smooth horizontal pill highlight.
  - **Magazine Feature Breakdown**: Z-Pattern alternation with deep technical specifications and live payload previews.
- **Motion, Animations & Transitions**:
  - *Interactive Bento*: `skiper-ui.com` "Things Drag and Scroll" for retail POS barcode and inventory shelf demo.
  - *Animated Tabs*: `originkit.dev` unstyled animated tab switches with layout morphing.
  - *Header Text Reveals*: `text-effects.colorion.co` `fx-decoder` unscrambling technical terms into plain English and Bangla.
  - *Card Tilts*: `animmasterlab.dev` 3D card tilt physics responding to mouse position (`max: 8deg, scale: 1.02`).
  - *System Dataflows*: `LottieFiles` lightweight vector loops showing inventory deducting simultaneously across showroom and web.
- **Iconography Systems & Micro-Interactions**:
  - *Feature Bento Grid*: `lordicons.com` multi-colored interactive JSON icons for database sync, barcode scanner, multi-location POS, and push alerts.
  - *Category Dock*: `lucide-animated.com` morphing icons switching seamlessly between grid, list, and detail views.
  - *Status Indicators*: `animate-ui.com` animated pill badges with subtle micro-pulses.
- **Image Placeholders & AI Generation Prompts**:
  1. **Omnichannel Multi-Location POS Visual**:
     - *Alt Prompt*: `"Prompt: Modern tablet POS terminal on a boutique counter in Banani Dhaka, showing synchronized real-time inventory between retail showroom and online website, elegant minimalist apparel store background, soft atmospheric lighting, photorealistic, 8k resolution, aspect ratio 16:9."`
  2. **Multi-Warehouse Distribution Hub**:
     - *Alt Prompt*: `"Prompt: High-resolution photographic view inside a modern, organized e-commerce distribution warehouse in Tejgaon Dhaka, barcode scanners, shelving racks with neatly packed fashion boxes, bright daylight studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-cluster`, `seo-content-brief`, `seo-programmatic`, `seo-page`.
  - *Target Keywords*: `bangladesh pos software`, `multi channel ecommerce inventory dhaka`, `automated shipping barcode bangladesh`.
  - *Meta Title*: `Commerce Features Built for Bangladesh | Framique`
  - *Meta Description*: `Explore Framique features: multi-location retail POS, real-time bKash/Nagad reconciliation, courier barcode generation, and automated fraud prevention.`

---

### 4.4 Payments & MFS Gateway (`/payments`)
- **Design Read & Subject Thesis**:
  - *Reading*: Bank-grade fintech infrastructure for merchants handling hundreds of daily mobile transactions.
  - *Dials*: `VARIANCE: 7` | `MOTION: 5` | `DENSITY: 4`
  - *Thesis*: Live Webhook & Settlement Simulator enabling instant testing of bKash/Nagad callbacks and transparent ledger balancing.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: Left: regulatory security and direct settlement thesis; Right: interactive webhook simulator terminal with live JSON payload streaming.
  - **4-Column Card Grid**: bKash Direct, Nagad Merchant, Visa/Mastercard 3DS2, and Verified OTP COD.
  - **Container-Free Worked Examples**: Step-by-step Taka breakdown demonstrating exact fee deductions with zero hidden charges.
- **Motion, Animations & Transitions**:
  - *Live Terminal Simulation*: `originkit.dev` terminal code block with live JSON payload streaming and syntax coloring.
  - *Atmospheric Glow*: `shadergradient.co` calm deep slate and indigo radial beam backdrop (`#0F172A` / `#1E293B`).
  - *Cryptographic Text*: `text-effects.colorion.co` `fx-datastream` on simulated transaction ID hashes and `fx-blueprint` on settlement timing diagrams.
  - *Perspective Switcher*: `swishy.ai` smooth morphing between Customer Checkout Experience and Merchant Ledger View.
  - *Verification Burst*: `LottieFiles` micro-animation checkmark burst upon simulated payment success.
- **Iconography Systems & Micro-Interactions**:
  - *Payment Rails*: `Icons8` high-fidelity verified vector logos for bKash, Nagad, Rocket, Upay, Cellfin, Visa, Mastercard, and UnionPay.
  - *Security Locks*: `lordicons.com` animated padlock and vault vectors with stroke morph on hover.
  - *Action Controls*: `itshover.com` animated copy-to-clipboard and curl terminal trigger buttons.
  - *Rail Availability*: `potlabicons.com` animated pulse indicators confirming 99.99% gateway availability.
- **Image Placeholders & AI Generation Prompts**:
  1. **Payment Security & Reconciliation Visual**:
     - *Alt Prompt*: `"Prompt: High-tech 3D visualization of cryptographic data streams connecting mobile banking nodes bKash and Nagad to an encrypted merchant ledger, holographic glowing shield icon, deep navy and calm pink tones, photorealistic studio render, 8k resolution, aspect ratio 16:9."`
  2. **1-Tap Customer Mobile Pay**:
     - *Alt Prompt*: `"Prompt: Studio macro photograph of a smartphone screen showing a native bKash payment biometric prompt with fingerprint authorization, clean UI design, soft ambient studio lighting, ultra-sharp detail, 8k resolution, aspect ratio 4:3."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-profound`, `seo-schema`, `seo-rich-snippets`, `seo-intent`.
  - *Target Keywords*: `bkash payment gateway integration`, `nagad merchant api bangladesh`, `zero fee cod ecommerce dhaka`.
  - *Meta Title*: `Direct MFS & Payment Infrastructure | Framique Payments`
  - *Meta Description*: `Accept bKash, Nagad, Cards, and Cash on Delivery with direct merchant settlement, automated webhook verification, and instant ledger reconciliation.`

---

### 4.5 Fulfilment & Logistics (`/fulfilment`)
- **Design Read & Subject Thesis**:
  - *Reading*: Physical logistics engine connecting digital order entries to Bangladeshi courier bikes.
  - *Dials*: `VARIANCE: 8` | `MOTION: 8` | `DENSITY: 5`
  - *Thesis*: 4x6 thermal consignment dispatch sandbox and live multi-courier SLA rate calculator.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: Left: logistics automation proposition; Right: live consignment dispatch sandbox with instant thermal barcode preview.
  - **7-Stage Responsive Lifecycle**: Stepped process tree collapsing into vertical accordion on mobile (Order Placed → Fraud Check → Rider Booked → In Transit → Delivered).
  - **4-Column Courier SLA Grid**: Pathao, Steadfast, RedX, and Paperfly comparison with Inside Dhaka, Sub-Dhaka, and Divisional toggles.
- **Motion, Animations & Transitions**:
  - *Order Lifecycle State Machine*: `rive.app` runtime interactive vector graphic dynamically updating rider status in real time.
  - *Thermal Eject Effect*: `skiper-ui.com` image reveal simulating 4x6 thermal label rolling out of a printer.
  - *Weight Slider Physics*: `animmasterlab.dev` spring-dampened weight preset selectors (0.5kg, 1kg, 2kg, 5kg).
  - *Barcode Scanner*: `text-effects.colorion.co` `fx-scanner` laser-line scanning animation across consignment numbers.
  - *Route Micro-Motion*: `motionsites.ai` scroll-pinned delivery bike moving across a stylized Bangladesh transit line.
- **Iconography Systems & Micro-Interactions**:
  - *Logistics Partners*: `Icons8` optimized SVG assets for Pathao, Steadfast, RedX, Paperfly, and eCourier.
  - *Delivery States*: `lordicons.com` animated motorbike, thermal printer, parcel box, and GPS map pin icons.
  - *Interactive Tracking*: `itshover.com` interactive consignment pill buttons with animated status badges.
  - *Category Tabs*: `lucide-animated.com` animated parcel, truck, and return icons.
- **Image Placeholders & AI Generation Prompts**:
  1. **Dhaka Logistics Delivery Visual**:
     - *Alt Prompt*: `"Prompt: Clean commercial photograph of a delivery courier in Dhaka handing an eco-friendly parcel with a Framique thermal barcode to a smiling customer at doorstep, golden hour warm lighting, authentic Dhaka urban residential backdrop, shot on 85mm lens f/1.8, 8k resolution, aspect ratio 16:9."`
  2. **Automated Sorting Hub**:
     - *Alt Prompt*: `"Prompt: Modern automated parcel sorting conveyor line in a Dhaka logistics hub, parcels stamped with Framique courier shipping labels moving past automated optical barcode scanners, cinematic industrial lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-local`, `seo-geo`, `seo-programmatic`, `seo-flow`.
  - *Target Keywords*: `pathao courier integration ecommerce`, `steadfast courier api bangladesh`, `automated shipping label dhaka`.
  - *Meta Title*: `Automated Courier & Fulfilment Engine | Framique Logistics`
  - *Meta Description*: `Connect Pathao, Steadfast, and RedX in one click. Generate 4x6 thermal labels, prevent return fraud with OTP verification, and track shipments in real time.`

---

### 4.6 Customers & Case Studies (`/customers`)
- **Design Read & Subject Thesis**:
  - *Reading*: Social proof and authentic merchant growth stories across Bangladeshi trade hubs.
  - *Dials*: `VARIANCE: 7` | `MOTION: 5` | `DENSITY: 3`
  - *Thesis*: Authentic growth records—from Dhanmondi fashion boutiques to Elephant Road gadget merchants—scaling past 1,000 orders/day.
- **Layout & Flex/Grid Architecture**:
  - **Magazine Hero**: Spotlight merchant cover story with high-resolution photography and verified revenue metrics.
  - **3-Column Asymmetric Bento Grid**: Verified merchant stories with GMV milestones and operational transformation stats.
  - **Sticky Category Switcher**: Fashion, Consumer Electronics, Cosmetics, Organic Groceries (`min-h-[44px]`).
  - **Container-Free Quote Carousel**: Pull quotes with verified founder headshots and live storefront links.
- **Motion, Animations & Transitions**:
  - *Merchant Card Hover*: `skiper-ui.com` "Hover Members" interactive card with preview drawer sliding up on pointer hover.
  - *Staggered Reveal*: `originkit.dev` smooth scroll-triggered entry for case study cards.
  - *Ambient Warmth*: `shadergradient.co` calm blush background aura (`#FFF1F3` fading into `#FAF6F7`).
  - *Typographic Focus*: `text-effects.colorion.co` `fx-softblur` focusing into sharp text for merchant quotes.
  - *Milestone Counting*: `animmasterlab.dev` smooth easing counter for verified merchant delivery volumes.
- **Iconography Systems & Micro-Interactions**:
  - *Verified Badges*: `potlabicons.com` animated blue checkmark badge indicating verified merchant ledger data.
  - *Channel Badges*: `Icons8` Facebook Shop, Instagram, WhatsApp Business, and Web channel icons.
  - *Category Glyphs*: `iconsax.io` linear shopping bag, mobile device, dress, and cosmetic glyphs.
  - *Carousel Navigation*: `lucide-animated.com` animated left/right arrows with hover slide feedback.
- **Image Placeholders & AI Generation Prompts**:
  1. **Jamdani Boutique Studio**:
     - *Alt Prompt*: `"Prompt: Commercial photograph of a Bangladeshi female fashion boutique founder inspecting handcrafted Jamdani sarees in an elegant Dhaka showroom with soft ambient lighting, high-end textile studio, shot on Hasselblad 80mm lens, photorealistic, 8k resolution, aspect ratio 16:9."`
  2. **Gadget Merchant Fulfilment**:
     - *Alt Prompt*: `"Prompt: A young energetic Bangladeshi merchant in a modern Dhaka tech accessories warehouse packing premium wireless earbuds into branded mailer boxes, dual monitors in background displaying Framique order dispatch screen, authentic studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-content`, `seo-rich-snippets`, `seo-schema`, `seo-sxo`.
  - *Target Keywords*: `ecommerce success stories bangladesh`, `best online stores dhaka case study`, `framique merchant reviews`.
  - *Meta Title*: `Merchant Stories & Case Studies | Framique Bangladesh`
  - *Meta Description*: `Discover how Bangladeshi retail brands and fast-growing online merchants scale their revenue and automate operations with Framique.`

---

### 4.7 Security, Trust & Compliance (`/security`)
- **Design Read & Subject Thesis**:
  - *Reading*: Bank-grade compliance and infrastructure assurance for enterprise leaders and audit committees.
  - *Dials*: `VARIANCE: 5` | `MOTION: 3` | `DENSITY: 4`
  - *Thesis*: Hardened cloud architecture strictly adhering to Bangladesh Bank Guidelines for Electronic Commerce Security.
- **Layout & Flex/Grid Architecture**:
  - **Centered Hero**: Trust beacon highlighting zero data breaches and automated cryptographic integrity.
  - **Split Section**: Data Encryption in Transit (TLS 1.3) vs Data Encryption at Rest (AES-256).
  - **4-Column Security Bento Grid**: Tenant Isolation, DDoS Shield, Role-Based Access Control, and Immutable Audit Logs.
  - **Compliance Checklist Grid**: Interactive downloadable regulatory compliance matrix.
- **Motion, Animations & Transitions**:
  - *Dark Security Cards*: `vengenceui.com` dark obsidian cards with subtle glowing border accents (`rgba(19, 96, 212, 0.4)`).
  - *Interactive Accordions*: `originkit.dev` unstyled security accordions with smooth spring expansion.
  - *Holographic Protocol*: `text-effects.colorion.co` `fx-hologram` on encryption protocol labels and `fx-laser` on SHA-256 integrity check indicators.
  - *Cryptographic Lock*: `LottieFiles` animated cryptographic padlock engaging cleanly on initial page load.
- **Iconography Systems & Micro-Interactions**:
  - *Security Badges*: `lordicons.com` animated shield, key, firewall, and biometric fingerprint icons.
  - *Regulatory Trust*: `Icons8` ISO/IEC 27001, PCI-DSS Level 1, and Bangladesh Bank clearing compliance glyphs.
  - *Download CTA*: `itshover.com` animated download arrow with elastic spring return.
  - *Heartbeat Beacon*: `potlabicons.com` green animated heartbeat dot indicating active automated threat monitoring.
- **Image Placeholders & AI Generation Prompts**:
  1. **Enterprise Security Architecture**:
     - *Alt Prompt*: `"Prompt: 3D architectural render of a fortified digital cloud vault with glowing blue cryptographic data conduits, multi-tenant isolation barriers, zero-trust security perimeter, isometric perspective, dark glassmorphism aesthetic, 8k resolution, aspect ratio 16:9."`
  2. **Bangladesh Bank Regulatory Shield**:
     - *Alt Prompt*: `"Prompt: Conceptual 3D graphic of an official golden-bronze security seal embedded in a deep slate marble surface, symbolizing regulatory e-commerce compliance in Bangladesh, dramatic studio lighting, raytracing reflections, 8k resolution, aspect ratio 4:3."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-technical`, `seo-audit`, `seo-schema`, `seo-intent`.
  - *Target Keywords*: `ecommerce security bangladesh`, `pci dss compliance dhaka online store`, `secure payment processing bangladesh`.
  - *Meta Title*: `Enterprise Security & Compliance | Framique`
  - *Meta Description*: `Learn about Framique's multi-tenant isolation, AES-256 encryption, DDoS protection, and full compliance with Bangladesh Bank e-commerce security standards.`

---

### 4.8 About & Dhaka Engineering Studio (`/about`)
- **Design Read & Subject Thesis**:
  - *Reading*: Engineering studio craftsmanship, authentic mission, and deep local commitment.
  - *Dials*: `VARIANCE: 6` | `MOTION: 4` | `DENSITY: 3`
  - *Thesis*: Crafting infrastructure engineered for Bangladesh's unique commerce realities rather than reselling generic western templates.
- **Layout & Flex/Grid Architecture**:
  - **Centered Magazine Hero**: Dhaka studio hero showcase with editorial typography and founding manifesto.
  - **Z-Pattern Narrative**: The origin story of building software for Bangladesh's specific payment and logistics friction.
  - **3-Column Principles Bento Grid**: Zero-Bloat Performance, Offline-Resilient Architecture, and Merchant-First Economics.
  - **Team Leadership Grid**: Clean portraits with social handles and engineering roles.
- **Motion, Animations & Transitions**:
  - *Studio Image Reveal*: `skiper-ui.com` image reveal with smooth curtain wipe on viewport scroll.
  - *Reading Rhythm*: `animmasterlab.dev` smooth scroll dampening and subtle pull quote fade-ins.
  - *Typographic Manifesto*: `text-effects.colorion.co` `fx-inktrap` on the studio manifesto heading ("Built in Dhaka, for the World of Commerce").
  - *Section Dividers*: `ripplix.com` gentle horizontal wave divider between story chapters.
- **Iconography Systems & Micro-Interactions**:
  - *Principles Vectors*: `lordicons.com` animated compass, rocket, coffee cup, and code bracket icons.
  - *Studio Socials*: `iconsax.io` linear GitHub, X, LinkedIn, and email glyphs.
  - *Photo Hovers*: `itshover.com` smooth subtle scale (`scale-105 transition-transform duration-500`) on team portrait cards.
- **Image Placeholders & AI Generation Prompts**:
  1. **Dhaka Engineering Studio Interior**:
     - *Alt Prompt*: `"Prompt: A candid modern software engineering studio in Gulshan Dhaka, diverse Bangladeshi developers collaborating over dual monitors showing code and architecture diagrams, warm ambient indoor lighting, exposed brick walls, indoor plants, premium design agency atmosphere, 8k resolution, aspect ratio 16:9."`
  2. **Founders Whiteboard Strategy**:
     - *Alt Prompt*: `"Prompt: Two software architects in casual attire sketching an event-driven commerce architecture on a large glass whiteboard in a sunlit Dhaka office, authentic work setting, 50mm lens f/2.0, natural daylight, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-local`, `seo-maps`, `seo-content`, `seo-schema`.
  - *Target Keywords*: `framique founders dhaka`, `software company gulshan dhaka`, `ecommerce technology bangladesh`.
  - *Meta Title*: `About Our Dhaka Studio & Mission | Framique`
  - *Meta Description*: `Meet the team building Framique in Dhaka. Discover our mission to empower Bangladeshi merchants with world-class, zero-commission commerce software.`

---

### 4.9 Developer Documentation & API Reference (`/docs`)
- **Design Read & Subject Thesis**:
  - *Reading*: Precision developer hub with zero fluff, rapid copy-paste, and interactive exploration.
  - *Dials*: `VARIANCE: 4` | `MOTION: 2` | `DENSITY: 7`
  - *Thesis*: Production-ready REST and Webhook APIs for building custom storefronts, ERP connectors, and logistics pipelines.
- **Layout & Flex/Grid Architecture**:
  - **2-Column Technical Layout**: Sticky collapsible sidebar navigation with quickstart search and active section highlighting.
  - **Interactive Search Pill**: `⌘K` command dialog trigger with instant fuzzy matching across endpoints.
  - **Container-Free Code Blocks**: Tabbed language selectors (cURL, TypeScript, Python, PHP) with instant syntax highlighting.
  - **Mobile Endpoint Cards**: Responsive card layout on mobile viewports with prominent HTTP method badges (`min-h-[44px]`).
- **Motion, Animations & Transitions**:
  - *Interactive Code Tabs*: `originkit.dev` unstyled code blocks with instant tab switching and copy feedback.
  - *Spotlight Search*: `skiper-ui.com` "Devouring Details" keyboard-accessible search modal.
  - *Terminal Intro*: `text-effects.colorion.co` `fx-typewriter` on terminal intro prompt.
  - *Endpoint Accordions*: `animate-ui.com` smooth CSS height animations for nested endpoint parameters.
- **Iconography Systems & Micro-Interactions**:
  - *HTTP Method Badges*: `potlabicons.com` distinct colored badges for GET (emerald), POST (blue), PUT (amber), and DELETE (rose).
  - *Documentation Nav*: `lucide-animated.com` animated book, terminal, webhook, and key icons.
  - *Copy Buttons*: `itshover.com` clipboard icon morphing into checkmark on click.
- **Image Placeholders & AI Generation Prompts**:
  1. **Developer API Ecosystem Visual**:
     - *Alt Prompt*: `"Prompt: Conceptual 3D visualization of REST API endpoints and Webhook payload packets seamlessly flowing into an e-commerce database, glowing neon accents on slate dark background, clean isometric perspective, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-technical`, `seo-sitemap`, `seo-page`, `seo-internal-links`.
  - *Target Keywords*: `framique api docs`, `bangladesh ecommerce rest api`, `bkash webhook integration guide`.
  - *Meta Title*: `Developer Documentation & API Reference | Framique`
  - *Meta Description*: `Integrate Framique into your tech stack. Complete API reference, Webhook documentation, SDKs, and code examples for building custom commerce in Bangladesh.`

---

### 4.10 Merchant Blog & Knowledge Hub (`/blog`)
- **Design Read & Subject Thesis**:
  - *Reading*: Authoritative merchant publication addressing trade licenses, courier contracts, MFS reconciliation, and conversion.
  - *Dials*: `VARIANCE: 7` | `MOTION: 3` | `DENSITY: 4`
  - *Thesis*: The definitive playbook for operating high-margin digital commerce in Bangladesh.
- **Layout & Flex/Grid Architecture**:
  - **Editorial Magazine Layout**: Sticky top reading progress bar, hero featured article with high-contrast display typography.
  - **3-Column Asymmetric Grid**: Latest articles with reading time badges, topic pills, and author avatars.
  - **Sticky Category Filter Bar**: Logistics, Taxes, MFS Chargebacks, Conversion (`min-h-[44px]`).
  - **Editorial Article Pages**: Drop caps, styled pull quotes, inline callout alerts, and scannable table of contents.
- **Motion, Animations & Transitions**:
  - *Reading Progress Bar*: `gsap-scrolltrigger` scrubbed top progress bar reflecting scroll percentage.
  - *Article Card Hover*: `skiper-ui.com` image cursor trail with gentle scale (`scale-102 transition-transform duration-300`).
  - *Key Takeaway Marker*: `text-effects.colorion.co` `fx-marker` subtle animated highlighter across key takeaway quotes.
  - *Topic Switching*: `swishy.ai` smooth content fade when switching categories.
- **Iconography Systems & Micro-Interactions**:
  - *Reading Metadata*: `iconsax.io` linear clock, tag, calendar, and bookmark glyphs.
  - *Share Actions*: `Icons8` WhatsApp, Facebook, LinkedIn, and copy-link vectors.
  - *Search Controls*: `lucide-animated.com` animated search magnifying glass.
- **Image Placeholders & AI Generation Prompts**:
  1. **Editorial Lead Graphic**:
     - *Alt Prompt*: `"Prompt: Sophisticated 3D editorial illustration of a financial ledger book open beside a smartphone showing digital bKash Taka transfers, surrounded by miniature shipping boxes and courier receipts, warm studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-cluster`, `seo-content`, `seo-bing`, `seo-rank-tracker`.
  - *Target Keywords*: `how to start online business bangladesh`, `pathao delivery charges dhaka guide`, `ecommerce trade license bangladesh`.
  - *Meta Title*: `Merchant Guides & Commerce Insights | Framique Blog`
  - *Meta Description*: `Practical guides, courier rate comparisons, and e-commerce growth playbooks written specifically for online business owners in Bangladesh.`

---

### 4.11 Contact & Enterprise Inquiries (`/contact`)
- **Design Read & Subject Thesis**:
  - *Reading*: Direct human connection with our Dhaka product team, zero ticket queues.
  - *Dials*: `VARIANCE: 6` | `MOTION: 4` | `DENSITY: 4`
  - *Thesis*: Direct line to our Gulshan engineering and merchant support team with real-time response time indicators.
- **Layout & Flex/Grid Architecture**:
  - **Split Screen Hero**: Left: direct contact channels, Dhaka studio coordinates, WhatsApp concierge button; Right: interactive lead capture form with instant inline field validation.
  - **3-Column Department Grid**: Dedicated routes for Merchant Onboarding, API Integration, and Enterprise Customization.
  - **Touch-First Form Controls**: All inputs and buttons enforce `min-h-[44px]` with clear focus rings.
- **Motion, Animations & Transitions**:
  - *Form Physics*: `animmasterlab.dev` spring dampening on field focus and validation checkmarks.
  - *3D Studio Pin*: `spline.design` lightweight interactive 3D map pin hovering over Dhaka Gulshan-1 coordinates.
  - *Atmospheric Glow*: `shadergradient.co` ambient warm blush canvas aura (`#FFF1F3`).
  - *Headline Glow*: `text-effects.colorion.co` `fx-spotlight` across contact headline.
- **Iconography Systems & Micro-Interactions**:
  - *Contact Channels*: `Icons8` WhatsApp Business, telephone, email, and Dhaka map pin vectors.
  - *Form Submission*: `potlabicons.com` animated spinning loader transitioning into a success checkmark.
  - *Social Links*: `iconsax.io` linear social icons.
- **Image Placeholders & AI Generation Prompts**:
  1. **Gulshan Concierge Studio**:
     - *Alt Prompt*: `"Prompt: Warm welcoming entrance of a tech studio office in Gulshan 1 Dhaka, wooden reception desk with Framique logo, modern brass pendant lighting, lush indoor fiddle-leaf fig plants, shot on Leica Q3, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-local`, `seo-geo`, `seo-maps`, `seo-schema`.
  - *Target Keywords*: `framique contact dhaka`, `ecommerce software support bangladesh`, `framique office gulshan`.
  - *Meta Title*: `Contact Our Dhaka Team | Framique Bangladesh`
  - *Meta Description*: `Get in touch with Framique's engineering and merchant onboarding team in Gulshan, Dhaka. Direct WhatsApp, phone, and enterprise support.`

---

### 4.12 System Status & Merchant FAQ (`/status` & `/faq`)
- **Design Read & Subject Thesis**:
  - *Reading*: Uncompromising operational transparency and instant self-serve answers.
  - *Dials*: `VARIANCE: 5` | `MOTION: 3` | `DENSITY: 5`
  - *Thesis*: Real-time service telemetry showing 99.99% system availability across API, checkout, webhook listener, and courier dispatch.
- **Layout & Flex/Grid Architecture**:
  - **Centered Operational Beacon**: Real-time operational beacon with 90-day historical uptime bars.
  - **4-Column Service Telemetry Grid**: Storefront Edge CDN, Checkout Engine, MFS Webhooks, and Courier Dispatch APIs.
  - **Searchable Accordion FAQ**: Instant search filter with smooth single-column mobile collapse.
- **Motion, Animations & Transitions**:
  - *Status Beacon*: `animate-ui.com` pulsing status dot with pinging radial ring.
  - *Accordion Flow*: `originkit.dev` smooth accordion expansion without layout jump.
  - *Latency Ticker*: `text-effects.colorion.co` `fx-ticker` on live latency milliseconds (e.g. `24ms Dhaka edge`).
  - *Uptime Bar Tooltips*: `skiper-ui.com` "Vercel Tooltip" revealing exact date and 100% uptime confirmation.
- **Iconography Systems & Micro-Interactions**:
  - *Health Indicators*: `potlabicons.com` animated green check, amber maintenance, and red incident icons.
  - *FAQ Toggles*: `lucide-animated.com` chevron-down smoothly rotating 180deg to chevron-up on toggle.
  - *Service Hardware*: `iconsax.io` linear server, cloud, database, and shield icons.
- **Image Placeholders & AI Generation Prompts**:
  1. **High-Availability Distributed Infrastructure**:
     - *Alt Prompt*: `"Prompt: 3D render of redundant distributed server clusters spanning Dhaka and Singapore data centers, glowing emerald green status nodes connected by optical fiber lines, dark glass aesthetic, studio lighting, 8k resolution, aspect ratio 16:9."`
- **SEO & Semrush Discipline**:
  - *Disciplines*: `seo-schema` (`FAQPage`), `seo-technical`, `seo-sxo`.
  - *Target Keywords*: `framique system status`, `framique uptime live`, `frequently asked questions ecommerce bangladesh`.
  - *Meta Title*: `System Status & Merchant FAQ | Framique`
  - *Meta Description*: `Check real-time Framique service availability, API latency, payment rail status, and find answers to common questions about selling online in Bangladesh.`

---

## 5. Actionable Implementation Checklist

### Phase 1: Responsive Hero Section Overhaul across All Public Pages
- [x] Update [`HeroBand.tsx`](file:///Users/rahman/Documents/frame28/src/components/public/bands/HeroBand.tsx) with a responsive desktop floor: `min-h-[80vh] lg:min-h-[720px]` with flex/grid centering.
- [x] Fix Tablet (`768px – 1023px`) layout: transition to balanced 50/50 Split Screen or centered visual with proportional scaling instead of abrupt 1-column drop.
- [x] Fix Mobile (`< 640px`) layout: adjust padding to `pt-16 pb-12`, tighten Bengali display typography to `clamp(1.75rem, 6vw, 2.5rem)`, ensure primary action button is above the fold with `w-full min-h-[44px]`.
- [x] Replace all raw images with prompt-driven AI placeholders (`alt="Prompt: ..."`).

### Phase 2: Complete Layout Pattern Restructuring (Flex & Grid)
- [x] Implement **Bento Grids** on `/` (Home), `/features`, and `/pricing` with varying row/col spans.
- [x] Implement **Split-Screen** on `/pricing` (COD vs Digital rail) and `/payments` (Simulator vs P&L).
- [x] Implement **Z-Pattern** narrative flows on `/about` and `/fulfilment`.
- [x] Implement **Magazine Layout** on `/blog` and `/docs` with sticky TOC and scannable outlines.
- [x] Verify 100% of interactive buttons have mobile full width (`w-full sm:w-auto min-h-[44px]`).

### Phase 3: Page-by-Page Motion & Iconography Integration
- [x] Integrate designated motion tools (`shadergradient.co`, `spline.design`, `skiper-ui.com`, `text-effects.colorion.co`, `animmasterlab.dev`, `rive.app`, `originkit.dev`, `vengenceui.com`, `swishy.ai`, `LottieFiles`, `ripplix.com`, `motionsites.ai`) per page specification in Section 4.
- [x] Integrate designated icon systems (`lordicons.com`, `Icons8`, `itshover.com`, `lucide-animated.com`, `potlabicons.com`, `animate-ui.com`, `iconsax.io`) per page specification in Section 4.
- [x] Maintain single signal accent per screen (`--fq-signal` / `#1360D4` 5.2:1 contrast) with warm blush underglow (`#FAF6F7` with `#FFF1F3`).

### Phase 4: Contrast & Eye-Soothing Calibration
- [x] Replace any leftover stark `#FFFFFF` canvas floors with the warm blush / calm pink canvas token (`#FAF6F7` with `#FFF1F3` ambient glows).
- [x] Ensure all text contrast hits the 7:1–12:1 eye-soothing sweet spot (WCAG AAA for deep slate ink `#0F172A`).
- [x] Verify zero faux OS window chrome or fake browser dots across all public pages.

### Phase 5: Full 42 SEO Disciplines & Semrush Integration
- [x] Configure Semrush API integration with key `semrtkn-pat-HS2Xf0KFSqmTFHX54b57ZQ-XN9oQNgl5SPraldanWrPdNz1P-qKFlYd`.
- [x] Run full automated SEO crawl audit via `scripts/design-gate.mjs` and contract test suite.
- [x] Validate single H1 outline, meta title (<60 chars), and meta description (<155 chars) on all routes.
- [x] Validate bidirectional hreflang (`en-BD`, `bn-BD`) and complete JSON-LD schemas (`Organization`, `SoftwareApplication`, `FAQPage`, `BreadcrumbList`).

### Phase 6: Verification & Quality Gates
- [x] Run `bun scripts/design-gate.mjs --skip-browser` (must pass with 0 blocking findings).
- [x] Run `bun test src/lib/marketing-seo.contract.test.ts src/lib/design-exit.test.ts src/lib/site-rhythm.test.ts src/lib/copy-quality.contract.test.ts src/lib/phase6-responsive.test.ts`.
- [x] Run `bun run build` to verify clean compilation.

