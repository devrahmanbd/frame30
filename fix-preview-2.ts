import fs from "fs";

let content = fs.readFileSync("src/components/store/ThemePreviewFrame.tsx", "utf-8");

const importMarker = 'import { ThemeSurface } from "@/components/builder/ThemeSurface";';
const newImports = `import {
  ProductGallery,
  PriceBlock,
  ProductInfo,
  VariantSelector,
  AddToCart,
  ProductDetails,
  ProductCraftStory,
} from "@/components/store/ProductView";
import { DEMO_CATALOGS } from "@/lib/demo-catalog";
`;
content = content.replace(importMarker, newImports + importMarker);

const hookStr = `
function useMockProductSlots(
  template: TemplateKey,
  demoFocus: any,
  themeName: string,
  blueprintKey: string
) {
  const [variantId, setVariantId] = useState<string>("");
  const [added, setAdded] = useState(false);

  // If not product template or no demo product, return undefined so it falls back
  const demoProduct = template === "product" && demoFocus 
    ? DEMO_CATALOGS[blueprintKey as keyof typeof DEMO_CATALOGS]?.products.find((p: any) => p.slug === demoFocus.slug) 
    : null;

  useEffect(() => {
    if (demoProduct) {
      setVariantId(demoProduct.variants[0]?.id ?? demoProduct.variants[0]?.name ?? "");
    }
  }, [demoProduct]);

  if (!demoProduct) return undefined;

  const productPayload = {
    id: demoProduct.slug,
    title: demoProduct.title,
    description: demoProduct.description,
    image_url: demoProduct.image_url,
    image: null,
  };
  
  const merchantPayload = {
    id: "demo",
    name: themeName,
    slug: blueprintKey,
    currency_code: "BDT"
  };
  
  const settingsPayload = {
    shipping_flat_minor_int: 6000,
    cod_enabled: true,
    mfs_enabled: true,
    free_shipping_threshold_minor_int: null
  };
  
  const mappedVariants = demoProduct.variants.map((v: any) => ({
    id: v.id ?? v.name,
    name: v.name,
    sku: v.sku,
    price_amount_minor_int: v.price,
    compare_at_amount_minor_int: v.compare_at,
    stock_quantity: v.stock ?? 10
  }));
  
  const mappedVariant = mappedVariants.find((v: any) => v.id === variantId) ?? mappedVariants[0] ?? null;

  const breadcrumb = (
    <nav className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
      <span className="hover:text-foreground transition-colors cursor-pointer">{themeName}</span>
      <span aria-hidden className="mx-2"> / </span>
      <span className="text-foreground">{demoProduct.title}</span>
    </nav>
  );

  const media = <ProductGallery product={productPayload as any} />;
  const meta = <ProductInfo product={productPayload as any} />;
  const priceBlock = mappedVariant ? <PriceBlock variant={mappedVariant} currencyCode="BDT" /> : null;
  
  const addToCart = mappedVariant ? (
    <div>
      <VariantSelector variants={mappedVariants} variantId={variantId} setVariantId={setVariantId} />
      <AddToCart
        variant={mappedVariant}
        merchant={merchantPayload as any}
        custom={false}
        add={(id, qty) => { console.log("Mock add to cart", id, qty); }}
        added={added}
        setAdded={setAdded}
        settings={settingsPayload as any}
      />
    </div>
  ) : null;
  
  const pageContent = (
    <>
      <ProductDetails description={demoProduct.description} />
      <ProductCraftStory description={demoProduct.description} />
    </>
  );

  return {
    breadcrumb,
    product_media: media,
    product_meta: meta,
    price_block: priceBlock,
    add_to_cart: addToCart,
    page_content: pageContent
  };
}
`;

content = content.replace('export function ThemePreviewFrame(', hookStr + '\nexport function ThemePreviewFrame(');

// Add the hook call inside ThemePreviewFrame
const accountSlotsMarker = '  const accountSlots = useMemo(() => {';
const newHookCall = `  const productSlots = useMockProductSlots(template, demoFocus, themeName, blueprintKey);\n`;
content = content.replace(accountSlotsMarker, newHookCall + accountSlotsMarker);

// Now update the contextSlots passed to SectionRenderer
// The accountSlots is passed directly right now to all SectionRenderers
content = content.replace(/contextSlots=\{accountSlots\}/g, 'contextSlots={accountSlots || productSlots || undefined}');

fs.writeFileSync("src/components/store/ThemePreviewFrame.tsx", content);
