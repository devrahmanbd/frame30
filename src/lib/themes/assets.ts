/**
 * Phase 17 — theme assets (custom CSS, token overrides, uploaded files).
 *
 * Pure half: everything here runs in the browser and on the server, so the
 * admin panel and the storefront agree on exactly what a merchant's custom CSS
 * means. Nothing in this file touches the database.
 */

export type ThemeAssetKind = "css" | "tokens" | "image" | "font";

export type ThemeAsset = {
  id: string;
  /** Null when the asset applies to every theme on the store. */
  themeId: string | null;
  kind: ThemeAssetKind;
  name: string;
  /** Text payload for `css` / `tokens`; null for binary assets. */
  content: string | null;
  /** Public URL for `image` / `font`; null for text assets. */
  url: string | null;
  bytes: number;
  enabled: boolean;
  updatedAt: string;
};

export const ASSET_KIND_LABEL: Record<ThemeAssetKind, { en: string; bn: string }> = {
  css: { en: "Custom CSS", bn: "কাস্টম সিএসএস" },
  tokens: { en: "Colour tokens", bn: "কালার টোকেন" },
  image: { en: "Image", bn: "ছবি" },
  font: { en: "Font", bn: "ফন্ট" },
};

export const MAX_CSS_BYTES = 100_000;
export const MAX_TOKENS = 60;
export const MAX_ASSET_NAME = 80;

/* ----------------------------------------------------------------- naming */

const FONT_EXT = new Set(["woff", "woff2", "ttf", "otf"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function assetKindFromName(name: string): ThemeAssetKind {
  const ext = extensionOf(name);
  if (ext === "css") return "css";
  if (ext === "json") return "tokens";
  if (FONT_EXT.has(ext)) return "font";
  if (IMAGE_EXT.has(ext)) return "image";
  return "css";
}

export function cleanAssetName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ").slice(0, MAX_ASSET_NAME);
  return trimmed || "Untitled asset";
}

/* ------------------------------------------------------------------- CSS */

/** Everything the sanitiser strips, so the panel can explain the edit. */
export type CssSanitiseResult = { css: string; removed: string[] };

const CSS_BANS: { pattern: RegExp; label: string }[] = [
  { pattern: /<\/?\s*style[^>]*>/gi, label: "style tag" },
  { pattern: /@import[^;]*;?/gi, label: "@import" },
  { pattern: /expression\s*\([^)]*\)/gi, label: "expression()" },
  { pattern: /behaviou?r\s*:[^;]*;?/gi, label: "behavior" },
  { pattern: /javascript\s*:/gi, label: "javascript:" },
  { pattern: /url\(\s*['"]?\s*data:text\/html[^)]*\)/gi, label: "data:text/html url" },
  { pattern: /-moz-binding\s*:[^;]*;?/gi, label: "-moz-binding" },
];

/**
 * Merchant CSS is author-controlled but never trusted: anything that can load
 * or run code is removed before the string reaches a `<style>` element.
 */
export function sanitiseThemeCss(input: string): CssSanitiseResult {
  let css = input ?? "";
  const removed: string[] = [];
  for (const ban of CSS_BANS) {
    if (ban.pattern.test(css)) {
      removed.push(ban.label);
      css = css.replace(ban.pattern, "");
    }
    ban.pattern.lastIndex = 0;
  }
  return { css: css.trim(), removed };
}

export function isCssSafe(input: string): boolean {
  return sanitiseThemeCss(input).removed.length === 0;
}

export type CssStats = { bytes: number; rules: number; lines: number; overLimit: boolean };

export function cssStats(css: string): CssStats {
  const bytes = new TextEncoder().encode(css).length;
  return {
    bytes,
    rules: (css.match(/\{/g) ?? []).length,
    lines: css ? css.split("\n").length : 0,
    overLimit: bytes > MAX_CSS_BYTES,
  };
}

export function validateCss(css: string): string | null {
  if (cssStats(css).overLimit) return "css.too_large";
  const open = (css.match(/\{/g) ?? []).length;
  const close = (css.match(/\}/g) ?? []).length;
  if (open !== close) return "css.unbalanced";
  return null;
}

/* ---------------------------------------------------------------- tokens */

const TOKEN_NAME = /^[a-z][a-z0-9-]{0,48}$/;
const TOKEN_VALUE = /^[^;{}<>]{1,80}$/;

/**
 * Token overrides are stored as flat JSON (`{"color-primary": "#1877f2"}`) and
 * projected into CSS custom properties. Unsafe names or values are dropped
 * rather than escaped, so a bad paste can never break the storefront.
 */
export function parseTokenOverrides(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_TOKENS) break;
    const name = key.trim().replace(/^--/, "").toLowerCase();
    if (!TOKEN_NAME.test(name)) continue;
    if (typeof value !== "string") continue;
    const val = value.trim();
    if (!TOKEN_VALUE.test(val)) continue;
    out[name] = val;
  }
  return out;
}

export function tokensToCss(tokens: Record<string, string>): string {
  const entries = Object.entries(tokens);
  if (!entries.length) return "";
  return `:root{${entries.map(([k, v]) => `--${k}:${v}`).join(";")}}`;
}

export function validateTokens(raw: string): string | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "tokens.shape";
  } catch {
    return "tokens.json";
  }
  return null;
}

/* -------------------------------------------------------------- combining */

/**
 * The single stylesheet a storefront page injects: token overrides first (so a
 * later rule can always win), then custom CSS, then `@font-face` blocks for
 * uploaded fonts.
 */
export function combineThemeCss(assets: ThemeAsset[], themeId: string | null): string {
  const scoped = assets.filter(
    (asset) => asset.enabled && (asset.themeId === null || asset.themeId === themeId),
  );
  const parts: string[] = [];
  for (const asset of scoped.filter((a) => a.kind === "tokens"))
    parts.push(tokensToCss(parseTokenOverrides(asset.content)));
  for (const asset of scoped.filter((a) => a.kind === "font")) {
    if (!asset.url) continue;
    const family = asset.name.replace(/\.[a-z0-9]+$/i, "").replace(/["\\]/g, "");
    parts.push(
      `@font-face{font-family:"${family}";src:url("${asset.url}");font-display:swap}`,
    );
  }
  for (const asset of scoped.filter((a) => a.kind === "css"))
    parts.push(sanitiseThemeCss(asset.content ?? "").css);
  return parts.filter(Boolean).join("\n");
}

/* --------------------------------------------------------------- listing */

export function sortAssets(assets: ThemeAsset[]): ThemeAsset[] {
  const order: ThemeAssetKind[] = ["css", "tokens", "font", "image"];
  return [...assets].sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      a.name.localeCompare(b.name, "en", { sensitivity: "base" }),
  );
}

export function assetsForTheme(assets: ThemeAsset[], themeId: string | null): ThemeAsset[] {
  return sortAssets(
    assets.filter((asset) => asset.themeId === null || asset.themeId === themeId),
  );
}

export function formatAssetBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function assetSummary(asset: ThemeAsset): string {
  const scope = asset.themeId ? "This theme" : "All themes";
  return `${scope} · ${formatAssetBytes(asset.bytes)}${asset.enabled ? "" : " · off"}`;
}
