/**
 * Phase 14 — editor state.
 *
 * One hook owns the document, history, selection, clipboard and device so the
 * shell stays presentational. Every mutation goes through `commit`, which is
 * what feeds the History panel and the dirty flag.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  currentDoc,
  initHistory,
  jumpTo,
  pushHistory,
  redo as redoHistory,
  undo as undoHistory,
  canRedo,
  canUndo,
  type HistoryVerb,
} from "./history";
import {
  isContainerNode,
  newContainer,
  type PageSettings,
  type SettingValue,
  type StudioClass,
  type StudioDoc,
  type StudioNode,
  uid,
} from "./model";
import { newWidgetNode, widgetLabel } from "./catalog";
import {
  cloneNode,
  dropInto,
  findNode,
  moveNode,
  parentOf,
  removeNode,
  updateNode,
  type DropTarget,
} from "./tree";
import { pickStyles, resetStyles } from "./styles";
import { presetBases, type LayoutPreset } from "./containers";
import { DEFAULT_ACTIVE_DEVICES, type DeviceKey } from "./responsive";

/* ---------------- studio clipboard (versioned, cross-tab) ----------------
 *
 * Mirrors the classic `builder-clipboard` envelope: every payload carries a
 * schema version, an origin tab id and a timestamp, persists to localStorage,
 * and fans out over BroadcastChannel (with the `storage` event as fallback),
 * so a copy in one tab pastes in another. Reads re-validate the envelope and
 * reject foreign/malformed payloads instead of pasting garbage. Style-only
 * copies keep just the RESETTABLE_KEYS layer via `pickStyles`.
 */

export const STUDIO_CLIPBOARD_VERSION = 1;
export const STUDIO_CLIPBOARD_KEY = "fq.studio.clipboard.v1";
export const STUDIO_CLIPBOARD_CHANNEL = "fq.studio.clipboard";

/** Hard ceilings: a clipboard is a convenience, not a bulk transfer tool. */
export const STUDIO_CLIPBOARD_LIMITS = {
  maxNodes: 40,
  maxBytes: 512_000,
  maxDepth: 12,
} as const;

export type StudioClipboardKind = "nodes" | "style";

export type StudioClipboardPayload = {
  v: number;
  /** Epoch ms of the copy, used for conflict ordering. */
  ts: number;
  /** Tab that produced the payload; a tab ignores its own broadcast echoes. */
  origin: string;
  kind: StudioClipboardKind;
  nodes: StudioNode[];
  /** Present for `kind: "style"`: the copied style layer only. */
  styles?: Record<string, SettingValue>;
};

export type StudioClipboardRejection =
  | "empty"
  | "too_many_nodes"
  | "too_large"
  | "version_mismatch"
  | "malformed";

export type StudioClipboardWrite =
  | { ok: true; payload: StudioClipboardPayload; persisted: boolean }
  | { ok: false; reason: StudioClipboardRejection };

function countStudioNodesDeep(nodes: StudioNode[], depth = 0): number {
  if (depth > STUDIO_CLIPBOARD_LIMITS.maxDepth) return Number.POSITIVE_INFINITY;
  return nodes.reduce(
    (total, node) =>
      total + 1 + countStudioNodesDeep(node.children ?? [], depth + 1),
    0,
  );
}

function isStudioNodeLike(value: unknown, depth = 0): value is StudioNode {
  if (depth > STUDIO_CLIPBOARD_LIMITS.maxDepth) return false;
  if (!value || typeof value !== "object") return false;
  const node = value as Partial<StudioNode>;
  if (typeof node.id !== "string" || typeof node.el !== "string") return false;
  if (node.settings !== undefined && typeof node.settings !== "object")
    return false;
  if (node.children !== undefined) {
    if (!Array.isArray(node.children)) return false;
    if (!node.children.every((child) => isStudioNodeLike(child, depth + 1)))
      return false;
  }
  return true;
}

/**
 * Re-validates an untrusted envelope. Structural only (the studio model has
 * no server-side AST parser): ids/elements must be strings, children must
 * recurse, and the kind must be known.
 */
export function parseStudioClipboardPayload(raw: string | null):
  | { ok: true; payload: StudioClipboardPayload }
  | { ok: false; reason: StudioClipboardRejection } {
  if (!raw) return { ok: false, reason: "empty" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!value || typeof value !== "object")
    return { ok: false, reason: "malformed" };
  const envelope = value as Partial<StudioClipboardPayload>;
  if (envelope.v !== STUDIO_CLIPBOARD_VERSION)
    return { ok: false, reason: "version_mismatch" };
  const kind: StudioClipboardKind =
    envelope.kind === "style" ? "style" : "nodes";
  if (!Array.isArray(envelope.nodes) || envelope.nodes.length === 0)
    return { ok: false, reason: "malformed" };
  if (!envelope.nodes.every((node) => isStudioNodeLike(node)))
    return { ok: false, reason: "malformed" };
  if (
    countStudioNodesDeep(envelope.nodes) > STUDIO_CLIPBOARD_LIMITS.maxNodes
  )
    return { ok: false, reason: "too_many_nodes" };
  const [first] = envelope.nodes;
  const payload: StudioClipboardPayload = {
    v: STUDIO_CLIPBOARD_VERSION,
    ts: typeof envelope.ts === "number" ? envelope.ts : 0,
    origin: typeof envelope.origin === "string" ? envelope.origin : "unknown",
    kind,
    nodes: envelope.nodes,
    ...(kind === "style" && first
      ? { styles: pickStyles({ ...(first.settings ?? {}) }) }
      : {}),
  };
  return { ok: true, payload };
}

export type StudioClipboardChannelLike = {
  postMessage: (data: unknown) => void;
  close?: () => void;
  /** Written, never read with DOM typing: keeps test doubles compatible. */
  onmessage: unknown;
};

export type StudioClipboardStoreDeps = {
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Production passes a real `BroadcastChannel` when available. */
  channel?: StudioClipboardChannelLike | null;
  now?: () => number;
  origin?: string;
};

export type StudioClipboardStore = {
  read: () => StudioClipboardPayload | null;
  write: (input: {
    kind: StudioClipboardKind;
    nodes: StudioNode[];
  }) => StudioClipboardWrite;
  clear: () => void;
  subscribe: (
    listener: (payload: StudioClipboardPayload | null) => void,
  ) => () => void;
  /** Called from a `storage` event handler; returns true when state changed. */
  ingestExternal: (raw: string | null) => boolean;
  dispose: () => void;
};

export function createStudioClipboardStore(
  deps: StudioClipboardStoreDeps = {},
): StudioClipboardStore {
  const now = deps.now ?? (() => Date.now());
  const origin =
    deps.origin ??
    (typeof Math.random === "function"
      ? `tab-${Math.random().toString(36).slice(2, 10)}`
      : "tab-unknown");
  const listeners = new Set<(payload: StudioClipboardPayload | null) => void>();
  let memory: StudioClipboardPayload | null = null;

  const emit = () => {
    for (const listener of listeners) {
      try {
        listener(memory);
      } catch {
        /* a failing listener must never break ⌘C */
      }
    }
  };

  const readStorage = (): StudioClipboardPayload | null => {
    if (!deps.storage) return null;
    let raw: string | null = null;
    try {
      raw = deps.storage.getItem(STUDIO_CLIPBOARD_KEY);
    } catch {
      return null;
    }
    const parsed = parseStudioClipboardPayload(raw);
    return parsed.ok ? parsed.payload : null;
  };

  memory = readStorage();

  if (deps.channel) {
    deps.channel.onmessage = (event: { data: unknown }) => {
      const data = event.data as {
        origin?: string;
        raw?: string | null;
      } | null;
      if (!data || data.origin === origin) return;
      if (typeof data.raw === "undefined") return;
      const parsed = parseStudioClipboardPayload(data.raw ?? null);
      memory = parsed.ok ? parsed.payload : null;
      emit();
    };
  }

  return {
    read() {
      // Storage is authoritative when present: another tab may have replaced
      // it between broadcasts (private mode, blocked channel, other writers).
      const stored = readStorage();
      if (stored && (!memory || stored.ts >= memory.ts)) memory = stored;
      return memory;
    },
    write({ kind, nodes }) {
      if (!nodes.length) return { ok: false, reason: "empty" };
      if (countStudioNodesDeep(nodes) > STUDIO_CLIPBOARD_LIMITS.maxNodes)
        return { ok: false, reason: "too_many_nodes" };
      const [first] = nodes;
      const payload: StudioClipboardPayload = {
        v: STUDIO_CLIPBOARD_VERSION,
        ts: now(),
        origin,
        kind,
        nodes,
        ...(kind === "style" && first
          ? { styles: pickStyles({ ...(first.settings ?? {}) }) }
          : {}),
      };
      let raw: string;
      try {
        raw = JSON.stringify(payload);
      } catch {
        return { ok: false, reason: "malformed" };
      }
      if (raw.length > STUDIO_CLIPBOARD_LIMITS.maxBytes)
        return { ok: false, reason: "too_large" };
      memory = payload;
      let persisted = false;
      if (deps.storage) {
        try {
          deps.storage.setItem(STUDIO_CLIPBOARD_KEY, raw);
          persisted = true;
        } catch {
          // Quota/private-mode failure: the in-memory clipboard still works
          // for this tab, which beats throwing into a keyboard handler.
        }
      }
      try {
        deps.channel?.postMessage({ origin, raw });
      } catch {
        /* broadcast is best-effort */
      }
      emit();
      return { ok: true, payload, persisted };
    },
    clear() {
      memory = null;
      try {
        deps.storage?.removeItem(STUDIO_CLIPBOARD_KEY);
      } catch {
        /* nothing recoverable */
      }
      try {
        deps.channel?.postMessage({ origin, raw: null });
      } catch {
        /* nothing recoverable */
      }
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ingestExternal(raw) {
      const parsed = parseStudioClipboardPayload(raw);
      const next = parsed.ok ? parsed.payload : null;
      const changed = (next?.ts ?? null) !== (memory?.ts ?? null);
      memory = next;
      if (changed) emit();
      return changed;
    },
    dispose() {
      listeners.clear();
      try {
        deps.channel?.close?.();
      } catch {
        /* nothing recoverable */
      }
    },
  };
}

/** Browser-backed store deps; safe to call during render (no DOM writes). */
function browserClipboardDeps(): StudioClipboardStoreDeps {
  if (typeof window === "undefined") return {};
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  let channel: StudioClipboardChannelLike | null = null;
  try {
    channel =
      typeof window.BroadcastChannel === "function"
        ? (new window.BroadcastChannel(
            STUDIO_CLIPBOARD_CHANNEL,
          ) as unknown as StudioClipboardChannelLike)
        : null;
  } catch {
    channel = null;
  }
  return { storage, channel };
}

/**
 * Pure adoption rule (unit-tested): take over a newly-arrived document only
 * when its key differs from what was adopted and there are no unsaved edits
 * to clobber. This is what lets an embedded studio show server content that
 * resolves after mount, without ever discarding in-progress work.
 */
export function shouldAdoptDoc(
  adoptedKey: string | null,
  nextKey: string | null | undefined,
  dirty: boolean,
): boolean {
  if (nextKey == null || nextKey === adoptedKey) return false;
  return !dirty;
}

export function useStudio(initial: StudioDoc, resetKey?: string | null) {
  const [history, setHistory] = useState(() => initHistory(initial));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceKey>("desktop");
  const [dirty, setDirty] = useState(false);
  const clipboard = useRef<StudioClipboardStore | null>(null);
  if (!clipboard.current) clipboard.current = createStudioClipboardStore(browserClipboardDeps());

  /* Cross-tab fallback: the `storage` event fires when another tab writes. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STUDIO_CLIPBOARD_KEY) return;
      clipboard.current?.ingestExternal(event.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Adopt a newly-loaded server document (e.g. the fetch resolving after the
  // shell mounted on an empty draft). Runs every render but exits fast
  // unless the key actually changed; the pristine guard never clobbers edits.
  const adoptedKey = useRef<string | null>(resetKey ?? null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!shouldAdoptDoc(adoptedKey.current, resetKey ?? null, dirtyRef.current))
      return;
    adoptedKey.current = resetKey ?? null;
    setHistory(initHistory(initial));
    setSelectedId(null);
  });

  const doc = currentDoc(history);
  const selected = useMemo(
    () => (selectedId ? (findNode(doc.root, selectedId) ?? null) : null),
    [doc, selectedId],
  );
  const activeDevices = doc.breakpoints ?? DEFAULT_ACTIVE_DEVICES;

  const commit = useCallback(
    (next: StudioDoc, element: string, verb: HistoryVerb) => {
      setHistory((state) => pushHistory(state, next, element, verb));
      setDirty(true);
    },
    [],
  );

  const setRoot = useCallback(
    (root: StudioNode[], element: string, verb: HistoryVerb) =>
      commit({ ...doc, root }, element, verb),
    [commit, doc],
  );

  /* ---------------- mutations ---------------- */

  const addNode = useCallback(
    (node: StudioNode, target?: DropTarget) => {
      const where: DropTarget = target ?? {
        id: selected && isContainerNode(selected) ? selected.id : null,
        position: selected && isContainerNode(selected) ? "inside" : "after",
      };
      setRoot(
        dropInto(doc.root, node, where),
        node.name ?? widgetLabel(node.el),
        "added",
      );
      setSelectedId(node.id);
    },
    [doc.root, selected, setRoot],
  );

  const addWidget = useCallback(
    (key: string, target?: DropTarget) => addNode(newWidgetNode(key), target),
    [addNode],
  );

  const addPreset = useCallback(
    (preset: LayoutPreset, target?: DropTarget) => {
      const rows = preset.rows.map((row) =>
        newContainer(
          { layout: preset.layout, direction: "row" },
          row.map((basis) =>
            newContainer({ layout: "flex", direction: "column", basis }),
          ),
        ),
      );
      const node =
        rows.length === 1
          ? rows[0]!
          : newContainer({ layout: "flex", direction: "column" }, rows);
      void presetBases;
      addNode(node, target);
    },
    [addNode],
  );

  const update = useCallback(
    (id: string, patch: Partial<StudioNode>, verb: HistoryVerb = "edited") => {
      const node = findNode(doc.root, id);
      setRoot(
        updateNode(doc.root, id, (current) => ({ ...current, ...patch })),
        node ? widgetLabel(node.el) : "Element",
        verb,
      );
    },
    [doc.root, setRoot],
  );

  const setSetting = useCallback(
    (id: string, key: string, value: SettingValue) => {
      const node = findNode(doc.root, id);
      setRoot(
        updateNode(doc.root, id, (current) => ({
          ...current,
          settings: { ...current.settings, [key]: value },
        })),
        node ? widgetLabel(node.el) : "Element",
        "styled",
      );
    },
    [doc.root, setRoot],
  );

  const remove = useCallback(
    (id: string) => {
      const node = findNode(doc.root, id);
      const parent = parentOf(doc.root, id);
      setRoot(
        removeNode(doc.root, id),
        node ? widgetLabel(node.el) : "Element",
        "removed",
      );
      setSelectedId(parent?.id ?? null);
    },
    [doc.root, setRoot],
  );

  const duplicate = useCallback(
    (id: string) => {
      const node = findNode(doc.root, id);
      if (!node) return;
      const copy = cloneNode(node);
      setRoot(
        dropInto(doc.root, copy, { id, position: "after" }),
        widgetLabel(node.el),
        "duplicated",
      );
      setSelectedId(copy.id);
    },
    [doc.root, setRoot],
  );

  /**
   * Bulk duplicate for multi-select: clones each top-most id once (callers
   * dedupe descendants first) in a single history entry. Sequential
   * `duplicate` calls would clobber each other through the stale closure.
   */
  const duplicateMany = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return;
      let root = doc.root;
      let lastId: string | null = null;
      let label = "Element";
      for (const id of ids) {
        const node = findNode(root, id);
        if (!node) continue;
        const copy = cloneNode(node);
        root = dropInto(root, copy, { id, position: "after" });
        label = widgetLabel(node.el);
        lastId = copy.id;
      }
      if (!lastId) return;
      setRoot(root, label, "duplicated");
      setSelectedId(lastId);
    },
    [doc.root, setRoot],
  );

  /**
   * Bulk delete for multi-select: removes every id in one history entry and
   * clears the selection (no parent to fall back to when several subtrees
   * go at once).
   */
  const removeMany = useCallback(
    (ids: readonly string[]) => {
      if (ids.length === 0) return;
      let root = doc.root;
      for (const id of ids) root = removeNode(root, id);
      setRoot(root, "Elements", "removed");
      setSelectedId(null);
    },
    [doc.root, setRoot],
  );

  const move = useCallback(
    (dragId: string, target: DropTarget) => {
      const node = findNode(doc.root, dragId);
      setRoot(
        moveNode(doc.root, dragId, target),
        node ? widgetLabel(node.el) : "Element",
        "moved",
      );
    },
    [doc.root, setRoot],
  );

  /**
   * Copies raw nodes (fresh ids are assigned on paste, so the same payload
   * pastes repeatedly without colliding). Returns false when there is
   * nothing to copy or the payload is over budget.
   */
  const copyNodes = useCallback((nodes: StudioNode[]): boolean => {
    const store = clipboard.current;
    if (!store || nodes.length === 0) return false;
    return store.write({ kind: "nodes", nodes }).ok;
  }, []);

  const copy = useCallback(
    (id: string) => {
      const node = findNode(doc.root, id);
      if (node) copyNodes([cloneNode(node)]);
    },
    [copyNodes, doc.root],
  );

  const paste = useCallback(
    (target?: DropTarget) => {
      const payload = clipboard.current?.read();
      const nodes = payload?.kind === "nodes" ? payload.nodes : null;
      if (!nodes?.length) return;
      let root = doc.root;
      let lastId: string | null = null;
      for (const source of nodes) {
        const copyNode = cloneNode(source);
        root = dropInto(
          root,
          copyNode,
          lastId
            ? { id: lastId, position: "after" }
            : (target ?? { id: selectedId, position: "after" }),
        );
        lastId = copyNode.id;
      }
      setRoot(root, widgetLabel(nodes[0]!.el), "pasted");
      if (lastId) setSelectedId(lastId);
    },
    [doc.root, selectedId, setRoot],
  );

  const copyStyle = useCallback(
    (id: string) => {
      const node = findNode(doc.root, id);
      if (node) clipboard.current?.write({ kind: "style", nodes: [node] });
    },
    [doc.root],
  );

  /** Peeks the clipboard without consuming it — powers bulk paste-style. */
  const peekClipboard = useCallback(
    () => clipboard.current?.read() ?? null,
    [],
  );

  const pasteStyle = useCallback(
    (id: string) => {
      const payload = clipboard.current?.read();
      const styles =
        payload?.styles ??
        (payload?.nodes[0]
          ? pickStyles(payload.nodes[0].settings)
          : undefined);
      if (!styles) return;
      setRoot(
        updateNode(doc.root, id, (current) => ({
          ...current,
          settings: { ...current.settings, ...styles },
        })),
        "Element",
        "styled",
      );
    },
    [doc.root, setRoot],
  );

  const resetStyle = useCallback(
    (id: string) =>
      setRoot(
        updateNode(doc.root, id, (current) => ({
          ...current,
          settings: resetStyles(current.settings),
        })),
        "Element",
        "reset",
      ),
    [doc.root, setRoot],
  );

  const toggleHidden = useCallback(
    (id: string) =>
      setRoot(
        updateNode(doc.root, id, (current) => ({
          ...current,
          hiddenOn:
            (current.hiddenOn?.length ?? 0) > 0
              ? []
              : [...DEFAULT_ACTIVE_DEVICES],
        })),
        "Element",
        "edited",
      ),
    [doc.root, setRoot],
  );

  const rename = useCallback(
    (id: string, name: string) => update(id, { name: name || undefined }),
    [update],
  );

  const setPage = useCallback(
    (patch: Partial<PageSettings>) =>
      commit({ ...doc, page: { ...doc.page, ...patch } }, "Page", "edited"),
    [commit, doc],
  );

  const setBreakpoints = useCallback(
    (next: DeviceKey[]) =>
      commit({ ...doc, breakpoints: next }, "Page", "edited"),
    [commit, doc],
  );

  /* ---------------- global classes ---------------- */

  const classes = doc.classes ?? [];

  const setClasses = useCallback(
    (next: StudioClass[]) =>
      commit({ ...doc, classes: next }, "Classes", "edited"),
    [commit, doc],
  );

  const createClass = useCallback(
    (name: string) => {
      if (!name || classes.some((item) => item.name === name)) return;
      setClasses([...classes, { id: uid(), name }]);
    },
    [classes, setClasses],
  );

  const renameClass = useCallback(
    (id: string, name: string) => {
      const previous = classes.find((item) => item.id === id);
      setClasses(
        classes.map((item) => (item.id === id ? { ...item, name } : item)),
      );
      if (!previous) return;
      // Keep every element that used the old name pointing at the new one.
      setHistory((state) => {
        const current = currentDoc(state);
        const rewrite = (nodes: StudioNode[]): StudioNode[] =>
          nodes.map((node) => {
            const raw =
              typeof node.settings.cssClasses === "string"
                ? node.settings.cssClasses
                : "";
            const names = raw.split(/\s+/).filter(Boolean);
            const next = names.includes(previous.name)
              ? names
                  .map((entry) => (entry === previous.name ? name : entry))
                  .join(" ")
              : raw;
            return {
              ...node,
              settings:
                next === raw
                  ? node.settings
                  : { ...node.settings, cssClasses: next },
              children: node.children ? rewrite(node.children) : node.children,
            };
          });
        return pushHistory(
          state,
          { ...current, root: rewrite(current.root) },
          "Classes",
          "edited",
        );
      });
    },
    [classes, setClasses],
  );

  const deleteClass = useCallback(
    (id: string) => setClasses(classes.filter((item) => item.id !== id)),
    [classes, setClasses],
  );

  const replaceDoc = useCallback(
    (next: StudioDoc, verb: HistoryVerb = "imported") =>
      commit(next, "Page", verb),
    [commit],
  );

  return {
    doc,
    history,
    selected,
    selectedId,
    device,
    activeDevices,
    dirty,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    setSelectedId,
    setDevice,
    setDirty,
    undo: () => setHistory(undoHistory),
    redo: () => setHistory(redoHistory),
    jump: (index: number) => setHistory((state) => jumpTo(state, index)),
    addNode,
    addWidget,
    addPreset,
    update,
    setSetting,
    remove,
    duplicate,
    duplicateMany,
    removeMany,
    move,
    copy,
    paste,
    copyNodes,
    peekClipboard,
    copyStyle,
    pasteStyle,
    resetStyle,
    toggleHidden,
    rename,
    setPage,
    setBreakpoints,
    classes,
    createClass,
    renameClass,
    deleteClass,
    replaceDoc,
  };
}

export type StudioApi = ReturnType<typeof useStudio>;
