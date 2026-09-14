/**
 * Phase 8 — registry versioning.
 *
 * Themes (presets) and plugins are versioned against one number, the builder
 * API version, so an old package can never be installed into a runtime whose
 * AST it does not understand. Plugins already declare `api` ranges in their
 * manifest; this module applies the same rule to theme presets and exposes a
 * single descriptor the admin registry view and the docs read from.
 */
import { BUILDER_API_VERSION, satisfiesApiRange } from "./plugin-manifest";
import { THEME_PRESETS } from "./theme-presets";

export { BUILDER_API_VERSION };

/** Range the officially shipped presets are built against. */
export const PRESET_API_RANGE = "^3.0.0";

export type CompatibilityVerdict =
  | { ok: true }
  | { ok: false; code: "registry.api_range_invalid" | "registry.api_incompatible"; message: string };

/**
 * A package (preset or listing) is installable when its declared range covers
 * the running builder API version. A missing range means "built before ranges
 * existed" and is treated as the official preset range, not as "anything".
 */
export function checkApiCompatibility(range: string | null | undefined, api = BUILDER_API_VERSION): CompatibilityVerdict {
  const declared = (range ?? PRESET_API_RANGE).trim();
  if (!/^\^\d+\.\d+\.\d+$/.test(declared) && !/^>=\s*\d+\.\d+\.\d+\s+<\s*\d+\.\d+\.\d+$/.test(declared)) {
    return { ok: false, code: "registry.api_range_invalid", message: `Unsupported compatibility range "${declared}"` };
  }
  if (!satisfiesApiRange(declared, api)) {
    return {
      ok: false,
      code: "registry.api_incompatible",
      message: `Requires builder API ${declared}, this store runs ${api}`,
    };
  }
  return { ok: true };
}

export function isCompatiblePackage(range: string | null | undefined, api = BUILDER_API_VERSION): boolean {
  return checkApiCompatibility(range, api).ok;
}

/** Descriptor for the admin registry view: what this runtime accepts today. */
export function registryVersionInfo() {
  return {
    builderApi: BUILDER_API_VERSION,
    presetApiRange: PRESET_API_RANGE,
    presets: THEME_PRESETS.map((preset) => ({
      key: preset.key,
      version: preset.version,
      api: preset.api ?? PRESET_API_RANGE,
      compatible: isCompatiblePackage(preset.api ?? PRESET_API_RANGE),
    })),
  };
}
