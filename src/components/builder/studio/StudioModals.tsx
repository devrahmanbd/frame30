/**
 * Phase 14 — modals and side panels.
 *
 * Layout picker (Flexbox · Grid + the 12 presets), templates library,
 * page settings, history (Actions | Revisions), finder and the shortcut sheet.
 */
import { useMemo, useState } from "react";
import { Search, Star, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { LAYOUT_PRESETS, type ContainerLayout, type LayoutPreset } from "@/lib/studio/containers";
import {
  TEMPLATE_CATEGORIES,
  filterTemplates,
  type StudioTemplate,
  type TemplateCategory,
  type TemplateKind,
} from "@/lib/studio/templates";
import type { PageSettings } from "@/lib/studio/model";
import { historyList, historyLabel, revisionLabel, type HistoryState, type RevisionEntry } from "@/lib/studio/history";
import { STUDIO_SHORTCUTS, formatStudioShortcut, type StudioPlatform } from "@/lib/studio/shortcuts";
import { BREAKPOINT_DEFS, type DeviceKey } from "@/lib/studio/responsive";

/* ------------------------------------------------------------------ */
/* Layout picker                                                       */
/* ------------------------------------------------------------------ */

export function LayoutPickerDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (preset: LayoutPreset) => void;
}) {
  const [layout, setLayout] = useState<ContainerLayout>("flex");
  const presets = LAYOUT_PRESETS.filter((preset) => preset.layout === layout || layout === "flex");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Which layout would you like to use?</DialogTitle>
          <DialogDescription>Pick a container type, then a starting structure.</DialogDescription>
        </DialogHeader>

        <div role="group" aria-label="Container type" className="flex gap-2">
          {(["flex", "grid"] as ContainerLayout[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={layout === key}
              onClick={() => setLayout(key)}
              className={cn(
                "min-h-11 flex-1 rounded-fq-md border text-sm font-medium capitalize",
                layout === key ? "border-primary bg-accent text-accent-foreground" : "border-border",
              )}
            >
              {key === "flex" ? "Flexbox" : "Grid"}
            </button>
          ))}
        </div>

        <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pt-2 sm:grid-cols-4">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => {
                onPick({ ...preset, layout });
                onOpenChange(false);
              }}
              title={preset.label}
              className="flex min-h-20 flex-col gap-1 rounded-fq-md border border-border p-2 transition-colors hover:border-primary"
            >
              <span className="flex flex-1 flex-col gap-1" aria-hidden>
                {preset.rows.map((row, rowIndex) => (
                  <span key={rowIndex} className="flex flex-1 gap-1">
                    {row.map((basis, cellIndex) => (
                      <span key={cellIndex} className="rounded-[3px] bg-muted" style={{ flex: basis }} />
                    ))}
                  </span>
                ))}
              </span>
              <span className="text-[10px] text-muted-foreground">{preset.label}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Templates library                                                   */
/* ------------------------------------------------------------------ */

export function TemplatesDialog({
  open,
  onOpenChange,
  templates,
  onInsert,
  onToggleFavourite,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: StudioTemplate[];
  onInsert: (template: StudioTemplate) => void;
  onToggleFavourite: (id: string) => void;
  onImport: (json: string) => void;
}) {
  const [kind, setKind] = useState<TemplateKind>("block");
  const [category, setCategory] = useState<TemplateCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const list = useMemo(
    () => filterTemplates(templates, { kind, category, query, favouritesOnly }),
    [templates, kind, category, query, favouritesOnly],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Templates library</DialogTitle>
          <DialogDescription>Insert a ready-made block or start from a full page.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Template kind" className="flex rounded-fq-md bg-muted p-1">
            {([
              ["block", "Blocks"],
              ["page", "Pages"],
              ["mine", "My templates"],
            ] as [TemplateKind, string][]).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={kind === key}
                onClick={() => setKind(key)}
                className={cn(
                  "min-h-9 rounded-fq-sm px-3 text-xs font-semibold",
                  kind === key ? "bg-card shadow-fq-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search templates"
              aria-label="Search templates"
              className="pl-9"
            />
          </div>

          <label className="flex min-h-11 items-center gap-2 text-xs">
            <Switch checked={favouritesOnly} onCheckedChange={setFavouritesOnly} aria-label="Favourites only" />
            Favourites
          </label>

          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-fq-md border border-border px-3 text-xs font-medium">
            <Upload className="size-4" aria-hidden />
            Import
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) onImport(await file.text());
                event.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="flex min-h-0 gap-4">
          <nav aria-label="Template categories" className="hidden w-40 shrink-0 flex-col gap-0.5 overflow-y-auto sm:flex">
            {(["all", ...TEMPLATE_CATEGORIES] as (TemplateCategory | "all")[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-current={category === key ? "true" : undefined}
                onClick={() => setCategory(key)}
                className={cn(
                  "min-h-9 rounded-fq-sm px-2 text-left text-xs capitalize",
                  category === key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {key}
              </button>
            ))}
          </nav>

          <div className="grid max-h-[50vh] flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {list.length === 0 && <p className="text-sm text-muted-foreground">No template here yet.</p>}
            {list.map((template) => (
              <article key={template.id} className="flex flex-col overflow-hidden rounded-fq-md border border-border">
                <div className="flex h-24 items-center justify-center bg-muted text-[11px] uppercase tracking-wide text-muted-foreground">
                  {template.category}
                </div>
                <div className="flex items-center gap-1 p-2">
                  <span className="flex-1 truncate text-xs font-medium">{template.name}</span>
                  <button
                    type="button"
                    aria-label={`${template.favourite ? "Remove" : "Add"} ${template.name} ${template.favourite ? "from" : "to"} favourites`}
                    aria-pressed={Boolean(template.favourite)}
                    onClick={() => onToggleFavourite(template.id)}
                    className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:text-warning"
                  >
                    <Star className={cn("size-4", template.favourite && "fill-warning text-warning")} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onInsert(template);
                      onOpenChange(false);
                    }}
                    className="min-h-9 rounded-fq-sm bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    Insert
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Page settings                                                       */
/* ------------------------------------------------------------------ */

export function PageSettingsDialog({
  open,
  onOpenChange,
  page,
  breakpoints,
  onChange,
  onBreakpoints,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: PageSettings;
  breakpoints: DeviceKey[];
  onChange: (patch: Partial<PageSettings>) => void;
  onBreakpoints: (next: DeviceKey[]) => void;
}) {
  const [tab, setTab] = useState<"settings" | "style" | "advanced">("settings");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Page settings</DialogTitle>
          <DialogDescription>Controls that apply to this page only.</DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="Page settings tabs" className="flex rounded-fq-md bg-muted p-1">
          {(["settings", "style", "advanced"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "min-h-9 flex-1 rounded-fq-sm text-xs font-semibold capitalize",
                tab === key ? "bg-card shadow-fq-sm" : "text-muted-foreground",
              )}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pt-2">
          {tab === "settings" && (
            <>
              <Field label="Title">
                <Input value={page.title} onChange={(event) => onChange({ title: event.target.value })} />
              </Field>
              <Field label="Status">
                <select
                  value={page.status}
                  onChange={(event) => onChange({ status: event.target.value as PageSettings["status"] })}
                  className="min-h-11 w-full rounded-fq-md border border-border bg-card px-3 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="private">Private</option>
                </select>
              </Field>
              <Field label="Featured image URL">
                <Input
                  value={page.featuredImage ?? ""}
                  onChange={(event) => onChange({ featuredImage: event.target.value })}
                  placeholder="https://…"
                />
              </Field>
              <Field label="Order">
                <Input
                  type="number"
                  value={page.order ?? 0}
                  onChange={(event) => onChange({ order: Number(event.target.value) })}
                />
              </Field>
              <Toggle
                label="Allow comments"
                checked={Boolean(page.allowComments)}
                onChange={(next) => onChange({ allowComments: next })}
              />
              <Toggle label="Hide title" checked={Boolean(page.hideTitle)} onChange={(next) => onChange({ hideTitle: next })} />
              <Field label="Page layout">
                <select
                  value={page.layout}
                  onChange={(event) => onChange({ layout: event.target.value as PageSettings["layout"] })}
                  className="min-h-11 w-full rounded-fq-md border border-border bg-card px-3 text-sm"
                >
                  <option value="default">Default</option>
                  <option value="canvas">Canvas</option>
                  <option value="full">Full width</option>
                  <option value="theme">Theme</option>
                  <option value="no-title">No title</option>
                </select>
              </Field>
            </>
          )}

          {tab === "style" && (
            <>
              <Field label="Body background">
                <Input
                  value={page.bodyBackground ?? ""}
                  onChange={(event) => onChange({ bodyBackground: event.target.value })}
                  placeholder="var(--color-background)"
                />
              </Field>
              <Field label="Body margin">
                <Input
                  type="number"
                  value={page.bodyMargin ?? 0}
                  onChange={(event) => onChange({ bodyMargin: Number(event.target.value) })}
                />
              </Field>
              <Field label="Body padding">
                <Input
                  type="number"
                  value={page.bodyPadding ?? 0}
                  onChange={(event) => onChange({ bodyPadding: Number(event.target.value) })}
                />
              </Field>
            </>
          )}

          {tab === "advanced" && (
            <>
              <Field label="Custom CSS">
                <Textarea
                  rows={6}
                  spellCheck={false}
                  className="font-mono text-xs"
                  value={page.customCss ?? ""}
                  onChange={(event) => onChange({ customCss: event.target.value })}
                />
              </Field>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium text-muted-foreground">Active breakpoints</legend>
                {BREAKPOINT_DEFS.map((def) => (
                  <label key={def.key} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                    <span>
                      {def.label}{" "}
                      <span className="text-xs text-muted-foreground">
                        {def.base ? "base" : `${def.direction === "max" ? "up to" : "from"} ${def.edge}px`}
                      </span>
                    </span>
                    <Switch
                      checked={def.base || breakpoints.includes(def.key)}
                      disabled={def.base}
                      aria-label={`${def.label} breakpoint`}
                      onCheckedChange={(checked) =>
                        onBreakpoints(
                          checked ? [...breakpoints, def.key] : breakpoints.filter((key) => key !== def.key),
                        )
                      }
                    />
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export function HistoryDialog({
  open,
  onOpenChange,
  history,
  revisions,
  onJump,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: HistoryState;
  revisions: RevisionEntry[];
  onJump: (index: number) => void;
  onRestore: (id: string) => void;
}) {
  const [tab, setTab] = useState<"actions" | "revisions">("actions");
  const entries = historyList(history);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>History</DialogTitle>
          <DialogDescription>Step back through edits, or restore a saved revision.</DialogDescription>
        </DialogHeader>

        <div role="tablist" aria-label="History tabs" className="flex rounded-fq-md bg-muted p-1">
          {(["actions", "revisions"] as const).map((key) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={cn(
                "min-h-9 flex-1 rounded-fq-sm text-xs font-semibold capitalize",
                tab === key ? "bg-card shadow-fq-sm" : "text-muted-foreground",
              )}
            >
              {key}
            </button>
          ))}
        </div>

        <ul className="max-h-80 overflow-y-auto">
          {tab === "actions"
            ? entries.map(({ entry, index, current }) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => onJump(index)}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-3 rounded-fq-sm px-3 text-left text-sm",
                      current ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span>{historyLabel(entry)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                </li>
              ))
            : revisions.map((revision) => (
                <li key={revision.id}>
                  <button
                    type="button"
                    onClick={() => onRestore(revision.id)}
                    className="min-h-11 w-full rounded-fq-sm px-3 text-left text-sm hover:bg-muted"
                  >
                    {revisionLabel(revision)}
                  </button>
                </li>
              ))}
          {tab === "revisions" && revisions.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No saved revision yet.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Finder + shortcuts                                                  */
/* ------------------------------------------------------------------ */

export function FinderDialog({
  open,
  onOpenChange,
  items,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: { id: string; label: string; hint?: string }[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Finder</DialogTitle>
          <DialogDescription>Jump to any element or editor action.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Type to search…"
          aria-label="Search the editor"
        />
        <ul className="max-h-72 overflow-y-auto">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(item.id);
                  onOpenChange(false);
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-fq-sm px-3 text-left text-sm hover:bg-muted"
              >
                <span>{item.label}</span>
                {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-6 text-sm text-muted-foreground">Nothing matches.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  platform,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: StudioPlatform;
}) {
  const groups = ["Actions", "Editing", "Go to"] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Everything the editor responds to.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto sm:grid-cols-2">
          {groups.map((group) => (
            <section key={group}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3>
              <ul className="flex flex-col gap-1">
                {STUDIO_SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                  <li key={shortcut.id} className="flex items-center justify-between gap-3 text-sm">
                    <span>{shortcut.label}</span>
                    <kbd className="rounded-fq-sm border border-border px-1.5 py-0.5 text-xs">
                      {formatStudioShortcut(shortcut, platform)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
