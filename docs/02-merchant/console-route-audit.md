# Phase 1 — Console route audit & inventory

Every route under `/admin` (the merchant console). `/root`, `/dashboard` and the
storefront are out of scope.

Columns:
- **Data source** — the `src/lib/*` module the page reads through.
- **Value** — how often a merchant genuinely needs it (high = weekly or more,
  med = monthly, low = rarely / setup-once).
- **Verdict** — `keep` (own section), `merge` (becomes a tab elsewhere),
  `delete` (remove route, redirect to its parent).

Every `merge`/`delete` row keeps a permanent redirect from its old URL so no
bookmark 404s (Phase 5 executes this table).

---

## 1. Dashboard & analytics

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin` | 187 | `analytics.functions` | high | keep | Dashboard (rebuilt in Phase 8) |
| `/admin/analytics` | 357 | `analytics.functions` | high | keep | Dashboard › Analytics |
| `/admin/analytics/insights` | 8 | — (redirect) | — | delete | `→ /admin/analytics?tab=insights` (already) |
| `/admin/analytics/reports` | 8 | — (redirect) | — | delete | `→ /admin/analytics?tab=reports` (already) |
| `/admin/activity` | 8 | — (redirect) | — | delete | `→ /admin/analytics?tab=activity` (already) |
| `/admin/exports` | 241 | `exports.functions` | med | merge | Analytics › Exports tab |
| `/admin/experiments` | 407 | `conversion.functions` | low | merge | Analytics › Experiments tab |

## 2. Orders

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin/orders` | 358 | `orders-admin.functions` | high | keep | Orders › All |
| `/admin/orders/$orderId` | 566 | `orders-admin`, `payments` | high | keep | Order detail (Phase 7 layout) |
| `/admin/orders/$orderId/invoice` | 174 | `commerce.functions` | med | keep | Print view (no chrome) |
| `/admin/draft-orders` | 376 | `commerce-desk.functions` | med | merge | Orders › Drafts tab |
| `/admin/carts` | 203 | `commerce.functions` | med | merge | Orders › Abandoned tab |
| `/admin/returns` | 276 | `commerce.functions` | high | merge | Orders › Returns tab |
| `/admin/shipping` | 802 | `shipping`, `pos` | high | keep | Orders › Shipping tab (split POS out) |
| `/admin/pos` | 1026 | `pos.functions` | med | keep | Own section — it is a till, not a list |

## 3. Products

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin/products` | 142 | `catalog` | high | keep | Products › All |
| `/admin/products/new` | 72 | `catalog` | high | keep | Product create |
| `/admin/products/$productId` | 106 | `catalog` | high | keep | Product detail (Phase 7) |
| `/admin/inventory` | 477 | `commerce.functions` | high | keep | Products › Inventory tab |
| `/admin/pricing` | 393 | `commerce-desk.functions` | med | merge | Products › Pricing tab |
| `/admin/bulk-editor` | 347 | `commerce-desk.functions` | med | merge | Products › bulk action on the list (Phase 6) |
| `/admin/categories` | 28 | wrapper | high | merge | Products › Organisation tab |
| `/admin/collections` | 503 | `catalog.functions` | high | merge | Products › Organisation tab |
| `/admin/brands` | 24 | wrapper | low | merge | Products › Organisation tab |
| `/admin/catalog` | 574 | `catalog.functions` | low | merge | Products › Settings tab (options, variants) |
| `/admin/bundles` | 284 | `commerce.functions` | low | merge | Products › Bundles tab |
| `/admin/subscriptions` | 220 | `commerce-desk.functions` | low | merge | Products › Subscriptions tab |
| `/admin/purchasing` | 376 | `commerce-desk.functions` | med | merge | Products › Purchasing tab |

## 4. Customers

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin/customers` | 128 | `commerce.functions` | high | keep | Customers › All |
| `/admin/support` | 839 | `support.functions`, `support-sla` | high | keep | Customers › Support tab |
| `/admin/reviews` | 262 | `conversion.functions` | med | merge | Customers › Reviews tab |
| `/admin/ai/assistant` | 184 | `ai-support.functions` | low | merge | Support › AI drafts panel (not a page) |

## 5. Content

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin/pages` | 469 | `page-builder`, `storefront-search` | high | keep | Content › Pages |
| `/admin/marketing/articles` | 641 | `cms.functions`, `blog-*` | high | merge | Content › Posts tab |
| `/admin/marketing/media` | 222 | local | med | merge | Content › Media tab |
| `/admin/marketing/seo` | 536 | `seo.functions` | med | merge | Content › SEO tab |
| `/admin/marketing/forms` | 330 | `cms.functions` | low | merge | Content › Forms tab |
| `/admin/builder` | 1815 | `builder-*`, `themes.functions` | high | keep | Full-screen editor, no console chrome |
| `/admin/marketplace` | 432 | `marketplace.functions` | med | keep | Content › Themes & apps tab |
| `/admin/marketplace/creator` | 313 | `marketplace.functions` | low | merge | Marketplace › Creator tab |
| `/admin/marketplace/versions` | 340 | `marketplace.functions` | low | merge | Marketplace › Versions tab |
| `/admin/marketplace/moderation` | 226 | `marketplace.functions` | low | delete | Platform concern — belongs to `/root` |

## 6. Marketing

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin/marketing` | 7 | redirect | — | delete | `→ /admin/marketing/campaigns` (already) |
| `/admin/marketing/campaigns` | 365 | `marketing.functions` | high | keep | Marketing › Campaigns |
| `/admin/marketing/coupons` | 412 | `marketing.functions` | high | merge | Marketing › Discounts tab |
| `/admin/gift-cards` | 221 | `commerce.functions` | low | merge | Marketing › Discounts tab |
| `/admin/marketing/codes` | 250 | `commerce.functions` | low | merge | Marketing › Discounts tab |
| `/admin/marketing/subscribers` | 382 | local | med | merge | Marketing › Audience tab |

## 7. Money

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin/payments` | 452 | `payments.functions` | high | keep | Money › Payments |
| `/admin/billing/invoices` | 53 | local | low | merge | Money › Invoices tab |
| `/admin/plans` | 360 | `billing.functions` | med | merge | Money › Plan & billing tab |
| `/admin/fraud` | 526 | `fraud.functions` | med | merge | Money › Risk tab |
| `/admin/fraud/audit` | 77 | `fraud.functions` | low | merge | Risk › Audit panel |
| `/admin/fraud/ad-defense` | 379 | `ad-fraud.functions` | low | merge | Risk › Ad defense tab |
| `/admin/settings/providers` | 337 | `finance.functions` | low | merge | Money › Payment rails tab |

## 8. Settings

| Route | LOC | Data source | Value | Verdict | Destination |
|---|---|---|---|---|---|
| `/admin/settings` | 216 | local | high | keep | Settings › General |
| `/admin/settings/domains` | 386 | `domains.functions` | med | merge | Settings › Domains tab |
| `/admin/settings/security` | 332 | `identity.functions` | med | merge | Settings › Security tab |
| `/admin/settings/infrastructure` | 319 | `infra.functions` | low | merge | Settings › Security tab (advanced) |
| `/admin/settings/api` | 201 | `exports.functions` | low | merge | Settings › Developers tab |
| `/admin/developers` | 600 | `developers.functions` | med | merge | Settings › Developers tab |
| `/admin/staff` | 535 | `governance.functions` | med | merge | Settings › Staff tab |
| `/admin/approvals` | 254 | `governance.functions` | low | merge | Settings › Staff tab (approvals panel) |

---

## Result

63 routes → **8 sections**, each with at most 5 tabs, plus 3 chrome-less
surfaces (builder, POS, invoice print) and 3 detail routes.

| Section | Tabs |
|---|---|
| Dashboard | Home · Analytics · Reports · Exports · Experiments |
| Orders | All · Returns · Drafts · Abandoned · Shipping |
| Products | All · Inventory · Organisation · Pricing · More (bundles, subs, purchasing, settings) |
| Customers | All · Support · Reviews |
| Content | Pages · Posts · Media · SEO · Themes & apps |
| Marketing | Campaigns · Discounts · Audience |
| Money | Payments · Invoices · Plan · Risk · Rails |
| Settings | General · Staff · Domains · Security · Developers |

Deleted outright: `marketplace/moderation` (platform-only). Everything else
survives as a tab and keeps a redirect from its old URL.
