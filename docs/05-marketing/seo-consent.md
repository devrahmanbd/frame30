# SEO, AEO & consent

Status: implemented (BUILD.md §2.6). Covers the merchant SEO panel, answer-engine
output, per-type sitemaps, and the consent ledger that gates every send.

## Data model

| Table | Purpose |
| --- | --- |
| `seo_meta` | Current override per `(merchant_id, entity_type, entity_id)`. `entity_id` is null for the store-level record. |
| `seo_meta_audit` | Append-only before/after trail of every panel save. |
| `consent_events` | Append-only consent ledger: channel, purpose, granted, source, actor, reason. |
| `customer_consents` | Current consent state read by the send path; written only by `consent_record`. |

`consent_record` writes the ledger row and the state row in one transaction, so a
state row can never exist without the event that produced it.

## Scoring

`src/lib/seo-analysis.ts` is pure and isomorphic. The admin panel scores the draft
while the merchant types; `saveSeoMeta` re-scores the same payload server-side
before persisting, so a stored score can never disagree with the shown score and a
tampered client score is ignored. Checks are grouped `meta`, `social`, `indexing`,
`aeo`, each with a weight; the score is the weighted pass ratio out of 100.

## Storefront resolution

`resolveSeo(merchantId, entityType, entityId)` reads through a 60s tenant-keyed
cache and is called from the store, product and page loaders. `buildStoreHead` /
`buildProductHead` / `buildPageHead` treat the override as a preference, never a
blanking tool: an empty field keeps the theme default. Canonicals and social images
must be absolute `https://` or they are discarded. FAQ answers become a `FAQPage`
JSON-LD block (max 12 entries).

## Sitemaps

- `/robots.txt` advertises the platform sitemap plus one index per published store.
- `/store/$slug/sitemap.xml` is a `sitemapindex` pointing at the type sitemaps.
- `/store/$slug/sitemaps/$kind.xml` serves `pages`, `products`, `collections`,
  `articles`. Unknown kinds and inactive stores return 404. Entities with a
  `noindex` override are excluded.

## Consent

- `channelAudience` filters every recipient list against withdrawn consent before a
  message is queued. Withdrawal always wins over legacy subscriber flags.
- The unsubscribe link withdraws all channels and purposes, not just email status.
- Merchant-side corrections go through `consentRecordFn` and are attributed to the
  acting staff user with a reason.

## Rate limits and metrics

Buckets: `seo.read`, `seo.write`, `seo.sitemap`, `consent.read`, `consent.record`.

Counters: `framique_seo_save_total{entity,band}`, `framique_sitemap_build_total{kind}`, `framique_consent_total{channel,purpose,outcome}`,
`framique_consent_audience_total{channel,purpose,outcome}`,
`framique_campaign_recipients_total{outcome}`. Spans: `seo.index`, `seo.save`,
`consent.record`.

## Tests

`src/lib/seo-analysis.test.ts` — determinism, empty vs complete drafts, overflow
titles, non-https social images, malformed FAQ input, override precedence,
noindex behaviour, FAQ JSON-LD output, and canonical scheme rejection.
