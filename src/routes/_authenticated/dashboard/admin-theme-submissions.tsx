import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  StatusPill,
  btnGhost,
  btnPrimary,
} from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import {
  decideThemeSubmissionFn,
  pendingThemeSubmissionsFn,
} from "@/lib/theme-submissions.functions";
import type { PendingThemeSubmission } from "@/lib/theme-submissions.server";

export type ReviewRow = PendingThemeSubmission;

/** Project server rows to the columns the staff queue table renders. */
export function toReviewRows(list: PendingThemeSubmission[]): ReviewRow[] {
  return list.map((row) => ({ ...row }));
}

export const Route = createFileRoute(
  "/_authenticated/dashboard/admin-theme-submissions",
)({
  loader: () => pendingThemeSubmissionsFn(),
  head: () => ({
    meta: [
      { title: "Theme submissions — Framique admin" },
      {
        name: "description",
        content:
          "Staff review queue for third-party theme packages: approve into the registry or reject with a note.",
      },
      { property: "og:title", content: "Theme submissions — Framique admin" },
      {
        property: "og:description",
        content: "Review pending theme packages before they reach merchants.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminThemeSubmissionsPage,
});

function AdminThemeSubmissionsPage() {
  const { tError } = useLang();
  const data = Route.useLoaderData();
  const rows = toReviewRows(data);
  const router = useRouter();
  const decide = useServerFn(decideThemeSubmissionFn);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, approve: boolean, note: string | undefined) {
    setBusyId(id);
    try {
      await decide({ data: { id, approve, note } });
      toast.success(
        approve ? "Submission approved" : "Submission rejected",
      );
      await router.invalidate();
    } catch (error) {
      toast.error(tError(error));
    } finally {
      setBusyId(null);
    }
  }

  function approve(row: ReviewRow) {
    const note = window.prompt("Reviewer note (optional, stored with the decision)");
    if (note === null) return;
    void run(row.id, true, note.trim() ? note.trim() : undefined);
  }

  function reject(row: ReviewRow) {
    const note = window.prompt("Reason for rejection (kept internal)");
    if (note === null) return;
    void run(row.id, false, note.trim() ? note.trim() : undefined);
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">
          Theme submissions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Staff-only queue. Approving publishes the package into the theme
          registry; rejecting records the reviewer note without publishing.
        </p>
      </header>

      <section className="rounded-fq-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          Pending review ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">
            Nothing here. New developer packages land in this queue.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Package</th>
                  <th className="px-4 py-2">Version</th>
                  <th className="px-4 py-2">Merchant</th>
                  <th className="px-4 py-2">Submitted</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const busy = busyId === row.id;
                  return (
                    <tr key={row.id} className="border-t border-border">
                      <td className="px-4 py-3 font-mono text-xs">
                        {row.packageKey || "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {row.packageVersion || "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {row.merchantId}
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                        {row.submittedAt
                          ? new Date(row.submittedAt).toLocaleString()
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill tone="warning" label="pending" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={btnPrimary}
                            disabled={busy}
                            onClick={() => approve(row)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className={btnGhost}
                            disabled={busy}
                            onClick={() => reject(row)}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
