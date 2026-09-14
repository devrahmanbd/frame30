import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import { ownerFraudFn, ownerSetFlagFn } from "@/lib/owner.functions";
import {
  FlagSwitch,
  OwnerHeader,
  OwnerTable,
  StatCard,
  StatGrid,
  StatePill,
} from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/fraud")({
  head: () => ({
    meta: [
      { title: "Fraud desk — Framique owner console" },
      {
        name: "description",
        content:
          "Platform fraud desk for Framique: risk cases across every tenant, blacklist depth, and a scoring-engine switch that fails open to manual review.",
      },
      { property: "og:title", content: "Fraud desk — Framique owner console" },
      {
        property: "og:description",
        content: "Cross-tenant risk cases and the scoring-engine kill switch.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FraudDesk,
});

function FraudDesk() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerFraudFn);
  const setFlag = useServerFn(ownerSetFlagFn);

  const { data, isLoading } = useQuery({ queryKey: ["owner-fraud"], queryFn: () => load() });

  const toggle = useMutation({
    mutationFn: (value: boolean) => setFlag({ data: { key: "fraud_engine_enabled", value } }),
    onSuccess: () => {
      toast.success(tk("owner.flag_saved"));
      void qc.invalidateQueries({ queryKey: ["owner-fraud"] });
    },
    onError: () => toast.error(tk("owner.flag_failed")),
  });

  const rows = data?.rows ?? [];

  return (
    <section className="space-y-4">
      <OwnerHeader title={tk("owner.fraud.title")} subtitle={tk("owner.fraud.subtitle")} />

      <FlagSwitch
        label={tk("owner.fraud.engine")}
        hint={tk("owner.audited")}
        enabled={data?.engineEnabled !== false}
        onLabel={tk("owner.on")}
        offLabel={tk("owner.off")}
        pending={toggle.isPending}
        onToggle={(next) => toggle.mutate(next)}
      />

      <StatGrid>
        <StatCard label={tk("owner.fraud.open")} value={String(data?.counts.open ?? 0)} />
        <StatCard label={tk("owner.fraud.evidence")} value={String(data?.counts.evidence ?? 0)} />
        <StatCard label={tk("owner.fraud.rejected")} value={String(data?.counts.rejected ?? 0)} />
        <StatCard label={tk("owner.fraud.blacklist")} value={String(data?.blacklist.active ?? 0)} />
      </StatGrid>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}

      {rows.length > 0 ? (
        <OwnerTable
          head={["Order", tk("platform.tenants"), tk("owner.fraud.score"), "Amount", "Status"]}
        >
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-3 py-2">
                <code className="font-mono text-xs">{c.order_number || "—"}</code>
              </td>
              <td className="px-3 py-2">{c.merchantName ?? c.merchant_id}</td>
              <td className="px-3 py-2 tabular-nums">{c.risk_score}</td>
              <td className="px-3 py-2 tabular-nums">
                {fmtMinor(c.amount_minor_int, c.currency_code)}
              </td>
              <td className="px-3 py-2">
                <StatePill
                  tone={c.status === "rejected" ? "bad" : c.status === "approved" ? "ok" : "warn"}
                >
                  {c.status}
                </StatePill>
              </td>
            </tr>
          ))}
        </OwnerTable>
      ) : null}
    </section>
  );
}
