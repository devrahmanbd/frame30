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

export const ASSET_KIND_LABEL: Record<
  ThemeAssetKind,
  { en: string; bn: string }
> = {
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
  {
    pattern: /url\(\s*['"]?\s*data:text\/html[^)]*\)/gi,
    label: "data:text/html url",
  },
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

export type CssStats = {
  bytes: number;
  rules: number;
  lines: number;
  overLimit: boolean;
};

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
export function parseTokenOverrides(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
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
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return "tokens.shape";
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
 *
 * `usedSkinKeys` is the per-page filter (lane B2-1): merchant skin assets
 * (`skin-<type>-<skin>.css`, see `skinKeyForAssetName`) are included only
 * when their key appears in the list. Omitted or null means today's behavior
 * — every scoped asset is combined. An empty list drops all skin assets but
 * keeps everything else, so a page with no skinned widgets ships no skin CSS
 * while rendering byte-identical output.
 */
export function combineThemeCss(
  assets: ThemeAsset[],
  themeId: string | null,
  usedSkinKeys?: readonly string[] | null,
): string {
  const scoped = assets.filter(
    (asset) =>
      asset.enabled && (asset.themeId === null || asset.themeId === themeId),
  );
  const used =
    usedSkinKeys == null
      ? null
      : new Set(usedSkinKeys.map((key) => key.toLowerCase()));
  const parts: string[] = [];
  for (const asset of scoped.filter((a) => a.kind === "tokens"))
    parts.push(tokensToCss(parseTokenOverrides(asset.content)));
  for (const asset of scoped.filter((a) => a.kind === "font")) {
    if (!asset.url) continue;
    const family = asset.name
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/["\\]/g, "");
    parts.push(
      `@font-face{font-family:"${family}";src:url("${asset.url}");font-display:swap}`,
    );
  }
  for (const asset of scoped.filter((a) => a.kind === "css")) {
    // Skin assets are conditional: without a per-page used list (or with
    // their key in it) they combine exactly like any other stylesheet, so
    // existing callers see no behavior change.
    if (used !== null) {
      const key = skinKeyForAssetName(asset.name);
      if (key !== null && !used.has(key)) continue;
    }
    parts.push(sanitiseThemeCss(asset.content ?? "").css);
  }
  return parts.filter(Boolean).join("\n");
}

/* --------------------------------------- conditional skin loading (B2-1) */

/**
 * Merchant skin assets are `css` assets named `skin-<type>-<skin>.css`
 * (spec §3 — the `get_style_depends` half of the contract): e.g.
 * `skin-product_rail-minimal.css` keys `product_rail:minimal`, the same key
 * `usedWidgetSkins` emits.
 *
 * Returns the lower-cased key, or null when the name is not a skin asset.
 * Null is fail-open: the asset combines like ordinary CSS, so a misnamed
 * file can never silently drop a merchant's stylesheet.
 */
export function skinKeyForAssetName(
  name: string | null | undefined,
): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed === "" || trimmed.includes("/")) return null;
  const match = /^skin-(.+)-([^-]+)\.css$/i.exec(trimmed);
  if (!match) return null;
  const type = (match[1] ?? "").trim();
  const skin = (match[2] ?? "").trim();
  if (!type || !skin) return null;
  return `${type.toLowerCase()}:${skin.toLowerCase()}`;
}

/**
 * Per-page skin-rule filter for already-combined CSS (lane B2-1).
 *
 * Drops style rules scoped to `[data-widget="<type>"][data-skin="<skin>"]`
 * whose `type:skin` key is absent from `usedKeys`, recursing into
 * `@media` / `@supports` / `@container` / `@layer` wrappers (a wrapper is
 * kept while any inner rule survives). Everything else — token `:root`
 * blocks, `@font-face`, keyframes, ordinary rules, mixed selector lists
 * with at least one non-skin or used selector — is kept verbatim.
 *
 * Fail-open throughout: null/empty CSS returns "", an undefined used list
 * (the host could not compute the page) returns the input unchanged, and
 * any unbalanced or unparseable input returns the input unchanged. When
 * nothing is dropped the input string is returned as-is, so pages without
 * skin CSS see byte-identical output.
 */
export function filterSkinCss(
  css: string | null | undefined,
  usedKeys: readonly string[] | null | undefined,
): string {
  if (!css) return "";
  if (usedKeys == null) return css;
  try {
    const used = new Set(usedKeys);
    const types = new Set<string>();
    const skins = new Set<string>();
    for (const key of used) {
      const sep = key.indexOf(":");
      if (sep > 0) {
        types.add(key.slice(0, sep));
        skins.add(key.slice(sep + 1));
      }
    }
    const ctx = { used, types, skins };
    const rules = splitCssRules(css);
    if (rules === null) return css;
    let dropped = false;
    const kept: string[] = [];
    for (const rule of rules) {
      const next = pruneSkinRule(rule, ctx);
      if (next === "") {
        dropped = true;
        continue;
      }
      if (next !== rule) dropped = true;
      kept.push(next);
    }
    if (!dropped) return css;
    return kept.join("\n");
  } catch {
    return css;
  }
}

type SkinFilterCtx = {
  used: Set<string>;
  types: Set<string>;
  skins: Set<string>;
};

/**
 * Split CSS into top-level rules (`selector { … }` or `@rule …;`), keeping
 * each rule's original text including leading trivia. Returns null when the
 * input is unbalanced, has unterminated comments/strings, or trailing
 * non-whitespace — every one of those degrades to "keep everything".
 */
function splitCssRules(css: string): string[] | null {
  const rules: string[] = [];
  const n = css.length;
  let i = 0;
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let comment = false;
  while (i < n) {
    const ch = css[i]!;
    const next = i + 1 < n ? css[i + 1] : "";
    if (comment) {
      if (ch === "*" && next === "/") {
        comment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      comment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth < 0) return null;
      i += 1;
      if (depth === 0) {
        rules.push(css.slice(start, i));
        start = i;
      }
      continue;
    }
    if (ch === ";" && depth === 0) {
      rules.push(css.slice(start, i + 1));
      start = i + 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  if (comment || quote || depth !== 0) return null;
  if (css.slice(start).trim() !== "") return null;
  return rules;
}

/** Prune one top-level rule: "" drops it, otherwise the replacement text. */
function pruneSkinRule(rule: string, ctx: SkinFilterCtx): string {
  const brace = topLevelBrace(rule);
  // At-rules without a block (@charset, @import remnants, `@layer a;`) carry
  // no selectors — keep them verbatim.
  if (brace < 0) return rule;
  const prelude = rule.slice(0, brace);
  const group = /^\s*@(media|supports|container|layer)\b/i.exec(prelude);
  if (group) {
    const inner = rule.slice(brace + 1, rule.lastIndexOf("}"));
    const innerRules = splitCssRules(inner);
    // Unparseable inside: keep the whole wrapper rather than risk dropping
    // a rule the page needs.
    if (innerRules === null) return rule;
    const kept: string[] = [];
    let changed = false;
    for (const innerRule of innerRules) {
      const next = pruneSkinRule(innerRule, ctx);
      if (next === "") {
        changed = true;
        continue;
      }
      if (next !== innerRule) changed = true;
      kept.push(next);
    }
    if (kept.length === 0) return "";
    if (!changed) return rule;
    return `${prelude}{${kept.join("\n")}}`;
  }
  // Other at-rules with blocks (@font-face, @keyframes, @page) never carry
  // skin selectors — keep them whole.
  if (/^\s*@/.test(prelude)) return rule;
  return ruleUsesOnlyUnusedSkins(stripCssComments(prelude), ctx) ? "" : rule;
}

/** Index of the first `{` outside strings/comments, or -1. */
function topLevelBrace(rule: string): number {
  let quote: string | null = null;
  let comment = false;
  for (let i = 0; i < rule.length; i += 1) {
    const ch = rule[i]!;
    const next = i + 1 < rule.length ? rule[i + 1] : "";
    if (comment) {
      if (ch === "*" && next === "/") {
        comment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "*") {
      comment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") return i;
  }
  return -1;
}

/** Copy of CSS with `/* … *\/` comments removed (quote-aware). */
function stripCssComments(css: string): string {
  let out = "";
  let quote: string | null = null;
  let comment = false;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i]!;
    const next = i + 1 < css.length ? css[i + 1] : "";
    if (comment) {
      if (ch === "*" && next === "/") {
        comment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      out += ch;
      if (ch === "\\" && next) {
        out += next;
        i += 1;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "*") {
      comment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    out += ch;
  }
  return out;
}

/**
 * True when every selector in the list is skin-scoped AND none of them
 * matches a used key. Any neutral selector (or any used skin) keeps the
 * whole rule — mixed lists fail open.
 */
function ruleUsesOnlyUnusedSkins(prelude: string, ctx: SkinFilterCtx): boolean {
  const selectors = splitSelectorList(prelude);
  if (selectors.length === 0) return false;
  let seenSkin = false;
  for (const selector of selectors) {
    const refs = skinRefsInSelector(selector);
    const widget = refs.find((ref) => ref.attr === "widget") ?? null;
    const skin = refs.find((ref) => ref.attr === "skin") ?? null;
    if (!widget && !skin) return false;
    seenSkin = true;
    if (skinRefMatches(widget, skin, ctx)) return false;
  }
  return seenSkin;
}

/**
 * A selector's skin refs match when they constrain to a used key. Bare
 * attributes (`[data-widget]`, `[data-skin]`) match any value on their
 * dimension, so they keep the rule while the page uses any skin at all.
 */
function skinRefMatches(
  widget: SkinRef | null,
  skin: SkinRef | null,
  ctx: SkinFilterCtx,
): boolean {
  if (widget && skin) {
    if (widget.value !== null && skin.value !== null)
      return ctx.used.has(`${widget.value}:${skin.value}`);
    if (widget.value !== null) return ctx.types.has(widget.value);
    if (skin.value !== null) return ctx.skins.has(skin.value);
    return ctx.used.size > 0;
  }
  if (widget) return widget.value !== null ? ctx.types.has(widget.value) : ctx.used.size > 0;
  if (skin) return skin.value !== null ? ctx.skins.has(skin.value) : ctx.used.size > 0;
  return false;
}

/** Split a selector list on top-level commas (parens/brackets/quote aware). */
function splitSelectorList(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    const ch = prelude[i]!;
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if ((ch === ")" || ch === "]") && depth > 0) depth -= 1;
    else if (ch === "," && depth === 0) {
      out.push(prelude.slice(start, i));
      start = i + 1;
    }
  }
  out.push(prelude.slice(start));
  return out.map((s) => s.trim()).filter((s) => s !== "");
}

type SkinRef = { attr: "widget" | "skin"; value: string | null };

/**
 * `data-widget` / `data-skin` attribute refs in one selector, bare or valued.
 * Brackets are matched quote-aware so a value like `[title="[data-skin=x]"]`
 * never misreads as a skin ref.
 */
function skinRefsInSelector(selector: string): SkinRef[] {
  const refs: SkinRef[] = [];
  let i = 0;
  while (i < selector.length) {
    if (selector[i] !== "[") {
      i += 1;
      continue;
    }
    let j = i + 1;
    let quote: string | null = null;
    let closed = false;
    while (j < selector.length) {
      const ch = selector[j]!;
      if (quote) {
        if (ch === "\\") j += 1;
        else if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "]") {
        closed = true;
        break;
      }
      j += 1;
    }
    if (!closed) break;
    const body = selector.slice(i + 1, j);
    const match =
      /^\s*data-(widget|skin)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=\]]+)))?\s*$/i.exec(
        body,
      );
    if (match) {
      const attr = match[1]!.toLowerCase() as "widget" | "skin";
      const value = (match[3] ?? match[4] ?? match[5] ?? "").trim();
      refs.push({ attr, value: match[2] === undefined ? null : value });
    }
    i = j + 1;
  }
  return refs;
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

export function assetsForTheme(
  assets: ThemeAsset[],
  themeId: string | null,
): ThemeAsset[] {
  return sortAssets(
    assets.filter(
      (asset) => asset.themeId === null || asset.themeId === themeId,
    ),
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
