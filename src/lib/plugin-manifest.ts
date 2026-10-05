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

import {
  MENU_REPLACE_SCOPE,
  MENU_SLOTS,
  isMenuSlot,
  normalizeScopes,
  type MenuSlot,
} from "./marketplace-scopes";
import { compareSemver, parseSemver } from "./marketplace-scopes";
import {
  normalizeThemeContract,
  type PluginThemeContract,
} from "./plugin-theme-contract";
export { MENU_SLOTS, isMenuSlot, type MenuSlot };

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

/**
 * TRACK M — menu replacement API (approved shapes 1+2; theme-only formal
 * override stays roadmap/untouched).
 *
 * Shape 1 (fill): a widget may target `menu_bar` / `menu_dropdown` /
 * `menu_drawer`. Data contract is rows in, markup out — the engine keeps
 * layout/a11y control at every fill point and renders all nav markup itself;
 * the plugin only supplies rows through the `menus.list` sandbox bridge
 * (see `marketplace-scopes.ts`). No new server hook exists for menus:
 * `SERVER_HOOKS` above is unchanged by design.
 *
 * Shape 2 (swap): a plugin may register a complete nav renderer, but it
 * only wins behind BOTH `replace_menus` scope AND an explicit review
 * approval flag (`decideMenuRenderer`). Any failure renders the theme
 * default (fail-open, logged via `renderMenuWithFallback`).
 */

/** A plugin's claim to replace one nav slot's renderer. */
export type MenuRendererClaim = {
  pluginId: string;
  slot: MenuSlot;
  /** Sandboxed bundle entry — never raw HTML into the nav landmark. */
  entry: string;
  /** Explicit review approval. `false`/absent keeps the theme default. */
  reviewApproved: boolean;
};

export function isMenuRendererClaim(value: unknown): value is MenuRendererClaim {
  const r = (value ?? {}) as Record<string, unknown>;
  return (
    typeof r.pluginId === "string" &&
    r.pluginId.length > 0 &&
    isMenuSlot(r.slot) &&
    typeof r.entry === "string" &&
    r.entry.length > 0 &&
    typeof r.reviewApproved === "boolean"
  );
}

export type MenuRendererDecision =
  | {
      kind: "plugin";
      pluginId: string;
      slot: MenuSlot;
    }
  | {
      kind: "theme_default";
      reason: "not_claimed" | "not_approved" | "scope_denied" | "renderer_failed";
      pluginId?: string;
    };

/**
 * Review gate for a full nav renderer swap. First claim for the slot wins;
 * it renders only when review-approved AND the install grants
 * `replace_menus`. Every other outcome is the theme default (fail-open).
 */
export function decideMenuRenderer(
  claims: readonly MenuRendererClaim[] | null | undefined,
  slot: MenuSlot,
  granted: readonly string[] | null | undefined,
): MenuRendererDecision {
  // Fail-open on malformed input too: anything unexpected is the theme default.
  const list = Array.isArray(claims) ? claims : [];
  const scopes = Array.isArray(granted) ? granted : [];
  const claim = list.find((c) => c?.slot === slot);
  if (!claim) return { kind: "theme_default", reason: "not_claimed" };
  if (claim.reviewApproved !== true)
    return {
      kind: "theme_default",
      reason: "not_approved",
      pluginId: claim.pluginId,
    };
  if (!scopes.includes(MENU_REPLACE_SCOPE))
    return {
      kind: "theme_default",
      reason: "scope_denied",
      pluginId: claim.pluginId,
    };
  return { kind: "plugin", pluginId: claim.pluginId, slot };
}

/**
 * Fail-open menu render. The theme renderer runs whenever the decision is
 * not `plugin` (the plugin renderer is never attempted then), and again
 * when the plugin renderer throws — the failure is reported through
 * `onFail` (default: one tagged `console.error` line, mirroring
 * `reportWidgetError`) and the shopper still gets navigation.
 */
export function renderMenuWithFallback<T>(
  decision: MenuRendererDecision,
  renderPlugin: () => T,
  renderTheme: () => T,
  onFail?: (error: unknown, decision: MenuRendererDecision) => void,
): T {
  if (decision.kind !== "plugin") return renderTheme();
  try {
    return renderPlugin();
  } catch (error) {
    const failed: MenuRendererDecision = {
      kind: "theme_default",
      reason: "renderer_failed",
      pluginId: decision.pluginId,
    };
    if (onFail) onFail(error, failed);
    else if (typeof console !== "undefined") {
      console.error(
        new Error(
          `menu_renderer_failed:${decision.pluginId}: ${(error as Error)?.message ?? String(error)}`,
          { cause: error },
        ),
      );
    }
    return renderTheme();
  }
}

/**
 * Row selection for a swapped slot. Plugin rows win only under a `plugin`
 * decision (and when non-empty); everything else keeps the theme rows, so
 * an approved-but-empty plugin can never blank the navigation.
 */
export function selectMenuSwapRows<T>(
  themeRows: readonly T[],
  pluginRows: readonly T[] | null | undefined,
  decision: MenuRendererDecision,
): readonly T[] {
  if (decision.kind !== "plugin") return themeRows;
  return pluginRows && pluginRows.length > 0 ? pluginRows : themeRows;
}

/**
 * What a renderer mount point accepts for a slot swap. `claims` carries the
 * review approval flag, `grantedScopes` the install's scopes; rows flow
 * through the engine-owned markup either as `pluginRows` or from a
 * `renderRows` seam (the review/test harness — throwing keeps the theme
 * rows, fail-open). `onError` overrides the default tagged `console.error`.
 */
export type MenuSwapRequest<T> = {
  claims: readonly MenuRendererClaim[];
  grantedScopes: readonly string[];
  pluginRows?: readonly T[];
  renderRows?: () => readonly T[];
  onError?: (error: unknown) => void;
};

/** Light shape guard for swap requests arriving over loosely-typed pipes. */
export function isMenuSwapRequest(value: unknown): value is MenuSwapRequest<unknown> {
  const r = (value ?? {}) as Record<string, unknown>;
  return (
    Array.isArray(r.claims) &&
    r.claims.length > 0 &&
    r.claims.every(isMenuRendererClaim) &&
    Array.isArray(r.grantedScopes)
  );
}

/**
 * One tested path for every menu mount point: gate the swap, then resolve
 * rows fail-open. Non-`plugin` decisions never invoke `renderRows` and
 * return the theme rows untouched.
 */
export function resolveMenuSwapRows<T>(
  themeRows: readonly T[],
  swap: MenuSwapRequest<T> | null | undefined,
  slot: MenuSlot,
): { rows: readonly T[]; decision: MenuRendererDecision } {
  const decision = decideMenuRenderer(swap?.claims, slot, swap?.grantedScopes);
  if (decision.kind !== "plugin") return { rows: themeRows, decision };
  const rows = renderMenuWithFallback(
    decision,
    () => {
      const out =
        typeof swap?.renderRows === "function"
          ? swap.renderRows()
          : swap?.pluginRows;
      const list = Array.isArray(out) ? out : [];
      return list.length > 0 ? list : themeRows;
    },
    () => themeRows,
    swap?.onError,
  );
  return { rows, decision };
}

export type SettingKind =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "textarea"
  | "color"
  | "media"
  | "url"
  | "date";
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
  /** Block slots plus the sanctioned menu fill points (`MENU_SLOTS`). */
  slots: (BlockSlot | MenuSlot)[];
  /** Sandboxed bundle entry evaluated inside the island's null-origin frame. */
  entry: string;
  /**
   * Class B (themeable): the versioned theme-safe contract
   * (schema/data/actions/slots/states) the theme dresses. Absent means
   * Class A (isolated): the bundle owns arbitrary UI in the sandbox frame.
   */
  themeable?: PluginThemeContract;
  height?: number;
  /**
   * Floating widgets (chat bubbles) are hosted by the parent in a
   * viewport-fixed 56px frame. The entry must render in-flow (fill the
   * frame) — `position:fixed` inside the entry resolves against the tiny
   * iframe viewport, never the page, and renders clipped/invisible.
   */
  floating?: boolean;
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: { name: string; email?: string; url?: string } | string;
  homepage?: string;
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
  const m = /^plugin:([a-z][a-z0-9-]{2,39})\/([a-z][a-z0-9_-]{1,39})$/.exec(
    key.trim(),
  );
  return m ? { pluginId: m[1], widget: m[2] } : null;
}

// ------------------------------------------------------------ compatibility

/** Supports `^x.y.z` and `>=a.b.c <d.e.f`; anything else is rejected. */
export function satisfiesApiRange(
  range: string,
  api = BUILDER_API_VERSION,
): boolean {
  const target = parseSemver(api);
  if (!target) return false;
  const caret = /^\^(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (caret) {
    const base = parseSemver(caret[1]);
    if (!base) return false;
    return base.major === target.major && compareSemver(api, caret[1]) >= 0;
  }
  const pair = /^>=\s*(\d+\.\d+\.\d+)\s+<\s*(\d+\.\d+\.\d+)$/.exec(
    range.trim(),
  );
  if (pair) {
    return compareSemver(api, pair[1]) >= 0 && compareSemver(api, pair[2]) < 0;
  }
  return false;
}

// --------------------------------------------------------------- validation

export type ManifestVerdict =
  | { ok: true; manifest: PluginManifest; warnings: string[] }
  | { ok: false; errors: string[] };

function settingField(
  raw: unknown,
  errors: string[],
  index: number,
): SettingField | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const key = String(r.key ?? "");
  if (!KEY_RE.test(key)) {
    errors.push(`settings[${index}].key`);
    return null;
  }
  const kind = String(r.kind ?? "text") as SettingKind;
  if (
    ![
      "text",
      "number",
      "boolean",
      "select",
      "textarea",
      "color",
      "media",
      "url",
      "date",
    ].includes(kind)
  ) {
    errors.push(`settings[${index}].kind`);
    return null;
  }
  const options = Array.isArray(r.options)
    ? r.options
        .map((o) => o as Record<string, unknown>)
        .filter((o) => typeof o?.value === "string")
        .map((o) => ({
          value: String(o.value),
          label: String(o.label ?? o.value),
        }))
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

  const id = String(raw.id ?? "")
    .trim()
    .toLowerCase();
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
  if (hooks.length && !/^https:\/\/[^\s]+$/.test(hooksUrl))
    errors.push("hooksUrl");

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
      .filter(
        (
          s,
        ): s is BlockSlot | MenuSlot =>
          (BLOCK_SLOTS as readonly string[]).includes(s) ||
          (MENU_SLOTS as readonly string[]).includes(s),
      );
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
    // Class B (themeable): the declaration is optional, but when present it
    // must be a well-formed v1 contract — malformed declarations fail the
    // gate instead of silently rendering as Class A.
    let themeable: PluginThemeContract | undefined;
    if (r.themeable !== undefined) {
      const contract = normalizeThemeContract(r.themeable);
      if (!contract) {
        errors.push(`widgets[${i}].themeable`);
        return;
      }
      themeable = contract;
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
      ...(themeable ? { themeable } : {}),
      height:
        typeof r.height === "number"
          ? Math.min(1200, Math.max(80, r.height))
          : 320,
      ...(r.floating === true ? { floating: true as const } : {}),
    });
  });
  if (
    widgets.some((w) => w.slots.length) &&
    !scopes.includes("render_storefront")
  ) {
    errors.push("permissions.render_storefront_required");
  }

  const settings: SettingField[] = [];
  (Array.isArray(raw.settings) ? raw.settings : []).forEach((s, i) => {
    const field = settingField(s, errors, i);
    if (field && !settings.some((f) => f.key === field.key))
      settings.push(field);
  });

  const i18nRaw = (raw.i18n ?? {}) as Record<string, unknown>;
  const dict = (v: unknown) => {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(
      (v ?? {}) as Record<string, unknown>,
    )) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  };
  const i18n = { en: dict(i18nRaw.en), bn: dict(i18nRaw.bn) };
  const missingBn = Object.keys(i18n.en).filter((k) => !i18n.bn[k]);
  if (missingBn.length) warnings.push(`i18n.bn_missing:${missingBn.length}`);

  const budgetRaw = (raw.budget ?? {}) as Record<string, unknown>;
  const budget = {
    jsKb:
      typeof budgetRaw.jsKb === "number" ? budgetRaw.jsKb : PLUGIN_BUDGET.jsKb,
    mainThreadMs:
      typeof budgetRaw.mainThreadMs === "number"
        ? budgetRaw.mainThreadMs
        : PLUGIN_BUDGET.mainThreadMs,
  };
  if (budget.jsKb > PLUGIN_BUDGET.jsKb) errors.push("budget.jsKb");
  if (budget.mainThreadMs > PLUGIN_BUDGET.mainThreadMs)
    errors.push("budget.mainThreadMs");

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

export function defaultSettings(
  schema: readonly SettingField[],
): SettingsValues {
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
    } else if (f.kind === "textarea")
      out[f.key] = String(v).slice(0, f.max ?? 2000);
    else if (f.kind === "color") {
      const s = String(v);
      if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) {
        errors.push(`${f.key}.not_a_color`);
        continue;
      }
      out[f.key] = s;
    } else if (f.kind === "media" || f.kind === "url") {
      const s = String(v);
      if (s !== "" && !/^https?:\/\//.test(s)) {
        errors.push(`${f.key}.not_a_url`);
        continue;
      }
      out[f.key] = s;
    } else if (f.kind === "date") {
      const s = String(v);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
        errors.push(`${f.key}.not_a_date`);
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
  /** Per-install auto-updates flag (`plugin_state.auto_updates`, Task 2 column). */
  autoUpdates?: boolean;
};

export type PluginResolution =
  | { ok: true; plugin: InstalledPlugin; widget: PluginWidgetDef }
  | {
      ok: false;
      /** Every failure renders a labelled placeholder — never a crash. */
      reason:
        | "bad_key"
        | "not_installed"
        | "unknown_widget"
        | "incompatible"
        | "disabled";
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
  if (!plugin)
    return { ok: false, reason: "not_installed", pluginId: parsed.pluginId };
  if (!plugin.enabled)
    return { ok: false, reason: "disabled", pluginId: parsed.pluginId };
  if (!satisfiesApiRange(plugin.manifest.api, api))
    return { ok: false, reason: "incompatible", pluginId: parsed.pluginId };
  const widget = plugin.manifest.widgets.find((w) => w.key === parsed.widget);
  if (!widget)
    return { ok: false, reason: "unknown_widget", pluginId: parsed.pluginId };
  return { ok: true, plugin, widget };
}

/** Tray entries: every widget an installed, compatible plugin contributes. */
export function pluginTrayEntries(
  installed: readonly InstalledPlugin[],
  slot: BlockSlot | MenuSlot,
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

/* ---------------------------------------------- tier vocabulary (T1.3)
 *
 * Core/community tier vocabulary. Vocabulary only: this block adds no
 * branches, no exports, no behavior; every mechanism claim pins its source.
 *
 * - Core tier: the closed `SectionType` enum
 *   (`src/lib/builder-ast.ts:212`). Core widgets render through native theme
 *   branches and take the active theme's token-driven presentation (gated by
 *   `stays token-driven` in `src/lib/themes/songoskriti/skins.test.ts:182`).
 *   Third-party code never adds a core branch: `plugin_block` is the only
 *   plugin branch, rendered through the one sandboxed island
 *   (`src/components/builder/PluginBlock.tsx:11-16`).
 * - Community tier: every widget addressed `plugin:{pluginId}/{widget}`
 *   (`pluginWidgetKey` / `parsePluginWidgetKey` above) and mounted inside
 *   the published theme (`render_storefront` in
 *   `src/lib/marketplace-scopes.ts:82-88`). The bundle runs in the
 *   null-origin `WidgetSandbox` frame and reaches the app only through the
 *   scoped `postMessage` bridge (`authorizeWidgetCall` in
 *   `src/lib/marketplace-scopes.ts:341-360`); every failure renders a
 *   labeled placeholder, never a crash (`PluginResolution` above).
 *
 * Rule: plugins provide functionality, themes dress them — a community
 * widget mounted under Theme A renders Theme A's presentation, and the same
 * install under Theme B renders Theme B's. Theme tokens reach the bundle
 * through `shop.info` behind `read_shop`
 * (`src/lib/marketplace-scopes.ts:26-32`).
 *
 * TBD (aspiration, not mechanism): the frame isolates bundle DOM and CSS,
 * so a theme cannot restyle inside a community widget today. See the tier
 * section in `docs/developers/review-policy.md` for the gap.
 */
