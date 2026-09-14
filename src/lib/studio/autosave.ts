/**
 * Phase 14 — autosave + crash recovery.
 *
 * The builder keeps its document in memory; a dropped connection, a crashed
 * tab or an accidental close used to lose everything since the last explicit
 * save. This module is the local half of the fix: every edit is mirrored into
 * `localStorage` under a per-document key, and on the next open the shell
 * compares that draft with the document the server handed back.
 *
 * Pure and storage-injectable so the whole policy is unit-testable:
 * nothing here touches React, and every function tolerates a missing or
 * corrupt store rather than throwing into the editor.
 */
import type { StudioDoc } from "./model";

export const AUTOSAVE_PREFIX = "fq.studio.draft.";

/** Drafts older than this are ignored — a week-old crash is not a recovery. */
export const AUTOSAVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Debounce for the mirror write. Long enough to not fight typing. */
export const AUTOSAVE_DEBOUNCE_MS = 1200;

export type StudioDraft = {
  key: string;
  at: number;
  doc: StudioDoc;
};

export function draftKey(id: string): string {
  return `${AUTOSAVE_PREFIX}${id}`;
}

function store(storage?: Storage): Storage | undefined {
  return storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
}

/** Stable structural signature — cheap enough to run on every keystroke. */
export function docSignature(doc: StudioDoc): string {
  return JSON.stringify({ root: doc.root, page: doc.page, classes: doc.classes ?? [] });
}

export function writeDraft(id: string, doc: StudioDoc, now = Date.now(), storage?: Storage): void {
  const s = store(storage);
  if (!s) return;
  try {
    s.setItem(draftKey(id), JSON.stringify({ key: id, at: now, doc } satisfies StudioDraft));
  } catch {
    /* quota or private mode — autosave is best effort, never a blocker */
  }
}

export function clearDraft(id: string, storage?: Storage): void {
  const s = store(storage);
  if (!s) return;
  try {
    s.removeItem(draftKey(id));
  } catch {
    /* ignore */
  }
}

export function readDraft(id: string, now = Date.now(), storage?: Storage): StudioDraft | null {
  const s = store(storage);
  if (!s) return null;
  let parsed: unknown;
  try {
    const raw = s.getItem(draftKey(id));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const draft = parsed as Partial<StudioDraft> | null;
  if (!draft || typeof draft.at !== "number" || !draft.doc || !Array.isArray(draft.doc.root)) {
    clearDraft(id, storage);
    return null;
  }
  if (now - draft.at > AUTOSAVE_TTL_MS) {
    clearDraft(id, storage);
    return null;
  }
  return { key: id, at: draft.at, doc: draft.doc };
}

/**
 * A draft is only offered when it differs from what the server loaded —
 * otherwise the editor would nag about a recovery that changes nothing.
 */
export function recoverableDraft(
  id: string,
  serverDoc: StudioDoc,
  now = Date.now(),
  storage?: Storage,
): StudioDraft | null {
  const draft = readDraft(id, now, storage);
  if (!draft) return null;
  if (docSignature(draft.doc) === docSignature(serverDoc)) {
    clearDraft(id, storage);
    return null;
  }
  return draft;
}

export function draftAgeLabel(at: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return "moments ago";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
