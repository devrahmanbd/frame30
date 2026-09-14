/**
 * Phase 1 contract — authoring UX parity.
 *
 * These tests guard the invariants that are easy to break silently: the studio
 * advertising a shortcut it does not dispatch, the clipboard accepting hostile
 * or oversized payloads, and global-block resolution corrupting the stored AST.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SHORTCUTS,
  detectPlatform,
  formatShortcut,
  isTypingTarget,
  matchShortcut,
  shortcutsByGroup,
} from "@/lib/builder-shortcuts";
import {
  CLIPBOARD_LIMITS,
  applyStylePatch,
  createClipboardStore,
  parseClipboard,
  styleSubsetOf,
} from "@/lib/builder-clipboard";
import {
  asPlacement,
  detachPlacement,
  isGraftedId,
  linkedBlockId,
  placementCounts,
  placementOwnerOf,
  resolveGlobalBlocks,
} from "@/lib/global-blocks";
import { newSection } from "@/lib/builder-ast";

const STUDIO = readFileSync(
  join(process.cwd(), "src/routes/_authenticated/admin/builder.tsx"),
  "utf8",
);

/** Minimal in-memory Storage double: the studio must survive a hostile one. */
function memoryStorage(fail = false) {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key: string) => void map.delete(key),
  };
}

describe("Phase 1.4 — shortcut registry", () => {
  it("dispatches every advertised shortcut", () => {
    // The overlay renders from SHORTCUTS, so an id with no case in the studio's
    // dispatch table would advertise a key that silently does nothing.
    const missing = SHORTCUTS.filter((spec) => !STUDIO.includes(`case "${spec.id}"`));
    expect(missing.map((spec) => spec.id)).toEqual([]);
  });

  it("has unique ids and no duplicate combos on a platform", () => {
    const ids = SHORTCUTS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const platform of ["mac", "other"] as const) {
      const rendered = SHORTCUTS.map((spec) => formatShortcut(spec, platform));
      expect(new Set(rendered).size, platform).toBe(rendered.length);
    }
  });

  it("groups every shortcut exactly once", () => {
    const grouped = shortcutsByGroup().flatMap((entry) => entry.items);
    expect(grouped).toHaveLength(SHORTCUTS.length);
  });

  it("renders platform-correct modifiers", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("mac");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0)")).toBe("other");
    const copy = SHORTCUTS.find((spec) => spec.id === "copy")!;
    expect(formatShortcut(copy, "mac")).toContain("⌘");
    expect(formatShortcut(copy, "other")).toContain("Ctrl");
  });

  it("matches the mod key of the host platform only", () => {
    expect(matchShortcut({ key: "z", metaKey: true })).toBe("undo");
    expect(matchShortcut({ key: "z", ctrlKey: true })).toBe("undo");
    expect(matchShortcut({ key: "z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(matchShortcut({ key: "z" })).toBeNull();
  });

  it("never hijacks typing", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
  });
});

describe("Phase 1.3 — clipboard", () => {
  it("round-trips a copy through storage", () => {
    const store = createClipboardStore({ storage: memoryStorage() });
    const node = newSection("hero");
    const result = store.write({ kind: "nodes", from: { template: "index", slot: "main" }, nodes: [node] });
    expect(result.ok && result.persisted).toBe(true);
    expect(store.read()?.nodes[0]?.type).toBe("hero");
  });

  it("stays usable in this tab when storage is blocked", () => {
    const store = createClipboardStore({ storage: memoryStorage(true) });
    const result = store.write({ kind: "nodes", from: { template: "index", slot: "main" }, nodes: [newSection("hero")] });
    expect(result.ok).toBe(true);
    expect(result.ok && result.persisted).toBe(false);
    expect(store.read()?.nodes).toHaveLength(1);
  });

  it("refuses an empty or oversized selection", () => {
    const store = createClipboardStore({ storage: memoryStorage() });
    expect(store.write({ kind: "nodes", from: { template: "index", slot: "main" }, nodes: [] })).toMatchObject({
      ok: false,
      reason: "empty",
    });
    const many = Array.from({ length: CLIPBOARD_LIMITS.maxNodes + 1 }, () => newSection("hero"));
    expect(store.write({ kind: "nodes", from: { template: "index", slot: "main" }, nodes: many })).toMatchObject({
      ok: false,
    });
  });

  it("rejects foreign, malformed and stale payloads", () => {
    expect(parseClipboard(null).ok).toBe(false);
    expect(parseClipboard("not json").ok).toBe(false);
    expect(parseClipboard(JSON.stringify({ version: 0, nodes: [] })).ok).toBe(false);
  });

  it("paste-style moves style keys only, never content", () => {
    const source = newSection("hero");
    const target = newSection("hero");
    const styled = { ...source, props: { ...source.props, padding: "xl", headline: "SOURCE COPY" } };
    const patched = applyStylePatch({ ...target, props: { ...target.props, headline: "TARGET COPY" } }, styleSubsetOf(styled));
    expect(patched.props["headline"]).toBe("TARGET COPY");
    expect(patched.id).toBe(target.id);
  });
});

describe("Phase 1.5 — global blocks", () => {
  const block = {
    id: "blk_1",
    name: "Promo bar",
    revision: 3,
    updatedAt: "2026-01-01T00:00:00.000Z",
    nodes: [newSection("rich_text"), newSection("hero")],
  };

  it("marks and reads a placement link", () => {
    const placement = asPlacement(newSection("container"), block);
    expect(linkedBlockId(placement)).toBe("blk_1");
    expect(placement.children ?? []).toHaveLength(0);
  });

  it("grafts content for the canvas without mutating the stored tree", () => {
    const placement = asPlacement(newSection("container"), block);
    const stored = [placement];
    const { sections, report } = resolveGlobalBlocks(stored, [block]);
    expect(stored[0]!.children ?? []).toHaveLength(0);
    expect(sections[0]!.children ?? []).toHaveLength(2);
    expect(Object.keys(report.resolved)).toHaveLength(1);
    expect(report.missing).toHaveLength(0);
  });

  it("gives grafted nodes traceable, deterministic ids", () => {
    const placement = asPlacement(newSection("container"), block);
    const first = resolveGlobalBlocks([placement], [block]).sections[0]!.children![0]!.id;
    const second = resolveGlobalBlocks([placement], [block]).sections[0]!.children![0]!.id;
    expect(first).toBe(second);
    expect(isGraftedId(first)).toBe(true);
    expect(placementOwnerOf(first)).toBe(placement.id);
    expect(isGraftedId(placement.id)).toBe(false);
  });

  it("reports a placement whose block is gone instead of dropping it", () => {
    const placement = asPlacement(newSection("container"), block);
    const { sections, report } = resolveGlobalBlocks([placement], []);
    expect(sections).toHaveLength(1);
    expect(report.missing).toEqual([placement.id]);
  });

  it("detach leaves real, independently editable nodes", () => {
    const detached = detachPlacement(asPlacement(newSection("container"), block), block.nodes);
    expect(linkedBlockId(detached)).toBeNull();
    expect(detached.children ?? []).toHaveLength(2);
    expect((detached.children ?? []).every((child) => !isGraftedId(child.id))).toBe(true);
  });

  it("counts usage across every template and slot", () => {
    const placement = asPlacement(newSection("container"), block);
    const other = asPlacement(newSection("container"), block);
    expect(placementCounts([[placement], [newSection("hero"), other]])["blk_1"]).toBe(2);
  });
});
