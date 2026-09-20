/**
 * Phase 16 — the media library screen.
 *
 * `List | Grid` toggle, inline upload drop-zone, type/date filters, search,
 * bulk select and the attachment modal — the WordPress §E screen in our own
 * register. Every mutation goes through the server functions, so RLS scopes
 * the library to the signed-in merchant.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Images, LayoutGrid, List, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  BulkBar,
  Card,
  ConfirmDialog,
  EmptyState,
  InlineError,
  Page,
  Skeleton,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/console/kit";
import { cn } from "@/lib/utils";
import {
  mediaDeleteAttachmentsFn,
  mediaLibraryFn,
  mediaUpdateAttachmentFn,
  mediaUploadAttachmentFn,
} from "@/lib/media/library.functions";
import {
  EMPTY_FILTERS,
  type Attachment,
  type MediaFilters,
  type MediaSortKey,
  type MediaTypeFilter,
  type MediaView,
  filterAttachments,
  filtersActive,
  formatBytes,
  missingAltCount,
  monthOptions,
  neighbourAttachment,
  selectRange,
  sortAttachments,
  toggleSelected,
  typeCounts,
} from "@/lib/media/library";
import { AttachmentModal, type AttachmentPatch } from "./AttachmentModal";
import { MediaGrid, MediaList } from "./MediaGrid";
import { UploadDropzone, toPendingUpload } from "./UploadDropzone";

const TYPE_PILLS: { key: MediaTypeFilter; label: string }[] = [
  { key: "all", label: "All media" },
  { key: "image", label: "Images" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "document", label: "Documents" },
  { key: "vector", label: "SVG" },
  { key: "missing-alt", label: "Missing Alt" },
];

const TYPE_OPTIONS: { key: MediaTypeFilter; label: string }[] = [
  ...TYPE_PILLS,
];

export function MediaScreen() {
  const qc = useQueryClient();
  const load = useServerFn(mediaLibraryFn);
  const upload = useServerFn(mediaUploadAttachmentFn);
  const patch = useServerFn(mediaUpdateAttachmentFn);
  const destroy = useServerFn(mediaDeleteAttachmentsFn);

  const [view, setView] = useState<MediaView>("grid");
  const [filters, setFilters] = useState<MediaFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<MediaSortKey>("date-desc");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | {
    ids: string[];
    label: string;
  }>(null);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["media", "library"],
    queryFn: () => load({}),
    staleTime: 15_000,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const visible = useMemo(
    () => sortAttachments(filterAttachments(items, filters), sortKey),
    [items, filters, sortKey],
  );
  const counts = useMemo(() => typeCounts(items), [items]);
  const months = useMemo(() => monthOptions(items), [items]);
  const open = visible.find((item) => item.id === openId) ?? null;
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  const missingAlt = missingAltCount(items);

  const refresh = () =>
    void qc.invalidateQueries({ queryKey: ["media", "library"] });

  const uploadFiles = useMutation({
    mutationFn: async (files: File[]) => {
      setProgress({ done: 0, total: files.length });
      for (let i = 0; i < files.length; i += 1) {
        const pending = await toPendingUpload(files[i]!);
        await upload({ data: pending });
        setProgress({ done: i + 1, total: files.length });
      }
    },
    onSuccess: () => {
      setError(null);
      setProgress(null);
      refresh();
    },
    onError: (e: Error) => {
      setProgress(null);
      setError(e.message);
    },
  });

  const saveDetails = useMutation({
    mutationFn: (input: AttachmentPatch & { id: string }) =>
      patch({ data: input }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (ids: string[]) => destroy({ data: { ids } }),
    onSuccess: () => {
      setError(null);
      setSelected([]);
      setConfirm(null);
      setOpenId(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = (item: Attachment, shift: boolean) => {
    setSelected((current) =>
      shift
        ? selectRange(visible, anchor.current, item.id, current)
        : toggleSelected(current, item.id),
    );
    anchor.current = item.id;
  };

  const busy = uploadFiles.isPending;

  return (
    <Page
      title="Media"
      description="Every image, vector, video and document your store uses, in one library."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center rounded-fq-md border border-border p-0.5"
            role="group"
            aria-label="Library view"
          >
            <ViewButton
              active={view === "list"}
              label="List view"
              onClick={() => setView("list")}
            >
              <List className="size-4" aria-hidden />
            </ViewButton>
            <ViewButton
              active={view === "grid"}
              label="Grid view"
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="size-4" aria-hidden />
            </ViewButton>
          </div>
          {selecting ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  if (selected.length === visible.length && visible.length > 0) {
                    setSelected([]);
                  } else {
                    setSelected(visible.map((item) => item.id));
                  }
                }}
              >
                {selected.length === visible.length && visible.length > 0
                  ? "Deselect all"
                  : `Select all (${visible.length})`}
              </button>
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setSelecting(false);
                  setSelected([]);
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={btnGhost}
              aria-pressed={selecting}
              onClick={() => {
                setSelecting(true);
                setSelected([]);
              }}
            >
              Bulk select
            </button>
          )}
          <button
            type="button"
            className={btnPrimary}
            onClick={() => setUploadOpen((current) => !current)}
          >
            <Plus className="size-4" aria-hidden />
            <span className="ml-1">Add media file</span>
          </button>
        </div>
      }
    >
      {error && <InlineError message={error} />}

      {uploadOpen && (
        <UploadDropzone
          busy={busy}
          progress={progress}
          onClose={() => setUploadOpen(false)}
          onFiles={(files) => uploadFiles.mutate(files)}
        />
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3 mb-3">
          {TYPE_PILLS.map((pill) => {
            const active = filters.type === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFilters({ ...filters, type: pill.key })}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <span>{pill.label}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background text-muted-foreground",
                  )}
                >
                  {counts[pill.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Search media
            </span>
            <input
              type="search"
              className={inputClass}
              placeholder="Search by name, title or alt text"
              value={filters.query}
              onChange={(event) =>
                setFilters({ ...filters, query: event.target.value })
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Type
            </span>
            <select
              className={inputClass}
              value={filters.type}
              onChange={(event) =>
                setFilters({
                  ...filters,
                  type: event.target.value as MediaTypeFilter,
                })
              }
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({counts[option.key] ?? 0})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Date
            </span>
            <select
              className={inputClass}
              value={filters.month}
              onChange={(event) =>
                setFilters({ ...filters, month: event.target.value })
              }
            >
              <option value="all">All dates</option>
              {months.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sort
            </span>
            <select
              className={inputClass}
              value={sortKey}
              onChange={(event) =>
                setSortKey(event.target.value as MediaSortKey)
              }
            >
              <option value="date-desc">Newest first</option>
              <option value="date-asc">Oldest first</option>
              <option value="name-asc">Name (A–Z)</option>
              <option value="name-desc">Name (Z–A)</option>
              <option value="size-desc">Largest size</option>
              <option value="size-asc">Smallest size</option>
            </select>
          </label>
          {filtersActive(filters) && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => setFilters(EMPTY_FILTERS)}
            >
              Clear filters
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          {visible.length} of {items.length} files · {formatBytes(totalBytes)}{" "}
          stored
          {missingAlt > 0
            ? ` · ${missingAlt} image${missingAlt === 1 ? "" : "s"} missing alt text`
            : ""}
        </p>
      </Card>

      {query.isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square rounded-fq-md" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Images className="size-6" aria-hidden />}
          title={
            filtersActive(filters)
              ? "No files match those filters"
              : "Your library is empty"
          }
          description={
            filtersActive(filters)
              ? "Try a different search, type or month."
              : "Upload a logo, product photo or document to get started."
          }
          action={
            filtersActive(filters) ? (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => setFilters(EMPTY_FILTERS)}
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => setUploadOpen(true)}
              >
                Add media file
              </button>
            )
          }
        />
      ) : view === "grid" ? (
        <MediaGrid
          items={visible}
          selecting={selecting}
          selected={selected}
          onOpen={(item) => setOpenId(item.id)}
          onToggle={toggle}
          onSelectAll={(ids) => setSelected(ids)}
          onClearSelection={() => setSelected([])}
        />
      ) : (
        <MediaList
          items={visible}
          selecting={selecting}
          selected={selected}
          onOpen={(item) => setOpenId(item.id)}
          onToggle={toggle}
          onSelectAll={(ids) => setSelected(ids)}
          onClearSelection={() => setSelected([])}
        />
      )}

      {selecting && selected.length > 0 && (
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-fq-md px-3 text-sm font-medium transition-colors hover:bg-muted"
              onClick={() => {
                const urls = items
                  .filter((i) => selected.includes(i.id))
                  .map((i) => i.url)
                  .join("\n");
                void navigator.clipboard.writeText(urls);
                toast.success(
                  `${selected.length} URL${selected.length === 1 ? "" : "s"} copied to clipboard`,
                );
              }}
            >
              <Copy className="size-4" />
              <span>Copy URLs</span>
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-fq-md px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              onClick={() =>
                setConfirm({
                  ids: selected,
                  label: `${selected.length} file${selected.length === 1 ? "" : "s"}`,
                })
              }
            >
              Delete permanently
            </button>
          </div>
        </BulkBar>
      )}

      {open && (
        <AttachmentModal
          item={open}
          hasPrevious={Boolean(neighbourAttachment(visible, open.id, -1))}
          hasNext={Boolean(neighbourAttachment(visible, open.id, 1))}
          saving={saveDetails.isPending}
          onClose={() => setOpenId(null)}
          onStep={(step) => {
            const next = neighbourAttachment(visible, open.id, step);
            if (next) setOpenId(next.id);
          }}
          onSave={(draft) => saveDetails.mutate({ ...draft, id: open.id })}
          onDelete={() => setConfirm({ ids: [open.id], label: open.fileName })}
        />
      )}

      {confirm && (
        <ConfirmDialog
          open
          destructive
          title="Delete permanently?"
          description={`${confirm.label} will be removed from the library and from anywhere it is used. This cannot be undone.`}
          confirmLabel="Delete permanently"
          onConfirm={() => remove.mutate(confirm.ids)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Page>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "grid size-10 place-items-center rounded-fq-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
