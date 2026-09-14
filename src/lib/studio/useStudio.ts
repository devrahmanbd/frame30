/**
 * Phase 14 — editor state.
 *
 * One hook owns the document, history, selection, clipboard and device so the
 * shell stays presentational. Every mutation goes through `commit`, which is
 * what feeds the History panel and the dirty flag.
 */
import { useCallback, useMemo, useRef, useState } from "react";
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

export type StudioClipboard = { node: StudioNode | null; styles: Record<string, SettingValue> | null };

export function useStudio(initial: StudioDoc) {
  const [history, setHistory] = useState(() => initHistory(initial));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceKey>("desktop");
  const [dirty, setDirty] = useState(false);
  const clipboard = useRef<StudioClipboard>({ node: null, styles: null });

  const doc = currentDoc(history);
  const selected = useMemo(
    () => (selectedId ? (findNode(doc.root, selectedId) ?? null) : null),
    [doc, selectedId],
  );
  const activeDevices = doc.breakpoints ?? DEFAULT_ACTIVE_DEVICES;

  const commit = useCallback((next: StudioDoc, element: string, verb: HistoryVerb) => {
    setHistory((state) => pushHistory(state, next, element, verb));
    setDirty(true);
  }, []);

  const setRoot = useCallback(
    (root: StudioNode[], element: string, verb: HistoryVerb) => commit({ ...doc, root }, element, verb),
    [commit, doc],
  );

  /* ---------------- mutations ---------------- */

  const addNode = useCallback(
    (node: StudioNode, target?: DropTarget) => {
      const where: DropTarget = target ?? {
        id: selected && isContainerNode(selected) ? selected.id : null,
        position: selected && isContainerNode(selected) ? "inside" : "after",
      };
      setRoot(dropInto(doc.root, node, where), node.name ?? widgetLabel(node.el), "added");
      setSelectedId(node.id);
    },
    [doc.root, selected, setRoot],
  );

  const addWidget = useCallback((key: string, target?: DropTarget) => addNode(newWidgetNode(key), target), [addNode]);

  const addPreset = useCallback(
    (preset: LayoutPreset, target?: DropTarget) => {
      const rows = preset.rows.map((row) =>
        newContainer(
          { layout: preset.layout, direction: "row" },
          row.map((basis) => newContainer({ layout: "flex", direction: "column", basis })),
        ),
      );
      const node = rows.length === 1 ? rows[0]! : newContainer({ layout: "flex", direction: "column" }, rows);
      void presetBases;
      addNode(node, target);
    },
    [addNode],
  );

  const update = useCallback(
    (id: string, patch: Partial<StudioNode>, verb: HistoryVerb = "edited") => {
      const node = findNode(doc.root, id);
      setRoot(updateNode(doc.root, id, (current) => ({ ...current, ...patch })), node ? widgetLabel(node.el) : "Element", verb);
    },
    [doc.root, setRoot],
  );

  const setSetting = useCallback(
    (id: string, key: string, value: SettingValue) => {
      const node = findNode(doc.root, id);
      setRoot(
        updateNode(doc.root, id, (current) => ({ ...current, settings: { ...current.settings, [key]: value } })),
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
      setRoot(removeNode(doc.root, id), node ? widgetLabel(node.el) : "Element", "removed");
      setSelectedId(parent?.id ?? null);
    },
    [doc.root, setRoot],
  );

  const duplicate = useCallback(
    (id: string) => {
      const node = findNode(doc.root, id);
      if (!node) return;
      const copy = cloneNode(node);
      setRoot(dropInto(doc.root, copy, { id, position: "after" }), widgetLabel(node.el), "duplicated");
      setSelectedId(copy.id);
    },
    [doc.root, setRoot],
  );

  const move = useCallback(
    (dragId: string, target: DropTarget) => {
      const node = findNode(doc.root, dragId);
      setRoot(moveNode(doc.root, dragId, target), node ? widgetLabel(node.el) : "Element", "moved");
    },
    [doc.root, setRoot],
  );

  const copy = useCallback(
    (id: string) => {
      const node = findNode(doc.root, id);
      if (node) clipboard.current.node = cloneNode(node);
    },
    [doc.root],
  );

  const paste = useCallback(
    (target?: DropTarget) => {
      const node = clipboard.current.node;
      if (!node) return;
      const copyNode = cloneNode(node);
      setRoot(
        dropInto(doc.root, copyNode, target ?? { id: selectedId, position: "after" }),
        widgetLabel(copyNode.el),
        "pasted",
      );
      setSelectedId(copyNode.id);
    },
    [doc.root, selectedId, setRoot],
  );

  const copyStyle = useCallback(
    (id: string) => {
      const node = findNode(doc.root, id);
      if (node) clipboard.current.styles = pickStyles(node.settings);
    },
    [doc.root],
  );

  const pasteStyle = useCallback(
    (id: string) => {
      const styles = clipboard.current.styles;
      if (!styles) return;
      setRoot(
        updateNode(doc.root, id, (current) => ({ ...current, settings: { ...current.settings, ...styles } })),
        "Element",
        "styled",
      );
    },
    [doc.root, setRoot],
  );

  const resetStyle = useCallback(
    (id: string) =>
      setRoot(
        updateNode(doc.root, id, (current) => ({ ...current, settings: resetStyles(current.settings) })),
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
          hiddenOn: (current.hiddenOn?.length ?? 0) > 0 ? [] : [...DEFAULT_ACTIVE_DEVICES],
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
    (patch: Partial<PageSettings>) => commit({ ...doc, page: { ...doc.page, ...patch } }, "Page", "edited"),
    [commit, doc],
  );

  const setBreakpoints = useCallback(
    (next: DeviceKey[]) => commit({ ...doc, breakpoints: next }, "Page", "edited"),
    [commit, doc],
  );

  /* ---------------- global classes ---------------- */

  const classes = doc.classes ?? [];

  const setClasses = useCallback(
    (next: StudioClass[]) => commit({ ...doc, classes: next }, "Classes", "edited"),
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
      setClasses(classes.map((item) => (item.id === id ? { ...item, name } : item)));
      if (!previous) return;
      // Keep every element that used the old name pointing at the new one.
      setHistory((state) => {
        const current = currentDoc(state);
        const rewrite = (nodes: StudioNode[]): StudioNode[] =>
          nodes.map((node) => {
            const raw = typeof node.settings.cssClasses === "string" ? node.settings.cssClasses : "";
            const names = raw.split(/\s+/).filter(Boolean);
            const next = names.includes(previous.name)
              ? names.map((entry) => (entry === previous.name ? name : entry)).join(" ")
              : raw;
            return {
              ...node,
              settings: next === raw ? node.settings : { ...node.settings, cssClasses: next },
              children: node.children ? rewrite(node.children) : node.children,
            };
          });
        return pushHistory(state, { ...current, root: rewrite(current.root) }, "Classes", "edited");
      });
    },
    [classes, setClasses],
  );

  const deleteClass = useCallback(
    (id: string) => setClasses(classes.filter((item) => item.id !== id)),
    [classes, setClasses],
  );


  const replaceDoc = useCallback(
    (next: StudioDoc, verb: HistoryVerb = "imported") => commit(next, "Page", verb),
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
    move,
    copy,
    paste,
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
