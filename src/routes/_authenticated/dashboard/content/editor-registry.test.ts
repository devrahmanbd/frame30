/**
 * Frame30 — real editor path one-registry wiring pin.
 *
 * The REAL editor (`content/editor.tsx` → `EditorShell` → `StudioBuilder`,
 * not `dashboard/builder.tsx`) builds ONE tenant-aware registry from the
 * tenant's server-authorized installed plugins PLUS the active approved
 * theme's Level B defs, threads it through `studioSeamProps` /
 * `extensionRegistry` to StudioBuilder, and threads the projected
 * `DevThemeBinding` (or explicit absent) alongside — never a second
 * competing build, never a write to the shared singleton.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const ROUTE_SRC = readFileSync(
  "/opt/frame28/src/routes/_authenticated/dashboard/content/editor.tsx",
  "utf8",
);
const SHELL_SRC = readFileSync(
  "/opt/frame28/src/components/admin/editor/EditorShell.tsx",
  "utf8",
);

describe("real editor route registry/binding provisioning", () => {
  it("builds the registry through the single tenant-aware provider", () => {
    expect(ROUTE_SRC).toContain("buildEditorExtensionRegistry");
    expect(ROUTE_SRC).toContain("@/lib/editor/editor-registry");
    expect(ROUTE_SRC).toContain("resolveEditorDevThemeBinding");
  });

  it("derives the registry from the server-authorized installs + workspace projection", () => {
    expect(ROUTE_SRC).toContain("pluginListFn");
    expect(ROUTE_SRC).toContain("builderWorkspaceFn");
    expect(ROUTE_SRC).toContain("pluginsQuery.data?.plugins");
    expect(ROUTE_SRC).toContain("approvedDevManifest");
  });

  it("passes one registry and one binding to the shell (no second build)", () => {
    expect(ROUTE_SRC).toContain("extensionRegistry={");
    expect(ROUTE_SRC).toContain("devThemeBinding={");
    expect(ROUTE_SRC).not.toContain("buildTrayRegistry(");
    expect(ROUTE_SRC).not.toContain("activeDevThemeWidgetDefs(");
  });

  it("never writes the shared singleton from the route", () => {
    const singletonImport = ROUTE_SRC.match(
      /import \{[^}]*\} from "@\/lib\/unified-widget-registry"/,
    );
    expect(singletonImport).toBeNull();
    expect(ROUTE_SRC).not.toContain("registerWidget(");
    expect(ROUTE_SRC).not.toContain("clearRegistry");
  });
});

describe("EditorShell studio seam provisioning", () => {
  it("threads the registry and the binding through studioSeamProps", () => {
    expect(SHELL_SRC).toContain("extensionRegistry");
    expect(SHELL_SRC).toContain("devThemeBinding");
    expect(SHELL_SRC).toMatch(/studioSeamProps/);
  });

  it("builds no competing registry in the shell (single route build flows through)", () => {
    expect(SHELL_SRC).not.toContain("buildTrayRegistry(");
    expect(SHELL_SRC).not.toContain("activeDevThemeWidgetDefs(");
    expect(SHELL_SRC).not.toContain("buildEditorExtensionRegistry(");
  });
});
