# Storefront Deployment Verification — microscrop.shop

- Date (UTC): 2026-09-21
- Target: https://microscrop.shop/ (custom domain, Flame Fashion BD)
- Method: Chrome DevTools MCP against live production (snapshot, console, network, interaction, Lighthouse navigation audit)
- Repo HEAD at time of check: `ea7566e` (docs: repeater program 8/8 completion)

## Verdict: LIVE and HEALTHY, with 3 minor a11y findings

The custom-domain storefront serves the full theme with zero failed requests,
zero console errors/warnings, working cart + interactive widgets, and
Lighthouse 94 a11y / 100 best-practices / 100 SEO.

## Proven live (observed, not inferred)

- Homepage `GET /` → 200. All 121 network requests → 200 (assets, fonts,
  `api/public/ph/*` placeholder images); analytics beacon → 202. Zero 4xx/5xx.
- No console errors or warnings on homepage or PDP.
- Custom-domain links everywhere: header, utility nav, collections
  (`/c/*`), products (`/p/*`), footer, checkout — all `microscrop.shop`
  URLs. No platform-path links observed.
- Announcement bar renders + rotates ("Authentic stock…" → "Free samples
  over BDT 1,500") with working Dismiss.
- Shade finder interactive: selecting "Warm" checked the radio, progress
  0→50, Next enabled. Skin quiz renders (4 options, gated Next).
- PDP (`/p/brass-filigree-chandbali-earrings`): breadcrumb, H1, BDT price,
  VAT note, live stock ("99 in stock"), Add to cart → cart badge 0→1 with
  "Added to cart" live-region announcement, COD badge.
- Ported theme widgets rendering live with real data on PDP: claim_chips,
  ingredient_list (Niacinamide 5%…), how_to_use (4 steps), safety_note +
  patch-test panel, batch_info (mfg/expiry/batch RB-2601-A), refill_widget
  (30/60/90-day cadences), gift_builder (counter + message field),
  rating_summary histogram + review_list empty state.
- `sitemap.xml` serves 23 custom-domain URLs (home, blog, 5 products,
  8 collections, 3 pages, 3 posts). `robots.txt` correct (disallows
  cart/checkout/account/order, points at sitemap + llms.txt).

## Lighthouse (desktop, navigation mode)

- Accessibility: 94 | Best Practices: 100 | SEO: 100 | Agentic Browsing: 61
- Failed audits:
  1. `color-contrast` — announcement/utility text (`p.truncate`,
     `/pages/*` links) below ratio on tinted background.
  2. `link-name` — "Worn by you" UGC gallery product links are image-only
     with no accessible name (placeholder images lack alt text).
  3. Agentic-browsing tree well-formedness (score 61) — same unnamed-link
     root cause class as (2).

Full reports (ephemeral, in MCP temp dir):
- `/var/folders/nf/__610j414m92zmwfssljry4h0000gp/T/chrome-devtools-mcp-3JDilp/report.json`
- `/var/folders/nf/__610j414m92zmwfssljry4h0000gp/T/chrome-devtools-mcp-XwYar4/report.html`

## Known state / limitations (honest scope)

- Live store still runs the BEAUTY draft, not clothing-heritage — expected,
  matches progress.md (needs merchant publish action, unactioned).
- Bundle freshness vs repo HEAD could NOT be verified: no SSH access
  (revoked by operator), so deployed commit + bundle markers are unknown.
  Everything above describes what production serves, not which commit it is.
- Path-storefront 404 behavior not re-checked this run (no browser-safe
  slug guess attempted).
- No purchase/checkout-flow test executed (out of scope for this pass).
- Suggested follow-ups: alt text on UGC gallery links (fixes findings 2+3),
  contrast bump on announcement/utility text (finding 1), publish
  clothing-heritage to flame-fashion-bd.
