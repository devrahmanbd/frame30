/**
 * Theme variations (Track T) — merchant-pickable token + default-skin presets.
 *
 * A theme variation is a named overlay on a theme's base look: token overrides
 * plus default-skin overrides ONLY. No new sections, no new widgets, no demo
 * data changes — the review surface stays small on purpose.
 *
 * Precedence (same rule as skins): base theme < active theme variation <
 * authored props. The merchant's inspector values always win; the variation
 * only changes what an *unset* key falls back to.
 *
 * Terminology: "theme variation" everywhere in this module. Never "product
 * variant" — that name belongs to the PDP commerce concept (see
 * `phase2-pdp.test.ts`, which pins pdp.tsx copy to the variant wording).
 */
import {
  WIDGET_SKINS,
  type PropValue,
  type Section,
  type SectionType,
  type SkinnableWidgetType,
  type ThemeTokens,
} from "./builder-ast";

/* ------------------------------------------------------------------ shape */

export type ThemeVariation = {
  /** URL-safe slug, unique per theme (`minimal`, `festive-refresh`). */
  key: string;
  /** Merchant-facing English label. */
  label: string;
  /** Merchant-facing Bangla label. */
  label_bn: string;
  /** Token overrides: flat token keys only, merged over the base tokens. */
  tokenOverrides: Partial<ThemeTokens>;
  /** Default-skin overrides: skinnable widget → skin name within its
   * vocabulary, merged over the theme's base widget defaults. */
  skinDefaults: Partial<Record<SkinnableWidgetType, string>>;
};

export const VARIATION_KEY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_VARIATION_KEY_LENGTH = 40;

/**
 * Token keys a variation may override. Flat scalar/presentation keys only —
 * `dark` (a designed object set), `globals` (the shared global palette),
 * `timezone` and `allowCustomerTimezone` (store settings, not look) stay
 * theme-owned so a variation can never smuggle structural settings.
 */
export const VARIATION_TOKEN_KEYS = [
  "brand",
  "accent",
  "surface",
  "ink",
  "radius",
  "fontDisplay",
  "fontBody",
  "container",
  "density",
  "typeScale",
  "spaceUnit",
  "shadow",
  "motion",
  "digits",
  "locale",
  "currencyDisplay",
  "fontPairing",
] as const;

type VariationTokenKey = (typeof VARIATION_TOKEN_KEYS)[number];

const VARIATION_TOKEN_SET = new Set<string>(VARIATION_TOKEN_KEYS);

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const LENGTH = /^\d{1,4}(?:px|rem)$/;
const FONT = /^[\w\s'-]{2,40}$/;

const TOKEN_VALUE_RULES: Record<
  VariationTokenKey,
  { test: (value: unknown) => boolean; hint: string }
> = {
  brand: { test: (v) => typeof v === "string" && HEX.test(v), hint: "hex color" },
  accent: {
    test: (v) => typeof v === "string" && HEX.test(v),
    hint: "hex color",
  },
  surface: {
    test: (v) => typeof v === "string" && HEX.test(v),
    hint: "hex color",
  },
  ink: { test: (v) => typeof v === "string" && HEX.test(v), hint: "hex color" },
  radius: {
    test: (v) => typeof v === "string" && LENGTH.test(v),
    hint: "length (px/rem)",
  },
  fontDisplay: {
    test: (v) => typeof v === "string" && FONT.test(v),
    hint: "font name",
  },
  fontBody: {
    test: (v) => typeof v === "string" && FONT.test(v),
    hint: "font name",
  },
  container: {
    test: (v) => typeof v === "string" && LENGTH.test(v),
    hint: "length (px/rem)",
  },
  density: {
    test: (v) => v === "dense" || v === "comfortable" || v === "airy",
    hint: "dense|comfortable|airy",
  },
  typeScale: {
    test: (v) => v === "compact" || v === "default" || v === "expressive",
    hint: "compact|default|expressive",
  },
  spaceUnit: {
    test: (v) => typeof v === "string" && LENGTH.test(v),
    hint: "length (px/rem)",
  },
  shadow: {
    test: (v) => v === "none" || v === "soft" || v === "lifted",
    hint: "none|soft|lifted",
  },
  motion: {
    test: (v) => v === "none" || v === "subtle" || v === "lively",
    hint: "none|subtle|lively",
  },
  digits: {
    test: (v) => v === "latin" || v === "bengali",
    hint: "latin|bengali",
  },
  locale: { test: (v) => v === "en" || v === "bn", hint: "en|bn" },
  currencyDisplay: {
    test: (v) => v === "symbol" || v === "code",
    hint: "symbol|code",
  },
  fontPairing: {
    test: (v) =>
      typeof v === "string" &&
      [
        "bengali-classic",
        "bengali-modern",
        "modern-sans",
        "editorial-mix",
        "editorial-serif",
        "editorial-bangla",
        "custom",
      ].includes(v),
    hint: "known font pairing",
  },
};

/* -------------------------------------------------------------- validation */

export type VariationValidation = { ok: true } | { ok: false; reason: string };

function fail(reason: string): VariationValidation {
  return { ok: false, reason };
}

/**
 * Validate a theme's variation list. Keys must be unique well-formed slugs;
 * token overrides are limited to known token keys with well-formed values;
 * skin defaults are limited to skinnable widget names with in-vocabulary
 * skin names. The first problem wins, with a reason naming theme + key.
 */
export function validateThemeVariations(
  themeKey: string,
  variations: ThemeVariation[],
): VariationValidation {
  const seen = new Set<string>();
  for (const variation of variations) {
    const where = `${themeKey} variation "${variation.key}"`;
    if (
      typeof variation.key !== "string" ||
      variation.key.length === 0 ||
      variation.key.length > MAX_VARIATION_KEY_LENGTH ||
      !VARIATION_KEY_RE.test(variation.key)
    ) {
      return fail(
        `${where}: key must be a lowercase slug ≤${MAX_VARIATION_KEY_LENGTH} chars.`,
      );
    }
    if (seen.has(variation.key))
      return fail(`${where}: duplicate variation key.`);
    seen.add(variation.key);
    if (
      typeof variation.label !== "string" ||
      !variation.label.trim() ||
      typeof variation.label_bn !== "string" ||
      !variation.label_bn.trim()
    ) {
      return fail(`${where}: label and label_bn must be non-empty.`);
    }
    const overrides = variation.tokenOverrides ?? {};
    for (const [tokenKey, value] of Object.entries(overrides)) {
      const rule = (TOKEN_VALUE_RULES as Record<string, { test: (v: unknown) => boolean; hint: string }>)[
        tokenKey
      ];
      if (!VARIATION_TOKEN_SET.has(tokenKey) || !rule) {
        return fail(
          `${where}: unknown token override "${tokenKey}" (token keys only).`,
        );
      }
      if (!rule.test(value)) {
        return fail(
          `${where}: token override "${tokenKey}" must be ${rule.hint}.`,
        );
      }
    }
    const skins = variation.skinDefaults ?? {};
    for (const [widget, skin] of Object.entries(skins)) {
      const vocab = (WIDGET_SKINS as Record<string, readonly string[]>)[
        widget
      ];
      if (!vocab) {
        return fail(
          `${where}: unknown skinnable widget "${widget}" (skin names only).`,
        );
      }
      if (typeof skin !== "string" || !vocab.includes(skin)) {
        return fail(
          `${where}: skin "${String(skin)}" is not in ${widget}'s vocabulary (${vocab.join("|")}).`,
        );
      }
    }
  }
  return { ok: true };
}

/* -------------------------------------------------------------- resolution */

/** Find a variation by key; unknown/empty keys resolve to null (base theme). */
export function variationForKey(
  variations: ThemeVariation[],
  key: string | null | undefined,
): ThemeVariation | null {
  if (typeof key !== "string" || !key) return null;
  return variations.find((v) => v.key === key) ?? null;
}

/**
 * Merge a variation over base tokens. Null variation returns the base
 * reference untouched; otherwise a shallow copy with overrides applied.
 */
export function applyVariationTokens(
  base: ThemeTokens,
  variation: ThemeVariation | null,
): ThemeTokens {
  if (!variation) return base;
  return { ...base, ...variation.tokenOverrides };
}

export type SkinPropDefaults = Partial<
  Record<SectionType, Record<string, PropValue>>
>;

/**
 * Merge a variation's skin defaults over a theme's base widget defaults.
 * Variation wins per widget; widgets the variation does not name keep the
 * base object reference. Authored props still merge above this layer at the
 * call site (`{ ...layered, ...authored }`) — same precedence as skins.
 */
export function applyVariationSkinDefaults(
  base: SkinPropDefaults,
  variation: ThemeVariation | null,
): SkinPropDefaults {
  if (!variation) return base;
  let out: SkinPropDefaults = base;
  let dirty = false;
  for (const [widget, skin] of Object.entries(variation.skinDefaults ?? {})) {
    const type = widget as SectionType;
    const prev = out[type] ?? {};
    if (prev["skin"] === skin) continue;
    if (!dirty) {
      out = { ...out };
      dirty = true;
    }
    out[type] = { ...prev, skin: skin as PropValue };
  }
  return out;
}

/**
 * Wrap a SectionBuilder so every created section carries the variation's
 * skin defaults UNDER the authored props. Compose OUTSIDE the theme's own
 * base-defaults wrap (`withVariation(baseWrapped, variation, base)`): the
 * base wrap merges under the authored props first, then this layer adds the
 * variation skin — final order base < variation < authored.
 *
 * `base` is the theme's base widget defaults, used as the "unset" reference:
 * theme builders (homepage factories, preview wraps) merge base defaults
 * into props before this layer runs, so a skin merely *equal* to the base
 * default counts as unset and the variation fills it in. An explicit choice
 * that differs from the base default always wins. Unknown types pass
 * through untouched.
 */
export function withVariationSkinDefaults(
  s: (type: SectionType, props?: Record<string, PropValue>) => Section,
  variation: ThemeVariation | null,
  base?: SkinPropDefaults,
): (type: SectionType, props?: Record<string, PropValue>) => Section {
  if (!variation) return s;
  const skins = variation.skinDefaults ?? {};
  if (Object.keys(skins).length === 0) return s;
  return (type: SectionType, props: Record<string, PropValue> = {}): Section => {
    const skin = (skins as Record<string, string>)[type];
    if (typeof skin !== "string") return s(type, props);
    const authored = props["skin"];
    const baseSkin = base?.[type]?.["skin"];
    // Explicit non-default choice (authored or theme-built) wins; anything
    // else (absent, undefined, or merely base-equal) takes the variation.
    if (authored !== undefined && authored !== baseSkin)
      return s(type, props);
    return s(type, { ...stripUndefined(props), skin });
  };
}

function stripUndefined(
  props: Record<string, PropValue>,
): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/* ------------------------------------------------- per-store persistence
 *
 * The merchant theme settings path is the per-store theme settings document
 * (`theme_drafts.tokens` / `theme_versions.tokens`, one per installed theme
 * row, tenant-scoped by merchant_id). The active theme variation key travels
 * as the `variation` field of that document; these helpers read and write
 * that field without touching any other setting.
 *
 * NOTE (server wiring follow-up): the builder write path parses tokens
 * through `parseTokens` (`themes.server.ts` `parseUntrusted`), which drops
 * unknown keys — so a variation saved only inside the tokens JSON does not
 * survive autosave/commit yet. Until the server preserves the field (or a
 * dedicated column/RPC lands), resolution below still defines the contract:
 * explicit request > persisted > base default.
 */

export const VARIATION_SETTINGS_KEY = "variation";

/** Read the persisted variation key from a theme settings document. */
export function persistedVariationKeyFromSettings(
  settings: unknown,
): string | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>)[VARIATION_SETTINGS_KEY];
  if (typeof raw !== "string" || !raw) return null;
  const key = raw.trim().slice(0, MAX_VARIATION_KEY_LENGTH);
  return VARIATION_KEY_RE.test(key) ? key : null;
}

/** Return a copy of the settings document with the variation key set (or
 * cleared when null): the only key this helper ever writes or removes. */
export function settingsWithVariationKey(
  settings: unknown,
  key: string | null,
): Record<string, unknown> {
  const base =
    settings && typeof settings === "object"
      ? { ...(settings as Record<string, unknown>) }
      : {};
  if (key === null) {
    delete base[VARIATION_SETTINGS_KEY];
    return base;
  }
  base[VARIATION_SETTINGS_KEY] = key;
  return base;
}

export type VariationSelection = {
  /** Explicit request (e.g. preview `?variation=`). Wins when known. */
  requested?: string | null;
  /** Persisted per-store key (theme settings document). Fallback. */
  persisted?: string | null;
};

/**
 * Resolve the active variation: the requested key when the theme ships it,
 * else the persisted per-store key when the theme ships it, else null (the
 * base theme — the default fallback). Unknown keys never throw, never stick.
 */
export function resolveActiveVariationKey(
  variations: ThemeVariation[],
  selection: VariationSelection = {},
): ThemeVariation | null {
  const requested = variationForKey(variations, selection.requested);
  if (requested) return requested;
  return variationForKey(variations, selection.persisted);
}
