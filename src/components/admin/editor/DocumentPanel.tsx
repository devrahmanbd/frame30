/**
 * Phase 12 — the "Page" / "Post" sidebar tab, top → bottom exactly as WordPress:
 * featured image plate → excerpt → stats + last edited → key/value rows with
 * popovers → Move to trash → Categories/Tags or Page attributes → SEO.
 */
import { useId, useState, type ReactNode } from "react";
import { ImagePlus, Trash2, X } from "lucide-react";
import { MediaPicker } from "@/components/builder/MediaPicker";
import { PAGE_TEMPLATES } from "@/lib/content-desk";
import {
  POST_FORMATS,
  STATUS_CHOICES,
  docStats,
  effectiveSlug,
  formatPublishDate,
  fromLocalInput,
  parentOptions,
  relativeTime,
  toLocalInput,
  type EditorDoc,
} from "@/lib/editor/editor-doc";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Collapsible, KvRow, Popover, RadioList, fieldInput } from "./primitives";

type Ctx = {
  authors: { id: string; name: string }[];
  parents: { id: string; title: string; parentId: string | null }[];
  terms: { id: string; kind: "category" | "tag"; label: string; slug: string }[];
  storeSlug: string;
  canPublish: boolean;
  /** Phase 17 — installed themes a page can pin itself to. */
  themes?: { id: string; name: string; isActive: boolean }[];
};

type Update = (patch: Partial<EditorDoc> | ((d: EditorDoc) => Partial<EditorDoc>), field?: string) => void;

type Pop =
  | "status"
  | "publish"
  | "slug"
  | "author"
  | "template"
  | "theme"
  | "discussion"
  | "format"
  | null;

export function DocumentPanel({
  doc,
  update,
  ctx,
  onTrash,
  seoSlot,
  lastSavedAt,
}: {
  doc: EditorDoc;
  update: Update;
  ctx: Ctx;
  onTrash: () => void;
  seoSlot?: ReactNode;
  lastSavedAt: string | null;
}) {
  const { t, lang } = useLang();
  const [pop, setPop] = useState<Pop>(null);
  const [excerptOpen, setExcerptOpen] = useState(!!doc.excerpt);
  const [mediaOpen, setMediaOpen] = useState(false);
  const stats = docStats(doc);
  const close = () => setPop(null);
  const L = (en: string, bn: string) => (lang === "bn" ? bn : en);

  const statusLabel = (() => {
    if (doc.status === "scheduled") return t("Scheduled", "নির্ধারিত");
    if (doc.visibility === "private") return t("Private", "ব্যক্তিগত");
    const c = STATUS_CHOICES.find((s) => s.id === doc.status);
    return c ? L(c.en, c.bn) : doc.status;
  })();
  const author = ctx.authors.find((a) => a.id === doc.authorId)?.name ?? t("Unassigned", "অনির্ধারিত");
  const template = PAGE_TEMPLATES.find((tp) => tp.id === doc.template);
  const format = POST_FORMATS.find((f) => f.id === doc.format);
  const themes = ctx.themes ?? [];
  const pinnedTheme = themes.find((theme) => theme.id === doc.themeId) ?? null;
  const slug = effectiveSlug(doc) || "…";
  const prefix = doc.kind === "page" ? `/store/${ctx.storeSlug}/pages/` : "/blog/";

  return (
    <div className="text-sm">
      {/* Featured image plate */}
      <div className="p-4">
        {doc.featuredImage ? (
          <div className="group relative overflow-hidden rounded-fq-md border border-border">
            <img src={doc.featuredImage} alt="" className="aspect-[16/9] w-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-2">
              <button type="button" onClick={() => setMediaOpen(true)} className="fq-focus-glow rounded-fq-md bg-card/90 px-2 py-1 text-xs font-medium">
                {t("Replace", "বদলান")}
              </button>
              <button type="button" onClick={() => update({ featuredImage: "" }, "featured")} aria-label={t("Remove featured image", "ফিচার ছবি সরান")} className="fq-focus-glow rounded-fq-md bg-card/90 p-1">
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMediaOpen(true)}
            className="fq-focus-glow flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-fq-md border border-dashed border-border bg-muted/40 text-xs font-medium hover:border-primary hover:bg-muted"
          >
            <ImagePlus className="size-5 text-primary" aria-hidden />
            {t("Set featured image", "ফিচার ছবি দিন")}
          </button>
        )}
        {mediaOpen && (
          <div className="mt-2 rounded-fq-md border border-border bg-background p-2">
            <MediaPicker value={doc.featuredImage} sizesPreset="hero" onPick={(url) => { update({ featuredImage: url }, "featured"); setMediaOpen(false); }} onSizes={() => undefined} />
            <button type="button" onClick={() => setMediaOpen(false)} className="fq-sub mt-2 text-xs underline-offset-2 hover:underline">
              {t("Close", "বন্ধ")}
            </button>
          </div>
        )}

        {/* Excerpt */}
        {excerptOpen ? (
          <label className="mt-3 block">
            <span className="fq-sub text-xs">{t("Excerpt", "সারাংশ")}</span>
            <textarea
              value={doc.excerpt}
              onChange={(e) => update({ excerpt: e.target.value }, "excerpt")}
              rows={3}
              maxLength={600}
              className={cn(fieldInput, "mt-1 resize-y")}
              placeholder={t("Write an excerpt (optional)", "সারাংশ লিখুন (ঐচ্ছিক)")}
            />
            <span className="fq-sub fq-num block text-right text-[11px]">{doc.excerpt.length}/600</span>
          </label>
        ) : (
          <button type="button" onClick={() => setExcerptOpen(true)} className="fq-focus-glow mt-3 inline-flex min-h-9 items-center rounded-fq-md text-sm font-medium text-primary hover:underline">
            {t("Add an excerpt…", "সারাংশ যোগ করুন…")}
          </button>
        )}

        {/* Stats */}
        <p className="fq-sub mt-3 text-xs">
          <span className="fq-num">{stats.words}</span> {t("words", "শব্দ")} · <span className="fq-num">{stats.minutes}</span> {t("min read", "মিনিট পড়া")}
          {lastSavedAt && <> · {t("Last edited", "শেষ সম্পাদনা")} {relativeTime(lastSavedAt)}</>}
        </p>
      </div>

      {/* Key/value rows */}
      <div className="space-y-0.5 px-4 pb-3">
        <Popover
          open={pop === "status"}
          onClose={close}
          title={t("Status", "অবস্থা")}
          anchor={<KvRow label={t("Status", "অবস্থা")} value={statusLabel} onClick={() => setPop(pop === "status" ? null : "status")} open={pop === "status"} />}
        >
          <RadioList
            name="status"
            value={doc.visibility === "private" ? "private" : doc.status === "scheduled" ? "published" : (doc.status as "draft" | "pending" | "private" | "published")}
            onChange={(v) => {
              if (v === "private") update({ status: "private", visibility: "private" }, "status");
              else update({ status: v, visibility: doc.visibility === "private" ? "public" : doc.visibility }, "status");
            }}
            options={STATUS_CHOICES.map((s) => ({
              id: s.id,
              label: L(s.en, s.bn),
              hint: L(s.hint.en, s.hint.bn),
              disabled: !ctx.canPublish && (s.id === "published" || s.id === "private"),
            }))}
          />
          <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm">
            <input
              type="checkbox"
              checked={doc.visibility === "password"}
              onChange={(e) => update({ visibility: e.target.checked ? "password" : "public", password: e.target.checked ? doc.password : "" }, "visibility")}
              className="size-[18px] shrink-0 accent-[var(--fq-signal)]"
            />
            {t("Password protected", "পাসওয়ার্ড সুরক্ষিত")}
          </label>
          {doc.visibility === "password" && (
            <input
              type="text"
              value={doc.password}
              onChange={(e) => update({ password: e.target.value }, "password")}
              maxLength={64}
              className={cn(fieldInput, "mt-2")}
              placeholder={t("Use a secure password", "নিরাপদ পাসওয়ার্ড দিন")}
              aria-label={t("Password", "পাসওয়ার্ড")}
            />
          )}
        </Popover>

        <Popover
          open={pop === "publish"}
          onClose={close}
          title={t("Publish", "প্রকাশ")}
          anchor={<KvRow label={t("Publish", "প্রকাশ")} value={doc.publishAt ? formatPublishDate(doc.publishAt) : t("Immediately", "এখনই")} onClick={() => setPop(pop === "publish" ? null : "publish")} open={pop === "publish"} />}
        >
          <input
            type="datetime-local"
            value={toLocalInput(doc.publishAt)}
            onChange={(e) => update({ publishAt: fromLocalInput(e.target.value) }, "publishAt")}
            className={fieldInput}
            aria-label={t("Publish date", "প্রকাশের তারিখ")}
          />
          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => update({ publishAt: null }, "publishAt")} className="fq-focus-glow rounded-fq-md text-xs font-medium text-primary hover:underline">
              {t("Immediately", "এখনই")}
            </button>
            <span className="fq-sub text-xs">{doc.publishAt && new Date(doc.publishAt).getTime() > Date.now() ? t("Will be scheduled", "নির্ধারিত হবে") : t("Publishes now", "এখনই প্রকাশ")}</span>
          </div>
        </Popover>

        <Popover
          open={pop === "slug"}
          onClose={close}
          title={t("Permalink", "স্থায়ী লিঙ্ক")}
          width={320}
          anchor={<KvRow label={t("Slug", "স্লাগ")} value={slug} onClick={() => setPop(pop === "slug" ? null : "slug")} open={pop === "slug"} />}
        >
          <input
            type="text"
            value={doc.slug}
            onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9\u0980-\u09ff-]+/g, "-") }, "slug")}
            className={fieldInput}
            placeholder={effectiveSlug({ ...doc, slug: "" })}
            aria-label={t("URL slug", "URL স্লাগ")}
          />
          <p className="fq-sub mt-2 break-all text-xs">
            {prefix}
            <span className="text-foreground">{slug}</span>
          </p>
          <p className="fq-sub mt-1 text-[11px]">{t("Changing a published URL adds a 301 redirect automatically.", "প্রকাশিত URL বদলালে স্বয়ংক্রিয় ৩০১ রিডাইরেক্ট যোগ হয়।")}</p>
        </Popover>

        <Popover
          open={pop === "author"}
          onClose={close}
          title={t("Author", "লেখক")}
          anchor={<KvRow label={t("Author", "লেখক")} value={author} onClick={() => setPop(pop === "author" ? null : "author")} open={pop === "author"} />}
        >
          <select value={doc.authorId ?? ""} onChange={(e) => update({ authorId: e.target.value || null }, "author")} className={fieldInput} aria-label={t("Author", "লেখক")}>
            <option value="">{t("Unassigned", "অনির্ধারিত")}</option>
            {ctx.authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Popover>

        <Popover
          open={pop === "template"}
          onClose={close}
          title={t("Template", "টেমপ্লেট")}
          anchor={<KvRow label={t("Template", "টেমপ্লেট")} value={template ? L(template.en, template.bn) : doc.template} onClick={() => setPop(pop === "template" ? null : "template")} open={pop === "template"} />}
        >
          <RadioList name="template" value={doc.template} onChange={(v) => update({ template: v }, "template")} options={PAGE_TEMPLATES.map((tp) => ({ id: tp.id, label: L(tp.en, tp.bn) }))} />
        </Popover>

        {doc.kind === "page" && themes.length > 0 && (
          <Popover
            open={pop === "theme"}
            onClose={close}
            title={t("Theme", "থিম")}
            anchor={
              <KvRow
                label={t("Theme", "থিম")}
                value={pinnedTheme ? pinnedTheme.name : t("Site theme", "সাইট থিম")}
                onClick={() => setPop(pop === "theme" ? null : "theme")}
                open={pop === "theme"}
              />
            }
          >
            <RadioList
              name="page-theme"
              value={doc.themeId ?? ""}
              onChange={(v) => update({ themeId: v || null }, "theme")}
              options={[
                { id: "", label: t("Site theme (follow the active theme)", "সাইট থিম (সক্রিয় থিম অনুসরণ করুন)") },
                ...themes.map((theme) => ({
                  id: theme.id,
                  label: theme.isActive ? `${theme.name} (${t("active", "সক্রিয়")})` : theme.name,
                })),
              ]}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {t(
                "Only this page uses the theme you pin here.",
                "এখানে বেছে নেওয়া থিম শুধু এই পেজে প্রযোজ্য।",
              )}
            </p>
          </Popover>
        )}

        <Popover
          open={pop === "discussion"}
          onClose={close}
          title={t("Discussion", "আলোচনা")}
          anchor={<KvRow label={t("Discussion", "আলোচনা")} value={doc.allowComments ? t("Open", "খোলা") : t("Closed", "বন্ধ")} onClick={() => setPop(pop === "discussion" ? null : "discussion")} open={pop === "discussion"} />}
        >
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={doc.allowComments} onChange={(e) => update({ allowComments: e.target.checked }, "discussion")} className="size-[18px] shrink-0 accent-[var(--fq-signal)]" />
            {t("Allow comments", "মন্তব্যের অনুমতি")}
          </label>
        </Popover>

        {doc.kind === "post" && (
          <Popover
            open={pop === "format"}
            onClose={close}
            title={t("Format", "ফরম্যাট")}
            anchor={<KvRow label={t("Format", "ফরম্যাট")} value={format ? L(format.en, format.bn) : doc.format} onClick={() => setPop(pop === "format" ? null : "format")} open={pop === "format"} />}
          >
            <RadioList name="format" value={doc.format} onChange={(v) => update({ format: v }, "format")} options={POST_FORMATS.map((f) => ({ id: f.id, label: L(f.en, f.bn) }))} />
          </Popover>
        )}
      </div>

      <button
        type="button"
        onClick={onTrash}
        className="fq-focus-glow flex min-h-11 w-full items-center gap-2 border-t border-border px-4 text-left text-sm font-medium text-[var(--fq-danger)] hover:bg-muted/60"
      >
        <Trash2 className="size-4" aria-hidden />
        {t("Move to trash", "ট্র্যাশে পাঠান")}
      </button>

      {doc.kind === "post" ? (
        <>
          <TermPicker kind="category" doc={doc} update={update} terms={ctx.terms} title={t("Categories", "বিভাগ")} />
          <TagInput doc={doc} update={update} />
        </>
      ) : (
        <Collapsible title={t("Page attributes", "পেজ বৈশিষ্ট্য")} defaultOpen>
          <PageAttributes doc={doc} update={update} parents={ctx.parents} />
        </Collapsible>
      )}

      {seoSlot}
    </div>
  );
}

function TermPicker({ kind, doc, update, terms, title }: { kind: "category" | "tag"; doc: EditorDoc; update: Update; terms: Ctx["terms"]; title: string }) {
  const { t } = useLang();
  const [filter, setFilter] = useState("");
  const key = kind === "category" ? "categories" : "tags";
  const selected = doc[key];
  const list = terms.filter((x) => x.kind === kind && (!filter || x.label.toLowerCase().includes(filter.toLowerCase())));
  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id].slice(0, 12);
    update({ [key]: next } as Partial<EditorDoc>, key);
  };
  return (
    <Collapsible title={title} badge={selected.length ? <span className="fq-num rounded-full bg-muted px-1.5 text-[11px] font-medium">{selected.length}</span> : null} defaultOpen={kind === "category"}>
      {terms.filter((x) => x.kind === kind).length > 8 && (
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("Search…", "খুঁজুন…")} className={cn(fieldInput, "mb-2")} aria-label={`${t("Search", "খুঁজুন")} ${title}`} />
      )}
      {list.length === 0 ? (
        <p className="fq-sub text-xs">{t("None yet — create them under Blog › Taxonomy.", "এখনও নেই — ব্লগ › ট্যাক্সোনমি থেকে তৈরি করুন।")}</p>
      ) : (
        <ul className="max-h-48 space-y-0.5 overflow-auto">
          {list.map((term) => (
            <li key={term.id}>
              <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded-fq-md px-1 text-sm hover:bg-muted">
                <input type="checkbox" checked={selected.includes(term.id)} onChange={() => toggle(term.id)} className="size-[18px] shrink-0 accent-[var(--fq-signal)]" />
                <span className="truncate">{term.label}</span>
                {selected[0] === term.id && kind === "category" && <span className="fq-sub ml-auto text-[11px]">{t("Primary", "প্রাথমিক")}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Collapsible>
  );
}

function PageAttributes({ doc, update, parents }: { doc: EditorDoc; update: Update; parents: Ctx["parents"] }) {
  const { t } = useLang();
  const id = useId();
  const options = parentOptions(parents, doc.id);
  return (
    <div className="space-y-3">
      <label htmlFor={`${id}-parent`} className="block">
        <span className="fq-sub text-xs">{t("Parent page", "মূল পেজ")}</span>
        <select id={`${id}-parent`} value={doc.parentId ?? ""} onChange={(e) => update({ parentId: e.target.value || null }, "parent")} className={cn(fieldInput, "mt-1")}>
          <option value="">{t("(no parent)", "(মূল নেই)")}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {`${"— ".repeat(o.depth)}${o.title || t("Untitled", "শিরোনামহীন")}`}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor={`${id}-order`} className="block">
        <span className="fq-sub text-xs">{t("Order", "ক্রম")}</span>
        <input id={`${id}-order`} type="number" min={0} max={9999} value={doc.menuOrder} onChange={(e) => update({ menuOrder: Math.max(0, Math.min(9999, Number(e.target.value) || 0)) }, "order")} className={cn(fieldInput, "fq-num mt-1")} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={doc.showInNav} onChange={(e) => update({ showInNav: e.target.checked }, "nav")} className="size-[18px] shrink-0 accent-[var(--fq-signal)]" />
        {t("Show in storefront navigation", "স্টোর নেভিগেশনে দেখান")}
      </label>
    </div>
  );
}

/** WordPress-style tag box: type, press Enter or comma, chips with ×. Stored on `articles.tags`. */
function TagInput({ doc, update }: { doc: EditorDoc; update: Update }) {
  const { t } = useLang();
  const [draft, setDraft] = useState("");
  const id = useId();
  const add = () => {
    const parts = draft.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...doc.tags];
    for (const p of parts) if (!next.includes(p) && next.length < 12) next.push(p.slice(0, 40));
    update({ tags: next }, "tags");
    setDraft("");
  };
  return (
    <Collapsible title={t("Tags", "ট্যাগ")} badge={doc.tags.length ? <span className="fq-num rounded-full bg-muted px-1.5 text-[11px] font-medium">{doc.tags.length}</span> : null}>
      <label htmlFor={`${id}-tag`} className="fq-sub text-xs">
        {t("Add new tag", "নতুন ট্যাগ")}
      </label>
      <div className="mt-1 flex gap-1.5">
        <input
          id={`${id}-tag`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={80}
          className={fieldInput}
          placeholder={t("Separate with commas", "কমা দিয়ে আলাদা করুন")}
        />
        <button type="button" onClick={add} className="fq-focus-glow min-h-8 rounded-fq-md border border-border px-2.5 text-xs font-medium hover:bg-muted">
          {t("Add", "যোগ")}
        </button>
      </div>
      {doc.tags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("Tags", "ট্যাগ")}>
          {doc.tags.map((tag) => (
            <li key={tag} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
              {tag}
              <button type="button" onClick={() => update({ tags: doc.tags.filter((x) => x !== tag) }, "tags")} aria-label={`${t("Remove", "সরান")} ${tag}`} className="fq-focus-glow inline-flex size-5 items-center justify-center rounded-full hover:bg-background">
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Collapsible>
  );
}
