import { useLang } from "@/lib/i18n";

type VersionRow = {
  id: string;
  version: number;
  status: string;
  note: string | null;
  createdAt: string;
  rollbackOf: string | null;
};

type ScheduleRow = {
  id: string;
  action: string;
  runAt: string;
  state: string;
  lastError: string | null;
};

type Props = {
  versions: VersionRow[];
  schedules: ScheduleRow[];
  busy: boolean;
  onRollback: (versionId: string) => void;
  onCancelSchedule: (scheduleId: string) => void;
};

const STATUS_CLASS: Record<string, string> = {
  published: "bg-success-soft text-success-foreground",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
  scheduled: "bg-warning-soft text-warning-foreground",
  failed: "bg-danger-soft text-danger-foreground",
};

function stamp(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** Immutable version history plus pending schedule transitions. */
export function VersionTimeline({ versions, schedules, busy, onRollback, onCancelSchedule }: Props) {
  const { t } = useLang();

  return (
    <div className="space-y-5">
      {schedules.length > 0 && (
        <section aria-label={t("Scheduled changes", "নির্ধারিত পরিবর্তন")} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("Scheduled", "নির্ধারিত")}
          </h3>
          <ul className="space-y-2">
            {schedules.map((row) => (
              <li key={row.id} className="rounded-fq-md border border-border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {row.action === "publish" ? t("Publish", "পাবলিশ") : t("Unpublish", "আনপাবলিশ")}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[row.state] ?? "bg-muted"}`}>
                    {row.state}
                  </span>
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">{stamp(row.runAt)}</p>
                {row.lastError && (
                  <p className="mt-1 text-xs text-danger-foreground">{row.lastError}</p>
                )}
                {row.state === "pending" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onCancelSchedule(row.id)}
                    className="mt-2 text-xs underline disabled:opacity-50"
                  >
                    {t("Cancel", "বাতিল")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label={t("Version history", "ভার্সন ইতিহাস")} className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("Versions", "ভার্সন")}
        </h3>
        {versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("Nothing committed yet.", "এখনো কিছু কমিট হয়নি।")}
          </p>
        ) : (
          <ol className="space-y-2">
            {versions.map((row) => (
              <li key={row.id} className="rounded-fq-md border border-border bg-card p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium tabular-nums">v{row.version}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[row.status] ?? "bg-muted"}`}>
                    {row.status}
                  </span>
                </div>
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">{stamp(row.createdAt)}</p>
                {row.note && <p className="mt-1 text-xs">{row.note}</p>}
                {row.rollbackOf && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Restored from an earlier version", "আগের ভার্সন থেকে ফেরানো")}
                  </p>
                )}
                {row.status !== "published" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRollback(row.id)}
                    className="mt-2 inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {t("Restore this version", "এই ভার্সন ফেরান")}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
