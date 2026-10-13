/**
 * Frame30 — canonical extension node (AST layer, RED-first).
 *
 * The core `SectionType` union stays closed (total maps like `WIDGET_HELP`
 * and the `SECTION_CATALOG.length === 157` / twin-parity pins forbid a new
 * member). The canonical extension variant therefore lives as a runtime
 * `type: "extension"` node handled by `builder-ast` parse/validate/normalize
 * helpers, registered in the CATALOG map only (never `SECTION_CATALOG`).
 *
 * Pins: parse/serialize round-trip, legacy `plugin_block` migration both
 * directions without data loss (forward) / representable subset (reverse),
 * identical node-count/slot/depth limits, duplicate-id remap rule,
 * data-preserving missing placeholder + recovery, theme-change prop safety.
 */
import { describe, expect, it } from "vitest";
import {
  AST_LIMITS,
  catalogEntry,
  cleanExtensionProps,
  EXTENSION_API_DEFAULT,
  EXTENSION_MISSING,
  EXTENSION_MISSING_KEY,
  extensionMissingReason,
  extensionToPluginBlock,
  isExtensionNode,
  MAX_NODES_PER_TEMPLATE,
  normalizeExtensionOwner,
  ownerForWidgetKey,
  parseAst,
  pluginBlockToExtension,
  resolveExtensionNode,
  toExtensionPlaceholder,
  withThemeWidgetDefaults,
  type Section,
  type SectionType,
} from "./builder-ast";

const EXT = "extension" as unknown as SectionType;

function extensionRaw(overrides: Record<string, unknown> = {}) {
  return {
    id: "ext-1",
    type: "extension",
    instanceId: "ext-1",
    owner: { kind: "plugin", id: "acme" },
    widgetKey: "plugin:acme/reviews",
    apiVersion: "3.1.0",
    props: { title: "Reviews", limit: 6 },
    ...overrides,
  };
}

function pluginBlockRaw(overrides: Record<string, unknown> = {}) {
  return {
    id: "pb-1",
    type: "plugin_block",
    props: { pluginKey: "plugin:acme/reviews", height: 420 },
    ...overrides,
  };
}

describe("extension catalog registration (additive only)", () => {
  it("resolves a catalog entry without joining SECTION_CATALOG", async () => {
    const entry = catalogEntry(EXT);
    expect(entry?.label).toBe("Extension");
    expect(entry?.slots).toEqual(["header", "main", "footer"]);
    expect(entry?.heading).toBe(false);
    const { SECTION_CATALOG } = await import("./builder-ast");
    expect(SECTION_CATALOG.some((e) => e.type === EXT)).toBe(false);
    expect(SECTION_CATALOG.length).toBe(157);
  });
});

describe("extension parse + serialize", () => {
  it("parses a full envelope and keeps every field", () => {
    const ast = parseAst({
      main: [
        extensionRaw({
          responsive: { mobile: { limit: 3 } },
          slots: ["main"],
          version: "1.2.0",
        }),
      ],
    });
    expect(ast.main).toHaveLength(1);
    const node = ast.main[0]!;
    expect(isExtensionNode(node)).toBe(true);
    expect(node.type).toBe("extension");
    expect(node.widgetKey).toBe("plugin:acme/reviews");
    expect(node.apiVersion).toBe("3.1.0");
    expect(node.version).toBe("1.2.0");
    expect(node.instanceId).toBe("ext-1");
    expect(node.owner).toEqual({ kind: "plugin", id: "acme" });
    expect(node.props).toEqual({ title: "Reviews", limit: 6 });
    expect(node.responsive).toEqual({ mobile: { limit: 3 } });
    expect(node.slots).toEqual(["main"]);
    expect(node.invalid).toBeUndefined();
  });

  it("round-trips byte-identically through parseAst twice (serializable)", () => {
    const once = parseAst({ main: [extensionRaw({ slots: ["main"] })] });
    const twice = parseAst(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it("defaults missing envelope fields (instanceId=id, apiVersion, derived owner)", () => {
    const ast = parseAst({
      main: [
        { id: "e9", type: "extension", widgetKey: "builtin:hero", props: {} },
      ],
    });
    const node = ast.main[0]!;
    expect(node.instanceId).toBe("e9");
    expect(node.apiVersion).toBe(EXTENSION_API_DEFAULT);
    expect(node.owner).toEqual({ kind: "builtin", id: "hero" });
    expect(node.version).toBeUndefined();
    expect(node.slots).toBeUndefined();
    expect(node.responsive).toBeUndefined();
  });

  it("blank widgetKey keeps the node as a data-preserving placeholder", () => {
    const ast = parseAst({
      main: [extensionRaw({ widgetKey: "  ", props: { draft: true } })],
    });
    const node = ast.main[0]!;
    expect(node.type).toBe("extension");
    expect(node.invalid).toBe(EXTENSION_MISSING_KEY);
    expect(node.props).toEqual({ draft: true });
    expect(node.widgetKey).toBe("");
  });

  it("filters unknown responsive breakpoints and slots, keeps the rest", () => {
    const ast = parseAst({
      main: [
        extensionRaw({
          responsive: { mobile: { limit: 2 }, watch: { limit: 9 } },
          slots: ["main", "sidebar"],
        }),
      ],
    });
    const node = ast.main[0]!;
    expect(node.responsive).toEqual({ mobile: { limit: 2 } });
    expect(node.slots).toEqual(["main"]);
  });

  it("drops children (extension is a leaf, like every non-container)", () => {
    const ast = parseAst({
      main: [extensionRaw({ children: [{ id: "kid", type: "heading" }] })],
    });
    expect(ast.main[0]!.children).toBeUndefined();
  });

  it("preserves hidden/when/ab alongside the envelope", () => {
    const ast = parseAst({
      main: [
        extensionRaw({
          hidden: ["mobile"],
          when: [{ kind: "auth", op: "is", value: "in" }],
          ab: { experiment: "exp", variant: "b" },
        }),
      ],
    });
    const node = ast.main[0]!;
    expect(node.hidden).toEqual(["mobile"]);
    expect(node.when).toEqual([{ kind: "auth", op: "is", value: "in" }]);
    expect(node.ab).toEqual({ experiment: "exp", variant: "b" });
  });
});

describe("extension duplicate-id rule (rejected-or-remapped pin)", () => {
  it("remaps duplicate node ids with the same -2 suffix rule as every type", () => {
    const ast = parseAst({
      main: [extensionRaw({ id: "dup" }), extensionRaw({ id: "dup" })],
    });
    expect(ast.main.map((n) => n.id)).toEqual(["dup", "dup-2"]);
  });

  it("remaps duplicate instanceIds with the same suffix rule", () => {
    const ast = parseAst({
      main: [
        extensionRaw({ id: "a", instanceId: "same" }),
        extensionRaw({ id: "b", instanceId: "same" }),
      ],
    });
    expect(ast.main.map((n) => n.instanceId)).toEqual(["same", "same-2"]);
    // Node ids are untouched by the instanceId remap.
    expect(ast.main.map((n) => n.id)).toEqual(["a", "b"]);
  });
});

describe("extension limits apply identically", () => {
  // The per-slot slice (60) applies before the whole-template budget (300),
  // so budget pressure is built with nested container children — exactly how
  // builtin nodes reach it.
  function containerWith(id: string, kids: unknown[]): unknown {
    return { id, type: "container", props: {}, children: kids };
  }

  it("counts toward the whole-template node budget", () => {
    const slots: Record<string, unknown[]> = {
      header: [],
      main: [],
      footer: [],
    };
    let n = 0;
    const kid = () => ({
      id: `bulk-${(n += 1)}`,
      type: "extension",
      widgetKey: "plugin:acme/reviews",
      props: {},
    });
    for (const slot of ["header", "main", "footer"] as const) {
      for (let c = 0; c < 2; c += 1) {
        slots[slot]!.push(
          containerWith(`box-${slot}-${c}`, Array.from({ length: 60 }, kid)),
        );
      }
    }
    const ast = parseAst(slots);
    const total = ast.header.length + ast.main.length + ast.footer.length;
    const flat = (nodes: Section[]): number =>
      nodes.reduce(
        (sum, node) => sum + 1 + (node.children ? flat(node.children) : 0),
        0,
      );
    // 6 containers + 360 leaves = 366 offered; the shared budget keeps 300
    // (the 6th top-level container is budget-cut entirely).
    expect(flat([...ast.header, ...ast.main, ...ast.footer])).toBe(
      MAX_NODES_PER_TEMPLATE,
    );
    expect(total).toBe(5);
  });

  it("shares the budget with builtin nodes (no separate allowance)", () => {
    const kids: unknown[] = [
      ...Array.from({ length: 298 }, (_, i) => ({
        id: `h-${i}`,
        type: "heading",
        props: {},
      })),
      extensionRaw({ id: "last-extension" }),
      extensionRaw({ id: "over-budget" }),
    ];
    const ast = parseAst({
      main: [containerWith("mixer", kids)],
    });
    const box = ast.main[0]!;
    // 1 container + 298 headings + 1 extension = 300 kept; the last is cut.
    expect(box.children).toHaveLength(299);
    expect(box.children!.map((n) => n.id)).toContain("last-extension");
    expect(box.children!.map((n) => n.id)).not.toContain("over-budget");
  });

  it("obeys the per-slot slice like every type", () => {
    const nodes = Array.from({ length: 65 }, (_, i) => ({
      id: `s-${i}`,
      type: "extension",
      widgetKey: "plugin:acme/reviews",
      props: {},
    }));
    expect(parseAst({ main: nodes }).main).toHaveLength(
      AST_LIMITS.maxSectionsPerSlot,
    );
  });

  it("an extension leaf past max depth is dropped with the container marked", () => {
    const deep: Record<string, unknown> = {
      id: "lvl0",
      type: "container",
      props: {},
      children: [],
    };
    let cursor = deep;
    for (let i = 1; i <= 8; i += 1) {
      const kid: Record<string, unknown> =
        i === 8
          ? extensionRaw({ id: "deep-leaf" })
          : { id: `lvl${i}`, type: "container", props: {}, children: [] };
      (cursor.children as unknown[]).push(kid);
      if (i < 8) cursor = kid;
    }
    const ast = parseAst({ main: [deep] });
    const ids: string[] = [];
    const walk = (nodes: Section[]): void => {
      for (const n of nodes) {
        ids.push(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(ast.main);
    expect(ids).not.toContain("deep-leaf");
    expect(ids.join(",")).toContain("lvl5");
    expect(ids.join(",")).not.toContain("lvl6");
  });
});

describe("plugin_block <-> extension migration", () => {
  it("forward migration loses nothing (key promoted, height + extras kept)", () => {
    // Lossless path runs on the raw (pre-parse) node: existing plugin_block
    // parsing drops undeclared props and must stay untouched.
    const next = pluginBlockToExtension({
      id: "pb-1",
      type: "plugin_block",
      props: { pluginKey: "plugin:acme/reviews", height: 420, custom: "kept" },
    } as Section)!;
    expect(next.type).toBe("extension");
    expect(next.id).toBe("pb-1");
    expect(next.widgetKey).toBe("plugin:acme/reviews");
    expect(next.props).toMatchObject({ height: 420, custom: "kept" });
    expect(next.props).not.toHaveProperty("pluginKey");
    expect(next.instanceId).toBe("pb-1");
    expect(next.owner).toEqual({ kind: "plugin", id: "acme" });
    expect(next.apiVersion).toBe(EXTENSION_API_DEFAULT);
  });

  it("forward migration of a parsed node keeps the catalog-preserved subset", () => {
    const legacy = parseAst({
      main: [
        pluginBlockRaw({
          props: { pluginKey: "plugin:acme/reviews", height: 420 },
        }),
      ],
    }).main[0]!;
    const next = pluginBlockToExtension(legacy)!;
    expect(next.widgetKey).toBe("plugin:acme/reviews");
    expect(next.props).toMatchObject({ height: 420 });
  });

  it("forward migration of a blank key still converts, flagged missing", () => {
    const legacy = parseAst({
      main: [pluginBlockRaw({ props: { pluginKey: "", height: 320 } })],
    }).main[0]!;
    const next = pluginBlockToExtension(legacy)!;
    expect(next.type).toBe("extension");
    expect(next.widgetKey).toBe("");
    expect(next.invalid).toBe(EXTENSION_MISSING_KEY);
    expect(next.props).toMatchObject({ height: 320 });
  });

  it("forward migration returns null for non-plugin_block input", () => {
    const heading = parseAst({
      main: [{ id: "h", type: "heading", props: {} }],
    }).main[0]!;
    expect(pluginBlockToExtension(heading)).toBeNull();
  });

  it("reverse migration restores the legacy representable subset", () => {
    const node = parseAst({
      main: [extensionRaw({ props: { height: 420, title: "Hi" } })],
    }).main[0]!;
    const legacy = extensionToPluginBlock(node)!;
    expect(legacy.type).toBe("plugin_block");
    expect(legacy.id).toBe("ext-1");
    expect(legacy.props["pluginKey"]).toBe("plugin:acme/reviews");
    expect(legacy.props["height"]).toBe(420);
    // Forward again: the promoted key and height survive the round-trip.
    const again = pluginBlockToExtension(legacy)!;
    expect(again.widgetKey).toBe("plugin:acme/reviews");
    expect(again.props).toMatchObject({ height: 420 });
  });

  it("reverse migration returns null unless the key is plugin-namespaced", () => {
    const builtin = parseAst({
      main: [extensionRaw({ widgetKey: "builtin:hero" })],
    }).main[0]!;
    expect(extensionToPluginBlock(builtin)).toBeNull();
    const heading = parseAst({
      main: [{ id: "h", type: "heading", props: {} }],
    }).main[0]!;
    expect(extensionToPluginBlock(heading)).toBeNull();
  });

  it("reverse(forward(legacy)) preserves pluginKey + height exactly", () => {
    const legacy = parseAst({ main: [pluginBlockRaw()] }).main[0]!;
    const round = extensionToPluginBlock(pluginBlockToExtension(legacy)!)!;
    expect(round.type).toBe("plugin_block");
    expect(round.props["pluginKey"]).toBe("plugin:acme/reviews");
    expect(round.props["height"]).toBe(420);
  });
});

describe("owner derivation", () => {
  it.each([
    ["plugin:acme/reviews", { kind: "plugin", id: "acme" }],
    ["builtin:hero", { kind: "builtin", id: "hero" }],
    ["studio:lookbook", { kind: "studio", id: "lookbook" }],
    ["theme:spotlight/card", { kind: "theme", id: "spotlight" }],
  ])("derives %s", (key, owner) => {
    expect(ownerForWidgetKey(key)).toEqual(owner);
  });

  it("falls back for garbage keys without throwing", () => {
    expect(ownerForWidgetKey("")).toEqual({ kind: "plugin", id: "" });
    expect(ownerForWidgetKey("no-namespace")).toEqual({
      kind: "plugin",
      id: "",
    });
  });

  it("keeps an explicit valid owner, re-derives a malformed one", () => {
    expect(
      normalizeExtensionOwner(
        { kind: "studio", id: " atelier " },
        "plugin:acme/x",
      ),
    ).toEqual({ kind: "studio", id: "atelier" });
    expect(
      normalizeExtensionOwner({ kind: "evil", id: "x" }, "plugin:acme/reviews"),
    ).toEqual({ kind: "plugin", id: "acme" });
    expect(normalizeExtensionOwner(null, "builtin:hero")).toEqual({
      kind: "builtin",
      id: "hero",
    });
  });
});

describe("cleanExtensionProps (JSON-safe preservation)", () => {
  it("keeps scalars, rows and nested objects; drops functions/symbols", () => {
    const fn = () => 1;
    const out = cleanExtensionProps({
      title: "Hi",
      limit: 6,
      on: true,
      rows: [{ q: "a" }],
      deep: { a: { b: [1, "x", null] } },
      fn,
      sym: Symbol("s"),
      undef: undefined,
      nan: Number.NaN,
    });
    expect(out).toMatchObject({
      title: "Hi",
      limit: 6,
      on: true,
      rows: [{ q: "a" }],
      deep: { a: { b: [1, "x", null] } },
    });
    expect(out).not.toHaveProperty("fn");
    expect(out).not.toHaveProperty("sym");
    expect(out).not.toHaveProperty("undef");
    expect(out.nan).toBe(0);
  });

  it("drops cyclic references instead of hanging", () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop["self"] = loop;
    const out = cleanExtensionProps(loop);
    expect(out).toEqual({ a: 1 });
  });
});

describe("missing / disabled placeholder + recovery", () => {
  it("toExtensionPlaceholder keeps every byte of data, only marks invalid", () => {
    const node = parseAst({ main: [extensionRaw()] }).main[0]!;
    const placeholder = toExtensionPlaceholder(node, "disabled");
    expect(placeholder.invalid).toBe(`${EXTENSION_MISSING}:disabled`);
    expect(placeholder.widgetKey).toBe("plugin:acme/reviews");
    expect(placeholder.props).toEqual({ title: "Reviews", limit: 6 });
    expect(placeholder.instanceId).toBe("ext-1");
    expect(extensionMissingReason(placeholder)).toBe("disabled");
    // The input is never mutated.
    expect(node.invalid).toBeUndefined();
  });

  it("resolveExtensionNode maps a resolve miss to a placeholder with data intact", () => {
    const node = parseAst({ main: [extensionRaw()] }).main[0]!;
    const out = resolveExtensionNode(node, () => ({
      ok: false as const,
      reason: "disabled",
    }));
    expect(out.missing).toBe(true);
    expect(out.reason).toBe("disabled");
    expect(out.node.invalid).toBe(`${EXTENSION_MISSING}:disabled`);
    expect(out.node.props).toEqual({ title: "Reviews", limit: 6 });
  });

  it("resolveExtensionNode recovers: a cleared miss restores the node losslessly", () => {
    const node = parseAst({ main: [extensionRaw()] }).main[0]!;
    const missed = resolveExtensionNode(node, () => ({
      ok: false as const,
      reason: "uninstalled",
    }));
    expect(missed.missing).toBe(true);
    const recovered = resolveExtensionNode(missed.node, () => ({
      ok: true as const,
    }));
    expect(recovered.missing).toBe(false);
    expect(recovered.node.invalid).toBeUndefined();
    expect(recovered.node.props).toEqual({ title: "Reviews", limit: 6 });
    expect(recovered.node.widgetKey).toBe("plugin:acme/reviews");
  });

  it("resolveExtensionNode never throws on a hostile lookup", () => {
    const node = parseAst({ main: [extensionRaw()] }).main[0]!;
    const out = resolveExtensionNode(node, () => {
      throw new Error("boom");
    });
    expect(out.missing).toBe(true);
    expect(out.node.props).toEqual({ title: "Reviews", limit: 6 });
  });

  it("non-extension nodes pass through untouched", () => {
    const heading = parseAst({
      main: [{ id: "h", type: "heading", props: {} }],
    }).main[0]!;
    const out = resolveExtensionNode(heading, () => ({
      ok: false as const,
      reason: "disabled",
    }));
    expect(out.missing).toBe(false);
    expect(out.node).toBe(heading);
  });
});

describe("theme change keeps instance props", () => {
  it("withThemeWidgetDefaults never clobbers extension-authored props", () => {
    const authored = { title: "Merchant copy", limit: 6 };
    const theme = {
      [EXT]: { title: "Theme default", limit: 99, extra: "new" },
    };
    const out = withThemeWidgetDefaults(EXT, authored, theme);
    expect(out).toEqual(authored);
  });

  it("without theme defaults the authored props survive by copy", () => {
    const authored = { title: "Merchant copy" };
    expect(withThemeWidgetDefaults(EXT, authored, undefined)).toEqual(authored);
  });
});
