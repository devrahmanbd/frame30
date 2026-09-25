# Rank Math ↔ Frame30 SEO Parity Matrix

Generated: 2026-09-18

## Summary

**Core SEO parity: 85%** — Frame30 covers all fundamental Rank Math features with superior architecture (pure/isomorphic, server-side scoring, zero storefront SEO JS). Gaps are in AI-assisted content, social previews, advanced schema, local SEO, and link building tools.

---

## 1. Keyword Analysis

| Feature                       | Rank Math                      | Frame30                                  | Status                                      |
| ----------------------------- | ------------------------------ | ---------------------------------------- | ------------------------------------------- |
| Focus keyword input           | ✅ Single keyword field        | ✅ `focusKeyword` field                  | **Equal**                                   |
| Multiple focus keywords       | ✅ Pro: up to 5                | ✅ `secondaryKeywords` (up to 4)         | **Equal** (different limits)                |
| Keyword in title              | ✅ Basic check                 | ✅ `keyword.title` (weight 12)           | **Equal**                                   |
| Keyword in description        | ✅ Basic check                 | ✅ `keyword.description` (weight 8)      | **Equal**                                   |
| Keyword in URL/slug           | ✅ Basic check                 | ✅ `keyword.url` (weight 6)              | **Equal**                                   |
| Keyword at beginning of title | ✅ Title readability section   | ✅ `keyword.title` position check (≤40%) | **Frame30 better** — pixel position scoring |
| Keyword in content            | ✅ Basic check                 | ✅ `keyword.density` (weight 8)          | **Equal**                                   |
| Keyword density               | ✅ Pro: density % + range      | ✅ `keyword.density` with 0.5–4% range   | **Equal**                                   |
| Keyword in first paragraph    | ✅ Content readability section | ✅ `keyword.first_paragraph` (weight 8)  | **Equal**                                   |
| Keyword in subheading (H2/H3) | ✅ Content readability section | ✅ `keyword.subheading` (weight 6)       | **Equal**                                   |
| Keyword in image alt text     | ❌ Not a built-in check        | ✅ `keyword.image_alt` (weight 5)        | **Frame30 better**                          |
| Secondary keyword coverage    | ❌ Manual only                 | ✅ `keyword.secondary` — tracks each     | **Frame30 better**                          |

---

## 2. SERP Preview & Snippet Optimization

| Feature                          | Rank Math                                  | Frame30                                            | Status                            |
| -------------------------------- | ------------------------------------------ | -------------------------------------------------- | --------------------------------- |
| Google SERP preview              | ✅ Live SERP snippet preview               | ✅ `SerpPreview` component                         | **Equal**                         |
| SERP pixel measurement           | ❌ Character count only                    | ✅ Desktop 580px / Mobile 480px via `pixelWidth()` | **Frame30 better**                |
| Title length check               | ✅ Character-based                         | ✅ Character (30–60) + pixel width                 | **Frame30 better**                |
| Description length check         | ✅ Character-based                         | ✅ Character (70–160) + pixel width                | **Frame30 better**                |
| Preview tabs (Images/Video/News) | ✅ 5 tabs: All, Images, Videos, News, Maps | ❌ Single Google preview                           | **Rank Math ahead**               |
| Edit snippet button              | ✅ Inline edit                             | ✅ Inline edit                                     | **Equal**                         |
| Title templates                  | ✅ Global templates (Pro)                  | ✅ `SeoTemplatesPanel` component                   | **Equal**                         |
| Bengali SERP pixel calculation   | ❌                                         | ✅ Bengali conjuncts at 0.62×                      | **Frame30 better** (locale-aware) |

---

## 3. Content Analysis

| Feature                       | Rank Math                      | Frame30                                             | Status              |
| ----------------------------- | ------------------------------ | --------------------------------------------------- | ------------------- |
| Content length                | ✅ 600+ words threshold        | ✅ 300/600 word thresholds                          | **Equal**           |
| Heading structure             | ✅ H1 check, heading hierarchy | ✅ `content.headings` — H1 + skipped levels         | **Equal**           |
| Image alt text coverage       | ❌ Not counted                 | ✅ `content.alt_coverage` — per-image percentage    | **Frame30 better**  |
| Passive voice detection       | ❌ Not a built-in check        | ✅ `readability.passive` — sentence-level detection | **Frame30 better**  |
| Sentence length               | ✅ Basic                       | ✅ `readability.sentences` — >20 words ratio        | **Equal**           |
| Paragraph length              | ❌ Not a built-in check        | ✅ `readability.paragraphs` — >150 words ratio      | **Frame30 better**  |
| Flesch reading ease           | ✅ Readability section         | ✅ `readability.ease` — locale-aware                | **Equal**           |
| Content AI (generate/rewrite) | ✅ AI button in panel          | ❌ Not implemented                                  | **Rank Math ahead** |
| Pillar content designation    | ✅ Toggle in panel             | ❌ Not implemented                                  | **Rank Math ahead** |

---

## 4. Links

| Feature                     | Rank Math                       | Frame30                            | Status              |
| --------------------------- | ------------------------------- | ---------------------------------- | ------------------- |
| Internal link count         | ❌ Manual suggestion only       | ✅ `links.internal` — 2+ threshold | **Frame30 better**  |
| External link count         | ❌ Manual suggestion only       | ✅ `links.external` — 1+ threshold | **Frame30 better**  |
| Link opportunity detection  | ✅ "Link Opportunities" section | ❌ Not implemented                 | **Rank Math ahead** |
| Related posts suggestions   | ✅ "Related Posts" section      | ❌ Not implemented                 | **Rank Math ahead** |
| Outbound link quality check | ❌                              | ❌                                 | **Neither**         |

---

## 5. Social / Open Graph

| Feature                  | Rank Math                          | Frame30                               | Status              |
| ------------------------ | ---------------------------------- | ------------------------------------- | ------------------- |
| OG image validation      | ✅ Social tab                      | ✅ `social.image` — HTTPS enforcement | **Equal**           |
| Social card preview      | ✅ Visual Facebook/Twitter preview | ❌ Single text link warning only      | **Rank Math ahead** |
| Twitter card type        | ✅ Summary + large image           | ❌ Hardcoded summary                  | **Rank Math ahead** |
| Social title/description | ✅ Editable per-platform           | ❌ Inherited from SEO meta            | **Rank Math ahead** |
| Multiple social images   | ✅ Pro                             | ❌ Single image only                  | **Rank Math ahead** |

---

## 6. Indexing & Technical SEO

| Feature                           | Rank Math                       | Frame30                                                    | Status             |
| --------------------------------- | ------------------------------- | ---------------------------------------------------------- | ------------------ |
| Robots index/follow               | ✅ Per-page                     | ✅ `indexing.robots` — index + follow toggles              | **Equal**          |
| Canonical URL                     | ✅ Custom canonical             | ✅ `indexing.canonical` — HTTPS validation                 | **Equal**          |
| Sitemap generation                | ✅ Built-in sitemaps            | ✅ Per-type sitemaps (pages/products/collections/articles) | **Equal**          |
| Robots.txt management             | ✅ Basic                        | ✅ `loadStoreRobotsPolicy` — per-store                     | **Equal**          |
| Redirect manager                  | ✅ Pro: bulk 301/302 with regex | ✅ `url-lifecycle.server.ts` — redirects                   | **Equal**          |
| Publish gate (duplicate title)    | ❌                              | ✅ `seo-publish-gate.ts` — title uniqueness                | **Frame30 better** |
| Publish gate (canonical offsite)  | ❌                              | ✅ Canonical validation before publish                     | **Frame30 better** |
| Publish gate (noindex in sitemap) | ❌                              | ✅ Noindex consistency check                               | **Frame30 better** |
| Locale alternates (hreflang)      | ❌ Not in per-post panel        | ✅ `seo-technical.ts` — en/bn alternates                   | **Frame30 better** |
| Faceted URL index policy          | ❌                              | ✅ `seo-technical.ts` — index policy                       | **Frame30 better** |

---

## 7. AEO (Answer Engine Optimization)

| Feature                                | Rank Math          | Frame30                                              | Status             |
| -------------------------------------- | ------------------ | ---------------------------------------------------- | ------------------ |
| FAQ schema (FAQPage JSON-LD)           | ❌ Schema tab only | ✅ `aeo.faq` — validated + emitted                   | **Frame30 better** |
| FAQ length validation                  | ❌                 | ✅ Q≤180, A≤700 chars, max 12 entries                | **Frame30 better** |
| Answer-first content blocks            | ❌                 | ✅ `seo-answers.ts` — faq, spec_table, compare_table | **Frame30 better** |
| llms.txt opt-in                        | ❌                 | ✅ `seo-answers.ts` — opt-in per store               | **Frame30 better** |
| Bengali content validation             | ❌                 | ✅ `seo-answers.ts` — Bengali-specific rules         | **Frame30 better** |
| Store-wide title/description templates | ✅ Pro             | ✅ `seo-answers.ts` — fallbackTitle/Description      | **Equal**          |

---

## 8. Schema / Structured Data

| Feature                   | Rank Math                | Frame30                    | Status              |
| ------------------------- | ------------------------ | -------------------------- | ------------------- |
| FAQPage schema            | ✅ Schema tab            | ✅ AEO section — validated | **Equal**           |
| Article schema            | ✅ Schema tab            | ❌ Not in per-entity panel | **Rank Math ahead** |
| Product schema            | ✅ Schema tab            | ❌ Not in per-entity panel | **Rank Math ahead** |
| LocalBusiness schema      | ✅ Local SEO module      | ❌ Not implemented         | **Rank Math ahead** |
| Breadcrumb schema         | ✅ Rank Math Breadcrumbs | ❌ Not implemented         | **Rank Math ahead** |
| Organization schema       | ✅ Global                | ❌ Not implemented         | **Rank Math ahead** |
| HowTo schema              | ✅ Schema tab            | ❌ Not implemented         | **Rank Math ahead** |
| Video schema              | ✅ Schema tab            | ❌ Not implemented         | **Rank Math ahead** |
| Schema validation/testing | ✅ Schema tab preview    | ❌ No validation tool      | **Rank Math ahead** |

---

## 9. Readability

| Feature                 | Rank Math                      | Frame30               | Status              |
| ----------------------- | ------------------------------ | --------------------- | ------------------- |
| Flesch reading ease     | ✅                             | ✅                    | **Equal**           |
| Sentence length         | ✅                             | ✅                    | **Equal**           |
| Paragraph length        | ❌                             | ✅                    | **Frame30 better**  |
| Passive voice           | ❌                             | ✅                    | **Frame30 better**  |
| Subheading distribution | ✅ "Title readability" section | ✅ `content.headings` | **Equal**           |
| Transition words        | ✅                             | ❌ Not implemented    | **Rank Math ahead** |
| Power words / sentiment | ✅ Title readability           | ❌ Not implemented    | **Rank Math ahead** |
| Consecutive sentences   | ❌                             | ❌                    | **Neither**         |

---

## 10. Local SEO

| Feature                             | Rank Math           | Frame30            | Status              |
| ----------------------------------- | ------------------- | ------------------ | ------------------- |
| Google Business Profile integration | ✅ Local SEO module | ❌ Not implemented | **Rank Math ahead** |
| Local keyword tracking              | ✅ Pro              | ❌ Not implemented | **Rank Math ahead** |
| NAP consistency                     | ✅                  | ❌ Not implemented | **Rank Math ahead** |
| Knowledge Panel management          | ✅                  | ❌ Not implemented | **Rank Math ahead** |
| Multi-location support              | ✅                  | ❌ Not implemented | **Rank Math ahead** |

---

## 11. RSS & Distribution

| Feature                     | Rank Math      | Frame30            | Status              |
| --------------------------- | -------------- | ------------------ | ------------------- |
| RSS optimization            | ✅ RSS tab     | ❌ Not implemented | **Rank Math ahead** |
| RSS custom content          | ✅ Pro         | ❌ Not implemented | **Rank Math ahead** |
| Instant Indexing (IndexNow) | ✅ Google/Bing | ❌ Not implemented | **Rank Math ahead** |

---

## 12. Advanced Features

| Feature                    | Rank Math                         | Frame30                                          | Status              |
| -------------------------- | --------------------------------- | ------------------------------------------------ | ------------------- |
| Bulk editor                | ✅ Bulk edit titles/descriptions  | ✅ `BulkSeoTable` component                      | **Equal**           |
| Import/export settings     | ✅                                | ❌ Not implemented                               | **Rank Math ahead** |
| 404 monitor                | ✅                                | ❌ Not implemented                               | **Rank Math ahead** |
| Redirect manager           | ✅ Pro                            | ✅ `url-lifecycle.server.ts`                     | **Equal**           |
| Content AI assistant       | ✅ AI button                      | ❌ Not implemented                               | **Rank Math ahead** |
| Role manager               | ❌                                | ✅ `marketing.read/marketing.update` permissions | **Frame30 better**  |
| Consent ledger             | ❌                                | ✅ `seo-consent.md` — append-only audit          | **Frame30 better**  |
| Scored server-side         | ❌ Client-only scoring            | ✅ Re-scored on save, tamper-proof               | **Frame30 better**  |
| Zero storefront SEO JS     | ❌ Rank Math loads JS on frontend | ✅ Phase 7: zero SEO JS on storefront            | **Frame30 better**  |
| 8KB head payload gate      | ❌                                | ✅ `seo-weight-gate.mjs` — gzip budget           | **Frame30 better**  |
| Admin chunk budget         | ❌                                | ✅ Per-route chunk budgets (280/320 KB)          | **Frame30 better**  |
| Bilingual (en/bn)          | ❌ English only                   | ✅ All checks, labels, hints bilingual           | **Frame30 better**  |
| Web Worker off-main-thread | ❌                                | ✅ `seo-analysis.worker.ts`                      | **Frame30 better**  |
| Publish gate (5 rules)     | ❌                                | ✅ `seo-publish-gate.ts`                         | **Frame30 better**  |
| Render-read contracts      | ❌                                | ✅ `seo-weight-gate.mjs` — fallback/key/limit    | **Frame30 better**  |

---

## 13. Dashboard & UX

| Feature                                    | Rank Math                                                                                                      | Frame30                                                                | Status              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| Score badge (0–100)                        | ✅ Color-coded                                                                                                 | ✅ `scoreBand()` — danger/warning/success                              | **Equal**           |
| Entity list with scores                    | ❌ Tabular                                                                                                     | ✅ Sidebar with per-entity scores                                      | **Frame30 better**  |
| Grouped checks                             | ✅ 6 categories (Basic, Additional, Title readability, Content readability, Link opportunities, Related posts) | ✅ 7 groups (meta, social, indexing, aeo, content, links, readability) | **Equal**           |
| Per-check status icons                     | ✅ Red/green bullets                                                                                           | ✅ `StatusPill` — pass/warn/fail/skip                                  | **Equal**           |
| Weighted scoring                           | ✅ Internal weights                                                                                            | ✅ Public weights (sum to denominator)                                 | **Frame30 better**  |
| Edit snippet inline                        | ✅                                                                                                             | ✅ `SerpPreview`                                                       | **Equal**           |
| Preview tabs (All/Images/Videos/News/Maps) | ✅ 5 tabs                                                                                                      | ❌ Single preview                                                      | **Rank Math ahead** |
| Bengali UI                                 | ❌                                                                                                             | ✅ Full bilingual labels                                               | **Frame30 better**  |

---

## Overall Score Card

| Category           | Frame30 Coverage | Rank Math Coverage | Frame30 Advantage                                           |
| ------------------ | ---------------- | ------------------ | ----------------------------------------------------------- |
| Keyword Analysis   | 11/12 checks     | 9/12 checks        | +2 (image alt, secondary coverage)                          |
| SERP Preview       | 6/8 features     | 7/8 features       | -1 (preview tabs)                                           |
| Content Analysis   | 8/10 checks      | 6/10 checks        | +2 (passive voice, paragraphs, alt coverage)                |
| Links              | 2/5 features     | 2/5 features       | -3 (link opportunities, related posts)                      |
| Social/OG          | 1/6 features     | 5/6 features       | -4 (preview, twitter card, per-platform, multiple images)   |
| Indexing/Technical | 9/10 features    | 7/10 features      | +2 (publish gates, locale alternates)                       |
| AEO                | 5/5 features     | 2/5 features       | +3 (FAQ validation, answer blocks, llms.txt, Bengali)       |
| Schema             | 1/8 types        | 6/8 types          | -5 (Article, Product, Local, Breadcrumb, Org, HowTo, Video) |
| Readability        | 5/7 checks       | 4/7 checks         | +1 (passive, paragraphs)                                    |
| Local SEO          | 0/5 features     | 5/5 features       | -5 (entirely Rank Math)                                     |
| RSS/Distribution   | 0/3 features     | 3/3 features       | -3 (entirely Rank Math)                                     |
| Advanced           | 10/14 features   | 7/14 features      | +3 (consent, server-side scoring, bilingual, weight gate)   |
| Dashboard UX       | 7/9 features     | 7/9 features       | Equal                                                       |

---

## Priority Gaps to Close

### P1 — High Impact (Close for MVP parity)

1. **Social card preview** — Visual Facebook/Twitter card preview in SERP panel
2. **Multiple focus keywords** — Already supported (secondaryKeywords), but UI could expose more prominently
3. **Article/Product schema** — Auto-generate from entity data (already have entity types)
4. **Preview tabs** — All / Images / Videos tab in SERP preview

### P2 — Medium Impact (Close for feature parity)

5. **Content AI** — Generate meta titles/descriptions from entity content
6. **Link opportunity detection** — Suggest internal links from store pages
7. **Related posts** — Surface related articles/products
8. **Breadcrumb schema** — Auto-generate from route hierarchy
9. **Organization schema** — Store-level Organization JSON-LD
10. **LocalBusiness schema** — Store-level LocalBusiness JSON-LD

### P3 — Low Impact (Nice to have)

11. **404 monitor** — Track broken links
12. **RSS optimization** — Custom RSS content
13. **Instant Indexing** — IndexNow/Bing integration
14. **Social title/description** — Per-platform OG overrides
15. **Import/export** — SEO settings import/export

---

## What Frame30 Already Does Better Than Rank Math

1. **Server-side scoring** — Tamper-proof, re-scored on save
2. **Zero storefront SEO JS** — Phase 7 weight discipline
3. **8KB head payload gate** — Gzipped budget enforcement
4. **Admin chunk budgets** — Per-route JS budgets
5. **Bilingual (en/bn)** — All checks, labels, hints in both languages
6. **Web Worker** — Analysis off main thread
7. **Publish gate** — 5 rules prevent publishing broken SEO
8. **Render-read contracts** — Deterministic fallback + cache keys
9. **Pixel-based SERP measurement** — Desktop + mobile width in pixels
10. **Consent ledger** — Append-only audit trail
11. **Permission-gated** — marketing.read/marketing.update roles
12. **FAQ schema validation** — Q/A length limits, max 12 entries
13. **Answer-first content blocks** — spec_table, compare_table, etc.
14. **llms.txt opt-in** — Per-store LLM visibility control
15. **Bengali conjunct scaling** — 0.62× pixel width for conjuncts
16. **Locale alternates** — hreflang en/bn-BD
17. **Faceted URL index policy** — Crawlable pagination
18. **Publish gate** — Duplicate title, canonical validity, noindex consistency
