import { useLang } from "@/lib/i18n";
import type { AstIssue } from "@/lib/builder-ast";

export type PublishModalProps = {
  open: boolean;
  onClose: () => void;
  onPublish: () => void;
  issues: readonly AstIssue[];
  templateName: string;
  hasChanges: boolean;
};

export function PublishModal({ open, onClose, onPublish, issues, templateName, hasChanges }: PublishModalProps) {
  const { t } = useLang();
  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warn");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div role="dialog" aria-label={t("Publish checklist", "পাবলিশ চেকলিস্ট")} className="w-full max-w-lg rounded-fq-lg border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-bold">{t("Publish template", "টেমপ্লেট পাবলিশ করুন")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t(`Publishing "${templateName}" to your live storefront.`, `"${templateName}" আপনার লাইভ স্টোরফ্রন্টে পাবলিশ করা হচ্ছে।`)}</p>
        <div className="mt-4 space-y-2">
          {errors.length > 0 && (
            <div className="rounded-fq-md bg-destructive/10 p-3 text-sm">
              <p className="font-medium text-destructive">{t(`${errors.length} error(s) must be fixed first`, `${errors.length}টি ত্রুটি প্রথমে সংশোধন করুন`)}</p>
              <ul className="mt-1 list-disc pl-4 text-xs text-destructive/80">
                {errors.slice(0, 5).map((e, i) => (<li key={i}>{e.message}</li>))}
                {errors.length > 5 && <li>{t(`…and ${errors.length - 5} more`, `…এবং আরো ${errors.length - 5}টি`)}</li>}
              </ul>
            </div>
          )}
          {warnings.length > 0 && <div className="rounded-fq-md bg-warning/10 p-3 text-sm"><p className="font-medium">{t(`${warnings.length} warning(s) — you can proceed`, `${warnings.length}টি সতর্কতা — এগিয়ে যেতে পারেন`)}</p></div>}
          {errors.length === 0 && hasChanges && <div className="rounded-fq-md bg-success/10 p-3 text-sm text-success-foreground">{t("All checks passed. Ready to publish.", "সব চেক পাস করেছে। পাবলিশ করার জন্য প্রস্তুত।")}</div>}
          {!hasChanges && <div className="rounded-fq-md bg-muted p-3 text-sm text-muted-foreground">{t("No changes to publish.", "পাবলিশ করার মতো কোনো পরিবর্তন নেই।")}</div>}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-fq-md border border-border px-4 py-2 text-sm hover:bg-muted">{t("Cancel", "বাতিল")}</button>
          <button type="button" onClick={onPublish} disabled={errors.length > 0 || !hasChanges} className="rounded-fq-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{t("Publish", "পাবলিশ")}</button>
        </div>
      </div>
    </div>
  );
}
