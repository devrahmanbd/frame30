import { useLang } from "@/lib/i18n";

export type GlobalBlockBarProps = {
  blockName: string;
  onEdit: () => void;
  onUnlink: () => void;
};

export function GlobalBlockBar({
  blockName,
  onEdit,
  onUnlink,
}: GlobalBlockBarProps) {
  const { t } = useLang();
  return (
    <div className="flex items-center justify-between gap-3 rounded-fq-md border border-primary/20 bg-primary/5 px-4 py-2 text-sm">
      <div className="flex items-center gap-2">
        <svg
          className="size-4 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="font-medium text-primary">
          {t("Global block:", "গ্লোবাল ব্লক:")} {blockName}
        </span>
        <span className="text-muted-foreground">
          {t("Edits update everywhere", "পরিবর্তন সব জায়গায় আপডেট হবে")}
        </span>
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          {t("Edit global", "গ্লোবাল এডিট")}
        </button>
        <button
          type="button"
          onClick={onUnlink}
          className="rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          {t("Unlink", "আলাদা করুন")}
        </button>
      </div>
    </div>
  );
}

/**
 * T3.3 — footer/global-block builder control (minimal).
 *
 * Lets the builder reuse one footer everywhere: when the footer slot links
 * a global block this renders the shared `GlobalBlockBar` (same Edit/Unlink
 * actions, byte-identical) under a footer slot caption; when unlinked it
 * renders a hint instead of nothing, so the merchant can see the footer is
 * theme-owned and link a block to share it across themes. `GlobalBlockBar`
 * above is untouched.
 */
export type FooterGlobalBlockControlProps = {
  /** Linked footer global-block name; null when the footer is theme-owned. */
  blockName: string | null;
  onEdit: () => void;
  onUnlink: () => void;
  /** Optional link action; absent renders the unlinked hint without a button. */
  onLink?: () => void;
};

export function FooterGlobalBlockControl({
  blockName,
  onEdit,
  onUnlink,
  onLink,
}: FooterGlobalBlockControlProps) {
  const { t } = useLang();
  if (!blockName) {
    return (
      <div
        data-footer-global-block="unlinked"
        className="flex items-center justify-between gap-3 rounded-fq-md border border-dashed border-border px-4 py-2 text-sm"
      >
        <span className="text-muted-foreground">
          {t(
            "Footer uses theme sections. Link a global block to reuse it across themes.",
            "ফুটার থিম সেকশন ব্যবহার করে। থিম জুড়ে পুনঃব্যবহার করতে একটি গ্লোবাল ব্লক লিঙ্ক করুন।",
          )}
        </span>
        {onLink && (
          <button
            type="button"
            onClick={onLink}
            className="shrink-0 rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            {t("Link global block", "গ্লোবাল ব্লক লিঙ্ক করুন")}
          </button>
        )}
      </div>
    );
  }
  return (
    <div data-footer-global-block="linked">
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("Footer", "ফুটার")}
      </p>
      <GlobalBlockBar
        blockName={blockName}
        onEdit={onEdit}
        onUnlink={onUnlink}
      />
    </div>
  );
}
