import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RootConfirmDialog } from "@/components/root/RootConfirmDialog";
import { useLang } from "@/lib/i18n";
import {
  platformClearQuotaFn,
  platformSetQuotaFn,
  platformTenantsFn,
} from "@/lib/platform.functions";

export const Route = createFileRoute("/root/tenants")({
  // `?q=` lets the owner palette deep-link straight to one tenant.
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"].slice(0, 80) : "",
  }),
  head: () => ({
    meta: [
      { title: "Tenant limits — Framique owner console" },
      {
        name: "description",
        content:
          "Review every Framique tenant: current plan, trial end, product and staff usage meters, and owner-only limit overrides with a full audit trail.",
      },
      { property: "og:title", content: "Tenant limits — Framique owner console" },
      {
        property: "og:description",
        content: "Per-tenant plan, usage meters and audited limit overrides.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TenantLimits,
});

const field = "w-full max-w-28 rounded-fq-md border border-border bg-background px-3 py-2 text-sm tabular-nums";
const PAGE_SIZE = 10;

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

function TenantRow({ tenant, onSaved }: { tenant: Tenant; onSaved: () => void }) {
  const { tk, tError } = useLang();
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
      setQuota({ data: { merchantId: tenant.id, productsLimit: products, staffLimit: staff } }),
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

  return (
    <tr className="border-b border-border/60 align-middle">
      <td className="px-3 py-2">
        <div className="font-medium">{tenant.name}</div>
        <div className="text-xs text-muted-foreground">
          {tenant.plan ?? unconfigured} · {tenant.subscriptionStatus ?? "—"}
          {tenant.hasOverride ? " · override" : ""}
        </div>
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
        {tenant.trialEndsAt ? new Date(tenant.trialEndsAt).toLocaleDateString("en-GB") : "—"}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
        {tenant.productsUsed} / {capLabel(tenant.productsLimit, unconfigured)} ·{" "}
        {tenant.staffUsed} / {capLabel(tenant.staffLimit, unconfigured)}
      </td>
      <td className="px-3 py-2">
        <input
          aria-label={`Product limit for ${tenant.name}`}
          className={field}
          inputMode="numeric"
          value={products}
          onChange={(e) => setProducts(Number(e.target.value) || 0)}
        />
      </td>
      <td className="px-3 py-2">
        <input
          aria-label={`Staff limit for ${tenant.name}`}
          className={field}
          inputMode="numeric"
          value={staff}
          onChange={(e) => setStaff(Number(e.target.value) || 0)}
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-fq-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
          >
            {tk("common.save")}
          </button>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={reset.isPending || !tenant.hasOverride}
            className="rounded-fq-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {tk("common.reset")}
          </button>
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

function TenantLimits() {
  const { tk, tError } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(platformTenantsFn);
  const { q } = Route.useSearch();
  const [query, setQuery] = useState(q);
  useEffect(() => setQuery(q), [q]);
  const [page, setPage] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-tenants"],
    queryFn: () => load(),
    retry: false,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["platform-tenants"] });

  if (isLoading) return <p className="text-sm text-muted-foreground">{tk("common.loading")}</p>;
  if (error) return <p className="text-sm text-destructive">{tError(error)}</p>;

  const all = (data?.tenants ?? []) as Tenant[];
  const audit = (data?.audit ?? []) as AuditRow[];
  const filtered = all.filter((t) =>
    `${t.name} ${t.slug} ${t.plan ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <label className="block max-w-sm text-xs text-muted-foreground">
          {tk("common.search")}
          <input
            className="mt-1 w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Store name, slug or plan"
          />
        </label>

        <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Store</th>
                <th className="px-3 py-2">Trial ends</th>
                <th className="px-3 py-2">Usage (products · staff)</th>
                <th className="px-3 py-2">Product limit</th>
                <th className="px-3 py-2">Staff limit</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <TenantRow key={t.id} tenant={t} onSaved={refresh} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-muted-foreground" colSpan={6}>
                    {tk("common.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            className="rounded-fq-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            {tk("common.previous")}
          </button>
          <span className="tabular-nums text-xs text-muted-foreground">
            {current + 1} / {pages}
          </span>
          <button
            type="button"
            className="rounded-fq-md border border-border px-3 py-1.5 text-xs disabled:opacity-50"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            {tk("common.next")}
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {tk("platform.audit_trail")}
        </h2>
        <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-border/60">
                  <td className="px-3 py-2 text-xs tabular-nums text-muted-foreground">
                    {new Date(a.created_at).toLocaleString("en-GB")}
                  </td>
                  <td className="px-3 py-2">{a.action}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {a.entity} {a.entity_id ?? ""}
                  </td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-muted-foreground" colSpan={3}>
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
