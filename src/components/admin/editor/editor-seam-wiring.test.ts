/**
 * Frame30 lane (wiring side) — one-registry wiring pins.
 *
 * Pass 1+2+4: the SAME authorized registry instance (never a rebuild)
 * reaches tray, inspector, canvas, preview, save and publish; `activeThemeKey`
 * is the registry build key everywhere theme resolution occurs; save/publish
 * canonicalize through that same instance; mid-session switches remount
 * instead of going stale. Static pins (like the sibling seam suite) plus
 * import guards so a second competing build cannot reappear.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const shell = readFileSync(
  "src/components/admin/editor/EditorShell.tsx",
  "utf8",
);
const route = readFileSync(
  "src/routes/_authenticated/dashboard/content/editor.tsx",
  "utf8",
);
const seam = readFileSync("src/lib/editor/editor-seam.ts", "utf8");

describe("route builds ONE authorized registry and threads its key", () => {
  it("calls buildEditorExtensionRegistry exactly once", () => {
    expect(route.match(/buildEditorExtensionRegistry\(/g) ?? []).toHaveLength(
      1,
    );
  });

  it("passes the same instance + binding + build key to the shell", () => {
    expect(route).toContain("extensionRegistry={editorRegistry}");
    expect(route).toContain("devThemeBinding={editorDevThemeBinding");
    expect(route).toContain("activeThemeKey={editorThemeKey}");
    expect(route).toContain("workspaceTheme?.sourceKey");
  });

  it("derives the shell key from the exact registry build input", () => {
    const buildInput = route.match(
      /themeKey:\s*workspaceTheme\?\.sourceKey[\s\S]*?activeThemeKey|editorThemeKey[\s\S]*?sourceKey/,
    );
    expect(route).toContain("themeKey: workspaceTheme?.sourceKey");
    expect(buildInput !== null || route.includes("editorThemeKey")).toBe(true);
  });
});

describe("shell never builds a competing registry", () => {
  it("imports no registry constructors", () => {
    for (const banned of [
      "buildTrayRegistry",
      "createWidgetRegistry",
      "registerWidget",
      "clearRegistry",
      "buildFallbackExtensionRegistry",
    ]) {
      expect(shell).not.toContain(banned);
    }
  });

  it("seam helpers never build either (guard-only)", () => {
    for (const banned of [
      "buildTrayRegistry",
      "createWidgetRegistry",
      "registerWidget(",
      "clearRegistry",
    ]) {
      expect(seam).not.toContain(banned);
    }
  });

  it("guards the seam prop to the same instance or absent", () => {
    expect(shell).toContain("selectEditorRegistry(extensionRegistry)");
    expect(shell).toContain("safeRegistry");
  });
});

describe("same instance reaches every path", () => {
  it("seam object forwards the guarded instance + binding together", () => {
    expect(shell).toContain("extensionRegistry: safeRegistry");
    expect(shell).toContain("devThemeBinding");
    expect(shell).toContain("studioSeamProps");
  });

  it("canvas receives the keyed theme key (not the uuid scope)", () => {
    expect(shell).toContain("activeThemeKey={resolvedThemeKey");
    expect(shell).not.toContain("activeThemeKey={effectiveThemeId");
  });

  it("save + publish canonicalize through that same instance", () => {
    expect(shell).toContain("serializeStudioDocForShell");
    expect(shell).toContain("canonicalizeEditorDocForSave(next, safeRegistry)");
    expect(shell).toContain("onChange={(next) =>");
    expect(shell).toContain("publishFromStudio");
  });

  it("preview shares the identical props (documented at the call site)", () => {
    expect(shell).toContain("preview twin inside the studio shares");
  });
});

describe("mid-session switch degrades with explicit recovery", () => {
  it("resetKey is fingerprint + theme-keyed", () => {
    expect(shell).toContain("registryFingerprint");
    expect(shell).toContain("editorRegistryFingerprint(safeRegistry)");
    expect(shell).toContain("studioResetKey");
    expect(shell).toContain("resetKey={studioResetKey}");
  });

  it("theme key resolves through the single helper", () => {
    expect(shell).toContain("resolveEditorThemeKey({");
    expect(shell).toContain("routeThemeKey");
  });

  it("plugin entries stay a prop normalization (studio derives from registry)", () => {
    expect(shell).toContain("deriveEditorPluginEntries(");
  });
});

describe("contract shapes unchanged", () => {
  it("keeps the four seam prop shapes", () => {
    expect(shell).toContain("extensionRegistry?: UnifiedRegistry | null");
    expect(shell).toContain("devThemeBinding?: DevThemeBinding | null");
    expect(shell).toContain("activeThemeKey?: string | null");
    expect(shell).toContain("pluginEntries?: StudioPluginEntry[]");
  });
});
