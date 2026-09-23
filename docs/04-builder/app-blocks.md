# App blocks (widget catalog & sandbox)

Status: Planning · Slices S3/S7 · Reference: `/plan.md` §3.4 (widget API), 3.9 (marketplace/plugins)
Plans: `theme-registry.md` (widgets install list) · `theme-runtime.md` (TR-8 render contract) · `sections-templates.md` (slot allowlists) · E2E: `docs/15-e2e/theme_registry.md`
Schema: 💾 additive `widget_catalog` + `widgets` columns (Tenant009; Tenant007 marketing, Tenant008 publishing)

## 1. Purpose

Own a single, governed definition of every widget a merchant can drop on a page — the **block catalog**: kind names, JSON-schema'ed props/styles, rendering kind, and sandbox rules for community widgets. The page AST (`{ widget, instance, props, styles }`) is validated against the catalog and nothing else; the editor, storefront runtime, and marketplace all read the same catalog. Logic that decides what a widget may render — kind, props, sandbox, entitlement — that lives outside the catalog is a defect.

## 2. Scope

In scope:

- The canonical catalog: built-in kinds, schema validation, per-row status (`verified` / `draft` / `blocked`), and the per-merchant install list.
- Sandbox contract for community bundles: versioned, hash-pinned, capability-limited; "never load on failed validation".
- Server-side props validation for every AST write — the client never decides what a widget may render.
- Entitlement gating for `custom_html` and community widgets.

Out of scope:

- Marketplace storefront UI (that surface is `12-marketplace`); this doc defines the catalog contract it distributes.
- The render pipeline (`theme-runtime.md` TR-2) and slot rules (`sections-templates.md`) — this doc gates widget kinds, not layout.
- Editor UI chrome; only design guidelines ride here.

## 3. Block model — how one block connects everywhere

A **block** is the canonical definition of one widget kind. In the page AST it appears unchanged from today: `{ "widget": "<slug>", "instance": "<uid>", "props": {}, "styles": {} }` (sections-templates.md §3). Every catalog row:

| Field               | Meaning                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| `slug`              | stable kind key — the AST `widget` value (e.g. `product_grid`)                        |
| `label`, `label_bn` | editor tray labels (EN keys; Bangla strings are fine in code, AGENTS.md §7)           |
| `schema`            | JSON Schema of `props` + `styles`; the authoritative validator                        |
| `kind`              | `core` (ships with builder) or `community` (marketplace)                              |
| `status`            | `verified` (servable), `draft` (submitted, not yet reviewed), `blocked` (never loads) |
| `sandbox`           | community only: entry module + capability allowlist (§7)                              |
| `min_plan`          | plan family gate; matched server-side, never client-side                              |

Catalog rows are written by the registry service only (mirror of `theme_versions` in theme-registry.md §3.1). Everyone else — editor, runtime, marketplace — reads through RPCs: `app.widget_catalog()` (anon-safe, verified + core only) and `app.widget_installed()` (owner scope).

## 4. v0 catalog (built-in, `kind = core`)

| slug                                                 | allowed slots (slot schemas live in theme-registry.md) |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `heading`, `text`, `image`, `custom_html`, `marquee` | any slot incl. header/footer layout groups             |
| `product_grid`, `collection_grid`                    | any main slot                                          |
| `buy_box`, `trust`, `countdown`, `faq_accordion`     | buybox slot only                                       |
| `video`, `form`                                      | any main slot                                          |

Deferred to the S7 marketplace extension (plan.md §3.4): `slider`, `testimonial`, `review`, `action_button` — they arrive as new catalog rows under the same schema/sandbox rules as any other widget. Slot-level allowlists stay per template (sections-templates.md); the catalog only constrains widget kinds.

## 5. Server-side validation (write path)

Every `props`/`styles` object is validated at AST write time on the server:

```
write_page(p_ast, p_page_id)
  → per widget: catalog.schema validates props + styles
  → any violation aborts the entire write (atomic), returns
    ast_invalid + the offending { widget, instance } pair
```

No validation by-pass exists: a failing widget JSON never lands in a page revision. Editor-side checks are comfort only; the server is the decision point (hard rule: no client-trusted decisions). This is separate from render-time failure (TR-8 skip + placeholder, §10) — write validation rejects, render failure degrades.

## 6. Entitlements

- `custom_html` and `kind = community` rows are not free-tier surfaces: install and render both require `check_entitlement(merchant_id, 'widget_custom')`; a plan deficit returns `plan_limit_exceeded` (same pattern as sections-templates.md limits).
- The snapshot RPC (`app.widget_snapshot()`) reports `blocked` status to the merchant's editor so the merchant knows why a widget stopped rendering — an uninstall or cleanup decision needs that code owner.

## 7. Versioned sandbox (community widgets)

Deployed with the marketplace (S7) — the contract is pinned here from day 1 (guardrail 4):

1. A bundle = a versioned catalog row; assets live on the CDN behind a `bundle_sha256` integrity pin. A re-publish ships a new version row; in-place mutation is forbidden.
2. At install: hash verified, JSON schema validated, then the sandbox capability set is applied. A failing validation means the widget is **never loaded**.
3. At render: scripts execute only inside a sandboxed iframe with a `postMessage` allowlist (parity with theme-runtime.md §2 bridge). No direct `fetch` / `localStorage` from the widget — data flows through the host's message channel.
4. A runtime sandbox violation degrades the widget to the standard TR-8 placeholder, flips the catalog row to `blocked`, and fires `widget.blocked` with reason: `sandbox_rejected | schema_regression | cves`.

The storefront never executes untrusted JS outside this sandbox; theme upgrades that pull a blocked widget keep serving the last-good bundle (theme-registry.md §8 pattern).

## 8. Events & audit

- `widget.installed` — install, version change, removal (the install list row is the source of truth).
- `theme.updated` — unchanged existing event on page-save mutations.
- `widget.blocked` — new; fires on §7.4 with the reason enum.
- All events tenant-scoped, PII-minimal, raw retention 90 days (AGENTS.md §6); audit rows live in the registry `theme_audit` table.

## 9. Persistence (additive, Tenant009)

`widget_catalog` — global, write:service-only, no direct tenant writes:
`id, slug unique, label, label_bn, kind, schema jsonb, sandbox jsonb, min_plan text null, status text default 'verified', bundle_url, bundle_sha256, created_at, updated_at`

`widgets` (existing registry table) becomes the per-merchant install list:
`id, merchant_id, widget_id → catalog, version text, status (installed | blocked), created_at, revoked_at`

- RLS: `merchant_id` scoping on `widgets` mandatory; catalog rows are readable by tenants only through the RPC views (mirror of `theme_versions`).

## 10. Failure & recovery

- Unknown/removed widget slug on page load → skip + placeholder (TR-8: one bad widget never breaks a page).
- Bundle 404 / hash mismatch at render → placeholder this paint, retry next; staleness heals via the snapshot RPC.
- Version conflict: an installed pin stays on its pinned version; a breaking change is a new catalog row, never an in-place upgrade of a live install.

## 11. Design guidelines — widget tray, inspector, placeholder

- Intent: additive and calm — the tray is a picker, the inspector a form, and the canvas stays the star; chrome recedes (builder chrome rules).
- Key surfaces: tray rail (left), property inspector (right), canvas with drag ghost, amber "unsaved" dot vs publish mint in the top bar; blocked widget shows reason text + icon, never color alone.
- Palette: monochrome slate chrome; BD-teal accents only for selection; Rickshaw for `blocked`; mint for publish-ready.
- Typography: compact 0.875rem panels and forms; real theme fonts (Bangla display) in preview; tabular numbers for width/offset inputs.
- Density: 4px snap grid, keyboard-first (arrow keys nudge, Enter commits), fields stacked tight.
- Motion: drag ghost 120ms, panel slide 200ms, device switch crossfade 240ms; `prefers-reduced-motion` collapses to opacity only.
- A11y: tray items selectable and keyboard-draggable; inspector is a labeled form; focus ring visible; status never color-only.
- Performance: only requested widget kinds load (lazy catalog fetch), ETag-cached snapshot reads.
- Anti-slop: hand-drawn-style widget glyphs (consistent with builder README), Bangla tray labels, and one empty state: "এক-ক্লিকে উইজেট যোগ করুন"।

## 12. Testing gates

- Per-kind schema validation suite: valid/invalid props matrix; a single invalid offender aborts the write with `ast_invalid`.
- Sandbox regression test: a bundle that attempts direct `fetch` must fail sandbox validation and never load.
- E2E (contract-first, `.e2e` once the storefront harness exists — see sections-templates.md §12): install → drop → publish; blocked-widget flow shows placeholder and an audit row.
- Lighthouse a11y ≥ 90 on the widget tray surface.

## 13. Residual v0 gaps

- Community marketplace storefront and third-party onboarding land with S7 (`12-marketplace`); this doc pins the catalog contract they plug into.
- Review/approval for community submissions (catalog `status = draft`) is the marketplace operator flow — routed to the review facility in spec 6 — not yet built.
- Per-widget entitlements beyond `widget_custom` (custom_html + community) come with a native `check_entitlement` matrix later.
- `widget.blocked` daemon-event push is v0-polled via snapshot RPC; a pub/sub event bus arrives with the runtime events work.
- `slider`, `testimonial`, `review`, `action_button` kinds remain on the S7 backlog until a release theme needs them (plan.md §3.4/7).
