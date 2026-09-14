import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useCustomerAccount, useCustomerTracking } from "@/hooks/use-customer";
import { trackParcelFn } from "@/lib/shipping.functions";
import { useLang } from "@/lib/i18n";
import { EmptyState, InlineError, PageHeader, TableSkeleton } from "@/components/console/primitives";
import { CheckCircle2, Clock, MapPin, Package, Search, Truck, AlertCircle, ArrowRight } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/dashboard/track")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Track a shipment — Framique" },
      { name: "description", content: "Follow your parcel from dispatch to delivery." },
      { property: "og:title", content: "Track a shipment — Framique" },
      { property: "og:description", content: "Follow your parcel from dispatch to delivery." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TrackPage,
});

const CARRIER_LABELS: Record<string, { name: string; color: string; badge: string }> = {
  steadfast: { name: "SteadFast Courier", color: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800", badge: "SF" },
  pathao: { name: "Pathao Courier", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800", badge: "PT" },
  redx: { name: "RedX Logistics", color: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800", badge: "RX" },
  paperfly: { name: "Paperfly", color: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800", badge: "PF" },
};

const CHECKPOINT_STEPS = [
  { key: "created", en: "Order Placed", bn: "অর্ডার গৃহীত" },
  { key: "picked_up", en: "Picked Up", bn: "পিকআপ সম্পন্ন" },
  { key: "in_transit", en: "In Transit", bn: "পথে আছে" },
  { key: "out_for_delivery", en: "Out for Delivery", bn: "ডেলিভারির পথে" },
  { key: "delivered", en: "Delivered", bn: "ডেলিভারি সম্পন্ন" },
] as const;

function getStepIndex(status: string | undefined): number {
  switch (status) {
    case "created":
    case "pickup_scheduled":
      return 0;
    case "picked_up":
      return 1;
    case "in_transit":
      return 2;
    case "out_for_delivery":
      return 3;
    case "delivered":
      return 4;
    default:
      return 1;
  }
}

function TrackPage() {
  const { t } = useLang();
  const { code: initialCode } = Route.useSearch();
  const { data: account } = useCustomerAccount();
  const trackingData = useCustomerTracking(Boolean(account?.id));
  const [code, setCode] = useState(initialCode ?? "");

  const lookup = useMutation({
    mutationFn: (trackingCode: string) => trackParcelFn({ data: { token: trackingCode } }),
  });

  useEffect(() => {
    if (initialCode && initialCode.trim().length >= 6) {
      lookup.mutate(initialCode.trim());
    }
  }, [initialCode]);

  const parcels = trackingData.data?.parcels ?? [];

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim();
    if (clean) {
      lookup.mutate(clean);
    }
  };

  const handleSelectParcel = (trackingTokenOrAwb: string) => {
    setCode(trackingTokenOrAwb);
    lookup.mutate(trackingTokenOrAwb);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Track a shipment", "শিপমেন্ট ট্র্যাক")}
        description={t(
          "Follow your parcel from dispatch to delivery across partner couriers.",
          "অর্ডার প্রেরণের পর থেকে ডেলিভারি পর্যন্ত পার্সেলের অবস্থান জানুন।",
        )}
      />

      {/* Tracking Input Card */}
      <div className="rounded-fq-xl border border-border bg-card p-4 sm:p-6 shadow-sm">
        <form className="flex flex-col sm:flex-row gap-3" onSubmit={handleTrackSubmit}>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("Enter tracking token or courier AWB (e.g. SF-923841)", "ট্র্যাকিং কোড বা AWB নম্বর লিখুন")}
              className="w-full rounded-fq-md border border-border bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              aria-label={t("Tracking code", "ট্র্যাকিং কোড")}
            />
          </div>
          <button
            type="submit"
            disabled={lookup.isPending || !code.trim()}
            className="inline-flex items-center justify-center rounded-fq-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {lookup.isPending ? t("Searching…", "অনুসন্ধান চলছে…") : t("Track Parcel", "ট্র্যাক করুন")}
          </button>
        </form>

        {/* Carrier Logos / Badges */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border/60 text-xs text-muted-foreground">
          <span className="font-medium">{t("Integrated couriers:", "সংযুক্ত কুরিয়ার:")}</span>
          {Object.entries(CARRIER_LABELS).map(([key, info]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${info.color}`}
            >
              <span className="font-mono text-[10px] font-bold">{info.badge}</span>
              {info.name}
            </span>
          ))}
        </div>
      </div>

      {/* Lookup Results State */}
      {lookup.isPending && (
        <div className="rounded-fq-xl border border-border bg-card p-6">
          <TableSkeleton rows={3} cols={2} />
        </div>
      )}

      {lookup.data?.rateLimited && (
        <div className="rounded-fq-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <h3 className="font-medium text-sm">{t("Rate limit exceeded", "অনুসন্ধান সীমা অতিক্রান্ত")}</h3>
            <p className="text-xs mt-0.5">
              {t("Too many lookup requests. Please wait a minute and try again.", "অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।")}
            </p>
          </div>
        </div>
      )}

      {lookup.data && !lookup.data.found && !lookup.data.rateLimited && (
        <div className="rounded-fq-xl border border-border bg-card p-6 text-center">
          <Package className="mx-auto h-8 w-8 text-muted-foreground opacity-60 mb-2" />
          <h3 className="text-sm font-semibold">{t("Parcel not found", "পার্সেল পাওয়া যায়নি")}</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {t(
              "No shipment matches that tracking code. Double check the code sent in your confirmation SMS or dispatch notification.",
              "ট্র্যাকিং কোডটি সঠিক কিনা যাচাই করুন। আপনার অর্ডার এসএমএস বা ইমেইলে প্রেরিত কোডটি ব্যবহার করুন।",
            )}
          </p>
        </div>
      )}

      {/* Live Parcel Tracking View */}
      {lookup.data?.found && lookup.data.parcel && (
        <div className="rounded-fq-xl border border-border bg-card p-5 sm:p-6 shadow-sm space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-muted-foreground">
                  {lookup.data.parcel.carrier_code ?? "Courier"}
                </span>
                {lookup.data.parcel.city && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {lookup.data.parcel.city}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold mt-0.5 capitalize">
                {lookup.data.parcel.status?.replace(/_/g, " ") ?? "In Transit"}
              </h2>
            </div>
            {lookup.data.parcel.last_event_at && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {t("Updated:", "আপডেট:")} {new Date(lookup.data.parcel.last_event_at).toLocaleString()}
              </span>
            )}
          </div>

          {/* Stepper Progress */}
          {(() => {
            const parcel = lookup.data.parcel;
            const currentIdx = getStepIndex(parcel.status);
            return (
              <div className="relative py-4">
                <div className="hidden sm:flex items-center justify-between relative">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-muted -z-0" />
                  <div
                    className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-primary transition-all duration-500 -z-0"
                    style={{
                      width: `${(currentIdx / (CHECKPOINT_STEPS.length - 1)) * 100}%`,
                    }}
                  />
                  {CHECKPOINT_STEPS.map((step, idx) => {
                    const isPassed = idx <= currentIdx;
                    const isCurrent = idx === currentIdx;
                    return (
                      <div key={step.key} className="flex flex-col items-center bg-card px-2 z-10">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all ${
                            isPassed
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted text-muted-foreground border-border"
                          } ${isCurrent ? "ring-4 ring-primary/20" : ""}`}
                        >
                          {isPassed ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                        </div>
                        <span
                          className={`text-xs mt-2 font-medium ${
                            isCurrent
                              ? "text-primary font-semibold"
                              : isPassed
                                ? "text-foreground"
                                : "text-muted-foreground"
                          }`}
                        >
                          {t(step.en, step.bn)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Timeline Events */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              {t("Delivery Milestones", "ডেলিভারি মাইলস্টোন")}
            </h3>
            {lookup.data.parcel.events && lookup.data.parcel.events.length > 0 ? (
              <ol className="relative border-l border-border/80 ml-3 space-y-4">
                {lookup.data.parcel.events.map((ev, i) => (
                  <li key={`${ev.status}-${i}`} className="ml-5">
                    <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    <p className="text-sm font-medium capitalize">{ev.status.replace(/_/g, " ")}</p>
                    <time className="text-xs text-muted-foreground block mt-0.5">
                      {new Date(ev.occurred_at).toLocaleString()}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("Parcel is registered with courier and awaiting first hub scan.", "পার্সেলটি কুরিয়ারে বুক করা হয়েছে, হাব স্ক্যানের অপেক্ষায়।")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Shopper's Active Shipments List */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold">
          {t("Your Recent Shipments", "আপনার সাম্প্রতিক শিপমেন্ট")}
        </h2>

        {trackingData.isPending ? (
          <TableSkeleton rows={2} cols={3} />
        ) : trackingData.isError ? (
          <InlineError
            message={t("Could not load your shipments.", "শিপমেন্ট লোড করা যায়নি।")}
            onRetry={() => void trackingData.refetch()}
          />
        ) : parcels.length === 0 ? (
          <EmptyState
            title={t("No active shipments", "কোনো সক্রিয় শিপমেন্ট নেই")}
            description={t(
              "When your orders are shipped, they will automatically appear here with tracking numbers.",
              "আপনার অর্ডার কুরিয়ারে হস্তান্তর করা হলে স্বয়ংক্রিয়ভাবে এখানে ট্র্যাকিং নম্বর সহ প্রদর্শিত হবে।",
            )}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {parcels.map((p) => {
              const carrier = CARRIER_LABELS[p.carrierCode.toLowerCase()] ?? {
                name: p.carrierCode.toUpperCase(),
                color: "bg-muted text-foreground border-border",
                badge: p.carrierCode.slice(0, 2).toUpperCase(),
              };
              const trackId = p.awb ?? p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelectParcel(trackId)}
                  className="group cursor-pointer rounded-fq-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${carrier.color}`}>
                        {carrier.name}
                      </span>
                      <p className="text-sm font-semibold mt-2 font-mono">{p.awb ?? p.id.slice(0, 13)}</p>
                      {p.orderNumber && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {t("Order", "অর্ডার")}: #{p.orderNumber}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-medium capitalize text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                      {p.status.replace(/_/g, " ")}
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
