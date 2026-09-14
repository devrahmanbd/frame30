/**
 * Language boot resolution — the CLS fix for Bangla (§10.6).
 *
 * The provider used to render English on the server and switch to the stored
 * language in an effect after hydration. For a returning বাংলা reader that is a
 * full-page reflow *after* first paint: measured CLS 0.06–0.13 at 320px, with
 * the blame landing on whatever happened to sit lowest in the band (the aurora
 * `::before` on /customers and /pricing, a stat row on /payments). No amount of
 * font-metric tuning can close that, because the shift is the copy changing
 * length, not the face swapping.
 *
 * The fix is to know the locale *before* the server renders. localStorage is
 * invisible to SSR, so the preference is mirrored into a plain cookie and the
 * root route reads it out of the request. First paint is then already in the
 * right language and nothing moves.
 *
 * This module is deliberately dependency-free and pure so it can be used in the
 * request path, in the browser and in tests.
 */

export type BootLang = "en" | "bn";

export const LANG_COOKIE = "framique.lang";
/** One year: a locale choice is not session state. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isBootLang(value: unknown): value is BootLang {
  return value === "en" || value === "bn";
}

/** Reads `?lang=` / `?locale=` without pulling in the SEO helper's deps. */
export function langFromSearch(search: string): BootLang | null {
  if (!search) return null;
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    for (const key of ["lang", "locale", "hl"]) {
      const raw = params.get(key);
      if (!raw) continue;
      const value = raw.trim().toLowerCase().split("-")[0];
      if (isBootLang(value)) return value;
    }
  } catch {
    /* malformed query strings are not an error worth surfacing */
  }
  return null;
}

/**
 * Parses one cookie out of a `Cookie:` header. Hand-rolled rather than a
 * dependency because the header can legitimately be malformed (a proxy that
 * folds duplicates, a value containing `=`), and a throw here would 500 the
 * whole document for a cosmetic preference.
 */
export function langFromCookieHeader(header: string | null | undefined): BootLang | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== LANG_COOKIE) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep the raw value; the guard below rejects anything unexpected */
    }
    if (isBootLang(value)) return value;
  }
  return null;
}

/**
 * Resolves the locale for a request. `?lang=` wins over the cookie so hreflang
 * alternates and shared links land on the locale they asked for.
 */
export function resolveRequestLang(input: {
  search?: string | null;
  cookieHeader?: string | null;
}): BootLang {
  return (
    langFromSearch(input.search ?? "") ?? langFromCookieHeader(input.cookieHeader) ?? "en"
  );
}

/** Mirrors the choice into a cookie so the *next* SSR paints in that locale. */
export function persistLangCookie(lang: BootLang) {
  if (typeof document === "undefined") return;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${LANG_COOKIE}=${lang}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
  } catch {
    /* cookies disabled — localStorage still carries the preference */
  }
}

/** Browser-side boot value, used when the root loader runs on a client nav. */
export function readClientBootLang(): BootLang {
  if (typeof document === "undefined") return "en";
  return (
    langFromSearch(window.location.search) ??
    langFromCookieHeader(document.cookie) ??
    (isBootLang(document.documentElement.lang) ? document.documentElement.lang : "en")
  );
}
