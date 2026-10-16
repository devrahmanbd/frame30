/**
 * Frame30 studio twin parity pins (repair evidence).
 *
 * Locks in the root-cause proofs behind the `studio-extension-render`
 * repair, so a future refactor cannot silently re-break them:
 *
 * - Twin-default echoes are shed, authored values survive: the bridge
 *   merges the `app-block` catalog defaults under the canonical props, and
 *   the twin→section translation drops values still equal to those
 *   defaults while keeping explicitly authored ones (including a real
 *   `height`).
 * - Official differential: with no threaded registry the canonical node
 *   misses exactly the way the twin does (the reference fallback carries
 *   no plugin defs), i.e. twin/canonical parity holds even on a miss.
 */
import { describe, expect, it } from "vitest";
import { resolveExtensionForRender } from "@/components/builder/SectionRenderer";
import { resolveStudioExtension } from "@/components/builder/studio/renderers";
import {
  appBlockNodeForPlugin,
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
import {
  createWidgetRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import type { InstalledPlugin } from "@/lib/plugin-manifest";
import type { Section } from "@/lib/builder-ast";
import type { StudioNode } from "@/lib/studio/model";

const OFFICIAL_KEY = "plugin:product-reviews/summary";

function officialInstall(): InstalledPlugin[] {
  return [
    {
      installId: "install-official",
      manifest: {
        id: "product-reviews",
        name: "Reviews Test",
        version: "1.2.0",
        api: "^3.0.0",
        permissions: ["render_storefront"],
        widgets: [
          {
            key: "summary",
            label: "Summary",
            slots: ["main"],
            entry: 'framique.mount("OFFICIAL-SUMMARY-STUDIO")',
            height: 200,
          },
        ],
        hooks: [],
        settings: [],
        i18n: { en: {}, bn: {} },
        budget: { jsKb: 10, mainThreadMs: 5 },
      },
      grantedScopes: ["render_storefront"],
      settings: {} as InstalledPlugin["settings"],
      enabled: true,
    },
  ];
}

function twinNode(
  widgetKey: string,
  props: Record<string, unknown>,
): StudioNode {
  const reg = createWidgetRegistry();
  const built = buildExtensionInsert(reg, {
    widgetKey,
    slot: "main",
    generateId: () => "twin-pin",
  });
  if (!built.ok) {
    const fallback = appBlockNodeForPlugin(widgetKey);
    fallback.settings = {
      ...fallback.settings,
      ...props,
      extensionInstanceId: fallback.id,
      extensionApi: "3.1.0",
    };
    return fallback;
  }
  return studioNodeForExtension({
    ...built.node,
    props: { ...built.node.props, ...props },
  });
}

function canonicalSection(
  widgetKey: string,
  props: Record<string, unknown> = {},
): Section {
  return {
    id: "ext-1",
    type: "extension",
    instanceId: "ext-1",
    owner: { kind: "plugin", id: widgetKey },
    widgetKey,
    apiVersion: "3.1.0",
    props,
  } as unknown as Section;
}

describe("twin parity pins — default echoes shed, authored values survive", () => {
  function nativeTwin(props: Record<string, unknown>): StudioNode {
    return {
      id: "n-1",
      el: "app-block",
      settings: {
        pluginKey: "builtin:heading",
        height: 320,
        ...props,
        extensionInstanceId: "n-1",
        extensionApi: "3.1.0",
      },
    };
  }

  it("sheds the untouched height echo so native props match the canonical node", () => {
    const out = resolveStudioExtension(
      nativeTwin({ text: "Hi" }),
      null,
      undefined,
      [],
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "native-builtin") {
      expect.unreachable("expected studio native-builtin");
      return;
    }
    expect(out.props).toEqual({ text: "Hi" });
  });

  it("keeps an explicitly authored height (never eats canonical data)", () => {
    const out = resolveStudioExtension(
      nativeTwin({ text: "Hi", height: 500 }),
      null,
      undefined,
      [],
    );
    expect(out?.ok).toBe(true);
    if (!out?.ok || out.mode !== "native-builtin") {
      expect.unreachable("expected studio native-builtin");
      return;
    }
    expect(out.props).toEqual({ text: "Hi", height: 500 });
  });
});

describe("twin parity pins — official miss is identical to the canonical miss", () => {
  it("twin and canonical miss the same way with no threaded registry", () => {
    const installs = officialInstall();
    const canonical = resolveExtensionForRender(
      canonicalSection(OFFICIAL_KEY),
      null,
      undefined,
      { installedPlugins: installs },
    );
    const twin = resolveStudioExtension(
      twinNode(OFFICIAL_KEY, {}),
      null,
      undefined,
      installs,
    );
    expect(canonical?.ok).toBe(false);
    expect(twin?.ok).toBe(false);
    expect(twin).toEqual(canonical);
  });

  it("twin and canonical both resolve official with a def-carrying registry", () => {
    const def: WidgetDef = {
      id: OFFICIAL_KEY,
      namespace: "plugin",
      version: "1.0.0",
      label: `Label ${OFFICIAL_KEY}`,
      category: "plugin",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "sandbox",
    };
    const reg = createWidgetRegistry();
    expect(reg.registerWidget(def).ok).toBe(true);
    const installs = officialInstall();
    const canonical = resolveExtensionForRender(
      canonicalSection(OFFICIAL_KEY),
      null,
      reg,
      { installedPlugins: installs },
    );
    const twin = resolveStudioExtension(
      twinNode(OFFICIAL_KEY, {}),
      null,
      reg,
      installs,
    );
    expect(canonical?.ok).toBe(true);
    if (!canonical?.ok || canonical.mode !== "official") {
      expect.unreachable("expected canonical official");
      return;
    }
    expect(twin?.ok).toBe(true);
    if (!twin?.ok || twin.mode !== "official") {
      expect.unreachable("expected twin official");
      return;
    }
    expect(twin.mode).toBe(canonical.mode);
  });
});
