/**
 * Phase 12 — undo / redo history for the editor document.
 *
 * A bounded stack with *coalescing*: consecutive edits to the same field
 * within a short window collapse into one undo step, so ⌘Z undoes a typed
 * word rather than a single character. Pure and framework-free.
 */

export type HistoryEntry<T> = { value: T; field: string; at: number };

export type History<T> = {
  past: HistoryEntry<T>[];
  present: HistoryEntry<T>;
  future: HistoryEntry<T>[];
};

export const HISTORY_LIMIT = 100;
export const COALESCE_WINDOW_MS = 800;

export function createHistory<T>(value: T, at = Date.now()): History<T> {
  return { past: [], present: { value, field: "init", at }, future: [] };
}

/** Record a new value. Same-field edits inside the window replace `present`. */
export function pushHistory<T>(
  history: History<T>,
  value: T,
  field: string,
  at = Date.now(),
): History<T> {
  const { present } = history;
  const coalesce =
    present.field === field &&
    field !== "init" &&
    at - present.at < COALESCE_WINDOW_MS &&
    history.future.length === 0;
  if (coalesce) {
    return { past: history.past, present: { value, field, at }, future: [] };
  }
  const past = [...history.past, present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: { value, field, at }, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/** Replace the present without creating an undo step (server-side normalisation). */
export function replacePresent<T>(history: History<T>, value: T): History<T> {
  return { ...history, present: { ...history.present, value } };
}
