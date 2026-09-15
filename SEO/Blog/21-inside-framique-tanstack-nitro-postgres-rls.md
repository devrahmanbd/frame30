# Inside Framique's Architecture: TanStack Start, Nitro & PostgreSQL Row-Level Security

> **Target Query:** `cloud ecommerce cms architecture`, `tanstack start ecommerce`, `postgres rls saas multi-tenant`  
> **Reading Time:** 11 minutes  
> **Published:** December 2026  

---

## 1. Why Modern E-Commerce Requires a Clean Sheet Architecture

Most incumbent e-commerce platforms were engineered over a decade ago:
- **Shopify (2006):** Built on a monolithic Ruby on Rails core with a Liquid templating engine.
- **WooCommerce (2011):** Built on WordPress, an interpreted PHP blogging engine running on centralized Apache/MySQL servers.
- **Magento (2008):** Complex PHP/Zend framework with heavy XML layout configurations.

These legacy architectures struggle with the demands of 2026: sub-50ms global mobile response times, strict multi-tenant data isolation, and dynamic visual composition.

**FRAMIQUE** was built from a clean sheet on modern web primitives: **TanStack Start**, **Nitro server engine**, and **PostgreSQL with kernel-level Row-Level Security (RLS)**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                      FRAMIQUE ARCHITECTURAL STACK                      │
├──────────────────────────┬─────────────────────────────────────────────┤
│ Edge SSR Presentation    │ TanStack Start + Nitro Server Engine        │
│                          │ Zero-hydration markup streaming (<45ms TTFB)│
│                          │ Tailwind CSS v4 + OKLCH Design Tokens       │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Multi-Tenant Security    │ PostgreSQL Row-Level Security (RLS)         │
│                          │ Context-bound JWT Claims (`merchant_id`)    │
│                          │ Automated HAProxy host-header routing       │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Storage & Media Engine   │ Edge CDN asset pipelines                    │
│                          │ SVG sprite compile-time generation          │
│                          │ Automated AVIF/WebP image transcoding       │
├──────────────────────────┼─────────────────────────────────────────────┤
│ Sovereign Commerce APIs  │ Bi-directional Tokenized MFS Webhooks       │
│                          │ Automated REST Courier Dispatch Webhooks    │
│                          │ Zero Platform Take-Rate Financial Ledgers   │
└──────────────────────────┴─────────────────────────────────────────────┘
```

---

## 2. The Edge Presentation Layer: TanStack Start & Nitro

### The SSR Advantage Over Client-Side SPAs
Client-side React SPAs force the user's mobile browser to download, parse, and execute megabytes of JavaScript before rendering initial content.  
**TanStack Start** reverses this:
1. The incoming HTTP request is intercepted by the Nitro edge engine.
2. Server loaders resolve product catalog data, customer session context, and SEO metadata concurrently.
3. Fully rendered semantic HTML streams to the browser with **sub-45ms Time to First Byte (TTFB)**.
4. Client hydration attaches asynchronously without blocking user scrolling or tap interactions.

---

## 3. Kernel-Level Tenant Isolation via PostgreSQL Row-Level Security

In multi-tenant SaaS platforms, ensuring that one merchant can never inspect, query, or overwrite another merchant’s data is the paramount security challenge.

Instead of relying on fragile application-level `WHERE merchant_id = x` clauses (where a single junior developer bug can cause massive data leaks), Framique implements **PostgreSQL Row-Level Security (RLS)**:

```sql
-- RLS Policy: Merchants can only select their own articles
CREATE POLICY merchant_articles_isolation ON articles
  FOR ALL
  USING (merchant_id = current_setting('app.current_merchant_id')::uuid);
```

Because RLS is enforced inside the database engine itself, data isolation is guaranteed at the kernel layer, regardless of which API endpoint or service queries the table.

[Read About Framique Security & Architecture](/security)
