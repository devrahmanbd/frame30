# App blocks — the canonical widget contract

Last verified: 2026-10-18 @ 0f754543780b

This file is the canonical widget contract ([app-blocks.md](app-blocks.md)):
every other guide links here for widget identity, schemas, instance
properties, slots, responsive controls, rendering modes, validation,
compatibility, and fallback instead of restating them. Every behavioral claim
is pinned to HEAD.

## Identity — key and namespace

A widget is a registry definition (`WidgetDef`,
`src/lib/unified-widget-registry.ts:154-191`):

- `id` — a namespaced key: `namespace:key`, or `namespace:owner/key` for
  theme-owned and uploaded-theme defs. Registration enforces the pattern
  (`NAMESPACED_ID_RE`, `:227-229`).
- `namespace` — exactly one of `builtin`, `studio`, `plugin`, `theme`
  (`:156`).
- Carried members: `version`, `label`, `category`, `slots`, `defaults`,
  `propsSchema`, and `renderer` (`builtin` | `sandbox` | `custom`), plus the
  optional contract members below (`:154-191`).
- Plugin manifests address widgets as `plugin:<pluginId>/<widget>`; the
  manifest gate validates the declared defs (`PluginWidgetDef`,
  `src/lib/plugin-manifest.ts:295-384`) and `fromPluginManifest` adapts them
  into registry defs (`src/lib/unified-widget-registry.ts:1253-1332`). Legacy
  bare keys still resolve for existing documents (`LEGACY_BARE_RE`, `:229`).

## Schemas — `propsSchema` and `defaultProps`

- `propsSchema` is the per-widget field list the inspector renders and the
  value layer validates. Its field shape is `PropField`
  (`src/lib/widget-props.ts:69-103`), single-sourced into the manifest
  contract as `PluginWidgetPropField` — an alias, never a copy
  (`src/lib/plugin-manifest.ts:386-393`).
- `defaultProps` is the per-widget default record merged over the
  schema-derived defaults by the adapter
  (`src/lib/plugin-manifest.ts:325-331`). Keys outside `propsSchema` are
  stripped there.
- `defaultsFor` derives the full default record from a schema; every call
  returns fresh objects, so two widget instances never share references
  (`src/lib/widget-props.ts:530-538`).

Example (a manifest `widgets[]` entry):

```json
{
  "key": "gift-note",
  "label": "Gift note",
  "slots": ["main"],
  "entry": "widget.js",
  "version": "1.2.0",
  "propsSchema": [
    {
      "key": "heading",
      "label": "Heading",
      "kind": "text",
      "default": "Add a gift note"
    },
    {
      "key": "maxChars",
      "label": "Max characters",
      "kind": "number",
      "min": 40,
      "max": 500,
      "default": 200
    }
  ],
  "defaultProps": { "maxChars": 200 }
}
```

### Field kinds — the closed set

Exactly the 22 kinds exported from `src/lib/widget-props.ts:28-51`: `text`,
`richtext`, `number`, `boolean`, `select`, `color`, `typography`, `spacing`,
`dimensions`, `responsive`, `image`, `media`, `video`, `product`,
`collection`, `category`, `repeater`, `group`, `link`, `icon`, `visibility`,
`animation`. A manifest must not invent controls: an unknown kind fails
closed at validation (`unknown_kind`, value omitted —
`src/lib/widget-props.ts:479-482`) and is rejected at
manifest/registration time.

## Instance properties

Every placed node carries its own per-instance props, validated against the
widget's schema — never merged with install-global settings
(`InstalledPlugin.settings` is structurally separate;
`src/lib/plugin-manifest.ts:1518-1534`). Insert builds a canonical node with
schema-valid instance props and a fresh identity (`buildExtensionInsert`,
`src/components/builder/studio/plugin-tray.ts:277-326`); the sandboxed render
re-validates at its own boundary
(`src/components/builder/PluginBlock.tsx:108-116`), save re-validates
(`sanitizeEditorExtensionProps`, `src/lib/editor/editor-seam.ts:326`), and
the server commit gate re-validates with the same module
(`src/lib/themes.server.ts:445-469`).

## Slots

`slots` lists where a widget may be placed: block slots plus the sanctioned
menu fill points (`BlockSlot | MenuSlot`, `src/lib/plugin-manifest.ts:299`;
`MENU_SLOTS` in `src/lib/marketplace-scopes.ts:301`). An insert into an
undeclared slot is refused (`illegal_slot`,
`src/components/builder/studio/plugin-tray.ts:295-301`).

## Responsive controls

- The `responsive` field kind marks a control the inspector can edit
  per-device. `bp` override layers are validated with the same schema and
  preserved shape-for-shape; error codes are `bp.<device>.<key>.<code>`
  (`src/lib/widget-props.ts:19-25`, `:576-589`).
- The studio writes non-desktop edits as the validated `bp` layer through the
  same node-update seam
  (`src/components/builder/studio/SettingsPanel.tsx:321-329`).

## Rendering modes

`rendering` is the closed enum `isolated` | `themeable`
(`src/lib/plugin-manifest.ts:258`). Absent derives from the `themeable`
contract presence (`themeable` ⇒ `themeable`, else `isolated`), so legacy
manifests stay byte-identical (`:345-352`).

## Taxonomy

One resolution point decides how a widget renders: `resolvePresentation`
(`src/lib/widget-presentation.ts:585-766`).

| Tier                       | What it is                                                                                                                                                                  | Resolved mode                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Native                     | `builtin:` / `studio:` defs seeded from the adapters                                                                                                                        | `native-builtin` (`:635-653`)                                               |
| Source-backed official     | the four in-repo official plugin keys — `product-reviews`, `store-analytics`, `whatsapp-chat`, `fraud-shield` (`OFFICIAL_PLUGIN_KEYS`, `src/lib/official-plugins.ts:46-51`) | `official`, trusted source ref (`:655-672`)                                 |
| Isolated plugin (Class A)  | no `themeable` contract; the bundle owns arbitrary UI in the sandbox frame                                                                                                  | `plugin-isolated` (`:673-692`)                                              |
| Themeable plugin (Class B) | versioned theme-safe contract (schema/data/actions/slots/states); dressed by a theme or undressed                                                                           | `plugin-themeable` with a `dressed` flag (`:694-715`)                       |
| Theme-owned                | `theme:` defs: a universal widget body a theme dresses                                                                                                                      | owner-definition / generic-presentation / recoverable-fallback (`:718-759`) |

Theme = dress, widget = body: a registered theme-owned widget renders under
EVERY active theme. The owning theme attaches its dress through
`registerCommunityPresentation` / `registerThemePresentation`; any other
theme renders the widget's universal generic presentation
(`registerGenericPresentation`, `src/lib/theme-presentations.ts:1006`;
`resolveGenericPresentation`, `:1038`) — for the Songoskriti ornament,
`data-ornament="generic"`
(`src/lib/themes/songoskriti/ornament-generic-presentation.tsx:123`).

## Validation

`validateProps` is the SINGLE validator both sides call — the studio
validates drafts client-side, and the server commit path re-validates with
the same module (`src/lib/widget-props.ts:1-26`, `:582-589`;
`src/lib/themes.server.ts:445-469`). Unknown top-level props are stripped,
`bp` layers are validated, and `clean` always carries every known key, so a
validated result is safe to store or render without further guards.
Registration separately rejects malformed defs — hostile members yield `bad_*`
verdicts (`src/lib/unified-widget-registry.ts:177-191`).

## Compatibility

- `themeCompatibility.themes` is an allow-list of theme keys (absent means
  every theme); `themeCompatibility.minBuilderApi` floors the builder API and
  is checked at resolve time — never silently substituted
  (`src/lib/plugin-manifest.ts:284-293`).
- `capabilities` declares responsive/styling support (`responsive`,
  `styling: "isolated" | "tokens"` — `src/lib/plugin-manifest.ts:280-282`).
- `version` is per-widget semver; resolution can pin an older retained
  version (`ResolveContext.version`, `src/lib/unified-widget-registry.ts:196-203`).
- Miss reasons are explicit: `unknown` | `disabled` | `suspended` |
  `incompatible` | `uninstalled` (`src/lib/unified-widget-registry.ts:193-194`).
  The tray hides non-insertable widgets rather than offering a broken click
  (`src/components/builder/studio/StudioBuilder.tsx:866-874`).

## Fallback

- Theme-owned: the owner renders its dress; any other theme renders the
  registered universal generic presentation (`data-ornament="generic"` for
  the Songoskriti ornament, `src/lib/theme-presentations.ts:1006`). With no
  registration the resolution is `recoverable-fallback` — an explicit
  placeholder (`placeholder: true`), never another owner's component
  (`src/lib/widget-presentation.ts:749-759`;
  `src/components/builder/studio/renderers.tsx:639-676`).
- Plugin: blocked resolutions render a labelled placeholder
  (`PluginResolution` reasons, `src/lib/plugin-manifest.ts:1549-1562`);
  Class A stays in the sandbox island; Class B undressed falls back to the
  generic island (`resolveCommunityRender`, `src/lib/plugin-theme-contract.ts:267`).
- Storefront node level: an unknown widget parses to an `invalid` placeholder
  with siblings intact, and a throwing widget is contained to its own node
  (`src/lib/builder-lifecycle.contract.test.tsx:157-165`, `:197`).

## Related guides

- [Editor source of truth](README.md) — route, registry, tray, inspector,
  save, preview, publish, recovery.
- [Publishing contract](publishing.md) — schedule, preview shares, rollback.
- [Theme authoring](../themes/creation.md) — theme presentations, the
  universal body/dress model, and the port map.
- [Package lanes](../packages/contract.md) — declarative vs reviewed
  executable distribution.
