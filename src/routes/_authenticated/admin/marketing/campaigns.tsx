import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { retrySendFn, sendCampaignFn } from "@/lib/marketing.functions";
import { useLang } from "@/lib/i18n";
import {
  ErrorFrame,
  Field,
  StatusPill,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/admin/MarketingUi";

export const Route = createFileRoute("/_authenticated/admin/marketing/campaigns")({
  head: () => ({
    meta: [
      { title: "Campaigns — Framique Marketing" },
      {
        name: "description",
        content: "Draft, schedule and send segmented email campaigns with delivery logs.",
      },
      { property: "og:title", content: "Campaign management" },
      {
        property: "og:description",
        content: "Segmented sends with per-recipient delivery status and retry.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignsPage,
});

const statusTone = {
  draft: "warning",
  scheduled: "info",
  sending: "info",
  sent: "success",
  failed: "danger",
} as const;
const statusLabel: Record<string, { en: string; bn: string }> = {
  draft: { en: "Draft", bn: "খসড়া" },
  scheduled: { en: "Scheduled", bn: "নির্ধারিত" },
  sending: { en: "Sending", bn: "পাঠানো হচ্ছে" },
  sent: { en: "Sent", bn: "পাঠানো হয়েছে" },
  failed: { en: "Failed", bn: "ব্যর্থ" },
};

const emptyForm = {
  id: undefined as string | undefined,
  name: "",
  segmentId: "",
  subject: "",
  bodyTemplate: "",
  scheduledFor: "",
};

function CampaignsPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const merchantId = merchant?.id;
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("campaigns")
        .select("*")
        .eq("merchant_id", merchantId!)
        .order("created_at", { ascending: false });
      if (e) throw e;
      return data;
    },
  });

  const { data: segments } = useQuery({
    queryKey: ["segments", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("segments")
        .select("id, name")
        .eq("merchant_id", merchantId!)
        .order("name");
      if (e) throw e;
      return data;
    },
  });

  const { data: sends } = useQuery({
    queryKey: ["campaign-sends", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("campaign_sends")
        .select("id, email, status, error, sent_at")
        .eq("campaign_id", openId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (e) throw e;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim() || !form.subject.trim() || !form.bodyTemplate.trim()) {
        throw new Error("Name, subject and body are required");
      }
      const row = {
        merchant_id: merchantId!,
        name: form.name.trim(),
        segment_id: form.segmentId || null,
        subject: form.subject.trim(),
        body_template: form.bodyTemplate,
        scheduled_for: form.scheduledFor ? new Date(form.scheduledFor).toISOString() : null,
        status: form.scheduledFor ? "scheduled" : "draft",
      };
      const q = form.id
        ? supabase.from("campaigns").update(row).eq("id", form.id)
        : supabase.from("campaigns").insert(row);
      const { error: e } = await q;
      if (e) throw e;
    },
    onSuccess: () => {
      setError(null);
      setNotice("Campaign saved");
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["campaigns", merchantId] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const send = useMutation({
    mutationFn: (campaignId: string) => sendCampaignFn({ data: { campaignId } }),
    onSuccess: (res) => {
      setError(null);
      setNotice(`Sent: ${res.sent}, failed: ${res.failed}`);
      void qc.invalidateQueries({ queryKey: ["campaigns", merchantId] });
      void qc.invalidateQueries({ queryKey: ["campaign-sends", openId] });
    },
    onError: (e: Error) => {
      setNotice(null);
      setError(e.message);
    },
  });

  const retry = useMutation({
    mutationFn: (sendId: string) => retrySendFn({ data: { sendId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaign-sends", openId] }),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Campaigns", "ক্যাম্পেইন")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Messages are only sent to consented, subscribed recipients.",
            "শুধুমাত্র সম্মতিপ্রাপ্ত ও সাবস্ক্রাইবড প্রাপকদের কাছে বার্তা যায়।",
          )}
        </p>
      </header>

      <ErrorFrame message={error} />
      {notice && (
        <p role="status" className="rounded-fq-md border border-success bg-success-soft px-3 py-2 text-sm text-success-foreground">
          {notice}
        </p>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
          <table className="w-full text-sm">
            <caption className="sr-only">Campaign list</caption>
            <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">{t("Name", "নাম")}</th>
                <th scope="col" className="px-3 py-2">{t("Subject", "বিষয়")}</th>
                <th scope="col" className="px-3 py-2">{t("Result", "ফলাফল")}</th>
                <th scope="col" className="px-3 py-2">{t("Status", "অবস্থা")}</th>
                <th scope="col" className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(campaigns ?? []).map((c) => (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.subject}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {c.sent_count} / {c.sent_count + c.failed_count}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill
                      label={statusLabel[c.status] ? t(statusLabel[c.status].en, statusLabel[c.status].bn) : c.status}
                      tone={statusTone[c.status as keyof typeof statusTone] ?? "neutral"}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() =>
                          setForm({
                            id: c.id,
                            name: c.name,
                            segmentId: c.segment_id ?? "",
                            subject: c.subject,
                            bodyTemplate: c.body_template,
                            scheduledFor: c.scheduled_for
                              ? new Date(c.scheduled_for).toISOString().slice(0, 16)
                              : "",
                          })
                        }
                      >
                        {t("Edit", "সম্পাদনা")}
                      </button>
                      <button
                        type="button"
                        className={btnGhost}
                        onClick={() => setOpenId(openId === c.id ? null : c.id)}
                        aria-expanded={openId === c.id}
                      >
                        {t("Log", "লগ")}
                      </button>
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={c.status === "sent" || send.isPending}
                        onClick={() => send.mutate(c.id)}
                      >
                        {t("Send", "পাঠান")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(campaigns ?? []).length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                    {t("No campaigns yet.", "এখনও কোনো ক্যাম্পেইন নেই।")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {openId && (
            <div className="border-t border-border p-3">
              <h2 className="mb-2 text-sm font-semibold">{t("Delivery log", "ডেলিভারি লগ")}</h2>
              <ul className="space-y-1 text-sm">
                {(sends ?? []).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="truncate">{s.email}</span>
                    <span className="flex items-center gap-2">
                      <StatusPill
                        label={s.status === "sent" ? t("Success", "সফল") : t("Failed", "ব্যর্থ")}
                        tone={s.status === "sent" ? "success" : "danger"}
                      />
                      {s.status !== "sent" && (
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={retry.isPending}
                          onClick={() => retry.mutate(s.id)}
                        >
                          {t("Retry", "পুনরায়")}
                        </button>
                      )}
                    </span>
                  </li>
                ))}
                {(sends ?? []).length === 0 && (
                  <li className="text-muted-foreground">{t("No log entries yet.", "কোনো লগ নেই।")}</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <form
          className="space-y-3 rounded-fq-md border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="font-bangla-display text-base font-semibold">
            {form.id ? t("Edit campaign", "ক্যাম্পেইন সম্পাদনা") : t("New campaign", "নতুন ক্যাম্পেইন")}
          </h2>
          <Field label={t("Name", "নাম")}>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <Field label={t("Segment", "সেগমেন্ট")} hint={t("Leave empty for all consented subscribers", "খালি রাখলে সব সম্মতিপ্রাপ্ত সাবস্ক্রাইবার")}>
            <select
              className={inputClass}
              value={form.segmentId}
              onChange={(e) => setForm({ ...form, segmentId: e.target.value })}
            >
              <option value="">{t("Everyone", "সবাই")}</option>
              {(segments ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("Subject", "বিষয়")}>
            <input
              className={inputClass}
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              required
            />
          </Field>
          <Field label={t("Body", "বডি")} hint={t("You can use the {{email}} placeholder", "{{email}} প্লেসহোল্ডার ব্যবহার করা যায়")}>
            <textarea
              className={`${inputClass} min-h-32`}
              value={form.bodyTemplate}
              onChange={(e) => setForm({ ...form, bodyTemplate: e.target.value })}
              required
            />
          </Field>
          <Field label={t("Scheduled time", "নির্ধারিত সময়")} hint={t("Optional", "ঐচ্ছিক")}>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.scheduledFor}
              onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
            />
          </Field>
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={save.isPending}>
              {t("Save", "সংরক্ষণ")}
            </button>
            {form.id && (
              <button type="button" className={btnGhost} onClick={() => setForm(emptyForm)}>
                {t("Cancel", "বাতিল")}
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
