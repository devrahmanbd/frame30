/**
 * Threat-defense — theme approval badge (presentational).
 *
 * Rendered under installed themes whose latest content is flagged with no
 * matching approval audit. The Approve button records explicit merchant
 * approval through the existing `themeApproveFn`; English-only, following
 * the themes desk convention.
 */
import { btnPrimary } from "@/components/console/kit";

export function ThemeApprovalBadge({
  findings,
  busy,
  onApprove,
}: {
  findings: { code: string }[];
  busy?: boolean;
  onApprove: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-fq-md border border-amber-500/40 bg-amber-500/10 px-3 py-2"
    >
      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
        Needs approval
      </span>
      {findings.length > 0 ? (
        <span className="text-xs text-muted-foreground">
          {findings.map((finding) => finding.code).join(", ")}
        </span>
      ) : null}
      <button
        type="button"
        className={btnPrimary}
        disabled={busy}
        onClick={onApprove}
      >
        Approve
      </button>
    </div>
  );
}
