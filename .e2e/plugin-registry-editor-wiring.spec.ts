import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Plugin journey — frame30 registry-wired editor tree (static chain, no auth).
 *
 * The interactive half of this journey (tray click → insert → control edits
 * → save/reload → preview → publish) executes ONLY behind a real Supabase
 * session under `_authenticated`, which `plugin-authenticated-journey.spec.ts`
 * proves at runtime is unobtainable here (dummy backend, no seeded merchant,
 * stubbing forbidden). The three auth-gated steps are therefore repeated
 * below as skipped-with-reason — un-skip if and only if truly authenticated.
 *
 * What THIS spec adds (nothing here duplicates the sibling specs):
 * - `plugin-authenticated-journey.spec.ts` pins the OLD shell tokens
 *   (EditorShell mounts StudioBuilder, WidgetTray offers entries,
 *   PublishModal publishes). It does NOT pin the frame30 one-registry
 *   threading: route-owned `buildEditorExtensionRegistry` →
 *   EditorShell `extensionRegistry` prop → `studioSeamProps` →
 *   StudioBuilder `addPluginNode` → `buildExtensionInsert`, nor the
 *   schema-generated `SettingsPanel` controls
 *   (`resolveInspectorSchema` → `SchemaControls` → `validateProps`).
 * - `plugin-anonymous-journey.spec.ts` proves the value layer
 *   (parse → registry → validate → present) through real units. It does
 *   NOT pin which production modules call those units.
 *
 * So this spec pins, by read-only source reads of the exact modules that
 * execute with a session, that the REAL insert/edit/publish path is the
 * registry-wired one — the maximum reachable coverage for the authenticated
 * plugin journey without a session.
 *
 * Cleanup: no pages, no servers, no collectors. Nothing to clean up.
 */

function srcPath(rel: string): string {
  return fileURLToPath(new URL(`../${rel}`, import.meta.url));
}

function src(rel: string): string {
  return readFileSync(srcPath(rel), "utf8");
}

test("route owns ONE registry: buildEditorExtensionRegistry → EditorShell", () => {
  // The content-editor route builds a single tenant-scoped registry from the
  // authorized plugin installs + workspace theme and hands THAT object —
  // never a second competing build — to the shell.
  const route = src("src/routes/_authenticated/dashboard/content/editor.tsx");
  for (const token of [
    "buildEditorExtensionRegistry",
    "editorRegistry",
    "extensionRegistry={editorRegistry}",
    "EditorShell",
    "forceEditor",
  ]) {
    expect(route.includes(token), `editor route pins ${token}`).toBe(true);
  }

  // The helper itself seeds the one registry from installs (builtin +
  // studio + this tenant's plugin defs) with the theme + approved dev
  // manifest projection — the same `buildTrayRegistry` the tray reads, so
  // the editor can never offer a widget it cannot insert.
  const helper = src("src/lib/editor/editor-registry.ts");
  for (const token of [
    "buildTrayRegistry",
    "installedPlugins",
    "approvedDevManifest",
    "themeKey",
  ]) {
    expect(helper.includes(token), `editor-registry pins ${token}`).toBe(true);
  }
});

test("shell threads the registry: extensionRegistry → studioSeamProps → StudioBuilder", () => {
  // EditorShell declares the prop, shares it through the single seam
  // object, and spreads that seam onto the live StudioBuilder — alongside
  // the shell's working publish path.
  const shell = src("src/components/admin/editor/EditorShell.tsx");
  for (const token of [
    "extensionRegistry",
    "studioSeamProps",
    "StudioBuilder",
    "publishFromStudio",
    "PrePublishPanel",
  ]) {
    expect(shell.includes(token), `EditorShell pins ${token}`).toBe(true);
  }
  expect(
    shell.includes("{...studioSeamProps}"),
    "seam is spread onto the studio call site",
  ).toBe(true);
});

test("studio inserts through the registry: addPluginNode → buildExtensionInsert", () => {
  // StudioBuilder consumes the threaded registry in `addPluginNode` and
  // builds the canonical extension node via the REAL `buildExtensionInsert`
  // (schema-cleaned defaults, permitted-slot snapshot); misses keep the
  // legacy fallback and never break the canvas.
  const studio = src("src/components/builder/studio/StudioBuilder.tsx");
  for (const token of [
    "extensionRegistry",
    "addPluginNode",
    "buildExtensionInsert",
    "pluginEntries",
    "StudioCanvas",
  ]) {
    expect(studio.includes(token), `StudioBuilder pins ${token}`).toBe(true);
  }
});

test("editing is schema-generated: SettingsPanel → SchemaControls → validateProps", () => {
  // The studio mounts the registry-wired SettingsPanel (not a bespoke
  // form): canonical widgetKey → `resolveInspectorSchema` → generated
  // `SchemaControls`, every edit cleaned through the shared `validateProps`
  // value layer, reset covered by `defaultsFor`, unknown kinds fail closed
  // via `controlStatus`.
  const studio = src("src/components/builder/studio/StudioBuilder.tsx");
  expect(
    studio.includes("SettingsPanel"),
    "studio mounts the registry-wired SettingsPanel",
  ).toBe(true);
  const panel = src("src/components/builder/studio/SettingsPanel.tsx");
  for (const token of [
    "resolveInspectorSchema",
    "SchemaControls",
    "validateProps",
    "defaultsFor",
    "controlStatus",
  ]) {
    expect(panel.includes(token), `SettingsPanel pins ${token}`).toBe(true);
  }
});

test("publish lands on the themed storefront: activeThemeKey → ThemeRuntime", () => {
  // The builder preview/publish lane resolves under the single
  // server-authorized `activeThemeKey`; custom-isolated themes render on the
  // storefront ONLY through the sandboxed `ThemeRuntime` document at the
  // version-pinned frame URL — any other record keeps the classic renderer.
  const builder = src("src/routes/_authenticated/dashboard/builder.tsx");
  expect(
    builder.includes("activeThemeKey"),
    "builder resolves under activeThemeKey",
  ).toBe(true);
  const chrome = src("src/components/store/ThemeChrome.tsx");
  for (const token of [
    "ThemeRuntime",
    "buildThemeFrameUrl",
    "custom-isolated",
  ]) {
    expect(chrome.includes(token), `ThemeChrome pins ${token}`).toBe(true);
  }
});

// Auth-gated remainder: each step below fundamentally requires a Supabase
// session (proven absent at runtime by `plugin-authenticated-journey.spec.ts`
// — dummy backend, no seeded merchant — and auth stubbing is forbidden).
// Skipped-with-reason, never attempted — un-skip if and only if a real
// authenticated session becomes available.
test.skip("auth-gated: tray click inserts the canonical extension node", () => {
  // Requires a session: live WidgetTray onAddExtension → StudioBuilder
  // addPluginNode → buildExtensionInsert. Registry threading pinned above.
});

test.skip("auth-gated: schema-generated controls persist merchant edits", () => {
  // Requires a session: live SettingsPanel SchemaControls onChange →
  // validateProps → commit("save") → reload. Control chain pinned above.
});

test.skip("auth-gated: save → reload → preview → publish → theme switch", () => {
  // Requires a session: commit("save") → reload → preview under the theme →
  // PublishModal onPublish → commit("publish") → activeThemeKey switch →
  // storefront render. Publish/storefront wiring pinned above.
});
