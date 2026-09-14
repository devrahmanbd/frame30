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
import { Images, LayoutGrid, List, Plus } from "lucide-react";
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
  type MediaTypeFilter,
  type MediaView,
  filterAttachments,
  filtersActive,
  formatBytes,
  missingAltCount,
  monthOptions,
  neighbourAttachment,
  selectRange,
  toggleSelected,
  typeCounts,
} from "@/lib/media/library";
import { AttachmentModal, type AttachmentPatch } from "./AttachmentModal";
import { MediaGrid, MediaList } from "./MediaGrid";
import { UploadDropzone, toPendingUpload } from "./UploadDropzone";

const TYPE_OPTIONS: { key: MediaTypeFilter; label: string }[] = [
  { key: "all", label: "All media" },
  { key: "image", label: "Images" },
  { key: "vector", label: "SVG" },
  { key: "video", label: "Video" },
  { key: "audio", label: "Audio" },
  { key: "document", label: "Documents" },
];

export function MediaScreen() {
  const qc = useQueryClient();
  const load = useServerFn(mediaLibraryFn);
  const upload = useServerFn(mediaUploadAttachmentFn);
  const patch = useServerFn(mediaUpdateAttachmentFn);
  const destroy = useServerFn(mediaDeleteAttachmentsFn);

  const [view, setView] = useState<MediaView>("grid");
  const [filters, setFilters] = useState<MediaFilters>(EMPTY_FILTERS);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { ids: string[]; label: string }>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const anchor = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ["media", "library"],
    queryFn: () => load({}),
    staleTime: 15_000,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const visible = useMemo(() => filterAttachments(items, filters), [items, filters]);
  const counts = useMemo(() => typeCounts(items), [items]);
  const months = useMemo(() => monthOptions(items), [items]);
  const open = visible.find((item) => item.id === openId) ?? null;
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  const missingAlt = missingAltCount(items);

  const refresh = () => void qc.invalidateQueries({ queryKey: ["media", "library"] });

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
    mutationFn: (input: AttachmentPatch & { id: string }) => patch({ data: input }),
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
      shift ? selectRange(visible, anchor.current, item.id, current) : toggleSelected(current, item.id),
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
            <ViewButton active={view === "list"} label="List view" onClick={() => setView("list")}>
              <List className="size-4" aria-hidden />
            </ViewButton>
            <ViewButton active={view === "grid"} label="Grid view" onClick={() => setView("grid")}>
              <LayoutGrid className="size-4" aria-hidden />
            </ViewButton>
          </div>
          <button
            type="button"
            className={btnGhost}
            aria-pressed={selecting}
            onClick={() => {
              setSelecting((current) => !current);
              setSelected([]);
            }}
          >
            {selecting ? "Cancel select" : "Bulk select"}
          </button>
          <button type="button" className={btnPrimary} onClick={() => setUploadOpen((current) => !current)}>
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
              onChange={(event) => setFilters({ ...filters, query: event.target.value })}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</span>
            <select
              className={inputClass}
              value={filters.type}
              onChange={(event) => setFilters({ ...filters, type: event.target.value as MediaTypeFilter })}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} ({counts[option.key]})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</span>
            <select
              className={inputClass}
              value={filters.month}
              onChange={(event) => setFilters({ ...filters, month: event.target.value })}
            >
              <option value="all">All dates</option>
              {months.map((month) => (
                <option key={month.key} value={month.key}>
                  {month.label}
                </option>
              ))}
            </select>
          </label>
          {filtersActive(filters) && (
            <button type="button" className={btnGhost} onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </button>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
          {visible.length} of {items.length} files · {formatBytes(totalBytes)} stored
          {missingAlt > 0 ? ` · ${missingAlt} image${missingAlt === 1 ? "" : "s"} missing alt text` : ""}
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
          title={filtersActive(filters) ? "No files match those filters" : "Your library is empty"}
          description={
            filtersActive(filters)
              ? "Try a different search, type or month."
              : "Upload a logo, product photo or document to get started."
          }
          action={
            filtersActive(filters) ? (
              <button type="button" className={btnPrimary} onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </button>
            ) : (
              <button type="button" className={btnPrimary} onClick={() => setUploadOpen(true)}>
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
        />
      ) : (
        <MediaList
          items={visible}
          selecting={selecting}
          selected={selected}
          onOpen={(item) => setOpenId(item.id)}
          onToggle={toggle}
        />
      )}

      {selecting && selected.length > 0 && (
        <BulkBar count={selected.length} onClear={() => setSelected([])}>
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
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
