import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { btnGhost, btnPrimary, inputClass } from "@/components/console/kit";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/i18n";
import {
  PAGE_TEMPLATES,
  parentOptions,
  quickEditFrom,
  slugifyTitle,
  validateQuickEdit,
  type ContentRow,
  type QuickEditDraft,
  type QuickEditErrors,
} from "@/lib/content-desk";
import { permalinkPrefix } from "./content-links";

/**
 * WordPress Quick Edit, replicated field-for-field (screenshot
 * `wp_pages_quick_edit.png`): a two-column form inside the table width, 80px
 * label column, Title focused on open, `Update` primary + `Cancel` ghost.
 * Esc cancels. Validation renders under the offending field.
 */
export function QuickEditPlate({
  row,
  rows,
  storeSlug,
  saving,
  serverError,
  onCancel,
  onSubmit,
}: {
  row: ContentRow;
  rows: readonly ContentRow[];
  storeSlug: string;
  saving: boolean;
  serverError?: string | null;
  onCancel: () => void;
  onSubmit: (draft: QuickEditDraft) => void;
}) {
  const { t, lang } = useLang();
  const l = lang === "bn" ? "bn" : "en";
  const [draft, setDraft] = useState<QuickEditDraft>(() => quickEditFrom(row));
  const [errors, setErrors] = useState<QuickEditErrors>({});
  const [touchedSlug, setTouchedSlug] = useState(row.slug.length > 0);
  const titleRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const isPage = row.kind === "page";

  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  const set = <K extends keyof QuickEditDraft>(key: K, value: QuickEditDraft[K]) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      if (key === "title" && !touchedSlug) next.slug = slugifyTitle(String(value));
      return next;
    });
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = validateQuickEdit(draft, { selfId: row.id });
    setErrors(found);
    const first = Object.keys(found)[0];
    if (first) {
      document.getElementById(id(first))?.focus();
      return;
    }
    onSubmit(draft);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const labelCls = "w-20 shrink-0 pt-2 text-xs font-medium fq-sub";
  const rowCls = "flex items-start gap-3";
  const err = (k: keyof QuickEditDraft) =>
    errors[k] ? (
      <p role="alert" className="mt-1 text-xs text-[var(--fq-danger)]">
        {errors[k]![l]}
      </p>
    ) : null;

  const parents = isPage ? parentOptions(rows, row.id) : [];

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKey}
      aria-label={t("Quick edit", "দ্রুত সম্পাদনা")}
      className="fq-enter border-y border-border bg-card px-4 py-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-foreground">{t("Quick Edit", "দ্রুত সম্পাদনা")}</h3>
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-2">
        {/* Left column */}
        <div className="space-y-3">
          <div className={rowCls}>
            <label htmlFor={id("title")} className={labelCls}>
              {t("Title", "শিরোনাম")}
            </label>
            <div className="min-w-0 flex-1">
              <input
                ref={titleRef}
                id={id("title")}
                value={draft.title}
                maxLength={160}
                onChange={(e) => set("title", e.target.value)}
                aria-invalid={Boolean(errors.title)}
                className={inputClass}
              />
              {err("title")}
            </div>
          </div>

          <div className={rowCls}>
            <label htmlFor={id("slug")} className={labelCls}>
              {t("Slug", "স্লাগ")}
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="hidden max-w-[40%] truncate text-xs fq-sub sm:block" title={permalinkPrefix(row.kind, storeSlug)}>
                  {permalinkPrefix(row.kind, storeSlug)}
                </span>
                <input
                  id={id("slug")}
                  value={draft.slug}
                  maxLength={60}
                  onChange={(e) => {
                    setTouchedSlug(true);
                    set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"));
                  }}
                  aria-invalid={Boolean(errors.slug)}
                  className={cn(inputClass, "fq-num")}
                />
              </div>
              {err("slug")}
            </div>
          </div>

          <div className={rowCls}>
            <label htmlFor={id("date")} className={labelCls}>
              {t("Date", "তারিখ")}
            </label>
            <div className="min-w-0 flex-1">
              <input
                id={id("date")}
                type="datetime-local"
                value={draft.date}
                onChange={(e) => set("date", e.target.value)}
                aria-invalid={Boolean(errors.date)}
                className={cn(inputClass, "fq-num")}
              />
              <p className="mt-1 text-xs fq-sub">
                {t("A future date with status Published schedules it.", "ভবিষ্যতের তারিখ ও Published স্ট্যাটাস দিলে নির্ধারিত হবে।")}
              </p>
              {err("date")}
            </div>
          </div>

          <div className={rowCls}>
            <label htmlFor={id("password")} className={labelCls}>
              {t("Password", "পাসওয়ার্ড")}
            </label>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={id("password")}
                  type="text"
                  autoComplete="off"
                  value={draft.password}
                  maxLength={64}
                  disabled={draft.isPrivate}
                  placeholder={row.hasPassword ? t("(unchanged)", "(অপরিবর্তিত)") : ""}
                  onChange={(e) => set("password", e.target.value)}
                  aria-invalid={Boolean(errors.password)}
                  className={cn(inputClass, "max-w-[12rem]")}
                />
                <span className="text-xs uppercase tracking-wide fq-sub">{t("–OR–", "–অথবা–")}</span>
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    id={id("isPrivate")}
                    type="checkbox"
                    checked={draft.isPrivate}
                    onChange={(e) => set("isPrivate", e.target.checked)}
                  />
                  {t("Private", "ব্যক্তিগত")}
                </label>
              </div>
              {err("password")}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          {isPage ? (
            <div className={rowCls}>
              <label htmlFor={id("parentId")} className={labelCls}>
                {t("Parent", "প্যারেন্ট")}
              </label>
              <div className="min-w-0 flex-1">
                <select
                  id={id("parentId")}
                  value={draft.parentId ?? ""}
                  onChange={(e) => set("parentId", e.target.value || null)}
                  aria-invalid={Boolean(errors.parentId)}
                  className={inputClass}
                >
                  <option value="">{t("Main Page (no parent)", "মূল পেজ (প্যারেন্ট নেই)")}</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {"\u00a0\u00a0".repeat(p.depth)}
                      {p.depth > 0 ? "— " : ""}
                      {p.label}
                    </option>
                  ))}
                </select>
                {err("parentId")}
              </div>
            </div>
          ) : null}

          <div className={rowCls}>
            <label htmlFor={id("menuOrder")} className={labelCls}>
              {t("Order", "ক্রম")}
            </label>
            <div className="min-w-0 flex-1">
              <input
                id={id("menuOrder")}
                type="number"
                inputMode="numeric"
                min={0}
                max={9999}
                value={draft.menuOrder}
                onChange={(e) => set("menuOrder", Number(e.target.value))}
                aria-invalid={Boolean(errors.menuOrder)}
                className={cn(inputClass, "fq-num max-w-[8rem]")}
              />
              {err("menuOrder")}
            </div>
          </div>

          <div className={rowCls}>
            <label htmlFor={id("template")} className={labelCls}>
              {t("Template", "টেমপ্লেট")}
            </label>
            <div className="min-w-0 flex-1">
              <select id={id("template")} value={draft.template} onChange={(e) => set("template", e.target.value)} className={inputClass}>
                {PAGE_TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl[l]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isPage ? (
            <div className={rowCls}>
              <span className={labelCls} aria-hidden />
              <label className="inline-flex items-center gap-2 pt-2 text-sm text-foreground">
                <input
                  id={id("allowComments")}
                  type="checkbox"
                  checked={draft.allowComments}
                  onChange={(e) => set("allowComments", e.target.checked)}
                />
                {t("Allow Comments", "মন্তব্য অনুমোদন")}
              </label>
            </div>
          ) : null}

          <div className={rowCls}>
            <label htmlFor={id("status")} className={labelCls}>
              {t("Status", "স্ট্যাটাস")}
            </label>
            <div className="min-w-0 flex-1">
              <select
                id={id("status")}
                value={draft.status}
                disabled={draft.isPrivate}
                onChange={(e) => set("status", e.target.value as QuickEditDraft["status"])}
                className={inputClass}
              >
                <option value="published">{t("Published", "প্রকাশিত")}</option>
                <option value="pending">{t("Pending Review", "পর্যালোচনা বাকি")}</option>
                <option value="draft">{t("Draft", "খসড়া")}</option>
                <option value="scheduled">{t("Scheduled", "নির্ধারিত")}</option>
              </select>
              {draft.isPrivate ? (
                <p className="mt-1 text-xs fq-sub">{t("Private items are published, but only visible to your team.", "ব্যক্তিগত আইটেম প্রকাশিত, তবে শুধু আপনার টিম দেখতে পায়।")}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {serverError ? (
        <p role="alert" className="mt-3 text-xs text-[var(--fq-danger)]">
          {serverError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? t("Updating…", "আপডেট হচ্ছে…") : t("Update", "আপডেট")}
        </button>
        <button type="button" onClick={onCancel} className={btnGhost}>
          {t("Cancel", "বাতিল")}
        </button>
        <span className="ml-auto text-xs fq-sub">{t("Esc to cancel", "বাতিল করতে Esc")}</span>
      </div>
    </form>
  );
}
