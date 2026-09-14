/**
 * Phase 14 — canvas.
 *
 * Renders the document at the current breakpoint width, with Elementor's
 * direct-manipulation chrome: hover/selected outlines, container handle bars,
 * widget edge handles, a 4px drop indicator, and the empty-container prompt.
 */
import { useRef, useState, type DragEvent } from "react";
import { Copy, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isContainerNode, type StudioDoc, type StudioNode } from "@/lib/studio/model";
import { widgetLabel } from "@/lib/studio/catalog";
import { dropPositionFor, type DropPosition, type DropTarget } from "@/lib/studio/tree";
import { animationProps, containerInnerCss, isHiddenOn, nodeCss, selfCss } from "@/lib/studio/styles";
import type { DeviceKey } from "@/lib/studio/responsive";
import { StudioWidget } from "./renderers";

export type CanvasProps = {
  doc: StudioDoc;
  device: DeviceKey;
  selectedId: string | null;
  hideHandles?: boolean;
  onSelect: (id: string | null) => void;
  onDrop: (target: DropTarget) => void;
  onDragNode: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddInside: (id: string) => void;
  onAddRoot: () => void;
  onContextMenu: (id: string, position: { x: number; y: number }) => void;
  onInlineEdit: (id: string, text: string) => void;
};

const INLINE_EDITABLE = new Set(["heading", "text", "button"]);

export function StudioCanvas(props: CanvasProps) {
  const { doc, device, onAddRoot } = props;
  const [indicator, setIndicator] = useState<{ id: string; position: DropPosition } | null>(null);

  return (
    <div
      className="fq-studio-canvas mx-auto min-h-full w-full bg-card text-card-foreground"
      onClick={() => props.onSelect(null)}
    >
      {doc.root.length === 0 ? (
        <EmptyCanvas onAdd={onAddRoot} />
      ) : (
        doc.root.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            depth={0}
            indicator={indicator}
            setIndicator={setIndicator}
            {...props}
          />
        ))
      )}
      {doc.root.length > 0 && (
        <div className="flex justify-center py-8">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAddRoot();
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-4" aria-hidden /> Add container
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyCanvas({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-8">
      <div className="flex flex-col items-center gap-4 rounded-fq-lg border border-dashed border-border px-8 py-12 text-center">
        <p className="text-sm font-medium">Start building your page</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Add a container, then drag widgets from the left panel into it.
        </p>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onAdd();
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          <Plus className="size-4" aria-hidden /> Add container
        </button>
      </div>
    </div>
  );
}

type NodeViewProps = CanvasProps & {
  node: StudioNode;
  depth: number;
  indicator: { id: string; position: DropPosition } | null;
  setIndicator: (next: { id: string; position: DropPosition } | null) => void;
};

function NodeView(props: NodeViewProps) {
  const { node, device, selectedId, hideHandles, indicator, setIndicator } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const container = isContainerNode(node);
  const selected = selectedId === node.id;

  if (isHiddenOn(node, device)) return null;

  const anim = animationProps(node);
  const style = { ...nodeCss(node, device), ...selfCss(node, device), ...(anim.style ?? {}) };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const position = dropPositionFor(event.clientY, { top: rect.top, height: rect.height }, container);
    setIndicator({ id: node.id, position });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const position = indicator?.id === node.id ? indicator.position : container ? "inside" : "after";
    setIndicator(null);
    props.onDrop({ id: node.id, position });
  };

  const showIndicator = indicator?.id === node.id ? indicator.position : null;

  return (
    <div
      ref={ref}
      data-node-id={node.id}
      data-studio-el={node.el}
      draggable={!hideHandles}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.id);
        props.onDragNode(node.id);
      }}
      onDragOver={onDragOver}
      onDragLeave={() => setIndicator(null)}
      onDrop={onDrop}
      onMouseEnter={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        props.onSelect(node.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onSelect(node.id);
        props.onContextMenu(node.id, { x: event.clientX, y: event.clientY });
      }}
      className={cn(
        "fq-studio-node relative",
        !hideHandles && hovered && !selected && "outline outline-1 outline-dashed outline-primary/60",
        !hideHandles && selected && "outline outline-2 outline-primary",
        anim.className,
      )}
      style={style}
    >
      {showIndicator === "before" && <DropLine placement="top" />}
      {showIndicator === "after" && <DropLine placement="bottom" />}
      {showIndicator === "inside" && (
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-fq-sm outline outline-2 outline-primary" />
      )}

      {!hideHandles && (hovered || selected) && (
        <Handles {...props} container={container} />
      )}

      {container ? (
        <div style={containerInnerCss(node, device)}>
          {(node.children ?? []).length === 0 ? (
            <EmptyContainer onAdd={() => props.onAddInside(node.id)} />
          ) : (
            (node.children ?? []).map((child) => (
              <NodeView key={child.id} {...props} node={child} depth={props.depth + 1} />
            ))
          )}
        </div>
      ) : (
        <InlineWidget {...props} />
      )}
    </div>
  );
}

function InlineWidget(props: NodeViewProps) {
  const { node, device } = props;
  const editable = INLINE_EDITABLE.has(node.el);
  const key = node.el === "button" ? "label" : "text";
  if (!editable) return <StudioWidget node={node} device={device} editing />;
  return (
    <div
      suppressContentEditableWarning
      contentEditable={props.selectedId === node.id}
      onBlur={(event) => props.onInlineEdit(node.id, event.currentTarget.textContent ?? "")}
      className="outline-none"
      role={props.selectedId === node.id ? "textbox" : undefined}
      aria-label={props.selectedId === node.id ? `Edit ${widgetLabel(node.el)} text` : undefined}
      tabIndex={props.selectedId === node.id ? 0 : undefined}
      data-inline-key={key}
    >
      <StudioWidget node={node} device={device} editing />
    </div>
  );
}

function DropLine({ placement }: { placement: "top" | "bottom" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 h-1 rounded-full bg-primary",
        placement === "top" ? "-top-0.5" : "-bottom-0.5",
      )}
    />
  );
}

function Handles({
  node,
  container,
  onDuplicate,
  onDelete,
  onAddInside,
  onSelect,
}: NodeViewProps & { container: boolean }) {
  const label = container ? (node.name ?? "Container") : (node.name ?? widgetLabel(node.el));
  return (
    <div
      className={cn(
        "absolute z-30 flex items-center gap-0.5 rounded-fq-sm bg-primary px-1 py-0.5 text-primary-foreground shadow-fq-md",
        container ? "-top-3.5 left-1/2 -translate-x-1/2" : "-top-3 right-1",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="grid size-6 place-items-center" aria-hidden>
        <GripVertical className="size-3.5" />
      </span>
      <span className="max-w-28 truncate px-1 text-[11px] font-semibold">{label}</span>
      {container ? (
        <HandleButton label={`Add element inside ${label}`} onClick={() => onAddInside(node.id)}>
          <Plus className="size-3.5" aria-hidden />
        </HandleButton>
      ) : (
        <HandleButton label={`Edit ${label}`} onClick={() => onSelect(node.id)}>
          <Pencil className="size-3.5" aria-hidden />
        </HandleButton>
      )}
      <HandleButton label={`Duplicate ${label}`} onClick={() => onDuplicate(node.id)}>
        <Copy className="size-3.5" aria-hidden />
      </HandleButton>
      <HandleButton label={`Delete ${label}`} onClick={() => onDelete(node.id)}>
        <Trash2 className="size-3.5" aria-hidden />
      </HandleButton>
    </div>
  );
}

function HandleButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="grid size-6 place-items-center rounded-fq-sm transition-colors hover:bg-primary-foreground/20"
    >
      {children}
    </button>
  );
}

function EmptyContainer({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="grid w-full place-items-center gap-3 rounded-fq-md border border-dashed border-border px-4 py-10 text-center">
      <div className="flex items-center gap-2">
        <RoundButton label="Add widget" onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
        </RoundButton>
      </div>
      <p className="text-xs text-muted-foreground">Drag widget here</p>
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="grid size-11 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </button>
  );
}
