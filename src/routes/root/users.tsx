import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { ownerPeopleFn, ownerSetOwnerRightFn } from "@/lib/owner-desk.functions";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";
import { RootConfirmDialog } from "@/components/root/RootConfirmDialog";

export const Route = createFileRoute("/root/users")({
  head: () => ({
    meta: [
      { title: "People and access — Framique owner console" },
      {
        name: "description",
        content:
          "Every Framique account: sign-in activity, the stores each person belongs to, and who holds platform owner rights.",
      },
      { property: "og:title", content: "People and access — Framique owner console" },
      {
        property: "og:description",
        content: "Account roster, store memberships and platform owner rights for Framique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PeopleDesk,
});

function PeopleDesk() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerPeopleFn);
  const setRight = useServerFn(ownerSetOwnerRightFn);

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ userId: string; grant: boolean; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["owner-people", page],
    queryFn: () => load({ data: { page } }),
  });

  const mutate = useMutation({
    mutationFn: (input: { userId: string; grant: boolean }) => setRight({ data: input }),
    onSuccess: () => {
      setPending(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["owner-people"] });
    },
    onError: (e) => {
      setPending(null);
      setError(e instanceof Error ? e.message : "unknown");
    },
  });

  const needle = query.trim().toLowerCase();
  const people = (data?.people ?? []).filter(
    (p) =>
      !needle ||
      (p.email ?? "").toLowerCase().includes(needle) ||
      p.memberships.some((m) => m.merchantName.toLowerCase().includes(needle)),
  );

  return (
    <section className="space-y-6">
      <OwnerHeader title={tk("owner.people.title")} subtitle={tk("owner.people.subtitle")} />

      {error ? (
        <p role="alert" className="rounded-fq-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <StatGrid>
        <StatCard label={tk("owner.people.accounts")} value={String(data?.totals.users ?? 0)} />
        <StatCard label={tk("owner.people.owners")} value={String(data?.totals.owners ?? 0)} />
        <StatCard label={tk("owner.people.unconfirmed")} value={String(data?.totals.unconfirmed ?? 0)} />
        <StatCard label={tk("owner.people.stores")} value={String(data?.totals.merchants ?? 0)} />
      </StatGrid>

      <label className="block text-sm">
        <span className="block pb-1 font-medium">{tk("owner.people.search")}</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-sm rounded-fq-md border border-border bg-background px-3 py-2 text-sm"
        />
      </label>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}

      {people.length > 0 ? (
        <OwnerTable
          head={[
            tk("owner.people.account"),
            tk("owner.people.stores"),
            tk("owner.people.last_sign_in"),
            tk("owner.people.rights"),
            "",
          ]}
        >
          {people.map((p) => (
            <tr key={p.userId} className="border-t border-border align-top">
              <td className="px-3 py-2">
                <span className="block font-medium">{p.email ?? "—"}</span>
                <code className="font-mono text-xs text-muted-foreground">{p.userId}</code>
                {p.confirmed ? null : (
                  <span className="block pt-1">
                    <StatePill tone="warn">{tk("owner.people.unconfirmed")}</StatePill>
                  </span>
                )}
              </td>
              <td className="px-3 py-2">
                {p.memberships.length === 0 ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <ul className="space-y-1">
                    {p.memberships.map((m) => (
                      <li key={`${p.userId}:${m.merchantId}`}>
                        {m.merchantName}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({m.role} · {m.status})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-3 py-2 tabular-nums">
                {p.lastSignInAt ? new Date(p.lastSignInAt).toLocaleString() : tk("owner.people.never")}
              </td>
              <td className="px-3 py-2">
                {p.isOwner ? (
                  <StatePill tone="ok">{tk("owner.people.platform_owner")}</StatePill>
                ) : (
                  <StatePill tone="warn">{tk("owner.people.merchant_only")}</StatePill>
                )}
                {p.isYou ? (
                  <span className="block pt-1 text-xs text-muted-foreground">
                    {tk("owner.users.you")}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right">
                {p.isYou ? null : (
                  <button
                    type="button"
                    onClick={() =>
                      setPending({ userId: p.userId, grant: !p.isOwner, label: p.email ?? p.userId })
                    }
                    className="rounded-fq-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                  >
                    {p.isOwner ? tk("owner.people.revoke") : tk("owner.people.grant")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </OwnerTable>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-fq-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {tk("owner.people.prev")}
        </button>
        <span className="text-sm tabular-nums text-muted-foreground">{page}</span>
        <button
          type="button"
          disabled={!data?.hasMore}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-fq-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {tk("owner.people.next")}
        </button>
      </div>

      <RootConfirmDialog
        open={Boolean(pending)}
        title={pending?.grant ? tk("owner.people.grant") : tk("owner.people.revoke")}
        description={
          pending?.grant ? tk("owner.people.grant_hint") : tk("owner.people.revoke_hint")
        }
        confirmLabel={pending?.grant ? tk("owner.people.grant") : tk("owner.people.revoke")}
        tone={pending?.grant ? "primary" : "danger"}
        busy={mutate.isPending}
        onConfirm={() => pending && mutate.mutate({ userId: pending.userId, grant: pending.grant })}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}
