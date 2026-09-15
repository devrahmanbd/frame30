# FRAMIQUE — Modern Schema.org JSON-LD Semantic Architecture

**Document ID:** `FRAMIQUE-SEO-SCHEMA-04`  
**Standards:** Schema.org Core v26+ | Google Search Central Specifications (2026 Updated)  
**Platform Invariant:** SSR-Only Hydration Guard (`typeof window !== "undefined" ? [] : [...]`)  
**Parent Organization:** devrahmanbd (Framique Engineering Council)  
**Date:** September 2026  

---

## 1. Architectural Guardrails & 2026 Schema Compliance

In accordance with Google Search Central's updated guidelines and enterprise structured data principles:
1. **SSR-Only Emission:** All `<script type="application/ld+json">` tags must be rendered exclusively during Server-Side Rendering (SSR). Client hydration must never duplicate or re-inject JSON-LD scripts, preventing duplicate entity nodes and hydration mismatches in Googlebot and Bingbot render trees.
2. **Post-May 2026 Google Schema Deprecations:**
   - **`FAQPage`:** Google completely retired FAQ rich results for all commercial websites on May 7, 2026. Do NOT output `FAQPage` expecting SERP accordion expansions. All on-page Q&A content is rendered via semantic HTML5 `<details>` and `<summary>` elements for optimal user experience and direct crawlability.
   - **`HowTo`:** Deprecated by Google in September 2023. Never generate `HowTo` structured data.
   - **Deprecated Carousels & Badges:** Focus strictly on high-impact entity graphs: `SoftwareApplication`, `Organization`, `WebSite`, `Product`, `TechArticle`, and `BreadcrumbList`.
3. **Deterministic Entity Disambiguation with `@id` URIs:** Every entity is anchored with an immutable `@id` URI (`https://framique.com/#software`, `https://framique.com/#organization`), allowing AI search engines (Perplexity, Gemini, ChatGPT Search) to resolve cross-entity relationships cleanly.

---

## 2. Core Platform Schema: `SoftwareApplication`

*Rendered on the Flagship Homepage (`/`), Product Overview (`/features`), and Architecture pages.*

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": "https://framique.com/#software",
      "name": "FRAMIQUE",
      "alternateName": ["Framique Cloud CMS", "Framique Commerce Engine"],
      "applicationCategory": "BusinessApplication, DesignApplication, CommerceApplication",
      "operatingSystem": "All (Cloud SaaS)",
      "description": "Next-generation visual canvas website builder, high-concurrency Cloud CMS, and zero-transaction-fee commerce platform with native local and global payment rails.",
      "url": "https://framique.com",
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "USD",
        "lowPrice": "0",
        "highPrice": "99",
        "offerCount": "3",
        "offers": [
          {
            "@type": "Offer",
            "name": "Starter",
            "price": "0",
            "priceCurrency": "USD",
            "description": "Free forever tier with visual canvas builder and 0% transaction fees."
          },
          {
            "@type": "Offer",
            "name": "Pro Merchant",
            "price": "29",
            "priceCurrency": "USD",
            "description": "Unlimited dynamic CMS items, native bKash/Nagad and Stripe checkout, sub-300ms SSR."
          },
          {
            "@type": "Offer",
            "name": "Agency & Enterprise",
            "price": "99",
            "priceCurrency": "USD",
            "description": "Multi-store governance, white-label client portals, and priority headless API."
          }
        ]
      },
      "author": {
        "@type": "Organization",
        "@id": "https://framique.com/#organization"
      },
      "featureList": [
        "Visual Drag-and-Drop Canvas",
        "Zero Percent (0%) Platform Transaction Fees",
        "Native Local Mobile Payments (bKash, Nagad)",
        "Global Payment Rails (Stripe, PayPal, Multi-Currency)",
        "Uncapped Relational PostgreSQL Dynamic CMS",
        "Sub-300ms Server-Side Rendering (SSR) Edge Performance",
        "Core Web Vitals Pass Guarantee (LCP < 1.2s, INP < 40ms, CLS 0)"
      ]
    },
    {
      "@type": "Organization",
      "@id": "https://framique.com/#organization",
      "name": "Framique",
      "url": "https://framique.com",
      "logo": "https://framique.com/brand/logo.svg",
      "sameAs": [
        "https://github.com/devrahmanbd/frame28",
        "https://twitter.com/framique",
        "https://linkedin.com/company/framique"
      ]
    }
  ]
}
```

---

## 3. Dedicated Comparison Route Schema (`/compare/shopify`)

*Validating Entity Disambiguation and Feature Differentiation.*

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "ItemPage",
      "@id": "https://framique.com/compare/shopify#webpage",
      "url": "https://framique.com/compare/shopify",
      "name": "Framique vs Shopify: The 0% Fee Sovereign Commerce Alternative",
      "description": "Compare Framique vs Shopify on transaction fees, visual design freedom, app store costs, and local payment rails. Eliminate the 2% third-party penalty.",
      "breadcrumb": {
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
            "name": "Compare",
            "item": "https://framique.com/compare"
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "Framique vs Shopify",
            "item": "https://framique.com/compare/shopify"
          }
        ]
      },
      "mainEntity": {
        "@type": "SoftwareApplication",
        "name": "FRAMIQUE",
        "applicationCategory": "E-Commerce & CMS Platform",
        "description": "Cloud CMS and visual e-commerce builder with 0% transaction fees and sub-300ms SSR."
      }
    }
  ]
}
```

---

## 4. Technical Editorial Article Schema (`/blog/*`)

*Structured for News, TechArticle, and AI Answer Engine citation.*

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://framique.com/blog/shopify-fee-exodus#article",
      "headline": "The Death of the 2% Fee: Why Modern Merchants Are Leaving Shopify in 2026",
      "description": "An empirical analysis of Shopify's 2% third-party payment penalty, the compounding cost of app subscriptions, and the rise of fee-sovereign visual commerce platforms.",
      "url": "https://framique.com/blog/shopify-fee-exodus",
      "datePublished": "2026-09-13T08:00:00+06:00",
      "dateModified": "2026-09-13T12:00:00+06:00",
      "author": {
        "@type": "Organization",
        "name": "Framique Engineering Council",
        "url": "https://framique.com"
      },
      "publisher": {
        "@type": "Organization",
        "@id": "https://framique.com/#organization"
      },
      "mainEntityOfPage": "https://framique.com/blog/shopify-fee-exodus",
      "keywords": [
        "shopify alternative 0 transaction fee",
        "why leave shopify 2026",
        "zero fee ecommerce platform",
        "shopify app tax cost"
      ],
      "articleSection": "Platform Economics & Commerce Architecture"
    }
  ]
}
```

---

## 5. Implementation Guard in Codebase (`src/lib/marketing-seo.ts`)

To ensure SSR safety, schema is injected via deterministic helper functions evaluated on the server:

```typescript
export function renderJsonLd(schema: Record<string, unknown> | Array<Record<string, unknown>>): string {
  // Prevent hydration drift and duplicate client-side script execution
  if (typeof window !== "undefined") {
    return "";
  }
  return JSON.stringify(schema);
}
```
