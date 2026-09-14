import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Gauge, RefreshCw, Scale } from "lucide-react";
import { toast } from "sonner";
import { ErrorFrame, StatusPill, btnGhost } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { formatWeight, HEAD_BUDGET } from "@/lib/seo-weight";
import { seoWeightRunFn, seoWeightStateFn } from "@/lib/seo-weight.functions";

const textError = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function WeightDesk() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const readState = useServerFn(seoWeightStateFn);
  const runAudit = useServerFn(seoWeightRunFn);
  const state = useQuery({ queryKey: ["seo", "weight"], queryFn: () => readState({ data: { historyLimit: 12 } }) });
  const run = useMutation({
    mutationFn: () => runAudit({ data: {} }),
    onSuccess: (result) => {
      toast.success(result.ok ? t("Weight audit passed.", "ওয়েট অডিট পাস করেছে।") : t("Audit completed with blockers.", "অডিটে ব্লকার পাওয়া গেছে।"));
      void qc.invalidateQueries({ queryKey: ["seo", "weight"] });
    },
    onError: (error) => toast.error(textError(error)),
  });
  if (state.isLoading) return <section className="rounded-lg border border-border p-4 text-sm text-muted-foreground">{t("Loading weight audit…", "ওয়েট অডিট লোড হচ্ছে…")}</section>;
  if (state.error) return <ErrorFrame message={textError(state.error)} />;
  const latest = state.data?.latest;
  const findings = state.data?.findings ?? [];
  const tone = !latest ? "neutral" : latest.status === "ok" ? "success" : latest.status === "running" ? "info" : latest.status === "partial" ? "warning" : "danger";
  return (
    <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby="weight-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="weight-heading" className="flex items-center gap-2 font-medium"><Scale className="size-4" aria-hidden />{t("Storefront weight discipline", "স্টোরফ্রন্ট ওয়েট ডিসিপ্লিন")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("Real gzip measurement of representative published heads. Storefront requests never run this audit.", "প্রকাশিত হেডের বাস্তব gzip পরিমাপ। স্টোরফ্রন্ট রিকোয়েস্টে এই অডিট চলে না।")}</p>
        </div>
        <div className="flex items-center gap-2"><StatusPill tone={tone} label={latest?.status ?? t("Not run", "চালানো হয়নি")} /><button type="button" className={btnGhost} disabled={run.isPending || latest?.status === "running"} onClick={() => run.mutate()}><RefreshCw className={`mr-2 size-4 ${run.isPending ? "animate-spin" : ""}`} aria-hidden />{run.isPending ? t("Auditing…", "অডিট হচ্ছে…") : t("Run audit", "অডিট চালান")}</button></div>
      </header>
      {latest ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={<Gauge className="size-4" />} label={t("Health score", "হেলথ স্কোর")} value={latest.score === null ? "—" : `${latest.score}/100`} />
            <Metric icon={<Activity className="size-4" />} label={t("Heaviest head", "সবচেয়ে ভারী হেড")} value={latest.heaviest_gz_bytes === null ? "—" : formatWeight(latest.heaviest_gz_bytes)} hint={`${t("Budget", "বাজেট")} ${formatWeight(HEAD_BUDGET.gzBytes)}`} />
            <Metric icon={<Scale className="size-4" />} label={t("Blocking findings", "ব্লকিং ফাইন্ডিং")} value={String(latest.blocking_total)} hint={`${latest.pages_measured} ${t("pages measured", "পেজ মাপা হয়েছে")}`} />
          </div>
          {Array.isArray(latest.partial_reasons) && latest.partial_reasons.length > 0 && <p className="rounded-fq-md bg-warning-soft p-3 text-sm text-warning-foreground">{t("Partial sample", "আংশিক নমুনা")}: {latest.partial_reasons.join(", ")}</p>}
          <div>
            <h4 className="text-sm font-medium">{t("Latest findings", "সর্বশেষ ফাইন্ডিং")}</h4>
            <ul className="mt-2 divide-y divide-border border-y border-border">
              {findings.map((finding) => <li key={finding.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[7rem_1fr_auto]"><StatusPill tone={finding.severity === "error" ? "danger" : finding.severity === "warn" ? "warning" : "info"} label={finding.code} /><span>{lang === "bn" ? finding.message_bn : finding.message}<span className="block text-xs text-muted-foreground">{finding.scope}{finding.offender ? ` · ${finding.offender}` : ""}</span></span>{finding.actual !== null && <span className="tabular-nums text-muted-foreground">{formatWeight(finding.actual)}{finding.budget !== null ? ` / ${formatWeight(finding.budget)}` : ""}</span>}</li>)}
              {findings.length === 0 && <li className="py-3 text-sm text-muted-foreground">{t("No budget violations in the latest run.", "সর্বশেষ রানে কোনো বাজেট লঙ্ঘন নেই।")}</li>}
            </ul>
          </div>
          <details><summary className="cursor-pointer text-sm font-medium">{t("Audit history", "অডিট ইতিহাস")}</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{state.data?.runs.map((item) => <li key={item.id} className="flex justify-between gap-3"><span>{new Date(item.started_at).toLocaleString()} · {item.trigger}</span><span>{item.status} · {item.score ?? "—"}/100 · {item.duration_ms ?? "—"}ms</span></li>)}</ul></details>
        </>
      ) : <p className="text-sm text-muted-foreground">{t("Run the first audit to establish the store's weight baseline.", "স্টোরের ওয়েট বেসলাইন তৈরি করতে প্রথম অডিট চালান।")}</p>}
    </section>
  );
}

function Metric({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return <div className="rounded-fq-md border border-border p-3"><span className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</span><strong className="mt-2 block text-xl tabular-nums">{value}</strong>{hint && <span className="text-xs text-muted-foreground">{hint}</span>}</div>;
}