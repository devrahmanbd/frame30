# Community plugins (Class A, sandboxed)

Last verified: 2026-10-06.

Audience: independent developers shipping functionality that runs
isolated inside the storefront. Class A means the widget declares no
`themeable` contract: its bundle owns arbitrary UI inside the sandbox
frame. If you want themes to dress your widget instead, read
[Themeable Widgets](themeable-widgets.md).

The [Plugin guide](plugins.md) is normative for manifests, sandbox
limits, hooks, lifecycle, and monetization. This page is the
shortest path through it.

## Minimal manifest

```json
{
  "id": "my-reviews",
  "version": "1.0.0",
  "api": "^3.0.0",
  "permissions": ["read_shop", "render_storefront"],
  "widgets": [
    {
      "key": "summary",
      "label": "Review summary",
      "slots": ["main"],
      "entry": "var box=document.createElement(\"div\");box.textContent=\"Summary.\";framique.mount(box);"
    }
  ],
  "hooks": [],
  "settings": [],
  "i18n": { "en": {}, "bn": {} },
  "budget": { "jsKb": 40, "mainThreadMs": 15 }
}
```

Validate it with the single shared gate before submitting —
`parseManifest` (`src/lib/plugin-manifest.ts:393-543`). Field rules
that reject most first submissions:

- `id` matches `^[a-z][a-z0-9-]{2,39}$`, `version` is strict semver,
  `api` is `^3.0.0` or `>=3.0.0 <4.0.0` against
  `BUILDER_API_VERSION = "3.1.0"`
  (`src/lib/plugin-manifest.ts:18-32`,
  `src/lib/plugin-manifest.ts:311-330`).
- A manifest with widgets must request `render_storefront`
  (`src/lib/plugin-manifest.ts:484-489`).
- `entry` must be non-empty with no `eval(`, `import(`, or
  `new Function` (`src/lib/plugin-manifest.ts:446-454`); the bundle
  gate additionally rejects `document.write(`, `.innerHTML =`, and
  string-scheduled timers (`src/lib/marketplace-scopes.ts:207-238`).
- Budgets: `jsKb <= 120`, `mainThreadMs <= 50`
  (`src/lib/plugin-manifest.ts:31-32`,
  `src/lib/plugin-manifest.ts:512-523`).
- Floating widgets render in-flow in a 56 px parent-hosted frame:
  `position:fixed` inside the entry resolves against the tiny iframe
  viewport (`src/lib/plugin-manifest.ts:264-270`).

## Address, place, and resolve

- Namespaced key shape: `plugin:{pluginId}/{widget}`
  (`src/lib/plugin-manifest.ts:295-306`). Example:
  `plugin:starter-hello/greeting`, where the entry string is the
  single source of truth
  (`examples/starter-plugin/src/widget.ts:13-20`).
- Declare block slots from `header`, `main`, `footer`
  (`src/lib/plugin-manifest.ts:43-44`); menu fill points are covered
  in [Menu Extensions](menu-extensions.md).
- The tray lists one entry per widget per slot for installed,
  enabled, compatible plugins
  (`src/lib/plugin-manifest.ts:685-704`); the storefront renders
  every plugin widget through the single `plugin_block` renderer
  (`src/components/builder/PluginBlock.tsx:27-53`).
- Resolution fails in exactly five labeled ways — `bad_key`,
  `not_installed`, `unknown_widget`, `incompatible`, `disabled` —
  each rendering a labeled placeholder, never a crash
  (`src/lib/plugin-manifest.ts:650-683`,
  `src/components/builder/PluginBlock.tsx:54-84`).

## Speak through the bridge only

```js
// Inside the sandbox entry: the only channel out.
const profile = await window.framique.call("shop.info");
const settings = await window.framique.call("plugin.settings");
```

- The allow-list is `WIDGET_API`
  (`src/lib/marketplace-scopes.ts:260-279`); every message is
  authorized by `authorizeWidgetCall`
  (`src/lib/marketplace-scopes.ts:341-360`) against the scopes the
  merchant granted.
- `plugin.settings` answers from the merchant's validated values;
  settings coerce to their schema and unknown keys are dropped
  (`src/lib/plugin-manifest.ts:582-635`).
- Denials surface as a blocked-call notice under the frame, not a
  crash (`src/components/marketplace/WidgetSandbox.tsx:249-260`).
- Request minimum scopes; the full permission vocabulary, including
  the menu scopes, is `SCOPES`
  (`src/lib/marketplace-scopes.ts:24-105`). Full server-hook,
  lifecycle, and review semantics are in the [Plugin guide](plugins.md)
  and [Security / Sandbox](security-sandbox.md).

Next: [Themeable Widgets](themeable-widgets.md).
