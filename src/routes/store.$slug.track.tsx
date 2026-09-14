import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { trackParcelFn } from "@/lib/shipping.functions";

/**
 * Anonymous parcel tracking. The buyer holds an opaque token; the server
 * returns milestones only — no phone, no address, no order value.
 */
export const Route = createFileRoute("/store/$slug/track")({
  head: () => ({
    meta: [
      { title: "Track your parcel" },
      {
        name: "description",
        content: "Enter your tracking code to see live courier milestones for your delivery.",
      },
      { property: "og:title", content: "Track your parcel" },
      {
        property: "og:description",
        content: "Live courier milestones for your delivery, from pickup to doorstep.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackPage,
});

const LABELS: Record<string, string> = {
  created: "Order created",
  pickup_scheduled: "Pickup scheduled",
  picked_up: "Picked up",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed_attempt: "Delivery attempt failed",
  returned: "Returned to sender",
};

function TrackPage() {
  const [token, setToken] = useState("");
  const lookup = useMutation({ mutationFn: (value: string) => trackParcelFn({ data: { token: value } }) });

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 p-4">
      <h1 className="font-bangla-display text-xl font-semibold">Track your parcel</h1>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          lookup.mutate(token.trim());
        }}
      >
        <label className="flex-1 text-sm">
          Tracking code
          <input
            required
            minLength={8}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1 min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-fq-md bg-primary px-4 text-sm text-primary-foreground"
        >
          Track
        </button>
      </form>

      <div aria-live="polite" className="space-y-2">
        {lookup.isPending && <p className="text-sm text-muted-foreground">Checking with the courier…</p>}
        {lookup.data?.rateLimited && (
          <p className="text-sm">Too many lookups. Please wait a minute and try again.</p>
        )}
        {lookup.data && !lookup.data.found && !lookup.data.rateLimited && (
          <p className="text-sm">No parcel matches that code. Check the code from your order email.</p>
        )}
        {lookup.data?.found && (
          <section className="rounded-fq-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">
              {LABELS[lookup.data.parcel.status ?? ""] ?? lookup.data.parcel.status}
            </h2>
            <p className="text-xs text-muted-foreground">
              {lookup.data.parcel.carrier_code?.toUpperCase()}
              {lookup.data.parcel.city ? ` · ${lookup.data.parcel.city}` : ""}
            </p>
            <ol className="mt-3 space-y-2">
              {(lookup.data.parcel.events ?? []).map((event) => (
                <li key={`${event.status}-${event.occurred_at}`} className="text-sm">
                  <span className="font-medium">{LABELS[event.status] ?? event.status}</span>
                  <span className="block text-xs text-muted-foreground">
                    {new Date(event.occurred_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </main>
  );
}
