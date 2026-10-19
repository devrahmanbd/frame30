# Build a Framique plugin

Last verified: 2026-10-18 @ 900b0adc7f7b

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
namespaced widget with schema-generated props, one signed server hook, one
consent screen. Work through it in order. Each section points at the exact
source that enforces the rule, so a rejection never comes as a surprise.

Start from the runnable example in
`examples/starter-plugin/`. It ships a valid manifest, one widget with a
`propsSchema`, and a vitest suite that mirrors the real validation gates.
Run its tests first, then adapt it:

```bash
cd examples/starter-plugin && npx vitest run
```

## Declare a manifest the validator accepts

Write a manifest JSON object and run it through `parseManifest` in
`src/lib/plugin-manifest.ts:1177` before submitting. That function is the
single gate the review pipeline, the install flow, and the host all share,
so passing it locally means passing it everywhere.

Field rules:

| Field                   | Rule                                                                                                                                                | Enforced at                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `id`                    | Lowercase, starts with a letter, 3–40 chars: `^[a-z][a-z0-9-]{2,39}$`                                                                               | `src/lib/plugin-manifest.ts:414`, `src/lib/plugin-manifest.ts:1182-1185`       |
| `version`               | Strict semver `major.minor.patch` digits only, e.g. `1.0.0`                                                                                         | `src/lib/plugin-manifest.ts:1187-1188`           |
| `api`                   | `^3.0.0` or `>=3.0.0 <4.0.0`. Anything else (`latest`, `*`) is rejected                                                                             | `src/lib/plugin-manifest.ts:1190-1191`, `src/lib/plugin-manifest.ts:463-484`   |
| `permissions`           | Only the 10 scopes in the table below. Unknown scopes fail the install                                                                              | `src/lib/marketplace-scopes.ts:26`               |
| `widgets[].key`         | Lowercase, 2–40 chars: `^[a-z][a-z0-9_-]{1,39}$`, unique per manifest                                                                               | `src/lib/plugin-manifest.ts:415`, `src/lib/plugin-manifest.ts:1220-1224`       |
| `widgets[].slots`       | At least one of `header`, `main`, `footer`, or a menu slot (`menu_bar`, `menu_dropdown`, `menu_drawer`). Anything else is dropped, then empty fails | `src/lib/plugin-manifest.ts:46`, `src/lib/plugin-manifest.ts:1225-1235`        |
| `widgets[].entry`       | Non-empty JS with no `eval(`, `import(`, or `new Function`                                                                                          | `src/lib/plugin-manifest.ts:422-423`, `src/lib/plugin-manifest.ts:1241-1250`   |
| `hooks`                 | Only `cart.calculate`, `checkout.validate`, `order.created`, `product.saved`                                                                        | `src/lib/plugin-manifest.ts:38-43`               |
| `hooksUrl`              | Required when `hooks` is non-empty. HTTPS only                                                                                                      | `src/lib/plugin-manifest.ts:1204-1208`           |
| `budget`                | `jsKb` ≤ 120 and `mainThreadMs` ≤ 50. Over either limit fails validation                                                                            | `src/lib/plugin-manifest.ts:35`, `src/lib/plugin-manifest.ts:1400-1402`        |
| `settings`              | Install-global schema: keys follow the widget-key pattern; `select` needs a non-empty `options` list                                                | `src/lib/plugin-manifest.ts:492-543`             |
| `widgets[].propsSchema` | Per-instance field list; each field is one of the 22 closed kinds (next section)                                                                     | `src/lib/plugin-manifest.ts:562-580`, `src/lib/plugin-manifest.ts:1267-1278`   |
| `widgets[].defaultProps`| Default record merged over the schema-derived defaults; keys outside `propsSchema` are stripped                                                     | `src/lib/plugin-manifest.ts:1279-1302`           |
| `widgets[].themeable`   | Class B contract: `version: 1` plus a non-empty `schema` ref (see Class A/Class B below)                                                             | `src/lib/plugin-manifest.ts:1251-1262`           |

Two cross-field rules catch most first submissions: a manifest with widgets
must request `render_storefront` (`src/lib/plugin-manifest.ts:1363-1368`), and the
builder API version you declare must satisfy the running builder —
`BUILDER_API_VERSION` is `3.1.0` (`src/lib/plugin-manifest.ts:32`), so declare
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

## Give widgets schema-generated props

A widget carries a per-instance schema — the same declarative contract the
rest of the platform uses — in its `widgets[]` entry. The canonical field
shape is `PropField` in `src/lib/widget-props.ts:69-103`, single-sourced into
the manifest gate as `PluginWidgetPropField` — an alias, never a copy
(`src/lib/plugin-manifest.ts:386-393`). The full contract (identity, schemas,
slots, responsive controls, rendering modes, fallback) is documented in
[the widget contract](../04-builder/app-blocks.md); this section covers the
manifest surface a plugin author writes.

Sample definition (this exact block ships in
`examples/starter-plugin/manifest.json`, widget `greeting`):

```json
{
  "key": "greeting",
  "label": "Hello greeting",
  "slots": ["main"],
  "entry": "widget.js",
  "propsSchema": [
    {
      "key": "heading",
      "label": "Greeting text",
      "kind": "text",
      "max": 120,
      "default": "Hello from the starter plugin."
    },
    {
      "key": "tone",
      "label": "Tone",
      "kind": "select",
      "options": [
        { "value": "plain", "label": "Plain" },
        { "value": "warm", "label": "Warm" }
      ],
      "default": "plain"
    },
    {
      "key": "show_note",
      "label": "Show note",
      "kind": "boolean",
      "default": false
    }
  ],
  "defaultProps": {
    "heading": "Hello from the starter plugin.",
    "tone": "plain",
    "show_note": false
  }
}
```

- `propsSchema` accepts the 22 kinds exported as `PROP_KINDS`
  (`src/lib/widget-props.ts:28-51`): `text`, `richtext`, `number`,
  `boolean`, `select`, `color`, `typography`, `spacing`, `dimensions`,
  `responsive`, `image`, `media`, `video`, `product`, `collection`,
  `category`, `repeater`, `group`, `link`, `icon`, `visibility`,
  `animation`. A manifest must not invent controls: an unknown kind fails
  the gate with `widgets[i].propsSchema[j].kind`
  (`src/lib/plugin-manifest.ts:687-691`). `select` requires 1–32 `options`
  (`:699-734`); `repeater` and `group` nest scalar `fields` (depth ≤ 3,
  `:586-593`); `default` accepts any JSON value (`:737-740`); `showWhen`
  gates a control on another field's value (`:766-787`). Duplicate keys are
  skipped first-wins (`:811-819`).
- `defaultProps` is optional; the registry adapter merges it over the
  schema-derived defaults with the shared value layer
  (`src/lib/unified-widget-registry.ts:1267-1275`). Keys outside
  `propsSchema` are stripped there, so only declared keys survive.
  The record is capped at 32 KB (`src/lib/plugin-manifest.ts:587`) and a
  schema at 50 fields per level (`:586`).
- Validation is one module both sides call: the studio validates drafts
  with `validateProps` (`src/lib/widget-props.ts:582-589`) and the server
  commit path re-validates with the same module before anything is stored
  (`src/lib/themes.server.ts:445-453`). Unknown props are stripped, values
  that cannot be cleaned fall back to the schema default, and a validated
  record is safe to store or render without further guards.

### Install settings stay separate from instance props

Two schemas live in one manifest and the runtime never merges them:

- `settings` is the install-global schema, validated by `validateSettings`
  (`src/lib/plugin-manifest.ts:1461-1514`) and served to the sandboxed
  bundle over the `plugin.settings` bridge method
  (`src/lib/marketplace-scopes.ts:270-271`, behind `render_storefront`).
  Every instance of the plugin sees the same validated values.
- `propsSchema` + `defaultProps` are per-instance values. The sandbox frame
  receives them as inert JSON on `window.framique.props`
  (`src/components/marketplace/WidgetSandbox.tsx:415-449`), so two placed
  instances can hold different copy while sharing one install.
- The types are structurally distinct and never cross-pollinated
  (`InstalledPlugin.settings` documentation,
  `src/lib/plugin-manifest.ts:1522-1531`); the adapter never copies a
  settings key into a widget's defaults
  (`src/lib/unified-widget-registry.ts:1267-1275`).

## Choose Class A or Class B rendering

Every plugin widget renders in one of two classes:

- **Class A (isolated)** — no `themeable` declaration. The bundle owns
  arbitrary UI inside the null-origin sandbox frame; a theme cannot restyle
  inside it, only place it.
- **Class B (themeable)** — the widget declares the versioned theme-safe
  contract (`version: 1`, `schema` ref, optional `data`/`actions`/`slots`/
  `states`, `src/lib/plugin-theme-contract.ts:44-56`). A theme can claim the
  widget's pixels through a theme presentation; undressed, it falls back to
  the identical generic sandboxed island.

The class is a presence check (`pluginWidgetClass`,
`src/lib/plugin-theme-contract.ts:66-70`), and one decision point resolves
the render: `resolveCommunityRender` returns `sandbox` for Class A, and
`theme` (dressed) or `island` (undressed) for Class B
(`src/lib/plugin-theme-contract.ts:267-297`). A malformed `themeable`
declaration fails the manifest gate instead of silently rendering as
Class A (`src/lib/plugin-manifest.ts:1251-1262`); the rendering mode is
derived when absent — `themeable` implies `themeable`, else `isolated`
(`:345-352`).

Declare the contract on the widget:

```json
{
  "themeable": {
    "version": 1,
    "schema": "greeting:v1",
    "states": ["ready"]
  }
}
```

Theme-side dressing (which theme presents which widget, and how a theme
registers its presentation) is the [theme authoring
guide](../themes/creation.md); the Class B walkthrough for both sides is in
[themeable widgets](themeable-widgets.md). Theme compatibility is declared
per widget: `themeCompatibility.themes` is an allow-list of theme keys
(absent means every theme) and `minBuilderApi` floors the builder API,
checked at resolve time — never silently substituted
(`src/lib/plugin-manifest.ts:284-293`, sanitized at `:1014-1072`).
`capabilities` declares `responsive` and whether styling uses host tokens
or stays isolated (`:279-282`).

## Test the fixture locally, then verify in the editor

The starter suite mirrors the real gates one for one:

- `examples/starter-plugin/tests/manifest.test.ts` — the manifest through
  `parseManifest` plus the rejection cases reviewers hit.
- `examples/starter-plugin/tests/lifecycle.test.ts` — install, consent,
  disable, uninstall, and tray entries through `resolvePluginWidget`,
  `pluginTrayEntries`, and `permissionDiff`.
- `examples/starter-plugin/tests/bridge.test.ts` — every sandbox bridge
  call against the granted scopes via `authorizeWidgetCall`.

Run the suite and the example typecheck:

```bash
cd examples/starter-plugin && npx vitest run
npx tsc --noEmit -p examples/starter-plugin/tsconfig.json
```

Once installed in a real tenant, place the widget from the editor:
the [widget tray](../04-builder/README.md) lists your namespaced
`plugin:{pluginId}/{widget}` entry and the inspector renders controls from
your `propsSchema`. The full journey — install and activate, find the
widget, insert it, edit schema-generated settings, check devices, preview,
save, publish, plus troubleshooting — is
[Use the editor with your extension](editor.md).

## Keep widget code inside the sandbox

Every widget renders inside a null-origin iframe
(`src/components/marketplace/WidgetSandbox.tsx:187`, `src/components/marketplace/WidgetSandbox.tsx:551`). The frame carries
`sandbox` tokens without `allow-same-origin`
(`src/lib/risk-tier.ts:103-220`), so the bundle gets no host DOM, no
cookies, and no same-origin storage. A frame-level content policy of
`default-src 'none'` blocks fetch, XHR, WebSockets, images, and remote
scripts: the widget runs on the bytes it shipped with, nothing more.

The only channel out is `window.framique.call(method, params)`. The host
authorizes each message with `authorizeWidgetCall`
(`src/lib/marketplace-scopes.ts:360`) and rejects anything malformed, any
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
  `bundle.dynamic_code` (`src/lib/marketplace-scopes.ts:239-243`).
- Keep the uploaded bundle under 512 KB (`MAX_BUNDLE_BYTES`,
  `src/lib/marketplace-scopes.ts:202`) and the entry string under 200 KB.
- Floating widgets (chat bubbles) live in a parent-hosted 56 px frame. Render
  in-flow and fill the frame: `position:fixed` inside the entry resolves
  against the tiny iframe viewport and renders clipped or invisible
  (`src/lib/plugin-manifest.ts:309-315`).

## Address each widget with a namespaced key

Widgets live in a namespaced tier, never in the core registry. The key shape is
`plugin:{pluginId}/{widget}` (`src/lib/plugin-manifest.ts:425-427`), for
example `plugin:starter-hello/greeting`. The builder renders every plugin
widget through the single `plugin_block` renderer; the core widget enum stays
closed to third-party branches.

Place widgets with `pluginTrayEntries` (`src/lib/plugin-manifest.ts:1675`),
which lists one entry per widget per slot for installed, enabled, compatible
plugins. The Studio editor unions those entries across slots
(`studioPluginTrayEntries`,
`src/components/builder/studio/plugin-tray.ts:57`). On the storefront,
`PluginLayer` supplies installed plugins through a provider and `StudioNodes`
renders the sandbox island for placed blocks, or a labeled placeholder when
the plugin is missing, disabled, or incompatible — never a crash. Theme chrome
renders no plugin markup of its own, so theme rewrites cannot break plugin
output.

A resolution can only fail in five labeled ways
(`src/lib/plugin-manifest.ts:1549-1562`): `bad_key`, `not_installed`,
`unknown_widget`, `incompatible`, `disabled`. Test each one; shoppers see the
placeholder copy for that reason.

## Subscribe to server hooks that cannot break checkout

Server hooks are queued outbound POSTs to `hooksUrl`, never in-process code.
Four hooks exist (`src/lib/plugin-manifest.ts:38-43`):

| Hook                | Fires at                          | Merchant must grant               |
| ------------------- | --------------------------------- | --------------------------------- |
| `cart.calculate`    | Cart capture                      | `read_products`, `write_cart`     |
| `checkout.validate` | Stock reservation                 | `read_orders`, `write_cart`       |
| `order.created`     | Order creation                    | `read_orders`                     |
| `product.saved`     | Catalog import / kind-config save | `read_products`, `write_products` |

The required-scope map is `HOOK_SCOPE` (`src/lib/scope-adapter.ts:37`). A
subscriber missing any required scope is skipped as `skipped:scope` with zero
fetch, and a slow or failing subscriber never blocks the host commit: calls
time out at 800 ms (`HOOK_TIMEOUT_MS`, `src/lib/plugin-hooks.server.ts:28`),
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

1. **Install.** `installListing` (`src/lib/marketplace-install.server.ts:400`)
   checks the listing is active and version-compatible, runs the bundle gate
   before any write, then records the ledger row idempotently on your
   idempotency key.
2. **Consent.** The grant must be a subset of the manifest's permissions.
   Unknown or superset scopes fail with `plugin_consent_required` and write
   nothing; an empty grant is valid. Consent evidence (`consented_by`,
   `manifest_version`, granted scopes) lands on the install row plus a
   `plugin.scopes_granted` audit row. Updates that widen permissions need a
   fresh consent screen (`reconsented: true`) or they are refused
   (`src/lib/plugins.server.ts:175-186`). The same rule holds on the ZIP
   install lane: a version that adds manifest permissions fails with
   `package.consent_required` unless `consentScopes` covers every
   addition by exact match
   (`src/lib/package-install.server.ts:1449-1462`). The consent screen
   also lists the version's external-URL inventory when present
   (`src/components/marketplace/InstallConsent.tsx:76-85`).
3. **Enable.** Merchants pause and resume with an enabled flag. Reads fold the
   merchant flag, suspensions, and the platform kill switch into one `enabled`
   value (`src/lib/plugins.server.ts:76`), so one check gates widgets, hooks,
   and sidecar workers. Enabling a flagged install is refused with
   `plugin.approval_required` until the merchant records approval for
   that exact plugin id + manifest version (`approvePluginVersion`,
   `src/lib/plugins.server.ts:416`, audited as `plugin.approved`);
   the check lives in `setPluginEnabled`
   (`src/lib/plugins.server.ts:302-350`). Disabling is always safe.
4. **Suspend and resume.** `suspendPlugin` / `resumePlugin`
   (`src/lib/plugin-lifecycle.server.ts:47`, `src/lib/plugin-lifecycle.server.ts:95`) record a reason
   (`scope_revoked`, `envelope_breach`, `review_regression`, `kill_switch`,
   `operator`), stop or restart workers, and audit the transition. Suspend is
   idempotent; resuming an active install fails closed with
   `plugin_invalid_transition:active->resume`. Queued deliveries are never
   cancelled, so resume drains naturally under idempotency keys.
5. **Kill switch.** The platform kill switch is global per plugin id
   (`setPluginKillSwitch`, `src/lib/plugins.server.ts:518`). Engaging it
   auto-suspends every merchant install with reason `kill_switch`; releasing
   it does not auto-resume.
6. **Uninstall and purge.** Widget uninstall parks the ledger row on
   `uninstalling` and enqueues a durable `plugin.purge` job
   (`src/lib/marketplace-install.server.ts:1504`, `src/lib/marketplace-install.server.ts:1555`). The job deletes the
   plugin state row, drains undelivered queue rows for that plugin, lands the
   ledger on terminal `purged`, stops the worker, and writes exactly one
   `plugin.purged` audit row
   (`src/lib/plugin-lifecycle.server.ts:161`, `src/lib/plugin-lifecycle.server.ts:247`). Reruns are safe no-ops
   (`already_purged`, `:170-171`).

## Pass review on the first submission

New versions are content-addressed: resubmitting identical bytes returns the
existing row instead of creating a duplicate (`publishVersion`,
`src/lib/marketplace-vault.server.ts:73`). Versions must move strictly forward
in semver, and breaking scope additions belong on a major bump.

The status path is `draft → review → active`, with `paused` and `archived`
for moderation (`reviewVersion`, `src/lib/marketplace-vault.server.ts:208`;
seller transitions in `src/lib/marketplace-install.server.ts:1243`). Only
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
  `src/lib/marketplace.server.ts:18`; the seller share rounds down to the
  minor unit). Seller earnings accrue into marketplace payouts
  (`src/lib/marketplace-vault.server.ts:284`).
- **One-time price.** The install charges `price_minor_int` once at install
  time (`src/lib/marketplace-install.server.ts:512`). Set `0` for free
  plugins.
- **Trials.** Set `trial_allowed` on the listing to offer a 14-day trial
  (`TRIAL_DAYS`, `src/lib/marketplace.server.ts:17`). Trial installs charge
  `0`, land on status `trial` with an expiry timestamp, and convert through
  the standard install path.

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
  `src/lib/marketplace-scopes.ts:254`). Declare plugin widget slots from the
  first list only.
- The billing gap above (one-time plus trial only) is the largest monetization
  limit. Track it before promising subscription pricing to customers.
- Hook payloads are PII-minimal by construction. Payloads that carried emails,
  phone numbers, or names fail emission tests; build features that need
  personal data through the scoped bridge methods (`customers.get`,
  `orders.list`) instead of hook bodies.
- Settings coerce to their schema and drop unknown keys
  (`validateSettings`, `src/lib/plugin-manifest.ts:1461-1514`); reads serve
  validated values only, so a setting the merchant never saved arrives as its
  default, never as `undefined` handling you must invent.
