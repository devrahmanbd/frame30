import { createFileRoute } from "@tanstack/react-router";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";

export const Route = createFileRoute("/_authenticated/admin/categories")({
  head: () => ({
    meta: [
      { title: "Categories — Framique Admin" },
      {
        name: "description",
        content: "Organise your catalog with product categories for your storefront.",
      },
      { property: "og:title", content: "Category management" },
      {
        property: "og:description",
        content: "Add, review and remove product categories for your store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <TaxonomyManager
      table="categories"
      titleBn="ক্যাটাগরি"
      titleEn="Product categories"
    />
  ),
});
