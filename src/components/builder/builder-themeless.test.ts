/**
 * Task 4 (theme purge) — the builder edits sections/design tokens, never themes.
 *
 * Failing-test-first contract for the decoupling:
 * - dashboard/builder.tsx: no preview_theme plumbing, no theme-lifecycle
 *   server functions (registry/install/preset-swap/demo/update), no themes
 *   panel; workspace edit path comes from the builder-workspace shim.
 * - builder-ast.ts: neutral Builder* aliases exported; no "theme token" lint copy.
 * - SectionRenderer / TokenEditor / builder chrome: no theme-system copy.
 * - use-builder-editor: typed on the neutral Builder* aliases.
 *
 * Follows the definition-of-done.test.ts pattern (source-level contract, no
 * render needed) so it stays green regardless of server/DB state.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const BUILDER_ROUTE = "src/routes/_authenticated/dashboard/builder.tsx";

describe("builder route is decoupled from theme lifecycle", () => {
  it("has no preview_theme plumbing", () => {
    const src = read(BUILDER_ROUTE);
    expect(src).not.toMatch(/preview_theme|previewThemeId/);
  });

  it("imports no theme-lifecycle modules", () => {
    const src = read(BUILDER_ROUTE);
    expect(src).not.toMatch(/themes\.functions|appearance\.functions/);
    expect(src).not.toMatch(
      /builderRegistryFn|builderInstallFn|builderPresetSwapFn|builderDemoImportFn|builderDemoPurgeFn|builderUpdatePreviewFn|builderUpdateApplyFn|builderRegistryVersionFn/,
    );
  });

  it("has no themes panel or theme activation UI", () => {
    const src = read(BUILDER_ROUTE);
    expect(src).not.toMatch(/['"]themes['"]/);
    expect(src).not.toMatch(/Activate Theme|Install as draft|Swap preset/);
  });

  it("loads the workspace through the builder-workspace shim", () => {
    const src = read(BUILDER_ROUTE);
    expect(src).toMatch(/builder-workspace\.functions/);
    expect(src).toMatch(/builderWorkspaceFn/);
  });

  it("is not branded as a theme studio", () => {
    const src = read(BUILDER_ROUTE);
    expect(src).not.toMatch(/Theme studio/);
  });
});

describe("builder AST core exposes neutral aliases", () => {
  it("exports Builder* aliases for the AST/token/template types", () => {
    const src = read("src/lib/builder-ast.ts");
    expect(src).toMatch(/export type BuilderAst/);
    expect(src).toMatch(/export type BuilderTemplates/);
    expect(src).toMatch(/export type BuilderTokens/);
    expect(src).toMatch(/EMPTY_BUILDER_AST/);
  });

  it("lints raw colours against design tokens, not theme tokens", () => {
    const src = read("src/lib/builder-ast.ts");
    expect(src).not.toMatch(/use a theme token instead/);
  });

  it("types the editor hook on the neutral aliases", () => {
    const src = read("src/hooks/use-builder-editor.ts");
    expect(src).toMatch(/BuilderTemplates/);
    expect(src).toMatch(/BuilderTokens/);
    expect(src).not.toMatch(/ThemeAst|ThemeTokens|ThemeTemplates/);
  });
});

describe("builder UI carries no theme-system copy", () => {
  it("SectionRenderer invalid placeholder does not mention themes", () => {
    const src = read("src/components/builder/SectionRenderer.tsx");
    expect(src).not.toMatch(/reinstall the theme/);
  });

  it("TokenEditor has no heritage preset or theme palette copy", () => {
    const src = read("src/components/builder/TokenEditor.tsx");
    expect(src).not.toMatch(/Heritage Crimson/);
    expect(src).not.toMatch(/Color Palette & Themes/);
    expect(src).not.toMatch(/This theme is currently light-only/);
  });

  it("builder chrome does not brand itself as a theme studio/engine", () => {
    expect(read("src/components/builder/BuilderTopBar.tsx")).not.toMatch(
      /Theme Studio/,
    );
    expect(read("src/components/builder/SupportedViewportGate.tsx")).not.toMatch(
      /Theme studio needs/,
    );
    expect(read("src/components/builder/SectionInspector.tsx")).not.toMatch(
      /theme engine/,
    );
    expect(read("src/components/builder/CustomCodeEditor.tsx")).not.toMatch(
      /scoped to your theme/,
    );
  });

  it("studio panels reference the builder/storefront, not themes", () => {
    expect(read("src/components/builder/studio/ElementsPanel.tsx")).not.toMatch(
      /theme studio/i,
    );
    expect(read("src/components/builder/studio/renderers.tsx")).not.toMatch(
      /theme engine|theme studio/i,
    );
    expect(read("src/components/builder/studio/StudioBuilder.tsx")).not.toMatch(
      /theme studio|theme global block/i,
    );
  });
});
