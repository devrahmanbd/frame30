import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import { ownerMarketingFn, ownerSetFlagFn } from "@/lib/owner.functions";
import { FlagSwitch, OwnerHeader, StatCard, StatGrid } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/marketing")({
  head: () => ({
    meta: [
      { title: "Consent channels — Framique owner console" },
      {
        name: "description",
        content:
          "Platform-wide marketing consent switches for Framique: turn email, SMS or push sending off, with the recorded opt-out ledger beside them.",
      },
      { property: "og:title", content: "Consent channels — Framique owner console" },
      {
        property: "og:description",
        content: "Marketing channel switches and the opt-out ledger they must honour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsentDesk,
});

function ConsentDesk() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerMarketingFn);
  const setFlag = useServerFn(ownerSetFlagFn);

  const { data, isLoading } = useQuery({ queryKey: ["owner-marketing"], queryFn: () => load() });

  const toggle = useMutation({
    mutationFn: (input: { key: string; value: boolean }) => setFlag({ data: input }),
    onSuccess: () => {
      toast.success(tk("owner.flag_saved"));
      void qc.invalidateQueries({ queryKey: ["owner-marketing"] });
    },
    onError: () => toast.error(tk("owner.flag_failed")),
  });

  const on = (key: string) => data?.flags[key] !== false;

  return (
    <section className="space-y-4">
      <OwnerHeader
        title={tk("owner.marketing.title")}
        subtitle={tk("owner.marketing.subtitle")}
      />
      <p className="text-xs text-muted-foreground">{tk("owner.audited")}</p>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}

      <div className="space-y-2">
        {(
          [
            ["consent_email_enabled", tk("owner.marketing.email")],
            ["consent_sms_enabled", tk("owner.marketing.sms")],
            ["consent_push_enabled", tk("owner.marketing.push")],
          ] as const
        ).map(([key, label]) => (
          <FlagSwitch
            key={key}
            label={label}
            enabled={on(key)}
            onLabel={tk("owner.on")}
            offLabel={tk("owner.off")}
            pending={toggle.isPending}
            onToggle={(next) => toggle.mutate({ key, value: next })}
          />
        ))}
      </div>

      <StatGrid>
        <StatCard
          label={tk("owner.marketing.subscribers")}
          value={String(data?.subscribers.total ?? 0)}
        />
        <StatCard
          label={tk("owner.marketing.unsubscribed")}
          value={String(data?.subscribers.unsubscribed ?? 0)}
        />
        <StatCard
          label={tk("owner.marketing.email")}
          value={String(data?.subscribers.emailConsent ?? 0)}
        />
        <StatCard
          label={tk("owner.marketing.sms")}
          value={String(data?.subscribers.smsConsent ?? 0)}
        />
      </StatGrid>
    </section>
  );
}
