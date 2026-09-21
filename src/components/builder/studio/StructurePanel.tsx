/**
 * Phase 14 — Structure (Navigator).
 *
 * Floating, collapsible tree of `Container › Widget`. Drag to reorder, the eye
 * hides an element on every breakpoint, double-click renames.
 */
import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { widgetLabel } from "@/lib/studio/catalog";
import { isContainerNode, type StudioNode } from "@/lib/studio/model";
import { LucideIcon } from "./renderers";
import { widgetIcon } from "@/lib/studio/catalog";
import type { DropTarget } from "@/lib/studio/tree";

export type StructurePanelProps = {
  nodes: StudioNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onToggleHidden: (id: string) => void;
  onMove: (dragId: string, target: DropTarget) => void;
  onContextMenu?: (id: string, position: { x: number; y: number }) => void;
  onClose: () => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
};

/** Label match including descendants, so filtering keeps ancestor context. */
function matchesTree(node: StudioNode, query: string): boolean {
  const label = (
    node.name ??
    (node.el === "container" ? "Container" : widgetLabel(node.el))
  ).toLowerCase();
  if (label.includes(query)) return true;
  return (node.children ?? []).some((child) => matchesTree(child, query));
}

export function StructurePanel({
  nodes,
  selectedId,
  onSelect,
  onDuplicate,
  onDelete,
  onRename,
  onToggleHidden,
  onMove,
  onContextMenu,
  onClose,
}: StructurePanelProps) {
  const [filter, setFilter] = useState("");
  const [collapsedAll, setCollapsedAll] = useState(false);
  const query = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      query
        ? nodes.filter((node) => matchesTree(node, query))
        : nodes,
    [nodes, query],
  );
  return (
    <aside
      aria-label="Structure"
      className="pointer-events-auto flex max-h-[70vh] w-72 flex-col overflow-hidden rounded-fq-lg border border-border bg-card shadow-fq-lg"
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">Structure</h2>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setCollapsedAll(false)}
            aria-label="Expand all layers"
            title="Expand all"
            className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronsUpDown className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setCollapsedAll(true)}
            aria-label="Collapse all layers"
            title="Collapse all"
            className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronsDownUp className="size-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close structure panel"
            className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
      <div className="shrink-0 border-b border-border p-2">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter layers"
          aria-label="Filter layers"
          className="h-9 w-full rounded-fq-sm border border-border bg-background px-2 text-xs placeholder:text-muted-foreground"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {nodes.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            Once you fill your page with content, this window gives an overview
            of every layer.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">
            No layers match “{filter.trim()}”.
          </p>
        ) : (
          visible.map((node) => (
            <TreeRow
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              onRename={onRename}
              onToggleHidden={onToggleHidden}
              onMove={onMove}
              onContextMenu={onContextMenu}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              forceOpen={query !== "" ? true : collapsedAll ? false : undefined}
            />
          ))
        )}
      </div>
    </aside>
  );
}

type RowProps = Omit<StructurePanelProps, "nodes" | "onClose"> & {
  node: StudioNode;
  depth: number;
  /** When defined (filter active / expand-collapse all), overrides local toggle. */
  forceOpen?: boolean;
};

function TreeRow({
  node,
  depth,
  selectedId,
  onSelect,
  onRename,
  onToggleHidden,
  onMove,
  onContextMenu,
  onDuplicate,
  onDelete,
  forceOpen,
}: RowProps) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const isOpen = forceOpen ?? open;
  const container = isContainerNode(node);
  const label = node.name ?? (container ? "Container" : widgetLabel(node.el));
  const hidden = (node.hiddenOn?.length ?? 0) > 0;

  return (
    <div>
      <div
        draggable
        onContextMenu={(event) => {
          if (!onContextMenu) return;
          event.preventDefault();
          event.stopPropagation();
          onSelect(node.id);
          onContextMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.setData("text/plain", node.id);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const dragId = event.dataTransfer.getData("text/plain");
          if (dragId && dragId !== node.id)
            onMove(dragId, {
              id: node.id,
              position: container ? "inside" : "after",
            });
        }}
        className={cn(
          "flex items-center gap-1 rounded-fq-sm pr-1",
          selectedId === node.id
            ? "bg-accent text-accent-foreground"
            : "hover:bg-muted",
        )}
        style={{ paddingLeft: depth * 12 }}
      >
        {container ? (
          <button
            type="button"
            aria-label={isOpen ? `Collapse ${label}` : `Expand ${label}`}
            aria-expanded={isOpen}
            onClick={() => setOpen(!isOpen)}
            className="grid size-8 place-items-center text-muted-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                isOpen ? "" : "-rotate-90",
              )}
              aria-hidden
            />
          </button>
        ) : (
          <span className="grid size-8 place-items-center text-muted-foreground">
            <LucideIcon name={widgetIcon(node.el)} size={14} />
          </span>
        )}

        {editing ? (
          <input
            autoFocus
            defaultValue={label}
            aria-label={`Rename ${label}`}
            onBlur={(event) => {
              onRename(node.id, event.target.value.trim());
              setEditing(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter")
                (event.target as HTMLInputElement).blur();
              if (event.key === "Escape") setEditing(false);
            }}
            className="min-h-8 flex-1 rounded-fq-sm border border-primary bg-card px-1 text-xs"
          />
        ) : (
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => setEditing(true)}
            className="min-h-9 flex-1 truncate text-left text-xs font-medium"
          >
            {label}
          </button>
        )}

        <button
          type="button"
          onClick={() => onToggleHidden(node.id)}
          aria-pressed={hidden}
          aria-label={hidden ? `Show ${label}` : `Hide ${label}`}
          className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:text-foreground"
        >
          {hidden ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
        </button>
        {onDuplicate && (
          <button
            type="button"
            onClick={() => onDuplicate(node.id)}
            aria-label={`Duplicate ${label}`}
            className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:text-foreground"
          >
            <Copy className="size-3.5" aria-hidden />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            aria-label={`Delete ${label}`}
            className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        )}
      </div>

      {container && isOpen
        ? (node.children ?? []).map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onRename={onRename}
              onToggleHidden={onToggleHidden}
              onMove={onMove}
              onContextMenu={onContextMenu}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              forceOpen={forceOpen}
            />
          ))
        : null}
    </div>
  );
}
