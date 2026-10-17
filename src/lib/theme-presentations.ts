/**
 * Per-widget theme presentation registry (REGISTRY CORE lane).
 *
 * Maps themeKey × widgetType → presentation Component, owned by themes:
 * a theme claims a pair by calling `registerThemePresentation` (typically
 * from its own module init), and the engine (`SectionRenderer`) resolves
 * through `resolveThemePresentation` in the component lookup path,
 * falling back to the existing resolution when no presentation is
 * registered — zero behavior change for unregistered pairs.
 *
 * Contracts (the header/docs lanes must follow these):
 * - Registration is first-wins: a duplicate registration warns and keeps
 *   the first Component. Registration never throws.
 * - Resolution never throws: unknown / null / missing keys return the
 *   caller-supplied fallback (usually the existing
 *   `resolveWidgetComponent` result), or undefined when no fallback is
 *   given. Unknown themes NEVER resolve to another theme's presentation.
 * - This module names no theme and branches on no theme: lookup is an
 *   opaque two-level Map. Types reference only `WidgetComponent` and
 *   `SectionType` — never theme modules (type-only imports, erased at
 *   runtime, so zero theme imports in shared code).
 */
import type { SectionType } from "./builder-ast";
import type { WidgetComponent } from "@/components/builder/widgets";

/** themeKey → (widgetType → presentation Component). Keys are normalized
 * (trim+lowercase) at register and resolve — case/padding variants address
 * the SAME entry instead of shadowing as distinct keys. */
const PRESENTATIONS = new Map<string, Map<SectionType, WidgetComponent>>();

/** Owners marked unavailable present nothing on ANY map (unified gate). */
const THEME_OWNER_AVAILABILITY = new Map<string, boolean>();

/**
 * Normalize a core theme/owner key (trim+lowercase), or null for empty /
 * non-string input. Core maps (PRESENTATIONS, THEME_OWNED_COMPONENTS, unified
 * availability) are case-insensitive by design: `" Acme "` and `"acme"` are
 * one owner. (Versioned dressing owners stay
 * case-sensitive — pinned by the adversarial suite — and consult the unified
 * gate case-insensitively IN ADDITION to their own flag.)
 */
function normalizeCoreOwnerKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase();
  return clean ? clean : null;
}

/**
 * Normalize a core widget type (trim+lowercase), or null for empty /
 * non-string input. Identity for every valid `SectionType` (all lowercase
 * snake_case), so well-formed callers see zero behavior change.
 */
function normalizeCoreWidgetType(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase();
  return clean ? clean : null;
}

/**
 * Normalize a theme-owned widget id (trim+lowercase), or null when it is not
 * a `theme:` id. Lowercasing the whole id merges case variants of the owner
 * AND widget segments (`THEME:Alpha/Widget-A` ≡ `theme:alpha/widget-a`);
 * registry ids are lowercase by gate construction, so valid ids are fixed
 * points.
 */
function normalizeThemeOwnedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().toLowerCase();
  if (!clean || !clean.startsWith("theme:")) return null;
  return clean;
}

/** Owner segment of a NORMALIZED `theme:<owner>/...` id, else `""`. */
function ownerOfNormalizedThemeId(normalizedId: string): string {
  const rest = normalizedId.slice("theme:".length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return "";
  return rest.slice(0, slash);
}

/** True unless the (normalized) owner was explicitly marked unavailable. */
function isCoreOwnerAvailable(normalizedOwner: string): boolean {
  try {
    return THEME_OWNER_AVAILABILITY.get(normalizedOwner) !== false;
  } catch {
    return false;
  }
}

/**
 * Claim one themeKey × widgetType pair for a presentation Component.
 * Owned by themes: only theme modules call this. First registration wins;
 * duplicates warn and are ignored. Keys normalize (trim+lowercase), so a
 * padded/cased duplicate warns as a duplicate instead of shadowing. Never
 * throws (invalid input warns and returns).
 */
export function registerThemePresentation(
  themeKey: string,
  widgetType: SectionType,
  Component: WidgetComponent,
): void {
  const ownerKey = normalizeCoreOwnerKey(themeKey);
  const widgetKey = normalizeCoreWidgetType(widgetType as unknown);
  if (!ownerKey || !widgetKey) {
    console.warn(
      `[theme-presentations] ignoring registration for empty theme key (${String(widgetType)}).`,
    );
    return;
  }
  if (typeof Component !== "function") {
    console.warn(
      `[theme-presentations] ignoring registration for ${ownerKey}/${widgetKey}: not a component.`,
    );
    return;
  }
  let byWidget = PRESENTATIONS.get(ownerKey);
  if (!byWidget) {
    byWidget = new Map<SectionType, WidgetComponent>();
    PRESENTATIONS.set(ownerKey, byWidget);
  }
  const typedWidgetKey = widgetKey as SectionType;
  if (byWidget.has(typedWidgetKey)) {
    console.warn(
      `[theme-presentations] duplicate registration for ${ownerKey}/${widgetKey} ignored; keeping the first.`,
    );
    return;
  }
  byWidget.set(typedWidgetKey, Component);
}

/**
 * Resolve the registered presentation for a themeKey × widgetType pair,
 * or the caller-supplied fallback (the existing resolution result) when
 * nothing is registered or the owner is marked unavailable (see
 * `setThemeOwnerAvailability` — unavailable owners dress nothing, so the
 * caller keeps the recoverable placeholder with authored props preserved).
 * Never throws — unknown themes, null keys and missing widgets all fall back
 * instead of leaking another theme's brand.
 */
export function resolveThemePresentation(
  themeKey: string | null | undefined,
  widgetType: SectionType,
  fallback?: WidgetComponent | undefined,
): WidgetComponent | undefined {
  try {
    const ownerKey = normalizeCoreOwnerKey(themeKey);
    const widgetKey = normalizeCoreWidgetType(widgetType as unknown);
    if (!ownerKey || !widgetKey) return fallback;
    if (!isCoreOwnerAvailable(ownerKey)) return fallback;
    const hit = PRESENTATIONS.get(ownerKey)?.get(widgetKey as SectionType);
    return hit ?? fallback;
  } catch {
    return fallback;
  }
}

/** Test-only reset: drops every registration (isolates suites). */
export function clearThemePresentations(): void {
  PRESENTATIONS.clear();
  THEME_OWNED_COMPONENTS.clear();
  VERSIONED_DRESSINGS.clear();
  VERSIONED_AVAILABILITY.clear();
  THEME_OWNER_AVAILABILITY.clear();
}

/* --------------------------------------- versioned namespaced dressings */

/**
 * Versioned namespaced presentation contract (DRESSING lane).
 *
 * Lets an owner dress built-in AND compatible third-party widgets through a
 * registration keyed by (owner, widget id, version range) with a builder-API
 * compatibility floor. The widget id is namespaced (`<ns>:<rest>`, for
 * example a builtin id or a third-party plugin id); the version range is a
 * semver subset (`*`, exact, caret, tilde, comparator sets); the floor is a
 * minimum builder API triple.
 *
 * Deterministic resolution rules (`resolveVersionedPresentation`):
 * - R1 owner scope: only the requesting owner's dressings are ever
 *   considered. A miss returns the caller-supplied fallback (or undefined),
 *   never another owner's component.
 * - R2 availability: an owner marked unavailable dresses nothing (miss).
 * - R3 version gate: a dressing matches when its range holds the caller's
 *   widget version. An unknown/garbage widget version matches ONLY wildcard
 *   dressings — a pinned range never renders without version evidence.
 * - R4 API floor: a dressing with a floor matches only when the caller's
 *   builder API parses and meets the floor. Without caller evidence only
 *   floor-less dressings match.
 * - R5 specificity: among the survivors the most specific range wins
 *   (exact > caret/tilde > bounded comparator set > half-bounded comparator
 *   > wildcard); ties keep the first registration.
 *
 * Contracts (mirroring the tables above):
 * - Registration is first-wins on the exact (owner, widget id, normalized
 *   range) triple: duplicates warn and keep the first. Registration never
 *   throws (invalid input warns and returns).
 * - Resolution/compatibility/migration never throw and never cross owners.
 * - This module names no owner and branches on no owner: lookup is opaque
 *   nested Maps keyed by the normalized owner and widget id.
 *
 * Swap-in points (adopters wire these; this module renders nothing):
 * - renderer: beside the existing presentation call — map a hit component to
 *   the node and render a miss as the existing unavailable placeholder with
 *   the authored props preserved.
 * - activation gate: before a theme switch — run
 *   `checkVersionedCompatibility` over the page's widget ids and carry
 *   settings forward with `migrateVersionedProps` (validated migration or an
 *   explicit incompatibility state, never a silent foreign render).
 */

export type VersionedPresentationMigrate = (
  prevProps: Record<string, unknown>,
) => Record<string, unknown> | null | undefined;

export type VersionedPresentationEntry = {
  /** Opaque owner key claiming this dressing. */
  owner: string;
  /** Namespaced widget id this dressing presents (`<ns>:<rest>`). */
  widgetId: string;
  /** Semver range (`*`, exact, `^`, `~`, comparator set). `""` means any. */
  versionRange: string;
  /** Minimum builder API triple; absent means no floor. */
  minBuilderApi?: string;
  /** Presentation component for the (owner, widget, range) triple. */
  component: WidgetComponent;
  /**
   * Settings migration for a theme switch. Receives a hostile-stripped clone
   * of the authored props and returns the carried-forward props, or null to
   * declare an explicit incompatibility. Absent means pass-through.
   */
  migrate?: VersionedPresentationMigrate;
};

export type VersionedResolveOptions = {
  /** Registry widget version the caller runs; absent tracks any. */
  widgetVersion?: string;
  /** Builder API the caller runs; absent means no floor evidence. */
  builderApi?: string;
  /** Returned on a miss (usually the existing resolution result). */
  fallback?: WidgetComponent | undefined;
};

export type VersionedCompatReason =
  | "compatible"
  | "bad_key"
  | "unknown"
  | "unavailable"
  | "incompatible-version"
  | "incompatible-api";

export type VersionedCompatResult =
  | { compatible: true; reason: "compatible" }
  | {
      compatible: false;
      reason:
        | "bad_key"
        | "unknown"
        | "unavailable"
        | "incompatible-version"
        | "incompatible-api";
    };

export type VersionedMigrateOptions = {
  /** Widget version the settings were authored under. */
  fromVersion?: string;
  /** Widget version the target dressing must satisfy. */
  toVersion?: string;
  /** Builder API the target runs under. */
  builderApi?: string;
};

export type VersionedMigrateResult =
  | { ok: true; migrated: boolean; props: Record<string, unknown> }
  | {
      ok: false;
      reason:
        | "bad_key"
        | "unknown"
        | "unavailable"
        | "incompatible-version"
        | "incompatible-api"
        | "incompatible"
        | "migration-failed";
      preservedProps: Record<string, unknown>;
    };

type VersionTriple = [number, number, number];

type StoredDressing = {
  rangeText: string;
  kind: "wild" | "exact" | "caret" | "tilde" | "comparators";
  exact?: VersionTriple;
  base?: VersionTriple;
  upper?: VersionTriple;
  comparators?: ReadonlyArray<{ op: string; ver: VersionTriple }>;
  boundedBelow?: boolean;
  boundedAbove?: boolean;
  specificity: number;
  floor: VersionTriple | null;
  component: WidgetComponent;
  migrate?: VersionedPresentationMigrate;
};

/** owner → (widget id → dressings in registration order). */
const VERSIONED_DRESSINGS = new Map<string, Map<string, StoredDressing[]>>();

/** Owners marked unavailable dress nothing (miss with data preserved). */
const VERSIONED_AVAILABILITY = new Map<string, boolean>();

const VERSIONED_OWNER_MAX = 128;
const VERSIONED_WIDGET_MAX = 256;
const VERSIONED_RANGE_MAX = 128;
const VERSIONED_TRIPLE_MAX = 64;
const VERSIONED_PART_MAX = 9;

const VERSIONED_WIDGET_RE = /^[A-Za-z][A-Za-z0-9_-]*:[^\s:][^\s]*$/;
const VERSIONED_TRIPLE_RE = /^[v=]?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;
const VERSIONED_COMPARATOR_RE =
  /^(>=|<=|>|<|=)?v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/;

function versionedWarn(message: string): void {
  console.warn(`[theme-presentations] ${message}`);
}

function versionedCleanRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k] = v;
  }
  return out;
}

function versionedClone(
  value: Record<string, unknown>,
): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(JSON.stringify(value));
    return versionedCleanRecord(parsed);
  } catch {
    return {};
  }
}

function normalizeVersionedOwner(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > VERSIONED_OWNER_MAX) return null;
  return clean;
}

function normalizeVersionedWidget(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean || clean.length > VERSIONED_WIDGET_MAX) return null;
  if (!VERSIONED_WIDGET_RE.test(clean)) return null;
  return clean;
}

function parseVersionTriple(raw: unknown): VersionTriple | null {
  if (typeof raw !== "string") return null;
  const clean = raw.trim();
  if (!clean || clean.length > VERSIONED_TRIPLE_MAX) return null;
  const m = VERSIONED_TRIPLE_RE.exec(clean);
  if (!m) return null;
  const parts = [m[1]!, m[2]!, m[3]!];
  for (const part of parts) {
    if (part.length > VERSIONED_PART_MAX) return null;
  }
  const triple: VersionTriple = [
    Number(parts[0]),
    Number(parts[1]),
    Number(parts[2]),
  ];
  if (!triple.every((n) => Number.isSafeInteger(n) && n >= 0)) return null;
  return triple;
}

function compareTriples(a: VersionTriple, b: VersionTriple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  }
  return 0;
}

function caretUpper(base: VersionTriple): VersionTriple {
  if (base[0] > 0) return [base[0] + 1, 0, 0];
  if (base[1] > 0) return [0, base[1] + 1, 0];
  return [0, 0, base[2] + 1];
}

function parseVersionRange(raw: string): StoredDressing | null {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "" || text === "*" || text === "x" || text === "X") {
    return {
      rangeText: "*",
      kind: "wild",
      specificity: 0,
      floor: null,
      component: (() => null) as WidgetComponent,
    };
  }
  const exact = parseVersionTriple(text);
  if (exact) {
    return {
      rangeText: `${exact[0]}.${exact[1]}.${exact[2]}`,
      kind: "exact",
      exact,
      specificity: 4,
      floor: null,
      component: (() => null) as WidgetComponent,
    };
  }
  const first = text.charAt(0);
  if (first === "^" || first === "~") {
    const base = parseVersionTriple(text.slice(1));
    if (!base) return null;
    const upper: VersionTriple =
      first === "^" ? caretUpper(base) : [base[0], base[1] + 1, 0];
    return {
      rangeText: `${first}${base[0]}.${base[1]}.${base[2]}`,
      kind: first === "^" ? "caret" : "tilde",
      base,
      upper,
      specificity: 3,
      floor: null,
      component: (() => null) as WidgetComponent,
    };
  }
  const parts = text.split(" ").filter((p) => p.length > 0);
  if (parts.length === 0 || parts.length > 4) return null;
  const comparators: Array<{ op: string; ver: VersionTriple }> = [];
  for (const part of parts) {
    const m = VERSIONED_COMPARATOR_RE.exec(part);
    if (!m) return null;
    const triple: VersionTriple = [Number(m[2]), Number(m[3]), Number(m[4])];
    if (
      m[2]!.length > VERSIONED_PART_MAX ||
      m[3]!.length > VERSIONED_PART_MAX ||
      m[4]!.length > VERSIONED_PART_MAX ||
      !triple.every((n) => Number.isSafeInteger(n) && n >= 0)
    ) {
      return null;
    }
    comparators.push({ op: m[1] ?? "=", ver: triple });
  }
  let boundedBelow = false;
  let boundedAbove = false;
  for (const c of comparators) {
    if (c.op === ">" || c.op === ">=" || c.op === "=") boundedBelow = true;
    if (c.op === "<" || c.op === "<=" || c.op === "=") boundedAbove = true;
  }
  return {
    rangeText: parts.join(" "),
    kind: "comparators",
    comparators,
    boundedBelow,
    boundedAbove,
    specificity: boundedBelow && boundedAbove ? 2 : 1,
    floor: null,
    component: (() => null) as WidgetComponent,
  };
}

function dressingMatchesVersion(
  stored: StoredDressing,
  ver: VersionTriple | null,
): boolean {
  if (stored.kind === "wild") return true;
  if (!ver) return false;
  if (stored.kind === "exact" && stored.exact) {
    return compareTriples(ver, stored.exact) === 0;
  }
  if (
    (stored.kind === "caret" || stored.kind === "tilde") &&
    stored.base &&
    stored.upper
  ) {
    return (
      compareTriples(ver, stored.base) >= 0 &&
      compareTriples(ver, stored.upper) < 0
    );
  }
  if (stored.kind === "comparators" && stored.comparators) {
    for (const c of stored.comparators) {
      const cmp = compareTriples(ver, c.ver);
      if (c.op === "=" && cmp !== 0) return false;
      if (c.op === ">" && cmp <= 0) return false;
      if (c.op === ">=" && cmp < 0) return false;
      if (c.op === "<" && cmp >= 0) return false;
      if (c.op === "<=" && cmp > 0) return false;
    }
    return true;
  }
  return false;
}

function dressingPassesFloor(
  stored: StoredDressing,
  api: VersionTriple | null,
): boolean {
  if (!stored.floor) return true;
  if (!api) return false;
  return compareTriples(api, stored.floor) >= 0;
}

/**
 * Claim one (owner, widget id, version range) triple for a presentation
 * component. Only owner modules call this. First registration on the exact
 * triple wins; duplicates warn and are ignored. Overlapping ranges coexist
 * and resolve by specificity. Never throws.
 */
export function registerVersionedPresentation(entry: unknown): void {
  try {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      versionedWarn("ignoring versioned registration: not an entry object.");
      return;
    }
    const bag = entry as Partial<VersionedPresentationEntry>;
    const owner = normalizeVersionedOwner(bag.owner);
    if (!owner) {
      versionedWarn("ignoring versioned registration for an empty owner.");
      return;
    }
    const widgetId = normalizeVersionedWidget(bag.widgetId);
    if (!widgetId) {
      versionedWarn(
        `ignoring versioned registration for ${owner}: not a namespaced widget id.`,
      );
      return;
    }
    if (typeof bag.versionRange !== "string") {
      versionedWarn(
        `ignoring versioned registration for ${owner}/${widgetId}: bad version range.`,
      );
      return;
    }
    const trimmedRange = bag.versionRange.trim();
    if (trimmedRange.length > VERSIONED_RANGE_MAX) {
      versionedWarn(
        `ignoring versioned registration for ${owner}/${widgetId}: version range too long.`,
      );
      return;
    }
    const parsed = parseVersionRange(trimmedRange);
    if (!parsed) {
      versionedWarn(
        `ignoring versioned registration for ${owner}/${widgetId}: unparsable version range.`,
      );
      return;
    }
    let floor: VersionTriple | null = null;
    if (bag.minBuilderApi !== undefined) {
      const triple = parseVersionTriple(bag.minBuilderApi);
      if (!triple) {
        versionedWarn(
          `ignoring versioned registration for ${owner}/${widgetId}: bad builder-API floor.`,
        );
        return;
      }
      floor = triple;
    }
    if (typeof bag.component !== "function") {
      versionedWarn(
        `ignoring versioned registration for ${owner}/${widgetId}: not a component.`,
      );
      return;
    }
    if (bag.migrate !== undefined && typeof bag.migrate !== "function") {
      versionedWarn(
        `ignoring versioned registration for ${owner}/${widgetId}: bad migrate hook.`,
      );
      return;
    }
    let byWidget = VERSIONED_DRESSINGS.get(owner);
    if (!byWidget) {
      byWidget = new Map<string, StoredDressing[]>();
      VERSIONED_DRESSINGS.set(owner, byWidget);
    }
    let bucket = byWidget.get(widgetId);
    if (!bucket) {
      bucket = [];
      byWidget.set(widgetId, bucket);
    }
    for (const existing of bucket) {
      if (existing.rangeText === parsed.rangeText) {
        versionedWarn(
          `duplicate versioned registration for ${owner}/${widgetId}@${parsed.rangeText} ignored; keeping the first.`,
        );
        return;
      }
    }
    bucket.push({
      ...parsed,
      floor,
      component: bag.component,
      migrate: bag.migrate,
    });
  } catch {
    versionedWarn("ignoring versioned registration after an internal error.");
  }
}

/**
 * Resolve the requesting owner's dressing for a widget id, or the
 * caller-supplied fallback when nothing compatible is registered. Follows
 * rules R1–R5 above. Never throws; never returns another owner's component.
 */
export function resolveVersionedPresentation(
  owner: string | null | undefined,
  widgetId: string | null | undefined,
  opts?: VersionedResolveOptions,
): WidgetComponent | undefined {
  try {
    const fallback =
      opts && typeof opts.fallback === "function" ? opts.fallback : undefined;
    const ownerKey = normalizeVersionedOwner(owner);
    const widgetKey = normalizeVersionedWidget(widgetId);
    if (!ownerKey || !widgetKey) return fallback;
    if (isVersionedOwnerBlocked(ownerKey)) return fallback;
    const bucket = VERSIONED_DRESSINGS.get(ownerKey)?.get(widgetKey);
    if (!bucket || bucket.length === 0) return fallback;
    const ver =
      opts && typeof opts.widgetVersion === "string"
        ? parseVersionTriple(opts.widgetVersion)
        : null;
    const api =
      opts && typeof opts.builderApi === "string"
        ? parseVersionTriple(opts.builderApi)
        : null;
    let best: StoredDressing | null = null;
    for (const candidate of bucket) {
      if (!dressingPassesFloor(candidate, api)) continue;
      if (!dressingMatchesVersion(candidate, ver)) continue;
      if (!best || candidate.specificity > best.specificity) best = candidate;
    }
    return best ? best.component : fallback;
  } catch {
    return opts && typeof opts.fallback === "function"
      ? opts.fallback
      : undefined;
  }
}

/**
 * Mark an owner's dressings available or unavailable (owning-theme
 * disabled/unavailable gate). Unavailable owners resolve to a miss so the
 * caller keeps the recoverable placeholder with the authored props
 * preserved. Never throws.
 */
export function setVersionedPresentationAvailability(
  owner: unknown,
  available: unknown,
): void {
  try {
    const ownerKey = normalizeVersionedOwner(owner);
    if (!ownerKey) {
      versionedWarn("ignoring availability update for an empty owner.");
      return;
    }
    if (typeof available !== "boolean") {
      versionedWarn(
        `ignoring availability update for ${ownerKey}: not a boolean.`,
      );
      return;
    }
    VERSIONED_AVAILABILITY.set(ownerKey, available);
  } catch {
    versionedWarn("ignoring availability update after an internal error.");
  }
}

/** Whether an owner's dressings currently resolve (default true). */
export function isVersionedOwnerAvailable(owner: unknown): boolean {
  try {
    const ownerKey = normalizeVersionedOwner(owner);
    if (!ownerKey) return false;
    return VERSIONED_AVAILABILITY.get(ownerKey) !== false;
  } catch {
    return false;
  }
}

/**
 * Mark an owner's presentations available or unavailable across ALL THREE
 * maps (core PRESENTATIONS, THEME_OWNED_COMPONENTS, versioned dressings).
 * Unavailable owners resolve to a miss/fallback so the caller keeps the
 * recoverable placeholder with the authored props preserved — never a
 * foreign render. Keys normalize (trim+lowercase), so padded/cased spellings
 * flip the same owner. OR-of-unavailable with the versioned flag: EITHER
 * `setVersionedPresentationAvailability(owner, false)` OR this API with
 * `false` blocks versioned resolution; re-enable via the SAME API that
 * disabled it. Never throws.
 */
export function setThemeOwnerAvailability(
  owner: unknown,
  available: unknown,
): void {
  try {
    const ownerKey = normalizeCoreOwnerKey(owner);
    if (!ownerKey) {
      versionedWarn("ignoring availability update for an empty owner.");
      return;
    }
    if (typeof available !== "boolean") {
      versionedWarn(
        `ignoring availability update for ${ownerKey}: not a boolean.`,
      );
      return;
    }
    THEME_OWNER_AVAILABILITY.set(ownerKey, available);
  } catch {
    versionedWarn("ignoring availability update after an internal error.");
  }
}

/** Whether an owner's presentations currently resolve on every map (default true). */
export function isThemeOwnerAvailable(owner: unknown): boolean {
  try {
    const ownerKey = normalizeCoreOwnerKey(owner);
    if (!ownerKey) return false;
    return THEME_OWNER_AVAILABILITY.get(ownerKey) !== false;
  } catch {
    return false;
  }
}

/**
 * True when EITHER availability flag blocks this versioned owner: its own
 * case-sensitive flag, or the unified case-insensitive gate above.
 */
function isVersionedOwnerBlocked(ownerKey: string): boolean {
  try {
    if (VERSIONED_AVAILABILITY.get(ownerKey) === false) return true;
    return THEME_OWNER_AVAILABILITY.get(ownerKey.toLowerCase()) === false;
  } catch {
    return false;
  }
}

function versionedCompatOf(
  bucket: StoredDressing[] | undefined,
  ver: VersionTriple | null,
  api: VersionTriple | null,
  ownerReady: boolean,
): VersionedCompatResult {
  if (!ownerReady) return { compatible: false, reason: "unavailable" };
  if (!bucket || bucket.length === 0)
    return { compatible: false, reason: "unknown" };
  const versionHits = bucket.filter((d) => dressingMatchesVersion(d, ver));
  if (versionHits.length === 0)
    return { compatible: false, reason: "incompatible-version" };
  const floorHits = versionHits.filter((d) => dressingPassesFloor(d, api));
  if (floorHits.length === 0)
    return { compatible: false, reason: "incompatible-api" };
  return { compatible: true, reason: "compatible" };
}

/**
 * Pre-switch compatibility for one widget under a target owner. Never
 * throws; every outcome is explicit so the caller can hold an
 * incompatibility state instead of rendering a foreign dressing.
 */
export function checkVersionedCompatibility(
  owner: string | null | undefined,
  widgetId: string | null | undefined,
  opts?: { widgetVersion?: string; builderApi?: string },
): VersionedCompatResult {
  try {
    const ownerKey = normalizeVersionedOwner(owner);
    const widgetKey = normalizeVersionedWidget(widgetId);
    if (!ownerKey || !widgetKey)
      return { compatible: false, reason: "bad_key" };
    const ver =
      opts && typeof opts.widgetVersion === "string"
        ? parseVersionTriple(opts.widgetVersion)
        : null;
    const api =
      opts && typeof opts.builderApi === "string"
        ? parseVersionTriple(opts.builderApi)
        : null;
    const bucket = VERSIONED_DRESSINGS.get(ownerKey)?.get(widgetKey);
    return versionedCompatOf(
      bucket,
      ver,
      api,
      !isVersionedOwnerBlocked(ownerKey),
    );
  } catch {
    return { compatible: false, reason: "unknown" };
  }
}

/**
 * Carry settings across a theme switch under the target owner: validated
 * migration when the target dressing defines one, pass-through when it does
 * not, or an explicit incompatibility holding the preserved props. Owner
 * scope, version gate and API floor mirror resolution, so a switch never
 * silently renders a foreign dressing. Never throws.
 */
export function migrateVersionedProps(
  owner: string | null | undefined,
  widgetId: string | null | undefined,
  prevProps: unknown,
  opts?: VersionedMigrateOptions,
): VersionedMigrateResult {
  try {
    const preserved = versionedClone(
      versionedCleanRecord(
        typeof prevProps === "object" && prevProps !== null ? prevProps : {},
      ),
    );
    const ownerKey = normalizeVersionedOwner(owner);
    const widgetKey = normalizeVersionedWidget(widgetId);
    if (!ownerKey || !widgetKey)
      return { ok: false, reason: "bad_key", preservedProps: preserved };
    if (isVersionedOwnerBlocked(ownerKey))
      return { ok: false, reason: "unavailable", preservedProps: preserved };
    const bucket = VERSIONED_DRESSINGS.get(ownerKey)?.get(widgetKey);
    if (!bucket || bucket.length === 0)
      return { ok: false, reason: "unknown", preservedProps: preserved };
    const target =
      opts && typeof opts.toVersion === "string"
        ? parseVersionTriple(opts.toVersion)
        : null;
    const api =
      opts && typeof opts.builderApi === "string"
        ? parseVersionTriple(opts.builderApi)
        : null;
    const compat = versionedCompatOf(bucket, target, api, true);
    if (!compat.compatible)
      return { ok: false, reason: compat.reason, preservedProps: preserved };
    let best: StoredDressing | null = null;
    for (const candidate of bucket) {
      if (!dressingPassesFloor(candidate, api)) continue;
      if (!dressingMatchesVersion(candidate, target)) continue;
      if (!best || candidate.specificity > best.specificity) best = candidate;
    }
    if (!best)
      return { ok: false, reason: "unknown", preservedProps: preserved };
    if (!best.migrate) return { ok: true, migrated: false, props: preserved };
    let next: unknown;
    try {
      next = best.migrate(preserved);
    } catch {
      return {
        ok: false,
        reason: "migration-failed",
        preservedProps: preserved,
      };
    }
    if (next === null || next === undefined)
      return { ok: false, reason: "incompatible", preservedProps: preserved };
    if (typeof next !== "object" || next === null || Array.isArray(next))
      return {
        ok: false,
        reason: "migration-failed",
        preservedProps: preserved,
      };
    return {
      ok: true,
      migrated: true,
      props: versionedClone(versionedCleanRecord(next)),
    };
  } catch {
    return { ok: false, reason: "unknown", preservedProps: {} };
  }
}

/* ------------------------------------------------- theme-owned widgets */

/**
 * Native theme-owned extension components (NATIVE theme-owned lane).
 *
 * Maps an exact registry widget id (`theme:<owner>/...`) to its trusted
 * in-repo component. Unlike the `SectionType`-keyed table above, this map
 * is keyed by the full widget identity the presentation resolver
 * (`resolvePresentation` in `src/lib/widget-presentation.ts`) recognizes,
 * so the renderer (`SectionRenderer` theme-owned branch) can execute the
 * owning-theme hit natively — same process as builtins, no sandbox.
 *
 * Contracts (mirroring the table above):
 * - Registration is first-wins: a duplicate registration warns and keeps
 *   the first Component. Registration never throws (invalid input warns
 *   and returns, so a hostile id can never evict an approved component).
 * - Resolution never throws: unknown / null / garbage ids return undefined
 *   (the caller keeps the explicit recoverable placeholder), never another
 *   owner's component.
 * - This module names no theme and branches on no theme: lookup is an
 *   opaque id → Component map. Only theme modules call the register side.
 */
const THEME_OWNED_COMPONENTS = new Map<string, WidgetComponent>();

/**
 * Claim one `theme:<owner>/...` widget id for a native Component. Owned
 * by themes: only theme modules call this (typically at module init,
 * alongside their WidgetDef registration). The id normalizes
 * (trim+lowercase), so case/padding variants claim the SAME entry instead of
 * shadowing. First registration wins; duplicates warn and are ignored.
 * Never throws.
 */
export function registerThemeOwnedComponent(
  widgetId: string,
  Component: WidgetComponent,
): void {
  const key = normalizeThemeOwnedId(widgetId);
  if (!key) {
    console.warn(
      `[theme-presentations] ignoring theme-owned registration for ${String(widgetId)}: not a theme widget id.`,
    );
    return;
  }
  if (typeof Component !== "function") {
    console.warn(
      `[theme-presentations] ignoring theme-owned registration for ${key}: not a component.`,
    );
    return;
  }
  if (THEME_OWNED_COMPONENTS.has(key)) {
    console.warn(
      `[theme-presentations] duplicate theme-owned registration for ${key} ignored; keeping the first.`,
    );
    return;
  }
  THEME_OWNED_COMPONENTS.set(key, Component);
}

/**
 * Resolve the native component for a `theme:<owner>/...` widget id, or
 * undefined when nothing is registered OR the owning theme is marked
 * unavailable (see `setThemeOwnerAvailability` — the caller keeps the
 * explicit recoverable placeholder). Never throws — unknown ids, garbage
 * input and unavailable owners resolve to undefined instead of leaking
 * another owner's brand.
 */
export function resolveThemeOwnedComponent(
  widgetId: string | null | undefined,
): WidgetComponent | undefined {
  try {
    const key = normalizeThemeOwnedId(widgetId);
    if (!key) return undefined;
    const owner = ownerOfNormalizedThemeId(key);
    if (owner && !isCoreOwnerAvailable(owner)) return undefined;
    return THEME_OWNED_COMPONENTS.get(key);
  } catch {
    return undefined;
  }
}
