import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmtMinor } from "@/lib/money";
import { useLang } from "@/lib/i18n";
import { advanceShipmentFn, generateLabelFn, retryRateFn } from "@/lib/pos.functions";
import {
  cancelShipmentFn,
  deleteRuleFn,
  quoteShippingFn,
  replayCourierEventFn,
  reconcileCodFn,
  saveCarrierCredentialsFn,
  saveRuleFn,
  saveZoneFn,
  schedulePickupFn,
  setCarrierModeFn,
  shippingDeskFn,
} from "@/lib/shipping.functions";

export const Route = createFileRoute("/_authenticated/admin/shipping")({
  head: () => ({
    meta: [
      { title: "Shipping desk — Framique Admin" },
      {
        name: "description",
        content:
          "Delivery zones, weight-based rates, courier parcels, pickups, COD settlement and webhook health in one desk.",
      },
      { property: "og:title", content: "Shipping desk" },
      {
        property: "og:description",
        content: "Zones, rates, pickups, COD reconciliation and courier webhook health.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ShippingPage,
});

const STEPS: Record<string, { en: string; bn: string }> = {
  created: { en: "Created", bn: "তৈরি" },
  pickup_scheduled: { en: "Pickup scheduled", bn: "পিকআপ নির্ধারিত" },
  picked_up: { en: "Picked up", bn: "পিকআপ হয়েছে" },
  in_transit: { en: "In transit", bn: "ট্রানজিটে" },
  out_for_delivery: { en: "Out for delivery", bn: "ডেলিভারিতে" },
  delivered: { en: "Delivered", bn: "ডেলিভার হয়েছে" },
  failed_attempt: { en: "Failed attempt", bn: "ব্যর্থ চেষ্টা" },
  returned: { en: "Returned", bn: "ফেরত" },
};

const NEXT: Record<string, string[]> = {
  created: ["pickup_scheduled", "failed_attempt"],
  pickup_scheduled: ["picked_up", "failed_attempt"],
  picked_up: ["in_transit", "failed_attempt"],
  in_transit: ["out_for_delivery", "failed_attempt"],
  out_for_delivery: ["delivered", "failed_attempt"],
  failed_attempt: ["out_for_delivery", "returned"],
  delivered: [],
  returned: [],
};

type TabId = "parcels" | "rates" | "cod" | "carriers" | "health";

const TABS: { id: TabId; en: string; bn: string }[] = [
  { id: "parcels", en: "Parcels", bn: "পার্সেল" },
  { id: "rates", en: "Zones & rates", bn: "জোন ও রেট" },
  { id: "cod", en: "COD settlement", bn: "সিওডি নিষ্পত্তি" },
  { id: "carriers", en: "Couriers", bn: "কুরিয়ার" },
  { id: "health", en: "Webhook health", bn: "ওয়েবহুক হেলথ" },
];

const cardClass = "rounded-fq-lg border border-border bg-card p-4";
const btnClass = "min-h-11 rounded-fq-md border border-border px-3 text-sm";
const inputClass = "min-h-11 w-full rounded-fq-md border border-border bg-background px-3 text-sm";

function ShippingPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabId>("parcels");

  const { data, isLoading } = useQuery({
    queryKey: ["shipping-desk"],
    queryFn: () => shippingDeskFn(),
    refetchInterval: 60_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["shipping-desk"] });

  const stalled = (data?.shipments ?? []).filter(
    (s) =>
      !["delivered", "returned"].includes(s.status) &&
      Date.now() - new Date(s.last_event_at ?? s.created_at).getTime() > 72 * 3600 * 1000,
  ).length;
  const mismatches = (data?.cod ?? []).filter((c) => c.state === "mismatch").length;
  const dlqOpen = (data?.dlq ?? []).filter((e) => e.status === "dead_letter" || e.status === "rejected").length;

  return (
    <section className="space-y-4">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">
          {t("Shipping desk", "শিপিং ডেস্ক")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Zones and rates, courier parcels, pickups, COD settlement and webhook health.",
            "জোন ও রেট, কুরিয়ার পার্সেল, পিকআপ, সিওডি নিষ্পত্তি এবং ওয়েবহুক হেলথ।",
          )}
        </p>
      </header>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className={cardClass}>
          <dt className="text-xs text-muted-foreground">{t("Stalled parcels", "আটকে থাকা পার্সেল")}</dt>
          <dd className="money text-2xl font-semibold">{stalled}</dd>
        </div>
        <div className={cardClass}>
          <dt className="text-xs text-muted-foreground">{t("COD mismatches", "সিওডি গরমিল")}</dt>
          <dd className="money text-2xl font-semibold">{mismatches}</dd>
        </div>
        <div className={cardClass}>
          <dt className="text-xs text-muted-foreground">{t("Webhooks awaiting replay", "রিপ্লে অপেক্ষমাণ")}</dt>
          <dd className="money text-2xl font-semibold">{dlqOpen}</dd>
        </div>
      </dl>

      <div role="tablist" aria-label={t("Shipping sections", "শিপিং বিভাগ")} className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            type="button"
            id={`tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`panel-${item.id}`}
            onClick={() => setTab(item.id)}
            className={`${btnClass} ${
              tab === item.id ? "border-primary bg-primary text-primary-foreground" : ""
            }`}
          >
            {t(item.en, item.bn)}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t("Loading…", "লোড হচ্ছে…")}</p>}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="space-y-3">
        {tab === "parcels" && <ParcelsPanel data={data} refresh={refresh} />}
        {tab === "rates" && <RatesPanel data={data} refresh={refresh} />}
        {tab === "cod" && <CodPanel data={data} refresh={refresh} />}
        {tab === "carriers" && <CarriersPanel data={data} refresh={refresh} />}
        {tab === "health" && <HealthPanel data={data} refresh={refresh} />}
      </div>
    </section>
  );
}

type Desk = Awaited<ReturnType<typeof shippingDeskFn>> | undefined;
type PanelProps = { data: Desk; refresh: () => void };

function ParcelsPanel({ data, refresh }: PanelProps) {
  const { t } = useLang();
  const [filter, setFilter] = useState("all");
  const [signature, setSignature] = useState<Record<string, string>>({});
  const [pickup, setPickup] = useState<Record<string, string>>({});

  const fail = (e: Error) => toast.error(e.message);
  const advance = useMutation({
    mutationFn: (v: { shipmentId: string; target: string; signatureText?: string }) =>
      advanceShipmentFn({
        data: {
          shipmentId: v.shipmentId,
          target: v.target as "picked_up",
          signatureText: v.signatureText ?? null,
        },
      }),
    onSuccess: (res) => {
      toast.success(`${t("Status", "স্ট্যাটাস")}: ${STEPS[res.status]?.en ?? res.status}`);
      refresh();
    },
    onError: fail,
  });
  const retry = useMutation({
    mutationFn: (id: string) => retryRateFn({ data: { shipmentId: id } }),
    onSuccess: () => {
      toast.success(t("AWB booked", "এডব্লিউবি নেওয়া হয়েছে"));
      refresh();
    },
    onError: fail,
  });
  const label = useMutation({
    mutationFn: (id: string) => generateLabelFn({ data: { shipmentId: id } }),
    onSuccess: (res) => toast.success(`Label: ${res.label_url}`),
    onError: fail,
  });
  const schedule = useMutation({
    mutationFn: (v: { shipmentId: string; slotStart: string }) => schedulePickupFn({ data: v }),
    onSuccess: () => {
      toast.success(t("Pickup requested", "পিকআপ চাওয়া হয়েছে"));
      refresh();
    },
    onError: fail,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelShipmentFn({ data: { shipmentId: id } }),
    onSuccess: () => {
      toast.success(t("Shipment cancelled", "শিপমেন্ট বাতিল"));
      refresh();
    },
    onError: fail,
  });

  const rows = (data?.shipments ?? []).filter(
    (s) => filter === "all" || s.carrier_code === filter,
  );

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
          className={`${btnClass} ${filter === "all" ? "border-primary bg-primary text-primary-foreground" : ""}`}
        >
          {t("All", "সব")}
        </button>
        {(data?.carriers ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.code}
            onClick={() => setFilter(c.code)}
            className={`${btnClass} ${
              filter === c.code ? "border-primary bg-primary text-primary-foreground" : ""
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("No parcels yet.", "এখনও কোনো পার্সেল নেই।")}</p>
      )}

      <ul className="space-y-3">
        {rows.map((s) => (
          <li key={s.id} className={cardClass}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {s.carrier_code.toUpperCase()} ·{" "}
                  <span className="money">{s.awb ?? t("AWB pending", "এডব্লিউবি বাকি")}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(STEPS[s.status]?.en ?? s.status, STEPS[s.status]?.bn ?? s.status)} ·{" "}
                  {t("Rate", "রেট")} <span className="money">{fmtMinor(Number(s.rate_minor_int))}</span>
                  {s.quote_stale && ` · ${t("fallback rate", "ফলব্যাক রেট")}`}
                  {s.is_cod && (
                    <>
                      {" "}
                      · COD <span className="money">{fmtMinor(Number(s.cod_amount_minor_int))}</span>
                    </>
                  )}
                  {s.attempt_count > 0 && ` · ${t("attempts", "চেষ্টা")} ${s.attempt_count}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!s.awb && (
                  <button type="button" onClick={() => retry.mutate(s.id)} className={btnClass}>
                    {t("Book AWB", "এডব্লিউবি নিন")}
                  </button>
                )}
                {s.awb && (
                  <button type="button" onClick={() => label.mutate(s.id)} className={btnClass}>
                    {t("Label", "লেবেল")}
                  </button>
                )}
                {s.tracking_url && (
                  <a
                    href={s.tracking_url}
                    target="_blank"
                    rel="noreferrer"
                    className={`${btnClass} flex items-center`}
                  >
                    {t("Track", "ট্র্যাক")}
                  </a>
                )}
                {!["delivered", "returned"].includes(s.status) && !s.cancelled_at && (
                  <button type="button" onClick={() => cancel.mutate(s.id)} className={btnClass}>
                    {t("Cancel", "বাতিল")}
                  </button>
                )}
              </div>
            </div>

            {s.awb && !s.pickup_slot_start && (
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs text-muted-foreground">
                  {t("Pickup slot", "পিকআপ সময়")}
                  <input
                    type="datetime-local"
                    value={pickup[s.id] ?? ""}
                    onChange={(e) => setPickup((p) => ({ ...p, [s.id]: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <button
                  type="button"
                  className={btnClass}
                  onClick={() =>
                    schedule.mutate({
                      shipmentId: s.id,
                      slotStart: new Date(pickup[s.id] ?? "").toISOString(),
                    })
                  }
                  disabled={!pickup[s.id]}
                >
                  {t("Request pickup", "পিকআপ চান")}
                </button>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-end gap-2">
              {s.is_cod && NEXT[s.status]?.includes("delivered") && (
                <label className="text-xs text-muted-foreground">
                  {t("Signature (COD)", "স্বাক্ষর (COD)")}
                  <input
                    value={signature[s.id] ?? ""}
                    onChange={(e) => setSignature((p) => ({ ...p, [s.id]: e.target.value }))}
                    className={`${inputClass} mt-1`}
                  />
                </label>
              )}
              {(NEXT[s.status] ?? []).map((target) => (
                <button
                  key={target}
                  type="button"
                  className={btnClass}
                  onClick={() =>
                    advance.mutate({
                      shipmentId: s.id,
                      target,
                      signatureText: signature[s.id],
                    })
                  }
                >
                  {t(STEPS[target]?.en ?? target, STEPS[target]?.bn ?? target)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function RatesPanel({ data, refresh }: PanelProps) {
  const { t } = useLang();
  const zones = data?.zones ?? [];
  const rules = data?.rules ?? [];
  const [draft, setDraft] = useState({
    zoneId: "",
    base: "80",
    perKg: "30",
    codBp: "100",
    freeOver: "",
  });
  const [preview, setPreview] = useState<{ total: number; zone: string | null } | null>(null);
  const [probe, setProbe] = useState({ city: "Dhaka", weight: "1200", cod: "150000" });

  const saveRule = useMutation({
    mutationFn: () =>
      saveRuleFn({
        data: {
          zoneId: draft.zoneId,
          carrierCode: null,
          minWeightGrams: 0,
          maxWeightGrams: 30_000,
          baseMinorInt: Math.round(Number(draft.base) * 100),
          perKgMinorInt: Math.round(Number(draft.perKg) * 100),
          codFeeBp: Number(draft.codBp),
          freeOverMinorInt: draft.freeOver ? Math.round(Number(draft.freeOver) * 100) : null,
          enabled: true,
          priority: 50,
        },
      }),
    onSuccess: () => {
      toast.success(t("Rate rule saved", "রেট নিয়ম সংরক্ষিত"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (ruleId: string) => deleteRuleFn({ data: { ruleId } }),
    onSuccess: () => {
      toast.success(t("Rule removed", "নিয়ম মোছা হয়েছে"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleZone = useMutation({
    mutationFn: (z: (typeof zones)[number]) =>
      saveZoneFn({
        data: {
          id: z.id,
          code: z.code,
          nameEn: z.name_en,
          nameBn: z.name_bn,
          districts: z.districts ?? [],
          isDefault: z.is_default,
          enabled: !z.enabled,
          priority: z.priority,
        },
      }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const runQuote = useMutation({
    mutationFn: () =>
      quoteShippingFn({
        data: {
          carrierCode: data?.carriers?.[0]?.code ?? "steadfast",
          city: probe.city,
          weightGrams: Number(probe.weight),
          isCod: true,
          codAmountMinorInt: Number(probe.cod),
          orderTotalMinorInt: Number(probe.cod),
        },
      }),
    onSuccess: (res) => setPreview({ total: res.totalMinorInt, zone: res.zoneCode }),
    onError: (e: Error) => toast.error(e.message),
  });

  const zoneName = useMemo(
    () => Object.fromEntries(zones.map((z) => [z.id, z.name_en])),
    [zones],
  );

  return (
    <>
      <div className={cardClass}>
        <h2 className="text-sm font-semibold">{t("Rate calculator", "রেট ক্যালকুলেটর")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-muted-foreground">
            {t("District", "জেলা")}
            <input
              value={probe.city}
              onChange={(e) => setProbe((p) => ({ ...p, city: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Weight (g)", "ওজন (গ্রাম)")}
            <input
              inputMode="numeric"
              value={probe.weight}
              onChange={(e) => setProbe((p) => ({ ...p, weight: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("COD amount (paisa)", "সিওডি (পয়সা)")}
            <input
              inputMode="numeric"
              value={probe.cod}
              onChange={(e) => setProbe((p) => ({ ...p, cod: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <button type="button" className={`${btnClass} self-end`} onClick={() => runQuote.mutate()}>
            {t("Preview", "প্রিভিউ")}
          </button>
        </div>
        <p aria-live="polite" className="mt-2 text-sm">
          {preview
            ? `${preview.zone ?? "—"} · ${fmtMinor(preview.total)}`
            : t("Run a preview to see the buyer price.", "ক্রেতার মূল্য দেখতে প্রিভিউ চালান।")}
        </p>
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold">{t("Zones", "জোন")}</h2>
        <ul className="mt-2 space-y-2">
          {zones.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {z.name_en}
                {z.is_default && ` · ${t("default", "ডিফল্ট")}`}
                <span className="block text-xs text-muted-foreground">
                  {(z.districts ?? []).join(", ") || t("Everywhere else", "বাকি সব")}
                </span>
              </span>
              <button
                type="button"
                className={btnClass}
                aria-pressed={z.enabled}
                onClick={() => toggleZone.mutate(z)}
              >
                {z.enabled ? t("Enabled", "চালু") : t("Disabled", "বন্ধ")}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={cardClass}>
        <h2 className="text-sm font-semibold">{t("Weight rules", "ওজন নিয়ম")}</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {rules.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {zoneName[r.zone_id] ?? r.zone_id} · {r.min_weight_grams}–{r.max_weight_grams}g ·{" "}
                <span className="money">{fmtMinor(r.base_minor_int)}</span> +{" "}
                <span className="money">{fmtMinor(r.per_kg_minor_int)}</span>/kg · COD{" "}
                {(r.cod_fee_bp / 100).toFixed(2)}%
                {r.free_over_minor_int !== null && (
                  <> · {t("free over", "ফ্রি")} <span className="money">{fmtMinor(r.free_over_minor_int)}</span></>
                )}
              </span>
              <button type="button" className={btnClass} onClick={() => remove.mutate(r.id)}>
                {t("Remove", "মুছুন")}
              </button>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 grid gap-3 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            saveRule.mutate();
          }}
        >
          <label className="text-xs text-muted-foreground">
            {t("Zone", "জোন")}
            <select
              required
              value={draft.zoneId}
              onChange={(e) => setDraft((d) => ({ ...d, zoneId: e.target.value }))}
              className={`${inputClass} mt-1`}
            >
              <option value="">{t("Select", "নির্বাচন")}</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name_en}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Base (BDT)", "বেস (টাকা)")}
            <input
              inputMode="decimal"
              value={draft.base}
              onChange={(e) => setDraft((d) => ({ ...d, base: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Per extra kg", "প্রতি অতিরিক্ত কেজি")}
            <input
              inputMode="decimal"
              value={draft.perKg}
              onChange={(e) => setDraft((d) => ({ ...d, perKg: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("COD fee (bp)", "সিওডি ফি (bp)")}
            <input
              inputMode="numeric"
              value={draft.codBp}
              onChange={(e) => setDraft((d) => ({ ...d, codBp: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            {t("Free over (BDT)", "ফ্রি হবে (টাকা)")}
            <input
              inputMode="decimal"
              value={draft.freeOver}
              onChange={(e) => setDraft((d) => ({ ...d, freeOver: e.target.value }))}
              className={`${inputClass} mt-1`}
            />
          </label>
          <button type="submit" className={`${btnClass} sm:col-span-5`}>
            {t("Save rule", "নিয়ম সংরক্ষণ")}
          </button>
        </form>
      </div>
    </>
  );
}

function CodPanel({ data, refresh }: PanelProps) {
  const { t } = useLang();
  const [amount, setAmount] = useState<Record<string, string>>({});
  const [reference, setReference] = useState<Record<string, string>>({});

  const reconcile = useMutation({
    mutationFn: (v: { shipmentId: string; reportedMinorInt: number; reference: string | null }) =>
      reconcileCodFn({ data: v }),
    onSuccess: (res) => {
      const state = (res as { state?: string }).state ?? "updated";
      if (state === "mismatch") toast.warning(t("Mismatch — needs review", "গরমিল — পর্যালোচনা দরকার"));
      else toast.success(t("COD settled", "সিওডি নিষ্পত্তি"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data?.cod ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("No COD parcels awaiting remittance.", "কোনো সিওডি পার্সেল বাকি নেই।")}</p>;
  }

  return (
    <ul className="space-y-3">
      {rows.map((c) => (
        <li key={c.id} className={cardClass}>
          <p className="text-sm font-medium">
            {c.carrier_code.toUpperCase()} · {t("Expected", "প্রত্যাশিত")}{" "}
            <span className="money">{fmtMinor(c.expected_minor_int)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t("State", "অবস্থা")}: {c.state}
            {c.reported_minor_int !== null && (
              <>
                {" "}
                · {t("Reported", "জমা")} <span className="money">{fmtMinor(c.reported_minor_int)}</span>
              </>
            )}
          </p>
          {c.state !== "settled" && (
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                reconcile.mutate({
                  shipmentId: c.shipment_id,
                  reportedMinorInt: Math.round(Number(amount[c.id] ?? "0") * 100),
                  reference: reference[c.id] ?? null,
                });
              }}
            >
              <label className="text-xs text-muted-foreground">
                {t("Remitted (BDT)", "জমা (টাকা)")}
                <input
                  required
                  inputMode="decimal"
                  value={amount[c.id] ?? ""}
                  onChange={(e) => setAmount((p) => ({ ...p, [c.id]: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                {t("Reference", "রেফারেন্স")}
                <input
                  value={reference[c.id] ?? ""}
                  onChange={(e) => setReference((p) => ({ ...p, [c.id]: e.target.value }))}
                  className={`${inputClass} mt-1`}
                />
              </label>
              <button type="submit" className={btnClass}>
                {t("Reconcile", "মিলান")}
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

const CARRIER_FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  steadfast: [
    { key: "apiKey", label: "API Key" },
    { key: "secretKey", label: "Secret Key", type: "password" },
  ],
  pathao: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password" },
    { key: "username", label: "Username / Email" },
    { key: "password", label: "Password", type: "password" },
  ],
  redx: [
    { key: "apiToken", label: "API Access Token", type: "password" },
  ],
  paperfly: [
    { key: "username", label: "Username" },
    { key: "password", label: "Password", type: "password" },
    { key: "key", label: "Paperfly Key", type: "password" },
  ],
};

function CarriersPanel({ data, refresh }: PanelProps) {
  const { t } = useLang();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [credentialsDraft, setCredentialsDraft] = useState<Record<string, Record<string, string>>>({});
  const [baseUrlDraft, setBaseUrlDraft] = useState<Record<string, string>>({});

  const mode = useMutation({
    mutationFn: (v: { carrierId: string; enabled?: boolean; apiMode?: "mock" | "sandbox" | "live" }) =>
      setCarrierModeFn({ data: v }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCreds = useMutation({
    mutationFn: (v: { carrierId: string; credentials: Record<string, unknown>; baseUrl?: string | null }) =>
      saveCarrierCredentialsFn({ data: v }),
    onSuccess: () => {
      toast.success(t("Courier credentials saved and sealed at rest.", "কুরিয়ার ক্রেডেনশিয়াল নিরাপদে সংরক্ষিত হয়েছে।"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <ul className="space-y-3">
      {(data?.carriers ?? []).map((c) => {
        const config = (c.config && typeof c.config === "object" ? c.config : {}) as Record<string, unknown>;
        const hints = (config["credentialHints"] ?? {}) as Record<string, string>;
        const fields = CARRIER_FIELDS[c.code] ?? [
          { key: "apiKey", label: "API Key" },
          { key: "secretKey", label: "Secret Key", type: "password" },
        ];
        const isExpanded = expandedId === c.id;

        return (
          <li key={c.id} className={`${cardClass} space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("Mode", "মোড")}: {c.api_mode} · {t("Circuit", "সার্কিট")}: {c.breaker} ·{" "}
                  {c.supports_pickup ? t("pickup", "পিকআপ") : t("drop-off", "ড্রপ-অফ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted-foreground">
                  <span className="sr-only">{t("API mode", "এপিআই মোড")}</span>
                  <select
                    value={c.api_mode}
                    onChange={(e) =>
                      mode.mutate({
                        carrierId: c.id,
                        apiMode: e.target.value as "mock" | "sandbox" | "live",
                      })
                    }
                    className={inputClass}
                  >
                    <option value="mock">mock</option>
                    <option value="sandbox">sandbox</option>
                    <option value="live">live</option>
                  </select>
                </label>
                <button
                  type="button"
                  aria-pressed={c.enabled}
                  className={btnClass}
                  onClick={() => mode.mutate({ carrierId: c.id, enabled: !c.enabled })}
                >
                  {c.enabled ? t("Enabled", "চালু") : t("Disabled", "বন্ধ")}
                </button>
                <button
                  type="button"
                  className={`${btnClass} ${isExpanded ? "bg-muted font-medium" : ""}`}
                  onClick={() => setExpandedId(isExpanded ? null : c.id)}
                >
                  {isExpanded ? t("Close", "বন্ধ") : t("Configure keys", "কী কনফিগার")}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="mt-3 border-t border-border pt-3 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t("Carrier Live API Credentials", "কুরিয়ার লাইভ এপিআই ক্রেডেনশিয়াল")}
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    {t("Encrypted at rest with AES-GCM", "AES-GCM এনক্রিপশনে সুরক্ষিত")}
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {fields.map((f) => (
                    <label key={f.key} className="space-y-1 text-xs">
                      <span className="block font-medium">
                        {f.label}
                        {hints[f.key] && (
                          <span className="ml-1 text-muted-foreground font-normal">
                            ({t("current", "বর্তমান")}: {hints[f.key]})
                          </span>
                        )}
                      </span>
                      <input
                        type={f.type ?? "text"}
                        autoComplete="off"
                        placeholder={hints[f.key] ? t("Enter new to replace", "নতুন মান দিন") : `Enter ${f.label}`}
                        value={credentialsDraft[c.id]?.[f.key] ?? ""}
                        onChange={(e) =>
                          setCredentialsDraft((prev) => ({
                            ...prev,
                            [c.id]: {
                              ...(prev[c.id] ?? {}),
                              [f.key]: e.target.value,
                            },
                          }))
                        }
                        className={inputClass}
                      />
                    </label>
                  ))}
                  <label className="space-y-1 text-xs">
                    <span className="block font-medium">
                      {t("Custom Base URL (optional)", "কাস্টম বেস ইউআরএল (ঐচ্ছিক)")}
                    </span>
                    <input
                      type="url"
                      placeholder={(config["baseUrl"] as string) || "https://..."}
                      value={baseUrlDraft[c.id] ?? ""}
                      onChange={(e) =>
                        setBaseUrlDraft((prev) => ({
                          ...prev,
                          [c.id]: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </label>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={saveCreds.isPending}
                    onClick={() => {
                      const creds = credentialsDraft[c.id] ?? {};
                      const baseUrl = baseUrlDraft[c.id] || (config["baseUrl"] as string) || null;
                      if (Object.keys(creds).length === 0) {
                        toast.error(t("Enter at least one credential to update.", "অন্তত একটি ক্রেডেনশিয়াল দিন।"));
                        return;
                      }
                      saveCreds.mutate({ carrierId: c.id, credentials: creds, baseUrl });
                    }}
                    className={`${btnClass} bg-primary text-primary-foreground hover:bg-primary/90`}
                  >
                    {saveCreds.isPending ? t("Saving…", "সেভ হচ্ছে…") : t("Save credentials", "ক্রেডেনশিয়াল সেভ")}
                  </button>
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function HealthPanel({ data, refresh }: PanelProps) {
  const { t } = useLang();
  const rows = data?.dlq ?? [];

  const replay = useMutation({
    mutationFn: (eventId: string) => replayCourierEventFn({ data: { eventId } }),
    onSuccess: (res) => {
      const outcome = (res as { outcome?: string }).outcome ?? "unknown";
      if (outcome === "processed" || outcome === "replayed") {
        toast.success(t("Event replayed", "ইভেন্ট রিপ্লে হয়েছে"));
      } else {
        toast.warning(`${t("Not applied", "প্রয়োগ হয়নি")}: ${outcome}`);
      }
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("No webhook failures in the last window.", "সাম্প্রতিক সময়ে কোনো ওয়েবহুক ব্যর্থতা নেই।")}
      </p>
    );
  }
  return (
    <table className="w-full text-left text-sm">
      <caption className="sr-only">{t("Courier webhook events", "কুরিয়ার ওয়েবহুক ইভেন্ট")}</caption>
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th scope="col" className="py-2">{t("Courier", "কুরিয়ার")}</th>
          <th scope="col">{t("Status", "স্ট্যাটাস")}</th>
          <th scope="col">{t("Attempts", "চেষ্টা")}</th>
          <th scope="col">{t("Reason", "কারণ")}</th>
          <th scope="col">{t("Action", "অ্যাকশন")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const replayable = e.status === "dead_letter" || e.status === "rejected";
          return (
            <tr key={e.id} className="border-t border-border">
              <td className="py-2">{e.carrier_code}</td>
              <td>{e.status}</td>
              <td className="money">{e.attempts}</td>
              <td className="text-xs text-muted-foreground">{e.reason ?? "—"}</td>
              <td>
                {replayable ? (
                  <button
                    type="button"
                    disabled={replay.isPending}
                    onClick={() => replay.mutate(e.id)}
                    className="inline-flex min-h-8 items-center rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                  >
                    {t("Replay", "রিপ্লে")}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

