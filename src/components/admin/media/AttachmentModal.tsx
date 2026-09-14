/**
 * Phase 16 — attachment details, the WordPress modal.
 *
 * Preview left, editable metadata right, `‹ ›` to walk the library without
 * closing, and a footer that copies the file address or deletes permanently.
 * The dialog owns focus: siblings are made inert while it is open.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Copy, Download, Trash2, X } from "lucide-react";
import { btnGhost, btnPrimary, inputClass } from "@/components/console/kit";
import {
  type Attachment,
  absoluteMediaUrl,
  dimensionLabel,
  formatBytes,
  mediaKind,
  needsAltText,
  uploadedLabel,
} from "@/lib/media/library";
import { MediaThumb, SanitisedBadge } from "./MediaThumb";

export type AttachmentPatch = {
  title: string;
  altText: string;
  caption: string;
  description: string;
};

export function AttachmentModal({
  item,
  hasPrevious,
  hasNext,
  saving,
  onClose,
  onStep,
  onSave,
  onDelete,
  onSelect,
  selectLabel,
}: {
  item: Attachment;
  hasPrevious: boolean;
  hasNext: boolean;
  saving?: boolean;
  onClose: () => void;
  onStep: (step: 1 | -1) => void;
  onSave: (patch: AttachmentPatch) => void;
  onDelete: () => void;
  /** Present when the modal is used as a picker. */
  onSelect?: () => void;
  selectLabel?: string;
}) {
  const [draft, setDraft] = useState<AttachmentPatch>({
    title: item.title,
    altText: item.altText,
    caption: item.caption,
    description: item.description,
  });
  const [copied, setCopied] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft({
      title: item.title,
      altText: item.altText,
      caption: item.caption,
      description: item.description,
    });
    setCopied(false);
  }, [item.id, item.title, item.altText, item.caption, item.description]);

  useEffect(() => {
    const node = document.createElement("div");
    document.body.appendChild(node);
    hostRef.current = node;
    setHost(node);
    const siblings = Array.from(document.body.children).filter((child) => child !== node);
    for (const sibling of siblings) {
      sibling.setAttribute("aria-hidden", "true");
      (sibling as HTMLElement).inert = true;
    }
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      for (const sibling of siblings) {
        sibling.removeAttribute("aria-hidden");
        (sibling as HTMLElement).inert = false;
      }
      document.body.style.overflow = overflow;
      node.remove();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      const typing =
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
      if (typing) return;
      if (event.key === "ArrowLeft" && hasPrevious) onStep(-1);
      if (event.key === "ArrowRight" && hasNext) onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasNext, hasPrevious, onClose, onStep]);

  const fileUrl = useMemo(
    () => absoluteMediaUrl(typeof window === "undefined" ? "" : window.location.origin, item.url),
    [item.url],
  );

  const dirty =
    draft.title !== item.title ||
    draft.altText !== item.altText ||
    draft.caption !== item.caption ||
    draft.description !== item.description;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fileUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  if (!host) return null;

  return createPortal(
    <div className="fixed inset-0 z-[95] flex bg-background/85 p-0 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title || item.fileName} details`}
        className="fq-edge-inner mx-auto flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-none border border-border bg-card sm:rounded-fq-lg motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
      >
        <header className="flex items-center justify-between border-b border-border px-3 py-2">
          <div className="flex items-center gap-1">
            <IconButton label="Previous file" disabled={!hasPrevious} onClick={() => onStep(-1)}>
              <ChevronLeft className="size-4" aria-hidden />
            </IconButton>
            <IconButton label="Next file" disabled={!hasNext} onClick={() => onStep(1)}>
              <ChevronRight className="size-4" aria-hidden />
            </IconButton>
            <h2 className="ml-2 truncate text-sm font-semibold">Attachment details</h2>
          </div>
          <IconButton label="Close details" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        </header>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1.2fr)_minmax(320px,1fr)]">
          <div className="grid place-items-center bg-muted/40 p-4">
            <div className="aspect-[4/3] w-full max-w-xl overflow-hidden rounded-fq-md border border-border">
              <MediaThumb item={item} sizes="(max-width: 768px) 100vw, 600px" />
            </div>
          </div>

          <div className="space-y-4 border-t border-border p-4 md:border-l md:border-t-0">
            <div className="space-y-1">
              <p className="truncate text-sm font-semibold" title={item.fileName}>
                {item.fileName}
              </p>
              <p className="text-xs text-muted-foreground">
                Uploaded {uploadedLabel(item.createdAt)} · {formatBytes(item.sizeBytes)}
                {dimensionLabel(item) ? ` · ${dimensionLabel(item)}` : ""} · {mediaKind(item.contentType)}
              </p>
              {item.sanitised && <SanitisedBadge />}
            </div>

            <Labelled
              label="Alt text"
              hint="Describe what the image shows for people using a screen reader. Leave empty only for decoration."
              tone={needsAltText(item) ? "warning" : undefined}
            >
              <input
                className={inputClass}
                value={draft.altText}
                onChange={(event) => setDraft({ ...draft, altText: event.target.value })}
              />
            </Labelled>

            <Labelled label="Title">
              <input
                className={inputClass}
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Labelled>

            <Labelled label="Caption">
              <textarea
                rows={2}
                className={inputClass}
                value={draft.caption}
                onChange={(event) => setDraft({ ...draft, caption: event.target.value })}
              />
            </Labelled>

            <Labelled label="Description">
              <textarea
                rows={3}
                className={inputClass}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
            </Labelled>

            <Labelled label="File URL">
              <div className="flex gap-2">
                <input readOnly value={fileUrl} className={inputClass} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  onClick={() => void copy()}
                  className={btnGhost}
                  aria-label="Copy file address"
                >
                  {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                  <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
            </Labelled>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <a href={item.url} target="_blank" rel="noreferrer" className={btnGhost}>
              View
            </a>
            <a href={item.url} download={item.fileName} className={btnGhost}>
              <Download className="size-4" aria-hidden />
              <span className="ml-1">Download</span>
            </a>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex min-h-11 items-center gap-1 rounded-fq-md px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-4" aria-hidden /> Delete permanently
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={btnGhost}
              disabled={!dirty || saving}
              onClick={() => onSave(draft)}
            >
              {saving ? "Saving…" : "Save details"}
            </button>
            {onSelect && (
              <button type="button" className={btnPrimary} onClick={onSelect}>
                {selectLabel ?? "Use this file"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>,
    host,
  );
}

function Labelled({
  label,
  hint,
  tone,
  children,
}: {
  label: string;
  hint?: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
      {hint && (
        <span
          className={
            tone === "warning"
              ? "block rounded-fq-sm bg-warning-soft px-2 py-1 text-xs text-warning-foreground"
              : "block text-xs text-muted-foreground"
          }
        >
          {hint}
        </span>
      )}
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-fq-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}
