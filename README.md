# Framique

BDT-first commerce platform for Bangladeshi merchants: multi-tenant storefronts,
COD/MFS checkout, page builder and themes, POS and couriers, marketing, analytics,
marketplace, export/SDK, AI support and fraud tooling.

This repository is the running product (TanStack Start + Supabase), not a planning
workspace: `src/` is the app, `supabase/migrations/` is the versioned schema,
`.e2e/` is the Playwright harness, and `docs/` holds the per-area specs the code
is held to.

## Layout

- `src/` — app: routes, server functions (`*.functions.ts`), server-only helpers (`*.server.ts`)
- `supabase/migrations/` — versioned schema; `00000000000000_baseline_schema.sql` is the full baseline
- `.e2e/` — Playwright loops (`public_loop`, `store_loop`, `admin_loop`) — see `.e2e/README.md`

- `SYSTEM.md` — architecture truth (stack, tenants, RLS, money/currency rules)
- `plan.md` — S1–S8 slice roadmap
- `docs/00-meta/` — PLAN, design system, conventions
- `docs/01-…/` — per-area plans and specs (`README.md` per area + depth specs)
- `proc.md` — working process notes
- `AGENTS.md` — operating rules for AI agents in this repo

Start at `SYSTEM.md`, then `docs/00-meta/PLAN.md`. New work must read the relevant
`docs/<nn-*>/README.md` first.