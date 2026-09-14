import { useMemo, useState } from "react";
import { catalogEntry, type Breakpoint, type Section } from "@/lib/builder-ast";
import { isContainer, outline, type DropPosition } from "@/lib/builder-tree";
import { useLang } from "@/lib/i18n";
import { linkedBlockId } from "@/lib/global-blocks";

/** Phase 1.6: merchant-authored node name, shown instead of the widget label. */
export const NODE_NAME_PROP = "__name";

export function nodeLabel(node: Section, fallback: string): string {
  const custom = node.props[NODE_NAME_PROP];
  return typeof custom === "string" && custom.trim() ? custom.trim() : fallback;
}

type Props = {
  sections: Section[];
  selectedIds: string[];
  /** `mode` mirrors the modifier used: plain click replaces the selection. */
  onSelect: (id: string, mode: "replace" | "toggle") => void;
  onMove: (dragId: string, targetId: string | null, position: DropPosition) => void;
  onNudge: (id: string, delta: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** Adds a widget inside this container (opens the tray scoped to it). */
  onAddInside?: (parentId: string) => void;
  /** Phase 1.2: right-click (or the row's ⋯ affordance) opens the node menu. */
  onContextMenu?: (id: string, x: number, y: number) => void;
  /** Phase 1.6: inline rename from the navigator. */
  onRename?: (id: string, name: string) => void;
  /** Phase 1.6: case-insensitive match on custom name or widget type/label. */
  filter?: string;
};

type DropHint = { id: string | null; position: DropPosition } | null;

const HIDDEN_LABEL: Record<Breakpoint, string> = {
  mobile: "M",
  tablet: "T",
  desktop: "D",
};

/**
 * Phase 0.5 — the layer/outline panel.
 *
 * Elementor's navigator, Webflow's layer list: the full nested tree with
 * pointer drag-and-drop (with before/inside/after drop indicators) and a
 * keyboard path that can do everything the mouse can.
 */
export function LayerTree({
  sections,
  selectedIds,
  onSelect,
  onMove,
  onNudge,
  onDuplicate,
  onDelete,
  onAddInside,
  onContextMenu,
  onRename,
  filter,
}: Props) {
  const { t } = useLang();
  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);

  const rows = useMemo(() => outline(sections), [sections]);
  const needle = (filter ?? "").trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return null;
    // A match keeps its ancestors visible, otherwise a nested hit disappears.
    const keep = new Set<string>();
    const byId = new Map(rows.map((row) => [row.node.id, row]));
    for (const row of rows) {
      const label = (catalogEntry(row.node.type)?.label ?? row.node.type).toLowerCase();
      const custom = nodeLabel(row.node, "").toLowerCase();
      if (!label.includes(needle) && !custom.includes(needle) && !row.node.type.includes(needle)) continue;
      let cursor: string | null = row.node.id;
      while (cursor) {
        keep.add(cursor);
        cursor = byId.get(cursor)?.parentId ?? null;
      }
    }
    return keep;
  }, [needle, rows]);
  const visibleRows = useMemo(() => {
    const hiddenParents = new Set<string>();
    const scoped = matches ? rows.filter((row) => matches.has(row.node.id)) : rows;
    if (matches) return scoped;
    return scoped.filter((row) => {
      const parentHidden = row.parentId !== null && hiddenParents.has(row.parentId);
      if (parentHidden || (row.parentId !== null && collapsed.has(row.parentId))) {
        hiddenParents.add(row.node.id);
        return false;
      }
      return true;
    });
  }, [rows, collapsed, matches]);

  const toggleCollapse = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const focusRow = (index: number) => {
    const target = visibleRows[index];
    if (!target) return;
    document.getElementById(`layer-${target.node.id}`)?.focus();
  };

  const positionFromEvent = (event: React.DragEvent, container: boolean): DropPosition => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - box.top) / Math.max(box.height, 1);
    if (container && ratio > 0.3 && ratio < 0.7) return "inside";
    return ratio < 0.5 ? "before" : "after";
  };

  if (sections.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("No layers yet. Add a widget to start.", "এখনো কোনো লেয়ার নেই। একটি উইজেট যোগ করুন।")}
      </p>
    );
  }

  if (visibleRows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("No layer matches that search.", "এই খোঁজের সাথে কোনো লেয়ার মেলেনি।")}
      </p>
    );
  }

  return (
    <div
      role="tree"
      aria-label={t("Layers", "লেয়ার")}
      className="space-y-0.5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (dragId && hint === null) onMove(dragId, null, "after");
        setDragId(null);
        setHint(null);
      }}
    >
      {visibleRows.map((row, index) => {
        const { node, depth } = row;
        const container = isContainer(node);
        const selected = selectedIds.includes(node.id);
        const active = hint?.id === node.id ? hint.position : null;
        const entry = catalogEntry(node.type);
        return (
          <div
            key={node.id}
            style={{ paddingInlineStart: `${depth * 12}px` }}
            className={
              active === "before"
                ? "border-t-2 border-primary"
                : active === "after"
                  ? "border-b-2 border-primary"
                  : "border-y-2 border-transparent"
            }
            onDragOver={(event) => {
              if (!dragId || dragId === node.id) return;
              event.preventDefault();
              setHint({ id: node.id, position: positionFromEvent(event, container) });
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (dragId && dragId !== node.id) {
                onMove(dragId, node.id, hint?.position ?? "after");
              }
              setDragId(null);
              setHint(null);
            }}
            onContextMenu={(event) => {
              if (!onContextMenu) return;
              event.preventDefault();
              event.stopPropagation();
              onSelect(node.id, "replace");
              onContextMenu(node.id, event.clientX, event.clientY);
            }}
          >
            <div
              className={`flex items-center gap-1 rounded-fq-md px-1 ${
                active === "inside" ? "ring-2 ring-primary" : ""
              } ${selected ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
            >
              {container ? (
                <button
                  type="button"
                  aria-label={
                    collapsed.has(node.id) ? t("Expand", "খুলুন") : t("Collapse", "গুটান")
                  }
                  aria-expanded={!collapsed.has(node.id)}
                  onClick={() => toggleCollapse(node.id)}
                  className="w-4 shrink-0 text-xs text-muted-foreground"
                >
                  {collapsed.has(node.id) ? "▸" : "▾"}
                </button>
              ) : (
                <span className="w-4 shrink-0" aria-hidden="true" />
              )}

              {renaming === node.id && onRename ? (
                <input
                  autoFocus
                  defaultValue={nodeLabel(node, entry?.label ?? node.type)}
                  aria-label={t("Layer name", "লেয়ারের নাম")}
                  onBlur={(event) => {
                    onRename(node.id, event.currentTarget.value.slice(0, 60));
                    setRenaming(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                  className="min-w-0 flex-1 rounded-fq-md border border-border bg-card px-1 py-1 text-xs"
                />
              ) : (
              <button
                id={`layer-${node.id}`}
                type="button"
                role="treeitem"
                aria-selected={selected}
                aria-level={depth + 1}
                {...(container ? { "aria-expanded": !collapsed.has(node.id) } : {})}
                draggable
                onDragStart={(event) => {
                  setDragId(node.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setHint(null);
                }}
                onClick={(event) =>
                  onSelect(node.id, event.metaKey || event.ctrlKey || event.shiftKey ? "toggle" : "replace")
                }
                onDoubleClick={() => onRename && setRenaming(node.id)}
                onKeyDown={(event) => {
                  const mod = event.metaKey || event.ctrlKey;
                  if (event.key === "ArrowDown" && !mod) {
                    event.preventDefault();
                    focusRow(index + 1);
                  } else if (event.key === "ArrowUp" && !mod) {
                    event.preventDefault();
                    focusRow(index - 1);
                  } else if (event.key === "ArrowDown" && mod) {
                    event.preventDefault();
                    onNudge(node.id, 1);
                  } else if (event.key === "ArrowUp" && mod) {
                    event.preventDefault();
                    onNudge(node.id, -1);
                  } else if (event.key === "ArrowRight" && container) {
                    event.preventDefault();
                    setCollapsed((c) => {
                      const next = new Set(c);
                      next.delete(node.id);
                      return next;
                    });
                  } else if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    if (container && !collapsed.has(node.id)) toggleCollapse(node.id);
                    else if (row.parentId) document.getElementById(`layer-${row.parentId}`)?.focus();
                  } else if (event.key === "Delete" || event.key === "Backspace") {
                    event.preventDefault();
                    onDelete(node.id);
                  } else if (mod && event.key.toLowerCase() === "d") {
                    event.preventDefault();
                    onDuplicate(node.id);
                  } else if (event.key === "F2" && onRename) {
                    event.preventDefault();
                    setRenaming(node.id);
                  }
                }}
                className="min-w-0 flex-1 truncate py-1.5 text-left text-xs"
              >
                {nodeLabel(node, entry?.label ?? node.type)}
                {linkedBlockId(node) ? (
                  <span
                    className="ms-1 text-[10px] text-primary"
                    title={t("Linked global block", "লিংক করা গ্লোবাল ব্লক")}
                  >
                    ⇄
                  </span>
                ) : null}
                {node.hidden?.length ? (
                  <span className="ms-1 text-[10px] text-muted-foreground">
                    ({node.hidden.map((b) => HIDDEN_LABEL[b]).join("")})
                  </span>
                ) : null}
              </button>
              )}

              {container && onAddInside && (
                <button
                  type="button"
                  aria-label={t("Add inside", "ভিতরে যোগ")}
                  onClick={() => onAddInside(node.id)}
                  className="shrink-0 rounded-fq-md px-1 text-xs text-muted-foreground hover:bg-muted"
                >
                  +
                </button>
              )}
              <button
                type="button"
                aria-label={t("Move up", "উপরে")}
                onClick={() => onNudge(node.id, -1)}
                className="shrink-0 rounded-fq-md px-1 text-xs"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={t("Move down", "নিচে")}
                onClick={() => onNudge(node.id, 1)}
                className="shrink-0 rounded-fq-md px-1 text-xs"
              >
                ↓
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
