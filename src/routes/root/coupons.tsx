import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { fmtMinor } from "@/lib/money";
import { ownerCouponsFn } from "@/lib/owner.functions";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";

export const Route = createFileRoute("/root/coupons")({
  head: () => ({
    meta: [
      { title: "Coupon oversight — Framique owner console" },
      {
        name: "description",
        content:
          "Platform-wide coupon oversight for Framique: highest-volume codes, their usage caps and the redemption ledger behind each counter.",
      },
      { property: "og:title", content: "Coupon oversight — Framique owner console" },
      {
        property: "og:description",
        content: "Coupon usage caps checked against the redemption ledger.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CouponDesk,
});

function CouponDesk() {
  const { tk } = useLang();
  const load = useServerFn(ownerCouponsFn);
  const { data, isLoading } = useQuery({ queryKey: ["owner-coupons"], queryFn: () => load() });
  const rows = data?.rows ?? [];

  return (
    <section className="space-y-4">
      <OwnerHeader title={tk("owner.coupons.title")} subtitle={tk("owner.coupons.subtitle")} />

      <StatGrid>
        <StatCard label={tk("owner.coupons.ledger")} value={String(rows.length)} />
        <StatCard label={tk("owner.coupons.over_cap")} value={String(data?.overCap ?? 0)} />
      </StatGrid>

      {isLoading ? <p className="text-sm text-muted-foreground">{tk("common.loading")}</p> : null}
      {!isLoading && rows.length === 0 ? (
        <p className="rounded-fq-md border border-dashed border-border p-6 text-sm text-muted-foreground">
          {tk("common.empty")}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <OwnerTable
          head={[
            "Code",
            tk("platform.tenants"),
            tk("owner.coupons.counter"),
            tk("owner.coupons.ledger"),
            tk("owner.coupons.cap"),
          ]}
        >
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-border">
              <td className="px-3 py-2">
                <code className="font-mono text-xs">{c.code}</code>{" "}
                <span className="text-xs text-muted-foreground">
                  {c.type === "percent"
                    ? `${c.percent_off}%`
                    : fmtMinor(c.amount_minor_int, c.currency_code)}
                </span>
                {c.overCap ? (
                  <>
                    {" "}
                    <StatePill tone="bad">{tk("owner.coupons.over_cap")}</StatePill>
                  </>
                ) : null}
              </td>
              <td className="px-3 py-2">{c.merchantName ?? c.merchant_id}</td>
              <td className="px-3 py-2 tabular-nums">{c.redeemed_count}</td>
              <td className="px-3 py-2 tabular-nums">{c.ledgerRedemptions}</td>
              <td className="px-3 py-2 tabular-nums">{c.usage_limit ?? "—"}</td>
            </tr>
          ))}
        </OwnerTable>
      ) : null}
    </section>
  );
}
