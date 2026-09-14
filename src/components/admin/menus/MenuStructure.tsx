/**
 * Phase 16 — the menu structure column.
 *
 * WordPress uses mouse drag only, which is unusable on a phone and invisible to
 * a keyboard. We keep drag for the mouse and give every row explicit
 * Up / Down / Indent / Outdent buttons that do the same thing, so the ordering
 * is fully reachable without a pointer.
 */
import { useState, type DragEvent } from "react";
import { ChevronDown, ChevronsLeft, ChevronsRight, ChevronUp, GripVertical, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { btnGhost, inputClass } from "@/components/console/kit";
import {
  KIND_LABEL,
  type MenuDropPosition,
  type MenuItem,
  type MenuIssue,
  canIndent,
  canOutdent,
  flatten,
} from "@/lib/menus/menu";

export function MenuStructure({
  items,
  issues,
  onChange,
  onMove,
  onRemove,
  onVertical,
  onIndent,
  onOutdent,
}: {
  items: MenuItem[];
  issues: MenuIssue[];
  onChange: (id: string, patch: Partial<MenuItem>) => void;
  onMove: (id: string, targetId: string, position: MenuDropPosition) => void;
  onRemove: (id: string) => void;
  onVertical: (id: string, step: 1 | -1) => void;
  onIndent: (id: string) => void;
  onOutdent: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const rows = flatten(items);

  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    setOverId(null);
    if (!dragId || dragId === targetId) return;
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const ratio = (event.clientY - box.top) / box.height;
    const position: MenuDropPosition = ratio < 0.3 ? "before" : ratio > 0.7 ? "after" : "child";
    onMove(dragId, targetId, position);
    setDragId(null);
  };

  return (
    <ol className="space-y-2" aria-label="Menu structure">
      {rows.map((row, index) => {
        const expanded = openId === row.id;
        const rowIssues = issues.filter((issue) => issue.id === row.id);
        return (
          <li
            key={row.id}
            style={{ marginInlineStart: `${row.depth * 24}px` }}
            draggable
            onDragStart={() => setDragId(row.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOverId(row.id);
            }}
            onDragLeave={() => setOverId((current) => (current === row.id ? null : current))}
            onDrop={(event) => onDrop(event, row.id)}
            className={cn(
              "overflow-hidden rounded-fq-md border bg-card transition-shadow",
              rowIssues.length > 0 ? "border-destructive" : "border-border",
              overId === row.id && "shadow-fq-md ring-2 ring-primary/50",
              dragId === row.id && "opacity-60",
            )}
          >
            <div className="flex items-center gap-1 px-2 py-1.5">
              <span
                aria-hidden
                className="grid size-8 shrink-0 cursor-grab place-items-center text-muted-foreground"
              >
                <GripVertical className="size-4" />
              </span>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`menu-item-${row.id}`}
                onClick={() => setOpenId(expanded ? null : row.id)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-fq-sm px-1 text-left"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.label || "Untitled link"}
                </span>
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {KIND_LABEL[row.kind]}
                </span>
                <ChevronDown
                  aria-hidden
                  className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
                />
              </button>
              <RowButton
                label={`Move ${row.label || "item"} up`}
                disabled={index === 0}
                onClick={() => onVertical(row.id, -1)}
              >
                <ChevronUp className="size-4" aria-hidden />
              </RowButton>
              <RowButton
                label={`Move ${row.label || "item"} down`}
                disabled={index === rows.length - 1}
                onClick={() => onVertical(row.id, 1)}
              >
                <ChevronDown className="size-4" aria-hidden />
              </RowButton>
              <RowButton
                label={`Outdent ${row.label || "item"}`}
                disabled={!canOutdent(items, row.id)}
                onClick={() => onOutdent(row.id)}
              >
                <ChevronsLeft className="size-4" aria-hidden />
              </RowButton>
              <RowButton
                label={`Indent ${row.label || "item"}`}
                disabled={!canIndent(items, row.id)}
                onClick={() => onIndent(row.id)}
              >
                <ChevronsRight className="size-4" aria-hidden />
              </RowButton>
            </div>

            <div id={`menu-item-${row.id}`} hidden={!expanded} className="border-t border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Navigation label
                  </span>
                  <input
                    className={inputClass}
                    value={row.label}
                    onChange={(event) => onChange(row.id, { label: event.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Address
                  </span>
                  <input
                    className={inputClass}
                    value={row.url}
                    onChange={(event) => onChange(row.id, { url: event.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Title attribute
                  </span>
                  <input
                    className={inputClass}
                    value={row.titleAttr}
                    onChange={(event) => onChange(row.id, { titleAttr: event.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    CSS classes
                  </span>
                  <input
                    className={inputClass}
                    value={row.cssClass}
                    onChange={(event) => onChange(row.id, { cssClass: event.target.value })}
                  />
                </label>
              </div>

              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={row.newTab}
                  onChange={(event) => onChange(row.id, { newTab: event.target.checked })}
                />
                Open in a new tab
              </label>

              {rowIssues.length > 0 && (
                <ul role="alert" className="mt-2 space-y-1 text-xs text-destructive">
                  {rowIssues.map((issue) => (
                    <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
                  ))}
                </ul>
              )}

              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center gap-1 rounded-fq-md px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  onClick={() => onRemove(row.id)}
                >
                  <Trash2 className="size-4" aria-hidden /> Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
      {rows.length === 0 && (
        <li className="rounded-fq-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Add pages, posts or custom links from the left to start building this menu.
        </li>
      )}
    </ol>
  );
}

function RowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        btnGhost,
        "grid size-11 shrink-0 place-items-center px-0 text-muted-foreground disabled:opacity-35",
      )}
    >
      {children}
    </button>
  );
}
