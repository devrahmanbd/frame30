/**
 * Phase 14 — widget settings panel.
 *
 * Replaces the elements list when something is selected: back arrow, element
 * name, three equal-width tabs (`General · Style · Interactions`), a Classes
 * row at the top of Style, and a stack of collapsible sections built from the
 * control schema. Advanced controls live in accordions at the bottom of Style.
 *
 * Frame30 — schema swap-in: when the selected node is an extension node whose
 * widget resolves (threaded `registry` first, shared singleton otherwise) to a
 * non-empty `propsSchema` with at least one renderable field, the legacy
 * tabbed panel is replaced by generated controls (`SchemaControls`,
 * vocabulary reused — never reinvented). Every edit is validated with the
 * shared `validateProps` value layer before it reaches the existing
 * `onChange(key, value)` node-update seam, so hostile values are neutralized
 * and never stored raw. Empty-schema / unknown widgets keep the legacy panel
 * byte-identical.
 */
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  FileText,
  MousePointerClick,
  Paintbrush,
  X,
} from "@/components/icons/tabler";
import { cn } from "@/lib/utils";
import {
  isControlVisible,
  sectionsForPanelTab,
  type PanelTab,
} from "@/lib/studio/controls";
import { widgetLabel } from "@/lib/studio/catalog";
import type { SettingValue, StudioClass, StudioNode } from "@/lib/studio/model";
import type { DeviceKey } from "@/lib/studio/responsive";
import { ControlField } from "./StudioControls";
import { normalizeClassName } from "./ClassManagerDialog";
import { SchemaControls } from "../SchemaControls";
import { resolveInspectorSchema } from "@/lib/widget-presentation";
import {
  controlStatus,
  defaultsFor,
  fieldsOf,
  validateProps,
  type PropField,
  type PropSchema,
  type WidgetProps,
} from "@/lib/widget-props";
import type { UnifiedRegistry } from "@/lib/unified-widget-registry";
import { ownerForWidgetKey } from "@/lib/builder-ast";

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
  /**
   * Frame30 one-registry — route-threaded authorized registry. When provided,
   * schema resolution reads it (parity-tested against the singleton path via
   * `resolveInspectorSchema`); absent keeps the legacy singleton read, so the
   * existing `StudioBuilder` call-site (which passes no registry) is
   * untouched. Read-only: the panel never registers, enables, or mutates.
   */
  registry?: UnifiedRegistry | null;
};

function classList(node: StudioNode): string[] {
  const raw =
    typeof node.settings.cssClasses === "string"
      ? node.settings.cssClasses
      : "";
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

/* ---------------------------------------------------------------------------
 * Frame30 schema path — pure seams (unit-tested, no DOM needed).
 *
 * Everything a third-party widget needs renders from its def's `propsSchema`:
 * no per-widget core changes, no new plumbing. Writes flow exclusively
 * through the existing per-instance `onChange(key, value)` seam — global
 * plugin settings are unreachable from this path by construction (only
 * schema-known keys plus the `bp` responsive-layer key are ever emitted).
 * `showWhen` gates rendering only: hidden values are still validated by the
 * shared validator and preserved in storage.
 */

/** Extension-envelope keys: carried in settings, never written by edits. */
const SCHEMA_ENVELOPE_KEYS = new Set([
  "pluginKey",
  "extensionInstanceId",
  "extensionApi",
  "extensionVersion",
]);

const DEVICE_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export type StudioSchemaResolution =
  | { status: "legacy" }
  | {
      status: "schema";
      widgetId: string;
      label: string;
      /** Static registry metadata line (`namespace · category · vX`). */
      meta: string;
      schema: PropSchema;
    };

/**
 * True when a schema has at least one renderable field. Unknown `kind`
 * values fail closed (`controlStatus` → `unknown`) and never count, so an
 * all-unknown schema falls back to the legacy panel instead of a blank one.
 * Never throws on hostile shapes.
 */
export function hasRenderableSchemaFields(schema: PropSchema): boolean {
  try {
    const fields = Array.isArray(schema)
      ? schema
      : (schema as { fields?: unknown })?.fields;
    if (!Array.isArray(fields)) return false;
    return fields.some(
      (entry) =>
        isRecord(entry) &&
        controlStatus(String((entry as { kind?: unknown }).kind)) !== "unknown",
    );
  } catch {
    return false;
  }
}

/**
 * Canonical extension address for a studio twin: trimmed `widgetKey` plus
 * the derived owner via `ownerForWidgetKey` (single regex — never a stored
 * `owner`, so a hostile envelope cannot spoof). Null for legacy / hostile /
 * blank twins. Never throws. Extension-node path only.
 */
export function extensionAddressForNode(
  node: StudioNode | null | undefined,
): { owner: ReturnType<typeof ownerForWidgetKey>; widgetKey: string } | null {
  try {
    if (!node || typeof node !== "object" || Array.isArray(node)) return null;
    if ((node as StudioNode).el !== "app-block") return null;
    const settings = (node as StudioNode).settings;
    if (!settings || typeof settings !== "object" || Array.isArray(settings))
      return null;
    const bag = settings as Record<string, unknown>;
    const marker = bag["extensionInstanceId"];
    if (typeof marker !== "string" || !marker.trim()) return null;
    const rawKey = bag["pluginKey"];
    if (typeof rawKey !== "string" || !rawKey.trim()) return null;
    const widgetKey = rawKey.trim().slice(0, 120);
    if (!widgetKey) return null;
    const owner = ownerForWidgetKey(widgetKey);
    if (!owner || typeof owner.id !== "string" || !owner.id) return null;
    return { owner, widgetKey };
  } catch {
    return null;
  }
}

/**
 * Pure resolution behind the schema dispatcher. Only canonical extension
 * studio nodes (`el: "app-block"` carrying the `extensionInstanceId`
 * envelope written by `studioNodeForExtension`) are candidates, addressed by
 * canonical owner + `widgetKey` through the threaded authorized
 * `resolveInspectorSchema` — when a threaded `registry` is provided it is the
 * ONLY registry consulted (never the singleton); absent keeps the legacy
 * singleton read. Same candidates, empty-schema convention
 * (`{ fields: [] }` means legacy-unvalidated), and legacy fallthrough as the
 * old-builder inspector. Lookup failures and hostile nodes fall through to
 * legacy, never a crash.
 */
export function resolveSchemaForNode(
  node: StudioNode | null | undefined,
  registry?: UnifiedRegistry | null,
): StudioSchemaResolution {
  try {
    const address = extensionAddressForNode(node);
    if (!address) return { status: "legacy" };
    const settings = (node as StudioNode).settings as Record<string, unknown>;
    const resolved = resolveInspectorSchema(
      { type: "extension", widgetKey: address.widgetKey, props: settings },
      registry ?? undefined,
    );
    if (resolved.status !== "schema") return { status: "legacy" };
    if (!hasRenderableSchemaFields(resolved.schema))
      return { status: "legacy" };
    return {
      status: "schema",
      widgetId: resolved.widgetId,
      label: resolved.label,
      meta: resolved.meta,
      schema: resolved.schema,
    };
  } catch {
    return { status: "legacy" };
  }
}

/** Top-level known keys, groups flattened (presentation-only clusters). */
function schemaKnownKeys(schema: PropSchema): Set<string> {
  const out = new Set<string>();
  const walk = (fields: readonly PropField[] | undefined) => {
    for (const entry of fields ?? []) {
      if (!isRecord(entry)) continue;
      const field = entry as PropField;
      if (field.kind === "group") walk(field.fields);
      else if (typeof field.key === "string" && field.key) out.add(field.key);
    }
  };
  try {
    walk(fieldsOf(schema));
  } catch {
    // Hostile schema shape → no known keys → every edit fails closed.
  }
  return out;
}

export type SchemaPanelEdit = { key: string; value: SettingValue };

/**
 * Validated single-key transition behind every schema control. The candidate
 * (full per-instance props with the edit applied) crosses the SAME
 * `validateProps` module the server save path calls; only the edit's cleaned
 * slice is returned — hostile values are neutralized, unknown / envelope
 * keys are dropped (`null`, nothing is written). Non-desktop devices write
 * through the existing seam as the validated `bp` layer object, mirroring
 * the `Section.bp` desktop-first layering `validateProps` preserves
 * shape-for-shape. Never throws.
 */
export function cleanSchemaEdit(
  schema: PropSchema,
  props: WidgetProps,
  key: string,
  value: unknown,
  device?: string,
): SchemaPanelEdit | null {
  try {
    if (typeof key !== "string" || !key) return null;
    if (SCHEMA_ENVELOPE_KEYS.has(key)) return null;
    if (!schemaKnownKeys(schema).has(key)) return null;
    const base: Record<string, unknown> = isRecord(props) ? props : {};
    const layer =
      typeof device === "string" && device && device !== "desktop"
        ? device
        : undefined;
    if (layer !== undefined) {
      if (!DEVICE_KEY_RE.test(layer)) return null;
      const rawBp = base.bp;
      const layers: Record<string, unknown> = isRecord(rawBp) ? rawBp : {};
      const rawLayer = layers[layer];
      const current: Record<string, unknown> = isRecord(rawLayer)
        ? rawLayer
        : {};
      const candidate = {
        ...base,
        bp: { ...layers, [layer]: { ...current, [key]: value } },
      };
      const result = validateProps(schema, candidate);
      const cleanBp = (result.clean as Record<string, unknown>).bp;
      if (!isRecord(cleanBp)) return null;
      return { key: "bp", value: cleanBp as SettingValue };
    }
    const result = validateProps(schema, { ...base, [key]: value });
    if (!Object.prototype.hasOwnProperty.call(result.clean, key)) return null;
    const cleaned = (result.clean as Record<string, unknown>)[key];
    if (cleaned === undefined) return null;
    return { key, value: cleaned as SettingValue };
  } catch {
    return null;
  }
}

/**
 * Routes a validated schema edit through the existing node-update seam.
 * Returns `true` when a write was issued, `false` when the edit was dropped
 * (unknown/envelope key, hostile device, validator failure) — fail closed,
 * never stored raw.
 */
export function applySchemaPanelChange(
  schema: PropSchema,
  props: WidgetProps,
  key: string,
  value: unknown,
  device: string | undefined,
  onChange: (key: string, value: SettingValue) => void,
): boolean {
  const edit = cleanSchemaEdit(schema, props, key, value, device);
  if (!edit) return false;
  onChange(edit.key, edit.value);
  return true;
}

/**
 * Reset-to-defaults entries: `defaultsFor(schema)` as per-key pairs so the
 * reset flows through the existing `onChange(key, value)` seam — one
 * validator-derived write per key, no new props plumbing. Envelope keys can
 * never appear (they are not schema defaults); fresh objects every call (see
 * `defaultsFor`), so instances never share references. Never throws.
 */
export function schemaResetEntries(
  schema: PropSchema,
): Array<[string, SettingValue]> {
  try {
    return Object.entries(defaultsFor(schema))
      .filter(([key]) => !SCHEMA_ENVELOPE_KEYS.has(key))
      .map(([key, value]) => [key, value as SettingValue]);
  } catch {
    return [];
  }
}

/**
 * Reset-to-defaults writer: one seam write per schema default, in schema
 * order. Global plugin settings and the extension envelope are unreachable
 * (only `schemaResetEntries` keys are emitted).
 */
export function resetSchemaPanel(
  schema: PropSchema,
  onChange: (key: string, value: SettingValue) => void,
): void {
  for (const [key, value] of schemaResetEntries(schema)) {
    try {
      onChange(key, value);
    } catch {
      // One hostile key must not abort the remaining defaults.
    }
  }
}

function SchemaSettingsPanel({
  node,
  device,
  schema,
  label,
  meta,
  onChange,
  onBack,
}: {
  node: StudioNode;
  device: DeviceKey;
  schema: PropSchema;
  label: string;
  meta: string;
  onChange: (key: string, value: SettingValue) => void;
  onBack: () => void;
}) {
  const settings: Record<string, unknown> = useMemo(
    () => (isRecord(node.settings) ? node.settings : {}),
    [node.settings],
  );
  // Schema defaults sit underneath per-instance values for display only;
  // validation and writes operate on the raw stored settings.
  const merged: WidgetProps = useMemo(() => {
    try {
      return { ...defaultsFor(schema), ...settings };
    } catch {
      return { ...settings };
    }
  }, [schema, settings]);
  const errors: string[] = useMemo(() => {
    try {
      return validateProps(schema, settings).errors;
    } catch {
      return [];
    }
  }, [schema, settings]);
  const overrides = useMemo(
    () =>
      isRecord(settings.bp)
        ? (settings.bp as Record<string, WidgetProps>)
        : undefined,
    [settings],
  );
  const layer = device === "desktop" ? undefined : device;
  const title = node.name ?? label;

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

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className="text-[0.65rem] text-muted-foreground">{meta}</p>
        {layer !== undefined && (
          <p className="mt-2 rounded-fq-md border border-border bg-muted p-2 text-xs text-muted-foreground">
            Editing the {layer} layer. Values inherit from desktop until
            overridden.
          </p>
        )}
        <div className="mt-3">
          <SchemaControls
            schema={schema}
            props={merged}
            errors={errors}
            device={layer}
            overrides={overrides}
            onChange={(key, value, tagged) =>
              applySchemaPanelChange(
                schema,
                settings,
                key,
                value,
                tagged ?? layer,
                onChange,
              )
            }
          />
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => resetSchemaPanel(schema, onChange)}
            className="min-h-10 w-full rounded-fq-md border border-border text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            Reset to defaults
          </button>
        </div>
      </div>
    </div>
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
  registry,
}: SettingsPanelProps) {
  const [tab, setTab] = useState<PanelTab>("general");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const sections = useMemo(() => sectionsForPanelTab(node, tab), [node, tab]);
  const title = node.name ?? widgetLabel(node.el);
  const hasInteraction = Boolean(node.settings.animation);
  // Schema swap-in (read-only resolution, never throws): extension nodes
  // with a resolvable non-empty schema render generated controls; every
  // other node keeps the legacy panel below byte-identical.
  const schemaResolution = useMemo(
    () => resolveSchemaForNode(node, registry),
    [node, registry],
  );
  if (schemaResolution.status === "schema") {
    return (
      <SchemaSettingsPanel
        node={node}
        device={device}
        schema={schemaResolution.schema}
        label={schemaResolution.label}
        meta={schemaResolution.meta}
        onChange={onChange}
        onBack={onBack}
      />
    );
  }

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

      <div
        role="tablist"
        aria-label="Element settings"
        className="flex border-b border-border"
      >
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

      <div
        id="studio-settings-panel"
        role="tabpanel"
        className="min-h-0 flex-1 overflow-y-auto"
      >
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
            <p className="text-xs font-semibold">
              Animate elements with Interactions
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Add entrance animations and effects triggered by user interactions
              such as page load or scroll.
            </p>
            <button
              type="button"
              onClick={() => {
                onChange("animation", "fade-up");
                setOpen((prev) => ({
                  ...prev,
                  "interactions:Entrance animation": true,
                }));
              }}
              className="mt-3 min-h-9 rounded-fq-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
            >
              Create an interaction
            </button>
          </div>
        )}

        {sections.map((section) => {
          const controls = section.controls.filter((control) =>
            isControlVisible(control, node.settings),
          );
          if (controls.length === 0) return null;
          const id = `${tab}:${section.title}`;
          // Sections start closed on Style/Interactions, open on General.
          const expanded = open[id] ?? (tab === "general" && !section.advanced);
          return (
            <section key={id} className="border-b border-border">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() =>
                  setOpen((prev) => ({ ...prev, [id]: !expanded }))
                }
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
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    expanded ? "" : "-rotate-90",
                  )}
                  aria-hidden
                />
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
