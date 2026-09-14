/**
 * Phase 14 — control renderers.
 *
 * Every control is responsive-aware: the small device chip beside the label
 * switches which breakpoint the value is written to, and the ↺ button clears
 * the override. The panel never special-cases a widget — it renders schema.
 */
import { useId, useState } from "react";
import { Laptop, Monitor, Plus, RotateCcw, Smartphone, Tablet, Trash2, TvMinimal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MediaPicker } from "@/components/builder/MediaPicker";
import type { Control } from "@/lib/studio/controls";
import type { NodeSettings, SettingValue } from "@/lib/studio/model";
import {
  BREAKPOINT_BY_KEY,
  hasOverride,
  resolveResponsive,
  setResponsive,
  type DeviceKey,
  type Maybe,
} from "@/lib/studio/responsive";

export const DEVICE_ICON: Record<DeviceKey, typeof Monitor> = {
  widescreen: TvMinimal,
  desktop: Monitor,
  laptop: Laptop,
  tablet: Tablet,
  mobileLandscape: Smartphone,
  mobile: Smartphone,
};

type FieldProps = {
  control: Control;
  settings: NodeSettings;
  device: DeviceKey;
  onChange: (key: string, value: SettingValue) => void;
  /** Switch the panel to another breakpoint when a device chip is clicked. */
  onDevice: (device: DeviceKey) => void;
  activeDevices: DeviceKey[];
};

function readValue(control: Control, settings: NodeSettings, device: DeviceKey): SettingValue {
  const raw = settings[control.key];
  if (!control.responsive) return raw;
  return resolveResponsive(raw as Maybe<SettingValue>, device) as SettingValue;
}

function writeValue(
  control: Control,
  settings: NodeSettings,
  device: DeviceKey,
  next: SettingValue,
): SettingValue {
  if (!control.responsive) return next;
  return setResponsive(settings[control.key] as Maybe<SettingValue>, device, next) as SettingValue;
}

function DeviceChip({
  control,
  settings,
  device,
  onDevice,
  activeDevices,
}: Pick<FieldProps, "control" | "settings" | "device" | "onDevice" | "activeDevices">) {
  if (!control.responsive) return null;
  const overridden = hasOverride(settings[control.key] as Maybe<SettingValue>, device) && device !== "desktop";
  const order: DeviceKey[] = activeDevices.length > 0 ? activeDevices : ["desktop"];
  const next = order[(order.indexOf(device) + 1) % order.length] ?? "desktop";
  const Icon = DEVICE_ICON[device];
  return (
    <button
      type="button"
      onClick={() => onDevice(next)}
      title={`Editing ${BREAKPOINT_BY_KEY[device].label} — click for ${BREAKPOINT_BY_KEY[next].label}`}
      aria-label={`Breakpoint: ${BREAKPOINT_BY_KEY[device].label}. Switch to ${BREAKPOINT_BY_KEY[next].label}`}
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-fq-sm border text-muted-foreground transition-colors hover:text-foreground",
        overridden ? "border-primary text-primary" : "border-transparent",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
    </button>
  );
}

export function ControlField(props: FieldProps) {
  const { control, settings, device, onChange } = props;
  const id = useId();
  const value = readValue(control, settings, device);
  const set = (next: SettingValue) => onChange(control.key, writeValue(control, settings, device, next));
  const clear = () => onChange(control.key, writeValue(control, settings, device, undefined));
  const canReset = control.responsive
    ? hasOverride(settings[control.key] as Maybe<SettingValue>, device)
    : settings[control.key] !== undefined;

  const header = (
    <div className="flex items-center justify-between gap-2">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {control.label}
      </label>
      <div className="flex items-center gap-1">
        <DeviceChip {...props} />
        {canReset && (
          <button
            type="button"
            onClick={clear}
            aria-label={`Reset ${control.label}`}
            className="grid size-6 place-items-center rounded-fq-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <RotateCcw className="size-3.5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );

  const body = (() => {
    switch (control.type) {
      case "textarea":
      case "richtext":
        return (
          <Textarea
            id={id}
            rows={control.type === "richtext" ? 6 : 3}
            value={typeof value === "string" ? value : ""}
            placeholder={control.placeholder}
            onChange={(event) => set(event.target.value)}
          />
        );

      case "code":
        return (
          <Textarea
            id={id}
            rows={6}
            spellCheck={false}
            className="font-mono text-xs"
            value={typeof value === "string" ? value : ""}
            placeholder={control.placeholder}
            onChange={(event) => set(event.target.value)}
          />
        );

      case "number":
        return (
          <Input
            id={id}
            type="number"
            value={typeof value === "number" ? value : ""}
            min={control.min}
            max={control.max}
            step={control.step}
            onChange={(event) => set(event.target.value === "" ? undefined : Number(event.target.value))}
          />
        );

      case "slider": {
        const min = control.min ?? 0;
        const max = control.max ?? 100;
        const step = control.step ?? 1;
        const current = typeof value === "number" ? value : min;
        return (
          <div className="flex items-center gap-3">
            <Slider
              id={id}
              value={[current]}
              min={min}
              max={max}
              step={step}
              aria-label={control.label}
              onValueChange={([next]) => set(next)}
              className="flex-1"
            />
            <Input
              type="number"
              value={typeof value === "number" ? value : ""}
              min={min}
              max={max}
              step={step}
              aria-label={`${control.label} value`}
              onChange={(event) => set(event.target.value === "" ? undefined : Number(event.target.value))}
              className="h-9 w-20"
            />
          </div>
        );
      }

      case "switch":
        return (
          <div className="flex items-center gap-2">
            <Switch id={id} checked={value === true} onCheckedChange={(checked) => set(checked)} />
            <span className="text-xs text-muted-foreground">{value === true ? "On" : "Off"}</span>
          </div>
        );

      case "select":
        return (
          <Select value={value === undefined || value === null ? "" : String(value)} onValueChange={(next) => set(next)}>
            <SelectTrigger id={id} aria-label={control.label}>
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              {(control.options ?? []).map((option) => (
                <SelectItem key={option.value || "__default"} value={option.value || "__default"}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "choice":
        return (
          <div role="group" aria-label={control.label} className="flex flex-wrap gap-1 rounded-fq-md bg-muted p-1">
            {(control.options ?? []).map((option) => {
              const selected = String(value ?? "") === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => set(option.value)}
                  className={cn(
                    "min-h-9 flex-1 rounded-fq-sm px-2 text-xs font-medium transition-colors",
                    selected ? "bg-card text-foreground shadow-fq-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        );

      case "color":
        return (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="color"
              value={typeof value === "string" && value.startsWith("#") ? value : "#000000"}
              onChange={(event) => set(event.target.value)}
              aria-label={`${control.label} picker`}
              className="size-9 shrink-0 cursor-pointer rounded-fq-sm border border-border bg-card"
            />
            <Input
              value={typeof value === "string" ? value : ""}
              placeholder="var(--color-primary)"
              onChange={(event) => set(event.target.value)}
              aria-label={`${control.label} value`}
            />
          </div>
        );

      case "dimensions": {
        const current =
          value && typeof value === "object" && !Array.isArray(value)
            ? (value as unknown as { top: number; right: number; bottom: number; left: number; unit: string; linked?: boolean })
            : { top: 0, right: 0, bottom: 0, left: 0, unit: "px", linked: true };
        const write = (side: "top" | "right" | "bottom" | "left", next: number) => {
          const patch = current.linked
            ? { ...current, top: next, right: next, bottom: next, left: next }
            : { ...current, [side]: next };
          set(patch as unknown as SettingValue);
        };
        return (
          <div className="flex items-center gap-2">
            <div className="grid flex-1 grid-cols-4 gap-1">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <Input
                  key={side}
                  type="number"
                  className="h-9 px-2 text-xs"
                  aria-label={`${control.label} ${side}`}
                  value={current[side]}
                  onChange={(event) => write(side, Number(event.target.value || 0))}
                />
              ))}
            </div>
            <button
              type="button"
              aria-pressed={current.linked !== false}
              aria-label="Link all four sides"
              onClick={() => set({ ...current, linked: current.linked === false } as unknown as SettingValue)}
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-fq-sm border text-xs",
                current.linked === false ? "border-border text-muted-foreground" : "border-primary text-primary",
              )}
            >
              ⛓
            </button>
          </div>
        );
      }

      case "image":
        return (
          <ImageField
            id={id}
            value={typeof value === "string" ? value : ""}
            label={control.label}
            onChange={(next) => set(next)}
            /* Alt text written once in the media library follows the image
             * into every placement. An alt the editor already typed wins — we
             * never overwrite an author's words. */
            onInherit={(meta) => {
              const existing = settings["alt"];
              if (meta.altText && !(typeof existing === "string" && existing.trim())) {
                onChange("alt", meta.altText as unknown as SettingValue);
              }
            }}
          />
        );



      case "link":
        return (
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            placeholder={control.placeholder ?? "/products"}
            onChange={(event) => set(event.target.value)}
          />
        );

      case "icon":
        return (
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            placeholder="Star, Check, Truck…"
            onChange={(event) => set(event.target.value)}
          />
        );

      case "repeater":
        return <Repeater control={control} value={Array.isArray(value) ? (value as NodeSettings[]) : []} onChange={set} />;

      case "heading":
        return null;

      default:
        return (
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            placeholder={control.placeholder}
            onChange={(event) => set(event.target.value)}
          />
        );
    }
  })();

  return (
    <div className="flex flex-col gap-1.5">
      {header}
      {body}
      {control.help ? <p className="text-[11px] leading-snug text-muted-foreground">{control.help}</p> : null}
    </div>
  );
}

function Repeater({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: NodeSettings[];
  onChange: (next: SettingValue) => void;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const fields = control.fields ?? [];

  const update = (index: number, key: string, next: SettingValue) => {
    const rows = value.map((row, i) => (i === index ? { ...row, [key]: next } : row));
    onChange(rows as unknown as SettingValue);
  };

  return (
    <div className="flex flex-col gap-2">
      {value.map((row, index) => {
        const title = typeof row.title === "string" ? row.title : typeof row.text === "string" ? row.text : `Item ${index + 1}`;
        const expanded = open === index;
        return (
          <div key={index} className="rounded-fq-md border border-border">
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : index)}
                aria-expanded={expanded}
                className="min-h-9 flex-1 truncate text-left text-xs font-medium"
              >
                {title || `Item ${index + 1}`}
              </button>
              <button
                type="button"
                aria-label={`Remove item ${index + 1}`}
                onClick={() => onChange(value.filter((_, i) => i !== index) as unknown as SettingValue)}
                className="grid size-9 place-items-center rounded-fq-sm text-muted-foreground hover:bg-muted hover:text-danger"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
            {expanded && (
              <div className="flex flex-col gap-3 border-t border-border p-3">
                {fields.map((field) => (
                  <ControlField
                    key={field.key}
                    control={{ ...field, responsive: false }}
                    settings={row}
                    device="desktop"
                    activeDevices={["desktop"]}
                    onDevice={() => undefined}
                    onChange={(key, next) => update(index, key, next)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...value, {}] as unknown as SettingValue)}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-fq-md border border-dashed border-border text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
      >
        <Plus className="size-4" aria-hidden /> Add item
      </button>
    </div>
  );
}

/**
 * WordPress-style media field: a framed preview plus `Select image`, which
 * opens the shared media-library picker (library, upload or pasted URL).
 */
function ImageField({
  id,
  value,
  label,
  onChange,
  onInherit,
}: {
  id: string;
  value: string;
  label: string;
  onChange: (next: string) => void;
  onInherit?: (meta: { altText?: string | null; width?: number | null; height?: number | null }) => void;
}) {

  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <img src={value} alt="" className="h-24 w-full rounded-fq-sm border border-border object-cover" />
      ) : (
        <div className="grid h-24 w-full place-items-center rounded-fq-sm border border-dashed border-border text-[11px] text-muted-foreground">
          No image selected
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          id={id}
          onClick={() => setOpen(true)}
          className="min-h-9 flex-1 rounded-fq-sm border border-border text-xs font-medium hover:bg-muted"
        >
          {value ? "Replace image" : "Select image"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="min-h-9 rounded-fq-sm border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
          >
            Remove
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <MediaPicker
            value={value}
            sizesPreset="full"
            onPick={(url, meta) => {
              onChange(url);
              if (meta) onInherit?.(meta);
              if (url) setOpen(false);
            }}

            onSizes={() => undefined}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
