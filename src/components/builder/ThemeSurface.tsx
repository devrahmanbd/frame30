/**
 * Phase 3.1 — the single storefront theme surface.
 *
 * Everything theme-level lands here: token CSS variables, the designed dark
 * set (engaged only when the merchant authored one and the visitor's OS asks
 * for dark), the motion budget, and the locale/digit defaults every money
 * string reads. Widgets stay theme-agnostic — they only see semantic tokens.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DEFAULT_TOKENS, tokensToCss, type ThemeTokens } from "@/lib/builder-ast";
import { formatDisplayMoney } from "@/lib/money-display";

export type ThemeLocaleValue = {
  digits: "latin" | "bengali";
  locale: "en" | "bn";
  currencyDisplay: "symbol" | "code";
};

const ThemeLocaleContext = createContext<ThemeLocaleValue>({
  digits: DEFAULT_TOKENS.digits,
  locale: DEFAULT_TOKENS.locale,
  currencyDisplay: DEFAULT_TOKENS.currencyDisplay,
});

export function useThemeLocale(): ThemeLocaleValue {
  return useContext(ThemeLocaleContext);
}

/**
 * Money formatter bound to the theme's numeral system and currency display.
 * Widgets never do arithmetic — this only turns server minor units into text.
 */
export function useThemeMoney() {
  const theme = useThemeLocale();
  return (amountMinor: number | string | null | undefined, currency?: string, compact = true) =>
    formatDisplayMoney(amountMinor, {
      digits: theme.digits,
      locale: theme.locale,
      currencyDisplay: theme.currencyDisplay,
      ...(currency ? { currency } : {}),
      compact,
    });
}

/** True when the visitor's OS asks for dark. Client-only, so SSR stays light. */
function usePrefersDark(enabled: boolean): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [enabled]);
  return dark;
}

type Props = {
  tokens: ThemeTokens | null;
  className?: string;
  children: ReactNode;
};

export function ThemeSurface({ tokens, className, children }: Props) {
  const dark = usePrefersDark(Boolean(tokens?.dark));
  const style = tokens ? (tokensToCss(tokens) as React.CSSProperties) : undefined;
  const value: ThemeLocaleValue = {
    digits: tokens?.digits ?? DEFAULT_TOKENS.digits,
    locale: tokens?.locale ?? DEFAULT_TOKENS.locale,
    currencyDisplay: tokens?.currencyDisplay ?? DEFAULT_TOKENS.currencyDisplay,
  };
  return (
    <ThemeLocaleContext.Provider value={value}>
      <div
        className={className ?? "fq-theme-scope min-h-screen bg-background"}
        style={style}
        data-motion={tokens?.motion ?? DEFAULT_TOKENS.motion}
        {...(tokens?.dark && dark ? { "data-theme": "dark" } : {})}
      >
        {children}
      </div>
    </ThemeLocaleContext.Provider>
  );
}
