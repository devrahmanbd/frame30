/**
 * Studio (new editor) interaction gaps — TDD contract.
 *
 * Covers the audit findings against EditorShell + studio/*:
 *  1. new shortcut ids dispatch (move_up/move_down, deselect, search_layers,
 *     bare-? help, Backspace delete) with mod-either matching;
 *  2. conditional preventDefault (unhandled keys never hijack the browser);
 *  3. versioned clipboard round-trip + oversized/foreign rejection;
 *  4. multi-select toggle/replace + top-most bulk semantics.
 */
import { describe, expect, it, vi } from "vitest";
import {
  STUDIO_SHORTCUTS,
  matchStudioShortcut,
  resolveStudioShortcutId,
} from "@/lib/studio/shortcuts";
import {
  STUDIO_CLIPBOARD_LIMITS,
  createStudioClipboardStore,
  parseStudioClipboardPayload,
} from "@/lib/studio/useStudio";
import type { StudioNode } from "@/lib/studio/model";
import {
  applySelection,
  handleStudioKeyDown,
  nudgeStudioNodes,
  runStudioShortcut,
  topMostStudioIds,
  type StudioShortcutContext,
} from "./StudioBuilder";

function node(
  id: string,
  children: StudioNode[] = [],
  el = "container",
): StudioNode {
  return { id, el, settings: {}, children };
}

function stubCtx(overrides: Partial<StudioShortcutContext> = {}) {
  const calls: string[] = [];
  const ctx: StudioShortcutContext = {
    hasSelection: true,
    selectedIds: ["a"],
    undo: () => void calls.push("undo"),
    redo: () => void calls.push("redo"),
    copy: () => (void calls.push("copy"), true),
    paste: () => (void calls.push("paste"), true),
    duplicate: () => (void calls.push("duplicate"), true),
    remove: () => (void calls.push("remove"), true),
    pasteStyle: () => (void calls.push("pasteStyle"), true),
    resetStyle: () => void calls.push("resetStyle"),
    saveDraft: () => void calls.push("saveDraft"),
    publish: () => void calls.push("publish"),
    togglePreview: () => void calls.push("togglePreview"),
    toggleStructure: () => void calls.push("toggleStructure"),
    openModal: (name) => void calls.push(`modal:${name}`),
    nudge: (delta) => (void calls.push(`nudge:${delta}`), true),
    deselect: () => void calls.push("deselect"),
    searchLayers: () => void calls.push("searchLayers"),
    ...overrides,
  };
  return { ctx, calls };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("studio shortcuts — new ids", () => {
  it("advertises move_up/move_down, deselect and search_layers", () => {
    const ids = new Set(STUDIO_SHORTCUTS.map((s) => s.id));
    for (const id of ["move_up", "move_down", "deselect", "search_layers"]) {
      expect(ids.has(id as never), id).toBe(true);
    }
  });

  it("matches reorder keys with either mod key", () => {
    expect(matchStudioShortcut({ key: "ArrowUp", metaKey: true })?.id).toBe(
      "move_up",
    );
    expect(matchStudioShortcut({ key: "ArrowUp", ctrlKey: true })?.id).toBe(
      "move_up",
    );
    expect(matchStudioShortcut({ key: "ArrowDown", metaKey: true })?.id).toBe(
      "move_down",
    );
    expect(
      matchStudioShortcut({ key: "ArrowDown", ctrlKey: true }, "mac")?.id,
    ).toBe("move_down");
  });

  it("matches Escape (deselect), ⇧⌘F (search_layers) and bare ? (help)", () => {
    expect(matchStudioShortcut({ key: "Escape" })?.id).toBe("deselect");
    expect(
      matchStudioShortcut({ key: "f", metaKey: true, shiftKey: true })?.id,
    ).toBe("search_layers");
    expect(
      matchStudioShortcut({ key: "F", ctrlKey: true, shiftKey: true })?.id,
    ).toBe("search_layers");
    expect(matchStudioShortcut({ key: "?" })?.id).toBe("shortcuts");
    // Shift-produced "?" still opens help instead of requiring the mod combo.
    expect(matchStudioShortcut({ key: "?", shiftKey: true })?.id).toBe(
      "shortcuts",
    );
  });

  it("deletes on both Delete and Backspace", () => {
    expect(matchStudioShortcut({ key: "Delete" })?.id).toBe("delete");
    expect(matchStudioShortcut({ key: "Backspace" })?.id).toBe("delete");
  });

  it("accepts either mod key on either platform", () => {
    expect(matchStudioShortcut({ key: "c", ctrlKey: true })?.id).toBe("copy");
    expect(matchStudioShortcut({ key: "c", metaKey: true })?.id).toBe("copy");
    expect(matchStudioShortcut({ key: "c", metaKey: true }, "mac")?.id).toBe(
      "copy",
    );
    expect(matchStudioShortcut({ key: "c", ctrlKey: true }, "mac")?.id).toBe(
      "copy",
    );
    expect(matchStudioShortcut({ key: "c" })).toBeUndefined();
  });

  it("keeps both paste-style spellings working", () => {
    expect(resolveStudioShortcutId("pasteStyle")).toBe("pasteStyle");
    expect(resolveStudioShortcutId("paste_style")).toBe("pasteStyle");
    expect(resolveStudioShortcutId("nope")).toBeUndefined();
  });
});

describe("studio shortcut dispatch", () => {
  it("dispatches the new ids through runStudioShortcut", () => {
    const { ctx, calls } = stubCtx();
    expect(runStudioShortcut("move_up", ctx)).toBe(true);
    expect(runStudioShortcut("move_down", ctx)).toBe(true);
    expect(runStudioShortcut("deselect", ctx)).toBe(true);
    expect(runStudioShortcut("search_layers", ctx)).toBe(true);
    expect(calls).toEqual(["nudge:-1", "nudge:1", "deselect", "searchLayers"]);
  });

  it("dispatches both paste-style spellings to the same handler", () => {
    const { ctx, calls } = stubCtx();
    expect(runStudioShortcut("pasteStyle", ctx)).toBe(true);
    expect(runStudioShortcut("paste_style", ctx)).toBe(true);
    expect(calls).toEqual(["pasteStyle", "pasteStyle"]);
  });

  it("reports unhandled work so the caller can skip preventDefault", () => {
    const { ctx } = stubCtx({ copy: () => false });
    // Nothing selected: ⌘C must fall through to the browser.
    expect(runStudioShortcut("copy", ctx)).toBe(false);
    expect(runStudioShortcut("delete", stubCtx().ctx)).toBe(true);
    const { ctx: empty } = stubCtx({ remove: () => false });
    expect(runStudioShortcut("delete", empty)).toBe(false);
    expect(runStudioShortcut("bogus", stubCtx().ctx)).toBe(false);
  });

  it("does not preventDefault for unhandled keys", () => {
    const { ctx } = stubCtx();
    const unhandled = { key: "q", preventDefault: vi.fn(), target: null };
    expect(handleStudioKeyDown(unhandled, "pc", ctx)).toBe(false);
    expect(unhandled.preventDefault).not.toHaveBeenCalled();

    const handled = {
      key: "z",
      metaKey: true,
      preventDefault: vi.fn(),
      target: null,
    };
    expect(handleStudioKeyDown(handled, "pc", ctx)).toBe(true);
    expect(handled.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("never hijacks typing, even for handled combos", () => {
    const { ctx } = stubCtx();
    const event = {
      key: "c",
      metaKey: true,
      preventDefault: vi.fn(),
      target: { tagName: "INPUT" },
    };
    expect(handleStudioKeyDown(event, "pc", ctx)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("studio clipboard store", () => {
  it("round-trips nodes through the versioned envelope", () => {
    const store = createStudioClipboardStore({ storage: memoryStorage() });
    const result = store.write({
      kind: "nodes",
      nodes: [{ id: "n1", el: "heading", settings: { text: "Hi" } }],
    });
    expect(result.ok).toBe(true);
    expect(result.ok && result.persisted).toBe(true);
    const back = store.read();
    expect(back?.kind).toBe("nodes");
    expect(back?.nodes[0]?.el).toBe("heading");
    expect(back?.v).toBeGreaterThan(0);
  });

  it("keeps style-keys-only paste via the style subset", () => {
    const store = createStudioClipboardStore({ storage: memoryStorage() });
    const write = store.write({
      kind: "style",
      nodes: [
        {
          id: "n1",
          el: "heading",
          settings: { text: "SOURCE", textColor: "red" },
        },
      ],
    });
    expect(write.ok).toBe(true);
    const back = store.read();
    expect(back?.kind).toBe("style");
    expect(back?.styles?.["textColor"]).toBe("red");
    expect(back?.styles?.["text"]).toBeUndefined();
  });

  it("rejects oversized selections", () => {
    const store = createStudioClipboardStore({ storage: memoryStorage() });
    const many: StudioNode[] = Array.from(
      { length: STUDIO_CLIPBOARD_LIMITS.maxNodes + 1 },
      (_, i) => ({ id: `n${i}`, el: "text", settings: {} }),
    );
    const result = store.write({ kind: "nodes", nodes: many });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_many_nodes");
    expect(store.read()).toBeNull();
  });

  it("rejects empty, foreign and malformed payloads", () => {
    expect(parseStudioClipboardPayload(null).ok).toBe(false);
    expect(parseStudioClipboardPayload("not json").ok).toBe(false);
    expect(
      parseStudioClipboardPayload(JSON.stringify({ v: 9999, nodes: [] })).ok,
    ).toBe(false);
    expect(
      parseStudioClipboardPayload(
        JSON.stringify({ v: 1, kind: "nodes", nodes: [{ nope: true }] }),
      ).ok,
    ).toBe(false);
  });
});

describe("studio multi-select", () => {
  it("replaces by default and toggles with the modifier", () => {
    expect(applySelection(["a"], "b", "replace")).toEqual(["b"]);
    expect(applySelection(["a"], "b", "toggle")).toEqual(["a", "b"]);
    expect(applySelection(["a", "b"], "a", "toggle")).toEqual(["b"]);
    expect(applySelection(["a"], null, "replace")).toEqual([]);
  });

  it("dedupes descendants to top-most ids for bulk ops", () => {
    const root = [node("a", [node("b"), node("c", [node("d")])]), node("e")];
    expect(topMostStudioIds(root, ["a", "b", "d", "e"])).toEqual(["a", "e"]);
    expect(topMostStudioIds(root, ["b", "d"])).toEqual(["b", "d"]);
    expect(topMostStudioIds(root, [])).toEqual([]);
  });

  it("nudges a node within its own siblings only", () => {
    const root = [node("a"), node("b"), node("c")];
    expect(nudgeStudioNodes(root, "b", -1).map((n) => n.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(nudgeStudioNodes(root, "b", 1).map((n) => n.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    // Clamped at the edges: same order back.
    expect(nudgeStudioNodes(root, "a", -1).map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(nudgeStudioNodes(root, "nope", 1)).toBe(root);
  });
});
