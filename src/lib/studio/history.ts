/**
 * Phase 14 — history.
 *
 * Two lists, exactly like Elementor's History panel: **Actions** (every edit,
 * with element + verb, jump-to-restore) and **Revisions** (saved snapshots
 * with author and time).
 */
import type { StudioDoc } from "./model";

export type HistoryVerb =
  | "added"
  | "edited"
  | "styled"
  | "moved"
  | "duplicated"
  | "removed"
  | "pasted"
  | "imported"
  | "reset";

export type HistoryEntry = {
  id: string;
  /** Human label of the element, e.g. "Heading". */
  element: string;
  verb: HistoryVerb;
  at: number;
  doc: StudioDoc;
};

export type HistoryState = {
  entries: HistoryEntry[];
  /** Index of the entry the canvas currently shows. */
  cursor: number;
  limit: number;
};

export const HISTORY_LIMIT = 60;

export function initHistory(doc: StudioDoc, limit = HISTORY_LIMIT): HistoryState {
  return {
    entries: [{ id: "start", element: "Page", verb: "added", at: Date.now(), doc }],
    cursor: 0,
    limit,
  };
}

export function historyLabel(entry: HistoryEntry): string {
  const verb = entry.verb === "added" && entry.id === "start" ? "Editing started" : `${entry.element} ${entry.verb}`;
  return verb.charAt(0).toUpperCase() + verb.slice(1);
}

export function pushHistory(
  state: HistoryState,
  doc: StudioDoc,
  element: string,
  verb: HistoryVerb,
  now = Date.now(),
): HistoryState {
  const kept = state.entries.slice(0, state.cursor + 1);
  kept.push({ id: `${now}-${kept.length}`, element, verb, at: now, doc });
  const overflow = Math.max(0, kept.length - state.limit);
  const entries = overflow > 0 ? kept.slice(overflow) : kept;
  return { ...state, entries, cursor: entries.length - 1 };
}

export function canUndo(state: HistoryState): boolean {
  return state.cursor > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.cursor < state.entries.length - 1;
}

export function undo(state: HistoryState): HistoryState {
  return canUndo(state) ? { ...state, cursor: state.cursor - 1 } : state;
}

export function redo(state: HistoryState): HistoryState {
  return canRedo(state) ? { ...state, cursor: state.cursor + 1 } : state;
}

export function jumpTo(state: HistoryState, index: number): HistoryState {
  if (index < 0 || index >= state.entries.length) return state;
  return { ...state, cursor: index };
}

export function currentDoc(state: HistoryState): StudioDoc {
  return state.entries[state.cursor]!.doc;
}

/** Newest first, which is the order the panel renders. */
export function historyList(state: HistoryState): { entry: HistoryEntry; index: number; current: boolean }[] {
  return state.entries
    .map((entry, index) => ({ entry, index, current: index === state.cursor }))
    .reverse();
}

export type RevisionEntry = {
  id: string;
  author: string;
  at: number;
  kind: "autosave" | "revision" | "published";
};

export function revisionLabel(revision: RevisionEntry, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - revision.at) / 60000));
  const when =
    minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
  const kind =
    revision.kind === "autosave" ? "Autosave" : revision.kind === "published" ? "Published" : "Revision";
  return `${kind} · ${revision.author} · ${when}`;
}
