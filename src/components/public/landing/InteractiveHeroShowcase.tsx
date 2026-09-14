import { useState } from "react";
import {
  Check,
  ArrowRight,
  Truck,
  CreditCard,
  ShoppingBag,
  ShieldCheck,
  Printer,
  Package,
  RotateCcw,
  Building2,
  Phone,
  MapPin,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedIcon } from "@/components/public/AnimatedIcon";

export type HeroShowcaseStep = 0 | 1 | 2 | 3;

interface StepMeta {
  id: string;
  label: string;
  badge: string;
  icon: typeof ShoppingBag;
  variant: "lift" | "pulse" | "bounce" | "tilt";
}

const STEPS: StepMeta[] = [
  { id: "checkout", label: "01 Checkout", badge: "Order Created", icon: ShoppingBag, variant: "lift" },
  { id: "payment", label: "02 bKash Rail", badge: "Instant Capture", icon: CreditCard, variant: "pulse" },
  { id: "courier", label: "03 Logistics", badge: "Auto-Booked", icon: Truck, variant: "bounce" },
  { id: "settle", label: "04 Settlement", badge: "Ledger Closed", icon: ShieldCheck, variant: "tilt" },
];

export function InteractiveHeroShowcase({ className }: { className?: string }) {
  const [activeStep, setActiveStep] = useState<HeroShowcaseStep>(0);

  return (
    <div
      className={cn(
        "fq-glass fq-halo rounded-fq-lg border border-border/80 bg-card/90 backdrop-blur-xl shadow-lift-lg overflow-hidden transition-all duration-300 hover:border-primary/40 text-left",
        className,
      )}
    >
      {/* Interactive Step Switcher */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-border/60 bg-muted/10 p-1.5 gap-1 text-xs">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = activeStep === idx;
          const isPassed = activeStep > idx;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setActiveStep(idx as HeroShowcaseStep)}
              className={cn(
                "group flex items-center justify-center gap-2 rounded-fq-sm px-2.5 py-2 font-medium transition-all text-left",
                isActive
                  ? "bg-card text-foreground shadow-sm border border-border/80 font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
              )}
            >
              <span className="shrink-0">
                {isPassed ? (
                  <Check className="size-3.5 text-primary" />
                ) : (
                  <AnimatedIcon icon={Icon} variant={step.variant} size="sm" className="opacity-80" />
                )}
              </span>
              <span className="truncate">{step.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Showcase Canvas */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Step 0: Checkout */}
        {activeStep === 0 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Customer & Cart · 1-Tap Mobile Checkout
                </p>
                <h4 className="text-base font-semibold text-foreground mt-0.5">
                  Nusrat Jahan · Dhanmondi, Dhaka
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Phone: +880 1711-892341 · District & Thana Pre-filled
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-fq-sm bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                  Ready to Pay
                </span>
                <p className="fq-display text-2xl font-bold mt-1 tabular-nums text-foreground">৳3,450</p>
              </div>
            </div>

            {/* Authentic Live Checkout Preview Card */}
            <div className="rounded-fq-md border border-border/70 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-border/50">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Package className="size-3.5 text-primary" /> Order Items (2 items)
                </span>
                <span className="text-muted-foreground">Delivering to Dhanmondi Metro</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-foreground font-medium">
                  <span>Handloom Jamdani Tunic (Indigo / Size M)</span>
                  <span className="tabular-nums">৳2,850</span>
                </div>
                <div className="flex justify-between items-center text-foreground font-medium">
                  <span>Artisan Brass Earrings (Gold Plated)</span>
                  <span className="tabular-nums">৳540</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground border-t border-border/40 pt-2">
                  <span>Steadfast Standard Delivery (Inside Dhaka)</span>
                  <span className="tabular-nums">৳60</span>
                </div>
              </div>

              {/* Payment Rail Selector */}
              <div className="pt-2 border-t border-border/40">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Select Payment Method
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-fq-sm border border-primary bg-primary/10 p-2 text-center font-semibold text-foreground">
                    ● bKash Direct
                  </div>
                  <div className="rounded-fq-sm border border-border/60 bg-muted/30 p-2 text-center text-muted-foreground">
                    ○ Nagad
                  </div>
                  <div className="rounded-fq-sm border border-border/60 bg-muted/30 p-2 text-center text-muted-foreground">
                    ○ Visa / Master
                  </div>
                  <div className="rounded-fq-sm border border-border/60 bg-muted/30 p-2 text-center text-muted-foreground">
                    ○ Cash on Delivery
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary" />
                Mobile PageSpeed: 99 · 400ms TTFB · Zero drop-off
              </span>
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="group inline-flex items-center gap-1 text-primary font-medium hover:underline"
              >
                Proceed to Payment <ArrowRight className="size-3 transition-transform motion-safe:group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Payment */}
        {activeStep === 1 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Direct Settlement Rail · Zero Intermediary Escrow
                </p>
                <h4 className="text-base font-semibold text-foreground mt-0.5">
                  bKash Merchant Direct Gateway
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  TrxID: 9BK841029 · Webhook Confirmed in 180ms
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-fq-sm bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                  Payment Captured
                </span>
                <p className="fq-display text-2xl font-bold mt-1 tabular-nums text-foreground">৳3,450</p>
              </div>
            </div>

            {/* Authentic Payment Receipt UI */}
            <div className="rounded-fq-md border border-border/70 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-border/50">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <CreditCard className="size-3.5 text-primary" /> MFS Settlement Certificate
                </span>
                <span className="font-mono text-muted-foreground">TrxID: 9BK841029</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="rounded-fq-sm border border-border/60 bg-card/60 p-2.5">
                  <p className="text-muted-foreground">Direct Settlement Target</p>
                  <p className="font-semibold text-foreground mt-0.5 flex items-center gap-1">
                    <Building2 className="size-3 text-primary" /> City Bank A/C ****4891
                  </p>
                </div>
                <div className="rounded-fq-sm border border-border/60 bg-card/60 p-2.5">
                  <p className="text-muted-foreground">Platform Sales Cut</p>
                  <p className="font-semibold text-primary mt-0.5">0% (You keep 100% revenue)</p>
                </div>
              </div>

              <div className="rounded-fq-sm border border-border/40 bg-card/40 p-2.5 text-xs font-mono space-y-1 text-muted-foreground">
                <div className="flex justify-between">
                  <span>Gross customer payment:</span>
                  <span className="text-foreground font-semibold">৳3,450.00</span>
                </div>
                <div className="flex justify-between">
                  <span>bKash direct merchant fee (1.2%):</span>
                  <span className="text-muted-foreground">-৳41.40</span>
                </div>
                <div className="flex justify-between border-t border-border/40 pt-1 text-foreground font-semibold">
                  <span>Net settled to your bank:</span>
                  <span className="text-primary">৳3,408.60</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Settles directly into your account with zero platform hold</span>
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="group inline-flex items-center gap-1 text-primary font-medium hover:underline"
              >
                Dispatch Courier <ArrowRight className="size-3 transition-transform motion-safe:group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Courier */}
        {activeStep === 2 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Automated Logistics · Steadfast & Pathao Hub
                </p>
                <h4 className="text-base font-semibold text-foreground mt-0.5">
                  Steadfast Courier API Sync
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Consignment: SF-8891402BD · 1-Click Thermal Airway Bill
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-fq-sm bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                  Rider Assigned
                </span>
                <p className="text-xs text-muted-foreground mt-1 font-mono">Pickup: 3:00 PM</p>
              </div>
            </div>

            {/* Authentic Thermal Airway Bill (AWB) Card Preview */}
            <div className="rounded-fq-md border border-border/70 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <span className="font-bold tracking-wider text-foreground">STEADFAST COURIER</span>
                  <span className="rounded-fq-sm bg-muted/80 px-2 py-0.5 text-[10px] font-mono">EXPRESS</span>
                </div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  <Printer className="size-3" /> Print 4x6 Label
                </button>
              </div>

              {/* Realistic Barcode Visual */}
              <div className="rounded-fq-sm border border-dashed border-border/80 bg-card/60 p-3 text-center">
                <div className="font-mono text-lg tracking-[0.35em] text-foreground select-none font-extrabold">
                  ||| | |||| || ||||| ||| |||| || |||
                </div>
                <p className="font-mono text-[11px] text-muted-foreground mt-1 tracking-wider">
                  *SF-8891402BD*
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="size-3 text-primary" /> Destination
                  </p>
                  <p className="font-semibold text-foreground">Nusrat Jahan</p>
                  <p className="text-muted-foreground">House 42, Road 7, Dhanmondi, Dhaka</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3 text-primary" /> Courier Rider
                  </p>
                  <p className="font-semibold text-foreground">Tariqul Islam (01822-***890)</p>
                  <p className="text-primary font-medium">Customer tracking SMS sent</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>Zero manual copy-pasting into courier portals</span>
              <button
                type="button"
                onClick={() => setActiveStep(3)}
                className="group inline-flex items-center gap-1 text-primary font-medium hover:underline"
              >
                View Ledger Settlement <ArrowRight className="size-3 transition-transform motion-safe:group-hover:translate-x-0.5" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Ledger Settle */}
        {activeStep === 3 && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                  Accounting & Inventory · Central Reconciliation
                </p>
                <h4 className="text-base font-semibold text-foreground mt-0.5">
                  Delivered & Ledger Closed
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automated Multi-Channel Stock Adjustment & P&L Entry
                </p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-fq-sm bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">
                  Settled
                </span>
                <p className="fq-display text-2xl font-bold mt-1 tabular-nums text-foreground">৳3,450</p>
              </div>
            </div>

            {/* Authentic Financial Reconciliation & Stock Ledger */}
            <div className="rounded-fq-md border border-border/70 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs pb-2 border-b border-border/50">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-primary" /> Multi-Channel Sync Confirmation
                </span>
                <span className="text-muted-foreground font-mono">Ref #TX-98214</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs text-center">
                <div className="rounded-fq-sm border border-border/60 bg-card/60 p-2.5">
                  <p className="text-muted-foreground">Central Stock</p>
                  <p className="font-semibold text-foreground mt-1 tabular-nums">43 → 42 units</p>
                </div>
                <div className="rounded-fq-sm border border-border/60 bg-card/60 p-2.5">
                  <p className="text-muted-foreground">Net Margin</p>
                  <p className="font-semibold text-foreground mt-1 tabular-nums">54.2%</p>
                </div>
                <div className="rounded-fq-sm border border-border/60 bg-card/60 p-2.5">
                  <p className="text-muted-foreground">COD Loss Risk</p>
                  <p className="font-semibold text-primary mt-1">৳0 (Pre-paid)</p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground rounded-fq-sm border border-border/40 bg-card/40 p-2.5">
                <div className="flex justify-between items-center">
                  <span>Storefront, Social DM & Dhanmondi POS:</span>
                  <span className="text-foreground font-medium">Synced in 12ms</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
              <span>One unified ledger from customer tap to bank account</span>
              <button
                type="button"
                onClick={() => setActiveStep(0)}
                className="group inline-flex items-center gap-1 text-primary font-medium hover:underline"
              >
                <RotateCcw className="size-3" /> Restart Demo Flow
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Progress Bar */}
        <div className="pt-2">
          <div className="h-1 w-full overflow-hidden rounded-full bg-border/50">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{ width: `${((activeStep + 1) / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

