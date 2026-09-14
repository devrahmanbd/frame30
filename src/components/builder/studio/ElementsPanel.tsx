/**
 * Phase 14 — left panel.
 *
 * `Widgets | Components | Globals` tabs, a search field, and collapsible
 * categories of 2-up cards. Cards are draggable onto the canvas and clickable
 * to append into the current selection.
 */
import { useMemo, useState } from "react";
import { ChevronDown, Lock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  CATEGORY_LABEL,
  WIDGETS,
  groupWidgets,
  searchWidgets,
  type WidgetDef,
} from "@/lib/studio/catalog";
import { LucideIcon } from "./renderers";

export type ElementsPanelProps = {
  onAdd: (key: string) => void;
  onDragWidget: (key: string) => void;
  savedBlocks: { id: string; name: string }[];
  onInsertSaved: (id: string) => void;
  globals: { id: string; name: string }[];
  onInsertGlobal: (id: string) => void;
};

type Tab = "widgets" | "components" | "globals";

export function ElementsPanel(props: ElementsPanelProps) {
  const [tab, setTab] = useState<Tab>("widgets");
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => groupWidgets(searchWidgets(query, WIDGETS)), [query]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-semibold">Elements</h2>
      </div>

      <div role="tablist" aria-label="Element sources" className="flex border-b border-border">
        {(["widgets", "components", "globals"] as Tab[]).map((key) => (
          <button
            key={key}
            role="tab"
            id={`studio-elements-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`studio-elements-panel-${key}`}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-11 flex-1 border-b-2 text-xs font-semibold capitalize transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {key}
          </button>
        ))}
      </div>

      {tab === "widgets" && (
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search widget…"
              aria-label="Search widgets"
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "widgets" && (
          <div
            role="tabpanel"
            id="studio-elements-panel-widgets"
            aria-labelledby="studio-elements-tab-widgets"
            className="flex flex-col gap-4"
          >
            {groups.length === 0 && (
              <p className="px-1 text-xs text-muted-foreground">No widget matches “{query}”.</p>
            )}
            {groups.map((group) => {
              const open = !closed[group.category];
              return (
                <section key={group.category}>
                  <button
                    type="button"
                    onClick={() => setClosed((prev) => ({ ...prev, [group.category]: open }))}
                    aria-expanded={open}
                    className="flex min-h-9 w-full items-center justify-between rounded-fq-sm px-1 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    {CATEGORY_LABEL[group.category]}
                    <ChevronDown className={cn("size-4 transition-transform", open ? "" : "-rotate-90")} aria-hidden />
                  </button>
                  {open && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {group.items.map((widget) => (
                        <WidgetCard key={widget.key} widget={widget} {...props} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {tab === "components" && (
          <div
            role="tabpanel"
            id="studio-elements-panel-components"
            aria-labelledby="studio-elements-tab-components"
            className="flex flex-col gap-2"
          >
            {props.savedBlocks.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Save any container as a component and it appears here, ready to reuse.
              </p>
            ) : (
              props.savedBlocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => props.onInsertSaved(block.id)}
                  className="min-h-11 rounded-fq-md border border-border px-3 text-left text-sm hover:border-primary"
                >
                  {block.name}
                </button>
              ))
            )}
          </div>
        )}

        {tab === "globals" && (
          <div
            role="tabpanel"
            id="studio-elements-panel-globals"
            aria-labelledby="studio-elements-tab-globals"
            className="flex flex-col gap-2"
          >
            {props.globals.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Global blocks stay in sync everywhere they are placed. Create one from a container’s menu.
              </p>
            ) : (
              props.globals.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  onClick={() => props.onInsertGlobal(block.id)}
                  className="min-h-11 rounded-fq-md border border-border px-3 text-left text-sm hover:border-primary"
                >
                  {block.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WidgetCard({
  widget,
  onAdd,
  onDragWidget,
}: { widget: WidgetDef } & Pick<ElementsPanelProps, "onAdd" | "onDragWidget">) {
  return (
    <button
      type="button"
      draggable={!widget.locked}
      disabled={widget.locked}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-fq-widget", widget.key);
        event.dataTransfer.setData("text/plain", `widget:${widget.key}`);
        onDragWidget(widget.key);
      }}
      onClick={() => onAdd(widget.key)}
      title={widget.locked ? `${widget.label} — connect your storefront to use this` : widget.label}
      className={cn(
        "relative flex h-22 min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-fq-md border border-border bg-card px-1 text-center transition-colors",
        widget.locked
          ? "cursor-not-allowed opacity-50"
          : "hover:border-primary hover:bg-accent/40 focus-visible:border-primary",
      )}
    >
      <LucideIcon name={widget.icon} size={24} className="text-muted-foreground" />
      <span className="line-clamp-2 text-[12px] font-medium leading-tight">{widget.label}</span>
      {widget.locked && <Lock className="absolute right-1.5 top-1.5 size-3 text-muted-foreground" aria-hidden />}
    </button>
  );
}
