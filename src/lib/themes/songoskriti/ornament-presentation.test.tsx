/**
 * FIRST approved native theme-owned widget — Songoskriti ornament divider.
 *
 * End-to-end contract for `theme:songoskriti/ornament`:
 * - the def lives in official theme source with a value-layer-shaped
 *   `propsSchema` (existing kinds only) and validating defaults;
 * - `resolvePresentation` recognizes the `theme:<owner>/...` identity
 *   (owner-definition under the owning theme, recoverable-fallback under a
 *   foreign theme, missing when unregistered — never another owner's brand);
 * - `SectionRenderer` executes the owning-theme hit natively through the
 *   theme-owned branch (trusted in-repo source, no sandbox, no placeholder);
 * - the inspector resolves its schema (threaded registry + singleton paths).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PROP_KINDS, defaultsFor, validateProps } from "@/lib/widget-props";
import {
  clearRegistry,
  createWidgetRegistry,
  getWidget,
  registerWidget,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import {
  clearThemePresentations,
  registerThemeOwnedComponent,
  resolveThemeOwnedComponent,
} from "@/lib/theme-presentations";
import {
  resolveInspectorSchema,
  resolvePresentation,
} from "@/lib/widget-presentation";
import { resolveSchemaForSection } from "@/components/builder/SectionInspector";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import {
  widgetReader,
  type WidgetComponent,
  type WidgetCtx,
} from "@/components/builder/widgets";
import type { Section } from "@/lib/builder-ast";
import {
  SONGOSKRITI_ORNAMENT_ID,
  SongoskritiOrnamentDef,
} from "./ornament-def";
import { SongoskritiOrnamentPresentation } from "./ornament-presentation";

function ornamentNode(props: Record<string, unknown> = {}): Section {
  return {
    id: "orn-1",
    type: "extension",
    instanceId: "orn-1",
    owner: { kind: "theme", id: "songoskriti" },
    widgetKey: SONGOSKRITI_ORNAMENT_ID,
    apiVersion: "3.1.0",
    props,
  } as unknown as Section;
}

function registryWithOrnament(): UnifiedRegistry {
  const registry = createWidgetRegistry();
  expect(registry.registerWidget(SongoskritiOrnamentDef).ok).toBe(true);
  return registry;
}

function ctxFor(section: Section, locale: "en" | "bn" = "en"): WidgetCtx {
  return {
    section,
    ...widgetReader(section, undefined, locale),
    Heading: "h2",
    primary: false,
    editing: false,
    locale,
    renderChildren: () => null,
    link: (href: string) => href,
  };
}

function renderDirect(section: Section, locale: "en" | "bn" = "en"): string {
  return renderToStaticMarkup(
    createElement(
      SongoskritiOrnamentPresentation as (p: WidgetCtx) => React.ReactElement,
      ctxFor(section, locale),
    ),
  );
}

function renderEngine(
  section: Section,
  opts: {
    themeKey?: string | null;
    registry?: UnifiedRegistry;
    locale?: "en" | "bn";
    editing?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <SectionRenderer
      section={section}
      themeKey={opts.themeKey ?? "songoskriti"}
      registry={opts.registry ?? registryWithOrnament()}
      locale={opts.locale ?? "en"}
      editing={opts.editing ?? false}
    />,
  );
}

beforeEach(() => {
  clearThemePresentations();
  clearRegistry();
  expect(registerWidget(SongoskritiOrnamentDef).ok).toBe(true);
  registerThemeOwnedComponent(
    SONGOSKRITI_ORNAMENT_ID,
    SongoskritiOrnamentPresentation,
  );
});

/* ------------------------------------------------------- def contract */

describe("songoskriti ornament — theme-owned def contract", () => {
  it("carries the theme:<owner>/... identity the resolver recognizes", () => {
    expect(SONGOSKRITI_ORNAMENT_ID).toBe("theme:songoskriti/ornament");
    expect(SongoskritiOrnamentDef.id).toBe(SONGOSKRITI_ORNAMENT_ID);
    expect(SongoskritiOrnamentDef.namespace).toBe("theme");
    expect(SongoskritiOrnamentDef.themes).toEqual(["songoskriti"]);
    expect(SongoskritiOrnamentDef.renderer).toBe("custom");
    expect(SongoskritiOrnamentDef.version).toBe("1.0.0");
  });

  it("invents no kinds: every field kind already exists in PROP_KINDS", () => {
    const kinds = new Set(PROP_KINDS as readonly string[]);
    expect(SongoskritiOrnamentDef.propsSchema.fields.length).toBeGreaterThan(0);
    for (const field of SongoskritiOrnamentDef.propsSchema.fields) {
      expect(kinds.has(field.kind), field.key).toBe(true);
    }
  });

  it("defaults validate clean through the shared value layer", () => {
    const checked = validateProps(
      SongoskritiOrnamentDef.propsSchema,
      SongoskritiOrnamentDef.defaults,
    );
    expect(checked.errors).toEqual([]);
    expect(checked.clean).toMatchObject(SongoskritiOrnamentDef.defaults);
    expect(defaultsFor(SongoskritiOrnamentDef.propsSchema)).toMatchObject(
      SongoskritiOrnamentDef.defaults,
    );
  });

  it("registers through the shared registry gate", () => {
    const registry = createWidgetRegistry();
    expect(registry.registerWidget(SongoskritiOrnamentDef).ok).toBe(true);
    const hit = registry.resolveWidget(SONGOSKRITI_ORNAMENT_ID);
    expect(hit.ok).toBe(true);
  });
});

/* -------------------------------------------------- resolution */

describe("songoskriti ornament — presentation resolution", () => {
  it("resolves owner-definition under the owning theme, holding no renderer", () => {
    const props = { eyebrow: "Heritage", motif: "diamond", rule: "single" };
    const result = resolvePresentation({
      widgetId: SONGOSKRITI_ORNAMENT_ID,
      themeKey: "songoskriti",
      registry: registryWithOrnament(),
      props,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "theme-owned") {
      throw new Error("expected theme-owned owner-definition");
    }
    expect(result.presentation).toBe("owner-definition");
    expect(result.placeholder).toBe(false);
    expect(result.renderer).toBeUndefined();
    expect(result.props).toEqual(props);
  });

  it("falls back recoverably under a foreign theme, holding no renderer", () => {
    const props = { eyebrow: "Heritage" };
    for (const themeKey of ["somvabona", "no-such-theme"]) {
      const result = resolvePresentation({
        widgetId: SONGOSKRITI_ORNAMENT_ID,
        themeKey,
        registry: registryWithOrnament(),
        props,
      });
      expect(result.ok).toBe(true);
      if (!result.ok || result.mode !== "theme-owned") {
        throw new Error("expected theme-owned recoverable-fallback");
      }
      expect(result.presentation).toBe("recoverable-fallback");
      expect(result.placeholder).toBe(true);
      expect(result.renderer).toBeNull();
      expect(result.props).toEqual(props);
    }
  });

  it("misses unknown when the def is not registered (never foreign brand)", () => {
    const result = resolvePresentation({
      widgetId: SONGOSKRITI_ORNAMENT_ID,
      themeKey: "songoskriti",
      registry: createWidgetRegistry(),
      props: { eyebrow: "Kept" },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a miss");
    expect(result.reason).toBe("unknown");
    expect(result.preservedProps).toEqual({ eyebrow: "Kept" });
    expect(result.renderer).toBeNull();
    expect(result).not.toHaveProperty("def");
  });
});

/* --------------------------------------- theme-owned component registry */

describe("songoskriti ornament — theme-owned component registration", () => {
  it("resolves the registered native component by widget id", () => {
    expect(resolveThemeOwnedComponent(SONGOSKRITI_ORNAMENT_ID)).toBe(
      SongoskritiOrnamentPresentation,
    );
  });

  it("returns undefined for unknown ids and never throws on garbage", () => {
    expect(
      resolveThemeOwnedComponent("theme:songoskriti/no-such-widget"),
    ).toBeUndefined();
    for (const bad of ["", "   ", null, undefined, 42, {}]) {
      let out: unknown = "unset";
      expect(() => {
        out = resolveThemeOwnedComponent(bad as never);
      }).not.toThrow();
      expect(out).toBeUndefined();
    }
    expect(() => {
      registerThemeOwnedComponent("", SongoskritiOrnamentPresentation);
      registerThemeOwnedComponent("theme:songoskriti/ornament", null as never);
      registerThemeOwnedComponent(null as never, null as never);
    }).not.toThrow();
  });

  it("is first-wins: a duplicate registration keeps the first component", () => {
    const other: WidgetComponent = () => null;
    registerThemeOwnedComponent(SONGOSKRITI_ORNAMENT_ID, other);
    expect(resolveThemeOwnedComponent(SONGOSKRITI_ORNAMENT_ID)).toBe(
      SongoskritiOrnamentPresentation,
    );
  });
});

/* ---------------------------------------------------------- rendering */

describe("songoskriti ornament — native theme-owned render", () => {
  it("renders the ornament chrome directly (heritage voice, token-only)", () => {
    const html = renderDirect(ornamentNode({ eyebrow: "Heritage" }));
    expect(html).toContain('data-ornament="songoskriti"');
    expect(html).toContain("Heritage");
  });

  it("executes through the renderer theme-owned branch (no placeholder)", () => {
    const node = ornamentNode({ eyebrow: "Heritage", motif: "diamond" });
    const engine = renderEngine(node);
    expect(engine).toContain('data-ornament="songoskriti"');
    expect(engine).toContain("Heritage");
    expect(engine).not.toContain("Widget preview unavailable");
  });

  it("matches direct render output (render output parity)", () => {
    const node = ornamentNode({ eyebrow: "Heritage", motif: "bloom" });
    // Inner markup is byte-identical to the direct render; the engine only
    // adds the standard node chrome wrapper (same as every native lane).
    expect(renderEngine(node)).toBe(
      `<div class="fq-node" data-fq-node="orn-1">${renderDirect(node)}</div>`,
    );
  });

  it("resolves the eyebrow bilingually (en/bn)", () => {
    const node = ornamentNode({ eyebrow: "Heritage", eyebrow_bn: "ঐতিহ্য" });
    expect(renderEngine(node, { locale: "en" })).toContain("Heritage");
    expect(renderEngine(node, { locale: "bn" })).toContain("ঐতিহ্য");
    expect(renderDirect(node, "bn")).toContain("ঐতিহ্য");
  });

  it("keeps the explicit placeholder under a foreign theme", () => {
    const node = ornamentNode({ eyebrow: "Heritage" });
    const editing = renderEngine(node, {
      themeKey: "somvabona",
      editing: true,
    });
    expect(editing).toContain("Widget preview unavailable");
    expect(editing).not.toContain('data-ornament="songoskriti"');
    const storefront = renderEngine(node, { themeKey: "somvabona" });
    expect(storefront).not.toContain('data-ornament="songoskriti"');
    expect(storefront).not.toContain("Heritage");
  });

  it("keeps the explicit placeholder when the def is missing", () => {
    const node = ornamentNode({ eyebrow: "Heritage" });
    const editing = renderToStaticMarkup(
      <SectionRenderer
        section={node}
        themeKey="songoskriti"
        registry={createWidgetRegistry()}
        locale="en"
        editing
      />,
    );
    expect(editing).toContain("Widget preview unavailable");
  });

  it("renders nothing on the storefront when fully empty, editing hint in studio", () => {
    const node = ornamentNode({ motif: "rule", rule: "none" });
    // Null widget output keeps only the standard (empty) node chrome —
    // the same contract as every null-rendering native widget.
    expect(renderEngine(node)).toBe(
      '<div class="fq-node" data-fq-node="orn-1"></div>',
    );
    expect(renderEngine(node)).not.toContain("data-ornament=");
    expect(renderEngine(node, { editing: true })).toContain(
      'data-ornament="songoskriti-empty"',
    );
  });
});

/* --------------------------------------------- inspector resolvability */

describe("songoskriti ornament — editor resolvability", () => {
  it("resolves its schema through a threaded registry", () => {
    const out = resolveInspectorSchema(
      ornamentNode({ eyebrow: "Heritage" }),
      registryWithOrnament(),
    );
    expect(out.status).toBe("schema");
    if (out.status !== "schema") throw new Error("expected schema");
    expect(out.widgetId).toBe(SONGOSKRITI_ORNAMENT_ID);
    expect(out.schema.fields.length).toBe(
      SongoskritiOrnamentDef.propsSchema.fields.length,
    );
  });

  it("resolves its schema through the singleton (legacy inspector path)", () => {
    const out = resolveSchemaForSection(ornamentNode({ eyebrow: "Heritage" }));
    expect(out.status).toBe("schema");
    if (out.status !== "schema") throw new Error("expected schema");
    expect(out.widgetId).toBe(SONGOSKRITI_ORNAMENT_ID);
  });

  it("falls back to legacy when the def is absent (never a crash)", () => {
    clearRegistry();
    expect(getWidget(SONGOSKRITI_ORNAMENT_ID)).toBeUndefined();
    const out = resolveSchemaForSection(ornamentNode({ eyebrow: "Heritage" }));
    expect(out).toEqual({ status: "legacy" });
  });
});
