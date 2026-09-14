import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { bulkAdvanceOrders } from "@/lib/orders-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import { useListState, compareBy } from "@/lib/use-list-state";
import {
  Badge,
  BulkBar,
  type Column,
  DataTable,
  EmptyState,
  Money,
  Page,
  SavedViews,
  Toolbar,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/console/kit";

const statuses = [
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "refund_requested",
] as const;

export const statusLabel: Record<string, string> = {
  pending: "অপেক্ষমাণ / Pending",
  payment_pending: "পেমেন্ট বাকি / Payment pending",
  confirmed: "নিশ্চিত / Confirmed",
  paid: "পরিশোধিত / Paid",
  packed: "প্যাক করা / Packed",
  shipped: "পাঠানো / Shipped",
  delivered: "ডেলিভার / Delivered",
  fulfilled: "সম্পন্ন / Fulfilled",
  cancelled: "বাতিল / Cancelled",
  refund_requested: "রিফান্ড আবেদন / Refund requested",
  refunded: "রিফান্ড / Refunded",
};

export const statusTone: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  payment_pending: "bg-warning-soft text-warning-foreground",
  confirmed: "bg-info-soft text-info-foreground",
  paid: "bg-success-soft text-success-foreground",
  packed: "bg-info-soft text-info-foreground",
  shipped: "bg-info-soft text-info-foreground",
  delivered: "bg-success-soft text-success-foreground",
  fulfilled: "bg-success-soft text-success-foreground",
  cancelled: "bg-danger-soft text-danger-foreground",
  refund_requested: "bg-warning-soft text-warning-foreground",
  refunded: "bg-warning-soft text-warning-foreground",
};

const BADGE_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  pending: "neutral",
  payment_pending: "warning",
  confirmed: "info",
  paid: "success",
  packed: "info",
  shipped: "info",
  delivered: "success",
  fulfilled: "success",
  cancelled: "danger",
  refund_requested: "warning",
  refunded: "warning",
};

export const Route = createFileRoute("/_authenticated/admin/orders/")({
  head: () => ({
    meta: [
      { title: "Orders — Framique Admin" },
      { name: "description", content: "Review incoming orders, payment methods and fulfilment status." },
      { property: "og:title", content: "Order management" },
      { property: "og:description", content: "Track COD and mobile-payment orders in one queue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_method: string;
  total_minor_int: number | string;
  currency_code: string;
  customer_name: string | null;
  city: string | null;
  created_at: string;
  order_items?: { count: number }[] | null;
  carrier_shipments?: { awb: string | null; status: string | null }[] | null;
};

/** Saved views are the shape of the working day, not just status chips. */
const VIEWS = {
  all: { en: "All", bn: "সব", match: () => true },
  unfulfilled: {
    en: "Unfulfilled",
    bn: "অপূর্ণ",
    match: (o: OrderRow) => ["confirmed", "paid", "packed"].includes(o.status),
  },
  unpaid: {
    en: "Unpaid",
    bn: "অপরিশোধিত",
    match: (o: OrderRow) => ["pending", "payment_pending"].includes(o.status),
  },
  cod: {
    en: "COD to confirm",
    bn: "সিওডি নিশ্চিত",
    match: (o: OrderRow) =>
      o.payment_method === "cod" && ["pending", "payment_pending", "confirmed"].includes(o.status),
  },
  shipped: { en: "In transit", bn: "পথে", match: (o: OrderRow) => o.status === "shipped" },
  returns: {
    en: "Returns",
    bn: "রিটার্ন",
    match: (o: OrderRow) => ["refund_requested", "refunded"].includes(o.status),
  },
  today: {
    en: "Today",
    bn: "আজ",
    match: (o: OrderRow) => new Date(o.created_at).toDateString() === new Date().toDateString(),
  },
} as const;
type ViewKey = keyof typeof VIEWS;

const itemCount = (o: OrderRow) =>
  Array.isArray(o.order_items) ? (o.order_items[0]?.count ?? 0) : 0;

function OrdersPage() {
  const { data: merchant } = useMerchant();
  const { t } = useLang();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bulkAdvance = useServerFn(bulkAdvanceOrders);
  const list = useListState({ defaultSort: "created", defaultDir: "desc", pageSize: 25 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const { data: allOrders, isLoading } = useQuery({
    queryKey: ["orders", merchant?.id],
    enabled: !!merchant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, payment_method, total_minor_int, currency_code, customer_name, city, created_at, order_items(count), carrier_shipments(awb, status)",
        )
        .eq("merchant_id", merchant!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as unknown as OrderRow[];
    },
  });

  const rows = allOrders ?? [];
  const view = (list.view in VIEWS ? list.view : "all") as ViewKey;
  const status = list.param("status") ?? "all";
  const payment = list.param("payment") ?? "all";
  const paymentMethods = Array.from(new Set(rows.map((o) => o.payment_method))).sort();
  const q = list.q.trim().toLowerCase();

  const filtered = rows.filter(
    (o) =>
      VIEWS[view].match(o) &&
      (status === "all" || o.status === status) &&
      (payment === "all" || o.payment_method === payment) &&
      (!q ||
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q) ||
        (o.city ?? "").toLowerCase().includes(q)),
  );

  const sorted = compareBy(
    filtered,
    (o) =>
      list.sort === "total"
        ? Number(o.total_minor_int)
        : list.sort === "customer"
          ? (o.customer_name ?? "")
          : list.sort === "items"
            ? itemCount(o)
            : list.sort === "order"
              ? o.order_number
              : o.created_at,
    list.dir,
  );
  const paged = list.paginate(sorted);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(target: "next" | "packed" | "shipped" | "delivered") {
    const chosen = [...selected];
    if (!chosen.length) return;
    setBusy(true);
    try {
      const res = await bulkAdvance({ data: { orderIds: chosen, target } });
      if (res.failed)
        toast.warning(
          t(`${res.moved} moved, ${res.failed} skipped`, `${res.moved}টি সরানো, ${res.failed}টি বাদ`),
        );
      else toast.success(t(`${res.moved} orders updated`, `${res.moved}টি অর্ডার আপডেট হয়েছে`));
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: ["orders", merchant?.id] });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("Bulk action failed", "বাল্ক অ্যাকশন ব্যর্থ"),
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<OrderRow>[] = [
    {
      key: "order",
      header: t("Order", "অর্ডার"),
      sortable: true,
      cell: (o) => (
        <>
          <span className="fq-num font-medium text-foreground">{o.order_number}</span>
          <span className="block text-xs fq-sub">
            {new Date(o.created_at).toLocaleDateString("en-BD")}
          </span>
        </>
      ),
    },
    {
      key: "customer",
      header: t("Customer", "ক্রেতা"),
      sortable: true,
      cell: (o) => (
        <>
          {o.customer_name ?? "—"}
          <span className="block text-xs fq-sub">{o.city ?? ""}</span>
        </>
      ),
    },
    { key: "items", header: t("Items", "আইটেম"), numeric: true, sortable: true, cell: itemCount },
    {
      key: "payment",
      header: t("Payment", "পেমেন্ট"),
      cell: (o) => <span className="uppercase">{o.payment_method}</span>,
    },
    {
      key: "total",
      header: t("Total", "মোট"),
      numeric: true,
      sortable: true,
      cell: (o) => <Money minor={Number(o.total_minor_int)} currency={o.currency_code} />,
    },
    {
      key: "status",
      header: t("Status", "অবস্থা"),
      cell: (o) => (
        <Badge tone={BADGE_TONE[o.status] ?? "neutral"}>{statusLabel[o.status] ?? o.status}</Badge>
      ),
    },
    {
      key: "shipment",
      header: t("Shipment", "শিপমেন্ট"),
      cell: (o) => {
        const s = o.carrier_shipments?.[0];
        return s?.awb ? <span className="fq-num text-xs">{s.awb}</span> : <span className="fq-sub">—</span>;
      },
    },
  ];

  return (
    <Page
      title={t("Orders", "অর্ডার")}
      description={t("Orders placed on your storefront.", "আপনার দোকানে দেওয়া অর্ডার।")}
      actions={
        <Link to="/admin/draft-orders" className={btnGhost}>
          {t("Draft order", "ড্রাফট অর্ডার")}
        </Link>
      }
    >
      <Toolbar
        end={
          <>
            <select
              value={payment}
              onChange={(e) => list.setParam("payment", e.target.value === "all" ? undefined : e.target.value)}
              aria-label={t("Payment method", "পেমেন্ট মাধ্যম")}
              className={`${inputClass} h-9 w-auto py-0 uppercase`}
            >
              <option value="all">{t("All payments", "সব পেমেন্ট")}</option>
              {paymentMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => list.setParam("status", e.target.value === "all" ? undefined : e.target.value)}
              aria-label={t("Filter by status", "স্ট্যাটাস অনুযায়ী")}
              className={`${inputClass} h-9 w-auto py-0`}
            >
              <option value="all">{t("All statuses", "সব স্ট্যাটাস")}</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusLabel[s] ?? s}
                </option>
              ))}
            </select>
          </>
        }
      >
        <SavedViews
          activeId={view}
          onSelect={list.setView}
          views={(Object.keys(VIEWS) as ViewKey[]).map((key) => ({
            id: key,
            label: t(VIEWS[key].en, VIEWS[key].bn),
            count: rows.filter(VIEWS[key].match).length,
          }))}
        />
        <input
          type="search"
          value={list.q}
          onChange={(e) => list.setQ(e.target.value)}
          placeholder={t("Search order, customer, city", "অর্ডার, ক্রেতা, শহর খুঁজুন")}
          aria-label={t("Search orders", "অর্ডার খুঁজুন")}
          className={`${inputClass} h-9 w-56 py-0`}
        />
      </Toolbar>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(o) => o.id}
        loading={isLoading}
        selected={selected}
        onToggle={toggle}
        onToggleAll={(next) => setSelected(next ? new Set(paged.map((o) => o.id)) : new Set())}
        onRowClick={(o) => navigate({ to: "/admin/orders/$orderId", params: { orderId: o.id } })}
        rowActions={(o) => (
          <Link
            to="/admin/orders/$orderId"
            params={{ orderId: o.id }}
            className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            {t("Open", "খুলুন")}
          </Link>
        )}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        page={list.page}
        pageSize={list.pageSize}
        total={sorted.length}
        onPage={list.setPage}
        empty={
          <EmptyState
            title={t("No orders in this view", "এই ভিউতে কোনো অর্ডার নেই")}
            description={t(
              "Change the saved view or clear the search to see more.",
              "সেভ করা ভিউ বদলান বা সার্চ মুছুন।",
            )}
            action={
              <button type="button" className={btnGhost} onClick={() => list.setView("all")}>
                {t("Show all orders", "সব অর্ডার দেখুন")}
              </button>
            }
          />
        }
      />

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <button type="button" disabled={busy} onClick={() => runBulk("next")} className={btnPrimary}>
          {t("Advance to next step", "পরের ধাপে নিন")}
        </button>
        <button type="button" disabled={busy} onClick={() => runBulk("shipped")} className={btnGhost}>
          {t("Mark shipped", "শিপড করুন")}
        </button>
        <button type="button" onClick={() => window.print()} className={btnGhost}>
          {t("Print", "প্রিন্ট")}
        </button>
      </BulkBar>
    </Page>
  );
}
