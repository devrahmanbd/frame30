/**
 * Phase 14 — responsive value model.
 *
 * Elementor stores one value per *active breakpoint* and cascades downward:
 * a control left untouched on Mobile inherits Tablet, which inherits Desktop.
 * Everything here is pure so the settings panel, the canvas and the HTML
 * exporter agree on exactly one resolution rule.
 */

export const DEVICE_KEYS = [
  "widescreen",
  "desktop",
  "laptop",
  "tablet",
  "mobileLandscape",
  "mobile",
] as const;

export type DeviceKey = (typeof DEVICE_KEYS)[number];

export type BreakpointDef = {
  key: DeviceKey;
  label: string;
  /** Canvas width used when the device is previewed. */
  width: number;
  /** Media-query edge, in px. `min` for widescreen, `max` for the rest. */
  edge: number;
  direction: "min" | "max";
  /** Desktop is the base value and can never be switched off. */
  base?: boolean;
  /** Off by default in Elementor; merchants opt in from Site settings. */
  defaultActive: boolean;
};

export const BREAKPOINT_DEFS: BreakpointDef[] = [
  { key: "widescreen", label: "Widescreen", width: 1920, edge: 2400, direction: "min", defaultActive: false },
  { key: "desktop", label: "Desktop", width: 1200, edge: 0, direction: "min", base: true, defaultActive: true },
  { key: "laptop", label: "Laptop", width: 1120, edge: 1366, direction: "max", defaultActive: false },
  { key: "tablet", label: "Tablet", width: 820, edge: 1024, direction: "max", defaultActive: true },
  { key: "mobileLandscape", label: "Mobile landscape", width: 720, edge: 880, direction: "max", defaultActive: false },
  { key: "mobile", label: "Mobile", width: 390, edge: 767, direction: "max", defaultActive: true },
];

export const BREAKPOINT_BY_KEY: Record<DeviceKey, BreakpointDef> = BREAKPOINT_DEFS.reduce(
  (acc, def) => {
    acc[def.key] = def;
    return acc;
  },
  {} as Record<DeviceKey, BreakpointDef>,
);

export const DEFAULT_ACTIVE_DEVICES: DeviceKey[] = BREAKPOINT_DEFS.filter((d) => d.defaultActive).map(
  (d) => d.key,
);

/** Devices in cascade order, widest first. Desktop is always present. */
export function deviceOrder(active: DeviceKey[] = DEFAULT_ACTIVE_DEVICES): DeviceKey[] {
  const set = new Set<DeviceKey>([...active, "desktop"]);
  return DEVICE_KEYS.filter((key) => set.has(key));
}

/** Devices that inherit from `device`, narrowest last, `device` included. */
export function cascadeFor(device: DeviceKey, active: DeviceKey[] = DEFAULT_ACTIVE_DEVICES): DeviceKey[] {
  const order = deviceOrder(active);
  const index = order.indexOf(device);
  if (index < 0) return ["desktop"];
  return order.slice(0, index + 1);
}

export type Responsive<T> = { __r: true } & Partial<Record<DeviceKey, T>>;

export type Maybe<T> = T | Responsive<T> | undefined;

export function isResponsive<T>(value: unknown): value is Responsive<T> {
  return Boolean(value) && typeof value === "object" && (value as { __r?: boolean }).__r === true;
}

export function responsive<T>(desktop: T, rest: Partial<Record<DeviceKey, T>> = {}): Responsive<T> {
  return { __r: true, desktop, ...rest };
}

/** Resolve a (possibly responsive) value for one device, cascading widest→narrowest. */
export function resolveResponsive<T>(
  value: Maybe<T>,
  device: DeviceKey = "desktop",
  active: DeviceKey[] = DEFAULT_ACTIVE_DEVICES,
): T | undefined {
  if (value === undefined) return undefined;
  if (!isResponsive<T>(value)) return value;
  const chain = cascadeFor(device, active);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    const key = chain[i]!;
    const candidate = value[key];
    if (candidate !== undefined && candidate !== null && candidate !== "") return candidate;
  }
  return value.desktop;
}

/** Write a value for one device, promoting the field to responsive on demand. */
export function setResponsive<T>(value: Maybe<T>, device: DeviceKey, next: T | undefined): Maybe<T> {
  if (device === "desktop" && !isResponsive<T>(value)) return next;
  const base: Responsive<T> = isResponsive<T>(value)
    ? { ...value }
    : ({ __r: true, desktop: value } as Responsive<T>);
  if (next === undefined) delete base[device];
  else base[device] = next;
  const touched = DEVICE_KEYS.filter((k) => k !== "desktop" && base[k] !== undefined);
  if (touched.length === 0) return base.desktop;
  return base;
}

/** True when the field carries an explicit override for this device. */
export function hasOverride<T>(value: Maybe<T>, device: DeviceKey): boolean {
  if (device === "desktop") return value !== undefined;
  return isResponsive<T>(value) && value[device] !== undefined;
}

/** Devices, other than desktop, that carry an explicit value. */
export function overriddenDevices<T>(value: Maybe<T>): DeviceKey[] {
  if (!isResponsive<T>(value)) return [];
  return DEVICE_KEYS.filter((k) => k !== "desktop" && value[k] !== undefined);
}

/* ------------------------------------------------------------------ */
/* Units                                                               */
/* ------------------------------------------------------------------ */

export const UNITS = ["px", "%", "em", "rem", "vw", "vh"] as const;
export type Unit = (typeof UNITS)[number];

export type Length = { value: number; unit: Unit };

export function length(value: number, unit: Unit = "px"): Length {
  return { value, unit };
}

export function isLength(value: unknown): value is Length {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Length).value === "number" &&
    UNITS.includes((value as Length).unit)
  );
}

export function lengthToCss(value: Maybe<Length>, device: DeviceKey = "desktop"): string | undefined {
  const resolved = resolveResponsive(value, device);
  if (!isLength(resolved)) return undefined;
  if (!Number.isFinite(resolved.value)) return undefined;
  return `${resolved.value}${resolved.unit}`;
}

export type Box = { top: number; right: number; bottom: number; left: number; unit: Unit; linked?: boolean };

export function box(all = 0, unit: Unit = "px", linked = true): Box {
  return { top: all, right: all, bottom: all, left: all, unit, linked };
}

export function isBox(value: unknown): value is Box {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Box;
  return (
    typeof candidate.top === "number" &&
    typeof candidate.right === "number" &&
    typeof candidate.bottom === "number" &&
    typeof candidate.left === "number"
  );
}

export function boxToCss(value: Maybe<Box>, device: DeviceKey = "desktop"): string | undefined {
  const resolved = resolveResponsive(value, device);
  if (!isBox(resolved)) return undefined;
  const unit = resolved.unit ?? "px";
  return `${resolved.top}${unit} ${resolved.right}${unit} ${resolved.bottom}${unit} ${resolved.left}${unit}`;
}

/** Link-toggle behaviour: editing one side while linked writes all four. */
export function editBox(current: Box, side: keyof Omit<Box, "unit" | "linked">, next: number): Box {
  if (current.linked) return { ...current, top: next, right: next, bottom: next, left: next };
  return { ...current, [side]: next };
}
