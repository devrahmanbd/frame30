import { createFileRoute } from "@tanstack/react-router";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";

export const Route = createFileRoute("/_authenticated/admin/brands")({
  head: () => ({
    meta: [
      { title: "Brands — Framique Admin" },
      {
        name: "description",
        content: "Create and manage the brands used across your Framique catalog.",
      },
      { property: "og:title", content: "Brand management" },
      {
        property: "og:description",
        content: "Add, review and remove brands for your store catalog.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <TaxonomyManager table="brands" titleBn="ব্র্যান্ড" titleEn="Brands in your catalog" />
  ),
});
