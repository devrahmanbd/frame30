import { createFileRoute } from "@tanstack/react-router";
import { useCustomerAccount, useCustomerOrders } from "@/hooks/use-customer";
import { useLang } from "@/lib/i18n";
import {
  ConsoleTable,
  EmptyState,
  InlineError,
  MoneyCell,
  PageHeader,
  StatusPill,
} from "@/components/console/primitives";

export const Route = createFileRoute("/_authenticated/dashboard/orders")({
  head: () => ({
    meta: [
      { title: "My orders — Framique" },
      { name: "description", content: "Every order you have placed, with status and totals." },
      { property: "og:title", content: "My orders — Framique" },
      { property: "og:description", content: "Every order you have placed, with status and totals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CustomerOrders,
});

function CustomerOrders() {
  const { t } = useLang();
  const { data: account } = useCustomerAccount();
  const orders = useCustomerOrders(0, Boolean(account?.id));
  const rows = orders.data?.rows ?? [];

  if (orders.isError) {
    return (
      <>
        <PageHeader title={t("My orders", "আমার অর্ডার")} />
        <InlineError
          message={t("Could not load your orders.", "অর্ডার লোড করা যায়নি।")}
          onRetry={() => void orders.refetch()}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("My orders", "আমার অর্ডার")}
        description={t("Status, totals and dates for every order.", "প্রতিটি অর্ডারের অবস্থা, মোট ও তারিখ।")}
      />
      <ConsoleTable
        rows={rows}
        loading={orders.isPending}
        rowKey={(o) => o.id}
        empty={
          <EmptyState
            title={t("No orders yet", "এখনো কোনো অর্ডার নেই")}
            description={t("Orders you place will be listed here.", "আপনার অর্ডার এখানে দেখা যাবে।")}
          />
        }
        columns={[
          {
            key: "number",
            header: t("Order", "অর্ডার"),
            cell: (o) => <span className="font-medium">#{o.orderNumber}</span>,
          },
          {
            key: "status",
            header: t("Status", "অবস্থা"),
            cell: (o) => (
              <StatusPill tone={o.status === "cancelled" ? "danger" : "info"}>{o.status}</StatusPill>
            ),
          },
          {
            key: "total",
            header: t("Total", "মোট"),
            cell: (o) => <MoneyCell minor={o.totalMinor} currency={o.currency} />,
          },
          {
            key: "date",
            header: t("Placed", "তারিখ"),
            cell: (o) => new Date(o.placedAt).toLocaleDateString(),
          },
        ]}
      />
    </>
  );
}
