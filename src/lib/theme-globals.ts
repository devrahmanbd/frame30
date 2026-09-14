/**
 * Global styles — named colours and fonts a merchant defines once.
 *
 * Any colour or typography control can bind to a global instead of a raw
 * value. Changing the global then restyles every element bound to it, which is
 * the whole point: a store's palette lives in one place, not scattered across
 * two hundred widget props.
 *
 * A binding is stored as a CSS variable reference (`var(--fq-g-brand)`), so a
 * published page needs no lookup table at render time — the variables are
 * emitted on the theme surface next to the design tokens.
 */

export type GlobalColor = { id: string; name: string; value: string };
export type GlobalFont = { id: string; name: string; family: string; weight: string };
export type ThemeGlobals = { colors: GlobalColor[]; fonts: GlobalFont[] };

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ID = /^[a-z][a-z0-9-]{0,23}$/;
const FAMILY = /^[\w\s'-]{2,40}$/;
const WEIGHT = /^(?:100|200|300|400|500|600|700|800|900)$/;

export const MAX_GLOBAL_COLORS = 24;
export const MAX_GLOBAL_FONTS = 8;

/** The starter set every theme gets, mirroring the four core design tokens. */
export const DEFAULT_GLOBALS: ThemeGlobals = {
  colors: [
    { id: "primary", name: "Primary", value: "#0F766E" },
    { id: "secondary", name: "Secondary", value: "#0D9488" },
    { id: "text", name: "Text", value: "#0F172A" },
    { id: "surface", name: "Surface", value: "#FFFFFF" },
  ],
  fonts: [
    { id: "heading", name: "Headings", family: "Noto Sans Bengali", weight: "700" },
    { id: "body", name: "Body", family: "Noto Sans Bengali", weight: "400" },
  ],
};

export function globalColorVar(id: string): string {
  return `--fq-g-${id}`;
}
export function globalFontVar(id: string): string {
  return `--fq-gf-${id}`;
}

/** The value stored on a widget prop when it is bound to a global. */
export function globalRef(id: string, kind: "color" | "font" = "color"): string {
  return `var(${kind === "color" ? globalColorVar(id) : globalFontVar(id)})`;
}

/** The global id a prop value is bound to, or null when it holds a raw value. */
export function globalRefId(value: unknown, kind: "color" | "font" = "color"): string | null {
  if (typeof value !== "string") return null;
  const prefix = kind === "color" ? "--fq-g-" : "--fq-gf-";
  const match = value.trim().match(/^var\(\s*(--fq-g-[a-z0-9-]+|--fq-gf-[a-z0-9-]+)\s*\)$/);
  if (!match) return null;
  const name = match[1]!;
  return name.startsWith(prefix) ? name.slice(prefix.length) : null;
}

export function parseGlobals(input: unknown): ThemeGlobals {
  const raw = (input ?? {}) as Record<string, unknown>;
  const colorRows = Array.isArray(raw["colors"]) ? raw["colors"] : [];
  const fontRows = Array.isArray(raw["fonts"]) ? raw["fonts"] : [];
  const seenColor = new Set<string>();
  const seenFont = new Set<string>();

  const colors: GlobalColor[] = [];
  for (const row of colorRows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r["id"] === "string" ? r["id"].trim().toLowerCase() : "";
    const value = typeof r["value"] === "string" ? r["value"].trim() : "";
    if (!ID.test(id) || !HEX.test(value) || seenColor.has(id)) continue;
    seenColor.add(id);
    colors.push({
      id,
      name: typeof r["name"] === "string" && r["name"].trim() ? r["name"].trim().slice(0, 40) : id,
      value,
    });
    if (colors.length >= MAX_GLOBAL_COLORS) break;
  }

  const fonts: GlobalFont[] = [];
  for (const row of fontRows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = typeof r["id"] === "string" ? r["id"].trim().toLowerCase() : "";
    const family = typeof r["family"] === "string" ? r["family"].trim() : "";
    if (!ID.test(id) || !FAMILY.test(family) || seenFont.has(id)) continue;
    seenFont.add(id);
    const weight = typeof r["weight"] === "string" && WEIGHT.test(r["weight"]) ? r["weight"] : "400";
    fonts.push({
      id,
      name: typeof r["name"] === "string" && r["name"].trim() ? r["name"].trim().slice(0, 40) : id,
      family,
      weight,
    });
    if (fonts.length >= MAX_GLOBAL_FONTS) break;
  }

  if (colors.length === 0 && fonts.length === 0) return DEFAULT_GLOBALS;
  return {
    colors: colors.length ? colors : DEFAULT_GLOBALS.colors,
    fonts: fonts.length ? fonts : DEFAULT_GLOBALS.fonts,
  };
}

/** CSS custom properties for the theme surface. */
export function globalsToCss(globals: ThemeGlobals): Record<string, string> {
  const out: Record<string, string> = {};
  for (const color of globals.colors) out[globalColorVar(color.id)] = color.value;
  for (const font of globals.fonts) out[globalFontVar(font.id)] = `"${font.family}", system-ui, sans-serif`;
  return out;
}

/** Families a page must actually load, deduplicated. */
export function globalFontFamilies(globals: ThemeGlobals): string[] {
  return [...new Set(globals.fonts.map((font) => font.family))];
}
