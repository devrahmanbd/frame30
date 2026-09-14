import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DICT, interpolate, parseMessageKey, type Entry } from "./i18n-dict";
import { persistLangCookie } from "./lang-boot";

export type Lang = "en" | "bn";

import { localeFromSearch } from "./seo-technical";

const STORAGE_KEY = "framique.lang";

/**
 * Phase 2.1: a shopper's language is remembered per store, so switching to
 * বাংলা in one storefront does not rewrite another merchant's chrome. The
 * global key stays as the fallback (and as the studio/admin preference).
 */
const scopedKey = (scope: string | null) => (scope ? `${STORAGE_KEY}:${scope}` : STORAGE_KEY);

function readStored(scope: string | null): Lang | null {
  try {
    const value = window.localStorage.getItem(scopedKey(scope)) ?? window.localStorage.getItem(STORAGE_KEY);
    return value === "bn" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

type Vars = Record<string, string | number>;

type LangContextValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  /** Namespaces persistence to one storefront. `null` is the global scope. */
  setScope: (scope: string | null) => void;
  toggle: () => void;
  /** Pick a localized string. English is the default/fallback. */
  t: (en: string, bn?: string) => string;
  /** Look up a dictionary key. English is the default/fallback. */
  tk: (key: string, vars?: Vars) => string;
  /** Translate a server/database message key into UI copy. */
  tError: (error: unknown) => string;
};

const LangContext = createContext<LangContextValue | null>(null);

function lookup(lang: Lang, key: string, vars?: Vars) {
  const entry = (DICT as Record<string, Entry>)[key];
  if (!entry) return interpolate(key, vars);
  return interpolate(lang === "bn" ? entry.bn : entry.en, vars);
}

function translateError(lang: Lang, error: unknown) {
  const raw =
    typeof error === "string" ? error : error instanceof Error ? error.message : "";
  if (!raw) return lookup(lang, "common.error");
  const parsed = parseMessageKey(raw);
  if (parsed) return lookup(lang, parsed.key, parsed.vars);
  // Database errors arrive wrapped in provider prose; recover the key.
  const embedded = /([a-z0-9_]+(?:\.[a-z0-9_]+)+)(?::([^\s"']+))?/i.exec(raw);
  if (embedded) {
    const nested = parseMessageKey(embedded[0] as string);
    if (nested) return lookup(lang, nested.key, nested.vars);
  }
  return raw;
}

export function LanguageProvider({
  children,
  /**
   * Locale resolved during SSR from the `framique.lang` cookie (see
   * `lang-boot.ts`). Passing it in is what keeps first paint from reflowing:
   * the server already renders Bangla for a Bangla reader instead of rendering
   * English and swapping in an effect, which measured as 0.06–0.13 CLS at
   * 320px. It stays optional so non-document mounts (tests, storefront
   * subtrees) keep working with the English default.
   */
  initialLang = "en",
}: {
  children: ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [scope, setScope] = useState<string | null>(null);

  useEffect(() => {
    // Phase 7.1: `?lang=` wins over storage. hreflang alternates point at these
    // URLs, so a crawler (or a shared link) must land on the locale it asked
    // for rather than whatever the last visitor picked.
    const pinned = localeFromSearch(window.location.search);
    if (pinned) {
      setLangState(pinned);
      persistLangCookie(pinned);
      return;
    }
    // Storage is still the source of truth for per-store scopes; the cookie is
    // only the SSR mirror. When they disagree (first visit after this change,
    // or a scoped storefront preference) reconcile *and* re-mirror, so the next
    // document already paints correctly and this branch becomes a no-op.
    const stored = readStored(scope);
    if (stored && stored !== lang) {
      setLangState(stored);
      persistLangCookie(stored);
    } else if (!stored) {
      persistLangCookie(lang);
    }
    // `lang` is intentionally read, not tracked: this reconciles the boot value
    // per scope, it is not a sync loop on every toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (next: Lang) => {
      setLangState(next);
      // The cookie is the SSR mirror: without it the next document paints in
      // the old locale and then reflows, which is the shift we just removed.
      persistLangCookie(next);
      try {
        window.localStorage.setItem(scopedKey(scope), next);
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage unavailable */
      }
    },
    [scope],
  );

  const value = useMemo<LangContextValue>(
    () => ({
      lang,
      setLang,
      setScope,
      toggle: () => setLang(lang === "en" ? "bn" : "en"),
      t: (en, bn) => (lang === "bn" && bn ? bn : en),
      tk: (key, vars) => lookup(lang, key, vars),
      tError: (error) => translateError(lang, error),
    }),
    [lang, setLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (ctx) return ctx;
  // Fallback keeps components usable outside the provider (English only).
  return {
    lang: "en",
    setLang: () => undefined,
    setScope: () => undefined,
    toggle: () => undefined,
    t: (en) => en,
    tk: (key, vars) => lookup("en", key, vars),
    tError: (error) => translateError("en", error),
  };
}

/** Binds language persistence to one storefront for the mounted subtree. */
export function useLangScope(scope: string | null) {
  const { setScope } = useLang();
  useEffect(() => {
    setScope(scope);
    return () => setScope(null);
  }, [scope, setScope]);
}

/** Inline bilingual text. English renders by default. */
export function T({ en, bn }: { en: string; bn?: string }) {
  const { t } = useLang();
  return <>{t(en, bn)}</>;
}

/** Dictionary-keyed text. English renders by default. */
export function TK({ k, vars }: { k: string; vars?: Vars }) {
  const { tk } = useLang();
  return <>{tk(k, vars)}</>;
}

