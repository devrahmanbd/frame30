/**
 * Phase 12 — pre-publish check panel (opens from Publish / Schedule).
 * Lists visibility, publish date, SEO score and unresolved builder lints;
 * a failing check disables the confirm button and explains why.
 */
import { useEffect, useRef } from "react";
import { AlertTriangle, Check, X, XCircle } from "lucide-react";
import { btnGhost, btnPrimary } from "@/components/console/kit";
import { PRIMARY_LABEL, canProceed, type PrePublishCheck, type PrimaryAction } from "@/lib/editor/editor-doc";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function PrePublishPanel({
  open,
  checks,
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  checks: PrePublishCheck[];
  action: PrimaryAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t, lang } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onCancel]);
  if (!open) return null;

  const ok = canProceed(checks);
  const fails = checks.filter((c) => c.level === "fail").length;
  const warns = checks.filter((c) => c.level === "warn").length;
  const ordered = [...checks].sort((a, b) => rank(a.level) - rank(b.level));

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby="prepublish-title"
      className="fq-enter absolute inset-y-0 right-0 z-20 flex w-full max-w-[320px] flex-col border-l border-border bg-card shadow-[-24px_0_48px_-32px_rgb(0_0_0/0.5)]"
    >
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <h2 id="prepublish-title" className="text-sm font-semibold">
          {t("Are you ready to", "আপনি কি প্রস্তুত")} {PRIMARY_LABEL[action][lang === "bn" ? "bn" : "en"].toLowerCase()}?
        </h2>
        <button type="button" onClick={onCancel} aria-label={t("Close", "বন্ধ")} className="fq-focus-glow inline-flex size-8 items-center justify-center rounded-fq-md hover:bg-muted">
          <X className="size-4" aria-hidden />
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        <p className="fq-sub text-xs">
          {fails ? t(`${fails} issue${fails > 1 ? "s" : ""} to fix first`, `${fails}টি সমস্যা আগে ঠিক করুন`) : warns ? t("Looks good — a few suggestions below.", "ভালো দেখাচ্ছে — নিচে কিছু পরামর্শ।") : t("Everything checks out.", "সব ঠিক আছে।")}
        </p>
        <ul className="mt-3 space-y-2" aria-label={t("Pre-publish checks", "প্রকাশ-পূর্ব যাচাই")}>
          {ordered.map((c) => (
            <li key={c.id} className="flex items-start gap-2 text-sm">
              <CheckIcon level={c.level} />
              <span className={cn(c.level === "fail" && "font-medium")}>{lang === "bn" ? c.bn : c.en}</span>
            </li>
          ))}
        </ul>
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-border p-3">
        <button type="button" onClick={onCancel} className={cn(btnGhost, "min-h-8 text-xs")}>
          {t("Cancel", "বাতিল")}
        </button>
        <button type="button" onClick={onConfirm} disabled={!ok || busy} className={cn(btnPrimary, "min-h-8 text-xs")}>
          {PRIMARY_LABEL[action][lang === "bn" ? "bn" : "en"]}
        </button>
      </footer>
    </aside>
  );
}

function rank(level: PrePublishCheck["level"]) {
  return level === "fail" ? 0 : level === "warn" ? 1 : 2;
}

function CheckIcon({ level }: { level: PrePublishCheck["level"] }) {
  if (level === "fail") return <XCircle className="mt-0.5 size-4 shrink-0 text-[var(--fq-danger)]" aria-label="Fail" />;
  if (level === "warn") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--fq-warning)]" aria-label="Warning" />;
  return <Check className="mt-0.5 size-4 shrink-0 text-[var(--fq-success)]" aria-label="Pass" />;
}
