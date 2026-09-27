import fs from "fs";

let content = fs.readFileSync("src/components/store/ThemePreviewFrame.tsx", "utf-8");

const startStr = '    if (template === "product") {';
const endStr = '    return slots;';

const newCode = `    if (template === "product") {
      const title = demoFocus?.title ?? "Demo Product";
      const image = demoFocus?.image ?? "/api/public/ph/demo";
      
      slots.breadcrumb = (
        <nav className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-6">
          <span className="hover:text-foreground transition-colors cursor-pointer">Store</span>
          <span aria-hidden className="mx-2"> / </span>
          <span className="text-foreground">{title}</span>
        </nav>
      );
      
      slots.product_media = (
        <div className="relative w-full overflow-hidden bg-[var(--theme-surface,#f5f3f0)] aspect-[3/4] sm:aspect-[4/5] md:aspect-auto md:h-[calc(100vh-6rem)] md:sticky md:top-24">
          <img src={image} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      );
      
      slots.product_meta = (
        <div className="space-y-4">
          <h1 className="font-serif text-[32px] sm:text-[40px] font-medium tracking-tight text-foreground leading-[1.1]">
            {title}
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-prose">
            Woven on a traditional wooden pit loom. 100% fine combed cotton with contrast zari border.
          </p>
        </div>
      );
      
      slots.price_block = (
        <div className="flex flex-col border-b border-border pb-6 mt-6">
          <div className="flex items-baseline gap-3">
            <p className="font-sans text-2xl font-medium tracking-tight text-foreground">BDT 4,990</p>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">VAT included. Delivery calculated at checkout.</p>
        </div>
      );
      
      slots.add_to_cart = (
        <div className="mt-8">
          <p className="mb-4 text-sm font-medium text-success-foreground">12 in stock</p>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex h-14 w-32 items-center border border-border">
              <span className="flex-1 text-center text-muted-foreground text-lg">−</span>
              <span className="flex-1 text-center font-medium text-sm tabular-nums">1</span>
              <span className="flex-1 text-center text-muted-foreground text-lg">+</span>
            </div>
            <button type="button" className="h-14 flex-1 bg-foreground px-8 text-sm font-medium tracking-wider uppercase text-background transition-opacity hover:opacity-90">
              Add to cart
            </button>
            <div className="h-14 w-14 flex items-center justify-center border border-border group/btn cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-heart"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </div>
          </div>
          <div className="mt-8 space-y-3 rounded border border-border bg-[var(--theme-surface,#f5f3f0)] p-4 text-sm">
            <div className="flex gap-2">
              <span className="font-semibold text-foreground">Delivery:</span>
              <span className="text-muted-foreground">Nationwide shipping available.</span>
            </div>
            <div className="flex gap-2">
              <span className="font-semibold text-foreground">Payment:</span>
              <span className="text-muted-foreground">Cash on Delivery accepted.</span>
            </div>
          </div>
        </div>
      );
      
      slots.page_content = (
        <div className="mt-12 border-t border-border">
          <details className="group border-b border-border" open>
            <summary className="flex cursor-pointer items-center justify-between py-5 text-sm font-semibold uppercase tracking-wider text-foreground">
              Details
            </summary>
            <div className="pb-6">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                Breathable in humidity, softer with every wash. Includes 80cm unstitched blouse piece. Model is 168cm and wears one size.
              </p>
            </div>
          </details>
          <details className="group border-b border-border">
            <summary className="flex cursor-pointer items-center justify-between py-5 text-sm font-semibold uppercase tracking-wider text-foreground">
              Care Instructions
            </summary>
          </details>
        </div>
      );
    }

`;

content = content.replace(new RegExp(startStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + endStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), newCode + endStr);
fs.writeFileSync("src/components/store/ThemePreviewFrame.tsx", content);
