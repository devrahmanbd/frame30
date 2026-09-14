import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import {
  ProductForm,
  fromMinor,
  type ProductDraft,
  type VariantDraft,
} from "@/components/admin/ProductForm";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/products/$productId")({
  head: () => ({
    meta: [
      { title: "Edit product — Framique Admin" },
      {
        name: "description",
        content: "Edit product details, variants, SKUs, BDT pricing and stock levels.",
      },
      { property: "og:title", content: "Edit product" },
      {
        property: "og:description",
        content: "Update catalog product details and variant stock in Framique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EditProduct,
});

function EditProduct() {
  const { productId } = Route.useParams();
  const { data: merchant } = useMerchant();
  const { t } = useLang();

  const { data, isLoading } = useQuery({
    queryKey: ["products", merchant?.id, productId],
    enabled: !!merchant,
    queryFn: async () => {
      const [product, brands, categories] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, title, slug, description, status, brand_id, category_id, image_url, product_kind, tags, product_variants(id, name, sku, price_amount_minor_int, stock_quantity, position)",
          )
          .eq("id", productId)
          .single(),
        supabase.from("brands").select("id, name").eq("merchant_id", merchant!.id).order("name"),
        supabase
          .from("categories")
          .select("id, name")
          .eq("merchant_id", merchant!.id)
          .order("name"),
      ]);
      if (product.error) throw product.error;
      if (brands.error) throw brands.error;
      if (categories.error) throw categories.error;
      return {
        product: product.data,
        brands: brands.data,
        categories: categories.data,
      };
    },
  });

  if (isLoading || !merchant || !data)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  const p = data.product;
  const draft: ProductDraft = {
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description ?? "",
    status: p.status,
    brand_id: p.brand_id ?? "",
    category_id: p.category_id ?? "",
    image_url: p.image_url ?? "",
    product_kind: p.product_kind,
    tags: (p.tags ?? []).join(", "),
  };
  const variants: VariantDraft[] = [...(p.product_variants ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku ?? "",
      price: fromMinor(v.price_amount_minor_int),
      stock: String(v.stock_quantity),
    }));

  return (
    <div className="space-y-5">
      <h1 className="font-bangla-display text-lg font-semibold">{t("Edit product", "পণ্য সম্পাদনা")}</h1>
      <ProductForm
        merchantId={merchant.id}
        initialProduct={draft}
        initialVariants={variants}
        brands={data.brands}
        categories={data.categories}
      />
    </div>
  );
}
