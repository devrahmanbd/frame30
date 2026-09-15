# Framique Engineering Rules

> Keep the repository in a clean, working state. All tests and type checks must pass before pushing changes.

## What Framique Is

Framique is a **full-stack cloud hosting service provider** — we do everything: CMS, visual storefront builder, zero-fee commerce engine, payments, courier dispatch, themes, analytics, AI support, and infrastructure. Merchants get a complete storefront at `store.framique.com/<slug>` plus optional custom domains. We handle hosting, databases, auth, CDN, observability, backups, and deployments end-to-end. No third-party app bloat, no per-transaction fees, no vendor lock-in.

## Stack

- **Runtime**: Bun (ESM, `"type": "module"`)
- **Framework**: TanStack Start + TanStack Router + TanStack React Query
- **Styling**: Tailwind CSS v4 + shadcn/ui (New York style)
- **Backend**: Self-hosted Supabase (Postgres, RLS, GoTrue) + Redis
- **Build**: Vite 8 + Nitro
- **Edge**: OpenResty + ACME TLS, Blue/Green canary deploys
- **Observability**: Prometheus + Grafana + Loki + Sentry (all self-hosted)

## Commands

```bash
bun install && bun run dev        # dev server (port 3000)
bun run lint                      # ESLint
bun run format                    # Prettier
bun run typecheck                 # tsgo --noEmit
bun run test                      # Vitest (unit + contract)
bun run test:contracts            # contract gate only
bun run e2e                       # Playwright (all suites)
bun run e2e:critical              # Playwright (critical suites only)
bun run schema:check              # repo migrations vs live schema
bun run secrets:scan              # secret scanning
bun run gates                     # full release gate suite
bun run gates:release             # perf, seo, a11y, vitals, responsive
bun run a11y:gate                 # axe-core, >= 90 score
```

**Verification order**: `typecheck` → `test` → `test:contracts` → `schema:check` → `gates:release`

## File Conventions

| Pattern | Purpose |
|---------|---------|
| `*.functions.ts` | `createServerFn` wrappers — thin typed RPC boundary only |
| `*.server.ts` | Server-only code: secrets, DB, Redis, external calls |
| `*.test.ts` | Unit/integration tests |
| `*.contract.test.ts` | Contract tests |
| `src/routes/**/*.tsx` | TanStack Router file-based routes |

**Path alias**: `@/*` maps to `./src/*`

## Architecture Rules (non-negotiable)

1. **No client-trusted decisions**: price, discount, stock, tax, entitlement, risk, and role resolve server-side only.
2. **Integer minor units for money**: `amount_minor_int` + `currency_code`. No floats stored, transmitted, or computed.
3. **Secrets never leave the server boundary**: never in error bodies, logs, or metric labels.
4. **RLS on every public table** plus explicit `GRANT`s per role.
5. **No `server-only` import** — use `*.server.ts` naming instead (ESLint enforced).
6. **Append-only audit rows** for every `[A]` action (actor, before, after, reason).

## Testing

- `vitest.config.ts` sets `passWithNoTests: false` — tests are required.
- Test files live next to the code they test in `src/lib/`.
- `[A]` (money, security, tenant isolation) features need deny cases + replay cases + audit assertions, not just happy paths.
- E2E suites: `store_loop`, `admin_loop`, `builder_loop`, `market_loop`, `public_loop`, `failure_loop`, `owner_loop`, `currency_gate`, `fraud_loop`, `ai_support_loop`, `tenant_isolation`.

## Bun Supply-Chain Guard

`bunfig.toml` enforces a **24h minimum release age** for all npm packages. No bypasses in `minimumReleaseAgeExcludes` without explicit approval. This prevents supply-chain attacks from freshly published malicious packages.

## SEO & Marketing

`SEO/` contains the full semantic SEO vault: keyword research, topical authority maps, content briefs, schema specs, comparison routes, and editorial playbooks. See `SEO/README.md` for the master index.

## Related Docs

- `SYSTEM.md` — architecture, stack decisions, deployment topology
- `BUILD.md` — feature ledger with `[A]` risk markers and testing gates
- `DESIGN.md` — design system tokens and component specs
- `TODO.md` — active execution plan
- `docs/` — per-area planning specs (18 directories)
