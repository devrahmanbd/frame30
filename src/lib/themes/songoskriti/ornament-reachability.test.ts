/**
 * Songoskriti ornament — editor entry graph reachability (lane (c), Task 7).
 *
 * Imports the productive editor entry (`@/lib/unified-widget-registry`) only;
 * its static graph drags `songoskriti.tsx` → `ornament-presentation` →
 * `ornament-def` (lazy claim) into evaluation. Never imports `./ornament-def`
 * directly — that would schedule the claim here and defeat the bite.
 *
 * The def must be registered through that productive path, or `beforeAll`
 * times out.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getWidget, buildTrayRegistry } from "@/lib/unified-widget-registry";
import {
  resolveInspectorSchema,
  resolvePresentation,
} from "@/lib/widget-presentation";
import { resolveThemeOwnedComponent } from "@/lib/theme-presentations";
import type { Section } from "@/lib/builder-ast";

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

describe("songoskriti ornament — editor entry reachability", () => {
  it("resolves on the shared singleton through the editor entry", () => {
    expect(getWidget(ID)).toBeDefined();
  });

  it("owns the native component through the presentation registry", () => {
    expect(resolveThemeOwnedComponent(ID)).toBeDefined();
  });

  it("resolves owner-definition under the owning theme via a threaded registry", () => {
    const registry = buildTrayRegistry([]);
    const result = resolvePresentation({
      widgetId: ID,
      themeKey: "songoskriti",
      registry,
      props: { eyebrow: "Heritage" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "theme-owned") {
      throw new Error("expected theme-owned owner-definition");
    }
    expect(result.presentation).toBe("owner-definition");
    expect(result.placeholder).toBe(false);
    expect(result.renderer).toBeUndefined();
  });

  it("resolves its schema through the singleton path", () => {
    const out = resolveInspectorSchema(
      ornamentNode({ eyebrow: "Heritage" }),
      buildTrayRegistry([]),
    );
    expect(out.status).toBe("schema");
    if (out.status !== "schema") throw new Error("expected schema");
    expect(out.widgetId).toBe(ID);
  });
});
