# Build a Framique plugin

Last verified 2026-09-26.

## Two distribution models (Frame30)

- **Official plugins** (`product-reviews`, `store-analytics`,
  `whatsapp-chat`, registered in `src/lib/official-plugins.ts`) are
  first-party source in this repo. No ZIP is checked in or downloadable;
  installs build deterministically from source and run the same pipeline
  gates (validators, ledger, sandbox, capabilities, scope consent) as any
  other install — built-in status never bypasses tenant authorization or
  sensitive-operation checks.
- **Custom plugins** (this guide) are merchant/community ZIP packages
  through the `installPackage` pipeline with sandbox, capabilities, scope
  consent, versioning, asset isolation and rollback. Failed installs never
  touch other tenants.

This guide takes you from an empty folder to a reviewed plugin listing: one
namespaced widget, one signed server hook, one consent screen. Work through it
in order. Each section points at the exact source that enforces the rule, so a
rejection never comes as a surprise.

Start from the runnable example in
`examples/starter-plugin/`. It ships a valid manifest, one widget, and a
vitest suite that mirrors the real validation gates. Run its tests first, then
adapt it.

```bash
npx vitest run --config examples/starter-plugin/vitest.config.ts
```

## Declare a manifest the validator accepts

Write a manifest JSON object and run it through `parseManifest` in
`src/lib/plugin-manifest.ts:191` before submitting. That function is the single
gate the review pipeline, the install flow, and the host all share, so passing
it locally means passing it everywhere.

Field rules:

| Field             | Rule                                                                                                                                                | Enforced at                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `id`              | Lowercase, starts with a letter, 3–40 chars: `^[a-z][a-z0-9-]{2,39}$`                                                                               | `src/lib/plugin-manifest.ts:292,401` |
| `version`         | Strict semver `major.minor.patch` digits only, e.g. `1.0.0`                                                                                         | `src/lib/plugin-manifest.ts:311,404` |
| `api`             | `^3.0.0` or `>=3.0.0 <4.0.0`. Anything else (`latest`, `*`) is rejected                                                                             | `src/lib/plugin-manifest.ts:311`     |
| `permissions`     | Only the 10 scopes in the table below. Unknown scopes fail the install                                                                              | `src/lib/marketplace-scopes.ts:24`   |
| `widgets[].key`   | Lowercase, 2–40 chars: `^[a-z][a-z0-9_-]{1,39}$`, unique per manifest                                                                               | `src/lib/plugin-manifest.ts:293`     |
| `widgets[].slots` | At least one of `header`, `main`, `footer`, or a menu slot (`menu_bar`, `menu_dropdown`, `menu_drawer`). Anything else is dropped, then empty fails | `src/lib/plugin-manifest.ts:26,43`   |
| `widgets[].entry` | Non-empty JS with no `eval(`, `import(`, or `new Function`                                                                                          | `src/lib/plugin-manifest.ts:446-452` |
| `hooks`           | Only `cart.calculate`, `checkout.validate`, `order.created`, `product.saved`                                                                        | `src/lib/plugin-manifest.ts:35`      |
| `hooksUrl`        | Required when `hooks` is non-empty. HTTPS only                                                                                                      | `src/lib/plugin-manifest.ts:421`     |
| `budget`          | `jsKb` ≤ 120 and `mainThreadMs` ≤ 50. Over either limit fails validation                                                                            | `src/lib/plugin-manifest.ts:32`      |
| `settings`        | Keys follow the widget-key pattern. `select` kinds need a non-empty `options` list                                                                  | `src/lib/plugin-manifest.ts:136`     |

Two cross-field rules catch most first submissions: a manifest with widgets
must request `render_storefront` (`src/lib/plugin-manifest.ts:265`), and the
builder API version you declare must satisfy the running builder —
`BUILDER_API_VERSION` is `3.1.0` (`src/lib/plugin-manifest.ts:18`), so declare
`^3.0.0` and stay on major 3 until the platform announces otherwise.

Request the minimum scopes the feature needs. Reviewers reject display widgets
that ask for `read_customers`, and every extra scope costs conversion on the
consent screen.

| Scope               | Risk   | Unlocks                                       |
| ------------------- | ------ | --------------------------------------------- |
| `read_shop`         | low    | `shop.info` — store name, currency, locale    |
| `read_products`     | low    | `products.list` — catalog and prices          |
| `write_analytics`   | low    | `analytics.track` — PII-minimal events        |
| `read_menus`        | low    | `menus.list` — menu labels and links          |
| `read_orders`       | medium | `orders.list` — totals and line items         |
| `write_cart`        | medium | `cart.add`, `cart.remove`                     |
| `render_storefront` | medium | Mount widgets; read `plugin.settings`         |
| `read_customers`    | high   | `customers.get` — names, phones, addresses    |
| `write_products`    | high   | `products.update` — prices and stock          |
| `replace_menus`     | high   | Full nav renderer swap; needs review approval |

## Keep widget code inside the sandbox

Every widget renders inside a null-origin iframe (`src/components/marketplace/WidgetSandbox.tsx:66`).
The frame carries `sandbox` tokens without `allow-same-origin`, so the bundle
gets no host DOM, no cookies, and no same-origin storage. A frame-level
content policy of `default-src 'none'` blocks fetch, XHR, WebSockets, images,
and remote scripts: the widget runs on the bytes it shipped with, nothing more.

The only channel out is `window.framique.call(method, params)`. The host
authorizes each message with `authorizeWidgetCall`
(`src/lib/marketplace-scopes.ts:267`) and rejects anything malformed, any
method outside this allow-list, or any method whose scope the merchant did not
grant:

| Method            | Required scope      | Writes |
| ----------------- | ------------------- | ------ |
| `plugin.settings` | `render_storefront` | no     |
| `shop.info`       | `read_shop`         | no     |
| `products.list`   | `read_products`     | no     |
| `products.update` | `write_products`    | yes    |
| `orders.list`     | `read_orders`       | no     |
| `customers.get`   | `read_customers`    | no     |
| `cart.add`        | `write_cart`        | yes    |
| `cart.remove`     | `write_cart`        | yes    |
| `analytics.track` | `write_analytics`   | yes    |
| `menus.list`      | `read_menus`        | no     |

Design for denial: `plugin.settings` answers from the merchant's validated
values, everything else delegates to the host, and a `sandbox.scope_denied`
reply surfaces as a blocked-call notice under the frame rather than a crash.
Payment credentials, staff accounts, platform administration, and raw SQL are
reachable from no scope.

Three bundle rules follow from the sandbox:

- Keep `eval(`, `import(`, `new Function`, `document.write(`, and
  `.innerHTML =` out of the entry. The bundle gate rejects them as
  `bundle.dynamic_code` (`src/lib/marketplace-scopes.ts:211`).
- Keep the uploaded bundle under 512 KB (`MAX_BUNDLE_BYTES`,
  `src/lib/marketplace-scopes.ts:183`) and the entry string under 200 KB.
- Floating widgets (chat bubbles) live in a parent-hosted 56 px frame. Render
  in-flow and fill the frame: `position:fixed` inside the entry resolves
  against the tiny iframe viewport and renders clipped or invisible
  (`src/lib/plugin-manifest.ts:62`).

## Address each widget with a namespaced key

Widgets live in a namespaced tier, never in the core registry. The key shape is
`plugin:{pluginId}/{widget}` (`src/lib/plugin-manifest.ts:93`), for example
`plugin:starter-hello/greeting`. The builder renders every plugin widget
through the single `plugin_block` renderer; the core widget enum stays closed
to third-party branches.

Place widgets with `pluginTrayEntries` (`src/lib/plugin-manifest.ts:467`),
which lists one entry per widget per slot for installed, enabled, compatible
plugins. The Studio editor unions those entries across slots
(`src/components/builder/studio/plugin-tray.ts:32`). On the storefront,
`PluginLayer` supplies installed plugins through a provider and `StudioNodes`
renders the sandbox island for placed blocks, or a labeled placeholder when
the plugin is missing, disabled, or incompatible — never a crash. Theme chrome
renders no plugin markup of its own, so theme rewrites cannot break plugin
output.

A resolution can only fail in five labeled ways
(`src/lib/plugin-manifest.ts:436`): `bad_key`, `not_installed`,
`unknown_widget`, `incompatible`, `disabled`. Test each one; shoppers see the
placeholder copy for that reason.

## Subscribe to server hooks that cannot break checkout

Server hooks are queued outbound POSTs to `hooksUrl`, never in-process code.
Four hooks exist (`src/lib/plugin-manifest.ts:35`):

| Hook                | Fires at                          | Merchant must grant               |
| ------------------- | --------------------------------- | --------------------------------- |
| `cart.calculate`    | Cart capture                      | `read_products`, `write_cart`     |
| `checkout.validate` | Stock reservation                 | `read_orders`, `write_cart`       |
| `order.created`     | Order creation                    | `read_orders`                     |
| `product.saved`     | Catalog import / kind-config save | `read_products`, `write_products` |

The required-scope map is `HOOK_SCOPE` (`src/lib/scope-adapter.ts:35`). A
subscriber missing any required scope is skipped as `skipped:scope` with zero
fetch, and a slow or failing subscriber never blocks the host commit: calls
time out at 800 ms (`HOOK_TIMEOUT_MS`, `src/lib/plugin-hooks.server.ts:20`),
trip a per-plugin breaker after 3 failures, and fall back to a queued retry.

Every delivery carries an idempotency identity,
`hook:{plugin}:{hook}:{hash}` of the exact bytes posted, sent as the
`x-framique-delivery` header and reused across live attempts, queued retries,
and redeliveries. Vendors dedupe on that header; the transport is
at-least-once by design.

Deliveries are signed. When `PLUGIN_HOOK_SECRET` is set, each POST carries a
`framique-signature: t={unix},v1={hmac-sha256}` header over the body. An unset
secret is loud, never silent: the platform logs `plugin.hook.unsigned_secret`,
emits an unsigned metric, and refuses to deliver outside test environments.
Verify the signature on receipt and reject missing or stale timestamps.

## Walk the install, consent, and disable lifecycle

The lifecycle states are `installing → active ⇄ suspended → uninstalling →
purged`, mirrored in the audit log at each step.

1. **Install.** `installListing` (`src/lib/marketplace-install.server.ts:51`)
   checks the listing is active and version-compatible, runs the bundle gate
   before any write, then records the ledger row idempotently on your
   idempotency key.
2. **Consent.** The grant must be a subset of the manifest's permissions.
   Unknown or superset scopes fail with `plugin_consent_required` and write
   nothing; an empty grant is valid. Consent evidence (`consented_by`,
   `manifest_version`, granted scopes) lands on the install row plus a
   `plugin.scopes_granted` audit row. Updates that widen permissions need a
   fresh consent screen (`reconsented: true`) or they are refused
   (`src/lib/plugins.server.ts:106`).
3. **Enable.** Merchants pause and resume with an enabled flag. Reads fold the
   merchant flag, suspensions, and the platform kill switch into one `enabled`
   value (`src/lib/plugins.server.ts:61`), so one check gates widgets, hooks,
   and sidecar workers.
4. **Suspend and resume.** `suspendPlugin` / `resumePlugin`
   (`src/lib/plugin-lifecycle.server.ts:42`) record a reason
   (`scope_revoked`, `envelope_breach`, `review_regression`, `kill_switch`,
   `operator`), stop or restart workers, and audit the transition. Suspend is
   idempotent; resuming an active install fails closed with
   `plugin_invalid_transition:active->resume`. Queued deliveries are never
   cancelled, so resume drains naturally under idempotency keys.
5. **Kill switch.** The platform kill switch is global per plugin id
   (`setPluginKillSwitch`, `src/lib/plugins.server.ts:325`). Engaging it
   auto-suspends every merchant install with reason `kill_switch`; releasing
   it does not auto-resume.
6. **Uninstall and purge.** Widget uninstall parks the ledger row on
   `uninstalling` and enqueues a durable `plugin.purge` job
   (`src/lib/marketplace-install.server.ts:455`). The job deletes the plugin
   state row, drains undelivered queue rows for that plugin, lands the ledger
   on terminal `purged`, stops the worker, and writes exactly one
   `plugin.purged` audit row (`src/lib/plugin-lifecycle.server.ts:156`).
   Reruns are safe no-ops (`already_purged`).

## Pass review on the first submission

New versions are content-addressed: resubmitting identical bytes returns the
existing row instead of creating a duplicate (`publishVersion`,
`src/lib/marketplace-vault.server.ts:73`). Versions must move strictly forward
in semver, and breaking scope additions belong on a major bump.

The status path is `draft → review → active`, with `paused` and `archived`
for moderation (`reviewVersion`, `src/lib/marketplace-vault.server.ts:208`;
seller transitions in `src/lib/marketplace-install.server.ts:394`). Only
`active` listings install, and installs pin the reviewed version — moving the
pin re-runs review.

Before submitting, confirm the checklist the sandbox-limits guide uses:
requested scopes are the minimum the feature needs, budgets sit inside
`PLUGIN_BUDGET`, every hook and slot comes from the documented lists, and a
staging install shows no `scope_denied` verdicts (those mean the manifest and
the code disagree). Localize user-facing strings in both English and Bangla:
missing Bangla keys only warn (`i18n.bn_missing`), but reviewers notice.

## Charge for plugins with the one-time and trial rails

Plugin monetization runs on two rails today: one-time charges and trials.

- **Revenue split.** Each paid install posts one ledger entry split 70% seller
  and 30% platform (`SELLER_SHARE_BASIS_POINTS = 7000` in
  `src/lib/marketplace.server.ts:10`; the seller share rounds down to the
  minor unit). Seller earnings accrue into marketplace payouts
  (`src/lib/marketplace-vault.server.ts:284`).
- **One-time price.** The install charges `price_minor_int` once at install
  time (`src/lib/marketplace-install.server.ts:118`). Set `0` for free
  plugins.
- **Trials.** Set `trial_allowed` on the listing to offer a 14-day trial
  (`TRIAL_DAYS`, `src/lib/marketplace.server.ts:9`). Trial installs charge `0`,
  land on status `trial` with an expiry timestamp, and convert through the
  standard install path.

**No subscription engine exists for plugins.** There is no recurring charge,
no proration, and no renewal cron for marketplace installs — the platform
bills the one-time amount once and never re-bills. Do not advertise
per-month or per-seat plugin pricing as platform-billed; it is not.

The supported workaround is self-billing: run recurring billing in your own
service behind `hooksUrl` (or any endpoint you operate), collect payment
there, and gate your own responses when an account lapses. The platform takes
no cut of off-platform charges and provides no entitlement sync for them, so
state the billing model, the trial length, and the cancel path on the listing.
If subscriptions land on the platform later, listings that already self-bill
keep working unchanged.

## Know the current limits

- Slot vocabulary differs by layer: plugin widgets use `header`, `main`,
  `footer` (`BLOCK_SLOTS`), while the older vault block path validates
  against `header`, `body`, `product`, `cart`, `footer` (`BLOCK_TARGETS` in
  `src/lib/marketplace-scopes.ts:228`). Declare plugin widget slots from the
  first list only.
- The billing gap above (one-time plus trial only) is the largest monetization
  limit. Track it before promising subscription pricing to customers.
- Hook payloads are PII-minimal by construction. Payloads that carried emails,
  phone numbers, or names fail emission tests; build features that need
  personal data through the scoped bridge methods (`customers.get`,
  `orders.list`) instead of hook bodies.
- Settings coerce to their schema and drop unknown keys
  (`validateSettings`, `src/lib/plugin-manifest.ts:363`). reads serve
  validated values only, so a setting the merchant never saved arrives as its
  default, never as `undefined` handling you must invent.
