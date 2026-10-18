/**
 * Frame30 swap-in 1 — SectionRenderer extension branch (TDD).
 *
 * - New path engages: a `builtin:*` extension renders the SAME markup as its
 *   legacy builtin section (via `resolvePresentation` + tail recursion).
 * - Missing / recoverable-fallback render the EXISTING unavailable
 *   placeholder (no new design), never a crash.
 * - Old path byte-identical when inactive: non-extension sections render
 *   identically with and without the optional `registry` prop.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { newSection, type Section } from "@/lib/builder-ast";
import {
  SectionRenderer,
  builtinTypeForPresentation,
  resolveExtensionForRender,
} from "./SectionRenderer";
import { createWidgetRegistry } from "@/lib/unified-widget-registry";
import {
  clearThemePresentations,
  registerGenericPresentation,
  registerThemeOwnedComponent,
} from "@/lib/theme-presentations";
import type { WidgetComponent } from "./widgets";

function render(section: Section, extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    <SectionRenderer section={section} locale="en" editing {...extra} />,
  );
}

function headingSection(text: string): Section {
  const base = newSection("heading");
  return { ...base, id: "h-legacy", props: { ...base.props, text } };
}

function builtinExtension(
  widgetKey: string,
  props: Record<string, unknown> = {},
): Section {
  return {
    id: "ext-1",
    type: "extension",
    instanceId: "ext-1",
    owner: { kind: "builtin", id: "builtin" },
    widgetKey,
    apiVersion: "3.1.0",
    props,
  } as unknown as Section;
}

describe("SectionRenderer extension swap-in", () => {
  it("resolves a builtin extension to its presentation (new path engages)", () => {
    const out = resolveExtensionForRender(
      builtinExtension("builtin:heading", { text: "Hi" }),
      null,
      undefined,
    );
    expect(out?.ok).toBe(true);
    if (out?.ok && out.mode === "native-builtin") {
      expect(builtinTypeForPresentation(out)).toBe("heading");
    } else {
      expect.unreachable("expected native-builtin hit");
    }
  });

  it("renders a builtin extension like its legacy twin", () => {
    const legacy = render(headingSection("Hello ext"));
    const ext = render(
      builtinExtension("builtin:heading", { text: "Hello ext" }),
    );
    // Same component, same data — markup carries the authored text both ways.
    expect(ext).toContain("Hello ext");
    expect(legacy).toContain("Hello ext");
    // Extension builtin must not fall back to the placeholder.
    expect(ext).not.toContain("Widget preview unavailable");
  });

  it("maps missing and recoverable-fallback to the existing placeholder", () => {
    const missing = render(builtinExtension("builtin:ghost-widget"));
    expect(missing).toContain("Widget preview unavailable");
    // Foreign theme-owned under a non-owner is the recoverable fallback.
    const registry = createWidgetRegistry();
    registry.registerWidget({
      id: "theme:other/thing",
      namespace: "theme",
      version: "1.0.0",
      label: "Thing",
      category: "content",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "custom",
      themes: ["other"],
    });
    const foreign = render(
      builtinExtension("theme:other/thing", { title: "Kept" }),
      { themeKey: "songoskriti", registry },
    );
    expect(foreign).toContain("Widget preview unavailable");
  });

  it("renders the universal generic body under a foreign theme, the dress under its own", () => {
    const ID = "theme:elsewhere/ornate";
    const registry = createWidgetRegistry();
    expect(
      registry.registerWidget({
        id: ID,
        namespace: "theme",
        version: "1.0.0",
        label: "Ornate",
        category: "content",
        slots: ["main"],
        defaults: {},
        propsSchema: { fields: [] },
        renderer: "custom",
        themes: ["elsewhere"],
      }).ok,
    ).toBe(true);
    const Dress: WidgetComponent = (ctx) => (
      <p data-synthetic-dress="yes">{ctx.str("title")}</p>
    );
    const Body: WidgetComponent = (ctx) => (
      <p data-synthetic-body="yes">{ctx.str("title")}</p>
    );
    registerThemeOwnedComponent(ID, Dress);
    registerGenericPresentation(ID, Body);
    try {
      // Theme = dress, widget = body: a foreign active theme renders the
      // widget's own neutral body (never the old placeholder, never a
      // cross-owner component).
      const foreign = render(builtinExtension(ID, { title: "Kept" }), {
        themeKey: "songoskriti",
        registry,
      });
      expect(foreign).toContain('data-synthetic-body="yes"');
      expect(foreign).toContain("Kept");
      expect(foreign).not.toContain('data-synthetic-dress="yes"');
      expect(foreign).not.toContain("Widget preview unavailable");
      // The owner's dress still wins under the owning theme.
      const owner = render(builtinExtension(ID, { title: "Kept" }), {
        themeKey: "elsewhere",
        registry,
      });
      expect(owner).toContain('data-synthetic-dress="yes"');
      expect(owner).toContain("Kept");
      expect(owner).not.toContain('data-synthetic-body="yes"');
    } finally {
      clearThemePresentations();
    }
  });

  it("leaves the legacy built-in path byte-identical when inactive", () => {
    const section = headingSection("Stable copy");
    const withoutRegistry = renderToStaticMarkup(
      <SectionRenderer section={section} locale="en" editing />,
    );
    const withRegistry = renderToStaticMarkup(
      <SectionRenderer
        section={section}
        locale="en"
        editing
        registry={createWidgetRegistry()}
      />,
    );
    expect(withRegistry).toBe(withoutRegistry);
  });
});
