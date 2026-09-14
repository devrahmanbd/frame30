import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  StatusPill,
  Money,
  Field,
  ErrorFrame,
  CopyLink,
  inputClass,
  btnPrimary,
  btnGhost,
} from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { giftCardsLoadFn, giftCardIssueFn, giftCardVoidFn } from "@/lib/commerce.functions";

export const Route = createFileRoute("/_authenticated/admin/gift-cards")({
  head: () => ({
    meta: [
      { title: "Gift cards — Framique admin" },
      {
        name: "description",
        content:
          "Issue gift cards in taka, watch every balance movement on an append-only ledger and void a card the moment it leaks.",
      },
      { property: "og:title", content: "Gift cards — Framique admin" },
      {
        property: "og:description",
        content: "Ledger-backed gift cards with idempotent redemption and instant void.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GiftCardsPage,
});

const KEY = ["commerce", "gift-cards"] as const;

const TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  active: "success",
  redeemed: "info",
  expired: "warning",
  void: "danger",
};

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function GiftCardsPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(giftCardsLoadFn);
  const issue = useServerFn(giftCardIssueFn);
  const voidCard = useServerFn(giftCardVoidFn);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError, error: loadError } = useQuery({
    queryKey: KEY,
    queryFn: () => load(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: KEY });

  const issueMutation = useMutation({
    mutationFn: (v: { amountMinorInt: number; email?: string | null; expiresAt?: string | null }) =>
      issue({ data: v }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const voidMutation = useMutation({
    mutationFn: (giftCardId: string) => voidCard({ data: { giftCardId } }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError(message(e)),
  });

  const cards = data?.cards ?? [];
  const outstanding = cards
    .filter((c) => c.status === "active")
    .reduce((s, c) => s + Number(c.balance_minor_int), 0);

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Gift cards", "গিফট কার্ড")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Balances move only through the ledger. Redemption is idempotent, so a retry never deducts twice.",
            "ব্যালেন্স শুধু লেজারের মাধ্যমেই বদলায়। রিডেম্পশন idempotent, তাই দুইবার কাটা হয় না।",
          )}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Cards", "কার্ড")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">{cards.length}</dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">{t("Active", "সক্রিয়")}</dt>
          <dd className="tabular-nums text-2xl font-semibold">
            {cards.filter((c) => c.status === "active").length}
          </dd>
        </div>
        <div className="rounded-fq-lg border border-border bg-card p-4">
          <dt className="text-xs uppercase text-muted-foreground">
            {t("Outstanding liability", "বকেয়া দায়")}
          </dt>
          <dd className="text-2xl font-semibold">
            <Money minor={outstanding} />
          </dd>
        </div>
      </dl>

      <ErrorFrame message={error ?? (isError ? message(loadError) : null)} />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-x-auto rounded-fq-lg border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Issued gift cards</caption>
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="p-3">{t("Code", "কোড")}</th>
                <th scope="col" className="p-3">{t("Balance", "ব্যালেন্স")}</th>
                <th scope="col" className="p-3">{t("Status", "অবস্থা")}</th>
                <th scope="col" className="p-3">{t("Expires", "মেয়াদ")}</th>
                <th scope="col" className="p-3">
                  <span className="sr-only">{t("Actions", "অ্যাকশন")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cards.map((c) => (
                <tr key={c.id}>
                  <td className="p-3">
                    <span className="tabular-nums font-medium">{c.code}</span>
                    <CopyLink value={c.code} />
                  </td>
                  <td className="p-3">
                    <Money minor={Number(c.balance_minor_int)} />
                  </td>
                  <td className="p-3">
                    <StatusPill label={c.status} tone={TONE[c.status] ?? "neutral"} />
                  </td>
                  <td className="p-3 tabular-nums text-muted-foreground">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={c.status !== "active" || voidMutation.isPending}
                      onClick={() => voidMutation.mutate(c.id)}
                    >
                      {t("Void", "বাতিল")}
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && cards.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-sm text-muted-foreground">
                    {t("No gift cards issued yet.", "এখনো কোনো গিফট কার্ড ইস্যু হয়নি।")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          className="space-y-3 rounded-fq-lg border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const taka = Number(form.get("amount") ?? 0);
            issueMutation.mutate({
              amountMinorInt: Math.round(taka * 100),
              email: String(form.get("email") ?? "") || null,
              expiresAt: String(form.get("expires") ?? "") || null,
            });
            e.currentTarget.reset();
          }}
        >
          <h2 className="text-sm font-semibold">{t("Issue a card", "কার্ড ইস্যু করুন")}</h2>
          <Field label={t("Amount (BDT)", "পরিমাণ (টাকা)")}>
            <input
              name="amount"
              type="number"
              min={1}
              step="0.01"
              required
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label={t("Recipient email", "প্রাপকের ইমেইল")}>
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label={t("Expires on", "মেয়াদ শেষ")}>
            <input name="expires" type="date" className={inputClass} />
          </Field>
          <button type="submit" className={btnPrimary} disabled={issueMutation.isPending}>
            {t("Issue card", "কার্ড ইস্যু")}
          </button>
        </form>
      </div>
    </section>
  );
}
