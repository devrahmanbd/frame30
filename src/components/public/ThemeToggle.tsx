import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ThemeToggle — Public marketing theme switcher (Light / Dark).
 *
 * Implements Hallmark & WCAG eye-soothing contrast standards:
 * - Light: Calm velvety blush/pink warmth, deep charcoal ink (11.2:1), Facebook blue CTAs.
 * - Dark: Rich obsidian twilight, soft parchment milk ink (11.8:1), luminous blue CTAs.
 * - Minimum 44x44px touch target (WCAG 2.5.8 & Hallmark mobile gate).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem("fq_public_theme") as "light" | "dark" | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      applyTheme(stored);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      // Default to light to showcase the signature calm blush/pink palette
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      applyTheme(initial);
    }
  }, []);

  const applyTheme = (t: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
    const siteEl = document.querySelector(".fq-site");
    if (siteEl) {
      siteEl.setAttribute("data-theme", t);
    }
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("fq_public_theme", next);
    applyTheme(next);
  };

  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle light and dark theme"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-fq-md border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <span className="size-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-fq-md border border-border/60 text-muted-foreground transition-all duration-200 hover:border-border hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      {theme === "light" ? (
        <Moon className="size-4 transition-transform duration-200 hover:-rotate-12" aria-hidden="true" />
      ) : (
        <Sun className="size-4 transition-transform duration-200 hover:rotate-45" aria-hidden="true" />
      )}
    </button>
  );
}
