import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant } from "@/hooks/use-merchant";
import { useLang } from "@/lib/i18n";
import {
  ErrorFrame,
  Field,
  StatusPill,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/admin/MarketingUi";

export const Route = createFileRoute("/_authenticated/admin/marketing/subscribers")({
  head: () => ({
    meta: [
      { title: "Subscribers — Framique Marketing" },
      {
        name: "description",
        content: "Manage consented email and SMS subscribers, tags and segments.",
      },
      { property: "og:title", content: "Subscriber management" },
      {
        property: "og:description",
        content: "Consent-first subscriber list with tags, segments and opt-out history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SubscribersPage,
});

const statusTone = {
  subscribed: "success",
  pending: "warning",
  unsubscribed: "neutral",
} as const;
const statusLabel: Record<string, { en: string; bn: string }> = {
  subscribed: { en: "Subscribed", bn: "সাবস্ক্রাইবড" },
  pending: { en: "Pending", bn: "অপেক্ষমাণ" },
  unsubscribed: { en: "Unsubscribed", bn: "আনসাবস্ক্রাইবড" },
};

const emptyForm = {
  email: "",
  phone: "",
  tags: "",
  emailConsent: true,
  smsConsent: false,
};

function SubscribersPage() {
  const { t } = useLang();
  const { data: merchant } = useMerchant();
  const merchantId = merchant?.id;
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: subscribers } = useQuery({
    queryKey: ["subscribers", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("subscribers")
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
        .select("*")
        .eq("merchant_id", merchantId!)
        .order("created_at", { ascending: false });
      if (e) throw e;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const email = form.email.trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Enter a valid email");
      if (!form.emailConsent && !form.smsConsent) {
        throw new Error("Consent for at least one channel is required");
      }
      const { error: e } = await supabase.from("subscribers").insert({
        merchant_id: merchantId!,
        email,
        phone: form.phone.trim() || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        email_consent: form.emailConsent,
        sms_consent: form.smsConsent,
        source: "admin",
        status: "subscribed",
      });
      if (e) throw e;
    },
    onSuccess: () => {
      setError(null);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey: ["subscribers", merchantId] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const optOut = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase
        .from("subscribers")
        .update({
          status: "unsubscribed",
          email_consent: false,
          sms_consent: false,
          unsubscribed_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (e) throw e;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["subscribers", merchantId] }),
    onError: (e: Error) => setError(e.message),
  });

  const addSegment = useMutation({
    mutationFn: async (input: { name: string; field: string; value: string }) => {
      const { error: e } = await supabase.from("segments").insert({
        merchant_id: merchantId!,
        name: input.name,
        rule_field: input.field,
        rule_operator: "eq",
        rule_value: input.value,
      });
      if (e) throw e;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["segments", merchantId] }),
    onError: (e: Error) => setError(e.message),
  });

  const rows = (subscribers ?? []).filter((s) => {
    const okStatus = statusFilter === "all" || s.status === statusFilter;
    const q = search.trim().toLowerCase();
    const okSearch =
      !q || s.email.toLowerCase().includes(q) || (s.tags ?? []).some((t) => t.includes(q));
    return okStatus && okSearch;
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Subscribers", "সাবস্ক্রাইবার")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "No message is sent on any channel without consent — opt-out is honored everywhere.",
            "সম্মতি ছাড়া কোনো চ্যানেলে বার্তা পাঠানো হয় না — অপ্ট-আউট সর্বত্র মানা হয়।",
          )}
        </p>
      </header>

      <ErrorFrame message={error} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t("Search", "খুঁজুন")}>
              <input
                className={inputClass}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Email or tag", "ইমেইল বা ট্যাগ")}
              />
            </Field>
            <Field label={t("Status", "অবস্থা")}>
              <select
                className={inputClass}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">{t("All", "সব")}</option>
                <option value="subscribed">{t("Subscribed", "সাবস্ক্রাইবড")}</option>
                <option value="pending">{t("Pending", "অপেক্ষমাণ")}</option>
                <option value="unsubscribed">{t("Unsubscribed", "আনসাবস্ক্রাইবড")}</option>
              </select>
            </Field>
          </div>

          <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Subscriber list</caption>
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">{t("Email", "ইমেইল")}</th>
                  <th scope="col" className="px-3 py-2">{t("Tags", "ট্যাগ")}</th>
                  <th scope="col" className="px-3 py-2">{t("Consent", "সম্মতি")}</th>
                  <th scope="col" className="px-3 py-2">{t("Status", "অবস্থা")}</th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-medium">{s.email}</span>
                      {s.phone && (
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {s.phone}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {(s.tags ?? []).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {s.email_consent ? t("Email", "ইমেইল") : ""} {s.sms_consent ? t("SMS", "এসএমএস") : ""}
                      {!s.email_consent && !s.sms_consent ? "—" : ""}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill
                        label={statusLabel[s.status] ? t(statusLabel[s.status].en, statusLabel[s.status].bn) : s.status}
                        tone={statusTone[s.status as keyof typeof statusTone] ?? "neutral"}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className={btnGhost}
                        disabled={s.status === "unsubscribed" || optOut.isPending}
                        onClick={() => optOut.mutate(s.id)}
                      >
                        {t("Opt out", "অপ্ট-আউট")}
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                      {t("No subscribers yet.", "কোনো সাবস্ক্রাইবার নেই।")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <form
            className="space-y-3 rounded-fq-md border border-border bg-card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <h2 className="font-bangla-display text-base font-semibold">{t("New subscriber", "নতুন সাবস্ক্রাইবার")}</h2>
            <Field label={t("Email", "ইমেইল")}>
              <input
                type="email"
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </Field>
            <Field label={t("Phone", "ফোন")} hint={t("Optional", "ঐচ্ছিক")}>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label={t("Tags", "ট্যাগ")} hint={t("Separate with commas", "কমা দিয়ে আলাদা করুন")}>
              <input
                className={inputClass}
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.emailConsent}
                onChange={(e) => setForm({ ...form, emailConsent: e.target.checked })}
              />
              {t("Email consent", "ইমেইল সম্মতি")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.smsConsent}
                onChange={(e) => setForm({ ...form, smsConsent: e.target.checked })}
              />
              {t("SMS consent", "এসএমএস সম্মতি")}
            </label>
            <button type="submit" className={btnPrimary} disabled={add.isPending}>
              {t("Add", "যোগ করুন")}
            </button>
          </form>

          <SegmentPanel
            segments={segments ?? []}
            onCreate={(v) => addSegment.mutate(v)}
            pending={addSegment.isPending}
          />
        </div>
      </section>
    </div>
  );
}

function SegmentPanel({
  segments,
  onCreate,
  pending,
}: {
  segments: { id: string; name: string; rule_field: string; rule_value: string }[];
  onCreate: (v: { name: string; field: string; value: string }) => void;
  pending: boolean;
}) {
  const { t } = useLang();
  const [name, setName] = useState("");
  const [field, setField] = useState("status");
  const [value, setValue] = useState("subscribed");

  return (
    <form
      className="space-y-3 rounded-fq-md border border-border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onCreate({ name: name.trim(), field, value: value.trim() });
        setName("");
      }}
    >
      <h2 className="font-bangla-display text-base font-semibold">{t("Segments", "সেগমেন্ট")}</h2>
      <ul className="space-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.id} className="flex justify-between gap-2">
            <span>{s.name}</span>
            <span className="text-xs text-muted-foreground">
              {s.rule_field} = {s.rule_value}
            </span>
          </li>
        ))}
        {segments.length === 0 && <li className="text-muted-foreground">{t("No segments yet.", "কোনো সেগমেন্ট নেই।")}</li>}
      </ul>
      <Field label={t("Name", "নাম")}>
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t("Field", "ফিল্ড")}>
          <select className={inputClass} value={field} onChange={(e) => setField(e.target.value)}>
            <option value="status">status</option>
            <option value="email_consent">email_consent</option>
            <option value="tag">tag</option>
          </select>
        </Field>
        <Field label={t("Value", "মান")}>
          <input className={inputClass} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      </div>
      <button type="submit" className={btnPrimary} disabled={pending}>
        {t("Create segment", "সেগমেন্ট তৈরি")}
      </button>
    </form>
  );
}
