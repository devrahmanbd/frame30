/**
 * Frame30 — tenant-aware extension registry for the REAL editor path
 * (`content/editor.tsx` → `EditorShell` → `StudioBuilder`).
 *
 * ONE authorized registry is built from the tenant's server-authorized
 * installed plugins PLUS the active approved theme's Level B defs, and ONE
 * projected `DevThemeBinding` (or explicit absent) rides alongside — so the
 * tray listing/insertion, the canvas, the inspector-visible definitions and
 * the preview share the same truth, never a second competing build.
 *
 * Data-flow (mirrors the sibling `dashboard/builder.tsx` one-registry lane;
 * the existing `extensionRegistry` prop shape is reused unchanged):
 * - the route fetches `pluginListFn` (server-authorized installs for THIS
 *   tenant) and `builderWorkspaceFn` (whose theme carries the server
 *   projection: `sourceKey`/`isActive` + `approvedDevManifest` +
 *   `devThemeBinding` inputs, absent unless the approval gates passed);
 * - `buildEditorExtensionRegistry` seeds a fresh route-local registry via
 *   `buildTrayRegistry` (builtin + studio + this tenant's plugin defs) and
 *   registers `activeDevThemeWidgetDefs` output (approved ACTIVE release
 *   only — inactive, foreign, refusing or absent manifests yield no defs,
 *   fail-closing to plugins-only). Theme defs join this authorized registry,
 *   never the global singleton directly.
 * - `resolveEditorDevThemeBinding` completes the server-projected binding
 *   inputs with the EDITOR host implementation. Least-privilege is
 *   deliberately stricter than the server grant (`granted: []` + deny-all
 *   `onCall`), so no bridge method can execute from the editing surface.
 *   Absent/malformed inputs yield `undefined` (explicit absent) — the
 *   renderer keeps its placeholder, never a default-allow.
 *
 * Tenant isolation: the registry derives only from this tenant's authorized
 * installs + active approved theme. Nothing here writes to the shared
 * singleton (no `registerWidget`/`clearRegistry` import). Pure module: no
 * database, no network, no React, no side effects — never throws.
 */
import type { DevThemeBinding } from "@/components/builder/SectionRenderer";
import { activeDevThemeWidgetDefs } from "@/lib/dev-theme-widgets";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import {
  buildTrayRegistry,
  type UnifiedRegistry,
} from "@/lib/unified-widget-registry";

export type EditorExtensionRegistryInput = {
  /** This tenant's server-authorized installed plugins (`pluginListFn`). */
  installedPlugins: readonly InstalledPlugin[];
  /** Server-authorized active theme key (workspace theme `sourceKey`). */
  themeKey: unknown;
  /**
   * Server-projected Level B manifest for the approved ACTIVE release ONLY.
   * Absent (or anything unparseable) adapts to no defs — fail-closes to
   * plugins-only.
   */
  approvedDevManifest: unknown;
  /** Workspace theme `isActive` — only an active theme adapts. */
  isActive: unknown;
};

/**
 * Build the editor path's one authorized registry. Never throws; hostile
 * input yields the static tiers (builtin + studio) with no tenant defs.
 */
export function buildEditorExtensionRegistry(
  input: EditorExtensionRegistryInput,
): UnifiedRegistry {
  try {
    if (!input || typeof input !== "object") {
      return buildTrayRegistry([]);
    }
    const installed = Array.isArray(input.installedPlugins)
      ? input.installedPlugins
      : [];
    const registry = buildTrayRegistry(installed);
    for (const def of activeDevThemeWidgetDefs({
      themeKey: input.themeKey,
      manifest: input.approvedDevManifest,
      isActive: input.isActive,
    })) {
      try {
        registry.registerWidget(def);
      } catch {
        // A single bad theme def never breaks the tray.
      }
    }
    return registry;
  } catch {
    return buildTrayRegistry([]);
  }
}

/**
 * Frame30 Level B editor bridge host: deny-all. Every authorized bridge
 * call answers `theme.denied` (the bridge maps the throw to a `theme.*`
 * error — never a rejection, never a side effect). Combined with
 * `granted: []` the authorizer refuses before this is even reached; this is
 * the backstop. Height reporting bypasses the bridge entirely.
 */
export async function denyEditorDevThemeCalls(): Promise<unknown> {
  throw new Error("theme.denied");
}

/**
 * Complete server-projected binding inputs with the editor host
 * implementation. Returns `undefined` (explicit absent) for anything but a
 * well-formed projection — the caller threads that absent value through, so
 * canvas/inspector/preview share one binding object and never build a
 * second. Never throws.
 */
export function resolveEditorDevThemeBinding(
  inputs: unknown,
): DevThemeBinding | undefined {
  try {
    if (!inputs || typeof inputs !== "object") return undefined;
    const { assetOrigin, theme } = inputs as {
      assetOrigin?: unknown;
      theme?: unknown;
    };
    if (typeof assetOrigin !== "string" || !assetOrigin) return undefined;
    if (!theme || typeof theme !== "object") return undefined;
    const { name, version } = theme as { name?: unknown; version?: unknown };
    if (typeof name !== "string" || !name) return undefined;
    if (typeof version !== "string" || !version) return undefined;
    // The frame URL builder fails closed on malformed identities anyway;
    // this shape check keeps a corrupt loader payload from mounting a
    // binding object at all. Server-carried grants/allow-lists are NOT
    // adopted: the editor surface stays deny-all.
    return {
      assetOrigin,
      theme: { name, version },
      granted: [],
      navigateAllowlist: [],
      onCall: denyEditorDevThemeCalls,
    };
  } catch {
    return undefined;
  }
}
