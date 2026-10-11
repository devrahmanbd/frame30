/**
 * Threat-defense — plugin approval badge (presentational).
 *
 * Rendered under installed plugins whose manifest is flagged with no
 * matching approval audit. The Approve button records explicit merchant
 * approval through the existing `pluginApproveFn`. Bilingual via `useLang`,
 * following the InstalledApps convention.
 */
import { useLang } from "@/lib/i18n";

export function PluginApprovalBadge({
  findings,
  busy,
  onApprove,
}: {
  findings: { code: string }[];
  busy?: boolean;
  onApprove: () => void;
}) {
  const { t } = useLang();
  return (
    <div
      role="alert"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-fq-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
    >
      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
        {t("Needs approval", "অনুমোদন প্রয়োজন")}
      </span>
      {findings.length > 0 ? (
        <span className="text-xs text-muted-foreground">
          {findings.map((finding) => finding.code).join(", ")}
        </span>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={onApprove}
        className="rounded-fq-md bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors disabled:opacity-40 cursor-pointer"
      >
        {t("Approve", "অনুমোদন করুন")}
      </button>
    </div>
  );
}
