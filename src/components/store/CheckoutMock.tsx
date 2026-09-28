import { MinimalCheckoutHeader } from "@/components/store/StoreHeader";
import { Link } from "@tanstack/react-router";

export function CheckoutMock({
  slug,
  themeName,
  themeKey,
}: {
  slug: string;
  themeName: string;
  themeKey?: string | null;
}) {
  return (
    <div className="bg-muted/10 min-h-screen pb-24 font-sans">
      <MinimalCheckoutHeader
        slug={slug}
        name={themeName}
        themeKey={themeKey ?? null}
      />
      <div className="mx-auto grid max-w-[var(--fq-container,1280px)] gap-12 px-4 py-8 lg:grid-cols-[1.5fr_1fr] lg:gap-16 sm:px-6 lg:px-8">
        <section className="order-2 lg:order-1 pt-4">
          <nav className="mb-10 flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            <span className="hover:text-foreground transition-colors cursor-pointer">
              Cart
            </span>
            <span className="text-border">/</span>
            <span className="text-foreground">Details</span>
            <span className="text-border">/</span>
            <span className="opacity-50 cursor-not-allowed">Payment</span>
          </nav>
          <div className="space-y-12">
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground font-bangla-display">
                Contact Information
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="First Name"
                  className="h-[46px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  className="h-[46px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:outline-none"
                />
                <input
                  type="email"
                  placeholder="Email"
                  className="h-[46px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:outline-none sm:col-span-2"
                />
                <input
                  type="tel"
                  placeholder="Phone Number"
                  className="h-[46px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:outline-none sm:col-span-2"
                />
              </div>
            </div>
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground font-bangla-display">
                Delivery Address
              </h2>
              <div className="grid gap-4">
                <input
                  type="text"
                  placeholder="Address Line 1"
                  className="h-[46px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:outline-none"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="City"
                    className="h-[46px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Postal Code"
                    className="h-[46px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-foreground focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
        <aside className="order-1 lg:order-2">
          <div className="sticky top-28 rounded-xl border border-border/40 bg-background p-6 shadow-sm sm:p-8">
            <h2 className="mb-6 text-xl font-semibold tracking-tight text-foreground font-bangla-display">
              Order Summary
            </h2>
            <div className="space-y-4 mb-6 pb-6 border-b border-border/40">
              <div className="flex items-start gap-4">
                <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted shrink-0">
                  <img
                    src="https://imagedelivery.net/qN-Q6jF-JtT50c608f06rQ/bf7750fb-efc9-467f-c1eb-156eb609ef00/public"
                    alt="Product"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                    1
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-foreground">
                    Muslin Floral Festive Saree
                  </h3>
                  <p className="text-[13px] text-muted-foreground mt-1">
                    Crimson Red
                  </p>
                </div>
                <div className="text-sm font-medium text-foreground">
                  ৳ 4,500
                </div>
              </div>
            </div>
            <dl className="space-y-3 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd className="font-medium text-foreground">৳ 4,500</dd>
              </div>
              <div className="flex justify-between">
                <dt>Shipping</dt>
                <dd className="font-medium text-foreground">৳ 120</dd>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-4 text-base text-foreground mt-4">
                <dt className="font-semibold">Total</dt>
                <dd className="font-semibold tracking-tight">৳ 4,620</dd>
              </div>
            </dl>
            <button className="mt-8 w-full h-[50px] rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity">
              Complete Order
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
