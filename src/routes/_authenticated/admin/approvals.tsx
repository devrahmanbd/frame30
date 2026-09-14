import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { StatusPill, Field, inputClass, btnPrimary, btnGhost } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { governanceLoadFn } from "@/lib/governance.functions";
import { approvalSubmitFn, approvalDecideFn } from "@/lib/governance.functions";

export const Route = createFileRoute("/_authenticated/admin/approvals")({
  loader: () => governanceLoadFn(),
  head: () => ({
    meta: [
      { title: "Approvals — Framique admin" },
      {
        name: "description",
        content: "Four-eyes review queue for sensitive catalog, marketing, theme and finance actions.",
      },
      { property: "og:title", content: "Approvals — Framique admin" },
      { property: "og:description", content: "Submit, review and decide on staff approval requests." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsPage,
});

const AREAS = ["catalog", "marketing", "themes", "finance", "orders"] as const;
const ACTIONS = ["publish", "update", "refund", "deactivate"] as const;

const TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  expired: "neutral",
  cancelled: "neutral",
};

function ApprovalsPage() {
  const { tk, tError } = useLang();
  const data = Route.useLoaderData();
  const router = useRouter();
  const submit = useServerFn(approvalSubmitFn);
  const decide = useServerFn(approvalDecideFn);

  const [resourceType, setResourceType] = useState<string>("catalog");
  const [resourceAction, setResourceAction] = useState<string>("publish");
  const [note, setNote] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const pending = data.approvals.filter((a) => a.status === "pending");
  const history = data.approvals.filter((a) => a.status !== "pending");

  async function run(fn: () => Promise<unknown>, okKey: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(tk(okKey));
      await router.invalidate();
    } catch (error) {
      toast.error(tError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{tk("approval.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tk("approval.subtitle")}</p>
      </header>

      <section className="rounded-fq-md border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">{tk("approval.new")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label={tk("approval.resource_type")}>
            <select
              className={inputClass}
              value={resourceType}
              onChange={(e) => setResourceType(e.target.value)}
            >
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {tk(`perm.group.${a}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tk("approval.resource_action")}>
            <select
              className={inputClass}
              value={resourceAction}
              onChange={(e) => setResourceAction(e.target.value)}
            >
              {ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tk("approval.note")}>
            <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <button
          type="button"
          className={`${btnPrimary} mt-4`}
          disabled={busy}
          onClick={() =>
            run(
              () => submit({ data: { resourceType, resourceAction, note } }),
              "approval.submitted",
            )
          }
        >
          {tk("approval.new")}
        </button>
      </section>

      <section className="rounded-fq-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          {tk("approval.queue")}
        </h2>
        <ul className="divide-y divide-border">
          {pending.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">{tk("common.empty")}</li>
          )}
          {pending.map((a) => (
            <li key={a.id} className="space-y-3 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusPill tone="warning" label={tk("approval.status.pending")} />
                <span className="font-medium">
                  {tk(`perm.group.${a.resourceType}`)} · {a.resourceAction}
                </span>
                <span className="text-muted-foreground">{a.submittedBy}</span>
                <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                  {tk("approval.expires")}: {new Date(a.expiresAt).toLocaleString()}
                </span>
              </div>
              {a.summary && <p className="text-sm text-muted-foreground">{a.summary}</p>}
              <div className="flex flex-wrap items-end gap-3">
                <Field label={tk("approval.comment")}>
                  <input
                    className={inputClass}
                    value={comments[a.id] ?? ""}
                    onChange={(e) => setComments({ ...comments, [a.id]: e.target.value })}
                  />
                </Field>
                {a.isMine ? (
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          decide({
                            data: {
                              requestId: a.id,
                              decision: "cancelled",
                              comment: comments[a.id] ?? "",
                            },
                          }),
                        "approval.status.cancelled",
                      )
                    }
                  >
                    {tk("approval.cancel")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={btnPrimary}
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            decide({
                              data: {
                                requestId: a.id,
                                decision: "approved",
                                comment: comments[a.id] ?? "",
                              },
                            }),
                          "approval.status.approved",
                        )
                      }
                    >
                      {tk("approval.approve")}
                    </button>
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            decide({
                              data: {
                                requestId: a.id,
                                decision: "rejected",
                                comment: comments[a.id] ?? "",
                              },
                            }),
                          "approval.status.rejected",
                        )
                      }
                    >
                      {tk("approval.reject")}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-fq-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          {tk("approval.history")}
        </h2>
        <ul className="divide-y divide-border">
          {history.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">{tk("common.empty")}</li>
          )}
          {history.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <StatusPill tone={TONE[a.status] ?? "neutral"} label={tk(`approval.status.${a.status}`)} />
              <span className="font-medium">
                {tk(`perm.group.${a.resourceType}`)} · {a.resourceAction}
              </span>
              <span className="text-muted-foreground">
                {a.submittedBy}
                {a.reviewedBy ? ` → ${a.reviewedBy}` : ""}
              </span>
              {a.reviewComment && (
                <span className="text-muted-foreground">“{a.reviewComment}”</span>
              )}
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {new Date(a.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
