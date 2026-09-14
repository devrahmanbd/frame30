import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EMPTY_AST,
  TEMPLATE_KEYS,
  astDigest,
  lintTemplate,
  newSection,
  type Breakpoint,
  type PropValue,
  type Section,
  type SectionType,
  type Slot,
  type TemplateKey,
  type ThemeAst,
  type ThemeTemplates,
  type ThemeTokens,
} from "@/lib/builder-ast";
import type { VisibilityRule } from "@/lib/visibility";
import {
  canDrop,
  cloneNodes,
  insertNodes,
  locate,
  mapTree,
  moveRelative,
  nudge,
  removeNodes,
  topMost,
  type DropPosition,
} from "@/lib/builder-tree";

export type EditorDoc = { templates: ThemeTemplates; tokens: ThemeTokens };

const HISTORY_LIMIT = 50;

function cloneAst(ast: ThemeAst): ThemeAst {
  return { header: [...ast.header], main: [...ast.main], footer: [...ast.footer] };
}

/**
 * Editor state machine: undo/redo history, dirty tracking and a debounced
 * autosave that carries a monotonic revision so a slow request can never
 * overwrite newer work.
 *
 * Phase 0.5: every structural action is tree-aware — it addresses nodes by id
 * anywhere in the slot tree rather than by top-level index.
 */
export function useBuilderEditor(
  initial: EditorDoc | null,
  opts: {
    revision: number;
    onAutosave: (doc: EditorDoc, revision: number) => Promise<unknown>;
    debounceMs?: number;
  },
) {
  const [doc, setDoc] = useState<EditorDoc | null>(initial);
  const [past, setPast] = useState<EditorDoc[]>([]);
  const [future, setFuture] = useState<EditorDoc[]>([]);
  const [savedDigest, setSavedDigest] = useState<string | null>(
    initial ? astDigest(initial.templates, initial.tokens) : null,
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(opts.revision);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt the server snapshot once it arrives (or when the theme changes).
  useEffect(() => {
    if (!initial) return;
    setDoc((current) => current ?? initial);
    setSavedDigest((current) => current ?? astDigest(initial.templates, initial.tokens));
    revision.current = Math.max(revision.current, opts.revision);
  }, [initial, opts.revision]);

  const digest = doc ? astDigest(doc.templates, doc.tokens) : null;
  const dirty = !!digest && digest !== savedDigest;

  const commit = useCallback((next: (current: EditorDoc) => EditorDoc) => {
    setDoc((current) => {
      if (!current) return current;
      const updated = next(current);
      setPast((stack) => [...stack.slice(-HISTORY_LIMIT), current]);
      setFuture([]);
      return updated;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((stack) => {
      if (!stack.length) return stack;
      const previous = stack[stack.length - 1]!;
      setDoc((current) => {
        if (current) setFuture((f) => [current, ...f].slice(0, HISTORY_LIMIT));
        return previous;
      });
      return stack.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((stack) => {
      if (!stack.length) return stack;
      const next = stack[0]!;
      setDoc((current) => {
        if (current) setPast((p) => [...p, current].slice(-HISTORY_LIMIT));
        return next;
      });
      return stack.slice(1);
    });
  }, []);

  const flush = useCallback(async () => {
    if (!doc) return;
    const current = astDigest(doc.templates, doc.tokens);
    if (current === savedDigest) return;
    setSaving(true);
    setError(null);
    revision.current += 1;
    try {
      await opts.onAutosave(doc, revision.current);
      setSavedDigest(current);
      setSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "autosave_failed");
    } finally {
      setSaving(false);
    }
  }, [doc, savedDigest, opts]);

  // Autosave every few seconds of quiet: an editor crash never loses work.
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), opts.debounceMs ?? 3000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [dirty, flush, opts.debounceMs]);

  // Warn before losing unsaved work on navigation.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const actions = useMemo(() => {
    const editSlot = (
      template: TemplateKey,
      slot: Slot,
      fn: (sections: Section[]) => Section[],
    ) =>
      commit((current) => {
        const ast = cloneAst(current.templates[template] ?? EMPTY_AST);
        ast[slot] = fn(ast[slot]);
        return { ...current, templates: { ...current.templates, [template]: ast } };
      });

    /** Patch one node anywhere in the tree. */
    const editNode = (
      template: TemplateKey,
      slot: Slot,
      id: string,
      fn: (section: Section) => Section,
    ) => editSlot(template, slot, (sections) => mapTree(sections, (s) => (s.id === id ? fn(s) : s)));

    return {
      /**
       * Add a widget. `target` places it inside a container or after a node;
       * without one it lands at the end of the slot.
       */
      add(
        template: TemplateKey,
        slot: Slot,
        type: SectionType,
        target?: { parentId?: string | null; index?: number },
      ) {
        const section = newSection(type);
        editSlot(template, slot, (sections) => {
          const parentId = target?.parentId ?? null;
          if (!canDrop(sections, [section], parentId).ok) return sections;
          const fallback =
            parentId === null
              ? sections.length
              : (locate(sections, parentId)?.node.children?.length ?? 0);
          return insertNodes(sections, parentId, target?.index ?? fallback, [section]);
        });
        return section.id;
      },
      /** Insert already-built nodes (saved blocks, clipboard) with fresh ids. */
      insert(
        template: TemplateKey,
        slot: Slot,
        nodes: Section[],
        target?: { parentId?: string | null; index?: number },
      ) {
        const copies = cloneNodes(nodes);
        editSlot(template, slot, (sections) => {
          const parentId = target?.parentId ?? null;
          if (!canDrop(sections, copies, parentId).ok) return sections;
          const fallback =
            parentId === null
              ? sections.length
              : (locate(sections, parentId)?.node.children?.length ?? 0);
          return insertNodes(sections, parentId, target?.index ?? fallback, copies);
        });
        return copies.map((node) => node.id);
      },
      remove(template: TemplateKey, slot: Slot, id: string) {
        editSlot(template, slot, (sections) => removeNodes(sections, [id]).tree);
      },
      removeMany(template: TemplateKey, slot: Slot, ids: readonly string[]) {
        editSlot(template, slot, (sections) => removeNodes(sections, topMost(sections, ids)).tree);
      },
      /** Reorder within the current parent — the keyboard and arrow-button path. */
      nudge(template: TemplateKey, slot: Slot, id: string, delta: -1 | 1) {
        editSlot(template, slot, (sections) => nudge(sections, id, delta));
      },
      /** Drag-and-drop: place `dragId` before/after/inside `targetId`. */
      moveNode(
        template: TemplateKey,
        slot: Slot,
        dragId: string,
        targetId: string | null,
        position: DropPosition,
      ) {
        editSlot(template, slot, (sections) => moveRelative(sections, dragId, targetId, position));
      },
      duplicate(template: TemplateKey, slot: Slot, id: string) {
        editSlot(template, slot, (sections) => {
          const found = locate(sections, id);
          if (!found) return sections;
          const [copy] = cloneNodes([found.node]);
          if (!copy || !canDrop(sections, [copy], found.parentId).ok) return sections;
          return insertNodes(sections, found.parentId, found.index + 1, [copy]);
        });
      },
      duplicateMany(template: TemplateKey, slot: Slot, ids: readonly string[]) {
        for (const id of ids) this.duplicate(template, slot, id);
      },
      setProp(template: TemplateKey, slot: Slot, id: string, key: string, value: PropValue) {
        editNode(template, slot, id, (s) => ({ ...s, props: { ...s.props, [key]: value } }));
      },
      /**
       * Write a value at the active breakpoint. `desktop` is the base layer, so
       * editing there updates props directly; narrower devices write an
       * override layer that inherits every key it does not declare.
       */
      setPropAt(
        template: TemplateKey,
        slot: Slot,
        id: string,
        key: string,
        value: PropValue,
        device: Breakpoint,
      ) {
        editNode(template, slot, id, (s) => {
          if (device === "desktop") return { ...s, props: { ...s.props, [key]: value } };
          const layer = { ...(s.bp?.[device] ?? {}), [key]: value };
          return { ...s, bp: { ...(s.bp ?? {}), [device]: layer } };
        });
      },
      /** Phase 3.2: conditional visibility rules for one node. */
      setWhen(template: TemplateKey, slot: Slot, id: string, rules: VisibilityRule[]) {
        editNode(template, slot, id, (s) => {
          const next: Section = { ...s };
          if (rules.length) next.when = rules;
          else delete next.when;
          return next;
        });
      },
      /** Phase 3.2: bind (or unbind) a node to an experiment variant. */
      setAb(template: TemplateKey, slot: Slot, id: string, ab: Section["ab"]) {
        editNode(template, slot, id, (s) => {
          const next: Section = { ...s };
          if (ab?.experiment && ab.variant) next.ab = ab;
          else delete next.ab;
          return next;
        });
      },
      /** Drop a breakpoint override so the field inherits the base value again. */
      clearOverride(template: TemplateKey, slot: Slot, id: string, key: string, device: Breakpoint) {
        editNode(template, slot, id, (s) => {
          if (device === "desktop" || !s.bp?.[device]) return s;
          const layer = { ...s.bp[device] };
          delete layer[key];
          const bp = { ...s.bp };
          if (Object.keys(layer).length) bp[device] = layer;
          else delete bp[device];
          const next: Section = { ...s };
          if (Object.keys(bp).length) next.bp = bp;
          else delete next.bp;
          return next;
        });
      },
      toggleHidden(template: TemplateKey, slot: Slot, id: string, breakpoint: Breakpoint) {
        editNode(template, slot, id, (s) => {
          const hidden = new Set(s.hidden ?? []);
          if (hidden.has(breakpoint)) hidden.delete(breakpoint);
          else hidden.add(breakpoint);
          const next: Section = { ...s };
          if (hidden.size) next.hidden = [...hidden];
          else delete next.hidden;
          return next;
        });
      },
      setTokens(patch: Partial<ThemeTokens>) {
        commit((current) => ({ ...current, tokens: { ...current.tokens, ...patch } }));
      },
      /**
       * Phase 1.2: arbitrary single-node transform in one history step. Used by
       * paste-style, rename and the global-block link/unlink actions so those
       * never land as two separate undo entries.
       */
      updateNode(
        template: TemplateKey,
        slot: Slot,
        id: string,
        fn: (section: Section) => Section,
      ) {
        editNode(template, slot, id, fn);
      },
      /**
       * Phase 1.5: insert an already-shaped node (e.g. a global-block
       * placement) verbatim, keeping its reserved props, at the given target.
       */
      insertRaw(
        template: TemplateKey,
        slot: Slot,
        node: Section,
        target?: { parentId?: string | null; index?: number },
      ) {
        editSlot(template, slot, (sections) => {
          const parentId = target?.parentId ?? null;
          if (!canDrop(sections, [node], parentId).ok) return sections;
          const fallback =
            parentId === null
              ? sections.length
              : (locate(sections, parentId)?.node.children?.length ?? 0);
          return insertNodes(sections, parentId, target?.index ?? fallback, [node]);
        });
        return node.id;
      },
      /**
       * Phase 1.5: replace a linked placement with plain copies of the block's
       * nodes, in place, atomically.
       */
      detachPlacement(template: TemplateKey, slot: Slot, id: string, nodes: Section[]) {
        editSlot(template, slot, (sections) => {
          const found = locate(sections, id);
          if (!found) return sections;
          const copies = cloneNodes(nodes);
          const stripped = removeNodes(sections, [id]).tree;
          if (!copies.length) return stripped;
          if (!canDrop(stripped, copies, found.parentId).ok) return sections;
          return insertNodes(stripped, found.parentId, found.index, copies);
        });
      },
      replaceDoc(next: EditorDoc) {
        commit(() => next);
      },
    };
  }, [commit]);

  const issues = useMemo(() => {
    if (!doc) return {} as Record<TemplateKey, ReturnType<typeof lintTemplate>>;
    const out = {} as Record<TemplateKey, ReturnType<typeof lintTemplate>>;
    for (const key of TEMPLATE_KEYS) out[key] = lintTemplate(doc.templates[key] ?? EMPTY_AST);
    return out;
  }, [doc]);

  return {
    doc,
    setDoc,
    dirty,
    saving,
    savedAt,
    error,
    issues,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    historyDepth: HISTORY_LIMIT,
    undo,
    redo,
    flush,
    markSaved: () => {
      if (doc) setSavedDigest(astDigest(doc.templates, doc.tokens));
    },
    ...actions,
  };
}
