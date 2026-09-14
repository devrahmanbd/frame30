# Engineering gates (BUILD 1.9) — as built

The gates are the contract that stops a thin feature from shipping. Every one
of them runs headless, needs no seeded staff account, and fails loudly rather
than skipping quietly.

## Loops

`.e2e/specs/`, Playwright, desktop + mobile projects.

| Loop | What it proves |
| --- | --- |
| `owner_loop` | Every `/root/*` console route redirects an anonymous visitor to `/auth`; the server-shipped HTML carries no merchant list, no `amount_minor_int`, no service key; `/root` is disallowed in `robots.txt`; the Prometheus scrape target refuses anonymous scrapes (404 unconfigured, 401 configured) and never echoes a metric name. |
| `currency_gate` | BDT is the only currency a non-pilot store can render. Amounts must match `^\d{1,3}(,\d{3})*\.\d{2}$` — a float that leaked through arithmetic fails the regex — no `$`/`USD` mark appears on pricing, storefront, or search, minor-unit fields in the SSR payload are integers, and prices are typeset with `tabular-nums`. |
| `fraud_loop` | Fraud desk routes are staff-only; no rule id, threshold, blacklist kind, or risk score reaches a public page; `fraud_cases`, `fraud_rules`, `fraud_blacklist`, `fraud_audit` return nothing to the anonymous role, and an anonymous blacklist insert is refused. |
| `ai_support_loop` | Assistant desks are staff-only; `ai_conversations` / `ai_messages` are anonymous-invisible; no model key or system prompt is shipped to the browser; the storefront stays console-clean and transcript-free without a session. |

Shared helper `expectGated()` in `.e2e/fixtures.ts` handles the client-side
auth gate (`ssr:false`) with a 30s window and one reload retry, so a cold dev
compile is not mistaken for a broken gate.

All four are wired into `bun run e2e:critical` alongside the pre-existing
loops; `bun run e2e:gates` runs just these four.

## RLS allow/deny matrix

`src/lib/rls-matrix.test.ts` (vitest, 61 cases). It talks to the Data API with
the publishable key exactly as a browser would, so it exercises the policies
that actually ship.

- **Allow list** — storefront/pricing reads: `merchants`, `products`,
  `product_variants`, `categories`, `collections`, `collection_products`,
  `plan_definitions`, `storefront_pages`, `store_themes`, `vat_rates`,
  `merchant_settings` (shipping/COD configuration; no secrets in the row).
- **Deny list** — 45 tenant, money, identity, risk and platform tables must
  return zero rows to `anon`.
- **Write probes** — an anonymous `INSERT` is refused on public tables too;
  RLS that permits an anon write is a breach a read-only matrix never sees.
- Skips itself when backend credentials are absent so a laptop without `.env`
  still runs the rest of the suite.

## Accessibility release gate

`scripts/a11y-gate.mjs` — `bun run a11y:gate`.

Runs axe-core (WCAG 2.0/2.1 A + AA) in Chromium against home, pricing,
features, contact, auth, storefront, search and checkout, then scores each page
the way Lighthouse does: impact weights (critical 10, serious 7, moderate 3,
minor 1), score = weighted pass ratio. Below `--min` (default 90) fails.
`auth` and `checkout` are marked strict: any serious/critical violation fails
them outright, because those are the AAA surfaces in this product.

Current run: 100 on all eight surfaces.

Two token-level defects it caught and we fixed rather than suppressed:

- `--color-primary` was `bd-teal-600`; white-on-primary measured 3.52:1 at
  12–14px. Primary is now `bd-teal-700`, and the severity `*-foreground`
  tones are tuned against their soft background (`mint-800`, `amber-800`,
  `red-700`) so status pills clear AA at 12px. Do not lighten these back.
- The checkout summary nested a `div` between `<dl>` and its `<dt>/<dd>`
  pair, so assistive tech lost the total row. `Row` now takes a `className`
  and stays a direct child of the list.

## Supply-chain gates

- `bun run scan:secrets` — `scripts/secret-scan.mjs`, dependency-free. Walks
  the tree for provider keys, private-key blocks, JWTs, hardcoded secret
  assignments and stray `.env` files, honours `.gitignore` via
  `git check-ignore`, and allow-lists `process.env` lookups, publishable keys
  and documented placeholders.
- `bun run scan:deps` — `npm audit --omit=dev --audit-level=high`.

## CI

`.github/workflows/gates.yml`, two jobs:

- **static** — typecheck, unit tests (incl. the RLS matrix), secret scan,
  dependency scan.
- **e2e** — build, boot the production server, `e2e:critical`, then the a11y
  gate; Playwright traces are uploaded on failure.

## Design guidelines

Gate output is a product surface for the team, so it follows the same rules as
the app: no colour-only status (each failure line names the impact in words),
tabular figures in the score column, and plain-language failure text that says
which surface and which threshold. No emojis.
