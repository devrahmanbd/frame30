/**
 * Phase 16 — the left column of the menus screen.
 *
 * WordPress stacks collapsible boxes (Pages, Posts, Custom links, Categories),
 * each with a checkbox list and an "Add to menu" button. Same shape here, with
 * a search box because our catalogues can be long.
 */
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { btnGhost, btnPrimary, inputClass } from "@/components/console/kit";
import {
  KIND_LABEL,
  type MenuItemKind,
  type MenuSource,
  searchSources,
} from "@/lib/menus/menu";

const GROUP_ORDER: MenuItemKind[] = ["page", "post", "collection", "product"];

export function MenuSourcePanel({
  sources,
  disabled,
  onAdd,
  onAddCustom,
}: {
  sources: MenuSource[];
  disabled?: boolean;
  onAdd: (picked: MenuSource[]) => void;
  onAddCustom: (input: { label: string; url: string }) => void;
}) {
  const [open, setOpen] = useState<string>("page");
  const groups = useMemo(
    () =>
      GROUP_ORDER.map((kind) => ({
        kind,
        label: `${KIND_LABEL[kind]}s`,
        items: sources.filter((source) => source.kind === kind),
      })).filter((group) => group.items.length > 0),
    [sources],
  );

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <SourceGroupBox
          key={group.kind}
          id={group.kind}
          label={group.label}
          items={group.items}
          expanded={open === group.kind}
          disabled={disabled}
          onToggle={() => setOpen((current) => (current === group.kind ? "" : group.kind))}
          onAdd={onAdd}
        />
      ))}
      <CustomLinkBox
        expanded={open === "custom"}
        disabled={disabled}
        onToggle={() => setOpen((current) => (current === "custom" ? "" : "custom"))}
        onAdd={onAddCustom}
      />
    </div>
  );
}

function Box({
  id,
  label,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-fq-md border border-border bg-card">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`menu-source-${id}`}
          onClick={onToggle}
          className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm font-semibold transition-colors hover:bg-muted/60"
        >
          {label}
          <ChevronDown
            aria-hidden
            className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")}
          />
        </button>
      </h3>
      <div id={`menu-source-${id}`} hidden={!expanded} className="border-t border-border p-3">
        {children}
      </div>
    </section>
  );
}

function SourceGroupBox({
  id,
  label,
  items,
  expanded,
  disabled,
  onToggle,
  onAdd,
}: {
  id: string;
  label: string;
  items: MenuSource[];
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onAdd: (picked: MenuSource[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const shown = useMemo(() => searchSources(items, query), [items, query]);

  return (
    <Box id={id} label={label} expanded={expanded} onToggle={onToggle}>
      <label className="mb-2 block">
        <span className="sr-only">Search {label.toLowerCase()}</span>
        <input
          type="search"
          className={inputClass}
          placeholder={`Search ${label.toLowerCase()}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {shown.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">Nothing matches “{query}”.</p>
      ) : (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-1">
          {shown.map((source) => {
            const checked = picked.includes(source.id);
            return (
              <li key={source.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-fq-sm px-2 text-sm transition-colors hover:bg-muted/60">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0"
                    checked={checked}
                    onChange={() =>
                      setPicked((current) =>
                        current.includes(source.id)
                          ? current.filter((value) => value !== source.id)
                          : [...current, source.id],
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{source.label}</span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">{source.url}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className={btnGhost}
          disabled={shown.length === 0}
          onClick={() =>
            setPicked((current) =>
              current.length === shown.length ? [] : shown.map((source) => source.id),
            )
          }
        >
          {picked.length === shown.length && shown.length > 0 ? "Deselect all" : "Select all"}
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={disabled || picked.length === 0}
          onClick={() => {
            onAdd(items.filter((source) => picked.includes(source.id)));
            setPicked([]);
          }}
        >
          Add to menu
        </button>
      </div>
    </Box>
  );
}

function CustomLinkBox({
  expanded,
  disabled,
  onToggle,
  onAdd,
}: {
  expanded: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onAdd: (input: { label: string; url: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("https://");

  return (
    <Box id="custom" label="Custom links" expanded={expanded} onToggle={onToggle}>
      <div className="space-y-2">
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Link text
          </span>
          <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</span>
          <input className={inputClass} value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <div className="flex justify-end">
          <button
            type="button"
            className={btnPrimary}
            disabled={disabled || label.trim().length === 0 || url.trim().length === 0}
            onClick={() => {
              onAdd({ label: label.trim(), url: url.trim() });
              setLabel("");
              setUrl("https://");
            }}
          >
            Add to menu
          </button>
        </div>
      </div>
    </Box>
  );
}
