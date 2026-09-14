import { useLang } from "@/lib/i18n";

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useLang();

  return (
    <div
      role="group"
      aria-label="Language / ভাষা"
      // `shrink-0`: the buttons carry it already, but a shrinking *group* still
      // squeezed them to 15px wide inside the 320px header flex row.
      className={`inline-flex shrink-0 items-center rounded-fq-md border border-border bg-card p-0.5 text-xs ${className}`}
    >
      {(["en", "bn"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`min-h-11 w-11 min-w-11 shrink-0 rounded-fq-sm text-center font-medium transition-colors ${
            lang === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {code === "en" ? "EN" : "বাং"}
        </button>
      ))}
    </div>
  );
}
