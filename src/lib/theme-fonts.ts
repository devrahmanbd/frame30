/**
 * Phase 3 — the typography subsystem.
 *
 * One module owns every font decision so the storefront head, the CI budget,
 * the token editor and the publish gate can never disagree:
 *
 *  - which families exist, which scripts each one actually covers;
 *  - the stylesheet URL derived from the *active theme's* pairing (never a
 *    hardcoded constant), with preconnect origins and `display=swap`;
 *  - a metric-matched fallback face per family, so a swap costs 0 CLS;
 *  - the loading budget (weights per family, families per theme, subsets);
 *  - merchant-uploaded woff2 validation + the licence attestation that gates
 *    publish.
 *
 * Pure data and pure functions only — the server half lives in
 * `theme-fonts.server.ts`.
 */
import { FONT_PAIRINGS, type ThemeTokens } from "./builder-ast";
import type { Locale } from "./bitext";

export type FontScript = "latin" | "bengali";

export type FontFamilyMeta = {
  /** Scripts this face genuinely ships glyphs for. */
  scripts: FontScript[];
  /** Weights we are allowed to request from the provider. */
  weights: number[];
  /** Metric-matched local fallback declared in `styles.css`. */
  fallback: string;
  /** Generic tail of the stack. */
  generic: "sans-serif" | "serif";
};

/**
 * The closed family catalogue. A pairing may only reference a family that is
 * declared here, which is what makes the coverage test possible: a Latin-only
 * body face can never be paired with a বাংলা locale by accident.
 */
export const FONT_FAMILIES: Record<string, FontFamilyMeta> = {
  Inter: {
    scripts: ["latin"],
    weights: [400, 500, 600, 700],
    fallback: "Inter Fallback",
    generic: "sans-serif",
  },
  "Noto Sans Bengali": {
    scripts: ["latin", "bengali"],
    weights: [400, 500, 700],
    fallback: "Noto Sans Bengali Fallback",
    generic: "sans-serif",
  },
  "Hind Siliguri": {
    scripts: ["latin", "bengali"],
    weights: [400, 500, 600, 700],
    fallback: "Hind Siliguri Fallback",
    generic: "sans-serif",
  },
  "Playfair Display": {
    scripts: ["latin"],
    weights: [400, 500, 700],
    fallback: "Playfair Display Fallback",
    generic: "serif",
  },
};

/** Every family a script can fall back to when the primary does not cover it. */
export const SCRIPT_DEFAULT: Record<FontScript, string> = {
  latin: "Inter",
  bengali: "Noto Sans Bengali",
};

export function familyMeta(family: string): FontFamilyMeta | null {
  return FONT_FAMILIES[family] ?? null;
}

export function coversScript(family: string, script: FontScript): boolean {
  return familyMeta(family)?.scripts.includes(script) ?? false;
}

/** The script a locale needs rendered. */
export function scriptFor(locale: Locale): FontScript {
  return locale === "bn" ? "bengali" : "latin";
}

/* ------------------------------------------------------------- resolution */

/**
 * Resolved stack for one role. Always ends in a family that covers the
 * requested script, then the metric-matched fallback, then a generic — so
 * `bn` can never land on a Latin-only face.
 */
export function resolveFontStack(family: string, locale: Locale): string[] {
  const script = scriptFor(locale);
  const meta = familyMeta(family);
  const stack: string[] = [];
  if (meta) stack.push(family);
  if (!meta || !meta.scripts.includes(script)) stack.push(SCRIPT_DEFAULT[script]);
  for (const name of [...stack]) {
    const fallback = familyMeta(name)?.fallback;
    if (fallback && !stack.includes(fallback)) stack.push(fallback);
  }
  stack.push(meta?.generic ?? "sans-serif");
  return stack;
}

/** CSS value for a resolved stack. */
export function fontStackCss(family: string, locale: Locale): string {
  return resolveFontStack(family, locale)
    .map((name) => (/^(sans-serif|serif)$/.test(name) ? name : `"${name}"`))
    .join(", ");
}

/** The (deduped) families a theme actually loads. */
export function themeFamilies(tokens: Pick<ThemeTokens, "fontDisplay" | "fontBody">): string[] {
  return [...new Set([tokens.fontDisplay, tokens.fontBody].filter(Boolean))];
}

/* ------------------------------------------------------------------ budget */

export const FONT_BUDGET = {
  maxWeightsPerFamily: 4,
  maxFamiliesPerTheme: 2,
  subsets: ["latin", "bengali"] as const,
  /** Merchant upload limits. */
  maxFileBytes: 400 * 1024,
  maxFilesPerFamily: 4,
} as const;

export type BudgetFailure = { code: string; message: string };

/** Fails a theme whose typography would blow the loading budget. */
export function checkFontBudget(tokens: Pick<ThemeTokens, "fontDisplay" | "fontBody">): {
  ok: boolean;
  failures: BudgetFailure[];
} {
  const failures: BudgetFailure[] = [];
  const families = themeFamilies(tokens);
  if (families.length > FONT_BUDGET.maxFamiliesPerTheme) {
    failures.push({
      code: "font:families",
      message: `${families.length} families exceed the ${FONT_BUDGET.maxFamiliesPerTheme} allowed per theme.`,
    });
  }
  for (const family of families) {
    const meta = familyMeta(family);
    if (!meta) {
      failures.push({ code: "font:unknown", message: `${family} is not in the font catalogue.` });
      continue;
    }
    if (meta.weights.length > FONT_BUDGET.maxWeightsPerFamily) {
      failures.push({
        code: "font:weights",
        message: `${family} requests ${meta.weights.length} weights, over the ${FONT_BUDGET.maxWeightsPerFamily} allowed.`,
      });
    }
  }
  return { ok: failures.length === 0, failures };
}

/* -------------------------------------------------------------- stylesheet */

/**
 * Provider URL derived from the active pairing. Both subsets are requested in
 * one stylesheet so a locale switch never waits on a second network round
 * trip, and `display=swap` keeps text visible during load.
 */
export function fontStylesheetUrl(tokens: Pick<ThemeTokens, "fontDisplay" | "fontBody">): string {
  const families = themeFamilies(tokens)
    .filter((family) => familyMeta(family))
    .map((family) => {
      const weights = (familyMeta(family) as FontFamilyMeta).weights
        .slice(0, FONT_BUDGET.maxWeightsPerFamily)
        .join(";");
      return `family=${family.replace(/ /g, "+")}:wght@${weights}`;
    });
  const subset = themeFamilies(tokens).some((f) => coversScript(f, "bengali"))
    ? "&subset=latin,bengali"
    : "&subset=latin";
  return `https://fonts.googleapis.com/css2?${families.join("&")}${subset}&display=swap`;
}

export const FONT_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] as const;

export type FontPreload = {
  stylesheet: string;
  origins: readonly string[];
  fallbackFaces: string[];
};

/** Everything a route `head()` needs for the active theme's typography. */
export function fontPreload(tokens: Pick<ThemeTokens, "fontDisplay" | "fontBody">): FontPreload {
  return {
    stylesheet: fontStylesheetUrl(tokens),
    origins: FONT_ORIGINS,
    fallbackFaces: themeFamilies(tokens)
      .map((family) => familyMeta(family)?.fallback)
      .filter((name): name is string => Boolean(name)),
  };
}

/** `head().links` entries: preconnect ×2, preload, stylesheet. */
export function fontHeadLinks(tokens: Pick<ThemeTokens, "fontDisplay" | "fontBody">) {
  const preload = fontPreload(tokens);
  return [
    ...preload.origins.map((href) => ({
      rel: "preconnect",
      href,
      crossOrigin: "anonymous" as const,
    })),
    { rel: "preload", as: "style", href: preload.stylesheet },
    { rel: "stylesheet", href: preload.stylesheet },
  ];
}

/** Every pairing in the catalogue must resolve to a covering face per locale. */
export function pairingCoverage(): { pairing: string; locale: Locale; ok: boolean }[] {
  const out: { pairing: string; locale: Locale; ok: boolean }[] = [];
  for (const [pairing, pair] of Object.entries(FONT_PAIRINGS)) {
    for (const locale of ["en", "bn"] as Locale[]) {
      const script = scriptFor(locale);
      const ok = [pair.display, pair.body].every((family) =>
        resolveFontStack(family, locale).some((name) => coversScript(name, script)),
      );
      out.push({ pairing, locale, ok });
    }
  }
  return out;
}

/* ----------------------------------------------------------- custom fonts */

/** A merchant-uploaded face. */
export type FontAsset = {
  id: string;
  family: string;
  weight: number;
  subset: FontScript;
  storagePath: string;
  bytes: number;
  licenceConfirmedAt: string | null;
};

export const FONT_URL_PREFIX = "/api/public/font/";

/** Stable same-origin URL — the private bucket is never exposed directly. */
export function customFontUrl(path: string): string {
  return `${FONT_URL_PREFIX}${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** `<merchant-uuid>/<family>/<weight>.woff2` and nothing else. */
const FONT_OBJECT_PATH = /^[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9 _-]{0,60}\/[1-9]00\.woff2$/;

export function isFontObjectPath(path: string): boolean {
  return FONT_OBJECT_PATH.test(path) && !path.includes("..");
}

export function fontStoragePath(merchantId: string, family: string, weight: number): string {
  return `${merchantId}/${family.replace(/[^A-Za-z0-9 _-]/g, "").trim()}/${weight}.woff2`;
}

/** woff2 files start with the ASCII signature `wOF2`; anything else is a lie. */
export function isWoff2(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x77 &&
    bytes[1] === 0x4f &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x32
  );
}

export type UploadCheck = { ok: true } | { ok: false; code: string; message: string };

export function validateFontUpload(input: {
  bytes: Uint8Array;
  family: string;
  weight: number;
  existingFilesForFamily: number;
}): UploadCheck {
  if (!isWoff2(input.bytes)) {
    return { ok: false, code: "bad_format", message: "Only woff2 font files are accepted." };
  }
  if (input.bytes.length > FONT_BUDGET.maxFileBytes) {
    return { ok: false, code: "too_large", message: "Font files must be 400 KB or smaller." };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{1,40}$/.test(input.family)) {
    return { ok: false, code: "bad_family", message: "Family name contains unsupported characters." };
  }
  if (![100, 200, 300, 400, 500, 600, 700, 800, 900].includes(input.weight)) {
    return { ok: false, code: "bad_weight", message: "Weight must be a multiple of 100." };
  }
  if (input.existingFilesForFamily >= FONT_BUDGET.maxFilesPerFamily) {
    return {
      ok: false,
      code: "too_many",
      message: `A family may ship at most ${FONT_BUDGET.maxFilesPerFamily} files.`,
    };
  }
  return { ok: true };
}

/** `@font-face` block for the merchant's own faces, injected with the theme. */
export function customFontFaceCss(assets: FontAsset[]): string {
  return assets
    .filter((asset) => asset.licenceConfirmedAt)
    .map(
      (asset) =>
        `@font-face{font-family:"${asset.family}";src:url("${customFontUrl(asset.storagePath)}") format("woff2");font-weight:${asset.weight};font-style:normal;font-display:swap;unicode-range:${
          asset.subset === "bengali" ? "U+0980-09FF" : "U+0000-00FF"
        };}`,
    )
    .join("");
}

/**
 * Publish gate: an unattested custom face never reaches shoppers. Returns the
 * blocking messages, empty when every uploaded face is licensed.
 */
export function licenceGate(assets: FontAsset[]): string[] {
  return assets
    .filter((asset) => !asset.licenceConfirmedAt)
    .map((asset) => `fonts: ${asset.family} ${asset.weight} needs a licence confirmation before publish.`);
}

/** Emitted when a custom face 404s and the storefront silently falls back. */
export const FONT_FALLBACK_METRIC = "framique_theme_font_fallback_total";
