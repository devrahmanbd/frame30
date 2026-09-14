import { useEffect, useRef } from "react";
import { useLang } from "@/lib/i18n";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Owner-console confirm dialog. Deliberately not shared with the merchant
 * console: /root actions are cross-tenant and their copy, tone and focus
 * behaviour must be able to diverge without regressing /admin.
 */
export function RootConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "primary",
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { t } = useLang();

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="root-confirm-title"
        aria-describedby="root-confirm-desc"
        className="w-full max-w-md rounded-fq-lg border border-border bg-card p-5 shadow-lg"
      >
        <h2 id="root-confirm-title" className="text-base font-semibold text-foreground">
          {title}
        </h2>
        <p id="root-confirm-desc" className="mt-2 text-sm text-foreground">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-fq-md border border-border px-4 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("Back", "ফিরে যান")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-11 rounded-fq-md px-4 text-sm font-semibold disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
              tone === "danger"
                ? "bg-rickshaw-red-600 text-background"
                : "bg-bd-teal-700 text-background"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
