/**
 * Phase 15 — the theme "Live preview" split view.
 *
 * 300px sidebar with `‹ ›`, install/activate, rating, version, description and
 * a collapse handle; the storefront live in the frame; device toggle pinned to
 * the bottom, exactly like the WordPress theme previewer.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Smartphone,
  Star,
  Tablet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PREVIEW_WIDTHS, previewUrl, type PreviewDevice } from "@/lib/themes/appearance";
import { btnGhost, btnPrimary } from "@/components/console/kit";

const DEVICES: { id: PreviewDevice; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
];

export type PreviewSubject = {
  key: string | null;
  name: string;
  author: string;
  version: string;
  summary: string;
  rating?: number;
  installed: boolean;
  active: boolean;
};

export function ThemePreviewSplit({
  subject,
  storeSlug,
  busy,
  onClose,
  onStep,
  onPrimary,
}: {
  subject: PreviewSubject;
  storeSlug: string | null;
  busy?: boolean;
  onClose: () => void;
  onStep: (direction: -1 | 1) => void;
  onPrimary: () => void;
}) {
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [collapsed, setCollapsed] = useState(false);
  const width = PREVIEW_WIDTHS[device];
  const src = storeSlug ? previewUrl(storeSlug, subject.key, device) : null;
  const primaryLabel = subject.active ? "Customize" : subject.installed ? "Activate" : "Install";
  const host = useRef<HTMLDivElement | null>(null);
  if (!host.current && typeof document !== "undefined")
    host.current = document.createElement("div");

  /**
   * The preview owns the whole viewport, so every other top-level node is made
   * inert while it is open — otherwise the console behind it stays reachable by
   * keyboard and by assistive tech even though nothing of it is visible.
   */
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    document.body.appendChild(node);
    const siblings = Array.from(document.body.children).filter((child) => child !== node);
    const previous = siblings.map((child) => child.getAttribute("aria-hidden"));
    siblings.forEach((child) => {
      child.setAttribute("aria-hidden", "true");
      (child as HTMLElement).inert = true;
    });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      siblings.forEach((child, index) => {
        const value = previous[index];
        if (value === null || value === undefined) child.removeAttribute("aria-hidden");
        else child.setAttribute("aria-hidden", value);
        (child as HTMLElement).inert = false;
      });
      document.body.style.overflow = overflow;
      node.remove();
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!host.current) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${subject.name} live preview`}
      className="fixed inset-0 z-50 flex bg-background"
    >
      <aside
        aria-label="Theme preview details"
        className={cn(
          "relative flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
          collapsed ? "w-12" : "w-[300px]",
        )}
      >
        <div className="flex items-center justify-between gap-1 border-b border-border p-2">
          {!collapsed && (
            <div className="flex items-center gap-1">
              <IconButton label="Previous theme" onClick={() => onStep(-1)}>
                <ChevronLeft className="size-4" aria-hidden />
              </IconButton>
              <IconButton label="Next theme" onClick={() => onStep(1)}>
                <ChevronRight className="size-4" aria-hidden />
              </IconButton>
            </div>
          )}
          <IconButton
            label={collapsed ? "Expand preview sidebar" : "Collapse preview sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </IconButton>
        </div>

        {!collapsed && (
          <div className="flex-1 space-y-4 overflow-auto p-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{subject.name}</h2>
              <p className="mt-1 text-sm fq-sub">
                Version {subject.version} · By {subject.author}
              </p>
            </div>
            {typeof subject.rating === "number" ? (
              <p className="flex items-center gap-1.5 text-sm fq-sub">
                <Star className="size-4 fill-current text-primary" aria-hidden />
                <span className="fq-num text-foreground">{subject.rating.toFixed(1)}</span> average
                rating
              </p>
            ) : null}
            <p className="text-sm text-foreground/90">{subject.summary}</p>
            <button
              type="button"
              className={cn(btnPrimary, "w-full")}
              onClick={onPrimary}
              disabled={busy}
            >
              {primaryLabel}
            </button>
            <button type="button" className={cn(btnGhost, "w-full")} onClick={onClose}>
              Close preview
            </button>
          </div>
        )}

        {collapsed && (
          <IconButton label="Close preview" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </IconButton>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-muted">
        <div className="flex-1 overflow-auto p-4">
          <div
            className="mx-auto h-full transition-[max-width] duration-200"
            style={{ maxWidth: width ?? "100%" }}
          >
            {src ? (
              <iframe
                title={`${subject.name} live preview`}
                src={src}
                className="size-full min-h-[60vh] rounded-fq-md border border-border bg-card"
              />
            ) : (
              <div className="grid h-full min-h-[60vh] place-items-center rounded-fq-md border border-dashed border-border text-sm fq-sub">
                Your storefront address is still being set up, so there is nothing to preview yet.
              </div>
            )}
          </div>
        </div>
        <div
          role="group"
          aria-label="Preview width"
          className="flex items-center justify-center gap-1 border-t border-border bg-card p-2"
        >
          {DEVICES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={device === id}
              onClick={() => setDevice(id)}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm transition-colors",
                device === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    host.current,
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-fq-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
