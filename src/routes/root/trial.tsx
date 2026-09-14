import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { ownerTrialsFn } from "@/lib/owner.functions";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/trial")({
  head: () => ({
    meta: [
      { title: "Trials — Framique owner console" },
      {
        name: "description",
        content:
          "Every Framique tenant's subscription state, trial expiry and next billing date, with the trial length read from its plan definition.",
      },
      { property: "og:title", content: "Trials — Framique owner console" },
      {
        property: "og:description",
        content: "Trial expiry, past-due tenants and plan trial windows.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrialDesk,
});

function TrialDesk() {
  const { tk } = useLang();
  const load = useServerFn(ownerTrialsFn);
  const { data, isLoading } = useQuery({ queryKey: ["owner-trials"], queryFn: () => load() });

  const rows = data?.rows ?? [];
  const date = (v: string | null) => (v ? new Date(v).toLocaleDateString() : "—");

  return (
    <section className="space-y-4">
      <OwnerHeader title={tk("owner.trial.title")} subtitle={tk("owner.trial.subtitle")} />

      <StatGrid>
        <StatCard label={tk("owner.trial.in_trial")} value={String(data?.counts.trial ?? 0)} />
        <StatCard label={tk("owner.trial.active")} value={String(data?.counts.active ?? 0)} />
        <StatCard label={tk("owner.trial.past_due")} value={String(data?.counts.pastDue ?? 0)} />
      </StatGrid>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}
      {!isLoading && rows.length === 0 ? (
        <p className="rounded-fq-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          {tk("common.empty")}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <OwnerTable
          head={[
            tk("platform.tenants"),
            tk("platform.plans_and_limits"),
            tk("owner.trial.days"),
            tk("owner.trial.ends"),
            tk("owner.trial.next_billing"),
          ]}
        >
          {rows.map((r) => (
            <tr key={r.merchantId} className="border-t border-border">
              <td className="px-3 py-2">
                <span className="font-medium">{r.merchantName ?? r.merchantId}</span>{" "}
                <StatePill
                  tone={r.status === "past_due" ? "bad" : r.status === "active" ? "ok" : "warn"}
                >
                  {r.status}
                </StatePill>
              </td>
              <td className="px-3 py-2">{r.plan}</td>
              <td className="px-3 py-2 tabular-nums">{r.trialDays ?? "—"}</td>
              <td className="px-3 py-2 tabular-nums">{date(r.trialEndsAt)}</td>
              <td className="px-3 py-2 tabular-nums">{date(r.nextBillingAt)}</td>
            </tr>
          ))}
        </OwnerTable>
      ) : null}
    </section>
  );
}
