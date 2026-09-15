# FRAMIQUE: Technical On-Page SEO & Structured Data (`./SEO/Technical/`)

> This directory houses the **technical SEO specifications, Schema.org JSON-LD definitions, heading hierarchy audits, and Core Web Vitals benchmarks** for FRAMIQUE.  

---

## 📁 Technical Assets

| File Name | Document Scope | Key Features |
| :--- | :--- | :--- |
| **[`01-technical-schema-blueprint.md`](./01-technical-schema-blueprint.md)** | **Production JSON-LD Schemas & Heading Blueprint** | Complete schemas for `SoftwareApplication`, `Organization`, `FAQPage`, and `BreadcrumbList`, plus strict `H1`➔`H2`➔`H3` rules and Core Web Vitals thresholds. |

---

## 🔧 Codebase Integration Roadmap

To apply these technical assets to the live application:
1. Update `src/lib/marketing-seo.ts` to include the enriched `SoftwareApplication` and `FAQPage` schemas in the static marketing registry.
2. Ensure `src/routes/__root.tsx` renders the canonical JSON-LD script tags on all server-rendered routes.
3. Validate structured data using Google Rich Results Test and Schema.org validator.
