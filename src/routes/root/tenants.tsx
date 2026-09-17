import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ExternalLink,
  ShieldAlert,
  KeyRound,
  Download,
  Building2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { RootConfirmDialog } from "@/components/root/RootConfirmDialog";
import { useLang } from "@/lib/i18n";
import {
  platformClearQuotaFn,
  platformSetQuotaFn,
  platformTenantsFn,
} from "@/lib/platform.functions";
import { StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/tenants")({
  // `?q=` lets the owner palette deep-link straight to one tenant.
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"].slice(0, 80) : "",
  }),
  head: () => ({
    meta: [
      { title: "Tenants & Quotas — Framique Root" },
      {
        name: "description",
        content:
          "Review every Framique hosted store: current plan, subscription status, usage meters, and audited resource limit overrides.",
      },
      {
        property: "og:title",
        content: "Tenants & Quotas — Framique Root",
      },
      {
        property: "og:description",
        content: "Per-tenant plan, usage meters and audited limit overrides.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TenantLimits,
});

const field =
  "w-24 rounded-fq-md border border-border bg-background px-2.5 py-1.5 text-xs tabular-nums font-mono focus:outline-none focus:ring-1 focus:ring-primary";
const PAGE_SIZE = 12;

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  kyc_status: string;
  plan: string | null;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  productsLimit: number | null;
  staffLimit: number | null;
  hasOverride: boolean;
  productsUsed: number;
  staffUsed: number;
};

type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
};

function capLabel(cap: number | null, unconfigured: string) {
  if (cap === null) return unconfigured;
  return cap < 0 ? "∞" : String(cap);
}

function TenantRow({
  tenant,
  onSaved,
}: {
  tenant: Tenant;
  onSaved: () => void;
}) {
  const { tk, t, tError } = useLang();
  const setQuota = useServerFn(platformSetQuotaFn);
  const clearQuota = useServerFn(platformClearQuotaFn);
  const [products, setProducts] = useState(tenant.productsLimit ?? 0);
  const [staff, setStaff] = useState(tenant.staffLimit ?? 0);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setProducts(tenant.productsLimit ?? 0);
    setStaff(tenant.staffLimit ?? 0);
  }, [tenant.productsLimit, tenant.staffLimit]);

  const save = useMutation({
    mutationFn: () =>
      setQuota({
        data: {
          merchantId: tenant.id,
          productsLimit: products,
          staffLimit: staff,
        },
      }),
    onSuccess: () => {
      toast.success(tk("platform.limits_saved"));
      onSaved();
    },
    onError: (e: Error) => toast.error(tError(e)),
  });

  const reset = useMutation({
    mutationFn: () => clearQuota({ data: { merchantId: tenant.id } }),
    onSuccess: () => {
      toast.success(tk("platform.limits_reset"));
      setConfirmReset(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(tError(e)),
  });

  const unconfigured = tk("billing.limits.unconfigured");
  const isSuspended = tenant.status === "suspended";
  const isTrial =
    tenant.subscriptionStatus === "trial" ||
    (tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date());

  const hasDirtyLimits =
    products !== (tenant.productsLimit ?? 0) ||
    staff !== (tenant.staffLimit ?? 0);

  return (
    <tr className="border-b border-border/60 align-middle hover:bg-muted/30 transition-colors">
      <td className="px-3.5 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground text-sm">
            {tenant.name}
          </span>
          <a
            href={`/store/${tenant.slug}`}
            target="_blank"
            rel="noreferrer"
            title={t("Visit live storefront", "লাইভ স্টোরফ্রন্ট দেখুন")}
            className="text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
          <span className="font-mono text-[11px] text-foreground/80">
            /{tenant.slug}
          </span>
          <span>·</span>
          <span className="uppercase font-semibold text-[10px] tracking-wider text-primary">
            {tenant.plan ?? unconfigured}
          </span>
          <span>·</span>
          <StatePill tone={isSuspended ? "bad" : isTrial ? "warn" : "ok"}>
            {isSuspended ? "Suspended" : isTrial ? "Trial" : tenant.status}
          </StatePill>
          {tenant.hasOverride && (
            <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 px-1.5 py-0.2 text-[10px] font-medium border border-amber-500/20">
              Custom Quota
            </span>
          )}
        </div>
      </td>

      <td className="px-3.5 py-3 text-xs tabular-nums text-muted-foreground">
        {tenant.trialEndsAt
          ? new Date(tenant.trialEndsAt).toLocaleDateString("en-BD", {
              dateStyle: "medium",
            })
          : "—"}
      </td>

      <td className="px-3.5 py-3 text-xs tabular-nums text-muted-foreground">
        <div className="space-y-1">
          <div>
            <span className="font-medium text-foreground">
              {tenant.productsUsed}
            </span>{" "}
            / {capLabel(tenant.productsLimit, unconfigured)} products
          </div>
          <div>
            <span className="font-medium text-foreground">
              {tenant.staffUsed}
            </span>{" "}
            / {capLabel(tenant.staffLimit, unconfigured)} staff
          </div>
        </div>
      </td>

      <td className="px-3.5 py-3">
        <input
          aria-label={`Product limit for ${tenant.name}`}
          className={field}
          type="number"
          min={-1}
          value={products}
          onChange={(e) => setProducts(Number(e.target.value) || 0)}
        />
      </td>

      <td className="px-3.5 py-3">
        <input
          aria-label={`Staff limit for ${tenant.name}`}
          className={field}
          type="number"
          min={-1}
          value={staff}
          onChange={(e) => setStaff(Number(e.target.value) || 0)}
        />
      </td>

      <td className="px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending || !hasDirtyLimits}
            className="rounded-fq-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 cursor-pointer"
          >
            {tk("common.save")}
          </button>

          {tenant.hasOverride && (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              disabled={reset.isPending}
              title={tk("common.reset")}
              className="rounded-fq-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}

          <Link
            to="/root/access"
            title={t(
              "Consented impersonation session",
              "অনুমোদিত ইম্পারসনেশন সেশন",
            )}
            className="rounded-fq-md border border-border p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <KeyRound className="size-3.5" />
          </Link>

          <Link
            to="/root/access"
            title={t(
              "Suspend or freeze tenant",
              "মার্চেন্ট স্থগিত বা ফ্রিজ করুন",
            )}
            className="rounded-fq-md border border-border p-1 text-muted-foreground hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive transition-colors"
          >
            <ShieldAlert className="size-3.5" />
          </Link>
        </div>

        <RootConfirmDialog
          open={confirmReset}
          title={tk("common.reset")}
          description={tk("platform.confirm_reset")}
          confirmLabel={tk("common.reset")}
          tone="danger"
          busy={reset.isPending}
          onConfirm={() => reset.mutate()}
          onCancel={() => setConfirmReset(false)}
        />
      </td>
    </tr>
  );
}

export function TenantLimits() {
  const { tk, t, tError } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(platformTenantsFn);
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "trial" | "suspended" | "overrides"
  >("all");
  const [page, setPage] = useState(0);

  useEffect(() => setQuery(q), [q]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => load(),
    retry: false,
    staleTime: 60_000,
  });

  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["platform-tenants"] });

  const all = useMemo(() => (data?.tenants ?? []) as Tenant[], [data?.tenants]);
  const audit = (data?.audit ?? []) as AuditRow[];

  const filtered = useMemo(() => {
    return all.filter((t) => {
      const matchesText = `${t.name} ${t.slug} ${t.plan ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase());
      if (!matchesText) return false;

      if (statusFilter === "active") return t.status === "active";
      if (statusFilter === "suspended") return t.status === "suspended";
      if (statusFilter === "trial") {
        return (
          t.subscriptionStatus === "trial" ||
          (t.trialEndsAt && new Date(t.trialEndsAt) > new Date())
        );
      }
      if (statusFilter === "overrides") return t.hasOverride;
      return true;
    });
  }, [all, query, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE,
  );

  function exportCsv() {
    const headers = [
      "ID",
      "Store Name",
      "Slug",
      "Plan",
      "Status",
      "Subscription Status",
      "Products Used",
      "Products Limit",
      "Staff Used",
      "Staff Limit",
      "Has Override",
    ];
    const lines = all.map((t) => [
      t.id,
      `"${t.name.replace(/"/g, '""')}"`,
      t.slug,
      t.plan ?? "launch",
      t.status,
      t.subscriptionStatus ?? "none",
      t.productsUsed,
      t.productsLimit ?? -1,
      t.staffUsed,
      t.staffLimit ?? -1,
      t.hasOverride ? "true" : "false",
    ]);

    const csvContent = [
      headers.join(","),
      ...lines.map((l) => l.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `framique-tenants-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (isLoading)
    return (
      <p className="text-sm text-muted-foreground">{tk("common.loading")}</p>
    );
  if (error) return <p className="text-sm text-destructive">{tError(error)}</p>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Building2 className="size-5 text-primary" />
          {t(
            "Tenants Directory & Sovereign Quota Management",
            "টেন্যান্ট ডিরেক্টরি ও কোটা প্রশাসন",
          )}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            "Manage resource quotas, verify active plans, review overrides, and audit cross-tenant limits.",
            "রিসোর্স কোটা নিয়ন্ত্রণ, প্ল্যান যাচাই, কাস্টম লিমিট এবং সম্পূর্ণ অডিট লগ।",
          )}
        </p>
      </div>

      <section className="space-y-4">
        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="w-72 rounded-fq-md border border-border bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={t(
                "Search store name, slug, or plan...",
                "স্টোরের নাম, স্ল্যাগ বা প্ল্যান খুঁজুন...",
              )}
            />

            {/* Status Filter Pills */}
            <div className="flex items-center rounded-fq-md border border-border bg-muted/30 p-0.5 text-xs">
              {(
                [
                  { key: "all", label: t("All", "সব") },
                  { key: "active", label: t("Active", "সক্রিয়") },
                  { key: "trial", label: t("Trialing", "ট্রায়াল") },
                  { key: "suspended", label: t("Suspended", "স্থগিত") },
                  { key: "overrides", label: t("Overrides", "কাস্টম কোটা") },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.key);
                    setPage(0);
                  }}
                  className={`rounded-fq-sm px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === tab.key
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-fq-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>{t("Export Roster (CSV)", "রোস্টার এক্সপোর্ট")}</span>
          </button>
        </div>

        {/* Tenants Table */}
        <div className="overflow-x-auto rounded-fq-lg border border-border bg-card shadow-xs">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
              <tr>
                <th className="px-3.5 py-2.5">Store & Identity</th>
                <th className="px-3.5 py-2.5">Trial End</th>
                <th className="px-3.5 py-2.5">Meters (Products · Staff)</th>
                <th className="px-3.5 py-2.5">Product Cap</th>
                <th className="px-3.5 py-2.5">Staff Cap</th>
                <th className="px-3.5 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {rows.map((t) => (
                <TenantRow key={t.id} tenant={t} onSaved={refresh} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                    colSpan={6}
                  >
                    {tk("common.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {filtered.length === 0 ? 0 : current * PAGE_SIZE + 1} to{" "}
            {Math.min((current + 1) * PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} stores
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-fq-md border border-border px-2.5 py-1 font-medium disabled:opacity-40 cursor-pointer"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              {tk("common.previous")}
            </button>
            <span className="tabular-nums font-mono">
              {current + 1} / {pages}
            </span>
            <button
              type="button"
              className="rounded-fq-md border border-border px-2.5 py-1 font-medium disabled:opacity-40 cursor-pointer"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
            >
              {tk("common.next")}
            </button>
          </div>
        </div>
      </section>

      {/* Privileged Quota Audit Trail */}
      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {tk("platform.audit_trail")}
        </h2>
        <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/20">
              <tr>
                <th className="px-3.5 py-2">When</th>
                <th className="px-3.5 py-2">Action</th>
                <th className="px-3.5 py-2">Target Store</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {audit.map((a) => (
                <tr key={a.id} className="hover:bg-muted/20">
                  <td className="px-3.5 py-2 text-xs tabular-nums text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("en-BD", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-3.5 py-2 font-mono text-xs font-medium text-primary">
                    {a.action}
                  </td>
                  <td className="px-3.5 py-2 text-xs text-muted-foreground font-mono">
                    {a.entity}{" "}
                    {a.entity_id ? `(${a.entity_id.slice(0, 8)}…)` : ""}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td
                    className="px-4 py-6 text-center text-xs text-muted-foreground"
                    colSpan={3}
                  >
                    {tk("common.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
