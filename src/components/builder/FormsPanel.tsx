import { useCallback, useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type FieldType = "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "radio";

type FormField = {
  id: string;
  type: FieldType;
  labelEn: string;
  labelBn: string;
  required: boolean;
  placeholderEn: string;
  placeholderBn: string;
  options?: string[];
};

type ActionType = "email_admin" | "email_customer" | "redirect" | "webhook";

type SubmitAction = {
  id: string;
  type: ActionType;
  enabled: boolean;
  config: Record<string, string>;
};

type SubmissionStatus = "new" | "read" | "trashed";

type Submission = {
  id: string;
  date: string;
  email: string;
  status: SubmissionStatus;
  data: Record<string, string>;
};

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                    */
/* -------------------------------------------------------------------------- */

let nextId = 1;
const uid = () => `f-${nextId++}`;

const FIELD_TYPES: { value: FieldType; labelEn: string; labelBn: string }[] = [
  { value: "text", labelEn: "Text", labelBn: "টেক্সট" },
  { value: "email", labelEn: "Email", labelBn: "ইমেইল" },
  { value: "phone", labelEn: "Phone", labelBn: "ফোন" },
  { value: "textarea", labelEn: "Textarea", labelBn: "টেক্সটএরিয়া" },
  { value: "select", labelEn: "Dropdown", labelBn: "ড্রপডাউন" },
  { value: "checkbox", labelEn: "Checkbox", labelBn: "চেকবক্স" },
  { value: "radio", labelEn: "Radio", labelBn: "রেডিও" },
];

const ACTION_TYPES: { value: ActionType; labelEn: string; labelBn: string }[] = [
  { value: "email_admin", labelEn: "Email to admin", labelBn: "অ্যাডমিনকে ইমেইল" },
  { value: "email_customer", labelEn: "Email to customer", labelBn: "গ্রাহককে ইমেইল" },
  { value: "redirect", labelEn: "Redirect to URL", labelBn: "ইউআরএলে পুনঃনির্দেশ" },
  { value: "webhook", labelEn: "Webhook", labelBn: "ওয়েবহুক" },
];

const SAMPLE_SUBMISSIONS: Submission[] = [
  { id: "s1", date: "2026-09-18T10:30:00", email: "rafi@example.com", status: "new", data: { name: "Rafi Ahmed", message: "Interested in bulk order" } },
  { id: "s2", date: "2026-09-17T16:12:00", email: "sara@example.com", status: "read", data: { name: "Sara Khan", message: "When is the next restock?" } },
  { id: "s3", date: "2026-09-16T09:05:00", email: "dev@example.com", status: "new", data: { name: "Dev Patel", message: "Need help with checkout" } },
  { id: "s4", date: "2026-09-15T14:44:00", email: "mira@example.com", status: "trashed", data: { name: "Mira Begum", message: "Test submission" } },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatBytes(_b: number) { return ""; }
function csvEscape(val: string) { return /[",\n]/.test(val) ? `"${val.replace(/"/g, '""')}"` : val; }

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                              */
/* -------------------------------------------------------------------------- */

function FieldEditor({
  field,
  onUpdate,
  onRemove,
}: {
  field: FormField;
  onUpdate: (patch: Partial<FormField>) => void;
  onRemove: () => void;
}) {
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-fq-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="size-5 flex items-center justify-center text-xs text-muted-foreground"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▼" : "▶"}
        </button>
        <span className="flex-1 truncate text-xs font-medium">
          {field.labelEn || t("Untitled field", "নামহীন ফিল্ড")}
        </span>
        <span className="rounded bg-muted px-1 py-0.5 text-[0.6rem] text-muted-foreground">
          {FIELD_TYPES.find((ft) => ft.value === field.type)?.labelEn ?? field.type}
        </span>
        {field.required && (
          <span className="text-danger text-[0.6rem]">*</span>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="text-danger-foreground text-xs"
          aria-label={t("Remove field", "ফিল্ড সরান")}
        >
          ×
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 pt-1">
          <div className="space-y-1">
            <label className="block text-xs font-medium">{t("Type", "ধরন")}</label>
            <select
              value={field.type}
              onChange={(e) => onUpdate({ type: e.target.value as FieldType })}
              className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {t(ft.labelEn, ft.labelBn)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium">Label EN</label>
              <input
                type="text"
                value={field.labelEn}
                onChange={(e) => onUpdate({ labelEn: e.target.value })}
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium">Label BN</label>
              <input
                type="text"
                value={field.labelBn}
                onChange={(e) => onUpdate({ labelBn: e.target.value })}
                lang="bn"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs font-bangla"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium">Placeholder EN</label>
              <input
                type="text"
                value={field.placeholderEn}
                onChange={(e) => onUpdate({ placeholderEn: e.target.value })}
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium">Placeholder BN</label>
              <input
                type="text"
                value={field.placeholderBn}
                onChange={(e) => onUpdate({ placeholderBn: e.target.value })}
                lang="bn"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs font-bangla"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="size-4 rounded border-border"
            />
            {t("Required", "আবশ্যক")}
          </label>

          {(field.type === "select" || field.type === "radio") && (
            <div className="space-y-1">
              <label className="block text-xs font-medium">{t("Options (one per line)", "অপশন (প্রতি লাইনে একটি)")}</label>
              <textarea
                rows={3}
                value={(field.options ?? []).join("\n")}
                onChange={(e) => onUpdate({ options: e.target.value.split("\n").filter(Boolean) })}
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActionEditor({
  action,
  onUpdate,
  onRemove,
}: {
  action: SubmitAction;
  onUpdate: (patch: Partial<SubmitAction>) => void;
  onRemove: () => void;
}) {
  const { t } = useLang();
  const label = ACTION_TYPES.find((a) => a.value === action.type);

  return (
    <div className="rounded-fq-md border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={action.enabled}
          onChange={(e) => onUpdate({ enabled: e.target.checked })}
          className="size-4 rounded border-border"
        />
        <span className="flex-1 text-xs font-medium">
          {label ? t(label.labelEn, label.labelBn) : action.type}
        </span>
        <button type="button" onClick={onRemove} className="text-danger-foreground text-xs" aria-label={t("Remove", "সরান")}>
          ×
        </button>
      </div>

      {action.enabled && (
        <div className="space-y-2 pl-6">
          {(action.type === "email_admin" || action.type === "email_customer") && (
            <div className="space-y-1">
              <label className="block text-xs font-medium">{t("Recipient email", "প্রাপক ইমেইল")}</label>
              <input
                type="email"
                autoComplete="email"
                value={action.config.recipient ?? ""}
                onChange={(e) => onUpdate({ config: { ...action.config, recipient: e.target.value } })}
                placeholder={action.type === "email_admin" ? "admin@store.com" : "{{email}}"}
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
              />
            </div>
          )}
          {action.type === "redirect" && (
            <div className="space-y-1">
              <label className="block text-xs font-medium">{t("Redirect URL", "পুনঃনির্দেশ ইউআরএল")}</label>
              <input
                type="url"
                value={action.config.url ?? ""}
                onChange={(e) => onUpdate({ config: { ...action.config, url: e.target.value } })}
                placeholder="/thank-you"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
              />
            </div>
          )}
          {action.type === "webhook" && (
            <div className="space-y-1">
              <label className="block text-xs font-medium">{t("Webhook URL", "ওয়েবহুক ইউআরএল")}</label>
              <input
                type="url"
                value={action.config.url ?? ""}
                onChange={(e) => onUpdate({ config: { ...action.config, url: e.target.value } })}
                placeholder="https://hooks.example.com/form"
                className="w-full rounded-fq-md border border-border bg-card px-2 py-1.5 text-xs"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                              */
/* -------------------------------------------------------------------------- */

type PanelTab = "fields" | "actions" | "submissions";

export function FormsPanel() {
  const { t } = useLang();
  const [tab, setTab] = useState<PanelTab>("fields");

  // ---- Field state ----
  const [fields, setFields] = useState<FormField[]>([
    { id: uid(), type: "text", labelEn: "Name", labelBn: "নাম", required: true, placeholderEn: "Your name", placeholderBn: "আপনার নাম" },
    { id: uid(), type: "email", labelEn: "Email", labelBn: "ইমেইল", required: true, placeholderEn: "you@example.com", placeholderBn: "you@example.com" },
  ]);

  const addField = useCallback(() => {
    setFields((prev) => [
      ...prev,
      { id: uid(), type: "text", labelEn: "", labelBn: "", required: false, placeholderEn: "", placeholderBn: "" },
    ]);
  }, []);

  const updateField = useCallback((id: string, patch: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const removeField = useCallback((id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const moveField = useCallback((index: number, delta: -1 | 1) => {
    setFields((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }, []);

  // ---- Action state ----
  const [actions, setActions] = useState<SubmitAction[]>([
    { id: uid(), type: "email_admin", enabled: true, config: { recipient: "" } },
  ]);

  const addAction = useCallback((type: ActionType) => {
    setActions((prev) => [...prev, { id: uid(), type, enabled: true, config: {} }]);
  }, []);

  const updateAction = useCallback((id: string, patch: Partial<SubmitAction>) => {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const removeAction = useCallback((id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // ---- Submission state ----
  const [submissions, setSubmissions] = useState<Submission[]>(SAMPLE_SUBMISSIONS);
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());
  const [viewingSubmission, setViewingSubmission] = useState<Submission | null>(null);

  const visibleSubmissions = useMemo(
    () => submissions.filter((s) => s.status !== "trashed"),
    [submissions],
  );

  const toggleSubSelection = useCallback((id: string) => {
    setSelectedSubIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAllSubs = useCallback(() => {
    setSelectedSubIds((prev) => {
      const visible = visibleSubmissions.map((s) => s.id);
      if (visible.every((id) => prev.has(id))) return new Set<string>();
      return new Set(visible);
    });
  }, [visibleSubmissions]);

  const markRead = useCallback((ids: string[]) => {
    setSubmissions((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, status: "read" as const } : s));
  }, []);

  const trashSubmissions = useCallback((ids: string[]) => {
    setSubmissions((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, status: "trashed" as const } : s));
    setSelectedSubIds(new Set());
  }, []);

  const exportCsv = useCallback(() => {
    const rows = submissions.filter((s) => s.status !== "trashed");
    if (!rows.length) return;
    const headers = ["Date", "Email", "Status", ...fields.map((f) => f.labelEn)];
    const lines = [
      headers.map(csvEscape).join(","),
      ...rows.map((s) =>
        [
          s.date,
          s.email,
          s.status,
          ...fields.map((f) => s.data[f.labelEn.toLowerCase()] ?? ""),
        ].map(csvEscape).join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "form-submissions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [fields, submissions]);

  const allVisibleSelected = visibleSubmissions.length > 0 && visibleSubmissions.every((s) => selectedSubIds.has(s.id));

  const newCount = submissions.filter((s) => s.status === "new").length;

  /* ---- Render ---- */

  const TABS: { key: PanelTab; labelEn: string; labelBn: string }[] = [
    { key: "fields", labelEn: "Fields", labelBn: "ফিল্ড" },
    { key: "actions", labelEn: "Actions", labelBn: "অ্যাকশন" },
    { key: "submissions", labelEn: `Submissions${newCount > 0 ? ` (${newCount})` : ""}`, labelBn: `সাবমিশন${newCount > 0 ? ` (${newCount})` : ""}` },
  ];

  return (
    <div className="space-y-4">
      <h3 className="font-bangla-display text-sm font-semibold">
        {t("Forms", "ফর্ম")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t(
          "Design your form fields, configure post-submit actions, and review submissions.",
          "ফর্ম ফিল্ড ডিজাইন করুন, সাবমিটের পরের অ্যাকশন কনফিগার করুন এবং সাবমিশন দেখুন।",
        )}
      </p>

      <div role="tablist" aria-label={t("Form sections", "ফর্ম সেকশন")} className="flex gap-1">
        {TABS.map((t2) => (
          <button
            key={t2.key}
            type="button"
            role="tab"
            aria-selected={tab === t2.key}
            onClick={() => setTab(t2.key)}
            className={`rounded-fq-md px-2 py-1.5 text-xs ${
              tab === t2.key ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {t(t2.labelEn, t2.labelBn)}
          </button>
        ))}
      </div>

      {/* -------- FIELDS TAB -------- */}
      {tab === "fields" && (
        <div className="space-y-3">
          <div className="space-y-2">
            {fields.map((field, i) => (
              <div key={field.id} className="flex items-start gap-1">
                <div className="flex flex-col gap-0.5 pt-1">
                  <button
                    type="button"
                    onClick={() => moveField(i, -1)}
                    disabled={i === 0}
                    className="text-[0.6rem] text-muted-foreground disabled:opacity-30"
                    aria-label="Move up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveField(i, 1)}
                    disabled={i === fields.length - 1}
                    className="text-[0.6rem] text-muted-foreground disabled:opacity-30"
                    aria-label="Move down"
                  >
                    ▼
                  </button>
                </div>
                <div className="flex-1">
                  <FieldEditor
                    field={field}
                    onUpdate={(patch) => updateField(field.id, patch)}
                    onRemove={() => removeField(field.id)}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addField}
            className="w-full rounded-fq-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            + {t("Add field", "ফিল্ড যোগ করুন")}
          </button>
        </div>
      )}

      {/* -------- ACTIONS TAB -------- */}
      {tab === "actions" && (
        <div className="space-y-3">
          <div className="space-y-2">
            {actions.map((action) => (
              <ActionEditor
                key={action.id}
                action={action}
                onUpdate={(patch) => updateAction(action.id, patch)}
                onRemove={() => removeAction(action.id)}
              />
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            {ACTION_TYPES.filter((at) => !actions.some((a) => a.type === at.value)).map((at) => (
              <button
                key={at.value}
                type="button"
                onClick={() => addAction(at.value)}
                className="rounded-fq-md border border-dashed border-border px-2 py-1 text-[0.65rem] text-muted-foreground hover:bg-muted"
              >
                + {t(at.labelEn, at.labelBn)}
              </button>
            ))}
            {actions.length > 0 && ACTION_TYPES.every((at) => actions.some((a) => a.type === at.value)) && (
              <p className="text-[0.65rem] text-muted-foreground">
                {t("All action types added.", "সব অ্যাকশন ধরন যোগ করা হয়েছে।")}
              </p>
            )}
          </div>
        </div>
      )}

      {/* -------- SUBMISSIONS TAB -------- */}
      {tab === "submissions" && (
        <div className="space-y-3">
          {viewingSubmission && (
            <div className="rounded-fq-md border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold">{t("Submission detail", "সাবমিশন বিস্তারিত")}</h4>
                <button
                  type="button"
                  onClick={() => setViewingSubmission(null)}
                  className="text-xs text-muted-foreground"
                >
                  ×
                </button>
              </div>
              <dl className="space-y-1 text-xs">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t("Date:", "তারিখ:")} </dt>
                  <dd>{new Date(viewingSubmission.date).toLocaleString()}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">{t("Email:", "ইমেইল:")} </dt>
                  <dd>{viewingSubmission.email}</dd>
                </div>
                {Object.entries(viewingSubmission.data).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="text-muted-foreground capitalize">{k}:</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllSubs}
                  className="size-3 rounded border-border"
                />
                {t("Select all", "সব নির্বাচন")}
              </label>
              {selectedSubIds.size > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => markRead([...selectedSubIds])}
                    className="rounded-fq-md border border-border px-2 py-0.5 text-[0.65rem] hover:bg-muted"
                  >
                    {t("Mark read", "পঠিত চিহ্নিত")}
                  </button>
                  <button
                    type="button"
                    onClick={() => trashSubmissions([...selectedSubIds])}
                    className="rounded-fq-md border border-danger px-2 py-0.5 text-[0.65rem] text-danger-foreground hover:bg-danger-soft"
                  >
                    {t("Trash", "আবর্জনা")}
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-fq-md border border-border px-2 py-1 text-xs hover:bg-muted"
            >
              {t("Export CSV", "সিএসভি এক্সপোর্ট")}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-1 pr-1 w-6" />
                  <th className="pb-1 pr-2">{t("Date", "তারিখ")}</th>
                  <th className="pb-1 pr-2">{t("Email", "ইমেইল")}</th>
                  <th className="pb-1 pr-2">{t("Status", "স্ট্যাটাস")}</th>
                  <th className="pb-1">{t("Actions", "অ্যাকশন")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      {t("No submissions yet.", "এখনো কোনো সাবমিশন নেই।")}
                    </td>
                  </tr>
                )}
                {visibleSubmissions.map((sub) => (
                  <tr key={sub.id} className="border-b border-border/50">
                    <td className="py-1.5 pr-1">
                      <input
                        type="checkbox"
                        checked={selectedSubIds.has(sub.id)}
                        onChange={() => toggleSubSelection(sub.id)}
                        className="size-3 rounded border-border"
                      />
                    </td>
                    <td className="py-1.5 pr-2 tabular-nums whitespace-nowrap">
                      {new Date(sub.date).toLocaleDateString()}
                    </td>
                    <td className="py-1.5 pr-2 truncate max-w-[120px]">{sub.email}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[0.6rem] ${
                        sub.status === "new"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {sub.status === "new" ? t("New", "নতুন") : t("Read", "পঠিত")}
                      </span>
                    </td>
                    <td className="py-1.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingSubmission(sub)}
                          className="rounded px-1.5 py-0.5 text-[0.65rem] hover:bg-muted"
                        >
                          {t("View", "দেখুন")}
                        </button>
                        {sub.status === "new" && (
                          <button
                            type="button"
                            onClick={() => markRead([sub.id])}
                            className="rounded px-1.5 py-0.5 text-[0.65rem] hover:bg-muted"
                          >
                            {t("Read", "পঠিত")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => trashSubmissions([sub.id])}
                          className="rounded px-1.5 py-0.5 text-[0.65rem] text-danger-foreground hover:bg-danger-soft"
                        >
                          {t("Trash", "আবর্জনা")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
