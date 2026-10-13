/**
 * Level B (reviewed developer themes) — dev-theme manifest validator.
 *
 * PURE module: no dependencies, no I/O, no network. It checks the SHAPE of a
 * `dev.theme.json` manifest only — it never fetches a dependency, never reads
 * the filesystem, and never executes theme code. Fetching, hashing, sandboxing
 * and rendering belong to the runtime + bundle pipeline (follow-up tracks).
 *
 * Contract: `openspec/changes/dev-theme-runtime/sdk-contract.md`.
 *
 * Rejection classes (each covered by `dev-theme-manifest.test.ts`):
 *   identity   — id slug, semver version, display name, publisher
 *   runtime    — runtime pin must equal DEV_THEME_RUNTIME_VERSION exactly
 *   capability — closed allowlist, no duplicates
 *   dependency — {name, version, license, integrity}, integrity shape only
 *   settings   — closed builder-field set, well-formed keys
 *   section    — registered key + allowlisted slot
 *   forbidden  — server/hooks/secrets/network/network-capability presence
 *   size       — manifest JSON ≤ 64KB, sections ≤ 64, settings ≤ 128
 */

export const DEV_THEME_RUNTIME_VERSION = "1.0.0";

/**
 * Closed capability allowlist. Each entry is a promise the runtime makes
 * (and a limit the review enforces):
 *   presentation   — declarative section/component markup + tokens only.
 *   animation      — GSAP timelines under the page motion budget; decorative
 *                    motion dies under prefers-reduced-motion.
 *   webgl          — Three.js scenes in an isolated canvas with a static-image
 *                    fallback when WebGL is unavailable.
 *   commerce-read  — read-only product/collection/variant data via the typed
 *                    commerce context (never raw store APIs).
 *   cart-write     — add/remove cart lines through the scoped cart bridge;
 *                    the theme NEVER decides price or payment.
 */
export const DEV_THEME_CAPABILITIES = [
  "presentation",
  "animation",
  "webgl",
  "commerce-read",
  "cart-write",
] as const;
export type DevThemeCapability = (typeof DEV_THEME_CAPABILITIES)[number];

/**
 * Closed builder-field set for Level B settings schemas. Mirrors the
 * builder's declared field kinds (`src/lib/studio/controls.ts` content
 * controls + `builder-ast.ts` skin/typography props), narrowed to the six
 * kinds a reviewed theme may expose to merchants:
 *   text               — short/long copy (text/textarea controls)
 *   image              — asset-library reference (image control; uploads stay
 *                        platform-side, the theme receives a URL)
 *   color              — token-bound colour (color control)
 *   spacing            — padding/gap scale step (slider/dimensions controls)
 *   product-selection  — catalogue picker yielding ids only (never prices)
 *   animation          — entrance preset + duration/delay (interactions tab)
 */
export const DEV_THEME_FIELD_TYPES = [
  "text",
  "image",
  "color",
  "spacing",
  "product-selection",
  "animation",
] as const;
export type DevThemeFieldType = (typeof DEV_THEME_FIELD_TYPES)[number];

/**
 * Slots a developer section may plug into. Mirrors the AST layout slots plus
 * the overlay named zones (`builder-ast.ts`: SLOTS + TEMPLATE_ZONES) —
 * checkout-exclusive surfaces (`thank_you`, payment steps) are deliberately
 * absent: developer sections can never cover a payment step.
 */
export const DEV_THEME_SLOTS = [
  "header",
  "main",
  "footer",
  "sidebar",
  "drawer",
  "popup",
] as const;
export type DevThemeSlot = (typeof DEV_THEME_SLOTS)[number];

/** Non-goal keys: presence anywhere at the manifest top level rejects. */
const FORBIDDEN_KEYS = [
  "server",
  "hooks",
  "secrets",
  "network",
  "network-capability",
] as const;

/** Size caps (anti-bomb; documented in the SDK contract §9). */
export const DEV_THEME_MAX_MANIFEST_BYTES = 64 * 1024;
export const DEV_THEME_MAX_SECTIONS = 64;
export const DEV_THEME_MAX_SETTINGS = 128;
const DEV_THEME_MAX_DEPENDENCIES = 64;

export type DevThemeDependency = {
  name: string;
  version: string;
  license: string;
  integrity: string;
};

export type DevThemeSection = {
  key: string;
  slot: DevThemeSlot;
  component: string;
};

export type DevThemeSetting = {
  key: string;
  label: string;
  type: DevThemeFieldType;
};

export type DevThemeManifest = {
  id: string;
  version: string;
  runtime: typeof DEV_THEME_RUNTIME_VERSION;
  name: string;
  publisher: string;
  capabilities: DevThemeCapability[];
  dependencies: DevThemeDependency[];
  sections: DevThemeSection[];
  settings: DevThemeSetting[];
};

export type DevThemeManifestVerdict =
  | { ok: true; manifest: DevThemeManifest; errors: [] }
  | { ok: false; errors: string[] };

const ID_RE = /^[a-z][a-z0-9-]{2,63}$/;
const KEY_RE = /^[a-z][a-z0-9_-]{1,39}$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
/** Shape only (no fetching): `sha(256|384|512)-` + non-empty base64 digest. */
const INTEGRITY_RE = /^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function checkDependency(
  raw: unknown,
  index: number,
  errors: string[],
): DevThemeDependency | null {
  if (!isRecord(raw)) {
    errors.push(`dependencies[${index}] must be an object`);
    return null;
  }
  let valid = true;
  if (!nonEmptyString(raw.name)) {
    errors.push(`dependencies[${index}].name`);
    valid = false;
  }
  if (!nonEmptyString(raw.version)) {
    errors.push(`dependencies[${index}].version`);
    valid = false;
  }
  if (!nonEmptyString(raw.license)) {
    errors.push(`dependencies[${index}].license`);
    valid = false;
  }
  if (typeof raw.integrity !== "string" || !INTEGRITY_RE.test(raw.integrity)) {
    errors.push(`dependencies[${index}].integrity`);
    valid = false;
  }
  if (!valid) return null;
  return {
    name: (raw.name as string).trim(),
    version: (raw.version as string).trim(),
    license: (raw.license as string).trim(),
    integrity: raw.integrity as string,
  };
}

function checkSection(
  raw: unknown,
  index: number,
  errors: string[],
): DevThemeSection | null {
  if (!isRecord(raw)) {
    errors.push(`sections[${index}] must be an object`);
    return null;
  }
  let valid = true;
  if (typeof raw.key !== "string" || !KEY_RE.test(raw.key)) {
    errors.push(`sections[${index}].key`);
    valid = false;
  }
  if (
    typeof raw.slot !== "string" ||
    !(DEV_THEME_SLOTS as readonly string[]).includes(raw.slot)
  ) {
    errors.push(`sections[${index}].slot unknown slot`);
    valid = false;
  }
  if (!nonEmptyString(raw.component)) {
    errors.push(`sections[${index}].component`);
    valid = false;
  }
  if (!valid) return null;
  return {
    key: raw.key as string,
    slot: raw.slot as DevThemeSlot,
    component: (raw.component as string).trim(),
  };
}

function checkSetting(
  raw: unknown,
  index: number,
  errors: string[],
): DevThemeSetting | null {
  if (!isRecord(raw)) {
    errors.push(`settings[${index}] must be an object`);
    return null;
  }
  let valid = true;
  if (typeof raw.key !== "string" || !KEY_RE.test(raw.key)) {
    errors.push(`settings[${index}].key`);
    valid = false;
  }
  if (!nonEmptyString(raw.label)) {
    errors.push(`settings[${index}].label`);
    valid = false;
  }
  if (
    typeof raw.type !== "string" ||
    !(DEV_THEME_FIELD_TYPES as readonly string[]).includes(raw.type)
  ) {
    errors.push(`settings[${index}].type unknown settings type`);
    valid = false;
  }
  if (!valid) return null;
  return {
    key: raw.key as string,
    label: (raw.label as string).slice(0, 80),
    type: raw.type as DevThemeFieldType,
  };
}

export function parseDevThemeManifest(input: unknown): DevThemeManifestVerdict {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }

  for (const key of FORBIDDEN_KEYS) {
    if (key in input) {
      errors.push(`forbidden key present: ${key}`);
    }
  }

  try {
    const bytes = JSON.stringify(input)?.length ?? 0;
    if (bytes > DEV_THEME_MAX_MANIFEST_BYTES) {
      errors.push(
        `manifest JSON exceeds ${DEV_THEME_MAX_MANIFEST_BYTES} bytes`,
      );
    }
  } catch {
    return { ok: false, errors: ["manifest is not JSON-serializable"] };
  }

  if (typeof input.id !== "string" || !ID_RE.test(input.id)) {
    errors.push("id must be a slug (lowercase letter start, a-z 0-9 hyphens)");
  }
  if (typeof input.version !== "string" || !SEMVER_RE.test(input.version)) {
    errors.push("version must be semver x.y.z");
  }
  if (input.runtime !== DEV_THEME_RUNTIME_VERSION) {
    errors.push(
      `runtime pin must equal ${DEV_THEME_RUNTIME_VERSION} (exact pin only)`,
    );
  }
  if (!nonEmptyString(input.name)) {
    errors.push("name (display name) is required");
  }
  if (!nonEmptyString(input.publisher)) {
    errors.push("publisher is required");
  }

  const capabilities: DevThemeCapability[] = [];
  if (!Array.isArray(input.capabilities)) {
    errors.push("capabilities must be an array");
  } else {
    const seen = new Set<string>();
    for (const cap of input.capabilities) {
      if (
        typeof cap !== "string" ||
        !(DEV_THEME_CAPABILITIES as readonly string[]).includes(cap)
      ) {
        errors.push(`capabilities: unknown capability ${String(cap)}`);
        continue;
      }
      if (seen.has(cap)) {
        errors.push(`capabilities: duplicate ${cap}`);
        continue;
      }
      seen.add(cap);
      capabilities.push(cap as DevThemeCapability);
    }
  }

  let dependencies: DevThemeDependency[] = [];
  if (input.dependencies === undefined) {
    dependencies = [];
  } else if (!Array.isArray(input.dependencies)) {
    errors.push("dependencies must be an array");
  } else if (input.dependencies.length > DEV_THEME_MAX_DEPENDENCIES) {
    errors.push("dependencies exceeds the dependency cap");
  } else {
    const out: DevThemeDependency[] = [];
    input.dependencies.forEach((raw: unknown, i: number) => {
      const dep = checkDependency(raw, i, errors);
      if (dep) out.push(dep);
    });
    dependencies = out;
  }

  let sections: DevThemeSection[] = [];
  if (input.sections === undefined) {
    sections = [];
  } else if (!Array.isArray(input.sections)) {
    errors.push("sections must be an array");
  } else if (input.sections.length > DEV_THEME_MAX_SECTIONS) {
    errors.push(`sections exceeds the cap of ${DEV_THEME_MAX_SECTIONS}`);
  } else {
    const out: DevThemeSection[] = [];
    input.sections.forEach((raw: unknown, i: number) => {
      const section = checkSection(raw, i, errors);
      if (section) out.push(section);
    });
    sections = out;
  }

  let settings: DevThemeSetting[] = [];
  if (input.settings === undefined) {
    settings = [];
  } else if (!Array.isArray(input.settings)) {
    errors.push("settings must be an array");
  } else if (input.settings.length > DEV_THEME_MAX_SETTINGS) {
    errors.push(`settings exceeds the cap of ${DEV_THEME_MAX_SETTINGS}`);
  } else {
    const out: DevThemeSetting[] = [];
    input.settings.forEach((raw: unknown, i: number) => {
      const setting = checkSetting(raw, i, errors);
      if (setting) out.push(setting);
    });
    settings = out;
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    manifest: {
      id: input.id as string,
      version: input.version as string,
      runtime: DEV_THEME_RUNTIME_VERSION,
      name: (input.name as string).trim().slice(0, 80),
      publisher: (input.publisher as string).trim().slice(0, 80),
      capabilities,
      dependencies,
      sections,
      settings,
    },
    errors: [],
  };
}
