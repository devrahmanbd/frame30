/**
 * Frame30 items 4+5 — canonical extension-node lifecycle (TDD).
 *
 * ONE backward-compatible saved representation for the studio `app-block`
 * twin across insert / drag-drop / select / duplicate / copy-paste /
 * undo-redo / autosave / save-reload / migration / theme-switch:
 *
 * - Stable instanceIds (`extensionInstanceId` pinned to `node.id`),
 *   canonical owner + key + validated props + version + responsive (`bp`) +
 *   slots preserved at every edge.
 * - Duplicates / pastes get fresh instanceIds with deep-cloned props
 *   (edit A, B unchanged — through save/reload).
 * - Theme switch preserves settings with EXPLICIT incompatibility recovery
 *   (never a silent wrong-widget); missing widgets recover with data intact.
 * - Legacy `app-block` nodes (no envelope) and existing pages stay
 *   byte-identical.
 * - Adversarial: hostile props at every edge, id collisions, oversized and
 *   duplicated payloads.
 *
 * Fixture third-party def lives ONLY here (never in core): a novel
 * `plugin:novelty/*` combo covering text/richtext/number/boolean/select/
 * color/media/link/group/repeater + `bp` + `showWhen`.
 */
import { describe, expect, it } from "vitest";
import {
  buildExtensionInsert,
  studioNodeForExtension,
} from "@/components/builder/studio/plugin-tray";
import {
  createWidgetRegistry,
  type UnifiedRegistry,
  type WidgetDef,
} from "@/lib/unified-widget-registry";
import { ownerForWidgetKey } from "@/lib/builder-ast";
import {
  defaultPageSettings,
  parseStudioBody,
  serializeStudioBody,
  type StudioDoc,
  type StudioNode,
} from "@/lib/studio/model";
import {
  dropInto,
  findNode,
  moveNode,
  type DropTarget,
} from "@/lib/studio/tree";
import {
  initHistory,
  pushHistory,
  undo,
  redo,
  currentDoc,
} from "@/lib/studio/history";
import { writeDraft, readDraft } from "@/lib/studio/autosave";
import {
  isExtensionTwin,
  isLegacyAppBlock,
  liveTwinIds,
  migrateLegacyTwin,
  normalizeDocForSave,
  normalizeTwinForSave,
  recoverTwin,
  refreshPastedTwins,
  themeSwitchForDoc,
  themeSwitchForTwin,
  twinAddressOf,
  twinPropsOf,
  twinSlotsOf,
  twinVersionOf,
  twinWidgetKeyOf,
  withFreshTwinIdentity,
} from "./extension-lifecycle";

/* --------------------------------------------------------------- fixtures */

const NOVEL_ID = "plugin:novelty/oddball";
const NOVEL_ID_2 = "plugin:novelty/second";

const NOVEL_FIELDS = [
  { key: "title", label: "Title", kind: "text", default: "Fresh", max: 40 },
  { key: "blurb", label: "Blurb", kind: "richtext" },
  { key: "count", label: "Count", kind: "number", min: 1, max: 9, default: 3 },
  { key: "on", label: "Enabled", kind: "boolean", default: true },
  {
    key: "align",
    label: "Align",
    kind: "select",
    options: [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
    default: "left",
  },
  { key: "fg", label: "Colour", kind: "color", default: "#112233" },
  { key: "cta", label: "Link", kind: "link" },
  { key: "photo", label: "Photo", kind: "image" },
  { key: "clip", label: "Clip", kind: "media" },
  { key: "prod", label: "Product", kind: "product" },
  { key: "coll", label: "Collection", kind: "collection" },
  { key: "cat", label: "Category", kind: "category" },
  {
    key: "detail",
    label: "Detail",
    kind: "text",
    showWhen: { key: "on", equals: true },
  },
  {
    key: "cluster",
    label: "Cluster",
    kind: "group",
    fields: [
      { key: "subtitle", label: "Subtitle", kind: "text", default: "Sub" },
      { key: "accent", label: "Accent", kind: "color", default: "#ff0000" },
    ],
  },
  {
    key: "rows",
    label: "Rows",
    kind: "repeater",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "qty", label: "Qty", kind: "number", min: 0, max: 99 },
    ],
  },
] as unknown as WidgetDef["propsSchema"]["fields"];

function novelDef(id = NOVEL_ID, version = "1.0.0"): WidgetDef {
  return {
    id,
    namespace: "plugin",
    version,
    label: `Oddball ${id}`,
    category: "novelty",
    slots: ["main"],
    defaults: {},
    propsSchema: { fields: JSON.parse(JSON.stringify(NOVEL_FIELDS)) },
    renderer: "sandbox",
  };
}

function registryWith(defs: WidgetDef[]): UnifiedRegistry {
  const reg = createWidgetRegistry();
  for (const def of defs) expect(reg.registerWidget(def).ok).toBe(true);
  return reg;
}

function twinFor(
  widgetKey: string,
  registry: UnifiedRegistry,
  instanceId: string,
  extraProps: Record<string, unknown> = {},
): StudioNode {
  const built = buildExtensionInsert(registry, {
    widgetKey,
    slot: "main",
    generateId: () => instanceId,
  });
  expect(built.ok).toBe(true);
  if (!built.ok) throw new Error("insert must succeed");
  return studioNodeForExtension({
    ...built.node,
    props: { ...built.node.props, ...extraProps },
  });
}

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

/* ------------------------------------------------- canonical address (1) */

describe("canonical address — owner + key, never the singleton", () => {
  it("derives the canonical owner from the widget key", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "addr-1");
    const addr = twinAddressOf(twin);
    expect(addr?.widgetKey).toBe(NOVEL_ID);
    expect(addr?.owner).toEqual(ownerForWidgetKey(NOVEL_ID));
    expect(addr?.owner).toEqual({ kind: "plugin", id: "novelty" });
  });

  it("addresses builtin/studio/theme owners canonically", () => {
    expect(ownerForWidgetKey("builtin:heading")).toEqual({
      kind: "builtin",
      id: "heading",
    });
    expect(ownerForWidgetKey("theme:aurora-lookbook/hero")).toEqual({
      kind: "theme",
      id: "aurora-lookbook",
    });
  });

  it("returns null for legacy/hostile/blank twins (never a spoofed owner)", () => {
    expect(
      twinAddressOf({ id: "l", el: "app-block", settings: {} } as StudioNode),
    ).toBeNull();
    expect(twinAddressOf(null)).toBeNull();
    expect(
      twinAddressOf({
        id: "x",
        el: "app-block",
        settings: {
          pluginKey: "  ",
          extensionInstanceId: "x",
        },
      } as unknown as StudioNode),
    ).toBeNull();
    // A stored `owner` impostor is ignored — derivation wins.
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "addr-spoof");
    (twin.settings as Record<string, unknown>)["owner"] = {
      kind: "theme",
      id: "evil",
    };
    expect(twinAddressOf(twin)?.owner).toEqual({
      kind: "plugin",
      id: "novelty",
    });
  });
});

/* ------------------------------------------- ONE representation (2a: core) */

describe("ONE saved representation — insert preserves everything", () => {
  it("stable instanceId + owner + key + validated props + version + slots", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "stable-1", {
      title: "Authored",
      count: 7,
    });
    expect(twin.id).toBe("stable-1");
    expect(twin.settings["extensionInstanceId"]).toBe("stable-1");
    expect(twin.settings["pluginKey"]).toBe(NOVEL_ID);
    expect(twinAddressOf(twin)?.owner).toEqual({
      kind: "plugin",
      id: "novelty",
    });
    expect(twin.settings["title"]).toBe("Authored");
    expect(twin.settings["count"]).toBe(7);
    // Version tracks latest when unpinned (absent), pinned when requested.
    expect(twinVersionOf(twin)).toBeNull();
    const pinned = buildExtensionInsert(reg, {
      widgetKey: NOVEL_ID,
      slot: "main",
      version: "1.0.0",
      generateId: () => "pinned-1",
    });
    expect(pinned.ok).toBe(true);
    if (!pinned.ok) return;
    expect(pinned.node.version).toBe("1.0.0");
    const pinnedTwin = studioNodeForExtension(pinned.node);
    expect(pinnedTwin.settings["extensionVersion"]).toBe("1.0.0");
  });

  it("responsive bp layers survive insert → normalize → save → reload", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "bp-1", {
      title: "Base",
      bp: { tablet: { title: "Tab" } },
    });
    const doc: StudioDoc = {
      version: 2,
      root: [twin],
      page: defaultPageSettings("BP"),
    };
    const saved = normalizeDocForSave(doc, reg);
    const body = serializeStudioBody(saved);
    const reloaded = parseStudioBody(body)!;
    const settings = reloaded.root[0]!.settings as Record<string, unknown>;
    expect(settings["title"]).toBe("Base");
    expect(
      (settings["bp"] as Record<string, Record<string, unknown>>).tablet?.title,
    ).toBe("Tab");
    expect(settings["extensionInstanceId"]).toBe("bp-1");
    expect(settings["pluginKey"]).toBe(NOVEL_ID);
  });

  it("extensionSlots snapshot is preserved when recorded, absent for legacy", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "slots-1");
    (twin.settings as Record<string, unknown>)["extensionSlots"] = ["main"];
    expect(twinSlotsOf(twin)).toEqual(["main"]);
    const normalized = normalizeTwinForSave(twin, reg);
    expect(
      (normalized.settings as Record<string, unknown>)["extensionSlots"],
    ).toEqual(["main"]);
    const legacy = {
      id: "leg",
      el: "app-block",
      settings: { pluginKey: NOVEL_ID },
    } as StudioNode;
    expect(twinSlotsOf(legacy)).toBeNull();
    expect(normalizeTwinForSave(legacy, reg)).toBe(legacy);
  });
});

/* --------------------------------- select / drag-drop / undo-redo (2b) */

describe("select / drag-drop / undo-redo preserve the twin", () => {
  it("select resolves the twin by id with its canonical address intact", () => {
    const reg = registryWith([novelDef()]);
    const root = [
      twinFor(NOVEL_ID, reg, "sel-a", { title: "A" }),
      twinFor(NOVEL_ID, reg, "sel-b", { title: "B" }),
    ];
    const found = findNode(root, "sel-b");
    expect(found?.settings["title"]).toBe("B");
    expect(twinAddressOf(found)?.widgetKey).toBe(NOVEL_ID);
    expect(twinAddressOf(found)?.owner).toEqual({
      kind: "plugin",
      id: "novelty",
    });
  });

  it("drag-drop (moveNode/dropInto) keeps instanceId + props byte-identical", () => {
    const reg = registryWith([novelDef()]);
    const a = twinFor(NOVEL_ID, reg, "drag-a", { title: "A" });
    const b = twinFor(NOVEL_ID, reg, "drag-b", { title: "B" });
    const before = JSON.stringify([a.settings, b.settings]);
    const moved = moveNode([a, b], "drag-b", {
      id: "drag-a",
      position: "before",
    });
    expect(moved.map((n) => n.id)).toEqual(["drag-b", "drag-a"]);
    expect(JSON.stringify(moved.map((n) => n.settings))).toBe(
      JSON.stringify([b.settings, a.settings]),
    );
    expect(JSON.stringify([a.settings, b.settings])).toBe(before);
    const target: DropTarget = { id: null, position: "after" };
    const dropped = dropInto([], a, target);
    expect(dropped[0]!.settings["extensionInstanceId"]).toBe("drag-a");
  });

  it("undo-redo restores the exact twin (no drift)", () => {
    const reg = registryWith([novelDef()]);
    const v0: StudioDoc = {
      version: 2,
      root: [],
      page: defaultPageSettings("U"),
    };
    const v1: StudioDoc = {
      version: 2,
      root: [twinFor(NOVEL_ID, reg, "undo-1", { title: "One" })],
      page: defaultPageSettings("U"),
    };
    let state = initHistory(v0);
    state = pushHistory(state, v1, "Oddball", "added", 1);
    expect(currentDoc(state).root[0]!.id).toBe("undo-1");
    const back = undo(state);
    expect(currentDoc(back).root).toEqual([]);
    const fwd = redo(back);
    expect(currentDoc(fwd).root[0]!.settings["title"]).toBe("One");
    expect(currentDoc(fwd).root[0]!.settings["extensionInstanceId"]).toBe(
      "undo-1",
    );
  });
});

/* ------------------------------- duplicate / copy-paste / bleed (2c) */

describe("duplicate / copy-paste — fresh ids, deep-cloned props, no bleed", () => {
  it("duplicate gets a fresh instanceId with deep-cloned props", () => {
    const reg = registryWith([novelDef()]);
    const source = twinFor(NOVEL_ID, reg, "dup-src", {
      title: "Src",
      rows: [{ name: "A", qty: 1 }],
    });
    const copy = withFreshTwinIdentity(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.settings["extensionInstanceId"]).toBe(copy.id);
    expect(copy.settings["pluginKey"]).toBe(NOVEL_ID);
    expect(copy.settings).toEqual({
      ...source.settings,
      extensionInstanceId: copy.id,
    });
    expect(copy.settings).not.toBe(source.settings);
    // Deep clone: nested rows are not shared.
    expect(copy.settings["rows"]).not.toBe(source.settings["rows"]);
  });

  it("edit A never bleeds into B — through save/reload", () => {
    const reg = registryWith([novelDef()]);
    const a = twinFor(NOVEL_ID, reg, "bleed-a", { title: "A" });
    const b = withFreshTwinIdentity(a);
    (b.settings as Record<string, unknown>)["title"] = "B";
    expect(a.settings["title"]).toBe("A");
    expect(b.settings["title"]).toBe("B");
    const doc: StudioDoc = {
      version: 2,
      root: [a, b],
      page: defaultPageSettings("Bleed"),
    };
    const body = serializeStudioBody(normalizeDocForSave(doc, reg));
    const reloaded = parseStudioBody(body)!;
    expect(reloaded.root[0]!.settings["title"]).toBe("A");
    expect(reloaded.root[1]!.settings["title"]).toBe("B");
    expect(reloaded.root[0]!.id).not.toBe(reloaded.root[1]!.id);
    expect(reloaded.root[0]!.settings["extensionInstanceId"]).toBe(
      reloaded.root[0]!.id,
    );
    expect(reloaded.root[1]!.settings["extensionInstanceId"]).toBe(
      reloaded.root[1]!.id,
    );
  });

  it("pasted batches never collide (siblings + canvas)", () => {
    const reg = registryWith([novelDef()]);
    const src = twinFor(NOVEL_ID, reg, "paste-src", { title: "P" });
    const live = new Set<string>(["paste-src", "other-1"]);
    const pasted = refreshPastedTwins([src, src], live);
    expect(pasted).toHaveLength(2);
    expect(pasted[0]!.id).not.toBe("paste-src");
    expect(pasted[1]!.id).not.toBe("paste-src");
    expect(pasted[0]!.id).not.toBe(pasted[1]!.id);
    expect(pasted[0]!.settings["extensionInstanceId"]).toBe(pasted[0]!.id);
    expect(pasted[1]!.settings["extensionInstanceId"]).toBe(pasted[1]!.id);
    expect(
      liveTwinIds({ version: 2, root: pasted, page: defaultPageSettings("x") })
        .size,
    ).toBe(2);
  });

  it("nested twins inside containers each get fresh identities", () => {
    const reg = registryWith([novelDef()]);
    const inner = twinFor(NOVEL_ID, reg, "nest-inner", { title: "In" });
    const container: StudioNode = {
      id: "nest-box",
      el: "container",
      settings: { layout: "flex" },
      children: [inner],
    };
    const copy = withFreshTwinIdentity(container);
    expect(copy.id).not.toBe("nest-box");
    expect(copy.children?.[0]!.id).not.toBe("nest-inner");
    expect(copy.children?.[0]!.settings["extensionInstanceId"]).toBe(
      copy.children?.[0]!.id,
    );
  });
});

/* ------------------------------- autosave / save-reload / legacy (2d) */

describe("autosave / save-reload / legacy byte-identity", () => {
  it("autosave draft round-trips the twin byte-identical", () => {
    const reg = registryWith([novelDef()]);
    const doc: StudioDoc = {
      version: 2,
      root: [twinFor(NOVEL_ID, reg, "auto-1", { title: "Auto" })],
      page: defaultPageSettings("Auto"),
    };
    const saved = normalizeDocForSave(doc, reg);
    const store = memoryStorage();
    writeDraft("doc-1", saved, 1000, store);
    const back = readDraft("doc-1", 2000, store);
    expect(back?.doc.root[0]!.settings).toEqual(saved.root[0]!.settings);
    expect(JSON.stringify(back?.doc.root[0]!.settings)).toBe(
      JSON.stringify(saved.root[0]!.settings),
    );
  });

  it("save → reload is stable (second serialize does not drift)", () => {
    const reg = registryWith([novelDef()]);
    const doc: StudioDoc = {
      version: 2,
      root: [twinFor(NOVEL_ID, reg, "stable-wire", { title: "Wire" })],
      page: defaultPageSettings("Wire"),
    };
    const first = serializeStudioBody(normalizeDocForSave(doc, reg));
    const second = serializeStudioBody(parseStudioBody(first)!);
    expect(second).toBe(first);
  });

  it("legacy app-block nodes stay byte-identical through normalize + wire", () => {
    const reg = registryWith([novelDef()]);
    const legacy: StudioNode = {
      id: "leg-1",
      el: "app-block",
      settings: { pluginKey: NOVEL_ID, height: 320 },
    };
    expect(isLegacyAppBlock(legacy)).toBe(true);
    expect(isExtensionTwin(legacy)).toBe(false);
    expect(normalizeTwinForSave(legacy, reg)).toBe(legacy);
    const doc: StudioDoc = {
      version: 2,
      root: [legacy],
      page: defaultPageSettings("Legacy"),
    };
    expect(normalizeDocForSave(doc, reg)).toBe(doc);
    const body = serializeStudioBody(doc);
    const reloaded = parseStudioBody(body)!;
    expect(reloaded.root[0]).toEqual(legacy);
    expect(JSON.stringify(reloaded.root[0])).toBe(JSON.stringify(legacy));
  });

  it("existing non-extension pages stay byte-identical (heading control)", () => {
    const doc: StudioDoc = {
      version: 2,
      root: [{ id: "h-1", el: "heading", settings: { text: "Hi" } }],
      page: defaultPageSettings("Old"),
    };
    const reg = registryWith([novelDef()]);
    expect(normalizeDocForSave(doc, reg)).toBe(doc);
    const body = serializeStudioBody(doc);
    expect(serializeStudioBody(parseStudioBody(body)!)).toBe(body);
  });
});

/* --------------------------------------- migration / missing (2e) */

describe("migration — legacy promotes only on opt-in", () => {
  it("defaults to no migration (byte-identical)", () => {
    const legacy: StudioNode = {
      id: "mig-1",
      el: "app-block",
      settings: { pluginKey: NOVEL_ID, height: 320 },
    };
    const out = migrateLegacyTwin(legacy);
    expect(out.migrated).toBe(false);
    expect(out.node).toBe(legacy);
  });

  it("opt-in promotes the key with the node id as instance id", () => {
    const legacy: StudioNode = {
      id: "mig-2",
      el: "app-block",
      settings: { pluginKey: NOVEL_ID, height: 320 },
    };
    const out = migrateLegacyTwin(legacy, { migrate: true });
    expect(out.migrated).toBe(true);
    expect(out.node.settings["pluginKey"]).toBe(NOVEL_ID);
    expect(out.node.settings["extensionInstanceId"]).toBe("mig-2");
    expect(out.node.settings["height"]).toBe(320);
  });

  it("key-less legacy never migrates (explicit missing, never invented)", () => {
    const legacy: StudioNode = {
      id: "mig-3",
      el: "app-block",
      settings: { pluginKey: "  " },
    };
    expect(migrateLegacyTwin(legacy, { migrate: true }).migrated).toBe(false);
  });

  it("extension twins and non-app-blocks never migrate", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "mig-4");
    expect(migrateLegacyTwin(twin, { migrate: true }).migrated).toBe(false);
    const heading: StudioNode = {
      id: "h",
      el: "heading",
      settings: { text: "Hi" },
    };
    expect(migrateLegacyTwin(heading, { migrate: true }).migrated).toBe(false);
  });
});

describe("missing widgets recover with data preserved", () => {
  it("unresolvable twin keeps its props (placeholder downstream)", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "miss-1", { title: "Keep me" });
    const empty = createWidgetRegistry();
    const verdict = recoverTwin(twin, empty);
    expect(verdict.recovered).toBe(false);
    expect(verdict.node).toBe(twin);
    expect(twinPropsOf(twin)["title"]).toBe("Keep me");
  });

  it("re-resolve recovers byte-identical (no data loss across the gap)", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "miss-2", { title: "Keep me" });
    const before = JSON.stringify(twin.settings);
    const empty = createWidgetRegistry();
    expect(recoverTwin(twin, empty).recovered).toBe(false);
    expect(recoverTwin(twin, reg).recovered).toBe(true);
    expect(recoverTwin(twin, reg).node).toBe(twin);
    expect(JSON.stringify(twin.settings)).toBe(before);
  });
});

/* --------------------------------------- theme-switch (2f) */

describe("theme-switch — settings preserved, explicit recovery only", () => {
  function themeDef(theme: string, widget: string): WidgetDef {
    return {
      id: `theme:${theme}/${widget}`,
      namespace: "theme",
      version: "1.0.0",
      label: `${widget}`,
      category: "theme",
      slots: ["main"],
      defaults: {},
      propsSchema: { fields: [] },
      renderer: "custom",
      themes: [theme],
    };
  }

  it("compatible switch keeps the node stable", () => {
    const reg = registryWith([novelDef(), themeDef("aurora", "hero")]);
    const twin = twinFor(NOVEL_ID, reg, "theme-ok", { title: "Stay" });
    const verdict = themeSwitchForTwin(twin, "aurora", reg);
    expect(verdict.compatible).toBe(true);
    if (verdict.compatible) expect(verdict.node).toBe(twin);
  });

  it("foreign theme-owned widget is explicit foreign-theme (never wrong-widget)", () => {
    const reg = registryWith([themeDef("aurora", "hero")]);
    const built = buildExtensionInsert(reg, {
      widgetKey: "theme:aurora/hero",
      slot: "main",
      generateId: () => "theme-foreign",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const twin = studioNodeForExtension(built.node);
    const verdict = themeSwitchForTwin(twin, "songoskriti", reg);
    expect(verdict.compatible).toBe(false);
    if (!verdict.compatible) {
      expect(verdict.reason).toBe("foreign-theme");
      expect(verdict.node).toBe(twin);
      expect(verdict.recovery).toContain("aurora");
      // Settings preserved verbatim — nothing substituted.
      expect(twinWidgetKeyOf(verdict.node)).toBe("theme:aurora/hero");
    }
  });

  it("disabled/incompatible targets are explicit with preserved props", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "theme-off", { title: "Keep" });
    expect(reg.disableWidget(NOVEL_ID).ok).toBe(true);
    const verdict = themeSwitchForTwin(twin, "aurora", reg);
    expect(verdict.compatible).toBe(false);
    if (!verdict.compatible) {
      expect(verdict.reason).toBe("disabled");
      expect(verdict.preservedProps["title"]).toBe("Keep");
      expect(verdict.recovery).toContain(NOVEL_ID);
    }
  });

  it("doc-level switch lists every issue, legacy nodes never gate", () => {
    const reg = registryWith([novelDef(), novelDef(NOVEL_ID_2)]);
    const doc: StudioDoc = {
      version: 2,
      root: [
        twinFor(NOVEL_ID, reg, "doc-t1", { title: "A" }),
        { id: "leg", el: "app-block", settings: { pluginKey: "" } },
        { id: "h", el: "heading", settings: { text: "Hi" } },
      ],
      page: defaultPageSettings("Switch"),
    };
    const out = themeSwitchForDoc(doc, "aurora", reg);
    expect(out.compatible).toBe(true);
    expect(out.doc).toBe(doc);
    expect(out.issues).toEqual([]);
  });
});

/* --------------------------------------- adversarial (3) */

describe("adversarial — hostile props at every edge", () => {
  it("hostile twin shapes never throw (predicates + address)", () => {
    const hostiles: unknown[] = [
      null,
      undefined,
      42,
      "twin",
      [],
      { el: "app-block", settings: null },
      { el: "app-block", settings: [] },
      { el: "app-block", settings: { extensionInstanceId: {}, pluginKey: [] } },
      { el: "heading", settings: { text: "x" } },
    ];
    for (const hostile of hostiles) {
      expect(isExtensionTwin(hostile)).toBe(false);
      expect(twinAddressOf(hostile)).toBeNull();
      expect(twinWidgetKeyOf(hostile)).toBe("");
      expect(twinVersionOf(hostile)).toBeNull();
      expect(twinSlotsOf(hostile)).toBeNull();
    }
  });

  it("proto-pollution keys are stripped on duplicate + save, never stored", () => {
    const reg = registryWith([novelDef()]);
    const hostile = JSON.parse(
      '{"title":"ok","__proto__":{"polluted":"yes"}}',
    ) as Record<string, unknown>;
    const twin = twinFor(NOVEL_ID, reg, "pp-1", hostile);
    const dup = withFreshTwinIdentity(twin);
    expect(
      Object.prototype.hasOwnProperty.call(dup.settings, "__proto__"),
    ).toBe(false);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    const saved = normalizeTwinForSave(twin, reg);
    expect(
      Object.prototype.hasOwnProperty.call(saved.settings, "__proto__"),
    ).toBe(false);
    expect(
      Object.prototype.hasOwnProperty.call(saved.settings, "__proto__"),
    ).toBe(false);
  });

  it("script markup + unknown keys are neutralized via the threaded schema", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "xss-1", {
      title: "<script>alert(1)</script>Hi",
      unknownKey: "drop-me",
      align: "diagonal",
      count: 99,
      fg: "not-a-color",
      cta: "javascript:evil()",
    });
    const saved = normalizeTwinForSave(twin, reg);
    const settings = saved.settings as Record<string, unknown>;
    expect(settings["title"]).toBe("Hi");
    expect(settings).not.toHaveProperty("unknownKey");
    expect(settings["align"]).toBe("left");
    expect(settings["count"]).toBe(9);
    expect(settings["fg"]).toBe("#112233");
    expect(settings["cta"]).toBe("");
  });

  it("id collisions remap collision-safe with re-pinned envelopes", () => {
    const reg = registryWith([novelDef()]);
    const a = twinFor(NOVEL_ID, reg, "collide", { title: "A" });
    const b = twinFor(
      NOVEL_ID_2,
      registryWith([novelDef(NOVEL_ID_2)]),
      "collide",
      {
        title: "B",
      },
    );
    const doc: StudioDoc = {
      version: 2,
      root: [a, b],
      page: defaultPageSettings("Collide"),
    };
    const saved = normalizeDocForSave(doc, reg);
    expect(saved.root[0]!.id).toBe("collide");
    expect(saved.root[1]!.id).not.toBe("collide");
    expect(saved.root[1]!.settings["extensionInstanceId"]).toBe(
      saved.root[1]!.id,
    );
    expect(saved.root[0]!.settings["title"]).toBe("A");
  });

  it("oversized payloads are capped (text/array/depth), never stored raw", () => {
    const reg = registryWith([novelDef()]);
    const big = "x".repeat(20000);
    const twin = twinFor(NOVEL_ID, reg, "big-1", {
      title: big,
      rows: Array.from({ length: 200 }, (_, i) => ({ name: `n${i}`, qty: i })),
    });
    const saved = normalizeTwinForSave(twin, reg);
    const settings = saved.settings as Record<string, unknown>;
    expect((settings["title"] as string).length).toBeLessThanOrEqual(40);
    expect((settings["rows"] as unknown[]).length).toBeLessThanOrEqual(50);
  });

  it("duplicated hostile payloads (circular/hostile children) never throw", () => {
    const evil = {
      id: "evil",
      el: "app-block",
      settings: {
        pluginKey: NOVEL_ID,
        extensionInstanceId: "evil",
        title: "ok",
      },
      children: "not-an-array",
    } as unknown as StudioNode;
    const copy = withFreshTwinIdentity(evil);
    expect(copy.id).not.toBe("evil");
    expect(copy.settings["extensionInstanceId"]).toBe(copy.id);
    expect(refreshPastedTwins([evil], [])).toHaveLength(1);
    expect(normalizeTwinForSave(evil, null).settings["title"]).toBe("ok");
  });

  it("twinPropsOf never leaks the envelope or hostile keys", () => {
    const reg = registryWith([novelDef()]);
    const twin = twinFor(NOVEL_ID, reg, "leak-1", { title: "T" });
    const props = twinPropsOf(twin);
    expect(props).not.toHaveProperty("pluginKey");
    expect(props).not.toHaveProperty("extensionInstanceId");
    expect(props).not.toHaveProperty("extensionApi");
    expect(props).not.toHaveProperty("extensionVersion");
    expect(props["title"]).toBe("T");
  });
});
