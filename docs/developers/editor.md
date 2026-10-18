# Use the editor with your extension

Last verified: 2026-10-18 @ 436afcf14898

Audience: extension developers — plugin authors, theme authors with
widget definitions, and menu-extension authors — who want to verify
their work inside the real content editor. The journey below is the one
a merchant walks: install and activate, find the widget in the tray,
insert it, edit the schema-generated settings, check devices, preview,
save, publish. Every behavior is pinned to HEAD; the widget contract
itself lives in the [widget contract](../04-builder/app-blocks.md) and
the editor's full behavior in the
[editor source of truth](../04-builder/README.md).

## Install and activate the extension

Installs happen in the merchant console, not the editor:
`/dashboard/plugins`
(`src/routes/_authenticated/dashboard/plugins/index.tsx:15`).

- The console reads the tenant-scoped install list through `pluginListFn`
  (`src/lib/plugins.functions.ts:14-22`).
- Installing or re-consenting posts through `pluginInstallFn` (`:24-45`);
  enable/disable posts through `pluginToggleFn` (`:64-79`).
- Only a live install is readable: the read path marks a plugin enabled
  only when it is not killed, disabled, or suspended
  (`src/lib/plugins.server.ts:76`), so a parked or suspended extension
  never reaches the editor.

The editor fetches the same authorized list server-side and memoizes it
once per render
(`src/routes/_authenticated/dashboard/content/editor.tsx:75-93`), so the
tray can only offer widgets from installs this tenant is authorized for.

## Find the widget in the tray

Open `/dashboard/content/editor?kind=page&id=<uuid>` (omit `id` for a
new document). The [widget tray](../04-builder/README.md) lists
`plugin:` and `theme:` namespace entries from the one authorized
registry and offers only what the insert path can build: disabled,
suspended, incompatible, or uninstalled widgets stay hidden instead of
inserting a placeholder (`resolveExtensionTrayEntries`,
`src/components/builder/studio/StudioBuilder.tsx:836-901`; the
insertable check at `:869-879`). Theme-owned widgets are universal — the
tray lists them under EVERY active theme, and the theme only dresses the
render. With no usable registry the tray falls back to the legacy
entries unchanged (`effectivePluginEntries`, `:1226-1229`).

## Insert the widget

A tray click inserts the canonical extension node through `addPluginNode`
(`StudioBuilder.tsx:1156-1217`). The node is built by
`buildExtensionInsert`
(`src/components/builder/studio/plugin-tray.ts:277-326`) and adapted by
`studioNodeForExtension` (`:156`): an extension node carrying
`widgetKey`, `instanceId`, `props`, and `slots`.

## Edit the schema-generated settings

Select the inserted node: the legacy tabbed panel is replaced by
controls generated from the widget's `propsSchema`
([widget contract](../04-builder/app-blocks.md)) — the swap-in lives at
`src/components/builder/studio/SettingsPanel.tsx:9-17` and resolves
through `resolveInspectorSchema` (`src/lib/widget-presentation.ts:1074`).
The inspector consults the threaded authorized registry when present and
keeps the legacy singleton read only when absent
(`SettingsPanel.tsx:273-298`).

Every edit crosses the shared `validateProps` value layer before it
reaches the node — unknown keys are dropped, hostile values are
neutralized, and non-desktop devices write the validated `bp` override
layer (`SettingsPanel.tsx:321-330`; `src/lib/widget-props.ts:576-589`).
Nothing raw from a control is ever stored.

## Responsive views

The device switch re-renders the canvas for PC, tablet, and mobile
(`onDevice={setDevice}`, `StudioBuilder.tsx:1884`). Non-desktop edits are
stored as validated `bp` override layers on the same node;
`validateProps` validates each layer with the same schema and preserves
its shape (`src/lib/widget-props.ts:576-589`). Layering is desktop-first:
a missing layer means the desktop value applies.

## Preview

The preview toggle (`StudioBuilder.tsx:1272`) re-renders the canvas with
handles hidden (`hideHandles={preview}`, `:2093`) while sharing the
identical authorized registry and active theme
(`EditorShell.tsx:867-872`): preview is never a disconnected build.
Extension nodes resolve through the same registry
(`previewEditorExtensionNodes`, `src/lib/editor/editor-seam.ts:539`), so
what you see is what ships.

## Save

The studio save normalizes extension envelopes
(`normalizeExtensionDocForSave`, `StudioBuilder.tsx:1017`), and every
shell-bound edit is canonicalized against the SAME authorized registry
(`canonicalizeEditorDocForSave`, `src/lib/editor/editor-seam.ts:499-523`):
known keys are re-validated, hostile keys dropped, and every instance
gets fresh objects. If a plugin is disabled mid-session, the authored
props are preserved verbatim for recovery rather than silently rewritten.

## Publish

Publishing flushes the live canvas into the shell body and then runs the
shell's commit path (`publishFromStudio`, `EditorShell.tsx:469-479`;
flush-before-publish in `createStudioPublishHandler`, `:139-156`), so the
last edits are never one save behind.

## Troubleshooting

### The settings panel shows legacy controls

An empty or unresolvable schema is not an error: unknown widgets and
schemas with no renderable fields keep the legacy panel byte-identical
(`resolveSchemaForNode`, `SettingsPanel.tsx:273-298`;
`hasRenderableSchemaFields`, `:215`). If you expected generated controls,
the widget definition's schema is missing, empty, or uses only field
kinds the inspector does not render — check it against the
[widget contract](../04-builder/app-blocks.md).

### My theme-owned widget does not appear, or looks different under another theme

Theme-owned widgets declare their compatibility in the widget definition
(`themes` allow-list and `minBuilderApi`,
`src/lib/plugin-manifest.ts:284-293`); a failed check resolves as
`incompatible` (`src/lib/unified-widget-registry.ts:193-194`), and the
tray hides the entry until it fits.

At render time the owner theme dresses the widget; under any other theme
the widget renders its universal generic presentation instead of another
owner's styles (registered via `registerGenericPresentation`,
`src/lib/theme-presentations.ts:1006`; the Songoskriti ornament's
`data-ornament="generic"` twin at
`src/lib/themes/songoskriti/ornament-generic-presentation.tsx:123`).
Theme-side authoring rules are the
[theme authoring guide](../themes/creation.md).

### The widget disappeared after I disabled the package

Disabling a plugin takes it off the read gate
(`src/lib/plugins.server.ts:76`) and the tray's insertable filter drops
its entries (`StudioBuilder.tsx:869-879`). Mid-session, the shell
remounts the studio from the new registry fingerprint instead of
rendering stale definitions (`EditorShell.tsx:596-615`); authored data
stays in the persisted body for re-resolution when you re-enable
(`src/lib/editor/editor-seam.ts:194-236`).

### Something is missing at render time

Missed and recoverable resolutions render the explicit fail-closed
placeholder — never another owner's component
(`src/components/builder/studio/renderers.tsx:443-449`). The "Widget
preview unavailable" box is reserved for unregistered or missed
resolutions; a registered component always renders through its lane.
Unsaved edits survive a crash in local autosave: reopen the document and
the recovery bar offers Restore / Discard
(`StudioBuilder.tsx:1841-1867`).

## Run the checks

```bash
npm run typecheck
npm run test
npm run e2e -- plugin-registry-editor-wiring
```

`npm run test` runs the vitest suites — the editor seams and studio
components are the ones covering this journey. `npm run e2e` runs
Playwright with the repo config; the appended filter runs the static
chain spec that pins route → shell → insert and inspector → schema →
`validateProps` (`.e2e/plugin-registry-editor-wiring.spec.ts:1-29`). The
spec's interactive half needs a live authenticated session and is
skipped with a reason there; the runtime journey runs in the
authenticated lane.

## Where the rest lives

| Surface                                | Canonical doc                                   |
| -------------------------------------- | ----------------------------------------------- |
| Widget contract — schemas and fallback | [app-blocks.md](../04-builder/app-blocks.md)    |
| Editor behavior pinned to HEAD         | [04-builder/README.md](../04-builder/README.md) |
| Theme authoring and presentation       | [creation.md](../themes/creation.md)            |
