import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, EyeOff, HeartPulse, Link2, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { ErrorFrame, StatusPill, btnGhost } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { FINDING_LABELS, FINDING_CODES, type FindingCode } from "@/lib/content-health";
import {
  contentHealthFindingsFn,
  contentHealthRunFn,
  contentHealthStateFn,
  contentHealthTriageFn,
} from "@/lib/content-health.functions";

const textError = (error: unknown) => (error instanceof Error ? error.message : String(error));

type StateFilter = "open" | "ignored" | "resolved";

/**
 * Content health desk (§6). Shows what the last scan found, lets the merchant
 * triage anything they have decided not to fix, and never blocks on the scan:
 * the run is a mutation, the lists are cached queries.
 */
export function HealthDesk() {
  const { t, lang } = useLang();
  const qc = useQueryClient();
  const readState = useServerFn(contentHealthStateFn);
  const readFindings = useServerFn(contentHealthFindingsFn);
  const runScan = useServerFn(contentHealthRunFn);
  const triage = useServerFn(contentHealthTriageFn);

  const [stateFilter, setStateFilter] = useState<StateFilter>("open");
  const [codeFilter, setCodeFilter] = useState<FindingCode | "all">("all");

  const state = useQuery({ queryKey: ["seo", "content-health"], queryFn: () => readState({ data: {} }) });
  const findings = useQuery({
    queryKey: ["seo", "content-health", "findings", stateFilter, codeFilter],
    queryFn: () => readFindings({ data: { state: stateFilter, code: codeFilter, limit: 50, offset: 0 } }),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["seo", "content-health"] });
  };

  const scan = useMutation({
    mutationFn: () => runScan({ data: { checkExternal: true } }),
    onSuccess: (result) => {
      toast.success(
        result.status === "ok"
          ? t(`Scan finished — score ${result.score}/100.`, `স্ক্যান শেষ — স্কোর ${result.score}/১০০।`)
          : t("Scan finished partially — some checks were skipped.", "স্ক্যান আংশিক শেষ হয়েছে — কিছু চেক বাদ পড়েছে।"),
      );
      invalidate();
    },
    onError: (error) => toast.error(textError(error)),
  });

  const setState = useMutation({
    mutationFn: (vars: { findingId: string; state: "open" | "ignored" }) => triage({ data: vars }),
    onSuccess: () => {
      toast.success(t("Finding updated.", "ফাইন্ডিং আপডেট হয়েছে।"));
      invalidate();
    },
    onError: (error) => toast.error(textError(error)),
  });

  const codeOptions = useMemo(
    () => FINDING_CODES.filter((code) => (state.data?.open.byCode?.[code] ?? 0) > 0 || codeFilter === code),
    [state.data, codeFilter],
  );

  if (state.isLoading) {
    return (
      <section className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
        {t("Loading content health…", "কনটেন্ট হেলথ লোড হচ্ছে…")}
      </section>
    );
  }
  if (state.error) return <ErrorFrame message={textError(state.error)} />;

  const latest = state.data?.latest ?? null;
  const open = state.data?.open;
  const running = latest?.status === "running";
  const tone = !latest
    ? "neutral"
    : latest.status === "ok"
      ? "success"
      : latest.status === "running"
        ? "info"
        : latest.status === "partial"
          ? "warning"
          : "danger";

  return (
    <section className="space-y-4 rounded-lg border border-border p-4" aria-labelledby="health-heading">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="health-heading" className="flex items-center gap-2 font-medium">
            <HeartPulse className="size-4" aria-hidden />
            {t("Content health & internal links", "কনটেন্ট হেলথ ও ইন্টারনাল লিংক")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "Broken links, redirect loops, orphan pages, keyword overlap, thin or stale content and schema gaps — measured on your real published content.",
              "ভাঙা লিংক, রিডাইরেক্ট লুপ, অরফান পেজ, কীওয়ার্ড ওভারল্যাপ, কম শব্দ বা পুরনো কনটেন্ট এবং স্কিমার ঘাটতি — আপনার আসল প্রকাশিত কনটেন্টে মাপা।",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={tone} label={latest?.status ?? t("Not run", "চালানো হয়নি")} />
          <button
            type="button"
            className={btnGhost}
            disabled={scan.isPending || running}
            onClick={() => scan.mutate()}
          >
            <RefreshCw className={`mr-2 size-4 ${scan.isPending ? "animate-spin" : ""}`} aria-hidden />
            {scan.isPending ? t("Scanning…", "স্ক্যান হচ্ছে…") : t("Run scan", "স্ক্যান চালান")}
          </button>
        </div>
      </header>

      {latest?.status === "failed" && (
        <p className="flex items-start gap-2 rounded-fq-md bg-destructive-soft p-3 text-sm text-destructive-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t(
            "The last scan could not finish. Nothing was changed on your store — run it again, and tell support if it keeps failing.",
            "শেষ স্ক্যান শেষ হতে পারেনি। আপনার স্টোরে কিছু বদলায়নি — আবার চালান, বারবার ব্যর্থ হলে সাপোর্টকে জানান।",
          )}
        </p>
      )}
      {latest?.truncated && (
        <p className="rounded-fq-md bg-warning-soft p-3 text-sm text-warning-foreground">
          {t(
            "This store has more content than one scan covers, so the report is a partial sample of your newest pages.",
            "এই স্টোরে এক স্ক্যানে ধরার চেয়ে বেশি কনটেন্ট আছে, তাই রিপোর্টটি সাম্প্রতিক পেজগুলোর আংশিক নমুনা।",
          )}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric label={t("Health score", "হেলথ স্কোর")} value={state.data?.score === null || state.data?.score === undefined ? "—" : `${state.data.score}/100`} />
        <Metric
          label={t("Must fix", "অবশ্যই ঠিক করুন")}
          value={String(open?.bySeverity?.["error"] ?? 0)}
          hint={t("errors", "ত্রুটি")}
        />
        <Metric
          label={t("Should fix", "ঠিক করা ভালো")}
          value={String(open?.bySeverity?.["warning"] ?? 0)}
          hint={t("warnings", "সতর্কতা")}
        />
        <Metric
          label={t("Links mapped", "লিংক ম্যাপ করা")}
          value={latest ? String(latest.links_checked ?? 0) : "—"}
          hint={latest ? `${latest.external_checked ?? 0} ${t("external checked", "বাইরের লিংক চেক")}` : undefined}
        />
      </div>

      {open && open.worstPages.length > 0 && (
        <div>
          <h4 className="text-sm font-medium">{t("Pages needing the most work", "সবচেয়ে বেশি কাজ দরকার যে পেজে")}</h4>
          <ul className="mt-2 space-y-1 text-sm">
            {open.worstPages.map((page) => (
              <li key={page.path} className="flex items-center justify-between gap-3">
                <span className="truncate">
                  {page.title || page.path}
                  <span className="ml-2 text-xs text-muted-foreground">{page.path}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">{page.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["open", "ignored", "resolved"] as StateFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`${btnGhost} ${stateFilter === value ? "border-primary text-primary" : ""}`}
            onClick={() => setStateFilter(value)}
          >
            {value === "open"
              ? t("Open", "খোলা")
              : value === "ignored"
                ? t("Ignored", "উপেক্ষিত")
                : t("Fixed", "ঠিক হয়েছে")}
          </button>
        ))}
        <select
          className="rounded-fq-md border border-border bg-background px-2 py-1 text-sm"
          value={codeFilter}
          onChange={(event) => setCodeFilter(event.target.value as FindingCode | "all")}
          aria-label={t("Filter by issue type", "সমস্যার ধরন অনুযায়ী ফিল্টার")}
        >
          <option value="all">{t("All issue types", "সব ধরনের সমস্যা")}</option>
          {codeOptions.map((code) => (
            <option key={code} value={code}>
              {lang === "bn" ? FINDING_LABELS[code].bn : FINDING_LABELS[code].en}
            </option>
          ))}
        </select>
      </div>

      <ul className="divide-y divide-border border-y border-border">
        {findings.isLoading && (
          <li className="py-3 text-sm text-muted-foreground">{t("Loading findings…", "ফাইন্ডিং লোড হচ্ছে…")}</li>
        )}
        {findings.error && (
          <li className="py-3 text-sm text-destructive-foreground">{textError(findings.error)}</li>
        )}
        {(findings.data?.rows ?? []).map((finding: any) => {
          const label = FINDING_LABELS[finding.code as FindingCode];
          return (
            <li key={finding.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[9rem_1fr_auto] sm:items-start">
              <StatusPill
                tone={finding.severity === "error" ? "danger" : finding.severity === "warning" ? "warning" : "info"}
                label={label ? (lang === "bn" ? label.bn : label.en) : finding.code}
              />
              <div className="min-w-0">
                <p>{lang === "bn" ? (finding.detail?.messageBn ?? finding.detail?.message_bn ?? finding.target) : finding.target}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <Link2 className="mr-1 inline size-3" aria-hidden />
                  {finding.entity_title || finding.entity_path}
                  {finding.entity_path ? ` · ${finding.entity_path}` : ""}
                  {finding.occurrences > 1
                    ? ` · ${t("seen", "দেখা গেছে")} ${finding.occurrences}×`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                className={btnGhost}
                disabled={setState.isPending || finding.state === "resolved"}
                onClick={() =>
                  setState.mutate({
                    findingId: finding.id,
                    state: finding.state === "ignored" ? "open" : "ignored",
                  })
                }
              >
                {finding.state === "ignored" ? (
                  <>
                    <RotateCcw className="mr-2 size-4" aria-hidden />
                    {t("Reopen", "আবার খুলুন")}
                  </>
                ) : (
                  <>
                    <EyeOff className="mr-2 size-4" aria-hidden />
                    {t("Ignore", "উপেক্ষা")}
                  </>
                )}
              </button>
            </li>
          );
        })}
        {!findings.isLoading && (findings.data?.rows ?? []).length === 0 && (
          <li className="py-3 text-sm text-muted-foreground">
            {stateFilter === "open"
              ? t("Nothing open — your content graph is clean.", "কিছু খোলা নেই — আপনার কনটেন্ট গ্রাফ পরিষ্কার।")
              : t("Nothing here yet.", "এখনও কিছু নেই।")}
          </li>
        )}
      </ul>

      <details>
        <summary className="cursor-pointer text-sm font-medium">{t("Scan history", "স্ক্যান ইতিহাস")}</summary>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {(state.data?.history ?? []).map((item: any) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span>
                {new Date(item.started_at).toLocaleString()} · {item.trigger}
              </span>
              <span>
                {item.status} · +{item.findings_opened ?? 0}/-{item.findings_resolved ?? 0} ·{" "}
                {item.duration_ms ?? "—"}ms
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-fq-md border border-border p-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="mt-2 block text-xl tabular-nums">{value}</strong>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
