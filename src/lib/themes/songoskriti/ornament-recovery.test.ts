/**
 * Songoskriti ornament — foreign-theme gating + recovery (lane (c), Task 7).
 *
 * Imports the productive storefront chain (`@/lib/themes/builtin-themes`)
 * only; its graph drags `preview` → `songoskriti.tsx` → `ornament-presentation`
 * → `ornament-def` (lazy claim) into evaluation. Never imports `./ornament-def`
 * directly.
 *
 * Under a foreign active theme the widget is not insertable while a saved
 * instance stays resolvable, and returns to full render when the owning
 * theme is active again.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getWidget, buildTrayRegistry } from "@/lib/unified-widget-registry";
import {
  themeTrayEntries,
  resolvePresentation,
} from "@/lib/widget-presentation";
import { SectionRenderer } from "@/components/builder/SectionRenderer";
import type { Section } from "@/lib/builder-ast";
import "@/lib/themes/builtin-themes";

const ID = "theme:songoskriti/ornament";
const OWNER = "songoskriti";
const FOREIGN = "somvabona";

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

function render(
  section: Section,
  themeKey: string | null,
  editing = false,
): string {
  return renderToStaticMarkup(
    createElement(SectionRenderer, {
      section,
      themeKey,
      registry: buildTrayRegistry([]),
      editing,
      locale: "en",
    }),
  );
}

beforeAll(async () => {
  await vi.waitFor(
    () => {
      expect(getWidget(ID)).toBeDefined();
    },
    { timeout: 2000 },
  );
});

describe("songoskriti ornament — foreign-theme gating + recovery", () => {
  it("is not insertable under a foreign theme while staying resolvable", () => {
    const registry = buildTrayRegistry([]);
    const foreign = themeTrayEntries(FOREIGN, { registry });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) throw new Error("expected foreign tray result");
    expect(foreign.entries.map((e) => e.id)).not.toContain(ID);
    expect(getWidget(ID)).toBeDefined();
  });

  it("renders full under the owning theme and recovers after a theme switch", () => {
    const node = ornamentNode({ eyebrow: "Heritage", motif: "diamond" });
    const owner = render(node, OWNER);
    expect(owner).toContain('data-ornament="songoskriti"');
    expect(owner).toContain("Heritage");

    const switched = render(node, FOREIGN, true);
    expect(switched).toContain("Widget preview unavailable");
    expect(switched).not.toContain('data-ornament="songoskriti"');

    const storefrontForeign = render(node, FOREIGN);
    expect(storefrontForeign).not.toContain('data-ornament="songoskriti"');
    expect(storefrontForeign).not.toContain("Heritage");

    const back = render(node, OWNER);
    expect(back).toContain('data-ornament="songoskriti"');
    expect(back).toContain("Heritage");
  });

  it("resolves recoverable-fallback under a foreign theme, preserving props", () => {
    const props = { eyebrow: "Heritage", motif: "bloom" };
    const result = resolvePresentation({
      widgetId: ID,
      themeKey: FOREIGN,
      registry: buildTrayRegistry([]),
      props,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "theme-owned") {
      throw new Error("expected theme-owned");
    }
    expect(result.presentation).toBe("recoverable-fallback");
    expect(result.placeholder).toBe(true);
    expect(result.renderer).toBeNull();
    expect(result.props).toEqual(props);
  });
});
