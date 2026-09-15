# FRAMIQUE: Technical On-Page SEO & Structured Data (JSON-LD) Blueprint

> **Standards:** Google Search Central, Schema.org Community Group, Koray Tuğberk Gübür Semantic SEO Framework  
> **Target Scope:** All marketing routes (`/`, `/features`, `/pricing`, `/about`, `/compare/*`) and tenant storefronts (`/store/$slug/*`)  
> **Key Objective:** 100% Rich Result Eligibility in Google Search, AI Overviews, and Knowledge Graph Entity Canonicalization  

---

## 1. Semantic Document Tree & Heading Hierarchy

Google's semantic parsing algorithms and natural language processing models (such as RankBrain, MUM, and Gemini-powered Search) read the DOM tree as an interconnected graph. Skipping heading levels (e.g., `H1` jumping directly to `H3`) breaks the topical parent-child relation.

```
┌────────────────────────────────────────────────────────┐
│ <header> & <nav>: Brand Identity & Primary Navigation  │
├────────────────────────────────────────────────────────┤
│ <main>: Primary Document Scope                         │
│   ├── <h1>: Central Entity & Primary Proposition       │
│   │                                                    │
│   ├── <section>: Core Entity 1                         │
│   │     ├── <h2>: Primary Topical Subheading           │
│   │     └── <h3>: Specific Feature / Attribute         │
│   │                                                    │
│   ├── <section>: Core Entity 2                         │
│   │     ├── <h2>: Primary Topical Subheading           │
│   │     └── <h3>: Specific Feature / Attribute         │
│   │                                                    │
│   └── <section>: PAA & Semantic FAQ                    │
│         ├── <h2>: Frequently Asked Questions           │
│         └── <h3>: Individual Question Query            │
├────────────────────────────────────────────────────────┤
│ <footer>: Corporate Entity, Legal Links & Secondary Nav│
└────────────────────────────────────────────────────────┘
```

### 1.1 Strict On-Page Heading Rules
1. **Single `H1` Per Route:** Every indexable URL must feature exactly one `<h1>` containing the primary entity and core value proposition.
2. **Predictable Tree Traversal:** `H2` defines the macro section; `H3` defines supporting micro-attributes. Never place an `H3` outside of an `H2` container.
3. **No Fluff In Headings:** Avoid vague headings like "Why Choose Us", "Features", or "Get Started".  
   *Bad:* `<h2>Features</h2>`  
   *Good:* `<h2>Visual E-Commerce Builder with Framer-Grade Design Freedom</h2>`  
   *Bad:* `<h2>Pricing</h2>`  
   *Good:* `<h2>Zero Platform Transaction Fees: Transparent Monthly Plans</h2>`

---

## 2. Master JSON-LD Schema Implementations

To ensure Google's knowledge graph accurately identifies Framique as a high-authority software platform, the following schemas are embedded via `<script type="application/ld+json">`.

### 2.1 SoftwareApplication & WebApplication Schema (Core Platform)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://framique.com/#software",
  "name": "FRAMIQUE",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "All (Cloud SaaS)",
  "softwareVersion": "2.4.0",
  "url": "https://framique.com",
  "description": "Next-generation cloud e-commerce CMS and visual storefront builder with 0% platform transaction fees, native bKash/Nagad checkout, and automated courier fulfillment.",
  "offers": {
    "@type": "AggregateOffer",
    "priceCurrency": "USD",
    "lowPrice": "0",
    "highPrice": "99",
    "offerCount": "3"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.9",
    "reviewCount": "148",
    "bestRating": "5",
    "worstRating": "1"
  },
  "featureList": [
    "Framer-Grade Visual Page Builder with Bento Grids",
    "Zero Percent (0%) Platform Transaction Fees",
    "Native Tokenized bKash and Nagad Checkout Integration",
    "Automated One-Click Courier Dispatch via Steadfast and Pathao",
    "Sub-50ms Global Edge Server-Side Rendering (TanStack Start)",
    "PostgreSQL Multi-Tenant Row-Level Security",
    "Automated Custom Domain Routing and ACME SSL Provisioning"
  ],
  "creator": {
    "@type": "Organization",
    "@id": "https://framique.com/#organization",
    "name": "FRAMIQUE Technologies",
    "url": "https://framique.com",
    "logo": "https://framique.com/assets/framique-logo.svg"
  }
}
```

---

### 2.2 Organization & Corporate Knowledge Graph Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://framique.com/#organization",
  "name": "FRAMIQUE",
  "legalName": "FRAMIQUE Technologies Inc.",
  "url": "https://framique.com",
  "logo": {
    "@type": "ImageObject",
    "url": "https://framique.com/assets/framique-logo.png",
    "width": "512",
    "height": "512"
  },
  "sameAs": [
    "https://github.com/devrahmanbd/frame28",
    "https://twitter.com/framique_cms",
    "https://linkedin.com/company/framique"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer support",
    "availableLanguage": ["English", "Bengali"]
  }
}
```

---

### 2.3 FAQPage Schema (For SERP Snippet & AI Overview Domination)

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How does Framique compare to Shopify for local merchants?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Unlike Shopify, which charges between $39 and $399 per month plus an extra 2.0% transaction fee on third-party payment gateways, FRAMIQUE charges 0% platform transaction fees and includes native tokenized bKash and Nagad checkouts, automated courier dispatch (Steadfast, Pathao), and sub-50ms edge rendering."
      }
    },
    {
      "@type": "Question",
      "name": "Can I build an e-commerce website using Framer?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Framer is an outstanding visual design tool, but it lacks a native e-commerce transactional backend, dynamic inventory variants, and automated logistics. Framer requires third-party checkout widgets. FRAMIQUE provides Framer-level visual design freedom combined with a complete native relational e-commerce backend."
      }
    },
    {
      "@type": "Question",
      "name": "Does Framique charge transaction fees on sales?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. FRAMIQUE charges 0% platform transaction fees. Merchants connect their own merchant credentials (bKash, Nagad, SSLCommerz, Stripe) directly to their store, retaining 100% of their gross processing value."
      }
    },
    {
      "@type": "Question",
      "name": "How does automated courier dispatch work on Framique?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "FRAMIQUE features direct API integrations with regional couriers like Steadfast, Pathao, and RedX. With one click from the admin dashboard, parcel details are transmitted to the courier, generating consignment tracking numbers and printable shipping labels instantly."
      }
    }
  ]
}
```

---

### 2.4 BreadcrumbList Schema (Hierarchical SERP Navigation)

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://framique.com"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Platform Comparisons",
      "item": "https://framique.com/compare"
    },
    {
      "@type": "ListItem",
      "position": 3,
      "name": "Framique vs Shopify, Webflow & Framer",
      "item": "https://framique.com/compare/shopify-webflow-framer"
    }
  ]
}
```

---

## 3. Contextual Anchor Text Audit Rules

Koray Tuğberk Gübür's on-page SEO doctrine demonstrates that Google computes query relevance by analyzing **anchor text distribution and surrounding sentence vectors**.

| Target Destination URL | Required Contextual Anchor Text | Surrounding Sentence Semantic Vector |
| :--- | :--- | :--- |
| `/compare/shopify` | `Shopify alternative with zero transaction fees` | *"Merchants looking to avoid high monthly fees and gateway penalties should evaluate a [Shopify alternative with zero transaction fees](/compare/shopify)."* |
| `/features/builder` | `visual e-commerce builder with Framer-level design freedom` | *"Design unique storefront layouts without code using our [visual e-commerce builder with Framer-level design freedom](/features/builder)."* |
| `/payments` | `native bKash and Nagad payment gateway integrations` | *"Accept direct mobile payments with [native bKash and Nagad payment gateway integrations](/payments) without third-party app fees."* |
| `/fulfilment` | `automated Steadfast and Pathao courier dispatch` | *"Fulfill customer orders in seconds through [automated Steadfast and Pathao courier dispatch](/fulfilment) directly from your dashboard."* |
| `/pricing` | `transparent zero percent platform fee pricing` | *"Scale your business without paying revenue royalties under our [transparent zero percent platform fee pricing](/pricing)."* |

---

## 4. Technical Core Web Vitals (CWV) & Performance Standards

To maintain top-tier rankings in Google Search, every page on Framique adheres to the following thresholds:

| Core Web Vital Metric | Target Threshold | Implementation Mechanism in Framique |
| :--- | :--- | :--- |
| **TTFB (Time to First Byte)** | **< 80ms** | TanStack Start edge rendering deployed across regional CDN nodes. |
| **LCP (Largest Contentful Paint)**| **< 1.2s** | Preload priority on hero webp/avif assets, inline critical CSS tokens. |
| **INP (Interaction to Next Paint)**| **< 50ms** | Selective asynchronous hydration, zero blocking main-thread loops. |
| **CLS (Cumulative Layout Shift)** | **0.00** | Strict CSS aspect-ratio containment on all image and media containers. |

---

## 5. Metadata, Open Graph & Canonical Tag Rules

Every route dynamically sets self-referencing canonical URLs and Open Graph tags:

```html
<!-- Canonical Link Tag -->
<link rel="canonical" href="https://framique.com/compare/shopify-webflow-framer" />

<!-- Title Tag (50-60 characters, Entity + Keyword) -->
<title>FRAMIQUE vs Shopify vs Webflow vs Framer: 2026 Comparison</title>

<!-- Meta Description (140-155 characters, Actionable Value Proposition) -->
<meta name="description" content="Compare FRAMIQUE, Shopify, Webflow, and Framer. Discover the sovereign cloud e-commerce CMS with 0% fees, native bKash/Nagad checkouts, and edge SSR speed." />

<!-- Open Graph / Twitter Protocol -->
<meta property="og:type" content="article" />
<meta property="og:title" content="FRAMIQUE vs Shopify vs Webflow vs Framer: 2026 Comparison" />
<meta property="og:description" content="Explore why modern brands are choosing FRAMIQUE over Shopify, Webflow, and Framer for design freedom and zero platform fees." />
<meta property="og:url" content="https://framique.com/compare/shopify-webflow-framer" />
<meta property="og:image" content="https://framique.com/assets/og-framique-vs-shopify.png" />
<meta name="twitter:card" content="summary_large_image" />
```
