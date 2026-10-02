import { DEMO_CATALOGS } from "./src/lib/demo-catalog";

const template = "product";
const blueprintKey = "songoskriti";
const slug = "dhakai-jamdani-heritage-saree";

const catalog = DEMO_CATALOGS[blueprintKey as keyof typeof DEMO_CATALOGS];
const demoProduct =
  template === "product" && slug
    ? catalog?.products.find((p: any) => p.slug === slug)
    : null;

console.log("demoProduct?", !!demoProduct, demoProduct?.slug);
