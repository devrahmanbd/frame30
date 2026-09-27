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
import { DEMO_CATALOGUES } from "@/lib/demo-catalog";
`;
content = content.replace(importMarker, newImports + importMarker);

const wrapperStr = `
function MockProductWrapper({
  demoProduct,
  merchantName,
  storeSlug,
  children
}: {
  demoProduct: any;
  merchantName: string;
  storeSlug: string;
  children: (slots: Record<string, React.ReactNode>) => React.ReactNode;
}) {
  const [variantId, setVariantId] = useState(() => demoProduct.variants[0]?.id ?? demoProduct.variants[0]?.name ?? "");
  const [added, setAdded] = useState(false);
  const variant = demoProduct.variants.find((v: any) => (v.id ?? v.name) === variantId) ?? demoProduct.variants[0];
  
  const productPayload = {
    id: demoProduct.slug,
    title: demoProduct.title,
    description: demoProduct.description,
    image_url: demoProduct.image_url,
    image: null,
  };
  
  const merchantPayload = {
    id: "demo",
    name: merchantName,
    slug: storeSlug,
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
  
  const mappedVariant = mappedVariants.find((v: any) => v.id === variantId) ?? mappedVariants[0];

  const breadcrumb = (
    <nav className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
      <span className="hover:text-foreground transition-colors cursor-pointer">{merchantName}</span>
      <span aria-hidden className="mx-2"> / </span>
      <span className="text-foreground">{demoProduct.title}</span>
    </nav>
  );

  const media = <ProductGallery product={productPayload as any} />;
  const meta = <ProductInfo product={productPayload as any} />;
  const priceBlock = <PriceBlock variant={mappedVariant} currencyCode="BDT" />;
  
  const addToCart = (
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
  );
  
  const pageContent = (
    <>
      <ProductDetails description={demoProduct.description} />
      <ProductCraftStory description={demoProduct.description} />
    </>
  );

  return children({
    breadcrumb,
    product_media: media,
    product_meta: meta,
    price_block: priceBlock,
    add_to_cart: addToCart,
    page_content: pageContent
  });
}
`;

content = content.replace('export function ThemePreviewFrame(', wrapperStr + '\nexport function ThemePreviewFrame(');

// Replace the return of ThemePreviewFrame to inject the wrapper dynamically if it's a product
const returnBlockStart = '  return (\n    <div';
content = content.replace(returnBlockStart, `
  const demoProduct = template === "product" && demoFocus 
    ? DEMO_CATALOGUES[blueprintKey as keyof typeof DEMO_CATALOGUES]?.products.find((p: any) => p.slug === demoFocus.slug) 
    : null;

  const renderContent = (productSlots: Record<string, React.ReactNode> = {}) => (
    <div`);
    
content = content.replace('contextSlots={contextSlots}', 'contextSlots={{...contextSlots, ...productSlots}}');
content = content.replace('contextSlots={contextSlots}', 'contextSlots={{...contextSlots, ...productSlots}}');
content = content.replace('contextSlots={contextSlots}', 'contextSlots={{...contextSlots, ...productSlots}}');
content = content.replace('contextSlots={contextSlots}', 'contextSlots={{...contextSlots, ...productSlots}}');

content = content.replace('  );\n}\n', `  );
  
  if (demoProduct) {
    return (
      <MockProductWrapper demoProduct={demoProduct} merchantName={themeName} storeSlug={blueprintKey}>
        {(slots) => renderContent(slots)}
      </MockProductWrapper>
    );
  }
  return renderContent();
}
`);

const slotsStartStr = '    if (template === "product") {';
const slotsEndStr = '    return slots;\n  }, [template, ast, previewData, lang, blueprintKey, demoFocus]);';
const newSlotsCode = `    if (template === "product") {
      // product slots are dynamically injected via MockProductWrapper
    }
    return slots;
  }, [template, ast, previewData, lang, blueprintKey, demoFocus]);`;
content = content.replace(new RegExp(slotsStartStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + slotsEndStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), newSlotsCode);

fs.writeFileSync("src/components/store/ThemePreviewFrame.tsx", content);
