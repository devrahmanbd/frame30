import { useId, useState, type FormEvent, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { btnGhost, btnPrimary, inputClass } from "@/components/console/kit";
import { useLang } from "@/lib/i18n";
import {
  bulkEditPatch,
  EMPTY_BULK_EDIT,
  NO_CHANGE,
  PAGE_TEMPLATES,
  parentOptions,
  type BulkEditDraft,
  type ContentKind,
  type ContentRow,
} from "@/lib/content-desk";

/**
 * WordPress Bulk Edit: the selected titles on the left (each removable), then
 * `Author · Parent · Template · Comments · Status` all defaulting to
 * `— No Change —`. Footer `Update · Cancel`.
 */
export function BulkEditPlate({
  kind,
  selected,
  rows,
  authors,
  saving,
  onRemove,
  onCancel,
  onSubmit,
}: {
  kind: ContentKind;
  selected: readonly ContentRow[];
  rows: readonly ContentRow[];
  authors: readonly { id: string; name: string }[];
  saving: boolean;
  onRemove: (id: string) => void;
  onCancel: () => void;
  onSubmit: (patch: ReturnType<typeof bulkEditPatch>) => void;
}) {
  const { t, lang } = useLang();
  const l = lang === "bn" ? "bn" : "en";
  const [draft, setDraft] = useState<BulkEditDraft>(EMPTY_BULK_EDIT);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const noChange = t("— No Change —", "— পরিবর্তন নেই —");
  const isPage = kind === "page";
  const patch = bulkEditPatch(draft);
  const dirty = Object.keys(patch).length > 0;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || selected.length === 0) return;
    onSubmit(patch);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const labelCls = "w-20 shrink-0 pt-2 text-xs font-medium fq-sub";
  const rowCls = "flex items-start gap-3";

  return (
    <form
      onSubmit={submit}
      onKeyDown={onKey}
      aria-label={t("Bulk edit", "একসাথে সম্পাদনা")}
      className="fq-enter fq-card fq-edge-inner mb-3 px-4 py-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-foreground">
        {t("Bulk Edit", "একসাথে সম্পাদনা")}{" "}
        <span className="fq-num fq-sub font-normal">({selected.length})</span>
      </h3>
      <div className="grid gap-x-8 gap-y-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <ul className="max-h-56 space-y-1 overflow-auto rounded-fq-md border border-border bg-background p-2" aria-label={t("Selected items", "নির্বাচিত আইটেম")}>
          {selected.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-fq-sm px-2 py-1 text-sm hover:bg-muted">
              <span className="truncate text-foreground">{r.title}</span>
              <button
                type="button"
                onClick={() => onRemove(r.id)}
                aria-label={`${t("Remove", "সরান")}: ${r.title}`}
                className="fq-focus-glow grid size-7 shrink-0 place-items-center rounded-fq-sm fq-sub outline-none hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
          {selected.length === 0 ? <li className="px-2 py-1 text-sm fq-sub">{t("Nothing selected.", "কিছু নির্বাচিত নেই।")}</li> : null}
        </ul>

        <div className="space-y-3">
          <div className={rowCls}>
            <label htmlFor={id("author")} className={labelCls}>
              {t("Author", "লেখক")}
            </label>
            <select
              id={id("author")}
              value={draft.authorId}
              onChange={(e) => setDraft((d) => ({ ...d, authorId: e.target.value as BulkEditDraft["authorId"] }))}
              className={inputClass}
            >
              <option value={NO_CHANGE}>{noChange}</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          {isPage ? (
            <div className={rowCls}>
              <label htmlFor={id("parent")} className={labelCls}>
                {t("Parent", "প্যারেন্ট")}
              </label>
              <select
                id={id("parent")}
                value={draft.parentId === null ? "__none__" : draft.parentId}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    parentId: e.target.value === NO_CHANGE ? NO_CHANGE : e.target.value === "__none__" ? null : e.target.value,
                  }))
                }
                className={inputClass}
              >
                <option value={NO_CHANGE}>{noChange}</option>
                <option value="__none__">{t("Main Page (no parent)", "মূল পেজ (প্যারেন্ট নেই)")}</option>
                {parentOptions(rows)
                  .filter((p) => !selected.some((s) => s.id === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {"\u00a0\u00a0".repeat(p.depth)}
                      {p.depth > 0 ? "— " : ""}
                      {p.label}
                    </option>
                  ))}
              </select>
            </div>
          ) : null}

          <div className={rowCls}>
            <label htmlFor={id("template")} className={labelCls}>
              {t("Template", "টেমপ্লেট")}
            </label>
            <select
              id={id("template")}
              value={draft.template}
              onChange={(e) => setDraft((d) => ({ ...d, template: e.target.value }))}
              className={inputClass}
            >
              <option value={NO_CHANGE}>{noChange}</option>
              {PAGE_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl[l]}
                </option>
              ))}
            </select>
          </div>

          {!isPage ? (
            <div className={rowCls}>
              <label htmlFor={id("comments")} className={labelCls}>
                {t("Comments", "মন্তব্য")}
              </label>
              <select
                id={id("comments")}
                value={draft.allowComments === NO_CHANGE ? NO_CHANGE : draft.allowComments ? "on" : "off"}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, allowComments: e.target.value === NO_CHANGE ? NO_CHANGE : e.target.value === "on" }))
                }
                className={inputClass}
              >
                <option value={NO_CHANGE}>{noChange}</option>
                <option value="on">{t("Allow", "অনুমোদন")}</option>
                <option value="off">{t("Do not allow", "অনুমোদন নয়")}</option>
              </select>
            </div>
          ) : null}

          <div className={rowCls}>
            <label htmlFor={id("status")} className={labelCls}>
              {t("Status", "স্ট্যাটাস")}
            </label>
            <select
              id={id("status")}
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as BulkEditDraft["status"] }))}
              className={inputClass}
            >
              <option value={NO_CHANGE}>{noChange}</option>
              <option value="published">{t("Published", "প্রকাশিত")}</option>
              <option value="private">{t("Private", "ব্যক্তিগত")}</option>
              <option value="pending">{t("Pending Review", "পর্যালোচনা বাকি")}</option>
              <option value="draft">{t("Draft", "খসড়া")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="submit" disabled={saving || !dirty || selected.length === 0} className={btnPrimary}>
          {saving ? t("Updating…", "আপডেট হচ্ছে…") : t("Update", "আপডেট")}
        </button>
        <button type="button" onClick={onCancel} className={btnGhost}>
          {t("Cancel", "বাতিল")}
        </button>
        {!dirty ? <span className="ml-auto text-xs fq-sub">{t("Pick at least one change.", "অন্তত একটি পরিবর্তন বেছে নিন।")}</span> : null}
      </div>
    </form>
  );
}
