import { Fragment, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { ownerAuditFn } from "@/lib/owner.functions";
import { OwnerHeader, OwnerTable, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/audit")({
  head: () => ({
    meta: [
      { title: "Platform audit trail — Framique owner console" },
      {
        name: "description",
        content:
          "Append-only record of every cross-tenant read and write performed from the Framique owner console, with actor, scope, entity and before/after payloads.",
      },
      { property: "og:title", content: "Platform audit trail — Framique owner console" },
      {
        property: "og:description",
        content: "Every owner-console read and write, with actor, scope and payload diff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditDesk,
});

const field = "rounded-fq-md border border-border bg-background px-3 py-2 text-sm";
const btn =
  "rounded-fq-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50";

function AuditDesk() {
  const { t } = useLang();
  const load = useServerFn(ownerAuditFn);
  const [scope, setScope] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const pageSize = 25;

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["owner-audit", scope, action, page],
    queryFn: () =>
      load({
        data: {
          scope: scope || null,
          action: action.trim() || null,
          page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-5">
      <OwnerHeader
        title={t("Platform audit trail", "প্ল্যাটফর্ম অডিট ট্রেইল")}
        subtitle={t(
          "Append-only. Owner reads are recorded as well as writes, so a cross-tenant look is never invisible. Entries cannot be edited or deleted from this console.",
          "কেবল যুক্ত হয়, মুছে যায় না। লেখার পাশাপাশি ওনারের পড়াও রেকর্ড হয়, তাই ক্রস-টেন্যান্ট দেখা কখনো অদৃশ্য নয়।",
        )}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-medium">
          {t("Scope", "স্কোপ")}
          <select
            className={`${field} block`}
            value={scope}
            onChange={(e) => {
              setPage(1);
              setScope(e.target.value);
            }}
          >
            <option value="">{t("All scopes", "সব স্কোপ")}</option>
            <option value="owner_read">{t("Owner reads", "ওনার রিড")}</option>
            <option value="owner_write">{t("Owner writes", "ওনার রাইট")}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium">
          {t("Action contains", "অ্যাকশনে আছে")}
          <input
            className={`${field} block`}
            value={action}
            placeholder="suspend"
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
          />
        </label>
        <p className="pb-2 text-xs text-muted-foreground tabular-nums" aria-live="polite">
          {isFetching
            ? t("Refreshing…", "রিফ্রেশ হচ্ছে…")
            : t(`${total} entries`, `${total} এন্ট্রি`)}
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive">
          {t("The audit trail is owner-only and could not be read.", "অডিট ট্রেইল শুধু ওনারের জন্য, পড়া যায়নি।")}
        </p>
      ) : null}

      <OwnerTable
        head={[
          t("When", "কখন"),
          t("Actor", "অ্যাক্টর"),
          t("Action", "অ্যাকশন"),
          t("Entity", "এনটিটি"),
          t("Scope", "স্কোপ"),
          "",
        ]}
      >
        {isLoading ? (
          <tr>
            <td colSpan={6} className="px-3 py-4 text-sm text-muted-foreground">
              {t("Loading audit entries…", "অডিট এন্ট্রি লোড হচ্ছে…")}
            </td>
          </tr>
        ) : rows.length === 0 ? (
          <tr>
            <td colSpan={6} className="px-3 py-4 text-sm text-muted-foreground">
              {t("No entry matches this filter.", "এই ফিল্টারে কোনো এন্ট্রি নেই।")}
            </td>
          </tr>
        ) : (
          rows.map((r) => (
            <Fragment key={r.id}>
              <tr className="border-t border-border align-top">

                <td className="px-3 py-2 text-xs tabular-nums">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-xs">{r.actor ?? "system"}</td>
                <td className="px-3 py-2 text-xs font-medium">{r.action}</td>
                <td className="px-3 py-2 text-xs">
                  {r.entity}
                  {r.entity_id ? (
                    <span className="block text-muted-foreground">{r.entity_id}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <StatePill tone={r.scope === "owner_write" ? "warn" : "ok"}>
                    {r.scope ?? "—"}
                  </StatePill>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    className={btn}
                    aria-expanded={openRow === r.id}
                    onClick={() => setOpenRow(openRow === r.id ? null : r.id)}
                  >
                    {openRow === r.id ? t("Hide", "লুকান") : t("Payload", "পেলোড")}
                  </button>
                </td>
              </tr>
              {openRow === r.id ? (
                <tr className="border-t border-border bg-muted/40">
                  <td colSpan={6} className="px-3 py-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium">{t("Before", "আগে")}</p>
                        <pre className="mt-1 overflow-x-auto rounded-fq-md bg-background p-2 text-[11px]">
                          {JSON.stringify(r.before_data ?? {}, null, 2)}
                        </pre>
                      </div>
                      <div>
                        <p className="text-xs font-medium">{t("After", "পরে")}</p>
                        <pre className="mt-1 overflow-x-auto rounded-fq-md bg-background p-2 text-[11px]">
                          {JSON.stringify(r.after_data ?? {}, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))
        )}
      </OwnerTable>

      <div className="flex items-center gap-3">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          {t("Previous", "আগের")}
        </button>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t(`Page ${page} of ${pages}`, `পৃষ্ঠা ${page} / ${pages}`)}
        </span>
        <button
          type="button"
          className={btn}
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          {t("Next", "পরের")}
        </button>
      </div>
    </section>
  );
}
