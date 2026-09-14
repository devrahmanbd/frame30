import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Keyboard, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  BulkBar,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  Toolbar,
  btnGhost,
  btnPrimary,
  inputClass,
  optimistic,
  type Column,
} from "@/components/console/kit";
import { useLang } from "@/lib/i18n";
import { useListState } from "@/lib/use-list-state";
import { cn } from "@/lib/utils";
import {
  BULK_ACTION_LABEL,
  bulkActionsFor,
  bulkEditPatch,
  dateBuckets,
  effectiveStatus,
  filterRows,
  sortRows,
  STATUS_VIEWS,
  type BulkAction,
  type ContentKind,
  type ContentRow,
  type ContentStatus,
  type QuickEditDraft,
  type RowAction,
  type SortKey,
  type StatusView,
} from "@/lib/content-desk";
import {
  contentBulkEditFn,
  contentBulkVerbFn,
  contentCreateDraftFn,
  contentDeleteForeverFn,
  contentDeskFn,
  contentQuickEditFn,
} from "@/lib/content-desk.functions";
import type { ContentDesk as DeskPayload } from "@/lib/content-desk.server";
import { editHref } from "./content-links";
import { StatusStrip } from "./StatusStrip";
import { QuickEditPlate } from "./QuickEditPlate";
import { BulkEditPlate } from "./BulkEditPlate";
import { ShortcutHelp } from "./ShortcutHelp";
import { AuthorCell, DateCell, SeoCell, TermsCell, TitleCell } from "./cells";

const COPY = {
  page: {
    title: { en: "Pages", bn: "পেজসমূহ" },
    add: { en: "Add New Page", bn: "নতুন পেজ" },
    search: { en: "Search pages", bn: "পেজ খুঁজুন" },
    empty: { en: "No pages found.", bn: "কোনো পেজ পাওয়া যায়নি।" },
    one: { en: "page", bn: "পেজ" },
    many: { en: "pages", bn: "পেজ" },
  },
  post: {
    title: { en: "Posts", bn: "পোস্টসমূহ" },
    add: { en: "Add New Post", bn: "নতুন পোস্ট" },
    search: { en: "Search posts", bn: "পোস্ট খুঁজুন" },
    empty: { en: "No posts found.", bn: "কোনো পোস্ট পাওয়া যায়নি।" },
    one: { en: "post", bn: "পোস্ট" },
    many: { en: "posts", bn: "পোস্ট" },
  },
} as const;

type Pending = { action: "trash" | "delete"; ids: string[] } | null;

export function ContentDesk({ kind }: { kind: ContentKind }) {
  const { t, lang } = useLang();
  const l = lang === "bn" ? "bn" : "en";
  const copy = COPY[kind];
  const navigate = useNavigate();
  const qc = useQueryClient();
  const list = useListState({ defaultSort: "date", defaultDir: "desc", pageSize: 20 });

  const loadDesk = useServerFn(contentDeskFn);
  const quickEdit = useServerFn(contentQuickEditFn);
  const bulkEdit = useServerFn(contentBulkEditFn);
  const bulkVerb = useServerFn(contentBulkVerbFn);
  const deleteForever = useServerFn(contentDeleteForeverFn);
  const createDraft = useServerFn(contentCreateDraftFn);

  const queryKey = useMemo(() => ["content-desk", kind] as const, [kind]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => loadDesk({ data: { kind } }),
    staleTime: 15_000,
  });

  const setDesk = useCallback(
    (fn: (d: DeskPayload) => DeskPayload) => qc.setQueryData<DeskPayload>(queryKey, (d) => (d ? fn(d) : d)),
    [qc, queryKey],
  );

  /* ------------------------------------------------------------ UI state */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quickId, setQuickId] = useState<string | null>(null);
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkPick, setBulkPick] = useState<BulkAction | "">("");
  const [pending, setPending] = useState<Pending>(null);
  const [help, setHelp] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const view = (STATUS_VIEWS as readonly string[]).includes(list.view) ? (list.view as StatusView) : "all";
  const bucket = list.param("m") || undefined;
  const category = list.param("cat") || undefined;

  const rows = data?.rows ?? [];
  const filtered = useMemo(
    () => sortRows(filterRows(rows, { view, q: list.q, bucket, category }), (list.sort as SortKey) || "", list.dir),
    [rows, view, list.q, bucket, category, list.sort, list.dir],
  );
  const pageRows = list.paginate(filtered);
  const buckets = useMemo(() => dateBuckets(rows), [rows]);

  // Selection follows the visible view: switching tabs clears stale picks.
  useEffect(() => {
    setSelected(new Set());
    setBulkOpen(false);
    setQuickId(null);
  }, [view, kind]);

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  /* ------------------------------------------------------------ mutations */
  const patchRows = (ids: readonly string[], patch: Partial<ContentRow>, counts?: (c: DeskPayload["counts"]) => DeskPayload["counts"]) =>
    setDesk((d) => ({
      ...d,
      rows: d.rows.map((r) => (ids.includes(r.id) ? { ...r, ...patch } : r)),
      counts: counts ? counts(d.counts) : d.counts,
    }));

  const shiftCounts = (moved: readonly ContentRow[], to: ContentStatus | null) => (c: DeskPayload["counts"]) => {
    const next = { ...c };
    for (const r of moved) {
      next[r.status] = Math.max(0, (next[r.status] ?? 0) - 1);
      if (to) next[to] = (next[to] ?? 0) + 1;
    }
    return next;
  };

  const runVerb = async (verb: "trash" | "restore" | "publish" | "unpublish", ids: string[]) => {
    const snapshot = qc.getQueryData<DeskPayload>(queryKey);
    const moved = rows.filter((r) => ids.includes(r.id));
    const to: ContentStatus =
      verb === "trash" ? "trash" : verb === "publish" ? "published" : verb === "unpublish" ? "draft" : "draft";
    const label = BULK_ACTION_LABEL[verb][l];
    const now = new Date().toISOString();
    await optimistic({
      label,
      apply: () =>
        patchRows(
          ids,
          verb === "trash"
            ? { status: "trash", trashedAt: now }
            : verb === "restore"
              ? { status: "draft", trashedAt: null }
              : { status: to, trashedAt: null, publishedAt: verb === "publish" ? now : null },
          shiftCounts(moved, to),
        ),
      rollback: () => qc.setQueryData(queryKey, snapshot),
      run: () => bulkVerb({ data: { kind, ids, verb } }),
      onDone: () => {
        setSelected(new Set());
        const n = ids.length;
        const done = {
          trash: t(`${n} moved to Trash.`, `${n}টি ট্র্যাশে পাঠানো হয়েছে।`),
          restore: t(`${n} restored.`, `${n}টি ফিরিয়ে আনা হয়েছে।`),
          publish: t(`${n} published.`, `${n}টি প্রকাশিত হয়েছে।`),
          unpublish: t(`${n} unpublished.`, `${n}টি অপ্রকাশিত করা হয়েছে।`),
        } as const;
        toast.success(
          done[verb],
          verb === "trash"
            ? { action: { label: t("Undo", "পূর্বাবস্থা"), onClick: () => void runVerb("restore", ids) } }
            : undefined,
        );
        void refetch();
      },
    });
  };

  const runDelete = async (ids: string[]) => {
    const snapshot = qc.getQueryData<DeskPayload>(queryKey);
    const moved = rows.filter((r) => ids.includes(r.id));
    await optimistic({
      label: BULK_ACTION_LABEL.delete[l],
      apply: () =>
        setDesk((d) => ({
          ...d,
          rows: d.rows.filter((r) => !ids.includes(r.id)),
          counts: shiftCounts(moved, null)(d.counts),
        })),
      rollback: () => qc.setQueryData(queryKey, snapshot),
      run: () => deleteForever({ data: { kind, ids } }),
      onDone: () => {
        setSelected(new Set());
        toast.success(t(`${ids.length} deleted permanently.`, `${ids.length}টি স্থায়ীভাবে মুছে ফেলা হয়েছে।`));
      },
    });
  };

  const onRowAction = (action: RowAction, row: ContentRow) => {
    if (action === "quick-edit") {
      setQuickError(null);
      setQuickId(row.id);
      return;
    }
    if (action === "trash") return void runVerb("trash", [row.id]);
    if (action === "restore") return void runVerb("restore", [row.id]);
    if (action === "delete") return setPending({ action: "delete", ids: [row.id] });
  };

  const submitQuick = async (draft: QuickEditDraft) => {
    if (!quickId) return;
    setQuickSaving(true);
    setQuickError(null);
    const eff = effectiveStatus(draft);
    try {
      await quickEdit({
        data: {
          kind,
          id: quickId,
          title: draft.title.trim(),
          slug: draft.slug,
          date: draft.date || null,
          password: draft.isPrivate ? null : draft.password || null,
          parentId: kind === "page" ? draft.parentId : null,
          menuOrder: draft.menuOrder,
          template: draft.template,
          status: eff.status,
          visibility: eff.visibility,
          allowComments: draft.allowComments,
        },
      });
      setQuickId(null);
      toast.success(t("Updated.", "আপডেট হয়েছে।"));
      await refetch();
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`tr[data-row-id="${quickId}"]`)?.focus();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setQuickError(
        msg.includes("slug") || msg.includes("duplicate")
          ? t("That slug is already in use.", "এই স্লাগ ইতিমধ্যে ব্যবহৃত।")
          : msg,
      );
    } finally {
      setQuickSaving(false);
    }
  };

  const submitBulk = async (patch: ReturnType<typeof bulkEditPatch>) => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkSaving(true);
    try {
      const res = await bulkEdit({ data: { kind, ids, patch } });
      toast.success(t(`${res.updated} updated.`, `${res.updated}টি আপডেট হয়েছে।`));
      setBulkOpen(false);
      setSelected(new Set());
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkSaving(false);
    }
  };

  const applyBulkPick = () => {
    const ids = [...selected];
    if (!bulkPick || ids.length === 0) return;
    if (bulkPick === "edit") return setBulkOpen(true);
    if (bulkPick === "delete") return setPending({ action: "delete", ids });
    if (bulkPick === "trash" && ids.length > 5) return setPending({ action: "trash", ids });
    void runVerb(bulkPick, ids);
  };

  const onAddNew = async () => {
    setCreating(true);
    try {
      const { id } = await createDraft({ data: { kind } });
      await qc.invalidateQueries({ queryKey });
      void navigate({ to: editHref(kind, id) as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  /* ------------------------------------------------------ keyboard layer */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setHelp((h) => !h);
        return;
      }
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      const tr = target?.closest<HTMLElement>("tr[data-row-id]");
      if (!tr) return;
      const id = tr.dataset.rowId;
      const row = id ? rows.find((r) => r.id === id) : undefined;
      if (!row) return;
      const step = (dir: 1 | -1) => {
        const all = [...tr.parentElement!.querySelectorAll<HTMLElement>("tr[data-row-id]")];
        const i = all.indexOf(tr);
        all[Math.min(all.length - 1, Math.max(0, i + dir))]?.focus();
      };
      switch (e.key) {
        case "j":
          e.preventDefault();
          step(1);
          break;
        case "k":
          e.preventDefault();
          step(-1);
          break;
        case "x":
          e.preventDefault();
          toggle(row.id);
          break;
        case "e":
          if (row.status !== "trash") {
            e.preventDefault();
            void navigate({ to: editHref(kind, row.id) as never });
          }
          break;
        case "q":
          if (row.status !== "trash") {
            e.preventDefault();
            onRowAction("quick-edit", row);
          }
          break;
        case "#":
          if (row.status !== "trash") {
            e.preventDefault();
            void runVerb("trash", [row.id]);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, kind]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = (next: boolean) => setSelected(next ? new Set(pageRows.map((r) => r.id)) : new Set());

  /* --------------------------------------------------------------- columns */
  const storeSlug = data?.storeSlug ?? "";
  // Cells are memoised per kind/lang; route actions through a ref so they
  // always see the latest rows/counts rather than a stale closure.
  const actionRef = useRef(onRowAction);
  actionRef.current = onRowAction;
  const columns = useMemo<Column<ContentRow>[]>(() => {
    const act = (a: RowAction, row: ContentRow) => actionRef.current(a, row);
    const cols: Column<ContentRow>[] = [
      {
        key: "title",
        header: t("Title", "শিরোনাম"),
        sortable: true,
        width: "auto",
        cell: (row) => <TitleCell row={row} storeSlug={storeSlug} onAction={act} />,
      },
      { key: "author", header: t("Author", "লেখক"), sortable: true, width: "9rem", cell: (row) => <AuthorCell name={row.authorName} /> },
    ];
    if (kind === "post") {
      cols.push(
        { key: "categories", header: t("Categories", "ক্যাটাগরি"), width: "11rem", cell: (row) => <TermsCell items={row.categories} emptyLabel={t("Uncategorized", "শ্রেণিহীন")} /> },
        { key: "tags", header: t("Tags", "ট্যাগ"), width: "11rem", cell: (row) => <TermsCell items={row.tags} emptyLabel="—" /> },
      );
    }
    cols.push(
      { key: "seo", header: "SEO", sortable: true, width: "11rem", cell: (row) => <SeoCell seo={row.seo} /> },
      { key: "date", header: t("Date", "তারিখ"), sortable: true, width: "11rem", cell: (row) => <DateCell row={row} /> },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, storeSlug, lang]);

  const bulkOptions = bulkActionsFor(view);
  const noun = (n: number) => (n === 1 ? copy.one[l] : copy.many[l]);

  /* ---------------------------------------------------------------- render */
  return (
    <Page
      title={copy.title[l]}
      description={t(
        "Manage, quick-edit and publish. Hover a row for actions; press ? for shortcuts.",
        "পরিচালনা, দ্রুত সম্পাদনা ও প্রকাশ। অ্যাকশনের জন্য সারিতে হোভার করুন; শর্টকাটের জন্য ? চাপুন।",
      )}
      actions={
        <>
          <button type="button" onClick={() => setHelp(true)} className={btnGhost} aria-label={t("Keyboard shortcuts", "কীবোর্ড শর্টকাট")}>
            <Keyboard className="size-4" aria-hidden />
          </button>
          <button type="button" onClick={onAddNew} disabled={creating} className={btnPrimary}>
            <Plus className="size-4" aria-hidden />
            {creating ? t("Creating…", "তৈরি হচ্ছে…") : copy.add[l]}
          </button>
        </>
      }
    >
      <StatusStrip counts={data?.counts ?? {}} active={view} onSelect={(v) => list.setView(v)} />

      <Toolbar
        end={
          <label className="relative block">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 fq-sub" />
            <input
              ref={searchRef}
              type="search"
              value={list.q}
              onChange={(e) => list.setQ(e.target.value)}
              placeholder={`${copy.search[l]}  /`}
              aria-label={copy.search[l]}
              className={cn(inputClass, "w-56 pl-8")}
            />
          </label>
        }
      >
        <select
          value={bulkPick}
          onChange={(e) => setBulkPick(e.target.value as BulkAction | "")}
          aria-label={t("Bulk actions", "একসাথে অ্যাকশন")}
          className={cn(inputClass, "w-auto")}
        >
          <option value="">{t("Bulk actions", "একসাথে অ্যাকশন")}</option>
          {bulkOptions.map((a) => (
            <option key={a} value={a}>
              {BULK_ACTION_LABEL[a][l]}
            </option>
          ))}
        </select>
        <button type="button" onClick={applyBulkPick} disabled={!bulkPick || selected.size === 0} className={btnGhost}>
          {t("Apply", "প্রয়োগ")}
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <select
          value={bucket ?? ""}
          onChange={(e) => list.setParam("m", e.target.value)}
          aria-label={t("Filter by date", "তারিখ অনুযায়ী ফিল্টার")}
          className={cn(inputClass, "w-auto")}
        >
          <option value="">{t("All dates", "সব তারিখ")}</option>
          {buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        {kind === "post" ? (
          <select
            value={category ?? ""}
            onChange={(e) => list.setParam("cat", e.target.value)}
            aria-label={t("Filter by category", "ক্যাটাগরি অনুযায়ী ফিল্টার")}
            className={cn(inputClass, "w-auto")}
          >
            <option value="">{t("All Categories", "সব ক্যাটাগরি")}</option>
            {(data?.categories ?? []).map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        {list.q || bucket || category ? (
          <button
            type="button"
            onClick={() => {
              list.setQ("");
              list.setParam("m", "");
              list.setParam("cat", "");
            }}
            className={cn(btnGhost, "text-xs")}
          >
            <X className="size-3.5" aria-hidden />
            {t("Clear filters", "ফিল্টার মুছুন")}
          </button>
        ) : null}
        <span className="ml-1 text-xs fq-sub" aria-live="polite">
          <span className="fq-num">{filtered.length}</span> {noun(filtered.length)}
        </span>
      </Toolbar>

      {bulkOpen ? (
        <BulkEditPlate
          kind={kind}
          selected={selectedRows}
          rows={rows}
          authors={data?.authors ?? []}
          saving={bulkSaving}
          onRemove={toggle}
          onCancel={() => setBulkOpen(false)}
          onSubmit={(patch) => void submitBulk(patch)}
        />
      ) : null}

      {error ? (
        <ErrorState title={t("Couldn't load", "লোড করা যায়নি")} message={(error as Error).message} onRetry={() => void refetch()} />
      ) : (
        <DataTable
          rows={pageRows}
          columns={columns}
          rowKey={(r) => r.id}
          rowLabel={(r) => r.title}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          onRowClick={(r) => {
            if (r.status !== "trash") void navigate({ to: editHref(kind, r.id) as never });
          }}
          sort={list.sort}
          dir={list.dir}
          onSort={list.toggleSort}
          loading={isLoading}
          page={list.page}
          pageSize={list.pageSize}
          total={filtered.length}
          onPage={list.setPage}
          expandedKey={quickId}
          renderExpanded={(row) => (
            <QuickEditPlate
              key={row.id}
              row={row}
              rows={rows}
              storeSlug={storeSlug}
              saving={quickSaving}
              serverError={quickError}
              onCancel={() => {
                setQuickId(null);
                requestAnimationFrame(() => document.querySelector<HTMLElement>(`tr[data-row-id="${row.id}"]`)?.focus());
              }}
              onSubmit={(d) => void submitQuick(d)}
            />
          )}
          empty={
            <EmptyState
              title={copy.empty[l]}
              description={
                view === "trash"
                  ? t("Trash is empty.", "ট্র্যাশ খালি।")
                  : list.q
                    ? t("Try a different search.", "অন্যভাবে খুঁজে দেখুন।")
                    : t("Create your first one to get started.", "শুরু করতে প্রথমটি তৈরি করুন।")
              }
              action={
                view !== "trash" && !list.q ? (
                  <button type="button" onClick={onAddNew} className={btnPrimary}>
                    <Plus className="size-4" aria-hidden />
                    {copy.add[l]}
                  </button>
                ) : undefined
              }
            />
          }
        />
      )}

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        {bulkOptions.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              setBulkPick(a);
              const ids = [...selected];
              if (a === "edit") setBulkOpen(true);
              else if (a === "delete") setPending({ action: "delete", ids });
              else void runVerb(a, ids);
            }}
            className={cn(btnGhost, "text-xs", (a === "trash" || a === "delete") && "text-[var(--fq-danger)]")}
          >
            {BULK_ACTION_LABEL[a][l]}
          </button>
        ))}
      </BulkBar>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.action === "delete"
            ? t(`Delete ${pending.ids.length} ${noun(pending.ids.length)} permanently?`, `${pending?.ids.length}টি ${noun(pending?.ids.length ?? 0)} স্থায়ীভাবে মুছবেন?`)
            : t(`Move ${pending?.ids.length ?? 0} ${noun(pending?.ids.length ?? 0)} to Trash?`, `${pending?.ids.length ?? 0}টি ট্র্যাশে পাঠাবেন?`)
        }
        description={
          pending?.action === "delete"
            ? t("This cannot be undone. Content, revisions and SEO data are removed.", "এটি ফেরানো যাবে না। কনটেন্ট, রিভিশন ও SEO ডেটা মুছে যাবে।")
            : t("You can restore from Trash within 30 days.", "৩০ দিনের মধ্যে ট্র্যাশ থেকে ফিরিয়ে আনা যাবে।")
        }
        confirmLabel={pending?.action === "delete" ? BULK_ACTION_LABEL.delete[l] : BULK_ACTION_LABEL.trash[l]}
        cancelLabel={t("Cancel", "বাতিল")}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (!p) return;
          if (p.action === "delete") void runDelete(p.ids);
          else void runVerb("trash", p.ids);
        }}
      />

      <ShortcutHelp open={help} onClose={() => setHelp(false)} />
    </Page>
  );
}
