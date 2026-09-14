# Framique — Master Plan (sharpened)

Status: Approved working plan. Source of truth for structure, slices, and checkpoints.
Design baseline: `docs/00-meta/design-system.md` (every page spec embeds a per-page Design Guidelines section).

---

## 1. What we're building

Commerce-as-a-service for Bangladeshi merchants, competitive with Shopify on breadth and superior on BD-local rails: MFS (bKash/Nagad/Rocket), COD, BNPL, bank integrations, courier carriers, VAT engine, own page-builder engine, headless runtime-agnostic themes, plugin marketplace, AI support & behavior tools.

## 2. Stack (locked)

- Web: TanStack Start/Query/Router + Reach UI + Custom UI kit (design system) + Tailwind (token wiring) + shadcn-style primitives where reused.
- Backend: Supabase (Postgres + RLS + PostgREST + Realtime + Storage + Auth), Redis + BullMQ (queues), OpenResty + lua-resty-acme (edge, certificates).
- Go microservices: payments engine (aggregator orchestration), rate limiter.
- Observability: Prometheus + Grafana + Sentry. Monitoring: OpenTelemetry.
- Monorepo: pnpm workspaces. App layer TS; payments/limits Go; public open-source.

## 3. Docs map (planning docs → SYSTEM.md → AGENTS.md)

| # | Area | Pages (each embeds Design Guidelines) |
|---|---|---|
| 01 | Architecture | system overview, identity, data model, observability |
| 02 | Merchant admin | dashboard, products, options & variants, customers, inventory, orders, shipping, POS, settings |
| 03 | Storefront | theme runtime, themes, search, product reviews, customer accounts, checkout-skeleton |
| 04 | Builder | editor, engine, widgets, design tokens, preview |
| 05 | Marketing | SEO/AEO, email/forms, ads integrity, campaigns, blog |
| 06 | Payments | gateway, MFS, COD, wallet, payouts, refunds, invoices |
| 07 | Commerce | carts, collections, smart collections, coupons/promo, VAT |
| 08 | POS & shipping | offline-first POS, courier integration |
| 09 | Analytics | dashboards, buyer persona, behavior events |
| 10 | AI support | support agent, chat, auto-respond, escalation |
| 11 | Fraud | fake orders/visitors/ad-click protection, scoring |
| 12 | Marketplace | themes/plugins marketplace, install, reviews |
| 13 | Export & SDK | website export, migration, SDK, webhooks |
| 14 | Operations | platform billing, trials, alerts, RBAC, security |
| 15 | E2E | test harness, mock MFS sandbox, golden flows |
| 16 | Pricing & merchant billing | plans/tiers & limits, subscription state machine, dunning, KYC/enrollment, invoices |
| 17 | Owner console | `/root` platform-governance surface: pricing sign-off, gateway env gates, trial/coupons ops, fraud & AI desks, settings/compliance; no new tables (writes only `owner_action`) |

## 4. Build slices (each ends with an E2E green + docs acceptance)

The full feature inventory, data flow, build slices S1–S8, key decisions, and
risks live in the **rough master plan at `/plan.md`** — this doc and all
`docs/01…16` specs reference it. Slices:

- **S1 Foundation**: monorepo scaffold, Supabase bootstrap (RLS tenants), edge,
  design-system tokens + first admin screens + first storefront theme (Theme "Char").
  Entitlement skeleton: `plan_definitions` + `tenant_limits` + `check_entitlement` RPC.
- **S2 Core store**: products, collections, inventory, storefront catalog, search.
- **S3 Orders & checkouts**: carts, COD-first checkout, order state machine, email.
- **S4 Payments**: aggregator (bKash/Nagad/Rocket mocks), refunds, wallet, invoices.
- **S5 POS & delivery**: offline POS, courier carriers, tracking pipeline.
- **S6 Marketing**: SEO/AEO, email/newsletter, forms, coupons/BOGO, blog, ads integrity.
- **S7 Marketplace & dev**: themes/plugins marketplace, SDK, export, webhooks.
- **S8 AI & fraud finish**: AI support agent, behavior events, fraud scoring, harden.

Platform billing (subscriptions, invoicing, dunning) and merchant KYC live in
`docs/16-product-pricing` + `docs/02-merchant` §KYC. Hard billing loop lands after
S1 entitlement skeleton + S4 payments rails; no "merchant can pay us" claim until
its E2E is green.

Each slice is gated by an E2E checkpoint (Playwright, mock MFS sandbox).