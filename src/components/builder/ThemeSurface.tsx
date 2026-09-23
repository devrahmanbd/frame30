/**
 * Themeless default surface (theme purge Task 3).
 *
 * Ruling 2026-09-23: themeless fallback = builder content + default chrome,
 * zero theme tokens. Token CSS variables, dark sets and motion budgets are
 * gone — this is a plain locale scope around the default chrome so every
 * storefront renders complete content without any theme.
 *
 * `tokens` is kept as an ignored optional for cross-track compat
 * (ThemePreviewFrame still passes it) — it never reaches markup.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { ThemeTokens } from "@/lib/builder-ast";
import { formatDisplayMoney } from "@/lib/money-display";

export type ThemeLocaleValue = {
  digits: "latin" | "bengali";
  locale: "en" | "bn";
  currencyDisplay: "symbol" | "code";
};

const ThemeLocaleContext = createContext<ThemeLocaleValue>({
  digits: "latin",
  locale: "en",
  currencyDisplay: "symbol",
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
  return (
    amountMinor: number | string | null | undefined,
    currency?: string,
    compact = true,
  ) =>
    formatDisplayMoney(amountMinor, {
      digits: theme.digits,
      locale: theme.locale,
      currencyDisplay: theme.currencyDisplay,
      ...(currency ? { currency } : {}),
      compact,
    });
}

/** True when the visitor's OS asks for dark. Client-only, so SSR stays light. */
function usePrefersDark(_enabled: boolean): boolean {
  return false;
}

type Props = {
  /** Deprecated: ignored — zero tokens after the theme purge. */
  tokens?: ThemeTokens | null;
  className?: string;
  children: ReactNode;
};

export function ThemeSurface({ className, children }: Props) {
  const value: ThemeLocaleValue = {
    digits: "latin",
    locale: "en",
    currencyDisplay: "symbol",
  };
  return (
    <ThemeLocaleContext.Provider value={value}>
      <div className={className ?? "fq-theme-scope min-h-screen bg-background"}>
        {children}
      </div>
    </ThemeLocaleContext.Provider>
  );
}
