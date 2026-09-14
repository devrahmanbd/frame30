import { describe, expect, it } from "vitest";
import {
  BREAKPOINT_DEFS,
  DEFAULT_ACTIVE_DEVICES,
  cascadeFor,
  deviceOrder,
  editBox,
  box,
  hasOverride,
  overriddenDevices,
  resolveResponsive,
  responsive,
  setResponsive,
} from "./responsive";
import { LAYOUT_PRESETS, containerCss, presetBases, presetByKey, presetChildCount } from "./containers";
import {
  countNodes,
  emptyStudioDoc,
  isStudioBody,
  newContainer,
  parseStudioBody,
  readStudioBody,
  renderStudioHtml,
  serializeStudioBody,
  studioPlainText,
  upgradeV1,
} from "./model";
import { WIDGETS, groupWidgets, newWidgetNode, searchWidgets, widgetLabel } from "./catalog";
import {
  canMove,
  cloneNode,
  dropPositionFor,
  duplicateNode,
  findNode,
  flatten,
  insertNode,
  moveNode,
  neighbourId,
  removeNode,
  updateNode,
} from "./tree";
import {
  canRedo,
  canUndo,
  currentDoc,
  historyLabel,
  historyList,
  initHistory,
  jumpTo,
  pushHistory,
  redo,
  revisionLabel,
  undo,
} from "./history";
import {
  builtInTemplates,
  docFromTemplate,
  exportDocJson,
  filterTemplates,
  importDocJson,
  importTemplateJson,
  exportTemplateJson,
  instantiate,
  saveAsTemplate,
} from "./templates";
import { STUDIO_SHORTCUTS, detectStudioPlatform, formatStudioShortcut, isTypingElement, matchStudioShortcut } from "./shortcuts";
import { contentControls, controlsForTab, isControlVisible, sectionsForTab } from "./controls";
import { isHiddenOn, nodeCss, pickStyles, resetStyles, transformCss } from "./styles";
import { starterDoc } from "@/lib/page-builder";

describe("responsive values", () => {
  it("cascades widest to narrowest", () => {
    const value = responsive(16, { tablet: 14 });
    expect(resolveResponsive(value, "desktop")).toBe(16);
    expect(resolveResponsive(value, "tablet")).toBe(14);
    expect(resolveResponsive(value, "mobile")).toBe(14);
  });

  it("returns plain values untouched", () => {
    expect(resolveResponsive(24, "mobile")).toBe(24);
    expect(resolveResponsive(undefined, "mobile")).toBeUndefined();
  });

  it("promotes to responsive only when a narrow device is written", () => {
    expect(setResponsive(16, "desktop", 20)).toBe(20);
    const promoted = setResponsive(16, "mobile", 12);
    expect(resolveResponsive(promoted, "mobile")).toBe(12);
    expect(resolveResponsive(promoted, "desktop")).toBe(16);
  });

  it("collapses back to a scalar when overrides are cleared", () => {
    const promoted = setResponsive(16, "mobile", 12);
    expect(setResponsive(promoted, "mobile", undefined)).toBe(16);
  });

  it("reports overrides", () => {
    const value = setResponsive(16, "tablet", 15);
    expect(hasOverride(value, "tablet")).toBe(true);
    expect(hasOverride(value, "mobile")).toBe(false);
    expect(overriddenDevices(value)).toEqual(["tablet"]);
  });

  it("orders devices widest first and always keeps desktop", () => {
    expect(deviceOrder(["mobile"])).toEqual(["desktop", "mobile"]);
    expect(cascadeFor("mobile", DEFAULT_ACTIVE_DEVICES)).toEqual(["desktop", "tablet", "mobile"]);
  });

  it("ships exactly six breakpoints with desktop as base", () => {
    expect(BREAKPOINT_DEFS).toHaveLength(6);
    expect(BREAKPOINT_DEFS.filter((d) => d.base)).toHaveLength(1);
  });

  it("links all four sides while the link toggle is on", () => {
    expect(editBox(box(10), "top", 24)).toMatchObject({ top: 24, right: 24, bottom: 24, left: 24 });
    expect(editBox({ ...box(10), linked: false }, "top", 24)).toMatchObject({ top: 24, right: 10 });
  });
});

describe("containers", () => {
  it("offers the twelve layout presets", () => {
    expect(LAYOUT_PRESETS).toHaveLength(12);
    expect(presetByKey("50-50")).toBeDefined();
    expect(presetBases(presetByKey("25-25-25-25")!)).toEqual([25, 25, 25, 25]);
    expect(presetChildCount(presetByKey("50-50-50-50")!)).toBe(4);
  });

  it("emits flex css by default and grid when asked", () => {
    expect(containerCss({ layout: "flex", direction: "row" }).display).toBe("flex");
    const grid = containerCss({ layout: "grid", columns: 4 });
    expect(grid.display).toBe("grid");
    expect(grid.gridTemplateColumns).toBe("repeat(4, minmax(0, 1fr))");
  });

  it("respects the device when resolving responsive container values", () => {
    const css = containerCss({ layout: "flex", gap: responsive(24, { mobile: 8 }) }, "mobile");
    expect(css.gap).toBe(8);
  });
});

describe("document model", () => {
  it("round-trips through the body marker", () => {
    const doc = emptyStudioDoc("Landing");
    doc.root = [newContainer({}, [newWidgetNode("heading")])];
    const body = serializeStudioBody(doc);
    expect(isStudioBody(body)).toBe(true);
    const parsed = parseStudioBody(body);
    expect(parsed?.root).toHaveLength(1);
    expect(parsed?.page.title).toBe("Landing");
  });

  it("renders an html fallback next to the marker", () => {
    const doc = emptyStudioDoc();
    const heading = newWidgetNode("heading");
    heading.settings.text = "Hello <world>";
    doc.root = [newContainer({}, [heading])];
    const html = renderStudioHtml(doc);
    expect(html).toContain("Hello &lt;world&gt;");
    expect(html).toContain("<section");
  });

  it("upgrades a v1 page-builder document", () => {
    const upgraded = upgradeV1(starterDoc("Old page"));
    expect(upgraded.version).toBe(2);
    expect(upgraded.root.length).toBeGreaterThan(0);
    expect(countNodes(upgraded.root)).toBeGreaterThan(4);
  });

  it("reads either format from a body", () => {
    const v1Body = "<!--fq-builder:v1\n" + JSON.stringify(starterDoc()) + "\nfq-builder:end-->";
    expect(readStudioBody(v1Body)?.version).toBe(2);
    expect(readStudioBody("plain text")).toBeNull();
  });

  it("projects plain text for excerpts", () => {
    const doc = emptyStudioDoc();
    const heading = newWidgetNode("heading");
    heading.settings.text = "Fast delivery";
    doc.root = [newContainer({}, [heading])];
    expect(studioPlainText(doc)).toContain("Fast delivery");
  });

  it("rejects malformed nodes rather than throwing", () => {
    const parsed = parseStudioBody('<!--fq-studio:v2\n{"root":[{"nope":1},{"el":"heading"}]}\nfq-studio:end-->');
    expect(parsed?.root).toHaveLength(1);
  });
});

describe("widget catalogue", () => {
  it("covers the Elementor basics plus commerce", () => {
    expect(WIDGETS.length).toBeGreaterThanOrEqual(30);
    expect(widgetLabel("icon-box")).toBe("Icon box");
    expect(WIDGETS.some((w) => w.category === "commerce")).toBe(true);
  });

  it("searches labels and keywords", () => {
    expect(searchWidgets("faq").map((w) => w.key)).toContain("accordion");
    expect(searchWidgets("").length).toBe(WIDGETS.length);
  });

  it("groups into ordered categories", () => {
    const groups = groupWidgets(WIDGETS);
    expect(groups[0]!.category).toBe("layout");
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
  });

  it("creates nodes with defaults and containers with children", () => {
    expect(newWidgetNode("heading").settings.level).toBe(2);
    expect(newWidgetNode("container").children).toEqual([]);
  });
});

describe("tree operations", () => {
  const tree = () => [
    newContainer({}, [newWidgetNode("heading"), newWidgetNode("text")]),
    newContainer({}, []),
  ];

  it("finds, updates and removes by id", () => {
    const nodes = tree();
    const headingId = nodes[0]!.children![0]!.id;
    expect(findNode(nodes, headingId)?.el).toBe("heading");
    const updated = updateNode(nodes, headingId, (node) => ({ ...node, settings: { ...node.settings, text: "x" } }));
    expect(findNode(updated, headingId)?.settings.text).toBe("x");
    expect(findNode(removeNode(nodes, headingId), headingId)).toBeUndefined();
  });

  it("duplicates next to the original with a new id", () => {
    const nodes = tree();
    const headingId = nodes[0]!.children![0]!.id;
    const next = duplicateNode(nodes, headingId);
    expect(next[0]!.children).toHaveLength(3);
    expect(next[0]!.children![1]!.id).not.toBe(headingId);
  });

  it("clones deeply with fresh ids", () => {
    const original = tree()[0]!;
    const copy = cloneNode(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.children![0]!.id).not.toBe(original.children![0]!.id);
  });

  it("refuses to drop a node inside itself", () => {
    const nodes = tree();
    const parentId = nodes[0]!.id;
    const childId = nodes[0]!.children![0]!.id;
    expect(canMove(nodes, parentId, { id: childId, position: "after" })).toBe(false);
    expect(canMove(nodes, childId, { id: nodes[1]!.id, position: "inside" })).toBe(true);
  });

  it("moves a widget between containers", () => {
    const nodes = tree();
    const childId = nodes[0]!.children![0]!.id;
    const moved = moveNode(nodes, childId, { id: nodes[1]!.id, position: "inside" });
    expect(moved[0]!.children).toHaveLength(1);
    expect(moved[1]!.children).toHaveLength(1);
  });

  it("computes the drop indicator band", () => {
    const rect = { top: 0, height: 100 };
    expect(dropPositionFor(10, rect, true)).toBe("before");
    expect(dropPositionFor(50, rect, true)).toBe("inside");
    expect(dropPositionFor(90, rect, true)).toBe("after");
    expect(dropPositionFor(50, rect, false)).toBe("after");
  });

  it("inserts at a clamped index", () => {
    const nodes = tree();
    const next = insertNode(nodes, null, 99, newWidgetNode("button"));
    expect(next).toHaveLength(3);
    expect(next[2]!.el).toBe("button");
  });

  it("walks document order for keyboard selection", () => {
    const nodes = tree();
    const flat = flatten(nodes);
    expect(flat[0]!.depth).toBe(0);
    expect(flat[1]!.depth).toBe(1);
    expect(neighbourId(nodes, nodes[0]!.id, 1)).toBe(nodes[0]!.children![0]!.id);
  });
});

describe("history", () => {
  it("pushes, undoes and redoes", () => {
    const doc = emptyStudioDoc();
    let state = initHistory(doc);
    expect(canUndo(state)).toBe(false);
    state = pushHistory(state, { ...doc, root: [newContainer()] }, "Container", "added");
    expect(canUndo(state)).toBe(true);
    state = undo(state);
    expect(currentDoc(state).root).toHaveLength(0);
    state = redo(state);
    expect(currentDoc(state).root).toHaveLength(1);
    expect(canRedo(state)).toBe(false);
  });

  it("drops the redo tail after a new edit", () => {
    const doc = emptyStudioDoc();
    let state = pushHistory(initHistory(doc), doc, "Heading", "edited");
    state = undo(state);
    state = pushHistory(state, doc, "Text", "added");
    expect(state.entries).toHaveLength(2);
    expect(canRedo(state)).toBe(false);
  });

  it("caps the log at its limit", () => {
    const doc = emptyStudioDoc();
    let state = initHistory(doc, 5);
    for (let i = 0; i < 20; i += 1) state = pushHistory(state, doc, "Heading", "edited", 1000 + i);
    expect(state.entries).toHaveLength(5);
    expect(state.cursor).toBe(4);
  });

  it("labels entries like Elementor", () => {
    const doc = emptyStudioDoc();
    const state = pushHistory(initHistory(doc), doc, "Heading", "edited");
    expect(historyLabel(state.entries[1]!)).toBe("Heading edited");
    expect(historyList(state)[0]!.current).toBe(true);
    expect(jumpTo(state, 0).cursor).toBe(0);
    expect(jumpTo(state, 99)).toBe(state);
  });

  it("labels revisions with author and age", () => {
    const now = Date.now();
    expect(revisionLabel({ id: "1", author: "Nahid", at: now - 120000, kind: "autosave" }, now)).toBe(
      "Autosave · Nahid · 2 min ago",
    );
  });
});

describe("templates", () => {
  it("ships blocks and pages across categories", () => {
    const templates = builtInTemplates();
    expect(filterTemplates(templates, { kind: "block" }).length).toBeGreaterThanOrEqual(10);
    expect(filterTemplates(templates, { kind: "page" }).length).toBeGreaterThanOrEqual(3);
    expect(filterTemplates(templates, { query: "hero" }).length).toBeGreaterThan(0);
  });

  it("instantiates with fresh ids", () => {
    const template = builtInTemplates()[0]!;
    const a = instantiate(template);
    const b = instantiate(template);
    expect(a[0]!.id).not.toBe(b[0]!.id);
  });

  it("round-trips documents as json", () => {
    const doc = docFromTemplate(builtInTemplates()[0]!, "Landing");
    const restored = importDocJson(exportDocJson(doc));
    expect(restored?.root).toHaveLength(doc.root.length);
    expect(importDocJson("not json")).toBeNull();
  });

  it("round-trips saved templates", () => {
    const saved = saveAsTemplate("My hero", instantiate(builtInTemplates()[0]!));
    const restored = importTemplateJson(exportTemplateJson(saved));
    expect(restored?.name).toBe("My hero");
    expect(restored?.kind).toBe("mine");
  });
});

describe("shortcuts", () => {
  it("lists all nineteen", () => {
    expect(STUDIO_SHORTCUTS).toHaveLength(19);
  });

  it("matches modifier combinations per platform", () => {
    expect(matchStudioShortcut({ key: "z", ctrlKey: true }, "pc")?.id).toBe("undo");
    expect(matchStudioShortcut({ key: "z", ctrlKey: true, shiftKey: true }, "pc")?.id).toBe("redo");
    expect(matchStudioShortcut({ key: "z", ctrlKey: true }, "mac")).toBeUndefined();
    expect(matchStudioShortcut({ key: "z", metaKey: true }, "mac")?.id).toBe("undo");
  });

  it("formats per platform and detects it", () => {
    const undoShortcut = STUDIO_SHORTCUTS.find((s) => s.id === "undo")!;
    expect(formatStudioShortcut(undoShortcut, "mac")).toBe("⌘Z");
    expect(formatStudioShortcut(undoShortcut, "pc")).toBe("Ctrl+Z");
    expect(detectStudioPlatform({ platform: "MacIntel" })).toBe("mac");
    expect(detectStudioPlatform({ platform: "Win32" })).toBe("pc");
  });

  it("knows when focus is in a field", () => {
    expect(isTypingElement({ tagName: "INPUT" })).toBe(true);
    expect(isTypingElement({ tagName: "DIV" })).toBe(false);
  });
});

describe("control schema", () => {
  it("gives every widget a content tab", () => {
    for (const widget of WIDGETS) expect(contentControls(widget.key).length).toBeGreaterThan(0);
  });

  it("splits into the three Elementor tabs", () => {
    const node = newWidgetNode("heading");
    expect(controlsForTab(node, "content").length).toBeGreaterThan(0);
    expect(controlsForTab(node, "style").length).toBeGreaterThan(0);
    expect(controlsForTab(node, "advanced").length).toBeGreaterThan(0);
  });

  it("groups controls into collapsible sections", () => {
    const sections = sectionsForTab(newWidgetNode("container"), "content");
    expect(sections.map((s) => s.title)).toContain("Layout");
  });

  it("hides grid-only controls in flex mode", () => {
    const columns = contentControls("container").find((c) => c.key === "columns")!;
    expect(isControlVisible(columns, { layout: "flex" })).toBe(false);
    expect(isControlVisible(columns, { layout: "grid" })).toBe(true);
  });
});

describe("style resolution", () => {
  it("resolves typography per device", () => {
    const node = newWidgetNode("heading");
    node.settings.fontSize = responsive(48, { mobile: 28 });
    expect(nodeCss(node, "desktop").fontSize).toBe(48);
    expect(nodeCss(node, "mobile").fontSize).toBe(28);
  });

  it("builds a transform string only from set values", () => {
    expect(transformCss({}, "desktop")).toBeUndefined();
    expect(transformCss({ rotate: 5, scale: 1.2 }, "desktop")).toBe("rotate(5deg) scale(1.2)");
  });

  it("honours per-device hiding", () => {
    const node = newWidgetNode("text");
    node.settings.hideMobile = true;
    expect(isHiddenOn(node, "mobile")).toBe(true);
    expect(isHiddenOn(node, "desktop")).toBe(false);
  });

  it("resets and copies only style keys", () => {
    const settings = { text: "keep", fontSize: 40, background: "#fff" };
    expect(resetStyles(settings)).toEqual({ text: "keep" });
    expect(pickStyles(settings)).toEqual({ fontSize: 40, background: "#fff" });
  });
});
