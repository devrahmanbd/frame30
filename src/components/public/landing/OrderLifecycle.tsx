/**
 * OrderLifecycle — the product panel that carries the hero and the pinned
 * scene. It is a faithful reconstruction of the one screen the product is
 * actually about: an order drawer where money and the parcel move together.
 *
 * No invented metrics: every value shown is either structural (rail names,
 * courier names, statuses the product really has) or an illustrative amount
 * labelled as a sample order.
 */
import { cn } from "@/lib/utils";

export type LifecycleStep = 0 | 1 | 2 | 3;

export const LIFECYCLE_STEPS = [
  {
    id: "placed",
    index: "01",
    label: "Order placed",
    title: "One order record, from the first tap",
    body: "The storefront writes a single order — items, Bangla address, phone, rail choice. Nothing is re-keyed into a second system after this point.",
  },
  {
    id: "paid",
    index: "02",
    label: "Payment captured",
    title: "bKash, Nagad, card or COD — same ledger line",
    body: "The rail is attached to the order, not to a separate payments inbox, so settlement can be matched back to the exact order it came from.",
  },
  {
    id: "booked",
    index: "03",
    label: "Courier booked",
    title: "Pickup and label, inside the order",
    body: "SteadFast, Pathao, RedX or Paperfly is booked from the drawer and the label prints from the same screen. No courier portal, no copy-pasted address.",
  },
  {
    id: "settled",
    index: "04",
    label: "Settled",
    title: "Delivery and cash close the same record",
    body: "COD collected or gateway settled, the order closes against inventory and revenue — so the month-end number is the ledger, not a merged spreadsheet.",
  },
] as const;

const RAILS = ["bKash", "Nagad", "Card", "COD"] as const;

function Row({
  k,
  v,
  active,
  mono,
}: {
  k: string;
  v: string;
  active?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border py-2.5 text-sm first:border-t-0">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={cn(
          "text-right",
          mono && "tabular-nums",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {v}
      </span>
    </div>
  );
}

export function OrderLifecycle({ step, className }: { step: LifecycleStep; className?: string }) {
  return (
    <div
      className={cn(
        "fq-edge-light rounded-fq-lg bg-card/80 backdrop-blur-md",
        "shadow-lift",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <p className="fq-index">ORDER · FQ-10428 · SAMPLE</p>
        <span
          className={cn(
            "rounded-fq-sm px-2 py-1 text-[11px] font-medium tracking-wide",
            step === 3 ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
          )}
        >
          {LIFECYCLE_STEPS[step].label}
        </span>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="fq-index">CUSTOMER</p>
            <p className="truncate text-base">Farhana R. · Mirpur DOHS, Dhaka</p>
          </div>
 <p className="fq-display shrink-0 text-3xl tabular-nums"> BDT 2,450</p>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-1.5" aria-hidden="true">
          {RAILS.map((rail, i) => (
            <div
              key={rail}
              className={cn(
                "rounded-fq-sm border px-2 py-1.5 text-center text-[11px] transition-colors duration-500",
                step >= 1 && i === 0
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground",
              )}
            >
              {rail}
            </div>
          ))}
        </div>

        <div className="mt-5">
          <Row k="Payment" v={step >= 1 ? "bKash · captured" : "Awaiting rail"} active={step >= 1} />
          <Row
            k="Courier"
            v={step >= 2 ? "SteadFast · pickup booked" : "Not booked"}
            active={step >= 2}
          />
          <Row k="Label" v={step >= 2 ? "Printed" : "—"} active={step >= 2} mono />
          <Row
            k="Ledger"
            v={step >= 3 ? "Closed · inventory + revenue" : "Open"}
            active={step >= 3}
          />
        </div>

        <div className="mt-5 h-px w-full overflow-hidden bg-border">
          <div
            className="h-px bg-foreground transition-[width] duration-700 ease-out"
            style={{ width: `${((step + 1) / 4) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}