/**
 * Studio history branches — characterization contract.
 *
 * Pins the undo/redo semantics in `history.ts` that the History panel
 * (`historyList`, jump-to-restore) and `useStudio` (`commit`, undo/redo/jump)
 * rely on: the 60-entry cap, redo-branch truncation on new pushes after an
 * undo, exact jump-to-restore, and safe no-ops at the stack edges.
 */
import { describe, expect, it } from "vitest";
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  currentDoc,
  historyLabel,
  historyList,
  initHistory,
  jumpTo,
  pushHistory,
  redo,
  undo,
  type HistoryState,
} from "./history";
import { defaultPageSettings, STUDIO_VERSION, type StudioDoc } from "./model";

function doc(title: string): StudioDoc {
  return {
    version: STUDIO_VERSION,
    root: [],
    page: defaultPageSettings(title),
  };
}

function titles(state: HistoryState): string[] {
  return state.entries.map((entry) => entry.doc.page.title);
}

describe("studio history — stack shape", () => {
  it("starts with a single entry and the default limit", () => {
    const state = initHistory(doc("Home"));
    expect(HISTORY_LIMIT).toBe(60);
    expect(state.limit).toBe(HISTORY_LIMIT);
    expect(state.entries.length).toBe(1);
    expect(state.cursor).toBe(0);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
    expect(currentDoc(state).page.title).toBe("Home");
    expect(historyLabel(state.entries[0]!)).toBe("Editing started");
  });

  it("caps entries at the limit, dropping the oldest first", () => {
    let state = initHistory(doc("v0"));
    for (let i = 1; i <= HISTORY_LIMIT; i += 1) {
      state = pushHistory(state, doc(`v${i}`), "Page", "edited", i);
    }
    // start + 60 pushes = 61 entries, so the oldest ("start") is evicted.
    expect(state.entries.length).toBe(HISTORY_LIMIT);
    expect(state.cursor).toBe(HISTORY_LIMIT - 1);
    expect(titles(state)[0]).toBe("v1");
    expect(currentDoc(state).page.title).toBe(`v${HISTORY_LIMIT}`);
  });

  it("holds a custom limit steady under sustained pushes", () => {
    let state = initHistory(doc("v0"), 3);
    for (let i = 1; i <= 6; i += 1) {
      state = pushHistory(state, doc(`v${i}`), "Heading", "edited", i);
    }
    expect(state.entries.length).toBe(3);
    expect(titles(state)).toEqual(["v4", "v5", "v6"]);
    expect(state.cursor).toBe(2);
    expect(currentDoc(state).page.title).toBe("v6");
  });
});

describe("studio history — undo/redo branches", () => {
  it("truncates the redo branch on a new push after undo", () => {
    let state = initHistory(doc("v0"), 10);
    state = pushHistory(state, doc("v1"), "Heading", "added", 1);
    state = pushHistory(state, doc("v2"), "Heading", "edited", 2);
    state = undo(state);
    expect(canRedo(state)).toBe(true);
    expect(currentDoc(state).page.title).toBe("v1");
    state = pushHistory(state, doc("v3"), "Heading", "styled", 3);
    expect(titles(state)).toEqual(["v0", "v1", "v3"]);
    expect(canRedo(state)).toBe(false);
    expect(state.cursor).toBe(2);
    expect(currentDoc(state).page.title).toBe("v3");
  });

  it("jump-to-restore lands the exact entry state", () => {
    const v0 = doc("v0");
    const v1 = doc("v1");
    const v2 = doc("v2");
    let state = initHistory(v0, 10);
    state = pushHistory(state, v1, "Heading", "added", 1);
    state = pushHistory(state, v2, "Heading", "edited", 2);
    const atV1 = jumpTo(state, 1);
    expect(atV1.cursor).toBe(1);
    expect(currentDoc(atV1)).toBe(v1);
    expect(currentDoc(jumpTo(state, 0))).toBe(v0);
    expect(currentDoc(jumpTo(atV1, 2))).toBe(v2);
    // Out-of-range jumps are safe no-ops returning the same state.
    expect(jumpTo(state, -1)).toBe(state);
    expect(jumpTo(state, state.entries.length)).toBe(state);
  });

  it("undo and redo at the stack edges are safe no-ops", () => {
    const state = initHistory(doc("v0"), 10);
    expect(undo(state)).toBe(state);
    expect(redo(state)).toBe(state);
    expect(state.cursor).toBe(0);
    expect(currentDoc(undo(state)).page.title).toBe("v0");
  });

  it("undo/redo walk the cursor without rewriting entries", () => {
    let state = initHistory(doc("v0"), 10);
    state = pushHistory(state, doc("v1"), "Heading", "added", 1);
    state = pushHistory(state, doc("v2"), "Heading", "edited", 2);
    const entries = state.entries;
    const back = undo(state);
    expect(back.cursor).toBe(1);
    expect(back.entries).toBe(entries);
    expect(currentDoc(back).page.title).toBe("v1");
    expect(canUndo(back)).toBe(true);
    expect(canRedo(back)).toBe(true);
    const start = undo(back);
    expect(start.cursor).toBe(0);
    expect(undo(start)).toBe(start);
    expect(redo(start).cursor).toBe(1);
    expect(redo(state)).toBe(state);
  });

  it("lists newest-first with the current flag for the panel", () => {
    let state = initHistory(doc("v0"), 10);
    state = pushHistory(state, doc("v1"), "Heading", "added", 1);
    state = pushHistory(state, doc("v2"), "Heading", "edited", 2);
    const list = historyList(state);
    expect(list.map((item) => item.index)).toEqual([2, 1, 0]);
    expect(list.map((item) => item.current)).toEqual([true, false, false]);
    expect(historyLabel(list[0]!.entry)).toBe("Heading edited");
    const jumped = historyList(jumpTo(state, 0));
    expect(jumped.map((item) => item.current)).toEqual([false, false, true]);
  });
});
