import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import { useListState, compareBy } from "@/lib/use-list-state";
import {
  Badge,
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

export const Route = createFileRoute("/_authenticated/admin/products/")({
  head: () => ({
    meta: [
      { title: "Products — Framique Admin" },
      {
        name: "description",
        content:
          "Manage your catalog: products, variants, SKUs, BDT pricing and stock levels.",
      },
      { property: "og:title", content: "Framique catalog" },
      {
        property: "og:description",
        content: "Product listing with variants, stock and BDT pricing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});

type Row = {
  id: string;
  title: string;
  slug: string;
  status: "draft" | "active" | "archived";
  product_variants: { price_amount_minor_int: number; stock_quantity: number }[];
};

const stockOf = (p: Row) => p.product_variants.reduce((s, v) => s + v.stock_quantity, 0);
const priceOf = (p: Row) =>
  p.product_variants.length ? Math.min(...p.product_variants.map((v) => v.price_amount_minor_int)) : null;

const VIEWS = {
  all: { en: "All", bn: "সব", match: () => true },
  active: { en: "Active", bn: "সক্রিয়", match: (p: Row) => p.status === "active" },
  draft: { en: "Drafts", bn: "খসড়া", match: (p: Row) => p.status === "draft" },
  out: { en: "Out of stock", bn: "স্টক শেষ", match: (p: Row) => stockOf(p) <= 0 },
  archived: { en: "Archived", bn: "আর্কাইভ", match: (p: Row) => p.status === "archived" },
} as const;
type ViewKey = keyof typeof VIEWS;

const TONE: Record<Row["status"], "success" | "warning" | "neutral"> = {
  active: "success",
  draft: "warning",
  archived: "neutral",
};

function ProductsPage() {
  const { data: merchant } = useMerchant();
  const { t } = useLang();
  const navigate = useNavigate();
  const list = useListState({ defaultSort: "title", defaultDir: "asc", pageSize: 25 });

  const { data, isLoading } = useQuery({
    queryKey: ["products", merchant?.id],
    enabled: !!merchant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, title, slug, status, product_variants(price_amount_minor_int, stock_quantity)")
        .eq("merchant_id", merchant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const rows = data ?? [];
  const view = (list.view in VIEWS ? list.view : "all") as ViewKey;
  const q = list.q.trim().toLowerCase();
  const filtered = rows.filter(
    (p) =>
      VIEWS[view].match(p) &&
      (!q || p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)),
  );
  const sorted = compareBy(
    filtered,
    (p) =>
      list.sort === "stock"
        ? stockOf(p)
        : list.sort === "price"
          ? (priceOf(p) ?? 0)
          : list.sort === "variants"
            ? p.product_variants.length
            : list.sort === "status"
              ? p.status
              : p.title,
    list.dir,
  );
  const paged = list.paginate(sorted);

  const columns: Column<Row>[] = [
    {
      key: "title",
      header: t("Product", "পণ্য"),
      sortable: true,
      cell: (p) => (
        <>
          <span className="font-medium text-foreground">{p.title}</span>
          <span className="block text-xs fq-sub">/{p.slug}</span>
        </>
      ),
    },
    {
      key: "status",
      header: t("Status", "অবস্থা"),
      sortable: true,
      cell: (p) => <Badge tone={TONE[p.status]}>{p.status}</Badge>,
    },
    {
      key: "variants",
      header: t("Variants", "ভ্যারিয়েন্ট"),
      numeric: true,
      sortable: true,
      cell: (p) => p.product_variants.length,
    },
    {
      key: "price",
      header: t("Price from", "শুরু দাম"),
      numeric: true,
      sortable: true,
      cell: (p) => <Money minor={priceOf(p)} />,
    },
    {
      key: "stock",
      header: t("Stock", "স্টক"),
      numeric: true,
      sortable: true,
      cell: (p) => stockOf(p),
    },
  ];

  return (
    <Page
      title={t("Products", "পণ্য")}
      description={t("Catalog products and stock", "ক্যাটালগ পণ্য ও স্টক")}
      actions={
        <Link to="/admin/products/new" className={btnPrimary}>
          <Plus className="size-4" aria-hidden /> {t("New product", "নতুন পণ্য")}
        </Link>
      }
    >
      <Toolbar
        end={
          <input
            type="search"
            value={list.q}
            onChange={(e) => list.setQ(e.target.value)}
            placeholder={t("Search title or handle", "নাম বা হ্যান্ডেল খুঁজুন")}
            aria-label={t("Search products", "পণ্য খুঁজুন")}
            className={`${inputClass} h-9 w-56 py-0`}
          />
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
      </Toolbar>

      <DataTable
        rows={paged}
        columns={columns}
        rowKey={(p) => p.id}
        loading={isLoading}
        onRowClick={(p) => navigate({ to: "/admin/products/$productId", params: { productId: p.id } })}
        rowActions={(p) => (
          <Link
            to="/admin/products/$productId"
            params={{ productId: p.id }}
            className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            {t("Edit", "সম্পাদনা")}
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
            title={t("No products here", "এখানে কোনো পণ্য নেই")}
            description={t(
              "Create your first product, or switch the saved view.",
              "প্রথম পণ্য যোগ করুন বা ভিউ বদলান।",
            )}
            action={
              <Link to="/admin/products/new" className={btnGhost}>
                {t("New product", "নতুন পণ্য")}
              </Link>
            }
          />
        }
      />
    </Page>
  );
}
