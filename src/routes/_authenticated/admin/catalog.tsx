import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileUp, Trash2 } from "lucide-react";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import {
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATE,
  KIND_META,
  METAFIELD_OWNER_TYPES,
  METAFIELD_VALUE_TYPES,
  PRODUCT_KINDS,
  hashRows,
  parseCsv,
  type ImportJob,
  type ImportRow,
  type ProductKind,
} from "@/lib/catalog";
import {
  catalogApplyImportFn,
  catalogDeleteDefinitionFn,
  catalogDeskFn,
  catalogDiscardImportFn,
  catalogDryRunFn,
  catalogExportCsvFn,
  catalogSaveDefinitionFn,
} from "@/lib/catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/catalog")({
  head: () => ({
    meta: [
      { title: "Catalog core — Framique Admin" },
      {
        name: "description",
        content:
          "Audit product kinds, define metafields and import your catalog with a reviewed dry run before anything is written.",
      },
      { property: "og:title", content: "Catalog core desk" },
      {
        property: "og:description",
        content: "Kind coherence, metafield definitions and idempotent bulk import for your store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CatalogDeskPage,
});

const card = "rounded-fq-lg border border-border bg-card p-5";
const input =
  "min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function CatalogDeskPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const merchantId = merchant?.id;
  const qc = useQueryClient();

  const desk = useServerFn(catalogDeskFn);
  const dryRun = useServerFn(catalogDryRunFn);
  const applyJob = useServerFn(catalogApplyImportFn);
  const discardJob = useServerFn(catalogDiscardImportFn);
  const saveDefinition = useServerFn(catalogSaveDefinitionFn);
  const deleteDefinition = useServerFn(catalogDeleteDefinitionFn);
  const exportCsv = useServerFn(catalogExportCsvFn);

  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ fileName: string; rows: ImportRow[] } | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [verdictFilter, setVerdictFilter] = useState<"all" | "create" | "update" | "error">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["catalog-desk", merchantId],
    enabled: !!merchantId,
    queryFn: () => desk({ data: { merchantId: merchantId! } }),
  });

  const dryRunMutation = useMutation({
    mutationFn: async (payload: { fileName: string; rows: ImportRow[] }) => {
      const sourceHash = await hashRows(payload.fileName, payload.rows);
      return dryRun({
        data: { merchantId: merchantId!, fileName: payload.fileName, sourceHash, rows: payload.rows },
      });
    },
    onSuccess: (result) => {
      setJob(result as ImportJob);
      toast.success(t("Dry run ready — nothing written yet", "ড্রাই রান তৈরি — এখনো কিছু সেভ হয়নি"));
    },
    onError: (err) => toast.error(friendly(err)),
  });

  const applyMutation = useMutation({
    mutationFn: (jobId: string) => applyJob({ data: { merchantId: merchantId!, jobId } }),
    onSuccess: (res) => {
      const r = res as { replayed: boolean; summary: Record<string, number> };
      toast.success(
        r.replayed
          ? t("Already applied — replay ignored", "আগেই প্রয়োগ হয়েছে — পুনরাবৃত্তি বাতিল")
          : t(
              `Applied: ${r.summary.created ?? 0} created, ${r.summary.updated ?? 0} updated`,
              `প্রয়োগ: ${r.summary.created ?? 0}টি নতুন, ${r.summary.updated ?? 0}টি হালনাগাদ`,
            ),
      );
      setJob(null);
      setPending(null);
      void qc.invalidateQueries({ queryKey: ["catalog-desk", merchantId] });
    },
    onError: (err) => toast.error(friendly(err)),
  });

  const discardMutation = useMutation({
    mutationFn: (jobId: string) => discardJob({ data: { merchantId: merchantId!, jobId } }),
    onSuccess: () => {
      setJob(null);
      setPending(null);
      void qc.invalidateQueries({ queryKey: ["catalog-desk", merchantId] });
    },
  });

  /**
   * Export was implemented server-side but never reachable: the desk offered an
   * empty CSV template and no way to get the current catalogue out. Round-trip
   * (export, edit, re-import) is the workflow merchants actually use.
   */
  const exportMutation = useMutation({
    mutationFn: () => exportCsv({ data: { merchantId: merchantId! } }),
    onSuccess: (res) => {
      const { csv, rows } = res as { csv: string; rows: number };
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `framique-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t(`Exported ${rows} rows`, `${rows}টি সারি এক্সপোর্ট হয়েছে`));
    },
    onError: (err) => toast.error(friendly(err)),
  });

  async function onFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.errors.length) {
      toast.error(parsed.errors.join(", "));
      return;
    }
    if (parsed.rows.length > IMPORT_MAX_ROWS) {
      toast.error(t(`Max ${IMPORT_MAX_ROWS} rows per file`, `প্রতি ফাইলে সর্বোচ্চ ${IMPORT_MAX_ROWS} সারি`));
      return;
    }
    setPending({ fileName: file.name, rows: parsed.rows });
    setJob(null);
  }

  const diff = useMemo(() => {
    const rows = job?.diff ?? [];
    return verdictFilter === "all" ? rows : rows.filter((d) => d.verdict === verdictFilter);
  }, [job, verdictFilter]);

  const health = data;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-2xl font-semibold">
          {t("Catalog core", "ক্যাটালগ কোর")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Product kinds, metafield contracts and reviewed bulk import. Imports are validated in the database and applied at most once.",
            "পণ্যের ধরন, মেটাফিল্ড চুক্তি ও যাচাই করা বাল্ক ইমপোর্ট। ইমপোর্ট ডেটাবেসে যাচাই হয় এবং একবারই প্রয়োগ হয়।",
          )}
        </p>
      </header>

      <section aria-labelledby="kinds" className="space-y-3">
        <h2 id="kinds" className="font-bangla-display text-sm font-semibold">
          {t("Kind coverage", "ধরন অনুযায়ী কভারেজ")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_KINDS.map((kind) => (
            <div key={kind} className={card}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t(KIND_META[kind].en, KIND_META[kind].bn)}
              </p>
              <p className="money mt-1 text-2xl font-semibold tabular-nums">
                {isLoading ? "—" : (health?.counts[kind] ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t(KIND_META[kind].hint.en, KIND_META[kind].hint.bn)}
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Gap
            label={t("Digital without a file", "ফাইল ছাড়া ডিজিটাল")}
            value={health?.missingDigitalAsset ?? 0}
          />
          <Gap
            label={t("Service without booking rules", "বুকিং নিয়ম ছাড়া সার্ভিস")}
            value={health?.missingServiceConfig ?? 0}
          />
          <Gap
            label={t("Subscription without terms", "টার্ম ছাড়া সাবস্ক্রিপশন")}
            value={health?.missingSubscriptionTerms ?? 0}
          />
        </div>
      </section>

      <section aria-labelledby="import" className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="import" className="font-bangla-display text-sm font-semibold">
            {t("Bulk import", "বাল্ক ইমপোর্ট")}
          </h2>
          <a
            href={`data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE)}`}
            download="framique-catalog-template.csv"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-fq-md border border-border px-3 text-sm hover:bg-muted"
          >
            <Download className="size-4" aria-hidden /> {t("CSV template", "সিএসভি টেমপ্লেট")}
          </a>
          <button
            type="button"
            disabled={!merchantId || exportMutation.isPending}
            onClick={() => exportMutation.mutate()}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-fq-md border border-border px-3 text-sm hover:bg-muted disabled:opacity-60"
          >
            <Download className="size-4" aria-hidden />
            {exportMutation.isPending
              ? t("Exporting…", "এক্সপোর্ট হচ্ছে…")
              : t("Export catalog", "ক্যাটালগ এক্সপোর্ট")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            aria-label={t("Choose a CSV file", "সিএসভি ফাইল নির্বাচন করুন")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
            className={`${input} max-w-md`}
          />
          <button
            type="button"
            disabled={!pending || dryRunMutation.isPending}
            onClick={() => pending && dryRunMutation.mutate(pending)}
            className="inline-flex min-h-11 items-center gap-2 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            <FileUp className="size-4" aria-hidden />
            {dryRunMutation.isPending
              ? t("Checking…", "যাচাই হচ্ছে…")
              : t("Run dry run", "ড্রাই রান চালান")}
          </button>
          {pending ? (
            <span className="text-sm text-muted-foreground">
              {pending.fileName} · {pending.rows.length} {t("rows", "সারি")}
            </span>
          ) : null}
        </div>

        {job ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone="ok">{`${job.summary.creates ?? 0} ${t("create", "নতুন")}`}</Badge>
              <Badge tone="warn">{`${job.summary.updates ?? 0} ${t("update", "হালনাগাদ")}`}</Badge>
              <Badge tone="error">{`${job.summary.errors ?? 0} ${t("error", "ত্রুটি")}`}</Badge>
              <label className="ml-auto flex items-center gap-2">
                <span className="text-muted-foreground">{t("Filter", "ফিল্টার")}</span>
                <select
                  value={verdictFilter}
                  onChange={(e) => setVerdictFilter(e.target.value as typeof verdictFilter)}
                  className="min-h-9 rounded-fq-md border border-border bg-background px-2 text-sm"
                >
                  <option value="all">{t("All", "সব")}</option>
                  <option value="create">{t("Create", "নতুন")}</option>
                  <option value="update">{t("Update", "হালনাগাদ")}</option>
                  <option value="error">{t("Error", "ত্রুটি")}</option>
                </select>
              </label>
            </div>

            <div className="overflow-x-auto rounded-fq-md border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("Import dry run result", "ইমপোর্ট ড্রাই রান ফলাফল")}</caption>
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th scope="col" className="p-2">#</th>
                    <th scope="col" className="p-2">{t("Verdict", "সিদ্ধান্ত")}</th>
                    <th scope="col" className="p-2">{t("Slug", "স্লাগ")}</th>
                    <th scope="col" className="p-2">{t("Title", "শিরোনাম")}</th>
                    <th scope="col" className="p-2">{t("Note", "নোট")}</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.slice(0, 200).map((row) => (
                    <tr key={row.row} className="border-t border-border">
                      <td className="p-2 tabular-nums">{row.row}</td>
                      <td className="p-2">
                        <Badge
                          tone={
                            row.verdict === "error" ? "error" : row.verdict === "update" ? "warn" : "ok"
                          }
                        >
                          {row.verdict}
                        </Badge>
                      </td>
                      <td className="p-2 font-mono text-xs">{row.slug ?? "—"}</td>
                      <td className="p-2">{row.title ?? "—"}</td>
                      <td className="p-2 text-muted-foreground">{row.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* The table caps at 200 rows; saying so beats a silent truncation. */}
            {diff.length > 200 ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  `Showing the first 200 of ${diff.length} rows — all of them will be applied.`,
                  `${diff.length}টির মধ্যে প্রথম ২০০টি দেখানো হচ্ছে — সবগুলোই প্রয়োগ হবে।`,
                )}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={applyMutation.isPending || (job.summary.creates ?? 0) + (job.summary.updates ?? 0) === 0}
                onClick={() => applyMutation.mutate(job.id)}
                className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {applyMutation.isPending
                  ? t("Applying…", "প্রয়োগ হচ্ছে…")
                  : t("Apply import", "ইমপোর্ট প্রয়োগ করুন")}
              </button>
              <button
                type="button"
                onClick={() => discardMutation.mutate(job.id)}
                className="min-h-11 rounded-fq-md border border-border px-4 text-sm hover:bg-muted"
              >
                {t("Discard", "বাতিল")}
              </button>
            </div>
          </div>
        ) : null}

        {health?.jobs.length ? (
          <div className="space-y-2 border-t border-border pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("Recent import jobs", "সাম্প্রতিক ইমপোর্ট")}
            </h3>
            <ul className="space-y-1 text-sm">
              {health.jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-2">
                  <Badge tone={j.status === "applied" ? "ok" : j.status === "failed" ? "error" : "warn"}>
                    {j.status}
                  </Badge>
                  <span>{j.file_name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {j.row_count} {t("rows", "সারি")} · {new Date(j.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <MetafieldDefinitions
        merchantId={merchantId}
        definitions={health?.definitions ?? []}
        onSave={async (payload) => {
          await saveDefinition({ data: { merchantId: merchantId!, ...payload } });
          void qc.invalidateQueries({ queryKey: ["catalog-desk", merchantId] });
        }}
        onDelete={async (id) => {
          await deleteDefinition({ data: { merchantId: merchantId!, id } });
          void qc.invalidateQueries({ queryKey: ["catalog-desk", merchantId] });
        }}
      />
    </div>
  );
}

function Gap({ label, value }: { label: string; value: number }) {
  const bad = value > 0;
  return (
    <div className={`${card} flex items-center gap-3`}>
      {bad ? (
        <AlertTriangle className="size-5 text-[hsl(var(--bondhu-amber))]" aria-hidden />
      ) : (
        <CheckCircle2 className="size-5 text-[hsl(var(--mint))]" aria-hidden />
      )}
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="money text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn" | "error"; children: React.ReactNode }) {
  const map = {
    ok: "border-[hsl(var(--mint))] text-[hsl(var(--mint))]",
    warn: "border-[hsl(var(--bondhu-amber))] text-[hsl(var(--bondhu-amber))]",
    error: "border-[hsl(var(--rickshaw-red))] text-[hsl(var(--rickshaw-red))]",
  } as const;
  return (
    <span className={`inline-flex items-center rounded-fq-sm border px-2 py-0.5 text-xs ${map[tone]}`}>
      {children}
    </span>
  );
}

type DefinitionRow = {
  id: string;
  owner_type: string;
  namespace: string;
  key: string;
  label: string;
  value_type: string;
  is_required: boolean;
};

function MetafieldDefinitions({
  merchantId,
  definitions,
  onSave,
  onDelete,
}: {
  merchantId?: string;
  definitions: DefinitionRow[];
  onSave: (payload: {
    ownerType: string;
    namespace: string;
    key: string;
    label: string;
    valueType: string;
    isRequired: boolean;
    validation: Record<string, string | number | boolean | null>;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { t } = useLang();
  const [draft, setDraft] = useState({
    ownerType: "product",
    namespace: "custom",
    key: "",
    label: "",
    valueType: "text",
    isRequired: false,
    maxLength: "",
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!merchantId) return;
    setBusy(true);
    try {
      await onSave({
        ownerType: draft.ownerType,
        namespace: draft.namespace,
        key: draft.key,
        label: draft.label,
        valueType: draft.valueType,
        isRequired: draft.isRequired,
        validation: draft.maxLength ? { max_length: Number(draft.maxLength) } : {},
      });
      toast.success(t("Definition saved", "ডেফিনিশন সেভ হয়েছে"));
      setDraft((d) => ({ ...d, key: "", label: "", maxLength: "" }));
    } catch (err) {
      toast.error(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="metafields" className={`${card} space-y-4`}>
      <h2 id="metafields" className="font-bangla-display text-sm font-semibold">
        {t("Metafield definitions", "মেটাফিল্ড ডেফিনিশন")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t(
          "A defined metafield is validated in the database on every write — type, bounds and required-ness are enforced server-side.",
          "ডেফাইন করা মেটাফিল্ড প্রতিবার লেখার সময় ডেটাবেসে যাচাই হয় — টাইপ, সীমা ও আবশ্যকতা সার্ভারে বাধ্যতামূলক।",
        )}
      </p>

      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("Owner", "মালিক")}</span>
          <select
            value={draft.ownerType}
            onChange={(e) => setDraft({ ...draft, ownerType: e.target.value })}
            className={input}
          >
            {METAFIELD_OWNER_TYPES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("Namespace", "নেমস্পেস")}</span>
          <input
            value={draft.namespace}
            onChange={(e) => setDraft({ ...draft, namespace: e.target.value })}
            className={input}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("Key", "কী")}</span>
          <input
            value={draft.key}
            onChange={(e) => setDraft({ ...draft, key: e.target.value })}
            className={input}
            placeholder="fabric_type"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("Label", "লেবেল")}</span>
          <input
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            className={input}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">{t("Type", "টাইপ")}</span>
          <select
            value={draft.valueType}
            onChange={(e) => setDraft({ ...draft, valueType: e.target.value })}
            className={input}
          >
            {METAFIELD_VALUE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isRequired}
              onChange={(e) => setDraft({ ...draft, isRequired: e.target.checked })}
              className="size-4"
            />
            {t("Required", "আবশ্যক")}
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 flex-1 rounded-fq-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {t("Save", "সেভ")}
          </button>
        </div>
      </form>

      {definitions.length ? (
        <ul className="divide-y divide-border rounded-fq-md border border-border">
          {definitions.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <span className="font-mono text-xs">
                {d.owner_type}.{d.namespace}.{d.key}
              </span>
              <span>{d.label}</span>
              <span className="text-muted-foreground">{d.value_type}</span>
              {d.is_required ? <Badge tone="warn">{t("required", "আবশ্যক")}</Badge> : null}
              <button
                type="button"
                aria-label={`Delete ${d.key}`}
                onClick={() => void onDelete(d.id)}
                className="ml-auto grid min-h-11 w-11 place-items-center rounded-fq-md text-[hsl(var(--rickshaw-red))] hover:bg-muted"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("No definitions yet.", "এখনো কোনো ডেফিনিশন নেই।")}
        </p>
      )}
    </section>
  );
}

function friendly(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("rate_limit")) return "Too many import attempts — try again shortly.";
  if (raw.includes("catalog.forbidden")) return "Owner or admin role required.";
  if (raw.includes("catalog.too_many_rows")) return `Max ${IMPORT_MAX_ROWS} rows per file.`;
  if (raw.includes("metafield.")) return raw.replace("metafield.", "Metafield rejected: ");
  return raw;
}

export type { ProductKind };
