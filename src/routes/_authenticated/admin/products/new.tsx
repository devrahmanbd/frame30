import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { ProductForm, emptyProduct } from "@/components/admin/ProductForm";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/products/new")({
  head: () => ({
    meta: [
      { title: "New product — Framique Admin" },
      {
        name: "description",
        content: "Create a catalog product with variants, SKUs, BDT price and stock.",
      },
      { property: "og:title", content: "Create a product" },
      {
        property: "og:description",
        content: "Add a new product with variants and stock to your Framique catalog.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NewProduct,
});

function NewProduct() {
  const { data: merchant } = useMerchant();
  const { t } = useLang();
  const { data: brands } = useQuery({
    queryKey: ["brands", merchant?.id],
    enabled: !!merchant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name")
        .eq("merchant_id", merchant!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: categories } = useQuery({
    queryKey: ["categories", merchant?.id],
    enabled: !!merchant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .eq("merchant_id", merchant!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  if (!merchant) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      <h1 className="font-bangla-display text-lg font-semibold">{t("New product", "নতুন পণ্য")}</h1>
      <ProductForm
        merchantId={merchant.id}
        initialProduct={emptyProduct}
        initialVariants={[]}
        brands={brands ?? []}
        categories={categories ?? []}
      />
    </div>
  );
}
