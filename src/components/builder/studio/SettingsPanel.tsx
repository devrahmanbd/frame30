/**
 * Phase 14 — widget settings panel.
 *
 * Replaces the elements list when something is selected: back arrow, element
 * name, three equal-width tabs (`General · Style · Interactions`), a Classes
 * row at the top of Style, and a stack of collapsible sections built from the
 * control schema. Advanced controls live in accordions at the bottom of Style.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, FileText, MousePointerClick, Paintbrush, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { isControlVisible, sectionsForPanelTab, type PanelTab } from "@/lib/studio/controls";
import { widgetLabel } from "@/lib/studio/catalog";
import type { SettingValue, StudioClass, StudioNode } from "@/lib/studio/model";
import type { DeviceKey } from "@/lib/studio/responsive";
import { ControlField } from "./StudioControls";
import { normalizeClassName } from "./ClassManagerDialog";

const TABS: { key: PanelTab; label: string; icon: typeof FileText }[] = [
  { key: "general", label: "General", icon: FileText },
  { key: "style", label: "Style", icon: Paintbrush },
  { key: "interactions", label: "Interactions", icon: MousePointerClick },
];

export type SettingsPanelProps = {
  node: StudioNode;
  device: DeviceKey;
  activeDevices: DeviceKey[];
  onDevice: (device: DeviceKey) => void;
  onChange: (key: string, value: SettingValue) => void;
  onBack: () => void;
  onResetStyles: () => void;
  classes?: StudioClass[];
  onOpenClassManager?: () => void;
};

function classList(node: StudioNode): string[] {
  const raw = typeof node.settings.cssClasses === "string" ? node.settings.cssClasses : "";
  return raw.split(/\s+/).filter(Boolean);
}

function ClassesRow({
  node,
  classes,
  onChange,
  onOpenClassManager,
}: {
  node: StudioNode;
  classes: StudioClass[];
  onChange: (key: string, value: SettingValue) => void;
  onOpenClassManager?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const applied = classList(node);
  const write = (names: string[]) => onChange("cssClasses", names.join(" "));
  const suggestions = classes.filter((item) => !applied.includes(item.name));

  return (
    <section className="border-b border-border bg-muted/30 px-3 py-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold">Classes</h3>
        {onOpenClassManager && (
          <button
            type="button"
            onClick={onOpenClassManager}
            className="rounded-fq-sm border border-border bg-card px-2 py-1 text-[11px] font-medium hover:bg-muted"
          >
            Class Manager
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="rounded-fq-sm border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
          local
        </span>
        {applied.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-fq-sm bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
          >
            .{name}
            <button
              type="button"
              aria-label={`Remove class ${name}`}
              onClick={() => write(applied.filter((entry) => entry !== name))}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <input
        value={draft}
        list={`studio-classes-${node.id}`}
        placeholder="Type class name"
        aria-label="Add a class"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const name = normalizeClassName(draft);
          if (name && !applied.includes(name)) write([...applied, name]);
          setDraft("");
        }}
        className="mt-2 h-9 w-full rounded-fq-sm border border-border bg-card px-2 text-xs"
      />
      <datalist id={`studio-classes-${node.id}`}>
        {suggestions.map((item) => (
          <option key={item.id} value={item.name} />
        ))}
      </datalist>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Styles apply to this element unless a global class is chosen.
      </p>
    </section>
  );
}

export function SettingsPanel({
  node,
  device,
  activeDevices,
  onDevice,
  onChange,
  onBack,
  onResetStyles,
  classes = [],
  onOpenClassManager,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<PanelTab>("general");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const sections = useMemo(() => sectionsForPanelTab(node, tab), [node, tab]);
  const title = node.name ?? widgetLabel(node.el);
  const hasInteraction = Boolean(node.settings.animation);

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex items-center gap-1 border-b border-border px-2 py-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to elements"
          className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </button>
        <h2 className="flex-1 truncate text-sm font-semibold">Edit {title}</h2>
      </div>

      <div role="tablist" aria-label="Element settings" className="flex border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            id={`studio-settings-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="studio-settings-panel"
            onClick={() => setTab(key)}
            className={cn(
              "flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 border-b-2 text-[11px] font-semibold transition-colors",
              tab === key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div id="studio-settings-panel" role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
        {tab === "style" && (
          <ClassesRow
            node={node}
            classes={classes}
            onChange={onChange}
            onOpenClassManager={onOpenClassManager}
          />
        )}

        {tab === "interactions" && !hasInteraction && (
          <div className="border-b border-border p-4 text-center">
            <p className="text-xs font-semibold">Animate elements with Interactions</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Add entrance animations and effects triggered by user interactions such as page load or scroll.
            </p>
            <button
              type="button"
              onClick={() => {
                onChange("animation", "fade-up");
                setOpen((prev) => ({ ...prev, "interactions:Entrance animation": true }));
              }}
              className="mt-3 min-h-9 rounded-fq-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              Create an interaction
            </button>
          </div>
        )}

        {sections.map((section) => {
          const controls = section.controls.filter((control) => isControlVisible(control, node.settings));
          if (controls.length === 0) return null;
          const id = `${tab}:${section.title}`;
          // Sections start closed on Style/Interactions, open on General.
          const expanded = open[id] ?? (tab === "general" && !section.advanced);
          return (
            <section key={id} className="border-b border-border">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen((prev) => ({ ...prev, [id]: !expanded }))}
                className="flex min-h-11 w-full items-center justify-between px-3 text-left text-xs font-semibold"
              >
                <span className="flex items-center gap-2">
                  {section.title}
                  {section.advanced && (
                    <span className="rounded-fq-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Advanced
                    </span>
                  )}
                </span>
                <ChevronDown className={cn("size-4 transition-transform", expanded ? "" : "-rotate-90")} aria-hidden />
              </button>
              {expanded && (
                <div className="flex flex-col gap-4 px-3 pb-4">
                  {controls.map((control) => (
                    <ControlField
                      key={control.key}
                      control={control}
                      settings={node.settings}
                      device={device}
                      activeDevices={activeDevices}
                      onDevice={onDevice}
                      onChange={onChange}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {tab === "style" && (
          <div className="p-3">
            <button
              type="button"
              onClick={onResetStyles}
              className="min-h-10 w-full rounded-fq-md border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
            >
              Reset style
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
