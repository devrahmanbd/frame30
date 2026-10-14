import { CheckCircle, Clock, XCircle } from "@/components/icons/tabler";
import { Link } from "@tanstack/react-router";

export function OrderConfirmationMock({
  slug,
  themeName,
  status,
}: {
  slug: string;
  themeName: string;
  status: "success" | "pending" | "failed";
}) {
  const isFailed = status === "failed";
  const isPending = status === "pending";
  const isSuccess = status === "success";

  return (
    <div className="bg-muted/10 font-sans pb-24 text-left" lang="bn">
      <main className="mx-auto max-w-[800px] px-4 py-16 sm:px-6 lg:px-8 space-y-8">
        <header className="flex flex-col items-center text-center space-y-4 mb-10 pb-10 border-b border-border/40">
          {isFailed ? (
            <>
              <XCircle className="size-16 text-danger" />
              <h1 className="font-bangla-display text-3xl font-semibold tracking-tight text-foreground">
                Payment failed
              </h1>
              <p className="text-muted-foreground text-[15px]">
                We could not process your payment.
              </p>
            </>
          ) : isPending ? (
            <>
              <Clock className="size-16 text-warning" />
              <h1 className="font-bangla-display text-3xl font-semibold tracking-tight text-foreground">
                Awaiting approval
              </h1>
              <p className="text-muted-foreground text-[15px]">
                Your order has been placed and is waiting for admin approval.
              </p>
            </>
          ) : (
            <>
              <CheckCircle className="size-16 text-success" />
              <h1 className="font-bangla-display text-3xl font-semibold tracking-tight text-foreground">
                Thank you! Order successful
              </h1>
              <p className="text-muted-foreground text-[15px]">
                We've received your order and payment. It is now being
                processed.
              </p>
            </>
          )}
          <p className="mt-2 text-sm font-medium text-foreground bg-background border border-border px-4 py-2 rounded-full shadow-sm">
            Order <span className="font-semibold">ORD-1234</span>
          </p>
        </header>

        {isFailed && (
          <section className="flex flex-col items-center gap-4 bg-background p-6 rounded-2xl border border-border/60 shadow-sm">
            <button
              type="button"
              className="w-full sm:w-auto min-w-[200px] h-[46px] rounded-md bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Pay now
            </button>
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-8">
            <section className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
              <h2 className="font-bangla-display text-xl font-semibold tracking-tight mb-6">
                Items
              </h2>
              <ul className="divide-y divide-border/40">
                <li className="flex justify-between gap-4 py-4 first:pt-0 last:pb-0">
                  <div className="flex gap-4">
                    <div className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted/30 shrink-0 flex items-center justify-center">
                      <img
                        src="https://imagedelivery.net/qN-Q6jF-JtT50c608f06rQ/bf7750fb-efc9-467f-c1eb-156eb609ef00/public"
                        alt="Product"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <div className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
                        1
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground line-clamp-2">
                        Muslin Floral Festive Saree
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Crimson / L
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-muted-foreground">Qty: 1</p>
                        <p className="text-xs text-muted-foreground/60 border-l border-border/60 pl-2">
                          SKU: MUS-CRI-L
                        </p>
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-foreground whitespace-nowrap">
                    ৳ 4,500
                  </span>
                </li>
              </ul>
              <dl className="mt-6 space-y-3 border-t border-border/40 pt-6 text-sm">
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                  <dt>Subtotal</dt>
                  <dd className="font-medium text-foreground">৳ 4,500</dd>
                </div>
                <div className="flex items-center justify-between gap-3 text-muted-foreground">
                  <dt>Delivery</dt>
                  <dd className="font-medium text-foreground">৳ 120</dd>
                </div>
                <div className="flex items-center justify-between gap-3 pt-4 border-t border-border/40 mt-4 text-base">
                  <dt className="font-semibold text-foreground">Total</dt>
                  <dd className="font-semibold tracking-tight">৳ 4,620</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <section className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
              <h2 className="font-bangla-display text-xl font-semibold tracking-tight mb-4">
                Delivery
              </h2>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">John Doe</p>
                <p>123 Demo Street</p>
                <p>Dhaka 1212</p>
                <p className="pt-2 mt-2 border-t border-border/40">
                  01712345678
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-border/60 bg-background p-6 shadow-sm">
              <h2 className="font-bangla-display text-xl font-semibold tracking-tight mb-4">
                Timeline
              </h2>
              <ol className="relative border-s border-border/60 ml-3 space-y-6">
                <li className="ms-6">
                  <span className="absolute -start-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-4 ring-background border border-border">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                  </span>
                  <h3 className="text-sm font-semibold leading-tight text-foreground">
                    Order placed
                  </h3>
                  <time className="block mb-2 text-xs font-normal leading-none text-muted-foreground/80 mt-1">
                    Today, 10:00 AM
                  </time>
                </li>
              </ol>
            </section>
          </div>
        </div>

        <div className="text-center pt-8">
          <span className="inline-flex h-[46px] items-center justify-center rounded-md border border-border/60 bg-background px-8 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/30 cursor-pointer">
            View all orders
          </span>
        </div>
      </main>
    </div>
  );
}
