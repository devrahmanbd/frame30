/**
 * Phase 5 — plugin manifest, contribution API and compatibility rules.
 *
 * Pure module: no network, no database, no React. Everything here is a
 * decision the host, the review pipeline and the sandbox must all agree on,
 * so it lives once and is unit-tested.
 *
 * The core widget registry stays a closed enum. Plugins contribute widgets in
 * a *namespaced tier* — `plugin:{pluginId}/{widget}` — which the builder
 * renders through one sandboxed island (`plugin_block`), never as a new core
 * renderer branch.
 */

import { normalizeScopes } from "./marketplace-scopes";
import { compareSemver, parseSemver } from "./marketplace-scopes";

/** Builder API version plugins declare compatibility against (AST v3 line). */
export const BUILDER_API_VERSION = "3.1.0";

/** Per-plugin resource ceiling. Exceeding it downgrades to a placeholder. */
export const PLUGIN_BUDGET = { jsKb: 120, mainThreadMs: 50 } as const;

/** Documented server extension points. A manifest may not invent hooks. */
export const SERVER_HOOKS = [
  "cart.calculate",
  "checkout.validate",
  "order.created",
  "product.saved",
] as const;
export type ServerHook = (typeof SERVER_HOOKS)[number];

export const BLOCK_SLOTS = ["header", "main", "footer"] as const;
export type BlockSlot = (typeof BLOCK_SLOTS)[number];

export type SettingKind = "text" | "number" | "boolean" | "select";
export type SettingField = {
  key: string;
  label: string;
  kind: SettingKind;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
};

export type PluginWidgetDef = {
  key: string;
  label: string;
  slots: BlockSlot[];
  /** Sandboxed bundle entry evaluated inside the island's null-origin frame. */
  entry: string;
  height?: number;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  /** Semver range against BUILDER_API_VERSION, e.g. `^3.0.0` or `>=3.0.0 <4.0.0`. */
  api: string;
  permissions: string[];
  widgets: PluginWidgetDef[];
  hooks: ServerHook[];
  /** HTTPS endpoint the queued server hooks POST to. Required when hooks[] is set. */
  hooksUrl?: string;
  settings: SettingField[];
  i18n: { en: Record<string, string>; bn: Record<string, string> };
  budget: { jsKb: number; mainThreadMs: number };
};

const ID_RE = /^[a-z][a-z0-9-]{2,39}$/;
const KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;

export function pluginWidgetKey(pluginId: string, widget: string) {
  return `plugin:${pluginId}/${widget}`;
}

export function parsePluginWidgetKey(
  key: string,
): { pluginId: string; widget: string } | null {
  const m = /^plugin:([a-z][a-z0-9-]{2,39})\/([a-z][a-z0-9_-]{1,39})$/.exec(key.trim());
  return m ? { pluginId: m[1], widget: m[2] } : null;
}

// ------------------------------------------------------------ compatibility

/** Supports `^x.y.z` and `>=a.b.c <d.e.f`; anything else is rejected. */
export function satisfiesApiRange(range: string, api = BUILDER_API_VERSION): boolean {
  const target = parseSemver(api);
  if (!target) return false;
  const caret = /^\^(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (caret) {
    const base = parseSemver(caret[1]);
    if (!base) return false;
    return base.major === target.major && compareSemver(api, caret[1]) >= 0;
  }
  const pair = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (pair) {
    return compareSemver(api, pair[1]) >= 0 && compareSemver(api, pair[2]) < 0;
  }
  return false;
}

// --------------------------------------------------------------- validation

export type ManifestVerdict =
  | { ok: true; manifest: PluginManifest; warnings: string[] }
  | { ok: false; errors: string[] };

function settingField(raw: unknown, errors: string[], index: number): SettingField | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const key = String(r.key ?? "");
  if (!KEY_RE.test(key)) {
    errors.push(`settings[${index}].key`);
    return null;
  }
  const kind = String(r.kind ?? "text") as SettingKind;
  if (!["text", "number", "boolean", "select"].includes(kind)) {
    errors.push(`settings[${index}].kind`);
    return null;
  }
  const options = Array.isArray(r.options)
    ? r.options
        .map((o) => o as Record<string, unknown>)
        .filter((o) => typeof o?.value === "string")
        .map((o) => ({ value: String(o.value), label: String(o.label ?? o.value) }))
    : undefined;
  if (kind === "select" && (!options || options.length === 0)) {
    errors.push(`settings[${index}].options`);
    return null;
  }
  return {
    key,
    label: String(r.label ?? key).slice(0, 80),
    kind,
    options,
    min: typeof r.min === "number" ? r.min : undefined,
    max: typeof r.max === "number" ? r.max : undefined,
    default: ["string", "number", "boolean"].includes(typeof r.default)
      ? (r.default as string | number | boolean)
      : undefined,
  };
}

/** The single gate the review pipeline, install flow and host all run. */
export function parseManifest(input: unknown): ManifestVerdict {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = (input ?? {}) as Record<string, unknown>;

  const id = String(raw.id ?? "").trim().toLowerCase();
  if (!ID_RE.test(id)) errors.push("id");

  const version = String(raw.version ?? "").trim();
  if (!parseSemver(version)) errors.push("version");

  const api = String(raw.api ?? "").trim();
  if (!api) errors.push("api");

  const { scopes, unknown } = normalizeScopes(raw.permissions);
  if (unknown.length) errors.push(`permissions:${unknown.join(",")}`);

  const hooks: ServerHook[] = [];
  for (const h of Array.isArray(raw.hooks) ? raw.hooks : []) {
    const key = String(h);
    if ((SERVER_HOOKS as readonly string[]).includes(key)) {
      if (!hooks.includes(key as ServerHook)) hooks.push(key as ServerHook);
    } else errors.push(`hooks:${key}`);
  }

  const hooksUrl = typeof raw.hooksUrl === "string" ? raw.hooksUrl.trim() : "";
  if (hooks.length && !/^https:\/\/[^\s]+$/.test(hooksUrl)) errors.push("hooksUrl");

  const widgets: PluginWidgetDef[] = [];
  const rawWidgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  rawWidgets.forEach((w, i) => {
    const r = (w ?? {}) as Record<string, unknown>;
    const key = String(r.key ?? "");
    if (!KEY_RE.test(key)) {
      errors.push(`widgets[${i}].key`);
      return;
    }
    const slots = (Array.isArray(r.slots) ? r.slots : [])
      .map(String)
      .filter((s): s is BlockSlot => (BLOCK_SLOTS as readonly string[]).includes(s));
    if (slots.length === 0) {
      errors.push(`widgets[${i}].slots`);
      return;
    }
    const entry = typeof r.entry === "string" ? r.entry : "";
    if (!entry) {
      errors.push(`widgets[${i}].entry`);
      return;
    }
    if (/\bimport\s*\(|\beval\s*\(|new\s+Function/.test(entry)) {
      errors.push(`widgets[${i}].entry.dynamic_code`);
      return;
    }
    if (widgets.some((x) => x.key === key)) {
      errors.push(`widgets[${i}].duplicate`);
      return;
    }
    widgets.push({
      key,
      label: String(r.label ?? key).slice(0, 60),
      slots,
      entry,
      height: typeof r.height === "number" ? Math.min(1200, Math.max(80, r.height)) : 320,
    });
  });
  if (widgets.some((w) => w.slots.length) && !scopes.includes("render_storefront")) {
    errors.push("permissions.render_storefront_required");
  }

  const settings: SettingField[] = [];
  (Array.isArray(raw.settings) ? raw.settings : []).forEach((s, i) => {
    const field = settingField(s, errors, i);
    if (field && !settings.some((f) => f.key === field.key)) settings.push(field);
  });

  const i18nRaw = (raw.i18n ?? {}) as Record<string, unknown>;
  const dict = (v: unknown) => {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries((v ?? {}) as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  };
  const i18n = { en: dict(i18nRaw.en), bn: dict(i18nRaw.bn) };
  const missingBn = Object.keys(i18n.en).filter((k) => !i18n.bn[k]);
  if (missingBn.length) warnings.push(`i18n.bn_missing:${missingBn.length}`);

  const budgetRaw = (raw.budget ?? {}) as Record<string, unknown>;
  const budget = {
    jsKb: typeof budgetRaw.jsKb === "number" ? budgetRaw.jsKb : PLUGIN_BUDGET.jsKb,
    mainThreadMs:
      typeof budgetRaw.mainThreadMs === "number"
        ? budgetRaw.mainThreadMs
        : PLUGIN_BUDGET.mainThreadMs,
  };
  if (budget.jsKb > PLUGIN_BUDGET.jsKb) errors.push("budget.jsKb");
  if (budget.mainThreadMs > PLUGIN_BUDGET.mainThreadMs) errors.push("budget.mainThreadMs");

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    warnings,
    manifest: {
      id,
      name: String(raw.name ?? id).slice(0, 80),
      version,
      api,
      permissions: scopes,
      widgets,
      hooks,
      hooksUrl: hooksUrl || undefined,
      settings,
      i18n,
      budget,
    },
  };
}

// ------------------------------------------------------- permission diffing

export type PermissionDiff = {
  added: string[];
  removed: string[];
  /** Added permissions always require a fresh consent screen at update time. */
  requiresConsent: boolean;
};

export function permissionDiff(
  previous: readonly string[],
  next: readonly string[],
): PermissionDiff {
  const added = next.filter((p) => !previous.includes(p)).sort();
  const removed = previous.filter((p) => !next.includes(p)).sort();
  return { added, removed, requiresConsent: added.length > 0 };
}

// ----------------------------------------------------------- settings state

export type SettingsValues = Record<string, string | number | boolean>;

export function defaultSettings(schema: readonly SettingField[]): SettingsValues {
  const out: SettingsValues = {};
  for (const f of schema) {
    if (f.default !== undefined) out[f.key] = f.default;
    else if (f.kind === "boolean") out[f.key] = false;
    else if (f.kind === "number") out[f.key] = f.min ?? 0;
    else if (f.kind === "select") out[f.key] = f.options?.[0]?.value ?? "";
    else out[f.key] = "";
  }
  return out;
}

/** Coerces merchant input to the declared schema; unknown keys are dropped. */
export function validateSettings(
  schema: readonly SettingField[],
  values: unknown,
): { values: SettingsValues; errors: string[] } {
  const input = (values ?? {}) as Record<string, unknown>;
  const out = defaultSettings(schema);
  const errors: string[] = [];
  for (const f of schema) {
    if (!(f.key in input)) continue;
    const v = input[f.key];
    if (f.kind === "boolean") out[f.key] = v === true || v === "true";
    else if (f.kind === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        errors.push(`${f.key}.not_a_number`);
        continue;
      }
      const min = f.min ?? Number.NEGATIVE_INFINITY;
      const max = f.max ?? Number.POSITIVE_INFINITY;
      out[f.key] = Math.min(max, Math.max(min, n));
    } else if (f.kind === "select") {
      const s = String(v);
      if (!f.options?.some((o) => o.value === s)) {
        errors.push(`${f.key}.not_an_option`);
        continue;
      }
      out[f.key] = s;
    } else out[f.key] = String(v).slice(0, f.max ?? 500);
  }
  return { values: out, errors };
}

// --------------------------------------------------------------- host state

export type InstalledPlugin = {
  installId: string;
  manifest: PluginManifest;
  grantedScopes: string[];
  settings: SettingsValues;
  /** Merchant paused it, or the platform kill switch disabled the tenant. */
  enabled: boolean;
};

export type PluginResolution =
  | { ok: true; plugin: InstalledPlugin; widget: PluginWidgetDef }
  | {
      ok: false;
      /** Every failure renders a labelled placeholder — never a crash. */
      reason: "bad_key" | "not_installed" | "unknown_widget" | "incompatible" | "disabled";
      pluginId?: string;
    };

/** One resolution point for the tray, the canvas and the storefront. */
export function resolvePluginWidget(
  key: string,
  installed: readonly InstalledPlugin[],
  api = BUILDER_API_VERSION,
): PluginResolution {
  const parsed = parsePluginWidgetKey(key);
  if (!parsed) return { ok: false, reason: "bad_key" };
  const plugin = installed.find((p) => p.manifest.id === parsed.pluginId);
  if (!plugin) return { ok: false, reason: "not_installed", pluginId: parsed.pluginId };
  if (!plugin.enabled) return { ok: false, reason: "disabled", pluginId: parsed.pluginId };
  if (!satisfiesApiRange(plugin.manifest.api, api))
    return { ok: false, reason: "incompatible", pluginId: parsed.pluginId };
  const widget = plugin.manifest.widgets.find((w) => w.key === parsed.widget);
  if (!widget) return { ok: false, reason: "unknown_widget", pluginId: parsed.pluginId };
  return { ok: true, plugin, widget };
}

/** Tray entries: every widget an installed, compatible plugin contributes. */
export function pluginTrayEntries(
  installed: readonly InstalledPlugin[],
  slot: BlockSlot,
  api = BUILDER_API_VERSION,
) {
  const out: { key: string; label: string; pluginName: string }[] = [];
  for (const p of installed) {
    if (!p.enabled || !satisfiesApiRange(p.manifest.api, api)) continue;
    for (const w of p.manifest.widgets) {
      if (!w.slots.includes(slot)) continue;
      out.push({
        key: pluginWidgetKey(p.manifest.id, w.key),
        label: w.label,
        pluginName: p.manifest.name,
      });
    }
  }
  return out;
}
