/**
 * Phase 12 — editor document state.
 *
 * Owns the `EditorDoc` in memory, its undo/redo history, dirty tracking,
 * the 10 s autosave loop and the save / publish verbs. UI components read
 * from here and never talk to the server directly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { SaveState } from "@/components/console/kit";
import { editorLoadFn, editorRevisionFn, editorSaveFn, editorSetKindFn, editorTrashFn } from "@/lib/editor/editor.functions";
import { docSignature, emptyEditorDoc, type ContentKind, type EditorDoc } from "@/lib/editor/editor-doc";
import { canRedo, canUndo, createHistory, pushHistory, redo, replacePresent, undo, type History } from "@/lib/editor/editor-history";

export const AUTOSAVE_MS = 10_000;

export type SaveMode = "autosave" | "save" | "publish";

export type EditorError = { code: string; en: string; bn: string; field: string };

export function parseEditorError(err: unknown): EditorError {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const parts = raw.split("|");
  if (parts.length === 4) return { code: parts[0]!, field: parts[1]!, en: parts[2]!, bn: parts[3]! };
  return { code: "unknown", field: "", en: raw || "Something went wrong.", bn: raw || "কিছু ভুল হয়েছে।" };
}

export function useEditorDoc(kind: ContentKind, id: string | null, onCreated: (id: string) => void) {
  const qc = useQueryClient();
  const load = useServerFn(editorLoadFn);
  const save = useServerFn(editorSaveFn);
  const readRevision = useServerFn(editorRevisionFn);
  const trash = useServerFn(editorTrashFn);
  const setKind = useServerFn(editorSetKindFn);

  const query = useQuery({
    queryKey: ["editor", kind, id ?? "new"],
    queryFn: () => load({ data: { kind, id } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const [history, setHistory] = useState<History<EditorDoc>>(() => createHistory(emptyEditorDoc(kind)));
  const [baseline, setBaseline] = useState<string>(() => docSignature(emptyEditorDoc(kind)));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<EditorError | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [seoScore, setSeoScore] = useState<number | null>(null);
  const loadedFor = useRef<string | null>(null);

  // Adopt the server document once per (kind,id).
  useEffect(() => {
    if (!query.data) return;
    const key = `${kind}:${id ?? "new"}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    const doc = query.data.doc;
    setHistory(createHistory(doc));
    setBaseline(docSignature(doc));
    setLastSavedAt(doc.updatedAt);
    setSaveState("idle");
    setError(null);
  }, [query.data, kind, id]);

  const doc = history.present.value;
  const dirty = useMemo(() => docSignature(doc) !== baseline, [doc, baseline]);

  useEffect(() => {
    setSaveState((s) => (s === "saving" ? s : dirty ? "dirty" : s === "dirty" ? "idle" : s));
  }, [dirty]);

  /** Field-level update; `field` drives undo coalescing. */
  const update = useCallback((patch: Partial<EditorDoc> | ((d: EditorDoc) => Partial<EditorDoc>), field = "misc") => {
    setHistory((h) => {
      const next = { ...h.present.value, ...(typeof patch === "function" ? patch(h.present.value) : patch) };
      return pushHistory(h, next, field);
    });
    setError(null);
  }, []);

  const doUndo = useCallback(() => setHistory((h) => undo(h)), []);
  const doRedo = useCallback(() => setHistory((h) => redo(h)), []);

  const inflight = useRef(false);
  const docRef = useRef(doc);
  docRef.current = doc;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const commit = useCallback(
    async (mode: SaveMode): Promise<boolean> => {
      if (inflight.current) return false;
      const snapshot = docRef.current;
      if (mode === "autosave" && (!dirtyRef.current || (!snapshot.title.trim() && !snapshot.body.trim()))) return false;
      inflight.current = true;
      setSaveState("saving");
      try {
        const result = await save({ data: { doc: snapshot, mode } });
        const merged: EditorDoc = {
          ...docRef.current,
          id: result.id,
          slug: mode === "autosave" ? docRef.current.slug : result.slug,
          status: mode === "autosave" ? docRef.current.status : result.status,
          publishedAt: result.publishedAt,
          updatedAt: result.updatedAt,
        };
        // Autosave only checkpoints content: baseline is the snapshot we sent,
        // so keystrokes typed during the request still count as dirty.
        setHistory((h) => replacePresent(h, { ...h.present.value, id: result.id, publishedAt: result.publishedAt, updatedAt: result.updatedAt, ...(mode !== "autosave" ? { slug: result.slug, status: result.status } : {}) }));
        setBaseline(docSignature(mode === "autosave" ? { ...snapshot, id: result.id } : merged));
        setLastSavedAt(result.updatedAt);
        setSeoScore(result.seoScore);
        setSaveState("saved");
        setError(null);
        if (!snapshot.id) onCreated(result.id);
        if (mode !== "autosave") {
          qc.invalidateQueries({ queryKey: ["content-desk", kind] });
          qc.invalidateQueries({ queryKey: ["editor", kind, result.id] });
        }
        return true;
      } catch (err) {
        const parsed = parseEditorError(err);
        if (parsed.code !== "empty") {
          setError(parsed);
          setSaveState("error");
        } else {
          setSaveState("dirty");
        }
        return false;
      } finally {
        inflight.current = false;
      }
    },
    [save, onCreated, qc, kind],
  );

  // Autosave loop.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (dirtyRef.current && !inflight.current) void commit("autosave");
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [commit]);

  // Leave guard.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const restoreRevision = useCallback(
    async (revisionId: string) => {
      const rev = await readRevision({ data: { kind, revisionId } });
      update(
        {
          title: rev.title,
          titleEn: rev.titleEn,
          excerpt: rev.excerpt,
          body: rev.body,
          seo: { ...docRef.current.seo, metaTitle: rev.metaTitle, metaDescription: rev.metaDescription },
        },
        `revision:${revisionId}`,
      );
    },
    [readRevision, kind, update],
  );

  const moveToTrash = useCallback(async () => {
    if (!docRef.current.id) return true;
    await trash({ data: { kind, id: docRef.current.id } });
    qc.invalidateQueries({ queryKey: ["content-desk", kind] });
    setBaseline(docSignature(docRef.current));
    return true;
  }, [trash, kind, qc]);

  const chooseEditor = useCallback(
    async (editor: "classic" | "builder") => {
      update({ editor }, "editor");
      if (docRef.current.id) await setKind({ data: { kind, id: docRef.current.id, editor } });
    },
    [update, setKind, kind],
  );

  return {
    query,
    context: query.data ?? null,
    doc,
    update,
    dirty,
    saveState,
    error,
    clearError: () => setError(null),
    lastSavedAt,
    seoScore,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    undo: doUndo,
    redo: doRedo,
    commit,
    restoreRevision,
    moveToTrash,
    chooseEditor,
  };
}

export type EditorState = ReturnType<typeof useEditorDoc>;
