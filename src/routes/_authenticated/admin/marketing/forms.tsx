import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formsLoadFn, saveFormFn, submissionStatusFn } from "@/lib/cms.functions";
import { useLang } from "@/lib/i18n";
import { ErrorFrame, Field, StatusPill, btnGhost, btnPrimary, inputClass } from "@/components/admin/MarketingUi";

export const Route = createFileRoute("/_authenticated/admin/marketing/forms")({
  head: () => ({
    meta: [
      { title: "Forms & submissions — Framique Marketing" },
      { name: "description", content: "Build storefront forms with consent and work the submissions inbox." },
      { property: "og:title", content: "Storefront forms" },
      { property: "og:description", content: "Field builder, consent capture and a submissions inbox." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FormsPage,
});

type FieldType = "text" | "email" | "phone" | "textarea";
type Draft = {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  fields: { key: string; label: string; type: FieldType; required: boolean }[];
  successMessage: string;
  requiresConsent: boolean;
  isActive: boolean;
};

const emptyDraft: Draft = {
  id: null,
  slug: "",
  title: "",
  description: "",
  fields: [{ key: "name", label: "Name", type: "text", required: true }],
  successMessage: "Thank you — we will get back to you.",
  requiresConsent: false,
  isActive: true,
};

const statusTone = { new: "info", handled: "success", spam: "warning" } as const;

function FormsPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(formsLoadFn);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "new" | "handled" | "spam">("new");
  const [activeForm, setActiveForm] = useState<string | "all">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-forms"],
    queryFn: () => load({}),
  });

  const forms = data?.forms ?? [];
  const submissions = useMemo(() => {
    const rows = data?.submissions ?? [];
    return rows.filter(
      (s) => (filter === "all" || s.status === filter) && (activeForm === "all" || s.form_id === activeForm),
    );
  }, [data, filter, activeForm]);

  const save = useMutation({
    mutationFn: () =>
      saveFormFn({
        data: {
          ...draft,
          slug: draft.slug.trim() || draft.title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        },
      }),
    onSuccess: () => {
      setError(null);
      setDraft(emptyDraft);
      void qc.invalidateQueries({ queryKey: ["admin-forms"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const mark = useMutation({
    mutationFn: (v: { submissionId: string; status: "new" | "handled" | "spam" }) => submissionStatusFn({ data: v }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-forms"] }),
    onError: (e: Error) => setError(e.message),
  });

  function patchField(i: number, patch: Partial<Draft["fields"][number]>) {
    setDraft((d) => ({ ...d, fields: d.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) }));
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{t("Forms & submissions", "ফর্ম ও জমা")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Forms render on the storefront; every submission lands in this inbox.",
            "ফর্মগুলো স্টোরফ্রন্টে দেখা যায়; প্রতিটি জমা এই ইনবক্সে আসে।",
          )}
        </p>
      </header>

      <ErrorFrame message={error} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputClass} w-auto`} value={activeForm} onChange={(e) => setActiveForm(e.target.value)}>
              <option value="all">{t("All forms", "সব ফর্ম")}</option>
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
            {(["new", "handled", "spam", "all"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={filter === k ? btnPrimary : btnGhost}
                onClick={() => setFilter(k)}
              >
                {k === "new"
                  ? t("New", "নতুন")
                  : k === "handled"
                    ? t("Handled", "সম্পন্ন")
                    : k === "spam"
                      ? t("Spam", "স্প্যাম")
                      : t("All", "সব")}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-fq-md border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Form submissions</caption>
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2">{t("Received", "প্রাপ্তি")}</th>
                  <th scope="col" className="px-3 py-2">{t("Answers", "উত্তর")}</th>
                  <th scope="col" className="px-3 py-2">{t("Consent", "সম্মতি")}</th>
                  <th scope="col" className="px-3 py-2">{t("Status", "অবস্থা")}</th>
                  <th scope="col" className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {submissions.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <dl className="space-y-0.5">
                        {Object.entries(s.payload).map(([k, v]) => (
                          <div key={k} className="flex gap-2">
                            <dt className="text-xs uppercase text-muted-foreground">{k}</dt>
                            <dd className="font-medium">{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                    <td className="px-3 py-2">{s.consent_granted ? t("Yes", "হ্যাঁ") : "—"}</td>
                    <td className="px-3 py-2">
                      <StatusPill label={s.status} tone={statusTone[s.status as keyof typeof statusTone] ?? "neutral"} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={mark.isPending}
                          onClick={() => mark.mutate({ submissionId: s.id, status: "handled" })}
                        >
                          {t("Handled", "সম্পন্ন")}
                        </button>
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={mark.isPending}
                          onClick={() => mark.mutate({ submissionId: s.id, status: "spam" })}
                        >
                          {t("Spam", "স্প্যাম")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!isLoading && submissions.length === 0 && (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5}>
                      {t("No submissions here.", "এখানে কোনো জমা নেই।")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <form
          className="space-y-3 rounded-fq-md border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="font-bangla-display text-base font-semibold">
            {draft.id ? t("Edit form", "ফর্ম সম্পাদনা") : t("New form", "নতুন ফর্ম")}
          </h2>
          <Field label={t("Title", "শিরোনাম")}>
            <input className={inputClass} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} required />
          </Field>
          <Field label={t("Slug", "স্লাগ")} hint={t("Used in the storefront block", "স্টোরফ্রন্ট ব্লকে ব্যবহৃত")}>
            <input className={inputClass} value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          </Field>
          <Field label={t("Description", "বিবরণ")}>
            <textarea className={`${inputClass} min-h-16`} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </Field>

          <fieldset className="space-y-2 rounded-fq-md border border-border p-3">
            <legend className="px-1 text-xs uppercase text-muted-foreground">{t("Fields", "ফিল্ড")}</legend>
            {draft.fields.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <input
                  aria-label={t("Field key", "ফিল্ড কী")}
                  className={inputClass}
                  value={f.key}
                  onChange={(e) => patchField(i, { key: e.target.value })}
                />
                <input
                  aria-label={t("Field label", "ফিল্ড লেবেল")}
                  className={inputClass}
                  value={f.label}
                  onChange={(e) => patchField(i, { label: e.target.value })}
                />
                <select
                  aria-label={t("Field type", "ফিল্ডের ধরন")}
                  className={inputClass}
                  value={f.type}
                  onChange={(e) => patchField(i, { type: e.target.value as FieldType })}
                >
                  <option value="text">text</option>
                  <option value="email">email</option>
                  <option value="phone">phone</option>
                  <option value="textarea">textarea</option>
                </select>
                <label className="col-span-2 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={f.required} onChange={(e) => patchField(i, { required: e.target.checked })} />
                  {t("Required", "আবশ্যক")}
                </label>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, idx) => idx !== i) })}
                >
                  {t("Remove", "সরান")}
                </button>
              </div>
            ))}
            <button
              type="button"
              className={btnGhost}
              onClick={() =>
                setDraft({ ...draft, fields: [...draft.fields, { key: "", label: "", type: "text", required: false }] })
              }
            >
              {t("Add field", "ফিল্ড যোগ")}
            </button>
          </fieldset>

          <Field label={t("Success message", "সফল বার্তা")}>
            <input className={inputClass} value={draft.successMessage} onChange={(e) => setDraft({ ...draft, successMessage: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.requiresConsent} onChange={(e) => setDraft({ ...draft, requiresConsent: e.target.checked })} />
            {t("Ask for marketing consent", "মার্কেটিং সম্মতি চাইুন")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
            {t("Active", "সক্রিয়")}
          </label>

          <div className="flex gap-2">
            <button type="submit" className={btnPrimary} disabled={save.isPending}>
              {t("Save form", "ফর্ম সংরক্ষণ")}
            </button>
            {draft.id && (
              <button type="button" className={btnGhost} onClick={() => setDraft(emptyDraft)}>
                {t("Cancel", "বাতিল")}
              </button>
            )}
          </div>

          {forms.length > 0 && (
            <ul className="space-y-1 border-t border-border pt-3 text-sm">
              {forms.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{f.title}</span>
                  <button
                    type="button"
                    className={btnGhost}
                    onClick={() =>
                      setDraft({
                        id: f.id,
                        slug: f.slug,
                        title: f.title,
                        description: f.description ?? "",
                        fields: f.fields.length ? f.fields : emptyDraft.fields,
                        successMessage: f.success_message ?? "",
                        requiresConsent: !!f.requires_consent,
                        isActive: !!f.is_active,
                      })
                    }
                  >
                    {t("Edit", "সম্পাদনা")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      </section>
    </div>
  );
}
