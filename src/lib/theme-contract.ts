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
  url: z.string(),
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
  if (!settings || typeof settings !== "object") {
    return { success: false, errors: ["Settings must be an object"] };
  }

  const s = settings as Record<string, unknown>;

  for (const control of sectionDef.controls) {
    const val = s[control.key];

    // Check repeater
    if (control.type === "repeater") {
      if (val !== undefined && !Array.isArray(val)) {
        errors.push(`Control '${control.key}' expected array for repeater`);
      } else if (Array.isArray(val) && control.fields) {
        for (let i = 0; i < val.length; i++) {
          const item = val[i];
          if (!item || typeof item !== "object") {
            errors.push(`Repeater '${control.key}' item at index ${i} must be an object`);
            continue;
          }
          for (const field of control.fields) {
            const itemVal = (item as Record<string, unknown>)[field.key];
            if (field.type === "image" && itemVal !== undefined) {
              const url = resolveMediaUrl(itemVal);
              if (itemVal && !url && typeof itemVal !== "string") {
                errors.push(
                  `Repeater '${control.key}'[${i}].${field.key} is an invalid image value`,
                );
              }
            }
          }
        }
      }
    }

    // Check image
    if (control.type === "image" && val !== undefined && val !== null && val !== "") {
      const url = resolveMediaUrl(val);
      if (!url && typeof val !== "string") {
        errors.push(`Control '${control.key}' expected valid image URL or MediaValue object`);
      }
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
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
