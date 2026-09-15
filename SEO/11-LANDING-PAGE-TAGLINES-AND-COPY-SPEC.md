# Landing Page Taglines & Copywriting Optimization Spec

**Target Surfaces:**
- Homepage (`/`)
- Pricing (`/pricing`)
- Features (`/features`)
- FAQ (`/faq`)
- Comparisons (`/compare/*`)

**Methodology & Standards:**
- Anti-AI-Slop voice guidelines from `hallmark` and `taste-skill`.
- Authentic merchant hooks distilled from high-performing Reddit communities (`r/ecommerce`, `r/shopify`, `r/webflow`, `r/framer`).
- Koray Tuğberk Gübür Micro/Macro Contextual coherence: eliminating generic filler words (*"seamless"*, *"intuitive"*, *"streamlined"*, *"game-changing"*).
- Contrast ratio floor ($\ge 4.5:1$ WCAG AA) with high-legibility typography and zero layout shift (CLS 0).

---

## 1. Homepage (`/`)

### Current AI Tells vs Optimized Human Register
- *Generic AI Tell:* "The ultimate all-in-one platform to revolutionize your online store and supercharge sales."
- *Optimized Register:* "Design freely. Keep 100% of your revenue. The zero-fee visual commerce engine."

### Layout-Preserving Copy Injection Spec:
- **Eyebrow Badge:** `ZERO-FEE SOVEREIGN COMMERCE & VISUAL CMS`
- **Hero H1:** `Design freely. Keep 100% of your revenue.`
- **Hero Subtitle:** `FRAMIQUE replaces Shopify's 2% penalty fees and $400/mo app subscriptions with a freeform visual canvas, uncapped PostgreSQL CMS, and native local payment rails.`
- **Primary CTA:** `Start Free Storefront`
- **Secondary CTA:** `Calculate Your Fee Savings`
- **Social Proof Metric Bar:**
  - `0.00%` Platform Transaction Fees
  - `< 300ms` Edge Server-Side Rendering (LCP)
  - `bKash + Nagad + Stripe` Native Tokenized Checkout
  - `∞ Unlimited` Dynamic CMS Products (No 2k Cap)

---

## 2. Pricing Page (`/pricing`)

### Layout-Preserving Copy Injection Spec:
- **Eyebrow Badge:** `TRANSPARENT VALUE • ZERO TRANSACTION PENALTIES`
- **Hero H1:** `Simple, honest pricing. Never pay a percentage of your sales.`
- **Hero Subtitle:** `Unlike Shopify, we believe your gross revenue belongs to you. No hidden gateway penalties, no forced payment monopolies, and no mandatory app subscriptions.`
- **Plan 1 (Starter — $0/mo forever):**
  - *Headline:* For emerging creators and boutique makers.
  - *Features:* Freeform visual builder, 0% platform transaction fees, up to 100 products, standard SSL.
- **Plan 2 (Pro Merchant — $29/mo):**
  - *Headline:* For scaling DTC brands and regional merchants.
  - *Features:* Unlimited dynamic CMS products, native bKash/Nagad and Stripe checkout, automated courier dispatch, sub-300ms edge SSR.
- **Plan 3 (Agency & Enterprise — $99/mo):**
  - *Headline:* For design studios and high-volume multi-store operators.
  - *Features:* White-label client handoffs, multi-store governance, custom domain SSL automation, dedicated headless API.

---

## 3. Features Page (`/features`)

### Layout-Preserving Copy Injection Spec:
- **Eyebrow Badge:** `ENGINEERING EXCELLENCE • ZERO JANK`
- **Hero H1:** `Built for visual perfection and transactional speed.`
- **Hero Subtitle:** `Every feature is engineered natively into the core runtime. No third-party plugins to update, no daisy-chained scripts to slow down mobile checkout.`

#### 4 Core Feature Blocks:
1. **Freeform Visual Canvas:**
   - *Title:* Pixel-Level Freedom Without Liquid Template Constraints
   - *Body:* Position elements anywhere on a responsive visual grid. Create animated bento grids, sticky cart drawers, and custom product layouts without writing custom theme code.
2. **0% Transaction Fee Commerce Core:**
   - *Title:* Keep Every Cent of Your Hard-Earned Gross Margin
   - *Body:* Connect your own Stripe, PayPal, or regional merchant account. FRAMIQUE never charges a 0.5%–2% cut on your sales.
3. **Native Regional Payment Rails:**
   - *Title:* Direct bKash & Nagad Tokenized Checkout
   - *Body:* End the nightmare of manual screenshot verification and fake orders. Customers authorize mobile payments directly in checkout, while automated APIs generate courier tracking labels instantly.
4. **Sub-300ms Edge Performance:**
   - *Title:* 100% Green Core Web Vitals Out of the Box
   - *Body:* Powered by Bun and React 19 server-side rendering, your store delivers pre-rendered HTML in under 300ms, eliminating layout shift and cutting mobile bounce rates.

---

## 4. Frequently Asked Questions (`/faq`)

*Rendered using semantic HTML5 `<details>` and `<summary>` tags with zero deprecated `FAQPage` schema.*

### FAQ 1: How does Framique charge 0% transaction fees?
> "Most commerce platforms charge a 0.5% to 2.0% penalty when you process transactions through independent payment gateways. FRAMIQUE operates on a predictable SaaS subscription model. We make money when you subscribe to our pro platform tiers, not by skimming a percentage of your customer transactions. You keep 100% of your revenue minus standard bank interchange fees."

### FAQ 2: How does Framique's CMS compare to Webflow's 2,000 item limit?
> "Webflow restricts standard CMS collections to 2,000 items due to its client-side data binding architecture. FRAMIQUE is built on a scalable PostgreSQL relational database with multi-tenant row-level security. You can host 100,000+ products, blog articles, and dynamic variants with zero performance degradation or forced enterprise upgrades."

### FAQ 3: Can I use Framer designs with Framique?
> "Yes. FRAMIQUE provides a freeform visual canvas that shares the intuitive spatial freedom of Figma and Framer, but with a full e-commerce backend built directly underneath. You get the aesthetic precision of a design tool with native inventory deduction, customer accounts, and localized checkout."

### FAQ 4: How are local payment gateways like bKash and Nagad integrated?
> "FRAMIQUE features native, direct tokenized API integrations with bKash, Nagad, and regional banks. Customers complete authentication inside your checkout flow via secure OTP. When the payment is verified, FRAMIQUE automatically marks the order as paid and triggers courier API fulfillment without manual reconciliation."

### FAQ 5: What are the Core Web Vitals guarantees?
> "Because FRAMIQUE renders pages on edge servers using Bun and React 19 rather than loading dozens of client-side tracking apps, stores achieve an average Largest Contentful Paint (LCP) under 300ms, zero Cumulative Layout Shift (CLS 0.00), and an Interaction to Next Paint (INP) under 40ms."
