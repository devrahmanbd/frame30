/**
 * Frame30 — Official Theme Contract (v1.0.0)
 *
 * This module is the authoritative standard for all Frame30 themes.
 * Every official and marketplace theme must adhere to these schemas,
 * lifecycle states, and control validation rules.
 *
 * Rules:
 * 1. Visual Page Builder Compatibility: All theme sections must expose
 *    typed controls matching the standard editor schema.
 * 2. Media Binding: Image controls MUST use `type: "image"` so merchants
 *    can pick, preview, and annotate images via the Media Library.
 * 3. Backward Compatibility: Image values accept both plain URLs and
 *    structured MediaValue objects (`{ url, alt, width, height }`).
 * 4. Dynamic Data Isolation: No theme may hardcode merchant claims, fake
 *    ratings, or static contact details; all dynamic values resolve from context.
 * 5. Certification Lifecycle: Themes transition through explicit states:
 *    draft -> validating -> failed | passed -> released.
 */

import { z } from "zod";
import { catalogEntry, type SectionType } from "./builder-ast";
import { SECTION_CONTROLS } from "./studio/controls";

export const THEME_CONTRACT_VERSION = "1.0.0" as const;

/* ------------------------------------------------------------------ */
/* Certification Lifecycle States                                     */
/* ------------------------------------------------------------------ */

export const THEME_CERTIFICATION_STATES = [
  "draft",
  "validating",
  "failed",
  "passed",
  "released",
] as const;

export type ThemeCertificationState = (typeof THEME_CERTIFICATION_STATES)[number];

/* ------------------------------------------------------------------ */
/* Supported Control Types & Schema                                   */
/* ------------------------------------------------------------------ */

export const THEME_CONTROL_TYPES = [
  "text",
  "textarea",
  "richtext",
  "number",
  "slider",
  "select",
  "choice",
  "switch",
  "color",
  "dimensions",
  "image",
  "link",
  "icon",
  "repeater",
  "code",
  "heading",
] as const;

export type ThemeControlType = (typeof THEME_CONTROL_TYPES)[number];

export const ControlOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});
export type ControlOption = z.infer<typeof ControlOptionSchema>;

export type ThemeControl = {
  key: string;
  label: string;
  type: ThemeControlType;
  tab?: "content" | "style" | "advanced" | "interactions";
  section?: string;
  options?: ControlOption[];
  units?: string[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
  responsive?: boolean;
  fields?: ThemeControl[];
  showWhen?: { key: string; equals: (string | number | boolean)[] };
};

export const ThemeControlSchema: z.ZodType<ThemeControl> = z.lazy(() =>
  z.object({
    key: z.string().min(1, "Control key is required"),
    label: z.string().min(1, "Control label is required"),
    type: z.enum(THEME_CONTROL_TYPES),
    tab: z.enum(["content", "style", "advanced", "interactions"]).optional(),
    section: z.string().optional(),
    options: z.array(ControlOptionSchema).optional(),
    units: z.array(z.string()).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    placeholder: z.string().optional(),
    help: z.string().optional(),
    responsive: z.boolean().optional(),
    fields: z.array(ThemeControlSchema).optional(),
    showWhen: z
      .object({
        key: z.string(),
        equals: z.array(z.union([z.string(), z.number(), z.boolean()])),
      })
      .optional(),
  }),
);

/* ------------------------------------------------------------------ */
/* Media Value Contract (Backward Compatible)                         */
/* ------------------------------------------------------------------ */

export const StructuredMediaValueSchema = z.object({
  url: z.string().min(1, "Media URL is required"),
  alt: z.string().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  focalPoint: z
    .object({
      x: z.number().min(0).max(100),
      y: z.number().min(0).max(100),
    })
    .optional(),
});
export type StructuredMediaValue = z.infer<typeof StructuredMediaValueSchema>;

export const MediaValueSchema = z.union([
  z.string(),
  StructuredMediaValueSchema,
]);
export type MediaValue = z.infer<typeof MediaValueSchema>;

/**
 * Extracts a clean string URL from either a legacy string or a structured MediaValue.
 */
export function resolveMediaUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === "object" && "url" in value) {
    const rawUrl = (value as { url: unknown }).url;
    if (typeof rawUrl === "string") {
      const trimmed = rawUrl.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  }
  return null;
}

/**
 * Extracts accessible alt text from MediaValue, falling back to an optional default.
 */
export function resolveMediaAlt(value: unknown, fallback = ""): string {
  if (value && typeof value === "object" && "alt" in value) {
    const rawAlt = (value as { alt: unknown }).alt;
    if (typeof rawAlt === "string" && rawAlt.trim().length > 0) {
      return rawAlt.trim();
    }
  }
  return fallback;
}

/* ------------------------------------------------------------------ */
/* Section Definition Schema                                          */
/* ------------------------------------------------------------------ */

export const ThemeSectionDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "Section ID must be lowercase alphanumeric with underscores/hyphens"),
  label: z.string().min(1, "Section label is required"),
  category: z.string().min(1, "Section category is required"),
  controls: z.array(ThemeControlSchema),
  defaultSettings: z.record(z.unknown()).default({}),
  dynamicBindings: z.array(z.string()).optional(),
  description: z.string().optional(),
});
export type ThemeSectionDefinition = z.infer<typeof ThemeSectionDefinitionSchema>;

/* ------------------------------------------------------------------ */
/* Theme Manifest Schema (v1.0.0)                                     */
/* ------------------------------------------------------------------ */

export const SemVerRegex = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export const ThemeManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/, "Theme ID must be lowercase alphanumeric with underscores/hyphens"),
  version: z.string().regex(SemVerRegex, "Version must follow SemVer (e.g. 1.0.0)"),
  name: z.object({
    en: z.string().min(1, "English theme name is required"),
    bn: z.string().optional(),
  }),
  summary: z.object({
    en: z.string().min(1, "English theme summary is required"),
    bn: z.string().optional(),
  }),
  author: z.object({
    name: z.string().min(1, "Author name is required"),
    url: z.string().url().optional(),
    supportEmail: z.string().email().optional(),
  }),
  builderVersion: z.string().default("^2.0.0"),
  certificationState: z.enum(THEME_CERTIFICATION_STATES).default("draft"),
  templates: z.record(z.array(z.string())).default({}),
  sections: z.array(ThemeSectionDefinitionSchema).default([]),
  tokens: z
    .object({
      colors: z.record(z.string()).optional(),
      fonts: z.record(z.string()).optional(),
      radii: z.record(z.string()).optional(),
      spacing: z.record(z.string()).optional(),
    })
    .default({}),
  defaultSettings: z.record(z.unknown()).default({}),
  localization: z
    .object({
      defaultLocale: z.enum(["en", "bn"]).default("en"),
      supportedLocales: z.array(z.enum(["en", "bn"])).default(["en"]),
    })
    .default({ defaultLocale: "en", supportedLocales: ["en"] }),
  responsiveViewports: z
    .array(z.string())
    .default(["320", "360", "390", "430", "768", "1024", "1280", "1440"]),
});
export type ThemeManifest = z.infer<typeof ThemeManifestSchema>;

/* ------------------------------------------------------------------ */
/* Validation Helpers                                                 */
/* ------------------------------------------------------------------ */

export type ValidationResult<T> = {
  success: boolean;
  data?: T;
  errors?: string[];
};

export function validateThemeManifest(input: unknown): ValidationResult<ThemeManifest> {
  const result = ThemeManifestSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

export function validateSectionDefinition(input: unknown): ValidationResult<ThemeSectionDefinition> {
  const result = ThemeSectionDefinitionSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`),
  };
}

export function validateSectionSettings(
  sectionDef: ThemeSectionDefinition,
  settings: unknown,
): { success: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return { success: false, errors: ["Settings must be an object"] };
  }

  const s = settings as Record<string, unknown>;
  const allowedKeys = new Set(sectionDef.controls.map((c) => c.key));

  // 1. Fail closed on undeclared settings keys
  for (const key of Object.keys(s)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Undeclared setting key '${key}' not defined in section schema`);
    }
  }

  // Helper to validate single control against a value
  function validateControlValue(
    control: ThemeControl,
    val: unknown,
    path: string,
  ) {
    if (val === undefined || val === null) {
      return; // Optional/unspecified values are allowed
    }

    switch (control.type) {
      case "text":
      case "textarea":
      case "richtext":
      case "code":
      case "link":
      case "icon": {
        if (typeof val !== "string") {
          errors.push(`Control '${path}' expected string, received ${typeof val}`);
        }
        break;
      }

      case "color": {
        if (typeof val !== "string") {
          errors.push(`Control '${path}' expected color string, received ${typeof val}`);
        }
        break;
      }

      case "number":
      case "slider": {
        if (typeof val !== "number" || isNaN(val)) {
          errors.push(`Control '${path}' expected number, received ${typeof val}`);
        } else {
          if (control.min !== undefined && val < control.min) {
            errors.push(`Control '${path}' value ${val} is below minimum ${control.min}`);
          }
          if (control.max !== undefined && val > control.max) {
            errors.push(`Control '${path}' value ${val} exceeds maximum ${control.max}`);
          }
        }
        break;
      }

      case "switch": {
        if (typeof val !== "boolean") {
          errors.push(`Control '${path}' expected boolean, received ${typeof val}`);
        }
        break;
      }

      case "select":
      case "choice": {
        if (typeof val !== "string" && typeof val !== "number") {
          errors.push(`Control '${path}' expected string or number choice, received ${typeof val}`);
        } else if (control.options && control.options.length > 0) {
          const allowedOptions = control.options.map((o) => o.value);
          if (!allowedOptions.includes(String(val)) && val !== "") {
            errors.push(
              `Control '${path}' value '${val}' is not one of allowed options: ${allowedOptions.join(", ")}`,
            );
          }
        }
        break;
      }

      case "dimensions": {
        if (
          typeof val !== "string" &&
          typeof val !== "number" &&
          (typeof val !== "object" || val === null)
        ) {
          errors.push(`Control '${path}' expected dimensions value, received ${typeof val}`);
        }
        break;
      }

      case "heading": {
        if (typeof val !== "string" && (typeof val !== "object" || val === null)) {
          errors.push(`Control '${path}' expected heading value, received ${typeof val}`);
        }
        break;
      }

      case "image": {
        if (val === "") break;
        if (typeof val === "string") {
          const url = resolveMediaUrl(val);
          if (!url) {
            errors.push(`Control '${path}' has empty or invalid image URL`);
          }
        } else if (typeof val === "object" && val !== null) {
          const parsed = StructuredMediaValueSchema.safeParse(val);
          if (!parsed.success) {
            errors.push(
              `Control '${path}' is not a valid StructuredMediaValue: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
            );
          }
        } else {
          errors.push(`Control '${path}' expected valid image URL string or MediaValue object`);
        }
        break;
      }

      case "repeater": {
        if (!Array.isArray(val)) {
          errors.push(`Control '${path}' expected array for repeater, received ${typeof val}`);
        } else if (control.fields && control.fields.length > 0) {
          const repeaterAllowedKeys = new Set(control.fields.map((f) => f.key));
          for (let i = 0; i < val.length; i++) {
            const item = val[i];
            const itemPath = `${path}[${i}]`;
            if (!item || typeof item !== "object" || Array.isArray(item)) {
              errors.push(`Repeater item at ${itemPath} must be an object`);
              continue;
            }
            const itemObj = item as Record<string, unknown>;
            // Fail closed on undeclared repeater item fields
            for (const itemKey of Object.keys(itemObj)) {
              if (!repeaterAllowedKeys.has(itemKey)) {
                errors.push(`Repeater item at ${itemPath} has undeclared field '${itemKey}'`);
              }
            }
            // Recursively validate child controls
            for (const field of control.fields) {
              validateControlValue(field, itemObj[field.key], `${itemPath}.${field.key}`);
            }
          }
        }
        break;
      }
    }
  }

  // 2. Validate declared controls
  for (const control of sectionDef.controls) {
    validateControlValue(control, s[control.key], control.key);
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Migrates legacy string image URLs in section settings to structured MediaValue objects.
 */
export function migrateSectionSettings(
  sectionDef: ThemeSectionDefinition,
  settings: unknown,
): Record<string, unknown> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  const result: Record<string, unknown> = structuredClone(settings) as Record<string, unknown>;

  function migrateControls(controls: ThemeControl[], target: Record<string, unknown>) {
    for (const ctrl of controls) {
      const val = target[ctrl.key];
      if (ctrl.type === "image") {
        if (typeof val === "string" && val.trim().length > 0) {
          target[ctrl.key] = {
            url: val.trim(),
            alt: typeof target.alt === "string" ? target.alt : "",
          };
        }
      } else if (ctrl.type === "repeater" && Array.isArray(val) && ctrl.fields) {
        for (let i = 0; i < val.length; i++) {
          const row = val[i];
          if (row && typeof row === "object" && !Array.isArray(row)) {
            migrateControls(ctrl.fields, row as Record<string, unknown>);
          }
        }
      }
    }
  }

  migrateControls(sectionDef.controls, result);
  return result;
}

/**
 * Upgrades a full Theme AST to the current schemaVersion, migrating media values across all sections.
 */
export function migrateThemeAst(
  ast: unknown,
  manifest: ThemeManifest,
): { ast: unknown; migratedCount: number } {
  if (!ast || typeof ast !== "object") {
    return { ast, migratedCount: 0 };
  }

  const cloned = structuredClone(ast) as Record<string, unknown>;
  let migratedCount = 0;

  const sectionMap = new Map<string, ThemeSectionDefinition>();
  for (const def of manifest.sections) {
    sectionMap.set(def.id, def);
  }

  cloned.schemaVersion = THEME_CONTRACT_VERSION;

  if (Array.isArray(cloned.sections)) {
    for (const section of cloned.sections) {
      if (section && typeof section === "object") {
        const type = (section as { type?: unknown }).type;
        if (typeof type === "string") {
          const def = sectionMap.get(type);
          if (def) {
            const propsKey = "props" in section ? "props" : "settings";
            const currentProps = (section as Record<string, unknown>)[propsKey];
            if (currentProps && typeof currentProps === "object") {
              const migratedProps = migrateSectionSettings(def, currentProps);
              (section as Record<string, unknown>)[propsKey] = migratedProps;
              migratedCount++;
            }
          }
        }
      }
    }
  }

  return { ast: cloned, migratedCount };
}

export function validateThemeCompatibility(manifest: ThemeManifest): {
  compatible: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Minimum viewport coverage check (320, 768, 1440)
  const required = ["320", "768", "1440"];
  for (const vp of required) {
    if (!manifest.responsiveViewports.includes(vp)) {
      issues.push(`Theme manifest missing required responsive viewport: ${vp}px`);
    }
  }

  // Check section definitions have valid image controls
  for (const section of manifest.sections) {
    for (const ctrl of section.controls) {
      if (
        !ctrl.key.toLowerCase().includes("alt") &&
        (ctrl.key.toLowerCase().includes("image") ||
          ctrl.key.toLowerCase().includes("banner") ||
          ctrl.key.toLowerCase().includes("photo")) &&
        ctrl.type === "text"
      ) {
        issues.push(
          `Section '${section.id}' control '${ctrl.key}' appears to be an image but is typed as 'text' instead of 'image'`,
        );
      }
      if (ctrl.type === "repeater" && ctrl.fields) {
        for (const child of ctrl.fields) {
          if (
            !child.key.toLowerCase().includes("alt") &&
            (child.key.toLowerCase().includes("image") ||
              child.key.toLowerCase().includes("photo")) &&
            child.type === "text"
          ) {
            issues.push(
              `Section '${section.id}' repeater '${ctrl.key}' child control '${child.key}' appears to be an image but is typed as 'text' instead of 'image'`,
            );
          }
        }
      }
    }
  }

  return {
    compatible: issues.length === 0,
    issues,
  };
}

/* ------------------------------------------------------------------ */
/* Songoskriti Canonical Manifest (All 33 Sections)                  */
/* ------------------------------------------------------------------ */

export const SONGOSKRITI_SECTION_KEYS = [
  "hero_carousel",
  "department_grid",
  "product_rail",
  "product_grid",
  "split_feature",
  "collection_story",
  "craft_story",
  "ugc_gallery",
  "testimonials",
  "finder_row",
  "trust_footer",
  "store_locator",
  "newsletter",
  "footer_sitemap",
  "rich_text",
  "payment_icons",
  "category_header",
  "result_toolbar",
  "announcement_bar",
  "trust_bar",
  "mega_menu",
  "cart_lines",
  "cart_summary",
  "payment_methods",
  "checkout_steps",
  "orders_list",
  "profile_card",
  "account_nav",
  "account_overview",
  "account_orders",
  "account_details",
] as const satisfies readonly SectionType[];

export const SONGOSKRITI_THEME_MANIFEST: ThemeManifest = {
  id: "songoskriti",
  version: "1.1.0",
  name: { en: "Songoskriti", bn: "সংস্কৃতি" },
  summary: {
    en: "Official Framique heritage theme: jamdani, panjabi and festive craft.",
    bn: "অফিসিয়াল ফ্রামিক হেরিটেজ থিম।",
  },
  author: {
    name: "Framique Core Team",
    url: "https://framique.com",
    supportEmail: "themes@framique.com",
  },
  builderVersion: "^2.0.0",
  certificationState: "released",
  templates: {
    index: ["hero_carousel", "department_grid", "featured_products"],
    collection: ["category_header", "product_grid"],
    product: ["product_detail"],
  },
  sections: [
    ...SONGOSKRITI_SECTION_KEYS.map((key) => {
      const entry = catalogEntry(key);
      return {
        id: key,
        label: entry?.label ?? key.replace(/_/g, " "),
        category: entry?.group ?? "content",
        controls: (SECTION_CONTROLS[key] ?? []) as ThemeControl[],
        defaultSettings: (entry?.defaults ?? {}) as Record<string, unknown>,
      };
    }),
    {
      id: "header",
      label: "Theme Header",
      category: "header",
      controls: [],
      defaultSettings: {},
      dynamicBindings: ["theme-presentation-primitive"],
      description:
        "Theme presentation primitive for live storefront header and mega menu",
    },
    {
      id: "ornament",
      label: "Theme Ornament",
      category: "presentation",
      controls: [],
      defaultSettings: {},
      dynamicBindings: ["theme-presentation-primitive"],
      description:
        "Theme presentation primitive for cultural motifs, borders, and decorative filigree",
    },
  ],
  tokens: {},
  defaultSettings: {},
  localization: {
    defaultLocale: "en",
    supportedLocales: ["en", "bn"],
  },
  responsiveViewports: [
    "320",
    "360",
    "390",
    "430",
    "768",
    "1024",
    "1280",
    "1440",
  ],
};
