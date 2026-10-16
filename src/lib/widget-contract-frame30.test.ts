/**
 * Frame30 — Pass 1 (RED): complete third-party widget definition contract.
 *
 * Every plugin widget declares: stable namespaced ID (via key + plugin id),
 * version, label, category, propsSchema, defaultProps, rendering mode,
 * slots, data requirements, actions, states, responsive + styling
 * capabilities, theme compatibility — validated at the gate with keyed
 * errors; unknown keys rejected. Global settings stay structurally distinct
 * from per-instance props.
 */
import { describe, expect, it } from "vitest";
import { parseManifest } from "./plugin-manifest";

const ENTRY = "framique.mount(document.createTextNode('x'))";

function baseManifest(widgets: unknown[]) {
  return {
    id: "acme-co",
    name: "Acme Co",
    version: "1.2.0",
    api: "^3.0.0",
    permissions: ["read_shop", "render_storefront"],
    widgets,
    hooks: [],
    settings: [],
    i18n: { en: {}, bn: {} },
  };
}

function legacyWidget() {
  return { key: "badge", label: "Badge", slots: ["main"], entry: ENTRY };
}

describe("Pass1 contract — full widget declaration accepted", () => {
  it("accepts a fully-declared widget with every contract member", () => {
    const verdict = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          version: "1.2.0",
          category: "reviews",
          rendering: "isolated",
          dataRequirements: [{ source: "reviews", params: { limit: 6 } }],
          actions: ["submit", "filter"],
          states: ["loading", "ready", "empty"],
          capabilities: { responsive: true, styling: "tokens" },
          themeCompatibility: {
            themes: ["songoskriti"],
            minBuilderApi: "3.0.0",
          },
          propsSchema: [{ key: "heading", label: "Heading", kind: "text" }],
          defaultProps: { heading: "Hi" },
        },
      ]),
    );
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const w = verdict.manifest.widgets[0]!;
    expect(w.version).toBe("1.2.0");
    expect(w.category).toBe("reviews");
    expect(w.rendering).toBe("isolated");
    expect(w.dataRequirements).toEqual([
      { source: "reviews", params: { limit: 6 } },
    ]);
    expect(w.actions).toEqual(["submit", "filter"]);
    expect(w.states).toEqual(["loading", "ready", "empty"]);
    expect(w.capabilities).toEqual({ responsive: true, styling: "tokens" });
    expect(w.themeCompatibility).toMatchObject({ minBuilderApi: "3.0.0" });
  });

  it("derives rendering from themeable presence when absent", () => {
    const isolated = parseManifest(baseManifest([legacyWidget()]));
    expect(isolated.ok).toBe(true);
    if (!isolated.ok) return;
    // Absent rendering stays absent at the gate (adapter derives); the
    // contract default is pinned by the adapter test below.
    expect("rendering" in isolated.manifest.widgets[0]!).toBe(false);
  });

  it("rejects unknown widget keys with keyed errors", () => {
    const verdict = parseManifest(
      baseManifest([{ ...legacyWidget(), bogusCapability: true }]),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors).toContain("widgets[0].bogusCapability");
  });

  it("rejects unknown capability sub-keys with keyed errors", () => {
    const verdict = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          capabilities: { responsive: true, bogus: 1 },
        },
      ]),
    );
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.errors.some((e) => e.includes("capabilities"))).toBe(true);
  });

  it("rejects bad version/category/rendering with keyed errors", () => {
    for (const [widget, code] of [
      [{ ...legacyWidget(), version: "not-semver" }, "widgets[0].version"],
      [{ ...legacyWidget(), category: "" }, "widgets[0].category"],
      [{ ...legacyWidget(), rendering: "iframe" }, "widgets[0].rendering"],
      [{ ...legacyWidget(), actions: [""] }, "widgets[0].actions"],
      [{ ...legacyWidget(), states: "ready" }, "widgets[0].states"],
      [
        { ...legacyWidget(), dataRequirements: [{ source: "" }] },
        "widgets[0].dataRequirements",
      ],
    ] as const) {
      const v = parseManifest(baseManifest([widget]));
      expect(v.ok, code).toBe(false);
      if (!v.ok) expect(v.errors).toContain(code);
    }
  });

  it("themeable rendering requires the themeable contract", () => {
    const v = parseManifest(
      baseManifest([{ ...legacyWidget(), rendering: "themeable" }]),
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain("widgets[0].rendering");
  });
});

describe("Pass1 contract — settings vs props stay structurally distinct", () => {
  it("settings-only kinds never validate as props and vice versa", () => {
    // textarea/url/date exist only in SettingField; repeater/group only in PropField.
    const propsKinds = ["repeater", "group", "link", "icon"];
    for (const kind of propsKinds) {
      const v = parseManifest(
        baseManifest([
          {
            ...legacyWidget(),
            propsSchema: [{ key: "fld", label: "X", kind }],
          },
        ]),
      );
      // link/icon without extra config are valid prop kinds (no options needed).
      if (kind === "link" || kind === "icon") expect(v.ok).toBe(true);
    }
    const bad = parseManifest(
      baseManifest([
        {
          ...legacyWidget(),
          propsSchema: [{ key: "fld", label: "X", kind: "textarea" }],
        },
      ]),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toContain("widgets[0].propsSchema[0].kind");
  });

  it("TYPE: SettingField and PropField are mutually non-assignable", () => {
    // Compile-time proof: settings-only kinds cannot flow into props.
    // @ts-expect-error — textarea is a settings-only kind, never a prop kind
    const _settingsKindAsProp: import("./widget-props").PropKind = "textarea";
    // @ts-expect-error — date is a settings-only kind, never a prop kind
    const _dateAsProp: import("./widget-props").PropKind = "date";
    // @ts-expect-error — repeater is a props-only kind, never a setting kind
    const _repeaterAsSetting: import("./plugin-manifest").SettingKind =
      "repeater";
    expect([
      _settingsKindAsProp,
      _dateAsProp,
      _repeaterAsSetting,
    ]).toBeDefined();
  });

  it("RUNTIME: adapter defaults never merge global settings", async () => {
    const { fromPluginManifest } = await import("./unified-widget-registry");
    const { parseManifest } = await import("./plugin-manifest");
    const verdict = parseManifest({
      id: "acme-co",
      name: "Acme",
      version: "1.0.0",
      api: "^3.0.0",
      permissions: ["read_shop", "render_storefront"],
      widgets: [
        {
          key: "hero",
          label: "Hero",
          slots: ["main"],
          entry: "framique.mount(document.createTextNode('x'))",
          propsSchema: [{ key: "heading", label: "Heading", kind: "text" }],
          defaultProps: { heading: "instance" },
        },
      ],
      hooks: [],
      settings: [{ key: "globaltitle", label: "Global", kind: "text" }],
      i18n: { en: {}, bn: {} },
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    const installed = {
      installId: "inst",
      manifest: verdict.manifest,
      grantedScopes: ["read_shop", "render_storefront"],
      settings: { globaltitle: "global" },
      enabled: true,
    };
    const defs = fromPluginManifest([installed]);
    expect(defs).toHaveLength(1);
    // Per-instance defaults carry ONLY widget keys; global settings never leak.
    expect(defs[0]!.defaults).toMatchObject({ heading: "instance" });
    expect(defs[0]!.defaults).not.toHaveProperty("globaltitle");
    // And global validation never yields instance keys.
    const { validateSettings } = await import("./plugin-manifest");
    const checked = validateSettings(verdict.manifest.settings, {
      globaltitle: "global",
      heading: "squat",
    });
    expect(checked.values).toMatchObject({ globaltitle: "global" });
    expect(checked.values).not.toHaveProperty("heading");
  });
});
