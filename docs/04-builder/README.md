# Builder and studio — editor source of truth

Last verified: 2026-10-18 @ 6ea2d029df2e

The content editor is the real editing surface for pages and posts:
`/dashboard/content/editor?kind=page|post&id=<uuid>` (omit `id` for a new
document) — `src/routes/_authenticated/dashboard/content/editor.tsx:23-27`.
Pages are builder-only, so a stale `?editor=classic` link can never open the
removed block surface for pages; posts honor the query param (`:57-59`). The
route renders the full-screen `EditorShell` without the console chrome
(`:4-6`, `:141-165`). There is no route for the legacy `/admin/builder` path
older plans referenced — the editor lives at the route above.

This page is the [editor source of truth](README.md): every behavioral claim
is pinned to HEAD. Companions: [the widget contract](app-blocks.md) (identity,
schemas, taxonomy, fallback), [the publishing contract](publishing.md)
(schedule, preview shares, rollback), [theme authoring](../themes/creation.md)
(presentations and the port map), and the [package lanes
contract](../packages/contract.md). Superseded planning docs stay on disk as
history only: `docs/04-builder/theme-runtime.md`,
`docs/04-builder/theme-registry.md`, `docs/04-builder/themes-catalog.md`,
`docs/04-builder/theme-authoring-export.md`,
`docs/04-builder/sections-templates.md`.

## One authorized registry per render

The route builds exactly ONE registry per render and threads it to every
downstream path — tray, inspector, canvas, preview, save and publish:

- `buildEditorExtensionRegistry({installedPlugins, themeKey,
approvedDevManifest, isActive})` (`src/lib/editor/editor-registry.ts:62-88`)
  seeds a fresh route-local registry with the static tiers (builtin + studio)
  plus THIS tenant's server-authorized plugin defs, then registers the
  approved ACTIVE theme's [Level B](../packages/contract.md) defs only —
  inactive, foreign, refusing or absent manifests yield none. It never throws;
  unusable input fails closed to the static tiers (`:65-67`, `:85-87`), and
  one bad theme def never breaks the tray (`:78-82`).
- Both inputs are server-scoped to this tenant: `pluginListFn` (authorized
  installs) and `builderWorkspaceFn` (projected workspace theme: `sourceKey`,
  `isActive`, `approvedDevManifest`), fetched once and memoized at
  `src/routes/_authenticated/dashboard/content/editor.tsx:75-93`,
  `:103-115`. Either query failing narrows to plugins-only + explicit absent
  binding — the tray offers fewer widgets, never foreign ones (`:61-73`).
- The same `authorizedPlugins` list feeds the canvas `PluginProvider`, so
  tray, inspector and canvas share one truth (`:130-140`).
- Mid-session truth changes: the shell remounts the studio when the
  authorized def set or the active theme key changes
  (`editorRegistryFingerprint` in `src/lib/editor/editor-seam.ts:194-236`;
  `studioResetKey` in `src/components/admin/editor/EditorShell.tsx:596-615`,
  consumed at `:888`) — a theme change or plugin disable never renders stale
  definitions.

## Shell and studio

`EditorShell` (`src/components/admin/editor/EditorShell.tsx`) owns layout, the
leave guard and the pre-publish flow. For builder-mode documents it mounts
`StudioBuilder` (imported at `:40`, mounted at `:862`, seam props at
`:873-888`) and forwards the route-owned registry through one receiver-owned
seam (`studioSeamProps`, `:497-509`); the studio consumes it for insert,
inspector and canvas — there is never a second competing build.

## Widget tray — insertable-only, universal

`resolveExtensionTrayEntries`
(`src/components/builder/studio/StudioBuilder.tsx:836-901`) lists `plugin:`
and `theme:` namespace defs from the threaded authorized registry and offers
only what `buildExtensionInsert` can build from that same registry — misses
(disabled, incompatible, uninstalled) stay hidden instead of inserting into a
placeholder. With no usable registry the tray keeps the legacy fallback
entries unchanged (`effectivePluginEntries`, `:1226-1229`). A tray click
inserts the canonical extension node through `addPluginNode` (`:1156-1217`).

Theme-owned widgets are universal: the tray lists them under EVERY active
theme, and the theme only dresses the render (see below). In-repo theme defs
register on the shared singleton, and `buildTrayRegistry`
(`src/lib/unified-widget-registry.ts:1605-1641`) merges the allow-listed
global `theme:` owners (`GLOBAL_SINGLETON_NAMESPACES` /
`GLOBAL_SINGLETON_THEME_OWNERS`, `:1423-1436`; the filtered legacy shim at
`:1636-1640`), so an active theme change never removes another theme's widgets
from the tray. The LEGACY `themeTrayEntries` claim seam
(`src/lib/widget-presentation.ts:856`) stays scoped to dev-theme discovery — a
platform feature, not the studio tray path described here.

## Schema-generated inspector

Selecting an extension node replaces the legacy tabbed panel with controls
generated from the widget's `propsSchema` ([the widget
contract](app-blocks.md)): the swap-in lives in
`src/components/builder/studio/SettingsPanel.tsx:9-17` and resolves through
`resolveInspectorSchema` (`src/lib/widget-presentation.ts:1074`), which
consults the threaded authorized registry when present and keeps the legacy
singleton read only when absent (`SettingsPanel.tsx:261-298`). Every edit
crosses the shared `validateProps` value layer before it reaches the
node-update seam, and non-desktop devices write the validated `bp` override
layer (`:321-329`). Empty-schema and unknown widgets keep the legacy panel
byte-identical (`resolveSchemaForNode`, `:273-298`).

## Canvas and persisted node model

The canvas is `StudioCanvas`
(`src/components/builder/studio/StudioCanvas.tsx`, mounted from
`StudioBuilder.tsx:2088`). Extension nodes render through
`StudioExtensionBlock`
(`src/components/builder/studio/renderers.tsx:467-677`), the studio twin of
the storefront `SectionRenderer` — same modes, same validated per-instance
props, same fail-closed placeholder (`:443-449`).

The persisted model is `StudioDoc` / `StudioNode` in
`src/lib/studio/model.ts:32-93`; the shell reads it with `readStudioBody`
(`:903`) and writes it with `serializeStudioBody` (`:895`). An inserted
extension is a canonical node (`type: "extension"`, `widgetKey`,
`instanceId`, `props`, `slots`) built by `buildExtensionInsert`
(`src/components/builder/studio/plugin-tray.ts:277-326`) and adapted by
`studioNodeForExtension` (`:156`); documents without an extension keep the
legacy `app-block` twin byte-identical (`StudioBuilder.tsx:1156-1214`).

## Rendering — one resolution point, dress vs body

`resolvePresentation` (`src/lib/widget-presentation.ts:585-766`) is the one
resolution point:

- builtin / studio → `native-builtin` (core default, or a registered theme
  override);
- plugin → `official` (source-backed trusted components,
  `src/lib/official-plugins.ts:46-51`), `plugin-isolated` (sandboxed island),
  or `plugin-themeable` with a `dressed` flag;
- `theme:` namespace → `owner-definition` under the owning theme,
  `generic-presentation` under any other theme when the widget registered a
  universal body (`registerGenericPresentation`,
  `src/lib/theme-presentations.ts:1006`; `resolveGenericPresentation`,
  `:1038`), else `recoverable-fallback`.

Theme = dress, widget = body: a registered theme-owned widget renders under
EVERY active theme. The owning theme attaches its token-dress; any other theme
— known foreign or unknown — renders the widget's universal generic
presentation (for the Songoskriti ornament:
`src/lib/themes/songoskriti/ornament-generic-presentation.tsx:123`, verified
by `src/lib/themes/songoskriti/ornament-recovery.test.ts:88-103`). The "Widget
preview unavailable" placeholder is reserved for unregistered or missed
resolutions — never for a registered component.

## Save and re-validation

- Studio-side: explicit save normalizes extension envelopes
  (`normalizeExtensionDocForSave`, `StudioBuilder.tsx:1017`, called at
  `:1394-1401`). Every shell-bound edit is canonicalized against the SAME
  authorized registry by `serializeStudioDocForShell`
  (`EditorShell.tsx:451-467`) via `canonicalizeEditorDocForSave`
  (`src/lib/editor/editor-seam.ts:499-523`): known keys re-validated, hostile
  keys dropped, no install-global bleed, fresh objects per instance. Misses
  (for example a plugin disabled mid-session) preserve the authored props
  verbatim for recovery.
- Server-side: the same `validateProps` module re-validates extension props
  at the commit trust boundary before anything is stored
  (`src/lib/themes.server.ts:445-469`; the value-layer walk starts at `:540`);
  invalid props reject loudly and legacy widgets are untouched.

## Preview and publishing

- **Preview**: the studio's preview toggle (`StudioBuilder.tsx:1272`)
  re-renders the canvas with handles hidden (`hideHandles={preview}`, `:2093`)
  while sharing the identical `extensionRegistry` / `devThemeBinding` /
  `activeThemeKey` — preview is never a disconnected build
  (`EditorShell.tsx:867-872`); preview extension nodes resolve through the
  same registry (`previewEditorExtensionNodes`,
  `src/lib/editor/editor-seam.ts:539`).
- **Publishing**: the studio publish button flushes the live canvas into the
  shell body and then runs the shell's working `commit("publish")` path
  (`publishFromStudio`, `EditorShell.tsx:469-479`; flush-before-publish in
  `createStudioPublishHandler`, `:139-156`), so the last keystrokes are never
  one save behind. The shell's own publish action carries the real
  pre-publish checks (`:334-359`).

## Recovery

- **Local autosave + crash recovery**: every edit mirrors into `localStorage`
  under a per-document key with a 1200 ms debounce (`AUTOSAVE_DEBOUNCE_MS`,
  `src/lib/studio/autosave.ts:22`). On open, a recoverable draft shows a bar
  with **Restore** / **Discard** (`StudioBuilder.tsx:1336-1349`,
  `:1403-1413`, `:1841-1867`).
- **Registry-switch recovery**: a mid-session theme change or plugin disable
  changes the registry fingerprint and remounts the canvas from the new truth
  while authored data stays preserved in the persisted body for re-resolution
  (`src/lib/editor/editor-seam.ts:194-236`, `EditorShell.tsx:596-615`).
- **Fail-closed rendering**: a missed resolution renders the explicit
  placeholder, never another owner's component (`renderers.tsx:639-676`).

## Testing

    npx vitest run src/lib/editor src/components/builder
    npx playwright test -c .e2e/playwright.config.ts plugin-registry-editor-wiring

The Playwright spec pins the real chain by reading the exact production
modules (route → shell seam → `addPluginNode` → `buildExtensionInsert`, and
`SettingsPanel` → `resolveInspectorSchema` → `SchemaControls` →
`validateProps`); the interactive steps that require a live authenticated
session are skipped with a reason in that spec
(`.e2e/plugin-registry-editor-wiring.spec.ts:1-29`). Package scripts:
`npm run test` (`vitest run`) and `npm run e2e` (Playwright with
`.e2e/playwright.config.ts`).

## Where the rest lives

| Surface                                                 | Canonical doc                          |
| ------------------------------------------------------- | -------------------------------------- |
| Widget contract — identity, schemas, taxonomy, fallback | [app-blocks.md](app-blocks.md)         |
| Publishing — schedule, preview shares, rollback         | [publishing.md](publishing.md)         |
| Theme authoring and presentation claims                 | [creation.md](../themes/creation.md)   |
| Package lanes — declarative vs reviewed executable      | [contract.md](../packages/contract.md) |
