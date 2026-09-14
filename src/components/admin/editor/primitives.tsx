/**
 * Phase 12 — small presentational primitives shared by the editor takeover.
 *
 * All colours come from tokens (`bg-card`, `border-border`, `--fq-signal`…);
 * nothing here knows about pages or posts.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------ IconButton */

export function IconButton({
  label,
  onClick,
  active,
  disabled,
  children,
  className,
  shortcut,
  tone = "ghost",
  type = "button",
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  shortcut?: string;
  tone?: "ghost" | "signal";
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cn(
        "fq-focus-glow inline-flex size-8 shrink-0 items-center justify-center rounded-fq-md transition-[background-color,color,transform] duration-150 disabled:pointer-events-none disabled:opacity-40",
        tone === "signal"
          ? "bg-primary text-primary-foreground hover:opacity-90"
          : active
            ? "bg-foreground text-background"
            : "text-foreground hover:bg-muted",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* --------------------------------------------------------------- Popover */

/**
 * Anchored popover: closes on Escape / outside click, restores focus to the
 * trigger, and never traps keyboard users — Tab leaves it naturally.
 */
export function Popover({
  open,
  onClose,
  anchor,
  title,
  children,
  align = "end",
  width = 288,
}: {
  open: boolean;
  onClose: () => void;
  anchor: ReactNode;
  title?: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    const first = panelRef.current?.querySelector<HTMLElement>("input, button, select, textarea, [tabindex]:not([tabindex='-1'])");
    first?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative">
      {anchor}
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-labelledby={title ? `${id}-t` : undefined}
          className={cn(
            "fq-enter absolute top-full z-30 mt-1.5 rounded-fq-lg border border-border bg-popover p-3 text-popover-foreground shadow-[0_18px_40px_-20px_rgb(0_0_0/0.45)]",
            align === "end" ? "right-0" : "left-0",
          )}
          style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
        >
          {title && (
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 id={`${id}-t`} className="text-sm font-semibold">
                {title}
              </h4>
              <button type="button" onClick={onClose} aria-label="Close" className="fq-focus-glow inline-flex size-8 items-center justify-center rounded-fq-md hover:bg-muted">
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Collapsible */

export function Collapsible({
  title,
  badge,
  defaultOpen = false,
  children,
  id,
}: {
  title: ReactNode;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const auto = useId();
  const panel = `${id ?? auto}-panel`;
  return (
    <section className="border-t border-border">
      <h2 className="text-sm font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((o) => !o)}
          className="fq-focus-glow flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm font-semibold hover:bg-muted/60"
        >
          <span className="flex items-center gap-2">
            {title}
            {badge}
          </span>
          <ChevronDown className={cn("size-4 transition-transform duration-150", open && "rotate-180")} aria-hidden />
        </button>
      </h2>
      {open && (
        <div id={panel} className="px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  );
}

/* --------------------------------------------------------------- KvRow */

/** WordPress document-panel row: muted label left, signal-coloured value button right. */
export function KvRow({ label, value, onClick, open, disabled }: { label: ReactNode; value: ReactNode; onClick?: () => void; open?: boolean; disabled?: boolean }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 text-sm">
      <span className="fq-sub shrink-0">{label}</span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="fq-focus-glow inline-flex min-h-8 max-w-[70%] items-center truncate rounded-fq-md px-1.5 text-right font-medium text-primary hover:bg-muted disabled:opacity-50"
        >
          <span className="truncate">{value}</span>
        </button>
      ) : (
        <span className="truncate font-medium">{value}</span>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- UnderlineTabs */

export function UnderlineTabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex border-b border-border">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              "fq-focus-glow relative flex min-h-11 flex-1 items-center justify-center px-3 text-sm font-medium transition-colors",
              selected ? "text-foreground" : "fq-sub hover:text-foreground",
            )}
          >
            {tab.label}
            {selected && <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------- RadioList */

export function RadioList<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; hint?: string; disabled?: boolean }[];
}) {
  return (
    <div role="radiogroup" className="space-y-1">
      {options.map((o) => (
        <label
          key={o.id}
          className={cn(
            "flex cursor-pointer items-start gap-2.5 rounded-fq-md px-2 py-1.5 text-sm hover:bg-muted",
            o.disabled && "cursor-not-allowed opacity-50",
          )}
        >
          <input type="radio" name={name} value={o.id} checked={value === o.id} disabled={o.disabled} onChange={() => onChange(o.id)} className="mt-0.5 size-[18px] shrink-0 accent-[var(--fq-signal)]" />
          <span>
            <span className="block font-medium">{o.label}</span>
            {o.hint && <span className="fq-sub block text-xs">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

export const fieldInput =
  "fq-focus-glow w-full rounded-fq-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-50";
