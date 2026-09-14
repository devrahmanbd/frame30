import { createFileRoute, Link } from "@tanstack/react-router";
import { useCustomerAccount, useCustomerHome } from "@/hooks/use-customer";
import { useLang } from "@/lib/i18n";
import {
  EmptyState,
  InlineError,
  MoneyCell,
  PageHeader,
  StatusPill,
  TableSkeleton,
} from "@/components/console/primitives";

export const Route = createFileRoute("/_authenticated/dashboard/")({
  head: () => ({
    meta: [
      { title: "Account overview — Framique" },
      { name: "description", content: "Recent orders and account shortcuts." },
      { property: "og:title", content: "Account overview — Framique" },
      { property: "og:description", content: "Recent orders and account shortcuts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DashboardHome,
});

function DashboardHome() {
  const { t } = useLang();
  const { data: account } = useCustomerAccount();
  const home = useCustomerHome(Boolean(account?.id));
  const recentOrders = home.data?.recent ?? [];

  return (
    <>
      <PageHeader
        title={t(`Hello, ${account?.name ?? "there"}`, `হ্যালো, ${account?.name ?? ""}`)}
        description={t("Your recent orders and account shortcuts.", "আপনার সাম্প্রতিক অর্ডার ও শর্টকাট।")}
      />

      {home.isPending ? <TableSkeleton rows={3} cols={3} /> : null}
      {home.isError ? (
        <InlineError
          message={t("Could not load your orders.", "অর্ডার লোড করা যায়নি।")}
          onRetry={() => void home.refetch()}
        />
      ) : null}

      {!home.isPending && !home.isError && recentOrders.length === 0 ? (
        <EmptyState
          title={t("No orders yet", "এখনো কোনো অর্ডার নেই")}
          description={t("When you place an order it will appear here.", "অর্ডার করলে এখানে দেখা যাবে।")}
        />
      ) : null}

      {recentOrders.length > 0 ? (
        <ul className="divide-y divide-border rounded-fq-lg border border-border">
          {recentOrders.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">#{o.orderNumber}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.placedAt).toLocaleDateString()}
                </p>
              </div>
              <StatusPill tone={o.status === "cancelled" ? "danger" : "info"}>{o.status}</StatusPill>
              <span className="ml-auto text-sm">
                <MoneyCell minor={o.totalMinor} currency={o.currency} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-5 flex gap-2">
        <Link
          to="/dashboard/orders"
          className="rounded-fq-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("All orders", "সব অর্ডার")}
        </Link>
        <Link
          to="/dashboard/track"
          search={{ code: undefined }}
          className="rounded-fq-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          {t("Track a shipment", "শিপমেন্ট ট্র্যাক")}
        </Link>
      </div>
    </>
  );
}
