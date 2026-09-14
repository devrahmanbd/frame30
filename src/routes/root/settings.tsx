import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { ownerSetFlagFn, ownerSettingsFn } from "@/lib/owner.functions";
import { OwnerHeader, StatCard, StatGrid } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/settings")({
  head: () => ({
    meta: [
      { title: "Compliance and retention — Framique owner console" },
      {
        name: "description",
        content:
          "Framique platform compliance settings: raw analytics and audit retention windows, callback queue health and the pending approval count.",
      },
      { property: "og:title", content: "Compliance and retention — Framique owner console" },
      {
        property: "og:description",
        content: "Retention windows, queue health and pending approvals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerSettings,
});

function num(value: unknown, fallback: number) {
  return typeof value === "number" ? value : fallback;
}

function OwnerSettings() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerSettingsFn);
  const setFlag = useServerFn(ownerSetFlagFn);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["owner-settings"], queryFn: () => load() });

  const save = useMutation({
    mutationFn: (input: { key: string; value: number }) => setFlag({ data: input }),
    onSuccess: () => {
      toast.success(tk("owner.flag_saved"));
      void qc.invalidateQueries({ queryKey: ["owner-settings"] });
    },
    onError: () => toast.error(tk("owner.flag_failed")),
  });

  const fields = [
    { key: "retention_raw_days", label: tk("owner.settings.raw"), fallback: 90 },
    { key: "retention_audit_days", label: tk("owner.settings.audit"), fallback: 1095 },
  ];

  return (
    <section className="space-y-4">
      <OwnerHeader title={tk("owner.settings.title")} subtitle={tk("owner.settings.subtitle")} />
      <p className="text-xs text-muted-foreground">{tk("owner.audited")}</p>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const current = num(data?.flags[f.key], f.fallback);
          const value = draft[f.key] ?? String(current);
          return (
            <div key={f.key} className="rounded-fq-md border border-border p-4">
              <label className="text-sm font-medium" htmlFor={f.key}>
                {f.label}
              </label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id={f.key}
                  type="number"
                  min={1}
                  max={36500}
                  className="w-28 rounded-fq-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
                  value={value}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                />
                <button
                  type="button"
                  className="rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  disabled={save.isPending || Number(value) === current || !Number(value)}
                  onClick={() => save.mutate({ key: f.key, value: Number(value) })}
                >
                  {tk("common.save")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <StatGrid>
        <StatCard
          label={tk("owner.settings.dead_letter")}
          value={String(data?.gateway.deadLetter ?? 0)}
        />
        <StatCard
          label={tk("owner.settings.processed")}
          value={String(data?.gateway.processed ?? 0)}
        />
        <StatCard
          label={tk("owner.settings.approvals")}
          value={String(data?.approvals.pending ?? 0)}
        />
      </StatGrid>

      <Link
        to="/root/gateway"
        className="inline-block rounded-fq-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        {tk("owner.settings.open_gateway")}
      </Link>
    </section>
  );
}
