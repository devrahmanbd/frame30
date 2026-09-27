import fs from "fs";

let content = fs.readFileSync("src/components/store/ThemePreviewFrame.tsx", "utf-8");

// Insert the imports
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

// Create the MockProductProvider component
const providerCode = `

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
  
  // Transform DemoProduct into what ProductView components expect
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
  
  // Map DemoVariants to what the components expect
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

// Insert the MockProductWrapper right before ThemePreviewFrame
const componentMarker = 'export function ThemePreviewFrame(';
content = content.replace(componentMarker, providerCode + componentMarker);

// Update contextSlots in ThemePreviewFrame
const slotsStartStr = '    if (template === "product") {';
const slotsEndStr = '    return slots;\n  }, [template, ast, previewData, lang, blueprintKey, demoFocus]);';

const newSlotsCode = `    if (template === "product") {
      // the product slots are dynamically injected via MockProductWrapper below instead.
    }
    return slots;
  }, [template, ast, previewData, lang, blueprintKey, demoFocus]);`;

content = content.replace(new RegExp(slotsStartStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + slotsEndStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), newSlotsCode);

// Wrap SectionRenderer with MockProductWrapper if template === "product"
const renderMarker = '        <SectionRenderer';
const renderEndMarker = '        />';

// We need to carefully replace the SectionRenderer block inside the return statement
content = content.replace(
  /<SectionRenderer[\s\S]*?contextSlots=\{contextSlots\}[\s\S]*?\/>/,
  `{template === "product" && demoFocus && DEMO_CATALOGUES[blueprintKey as keyof typeof DEMO_CATALOGUES]?.products.find((p: any) => p.slug === demoFocus.slug) ? (
          <MockProductWrapper
            demoProduct={DEMO_CATALOGUES[blueprintKey as keyof typeof DEMO_CATALOGUES]?.products.find((p: any) => p.slug === demoFocus.slug)}
            merchantName={themeName}
            storeSlug={blueprintKey}
          >
            {(productSlots) => (
              <SectionRenderer
                ast={ast}
                themeKey={blueprintKey}
                template={template}
                contextSlots={{...contextSlots, ...productSlots}}
              />
            )}
          </MockProductWrapper>
        ) : (
          <SectionRenderer
            ast={ast}
            themeKey={blueprintKey}
            template={template}
            contextSlots={contextSlots}
          />
        )}`
);

fs.writeFileSync("src/components/store/ThemePreviewFrame.tsx", content);
