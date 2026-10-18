/**
 * Songoskriti ornament — universal body under a foreign active theme (Task 7/9).
 *
 * Imports the productive storefront chain (`@/lib/themes/builtin-themes`)
 * only; its graph drags `preview` → `songoskriti.tsx` → `ornament-presentation`
 * + `ornament-generic-presentation` → `ornament-def` (lazy claim) into
 * evaluation. Never imports `./ornament-def` or either presentation module
 * directly.
 *
 * Under a foreign active theme a saved instance renders the widget's
 * COMPLETE universal generic body (theme = dress, widget = body) instead of
 * the retired placeholder, and returns to the owner dress when the owning
 * theme is active again. The first case pins the LEGACY `themeTrayEntries`
 * claim seam (platform feature, unchanged): theme-claimed defs append to a
 * theme's legacy tray only for claiming themes. The studio editor tray
 * (`resolveExtensionTrayEntries`) is ungated and lists the ornament under
 * every theme — proven by the editor journey e2e.
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

describe("songoskriti ornament — universal body under foreign themes", () => {
  it("keeps the legacy theme-claim tray scoped while the def stays resolvable", () => {
    // Legacy seam only (`WidgetTray` / `studioPluginTrayEntries` append):
    // theme-claimed defs append for claiming themes. The studio editor tray
    // (`resolveExtensionTrayEntries`) lists the ornament under every theme.
    const registry = buildTrayRegistry([]);
    const foreign = themeTrayEntries(FOREIGN, { registry });
    expect(foreign.ok).toBe(true);
    if (!foreign.ok) throw new Error("expected foreign tray result");
    expect(foreign.entries.map((e) => e.id)).not.toContain(ID);
    expect(getWidget(ID)).toBeDefined();
  });

  it("renders the owner dress under the owning theme and the generic body after a theme switch", () => {
    const node = ornamentNode({ eyebrow: "Heritage", motif: "diamond" });
    const owner = render(node, OWNER);
    expect(owner).toContain('data-ornament="songoskriti"');
    expect(owner).toContain("Heritage");

    const switched = render(node, FOREIGN, true);
    expect(switched).not.toContain("Widget preview unavailable");
    expect(switched).toContain('data-ornament="generic"');
    expect(switched).toContain("Heritage");
    expect(switched).not.toContain('data-ornament="songoskriti"');

    const storefrontForeign = render(node, FOREIGN);
    expect(storefrontForeign).toContain('data-ornament="generic"');
    expect(storefrontForeign).toContain("Heritage");
    expect(storefrontForeign).not.toContain('data-ornament="songoskriti"');

    const back = render(node, OWNER);
    expect(back).toContain('data-ornament="songoskriti"');
    expect(back).toContain("Heritage");
  });

  it("resolves generic-presentation under a foreign theme, preserving props", () => {
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
    expect(result.presentation).toBe("generic-presentation");
    expect(result.placeholder).toBe(false);
    expect(result.renderer).toBeNull();
    expect(result.props).toEqual(props);
  });
});
