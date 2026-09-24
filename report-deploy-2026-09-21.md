# Deployment Verification Report — custom-domain storefront

Date: 2026-09-21 · Target: https://microscrop.shop/ (Flame Fashion BD)
Method: Chrome MCP (new_page, snapshot, screenshot, fill, fill_form, click,
evaluate_script, list_console_messages, list_network_requests)
Deployment under test: `main` (post PR #2 + PR #3), `DEPLOY OK: main live`

## 1. Storefront walk (all root-shape URLs, custom host)

| Page                                       | Result                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `/` homepage                               | 200 — brand header, utility bar, search, Departments, Account/Bag, hero, shade finder, skin quiz, bestsellers with BDT prices |
| `/p/tangail-taant-cotton-saree`            | 200 — title, ৳ 3,450.00, 29 in stock, working Add to cart, placeholder image loads 800px                                      |
| `/c/heritage-handloom`                     | 200, clean                                                                                                                    |
| `/pages/shade-finder`                      | 200, clean                                                                                                                    |
| `/search`                                  | 200, canonical `https://microscrop.shop/search`, clean                                                                        |
| `/cart`                                    | 200, stays on URL (no featured-store bounce), clean                                                                           |
| `/checkout`                                | 200 — delivery form, COD preselected, server totals, clean                                                                    |
| `/account`, `/track`                       | 200, clean                                                                                                                    |
| `/blog`, `/blog/demo-master-weavers`       | 200, clean, absolute store canonicals                                                                                         |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt` | 200 merchant content, root-shape locs, https origins                                                                          |

Header links on custom host are all root-shaped: `/`, `/search`,
`/account`, `/checkout`. Collection cards link `/p/*`.

## 2. End-to-end COD purchase (this run)

PDP → Add to cart (clicked via a11y ref) → cart shows item, URL unchanged →
checkout → filled delivery form (fill_form) → Confirm order → navigated to
`/store/flame-fashion-bd/order/7ce6a155-…?t=…` rendering:
"Thank you! Order confirmed", FQ-20260921-7PYF9, ৳ 3,967.50 total incl. VAT,
timeline (order.placed, order.cod_confirmed, fraud review note).

## 3. Console + network health

- `list_console_messages(type=error)`: **0 errors** on confirmation page.
- Failed network requests (4xx/5xx): **none**.
- No React hydration (#418) errors observed this run.

## 4. Policy gates (curl-verified same window)

- `framique.qubickle.com/store/*` (all slugs, deep paths, case variants,
  sitemap/robots): **404**, empty body.
- Platform `/`: 200 landing. Placeholder route: 200.

## 5. Known non-blockers

- Bengali toggle glyphs render as boxes in headless Chrome (missing system
  font in test env only; real browsers unaffected).
- Confirmation URL keeps `/store/<slug>/order/*` shape — serves on custom
  hosts by design (token-gated).
- Test order FQ-20260921-7PYF9 (+ earlier FQ-20260921-58URG) are COD demo
  orders on the demo merchant; cancel from dashboard at will.

## 6. SSH-level investigation (host root, 2026-09-21 ~16:30 CEST)

- Host + services: `framique.service`, `openresty`, `haproxy` all active,
  zero error-level journal entries in 15 min.
- Orders table: both E2E orders persisted correctly (numbers, COD, totals,
  buyer details). Event chain per order: `order.placed` →
  `order.cod_confirmed` → `fraud.review_opened` (Risk 60 hold — expected
  fraud-shield behavior on first-time test buyers, not a defect).
- `provider_credentials` table EXISTS (earlier dashboard crash cause gone).
- `fulfillments` / `consignments` tables do NOT exist — but nothing references
  them: fulfilment runs through `courier-adapters.server.ts` (SteadFast et al,
  tracking extraction at :364) + order status transitions + webhooks
  (`webhook.dispatch` 600/60) + dispatch mailer templates. No missing-table
  breakage; no action needed.
