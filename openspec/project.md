# Framique (frame30) — project context

Full-stack cloud hosting + CMS + zero-fee commerce engine for merchants.
Storefronts at `store.framique.com/<slug>` plus custom domains. Merchants get
a WordPress-grade admin (`/dashboard`): Appearance › Themes, Plugins, visual
page builder, content, orders, analytics — no third-party app bloat.

## Stack

Bun (ESM) · TanStack Start + Router + React Query · Tailwind CSS v4 +
shadcn/ui (New York) · self-hosted Supabase (Postgres, RLS, GoTrue) + Redis ·
Vite 8 + Nitro · OpenResty + ACME TLS · Prometheus/Grafana/Loki/Sentry.

## Non-negotiables (see AGENTS.md)

- Server-only trust: price, discount, stock, tax, entitlement, risk, role.
- Money in integer minor units (`amount_minor_int` + `currency_code`).
- Secrets never leave `*.server.ts`; RLS on every public table + GRANTs.
- `*.functions.ts` = thin typed RPC; `*.server.ts` = secrets/DB/Redis.
- Append-only audit rows for every `[A]` action (actor, before, after, reason).
- Theme isolation: prod files under `src/lib/themes/<theme>/` import engine
  lib only (`@/lib/*`), never `@/components/*` (`isolation.test.ts`).
- CI is CircleCI only (`.circleci/config.yml`); never touch `.github/`.

## Verification order

`typecheck` → `test` → `test:contracts` → `schema:check` → `gates:release`.
No fabricated counts/ratings/copy; every action button needs a working
server path. Live preview: `http://localhost:3000/theme-preview/<key>`.
