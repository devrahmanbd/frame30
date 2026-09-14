import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useLang } from "@/lib/i18n";
import {
  merchantImpersonationQueueFn,
  merchantImpersonationRespondFn,
} from "@/lib/owner.functions";

const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";
const btnPrimary =
  "rounded-fq-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50";

/**
 * Tenant-side gate for platform support access. Nothing starts without an
 * explicit approval here, and an approved window can be cut short at any time.
 */
export function ImpersonationConsent({ merchantId }: { merchantId: string }) {
  const { t } = useLang();
  const qc = useQueryClient();
  const loadQueue = useServerFn(merchantImpersonationQueueFn);
  const respondFn = useServerFn(merchantImpersonationRespondFn);

  const { data, isLoading } = useQuery({
    queryKey: ["impersonation-queue", merchantId],
    queryFn: () => loadQueue({ data: { merchantId } }),
    refetchInterval: 60_000,
  });

  const respond = useMutation({
    mutationFn: (v: { grantId: string; approve: boolean }) => respondFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(
        v.approve
          ? t("Support access approved", "সাপোর্ট অ্যাক্সেস অনুমোদিত")
          : t("Support access declined", "সাপোর্ট অ্যাক্সেস প্রত্যাখ্যাত"),
      );
      void qc.invalidateQueries({ queryKey: ["impersonation-queue", merchantId] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : t("Action failed", "কাজটি ব্যর্থ হয়েছে")),
  });

  const rows = data?.rows ?? [];
  if (isLoading || rows.length === 0) return null;

  return (
    <section className="space-y-3 rounded-fq-md border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">
          {t("Platform support access", "প্ল্যাটফর্ম সাপোর্ট অ্যাক্সেস")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(
            "Framique support cannot enter your store until you approve it here. Approved access expires by itself and every action is logged.",
            "আপনি এখানে অনুমোদন না দিলে ফ্রেমিক সাপোর্ট আপনার স্টোরে ঢুকতে পারবে না। অনুমোদিত অ্যাক্সেস নিজেই শেষ হয় এবং প্রতিটি কাজ লগ হয়।",
          )}
        </p>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-fq-md border border-border p-3">
            <p className="text-sm font-medium">{r.reason}</p>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {r.scope === "write"
                ? t("Read and write access", "পড়া ও লেখার অ্যাক্সেস")
                : t("Read-only access", "শুধু পড়ার অ্যাক্সেস")}
              {" · "}
              {t("expires", "মেয়াদ শেষ")} {new Date(r.expires_at).toLocaleString()}
            </p>
            <div className="mt-2 flex gap-2">
              {r.state === "pending_consent" ? (
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={respond.isPending}
                  onClick={() => respond.mutate({ grantId: r.id, approve: true })}
                >
                  {t("Approve", "অনুমোদন")}
                </button>
              ) : null}
              <button
                type="button"
                className={btn}
                disabled={respond.isPending}
                onClick={() => respond.mutate({ grantId: r.id, approve: false })}
              >
                {r.state === "active"
                  ? t("End access now", "এখনই বন্ধ করুন")
                  : t("Decline", "প্রত্যাখ্যান")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
