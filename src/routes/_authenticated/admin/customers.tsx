import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useLang } from "@/lib/i18n";
import { customersLoadFn } from "@/lib/commerce.functions";
import { useListState, compareBy } from "@/lib/use-list-state";
import {
  Card,
  type Column,
  DataTable,
  EmptyState,
  Money,
  Page,
  SavedViews,
  Toolbar,
  inputClass,
} from "@/components/console/kit";
import { ErrorFrame } from "@/components/admin/MarketingUi";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "Customers — Framique admin" },
      {
        name: "description",
        content:
          "Every shopper with their order count, lifetime spend in taka and last purchase, plus saved segments for campaigns.",
      },
      { property: "og:title", content: "Customers — Framique admin" },
      {
        property: "og:description",
        content: "Search shoppers, read lifetime value and reuse segments in marketing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CustomersPage,
});

function message(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

type Customer = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  orders: number;
  spendMinorInt: number;
  lastOrderAt: string | null;
};

const DAY = 86_400_000;

const VIEWS = {
  all: { en: "All", bn: "সব", match: () => true },
  repeat: { en: "Repeat", bn: "পুনরাবৃত্ত", match: (c: Customer) => c.orders > 1 },
  new: { en: "One order", bn: "এক অর্ডার", match: (c: Customer) => c.orders === 1 },
  lapsed: {
    en: "Lapsed 90d",
    bn: "৯০ দিন নিষ্ক্রিয়",
    match: (c: Customer) =>
      !!c.lastOrderAt && Date.now() - new Date(c.lastOrderAt).getTime() > 90 * DAY,
  },
} as const;
type ViewKey = keyof typeof VIEWS;

function CustomersPage() {
  const { t } = useLang();
  const load = useServerFn(customersLoadFn);
  const list = useListState({ defaultSort: "spend", defaultDir: "desc", pageSize: 25 });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["commerce", "customers", list.q],
    queryFn: () => load({ data: { term: list.q } }),
  });

  const customers = (data?.customers ?? []) as Customer[];
  const lifetime = customers.reduce((s, c) => s + c.spendMinorInt, 0);
  const view = (list.view in VIEWS ? list.view : "all") as ViewKey;
  const filtered = customers.filter(VIEWS[view].match);
  const sorted = compareBy(
    filtered,
    (c) =>
      list.sort === "orders"
        ? c.orders
        : list.sort === "name"
          ? (c.name ?? "")
          : list.sort === "last"
            ? (c.lastOrderAt ?? "")
            : c.spendMinorInt,
    list.dir,
  );
  const paged = list.paginate(sorted);

  const columns: Column<Customer>[] = [
    {
      key: "name",
      header: t("Name", "নাম"),
      sortable: true,
      cell: (c) => <span className="font-medium text-foreground">{c.name ?? "—"}</span>,
    },
    {
      key: "contact",
      header: t("Contact", "যোগাযোগ"),
      cell: (c) => <span className="fq-sub">{c.email ?? c.phone ?? "—"}</span>,
    },
    { key: "orders", header: t("Orders", "অর্ডার"), numeric: true, sortable: true, cell: (c) => c.orders },
    {
      key: "spend",
      header: t("Spend", "খরচ"),
      numeric: true,
      sortable: true,
      cell: (c) => <Money minor={c.spendMinorInt} />,
    },
    {
      key: "last",
      header: t("Last order", "শেষ অর্ডার"),
      numeric: true,
      sortable: true,
      cell: (c) =>
        c.lastOrderAt ? (
          <span className="fq-num fq-sub">{new Date(c.lastOrderAt).toLocaleDateString()}</span>
        ) : (
          <span className="fq-sub">—</span>
        ),
    },
  ];

  return (
    <Page
      title={t("Customers", "ক্রেতা")}
      description={t(
        "Spend and order counts are derived from stored orders.",
        "খরচ ও অর্ডার সংখ্যা সংরক্ষিত অর্ডার থেকেই গণনা হয়।",
      )}
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs uppercase fq-sub">{t("Shoppers", "ক্রেতা")}</p>
          <p className="fq-num text-2xl font-semibold">{customers.length}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase fq-sub">{t("Lifetime value", "মোট মূল্য")}</p>
          <p className="text-2xl font-semibold">
            <Money minor={lifetime} />
          </p>
        </Card>
        <Card>
          <p className="text-xs uppercase fq-sub">{t("Segments", "সেগমেন্ট")}</p>
          <p className="fq-num text-2xl font-semibold">{data?.segments.length ?? 0}</p>
        </Card>
      </div>

      <ErrorFrame message={isError ? message(error) : null} />

      <Toolbar
        end={
          <input
            type="search"
            value={list.q}
            onChange={(e) => list.setQ(e.target.value)}
            placeholder={t("Search name, email or phone", "নাম, ইমেইল বা ফোন খুঁজুন")}
            aria-label={t("Search customers", "ক্রেতা খুঁজুন")}
            className={`${inputClass} h-9 w-64 py-0`}
          />
        }
      >
        <SavedViews
          activeId={view}
          onSelect={list.setView}
          views={(Object.keys(VIEWS) as ViewKey[]).map((key) => ({
            id: key,
            label: t(VIEWS[key].en, VIEWS[key].bn),
            count: customers.filter(VIEWS[key].match).length,
          }))}
        />
      </Toolbar>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(c) => c.id}
        loading={isLoading}
        sort={list.sort}
        dir={list.dir}
        onSort={list.toggleSort}
        page={list.page}
        pageSize={list.pageSize}
        total={sorted.length}
        onPage={list.setPage}
        empty={
          <EmptyState
            title={t("No customers match this search.", "এই খোঁজে কোনো ক্রেতা নেই।")}
            description={t("Try another term or view.", "অন্য শব্দ বা ভিউ চেষ্টা করুন।")}
          />
        }
      />
    </Page>
  );
}
