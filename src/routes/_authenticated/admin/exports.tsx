import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { StatusPill, Field, inputClass, btnPrimary } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { EXPORT_REASON_THRESHOLD } from "@/lib/export-controls";
import {
  exportListFn,
  exportCreateFn,
  exportRetryFn,
  exportDownloadFn,
} from "@/lib/exports.functions";

export const Route = createFileRoute("/_authenticated/admin/exports")({
  loader: () => exportListFn(),
  head: () => ({
    meta: [
      { title: "Export center — Framique admin" },
      { name: "description", content: "Self-serve CSV exports for orders, products, customers and analytics." },
      { property: "og:title", content: "Export center — Framique admin" },
      { property: "og:description", content: "Queue, download and retry merchant data exports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ExportCenter,
});

const TYPES = [
  { value: "orders", bn: "অর্ডার", en: "Orders" },
  { value: "products", bn: "পণ্য", en: "Products" },
  { value: "customers", bn: "কাস্টমার", en: "Customers" },
  { value: "product_events", bn: "পণ্য ইভেন্ট", en: "Product events" },
  { value: "analytics_raw", bn: "অ্যানালিটিক্স র (৯০ দিন)", en: "Analytics raw" },
] as const;

const STATUS: Record<
  string,
  { en: string; bn: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }
> = {
  queued: { en: "Queued", bn: "সারিতে", tone: "neutral" },
  generating: { en: "Generating", bn: "তৈরি হচ্ছে", tone: "info" },
  signing: { en: "Signing", bn: "সাইন হচ্ছে", tone: "info" },
  ready_for_download: { en: "Ready for download", bn: "ডাউনলোডের জন্য প্রস্তুত", tone: "success" },
  downloaded: { en: "Downloaded", bn: "ডাউনলোড হয়েছে", tone: "success" },
  expired: { en: "Expired", bn: "মেয়াদোত্তীর্ণ", tone: "warning" },
  fail_retry: { en: "Failed", bn: "ব্যর্থ", tone: "danger" },
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function ExportCenter() {
  const { t, tk } = useLang();
  const jobs = Route.useLoaderData();
  const router = useRouter();
  const create = useServerFn(exportCreateFn);
  const retry = useServerFn(exportRetryFn);
  const download = useServerFn(exportDownloadFn);

  const [objectType, setObjectType] = useState<(typeof TYPES)[number]["value"]>("orders");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await create({
        data: {
          objectType,
          rangeStart: rangeStart ? new Date(rangeStart).toISOString() : null,
          rangeEnd: rangeEnd ? new Date(`${rangeEnd}T23:59:59`).toISOString() : null,
          status: objectType === "orders" && status ? status : null,
          reason: reason.trim() ? reason.trim() : null,
        },
      });
      await router.invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not create export");
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(jobId: string) {
    setMessage(null);
    try {
      const { url } = await download({ data: { jobId } });
      window.open(url, "_blank", "noopener");
      await router.invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Link expired, create a new export");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Export center", "এক্সপোর্ট সেন্টার")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Get your own data as a CSV file. Links expire after 24 hours.", "আপনার নিজস্ব ডেটা CSV ফাইলে নিন। লিংক ২৪ ঘণ্টা পর মেয়াদোত্তীর্ণ হয়।")}
        </p>
      </header>

      {message && (
        <p role="alert" className="rounded-fq-md border border-danger bg-danger-soft px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <form onSubmit={submit} className="grid gap-3 rounded-fq-md border border-border bg-card p-4 sm:grid-cols-4">
        <Field label={t("Type", "ধরন")}>
          <select
            className={inputClass}
            value={objectType}
            onChange={(e) => setObjectType(e.target.value as typeof objectType)}
          >
            {TYPES.map((ty) => (
              <option key={ty.value} value={ty.value}>
                {tk(`export.type.${ty.value}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Start date", "শুরুর তারিখ")}>
          <input type="date" className={inputClass} value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
        </Field>
        <Field label={t("End date", "শেষ তারিখ")}>
          <input type="date" className={inputClass} value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
        </Field>
        <Field label={t("Order status (optional)", "অর্ডার স্ট্যাটাস (ঐচ্ছিক)")}>
          <input
            className={inputClass}
            value={status}
            placeholder="paid"
            disabled={objectType !== "orders"}
            onChange={(e) => setStatus(e.target.value)}
          />
        </Field>
        <div className="sm:col-span-4">
          <Field
            label={t(
              `Reason (required above ${EXPORT_REASON_THRESHOLD.toLocaleString("en-US")} rows)`,
              `কারণ (${EXPORT_REASON_THRESHOLD.toLocaleString("bn-BD")} রো-এর বেশি হলে বাধ্যতামূলক)`,
            )}
          >
            <input
              className={inputClass}
              value={reason}
              maxLength={300}
              placeholder={t("e.g. monthly accounting handover", "যেমন মাসিক অ্যাকাউন্টিং হ্যান্ডওভার")}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        </div>
        <div className="sm:col-span-4">
          <button type="submit" className={btnPrimary} disabled={busy}>
            {busy ? t("Creating…", "তৈরি হচ্ছে…") : t("New export", "নতুন এক্সপোর্ট")}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Export jobs</caption>
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3">{t("Type", "ধরন")}</th>
              <th className="p-3">{t("Status", "অবস্থা")}</th>
              <th className="p-3 text-right">{t("Rows", "রো")}</th>
              <th className="p-3 text-right">{t("Size", "সাইজ")}</th>
              <th className="p-3">{t("Created", "তৈরি")}</th>
              <th className="p-3">{t("Expires", "মেয়াদ")}</th>
              <th className="p-3">{t("Action", "অ্যাকশন")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {jobs.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-muted-foreground">
                  {t("No exports yet.", "এখনো কোনো এক্সপোর্ট নেই।")}
                </td>
              </tr>
            )}
            {jobs.map((j) => {
              const s = STATUS[j.status] ?? { en: j.status, bn: j.status, tone: "neutral" as const };
              const ready = j.status === "ready_for_download" || j.status === "downloaded";
              return (
                <tr key={j.id}>
                  <td className="p-3">{tk(`export.type.${j.object_type}`)}</td>
                  <td className="p-3">
                    <StatusPill label={t(s.en, s.bn)} tone={s.tone} />
                    {j.error && <span className="block text-xs text-danger">{j.error}</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">{j.total_rows}</td>
                  <td className="p-3 text-right tabular-nums">{fmtSize(Number(j.size_bytes))}</td>
                  <td className="p-3 tabular-nums text-xs text-muted-foreground">
                    {new Date(j.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="p-3 tabular-nums text-xs text-muted-foreground">
                    {j.expires_at ? new Date(j.expires_at).toLocaleString("en-GB") : "—"}
                  </td>
                  <td className="p-3">
                    {ready ? (
                      <button type="button" className={btnPrimary} onClick={() => onDownload(j.id)}>
                        {t("Download", "ডাউনলোড")}
                      </button>
                    ) : j.status === "fail_retry" || j.status === "expired" ? (
                      <button
                        type="button"
                        className={btnPrimary}
                        onClick={async () => {
                          await retry({ data: { jobId: j.id } });
                          await router.invalidate();
                        }}
                      >
                        {t("Retry", "আবার চেষ্টা")}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("Pending", "অপেক্ষমাণ")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
