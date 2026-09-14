import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StatusPill, inputClass, btnGhost } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { adminActivityFn } from "@/lib/merchant-admin.functions";


const RESOURCES = [
  "products",
  "product_variants",
  "categories",
  "collections",
  "coupons",
  "storefront_pages",
  "carriers",
  "store_themes",
  "merchant_settings",
  "staff_roles",
  "merchant_members",
  "brands",
] as const;

const ACTION_TONE = {
  created: "success",
  updated: "info",
  deleted: "danger",
} as const;

export function ActivityLog() {
  const { t } = useLang();
  const fetchActivity = useServerFn(adminActivityFn);
  const [resourceType, setResourceType] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [stack, setStack] = useState<string[]>([]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin", "activity", resourceType, action, cursor],
    queryFn: () =>
      fetchActivity({
        data: {
          cursor,
          resourceType: resourceType || null,
          action: (action || null) as "created" | "updated" | "deleted" | null,
        },
      }),
    placeholderData: (prev) => prev,
  });

  function resetFilters(next: { resource?: string; action?: string }) {
    if (next.resource !== undefined) setResourceType(next.resource);
    if (next.action !== undefined) setAction(next.action);
    setCursor(null);
    setStack([]);
  }

  const rows = data?.rows ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-bangla-display text-2xl font-bold tracking-tight">
          {t("Activity log", "অ্যাক্টিভিটি লগ")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Every change is recorded once and can never be edited or deleted. Secrets and customer contact details are never stored here.",
            "প্রতিটি পরিবর্তন একবারই রেকর্ড হয় এবং কখনো বদলানো বা মোছা যায় না। সিক্রেট বা গ্রাহকের যোগাযোগ তথ্য এখানে রাখা হয় না।",
          )}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">
            {t("Resource", "রিসোর্স")}
          </span>
          <select
            className={inputClass}
            value={resourceType}
            onChange={(e) => resetFilters({ resource: e.target.value })}
          >
            <option value="">{t("All resources", "সব")}</option>
            {RESOURCES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">{t("Action", "অ্যাকশন")}</span>
          <select
            className={inputClass}
            value={action}
            onChange={(e) => resetFilters({ action: e.target.value })}
          >
            <option value="">{t("All actions", "সব")}</option>
            {(["created", "updated", "deleted"] as const).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isError && (
        <p role="alert" className="rounded-fq-md bg-danger-soft p-3 text-sm text-danger-foreground">
          {(error as Error).message}
        </p>
      )}

      <section className="overflow-hidden rounded-fq-md border border-border bg-card">
        <ul className="divide-y divide-border">
          {isLoading && rows.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground">
              {t("Loading…", "লোড হচ্ছে…")}
            </li>
          )}
          {!isLoading && rows.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("No activity recorded yet.", "এখনো কোনো কার্যক্রম নেই।")}
            </li>
          )}
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill
                  tone={ACTION_TONE[row.action as keyof typeof ACTION_TONE] ?? "neutral"}
                  label={row.action}
                />
                <span className="text-sm font-medium">{row.resourceType.replace(/_/g, " ")}</span>
                <span className="text-sm text-muted-foreground">
                  {row.actor ?? t("System", "সিস্টেম")}
                </span>
                <time
                  dateTime={row.createdAt}
                  className="ml-auto text-xs tabular-nums text-muted-foreground"
                >
                  {new Date(row.createdAt).toLocaleString()}
                </time>
              </div>
              {row.fields.length > 0 && (
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  {row.fields.map((f) => (
                    <div key={f.field} className="flex flex-wrap gap-1 rounded-fq-md bg-muted px-2 py-1">
                      <dt className="font-medium">{f.field.replace(/_/g, " ")}</dt>
                      <dd className="text-muted-foreground">
                        {f.before} → <span className="text-foreground">{f.after}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          className={btnGhost}
          disabled={stack.length === 0}
          onClick={() => {
            const prev = [...stack];
            const back = prev.pop() ?? null;
            setStack(prev);
            setCursor(back);
          }}
        >
          {t("Previous", "আগের")}
        </button>
        <button
          type="button"
          className={btnGhost}
          disabled={!data?.nextCursor}
          onClick={() => {
            if (!data?.nextCursor) return;
            setStack((s) => [...s, cursor ?? ""].filter((v, i, a) => i < a.length));
            setCursor(data.nextCursor);
          }}
        >
          {t("Next", "পরের")}
        </button>
      </div>
    </div>
  );
}
