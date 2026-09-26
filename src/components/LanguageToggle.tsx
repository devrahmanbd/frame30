import { useLang } from "@/lib/i18n";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();

  return (
    <div
      role="group"
      aria-label="Language / ভাষা"
      className={`inline-flex shrink-0 items-center rounded-full p-1 text-xs ${className}`}
    >
      {(["en", "bn"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`min-h-10 w-10 min-w-10 shrink-0 rounded-full text-center font-medium transition-colors ${
            lang === code
              ? "bg-foreground/10 text-foreground"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          {code === "en" ? "EN" : "বাং"}
        </button>
      ))}
    </div>
  );
}
