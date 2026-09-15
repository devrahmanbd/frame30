# How to Migrate Your Catalog from Shopify to Framique in 5 Minutes

> **Target Query:** `migrate from shopify to local cms`, `shopify csv import ecommerce`, `switch from shopify`  
> **Reading Time:** 8 minutes  
> **Published:** October 2026  

---

## 1. Zero-Downtime E-Commerce Migration

Migrating an online store from an established platform can feel intimidating. Founders worry about broken customer links, lost SEO rankings, and corrupted inventory counts.

However, moving from Shopify to **FRAMIQUE** is straightforward because both systems use standardized relational data schemas. This guide walks you through the step-by-step process of migrating your products, variants, images, and customer records in under five minutes with **zero store downtime**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        5-MINUTE MIGRATION FLOW                         │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Export Products CSV from Shopify Admin                              │
│ 2. Create Free Framique Storefront (`/auth?mode=signup`)               │
│ 3. Run Automated CSV Ingestion Wizard (`/admin/import`)                │
│ 4. Configure Direct Payment Keys (bKash, Nagad, Stripe)                │
│ 5. Update DNS CNAME Record for Instant Zero-Downtime Cutover           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Step 1: Exporting Your Shopify Catalog

1. Log into your Shopify Admin dashboard.
2. Go to **Products**.
3. Click the **Export** button in the top right corner.
4. Under "Export", select **All products**.
5. Under "Export as", choose **CSV for Excel, Numbers, or other spreadsheet programs**.
6. Click **Export products**. Shopify will generate a downloadable `.csv` file containing your full catalog (Titles, Handles, Descriptions, Variant SKUs, Prices, and CDN Image URLs).

---

## 3. Step 2: Ingesting the CSV into Framique

1. Log into your **FRAMIQUE Admin Console**.
2. Navigate to **Catalog > Products > Import Products**.
3. Drag and drop your Shopify `.csv` file into the importer.
4. **Automatic Schema Normalization:** Framique’s parser automatically detects Shopify column headers:
   - `Title` ➔ Product Title
   - `Body (HTML)` ➔ Visual Rich Text Content
   - `Handle` ➔ SEO Canonical Slug
   - `Variant SKU` ➔ Unique Relational Inventory SKU
   - `Variant Price` ➔ Base Currency Price
   - `Image Src` ➔ High-speed Edge Media Asset
5. Click **Run Migration**. A 500-product catalog processes in approximately 12 seconds.

---

## 4. Step 3: Preserving SEO Equity (301 Redirects)

Preserving your hard-earned Google search rankings is essential. Framique automatically retains your Shopify URL structure:
- If a product on Shopify was located at `/products/black-hoodie`, Framique maps it cleanly or sets an automatic server-side 301 redirect.
- Framique pre-renders the exact same canonical meta tags and JSON-LD `Product` schema so Googlebot transitions indexing seamlessly.

---

## 5. Step 4: DNS Cutover & Automated SSL

Once you have verified your products:
1. In your domain registrar (Namecheap, GoDaddy, Cloudflare, or BTCL for `.com.bd`), update your `CNAME` record to point to Framique's edge gateway.
2. Inside Framique, add your custom domain under **Settings > Custom Domains**.
3. Framique’s automated ACME edge handler validates the handshake and issues an SSL certificate automatically.

---

## 6. Migration Checklist & Resources

- [Explore Feature Matrix](/features)
- [Review Pricing & 0% Fee Guarantee](/pricing)
- [Start Your 5-Minute Migration](/auth?mode=signup)
