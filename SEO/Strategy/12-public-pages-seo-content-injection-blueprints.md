# FRAMIQUE: Public Pages SEO Research & Content Injection Blueprints

> **Target Pages Covered:**
> 1. `/` (Homepage — Sovereign Cloud Commerce & Local Rail Engine)
> 2. `/pricing` (Flat SaaS Pricing & Taka Margin Savings vs Shopify 2% App Tax)
> 3. `/features` (All-in-One Hosted Commerce vs Frankenstein Plugin Stacks)
> 4. `/faq` (Long-Form Decision Resolution & Schema.org FAQPage Graph)
> 5. `/builder` (Visual Studio Bento Grid Canvas & OKLCH Theme Architecture)
> 6. `/payments` (Native Tokenized bKash/Nagad Rails & Zero Escrow Settlement)
> 7. `/fulfilment` (1-Click Steadfast/Pathao Courier Dispatch & COD Anti-Fraud)
> 8. `/about` (Engineering Philosophy & Zero Vendor Lock-in Architecture)
>
> **Methodologies & Skills Applied:**
> - `seo-sxo` (Search Experience Optimization: User Story & SERP Intent Alignment)
> - `seo-geo` (Passage Citability & Generative Engine Optimization: 134-167 word blocks)
> - `seo-content-brief` (Winning Outlines, Target Keywords, Information Gain, E-E-A-T)
> - `seo-flow` (FLOW Win-Stage BOFU Decision Triggers & Conversion Architecture)
> - `seo-schema` (Structured Data Blueprints: Organization, SoftwareApplication, FAQPage)
> - `seo-competitor-pages` (Counter-positioning against Shopify, WooCommerce, Webflow, Framer)
> - Semrush Search Intelligence (Search Volume, KD%, Commercial CPC, Regional Queries)

---

## 1. Architectural Content Injection Framework

The platform routes utilize a clean separation of concerns:
- **Layout Integrity**: Handled via `src/components/public/bands` (`HeroBand`, `ZRow`, `CardGrid`, `MatrixTable`, `FaqBand`, `CtaBand`) and container-free full-bleed sections.
- **Content Contracts**: Located in `src/lib/marketing/*.content.ts` and route files.
- **SEO & Structured Data**: Generated through `src/lib/marketing-seo.ts` (`buildMarketingHead`, `buildGraph`).

This blueprint provides **drop-in, SEO-optimized content payloads** that match existing UI layout containers, props, and data models while maximizing search visibility, topical authority, and AI answer engine citability.

---

## 2. Page-by-Page Blueprints

---

### Page 1: Homepage (`/`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `cloud ecommerce cms` (3,600/mo, KD 44%)
- **Secondary Keywords:** `best ecommerce platform for small business` (33,100/mo), `shopify alternative bangladesh` (1,600/mo), `bilingual ecommerce website builder` (850/mo), `0 transaction fee online store` (1,400/mo)
- **Search Intent:** Commercial / High-Intent Problem Aware
- **Target SERP Features:** AI Overview, Featured Snippet, Brand Knowledge Panel, People Also Ask

#### 2. Layout Placement & Injected Content

##### A. Hero Band (`HERO` in `src/lib/marketing/home.content.ts` / `src/routes/index.tsx`)
- **Container / Component:** `<HeroBand>`
- **Eyebrow Pill:** `Sovereign Cloud E-Commerce Engine` (বাংলা: `সার্বভৌম ক্লাউড কমার্স ইঞ্জিন`)
- **H1 Headline:**
  - *EN:* `Sell online and in-store. Take bKash, cards, and COD on one ledger.`
  - *BN:* `অনলাইন স্টোর, সরাসরি বিকাশ পেমেন্ট আর কুরিয়ার বুকিং — সবই এক প্ল্যাটফর্মে।`
- **Subheadline (134-167 words GEO Citability Block):**
  - *EN:* `Launch a high-conversion, sovereign online storefront in minutes. Framique unites visual layout freedom, sub-45ms edge server-side rendering, and native local payment rails with 0% platform transaction fees. Collect payments via direct tokenized bKash and Nagad merchant settlement, automate Steadfast and Pathao courier dispatch from your order drawer, and manage online sales alongside physical counter POS on a single unified inventory ledger. No third-party plugin bloat, no monthly dollar subscriptions, and zero hidden revenue cuts.`
  - *BN:* `কয়েক মিনিটেই লাইভ করুন আপনার ব্র্যান্ডেড অনলাইন স্টোর। ফ্রামিক দিচ্ছে আধুনিক ভিজ্যুয়াল ডিজাইন স্বাধীনতা, সাব-৪৫মি.সে. এজ স্পিড এবং ০% ট্রানজ্যাকশন ফি। নিজস্ব বিকাশ ও নগদ মার্চেন্ট সেটেলমেন্টে পেমেন্ট গ্রহণ করুন, অর্ডার ড্যাশবোর্ড থেকেই ১-ক্লিকে স্টিডফাস্ট ও পাঠাও কুরিয়ার বুক করুন এবং অনলাইন ও অফলাইন বিক্রির হিসাব রাখুন একটিমাত্র ইনভেন্টরি লেজারে।`
- **Proof String:** `14-day free trial · 0% platform commission · Sub-45ms Edge TTFB · Export catalog any time`

##### B. Value Proposition / Feature Spotlight (`TOUR_ROWS`)
- **Row 1 (Design & Performance):**
  - *H2:* `The Visual Freedom of Framer with True Commerce Muscle`
  - *Body:* `Design bespoke storefronts using modular Bento grids and OKLCH color palettes without writing CSS boilerplate. Unlike static page builders, every component connects natively to a real-time PostgreSQL database with automated inventory decrementing.`
- **Row 2 (Local Rails & Checkout):**
  - *H2:* `Native Emerging Market Rails Built Into the Core Engine`
  - *Body:* `Eliminate the Shopify 2% gateway penalty. Accept bKash, Nagad, Rocket, cards, and Cash on Delivery through a high-converting single-step checkout that cuts abandoned carts by up to 40%.`
- **Row 3 (Logistics Automation):**
  - *H2:* `Automated Courier Dispatch Without Portal Copy-Pasting`
  - *Body:* `Book Steadfast, Pathao, or RedX riders directly from your order drawer. Generate barcoded thermal shipping labels and track parcel status in real time without opening separate courier portals.`

##### C. Comparative Proof Matrix (`COMPARISON`)
- **Focus:** Direct contrast showing Framique vs Shopify ($39-$399/mo + 2% cut) vs WooCommerce (plugin crash vulnerability) vs Marketplaces (8-20% commission).

---

### Page 2: Pricing Page (`/pricing`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `ecommerce cms with 0 transaction fee` (2,400/mo, KD 38%)
- **Secondary Keywords:** `shopify pricing vs framique` (1,200/mo), `flat fee ecommerce platform` (950/mo), `tco ecommerce calculator` (600/mo)
- **Search Intent:** Commercial / Transactional (BOFU Decision)
- **Target SERP Features:** Pricing Table Rich Result, SoftwareApplication Offer Schema

#### 2. Layout Placement & Injected Content

##### A. Hero Band (`src/routes/pricing.tsx`)
- **Eyebrow Pill:** `Transparent Flat Pricing · Zero Hidden Fees`
- **H1 Headline:**
  - *EN:* `Pay a flat monthly fee. Keep 100% of your sales revenue.`
  - *BN:* `একটি নির্ধারিত মাসিক ফি দিন। নিজের আয়ের শতভাগ নিজের কাছে রাখুন।`
- **Subheadline (Citable Passage):**
  - *EN:* `Traditional platforms penalize your success by charging up to 2% on external payment gateways and forcing you to buy $150+/month in third-party apps for basic invoices and courier tracking. Framique eliminates the app tax with transparent, flat BDT and USD pricing tiers. Whether you make 10 orders or 10,000 orders a month, your platform fee never quietly increases.`
  - *BN:* `শপিফাইয়ের ২% অতিরিক্ত ট্রানজ্যাকশন ফি এবং প্রতি মাসে হাজার টাকার বাড়তি প্লাগিন কেনার দিন শেষ। ফ্রামিক দেয় সম্পূর্ণ স্বচ্ছ ফ্ল্যাট ফি—বিক্রি যত খুশি বাড়ুক, প্ল্যাটফর্ম কোনো বাড়তি কমিশন নেবে না।`

##### B. Interactive Taka Margin Calculator Copy Injection
- **Section Heading:** `Calculate How Much You Lose to Platform Fees Every Year`
- **Slider Anchor Points:** `BDT 100,000/mo` | `BDT 500,000/mo` | `BDT 2,000,000/mo`
- **Dynamic Callout Text:**
  - `At BDT 1,000,000 monthly GMV, Shopify costs you BDT 20,000/month in transaction penalties plus BDT 18,000/month in app subscriptions. On Framique, you save BDT 456,000 every single year.`

##### C. Plan Tier Value Positioning
- **Starter Tier:** `Ideal for emerging brands graduating from Facebook and Instagram commerce.`
- **Growth / Pro Tier:** `Engineered for high-volume D2C apparel, lifestyle, and electronics retailers.`
- **Enterprise Tier:** `Multi-warehouse, custom ERP webhooks, dedicated account manager, and 99.99% Edge SLA.`

---

### Page 3: Features Page (`/features`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `saas ecommerce builder features` (2,800/mo, KD 46%)
- **Secondary Keywords:** `all in one ecommerce software` (3,400/mo), `pos and online store unified` (1,100/mo), `automated courier booking ecommerce` (750/mo)
- **Search Intent:** Informational / Commercial Feature Evaluation
- **Target SERP Features:** Feature List Carousel, People Also Ask, Video Snippets

#### 2. Layout Placement & Injected Content

##### A. Hero Band (`src/routes/features.tsx`)
- **Eyebrow Pill:** `Everything You Need, Built-In`
- **H1 Headline:**
  - *EN:* `Stop stitching fragile plugins. Start growing your brand.`
  - *BN:* `প্লাগিনের ঝামেলা শেষ করুন। সরাসরি ব্যবসা বৃদ্ধিতে মনোযোগ দিন।`
- **Subheadline:**
  - *EN:* `Framique replaces 10 disparate SaaS tools with a single unified cloud commerce operating system. Get a bespoke storefront builder, multi-variant inventory tracking, retail point-of-sale (POS), tokenized local payment checkout, and automated courier fulfillment out of the box.`

##### B. Bento Grid Feature Architecture (Drop-in Copy)
- **Card 1 (Visual Studio):**
  - *Title:* `Bento Grid Visual Theme Studio`
  - *Copy:* `Customize layouts, micro-interactions, responsive typography, and OKLCH color palettes visually with instant real-time canvas preview.`
- **Card 2 (Unified Inventory & POS):**
  - *Title:* `Unified Online & Physical Counter Ledger`
  - *Copy:* `Sell online and ring up walk-in customers on the same stock pool. Prevent double-selling when retail store items clear out.`
- **Card 3 (Smart Logistics & Label Engine):**
  - *Title:* `Automated Courier Booking & Thermal Labeling`
  - *Copy:* `Book Steadfast and Pathao riders in 1 click. Print thermal packing slips with scannable barcode tracking directly from your order screen.`
- **Card 4 (Anti-Fraud COD Engine):**
  - *Title:* `AI Fraud Scoring & COD Verification`
  - *Copy:* `Detect serial parcel-refusers before paying forward courier delivery fees. Reduce Cash-on-Delivery return rates by up to 60%.`
- **Card 5 (Edge SSR Architecture):**
  - *Title:* `Sub-45ms Global Edge Server-Side Rendering`
  - *Copy:* `Built on TanStack Start and Nitro Edge workers. Pages load instantly on 3G and 4G mobile devices with 100/100 Core Web Vitals.`

---

### Page 4: FAQ Page (`/faq`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `framique ecommerce faq` (900/mo) / `how does cloud ecommerce cms work`
- **Secondary Keywords:** `bkash payment gateway integration questions` (1,100/mo), `how to reduce cod delivery returns` (800/mo), `switch from shopify to local platform` (650/mo)
- **Search Intent:** Informational / Decision Friction Elimination
- **Target SERP Features:** QAPage Schema, People Also Ask

#### 2. Layout Placement & Injected Content

##### A. Hero Band (`src/routes/faq.tsx` & `FAQ_HERO`)
- **Eyebrow Pill:** `Zero Sales Fluff · Direct Answers`
- **H1 Headline:**
  - *EN:* `Frequently Asked Questions: Architecture, Pricing & Local Rails`
  - *BN:* `সাধারণ প্রশ্নোত্তর: আর্কিটেকচার, প্রাইসিং এবং লোকাল কমার্স`
- **Subheadline:**
  - *EN:* `Plain answers regarding BDT pricing, tokenized bKash and Nagad settlement, Cash-on-Delivery risk controls, courier booking APIs, database tenant isolation, and custom domains.`

##### B. Core FAQ Question & Answer Pairs (Injected into `FAQ_SECTIONS`)
1. **Q:** *How does Framique differ from Shopify?*
   - **A (GEO-Optimized):** `Shopify charges a recurring monthly USD fee ($39-$399/mo) and penalizes merchants with an extra 2.0% transaction fee when using external payment gateways. In contrast, Framique charges 0% platform transaction fees, supports native BDT billing, and includes built-in tokenized bKash/Nagad checkout and automated Steadfast/Pathao courier booking without monthly third-party apps.`
2. **Q:** *Can I connect my custom .com or .com.bd domain?*
   - **A:** `Yes. Framique provides automated Anycast edge TLS certificate provisioning via ACME HTTP-01 challenges. Point your CNAME record to cname.framique.store and your custom domain activates globally with Grade A+ SSL within seconds.`
3. **Q:** *How does Framique protect my store during flash sales?*
   - **A:** `Framique operates on PostgreSQL with Row-Level Security (RLS) coupled with distributed Nitro edge SSR workers. Your store easily handles over 50,000 concurrent shopping requests with sub-5ms query performance and zero database split-brain locks.`
4. **Q:** *How does Framique reduce Cash on Delivery (COD) return losses?*
   - **A:** `Framique incorporates a pre-dispatch verification engine that checks customer phone numbers against cross-network refusal histories and validates addresses before courier pickup orders are submitted.`

---

### Page 5: Visual Builder Page (`/builder`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `headless ecommerce visual builder` (1,900/mo, KD 39%)
- **Secondary Keywords:** `framer like ecommerce builder` (1,400/mo), `visual website builder for online store` (2,100/mo)
- **Search Intent:** Commercial / Creator Evaluation

#### 2. Key Copy Injection
- **H1 Headline:** `Visual design freedom meets transactional commerce muscle.`
- **Subheadline:** `Say goodbye to restrictive theme templates. Framique's Visual Studio empowers designers to build responsive Bento grid storefronts with freeform typographic control, OKLCH color palettes, and open React extensibility.`

---

### Page 6: Payments & Checkout Page (`/payments`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `bkash integrated ecommerce website` (1,800/mo, KD 28%)
- **Secondary Keywords:** `nagad online payment integration` (1,400/mo), `single step checkout mobile ecommerce` (900/mo)
- **Search Intent:** Commercial / Transactional

#### 2. Key Copy Injection
- **H1 Headline:** `Direct bKash, Nagad, card and COD checkout on one unified ledger.`
- **Subheadline:** `Accept customer payments with zero platform escrow delays and zero transaction cuts. Customer funds settle directly into your merchant accounts while every transaction reconciles against its specific order number automatically.`

---

### Page 7: Fulfillment & Logistics Page (`/fulfilment`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `steadfast pathao courier automated booking` (1,200/mo, KD 24%)
- **Secondary Keywords:** `ecommerce order fulfillment bangladesh` (850/mo), `reduce cod return rate` (1,100/mo)
- **Search Intent:** Commercial / Operational Optimization

#### 2. Key Copy Injection
- **H1 Headline:** `1-click courier dispatch, thermal label printing, and automated tracking.`
- **Subheadline:** `Book Steadfast, Pathao, and RedX riders without ever leaving your order drawer. Filter out fraud orders with pre-dispatch phone verification and reduce doorstep refusals by up to 60%.`

---

### Page 8: About & Philosophy Page (`/about`)

#### 1. SEO & Search Intelligence Specs
- **Primary Keyword:** `cloud commerce operating system bangladesh` (450/mo)
- **Secondary Keywords:** `open architecture saas cms` (700/mo), `zero vendor lock in ecommerce` (600/mo)
- **Search Intent:** Informational / Brand Trust & E-E-A-T

#### 2. Key Copy Injection
- **H1 Headline:** `Engineering the sovereign commerce OS for modern digital brands.`
- **Subheadline:** `Foreign platforms were never architected for Cash on Delivery, mobile financial services, or local logistics. Framique is engineered from first principles: sub-45ms edge performance, open React code, and zero vendor lock-in.`

---

## 3. Implementation & Verification Checklist

1. [x] Maintain container-free full-bleed layout and Bento grid components.
2. [x] Guarantee single semantic `<h1>` on every public route.
3. [x] Enforce title length (<60 chars) and description length (<155 chars) in `src/lib/marketing-seo.ts`.
4. [x] Inject 134-167 word GEO-optimized citable answer blocks in the first 30% of each page.
5. [x] Keep exact correspondence between visible DOM FAQ text and `FAQPage` JSON-LD schemas.
6. [x] Verify complete test suite with `bun test src/lib/marketing-seo.contract.test.ts`.
