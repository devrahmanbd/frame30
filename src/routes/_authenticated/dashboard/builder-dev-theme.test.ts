/**
 * Frame30 task (Level B) — builder route theme wiring pin.
 *
 * The route adapts the approved ACTIVE theme's Level B manifest via
 * `activeDevThemeWidgetDefs` (which runs `fromDevThemeManifest` under an
 * active-key gate) into the route-local `builderRegistry` — never the
 * global singleton — and passes the server-authorized `themeKey` to the
 * tray so active-theme entries appear. Unapproved/inactive/foreign
 * manifests adapt to no defs (pinned in `dev-theme-lifecycle.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SRC = readFileSync(
  "/opt/frame28/src/routes/_authenticated/dashboard/builder.tsx",
  "utf8",
);

describe("builder route Level B theme wiring", () => {
  it("adapts the active theme manifest through the Level B adapter", () => {
    expect(SRC).toContain("activeDevThemeWidgetDefs");
    expect(SRC).toContain("@/lib/dev-theme-widgets");
  });

  it("registers theme defs into the route-local registry (never the singleton)", () => {
    expect(SRC).toMatch(/registerWidget\(def\)/);
    const registryImport = SRC.match(
      /import \{[^}]*\} from "@\/lib\/unified-widget-registry"/,
    );
    expect(registryImport?.[0]).toContain("buildTrayRegistry");
    expect(registryImport?.[0]).not.toContain("registerWidget");
    expect(SRC).not.toContain("clearRegistry");
  });

  it("passes the server-authorized theme key to the tray", () => {
    expect(SRC).toContain("themeKey={activeThemeKey}");
  });

  it("derives the key and the adapt inputs from the authorized workspace theme", () => {
    expect(SRC).toContain("workspace.data?.theme?.sourceKey");
    expect(SRC).toContain("workspace.data?.theme?.isActive");
  });
});
