import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  StatusPill,
  Money,
  ErrorFrame,
  btnPrimary,
  btnGhost,
} from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { cartsLoadFn, cartRecoveryFn } from "@/lib/commerce.functions";

export const Route = createFileRoute("/_authenticated/admin/carts")({
  head: () => ({
    meta: [
      { title: "Abandoned carts — Framique admin" },
      {
        name: "description",
        content:
          "See carts left behind, how much value is still open and send a consent-checked recovery message in one click.",
      },
      { property: "og:title", content: "Abandoned carts — Framique admin" },
      {
        property: "og:description",
        content: "Recover open carts without messaging shoppers who never opted in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CartsPage,
});

const KEY = ["commerce", "carts"] as const;

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function CartsPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(cartsLoadFn);
  const recover = useServerFn(cartRecoveryFn);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ queued: number; skipped: number } | null>(null);

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
  });

  const send = useMutation({
    mutationFn: (cartIds: string[]) => recover({ data: { cartIds } }),
    onSuccess: (r) => {
      setError(null);
      setResult(r);
      setSelected([]);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => setError(message(e)),
  });

  const carts = data?.carts ?? [];
  const stats = data?.stats;

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Abandoned carts", "পরিত্যক্ত কার্ট")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Recovery respects marketing consent — shoppers who opted out are skipped, not messaged.",
            "রিকভারি বার্তা শুধু সম্মতি থাকা ক্রেতাদের কাছেই যায়।",
          )}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Open carts", "খোলা কার্ট")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{stats?.active ?? 0}</dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Open value", "খোলা মূল্য")}</dt>
          <dd className="text-2xl font-semibold">
            <Money minor={stats?.openValue ?? 0} />
          </dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Recovered", "উদ্ধার হয়েছে")}</dt>
          <dd className="text-2xl font-semibold">
            <Money minor={stats?.recoveredValue ?? 0} />
          </dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">
            {t("Recovery rate", "রিকভারি হার")}
          </dt>
          <dd className="tabular-nums text-2xl font-semibold">{stats?.rate ?? 0}%</dd>
        </div>
      </dl>

      <ErrorFrame message={error ?? (isError ? message(loadError) : null)} />
      {result && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("Queued", "কিউতে")} {result.queued} · {t("skipped for consent", "সম্মতি না থাকায় বাদ")}{" "}
          {result.skipped}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btnPrimary}
          disabled={selected.length === 0 || send.isPending}
          onClick={() => send.mutate(selected)}
        >
          {t("Send recovery", "রিকভারি পাঠান")} ({selected.length})
        </button>
        <button
          type="button"
          className={btnGhost}
          onClick={() =>
            setSelected(carts.filter((c) => c.status === "active").map((c) => c.id))
          }
        >
          {t("Select all open", "সব খোলা কার্ট নির্বাচন")}
        </button>
      </div>

      <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Abandoned carts</caption>
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th scope="col" className="p-3">
                <span className="sr-only">{t("Select", "নির্বাচন")}</span>
              </th>
              <th scope="col" className="p-3">{t("Shopper", "ক্রেতা")}</th>
              <th scope="col" className="p-3">{t("Value", "মূল্য")}</th>
              <th scope="col" className="p-3">{t("Status", "অবস্থা")}</th>
              <th scope="col" className="p-3">{t("Last seen", "শেষ দেখা")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {carts.map((c) => (
              <tr key={c.id}>
                <td className="p-3">
                  <label className="sr-only" htmlFor={`cart-${c.id}`}>
                    {`Select cart ${c.customer_email ?? c.customer_phone ?? c.id}`}
                  </label>
                  <input
                    id={`cart-${c.id}`}
                    type="checkbox"
                    className="size-4"
                    disabled={c.status !== "active"}
                    checked={selected.includes(c.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                      )
                    }
                  />
                </td>
                <td className="p-3">
                  {c.customer_name ?? c.customer_email ?? c.customer_phone ?? t("Guest", "অতিথি")}
                </td>
                <td className="p-3">
                  <Money minor={Number(c.subtotal_minor_int)} />
                </td>
                <td className="p-3">
                  <StatusPill
                    label={c.status}
                    tone={
                      c.status === "recovered" ? "success" : c.status === "active" ? "warning" : "neutral"
                    }
                  />
                </td>
                <td className="p-3 tabular-nums text-muted-foreground">
                  {new Date(c.last_seen_at).toLocaleString()}
                </td>
              </tr>
            ))}
            {!isLoading && carts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-sm text-muted-foreground">
                  {t("No abandoned carts captured yet.", "এখনো কোনো পরিত্যক্ত কার্ট নেই।")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
