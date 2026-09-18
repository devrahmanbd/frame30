import { useLang } from "@/lib/i18n";

export type GlobalBlockBarProps = {
  blockName: string;
  onEdit: () => void;
  onUnlink: () => void;
};

export function GlobalBlockBar({ blockName, onEdit, onUnlink }: GlobalBlockBarProps) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-between gap-3 rounded-fq-md border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <svg className="size-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span className="font-medium text-primary">
          {t("Global block:", "গ্লোবাল ব্লক:")} {blockName}
        </span>
        <span className="text-muted-foreground">
          {t("Edits update everywhere", "পরিবর্তন সব জায়গায় আপডেট হবে")}
        </span>
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={onEdit} className="rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted">{t("Edit global", "গ্লোবাল এডিট")}</button>
        <button type="button" onClick={onUnlink} className="rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted">{t("Unlink", "আলাদা করুন")}</button>
      </div>
    </div>
  );
}
