/**
 * Songoskriti ornament — registered-def contract (lane (c), Task 7).
 *
 * Asserts the `theme:songoskriti/ornament` WidgetDef is registered on the
 * shared singleton through the PRODUCTIVE import graph only:
 * `builtin-themes` → `preview` → `songoskriti.tsx` → `ornament-presentation`
 * → `ornament-def` (lazy claim). Never imports `./ornament-def` directly —
 * that would schedule the claim here and defeat the graph-reachability bite.
 *
 * The existing `ornament-presentation.test.tsx` covers the direct-import def
 * contract; this suite asserts the REGISTERED copy.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getWidget } from "@/lib/unified-widget-registry";
import { buildTrayRegistry } from "@/lib/unified-widget-registry";
import { themeTrayEntries } from "@/lib/widget-presentation";
import { resolveGenericPresentation } from "@/lib/theme-presentations";
import { studioPluginTrayEntries } from "@/components/builder/studio/plugin-tray";
import { resolveSchemaForSection } from "@/components/builder/SectionInspector";
import { PROP_KINDS, defaultsFor, validateProps } from "@/lib/widget-props";
import type { Section } from "@/lib/builder-ast";
import "@/lib/themes/builtin-themes";

/** Registry identity this theme owns (`theme:<owner>/...`). */
const ID = "theme:songoskriti/ornament";

function ornamentNode(props: Record<string, unknown> = {}): Section {
  return {
    id: "orn-1",
    type: "extension",
    instanceId: "orn-1",
    owner: { kind: "theme", id: "songoskriti" },
    widgetKey: ID,
    apiVersion: "3.1.0",
    props,
  } as unknown as Section;
}

beforeAll(async () => {
  await vi.waitFor(
    () => {
      expect(getWidget(ID)).toBeDefined();
    },
    { timeout: 2000 },
  );
});

describe("songoskriti ornament — registered def (productive path)", () => {
  it("is registered on the singleton with the theme-owned identity", () => {
    const def = getWidget(ID);
    expect(def).toBeDefined();
    if (!def) throw new Error("expected registered def");
    expect(def.id).toBe(ID);
    expect(def.namespace).toBe("theme");
    expect(def.themes).toEqual(["songoskriti"]);
    expect(def.version).toBe("1.0.0");
    expect(def.renderer).toBe("custom");
  });

  it("invents no kinds: every field kind exists in PROP_KINDS", () => {
    const def = getWidget(ID);
    expect(def).toBeDefined();
    if (!def) throw new Error("expected registered def");
    const kinds = new Set(PROP_KINDS as readonly string[]);
    expect(def.propsSchema.fields.length).toBeGreaterThan(0);
    for (const field of def.propsSchema.fields) {
      expect(kinds.has(field.kind), field.key).toBe(true);
    }
  });

  it("defaults validate clean through the shared value layer", () => {
    const def = getWidget(ID);
    expect(def).toBeDefined();
    if (!def) throw new Error("expected registered def");
    const checked = validateProps(def.propsSchema, def.defaults);
    expect(checked.errors).toEqual([]);
    expect(checked.clean).toMatchObject(def.defaults);
    expect(defaultsFor(def.propsSchema)).toMatchObject(def.defaults);
  });

  it("accepts a saved instance snapshot (incl. eyebrow_bn) at save time", () => {
    const def = getWidget(ID);
    expect(def).toBeDefined();
    if (!def) throw new Error("expected registered def");
    const saved = {
      eyebrow: "Heritage",
      eyebrow_bn: "ঐতিহ্য",
      motif: "bloom",
      rule: "double",
    };
    const checked = validateProps(def.propsSchema, saved);
    expect(checked.ok).toBe(true);
    expect(checked.errors).toEqual([]);
    expect(checked.clean.eyebrow).toBe("Heritage");
  });

  it("resolves its schema through the singleton inspector path", () => {
    const out = resolveSchemaForSection(
      ornamentNode({ eyebrow: "Heritage", eyebrow_bn: "ঐতিহ্য" }),
    );
    expect(out.status).toBe("schema");
    if (out.status !== "schema") throw new Error("expected schema");
    expect(out.widgetId).toBe(ID);
  });

  it("is gated into the songoskriti tray only (real build)", () => {
    const registry = buildTrayRegistry([]);
    const song = themeTrayEntries("songoskriti", { registry });
    expect(song.ok).toBe(true);
    if (!song.ok) throw new Error("expected songoskriti tray result");
    expect(song.entries.map((e) => e.id)).toContain(ID);

    const som = themeTrayEntries("somvabona", { registry });
    expect(som.entries.map((e) => e.id)).not.toContain(ID);

    const none = themeTrayEntries("no-such-theme", { registry });
    expect(none.ok).toBe(false);
  });

  it("is appended to the studio tray only when themed", () => {
    expect(
      studioPluginTrayEntries([], "songoskriti").map((e) => e.key),
    ).toContain(ID);
    expect(studioPluginTrayEntries([]).map((e) => e.key)).not.toContain(ID);
  });

  it("carries its universal generic body through the storefront carrier", () => {
    // Reachability: the storefront graph that claims the def must ALSO claim
    // the widget's neutral body (`preview.ts` imports both presentation
    // modules), so a foreign-theme cold load registers the generic too —
    // the body never shares the owner dress's owning-theme-only fate.
    expect(resolveGenericPresentation(ID)).toBeDefined();
  });
});
