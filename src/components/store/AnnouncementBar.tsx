/**
 * T3.2 — standalone announcement surface.
 *
 * `AnnouncementBar` is the first-class global announcement surface. It owns
 * data (items), state (rotation index, dismissal), persisted dismissal
 * (localStorage, SSR-safe), locale (en/bn twins with English fallback, never
 * blank), and link/action (per-item href with a global href fallback).
 *
 * Theme control (no marquee forcing — the theme chooses):
 * - height/typography via `size` (`sm` | `md`)
 * - alignment via `align` (`left` | `center` | `right`)
 * - color via `tone` (`brand` | `muted` | `ink`) — token classes only
 * - motion via `motion` (`static` | `rotating`); rotation is an instant
 *   content swap on an interval, never a CSS marquee loop
 * - close affordance via `dismissible` (44px target, bilingual label)
 * - responsive: truncated on small screens, wrapping from `sm` up
 *
 * Reduced motion: rotation is disabled under
 * `prefers-reduced-motion: reduce` (SSR-safe probe, follows mid-session
 * changes); manual prev/next steppers keep every message reachable without
 * motion. All transitions are `motion-safe:`-gated.
 *
 * Zero header dependency: this module imports only `react` and the pure
 * bilingual layer (`@/lib/bitext`). It never imports `StoreHeader`,
 * `theme-chrome`, or any theme module — the sibling header track consumes
 * this surface, not the other way around. Header-chrome data shapes
 * (`{ center, center_bn }`) map in through `headerChromeAnnouncementItems`.
 */
import { useEffect, useState } from "react";
import { readBiText, resolveBiText, type Locale } from "@/lib/bitext";

export type AnnouncementItem = {
  /** English copy. Blank (after trim, with no `_bn` twin) drops the row. */
  text: string;
  /** বাংলা twin. Falls back to `text`, never blank when `text` exists. */
  text_bn?: string;
  /** Optional per-item link/action. Falls back to the global `href` prop. */
  href?: string;
  /** Stable dismissal identity. Defaults to the resolved text. */
  id?: string;
};

export type AnnouncementMotion = "static" | "rotating";
export type AnnouncementAlign = "left" | "center" | "right";
export type AnnouncementSize = "sm" | "md";
export type AnnouncementTone = "brand" | "muted" | "ink";
export type AnnouncementVariant = "bar" | "integrated";

export type ResolvedAnnouncement = {
  id: string;
  text: string;
  href: string;
};

export type AnnouncementBarProps = {
  items: AnnouncementItem[];
  locale?: Locale;
  /** Global link fallback when an item carries no own `href`. */
  href?: string;
  dismissible?: boolean;
  /** ms between messages. `< 1000` disables rotation (static). */
  rotateMs?: number;
  /** Theme motion choice. Reduced-motion always forces static. */
  motion?: AnnouncementMotion;
  align?: AnnouncementAlign;
  size?: AnnouncementSize;
  tone?: AnnouncementTone;
  /**
   * `bar` (default) renders the tone background; `integrated` renders
   * text-only (inherits the parent surface) for embedding in header chrome.
   */
  variant?: AnnouncementVariant;
  /** localStorage namespace for persisted dismissal. */
  storageKey?: string;
  /** SSR/test injection of already-persisted dismissed ids. */
  initialDismissedIds?: string[];
  /** Rebase a root-relative URL for the host environment. */
  link?: (href: string) => string;
};

export const ANNOUNCEMENT_STORAGE_PREFIX = "fq-announcement";
const DEFAULT_STORAGE_KEY = "fq-announcement-dismissed";
const DISMISSAL_CAP = 30;

/** Locale-resolved, blank-dropped message list. Pure — safe in tests. */
export function resolveAnnouncementItems(
  items: AnnouncementItem[] | undefined | null,
  locale: Locale,
): ResolvedAnnouncement[] {
  if (!Array.isArray(items)) return [];
  const out: ResolvedAnnouncement[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const text = resolveBiText(readBiText(item, "text"), locale).trim();
    if (!text) continue;
    const href = typeof item.href === "string" ? item.href.trim() : "";
    const rawId = typeof item.id === "string" ? item.id.trim() : "";
    out.push({ id: rawId || text, text, href });
  }
  return out;
}

/**
 * Header-chrome data-shape adapter (consume, don't edit): maps the
 * theme-owned `{ center, center_bn }` announcement copy (see
 * `ThemeHeaderChrome["announcement"]` in `theme-chrome.ts`, rendered today
 * by `StoreHeader`) to surface items. `left` is layout chrome, not message
 * copy, so it stays out.
 */
export function headerChromeAnnouncementItems(announcement: {
  left?: string;
  center?: string;
  center_bn?: string;
} | null | undefined): AnnouncementItem[] {
  if (!announcement) return [];
  const text = typeof announcement.center === "string" ? announcement.center : "";
  const textBn =
    typeof announcement.center_bn === "string" ? announcement.center_bn : "";
  if (!text.trim() && !textBn.trim()) return [];
  return [textBn.trim() ? { text, text_bn: textBn } : { text }];
}

/** Lenient theme-prop readers: unknown/authored strings degrade to default. */
export function announcementMotionOf(
  value: unknown,
): AnnouncementMotion | undefined {
  return value === "static" || value === "rotating" ? value : undefined;
}

export function announcementAlignOf(
  value: unknown,
): AnnouncementAlign | undefined {
  return value === "left" || value === "center" || value === "right"
    ? value
    : undefined;
}

export function announcementSizeOf(value: unknown): AnnouncementSize | undefined {
  return value === "sm" || value === "md" ? value : undefined;
}

export function announcementToneOf(value: unknown): AnnouncementTone | undefined {
  return value === "brand" || value === "muted" || value === "ink"
    ? value
    : undefined;
}

/** SSR-safe persisted-dismissal read: storage wins merged over injected. */
export function readDismissedIds(
  storageKey: string,
  initial?: string[],
): string[] {
  const base = Array.isArray(initial)
    ? initial.filter((v): v is string => typeof v === "string")
    : [];
  if (typeof window === "undefined") return [...base];
  try {
    const store = window.localStorage;
    const raw = store?.getItem(storageKey);
    if (!raw) return [...base];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...base];
    const stored = parsed.filter((v): v is string => typeof v === "string");
    return [...new Set([...base, ...stored])].slice(0, DISMISSAL_CAP);
  } catch {
    return [...base];
  }
}

function persistDismissedIds(storageKey: string, ids: string[]): void {
  try {
    window.localStorage?.setItem(
      storageKey,
      JSON.stringify(ids.slice(0, DISMISSAL_CAP)),
    );
  } catch {
    // Private mode / blocked storage: dismissal stays session-only.
  }
}

/**
 * Reduced-motion probe. SSR-safe (first paint assumes no preference, then
 * corrects from the OS setting and follows mid-session changes).
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const TONE_CLASS: Record<AnnouncementTone, string> = {
  brand: "bg-primary text-primary-foreground",
  muted: "bg-muted text-foreground",
  ink: "bg-foreground text-background",
};

const ALIGN_CLASS: Record<AnnouncementAlign, string> = {
  left: "justify-start text-left",
  center: "justify-center text-center",
  right: "justify-end text-right",
};

export function AnnouncementBar({
  items,
  locale = "en",
  href,
  dismissible = false,
  rotateMs = 0,
  motion = "rotating",
  align = "center",
  size = "md",
  tone = "brand",
  variant = "bar",
  storageKey = DEFAULT_STORAGE_KEY,
  initialDismissedIds,
  link,
}: AnnouncementBarProps) {
  const resolved = resolveAnnouncementItems(items, locale);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() =>
    readDismissedIds(storageKey, initialDismissedIds),
  );
  const dismissed = new Set(dismissedIds);
  const visible = resolved.filter((message) => !dismissed.has(message.id));
  const [index, setIndex] = useState(0);
  const reducedMotion = usePrefersReducedMotion();

  const rotateEvery =
    typeof rotateMs === "number" && Number.isFinite(rotateMs)
      ? Math.max(0, Math.trunc(rotateMs))
      : 0;
  const canRotate =
    motion === "rotating" &&
    !reducedMotion &&
    rotateEvery >= 1000 &&
    visible.length > 1;

  useEffect(() => {
    if (!canRotate) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % Math.max(visible.length, 1)),
      rotateEvery,
    );
    return () => window.clearInterval(id);
  }, [canRotate, rotateEvery, visible.length]);

  if (visible.length === 0) return null;
  const active = visible[Math.min(index, visible.length - 1)]!;
  const globalHref = (href ?? "").trim();
  const target = active.href || globalHref;
  const linkHref = link ? link(target) : target;
  const isBn = locale === "bn";

  const dismiss = (id: string) => {
    if (dismissed.has(id)) return;
    const next = [...dismissedIds, id].slice(-DISMISSAL_CAP);
    setDismissedIds(next);
    persistDismissedIds(storageKey, next);
  };

  const step = (delta: number) =>
    setIndex(
      (i) => (((i + delta) % visible.length) + visible.length) % visible.length,
    );

  const regionLabel = isBn ? "ঘোষণা" : "Announcement";
  const dismissLabel = isBn ? "ঘোষণা বন্ধ করুন" : "Dismiss announcement";
  const prevLabel = isBn ? "আগের ঘোষণা" : "Previous announcement";
  const nextLabel = isBn ? "পরের ঘোষণা" : "Next announcement";
  const stepperBtn =
    "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-fq-sm text-base leading-none motion-safe:transition-colors hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";

  return (
    <div
      role="region"
      aria-label={regionLabel}
      className={`flex items-center gap-1 font-medium motion-safe:transition-colors sm:gap-3 ${
        size === "sm"
          ? "px-4 py-1 text-[11px]"
          : "px-4 py-2 text-xs sm:px-6"
      } ${ALIGN_CLASS[align]} ${
        variant === "integrated" ? "text-current" : TONE_CLASS[tone]
      }`}
    >
      {visible.length > 1 && (
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label={prevLabel}
          className={stepperBtn}
        >
          <span aria-hidden="true">‹</span>
        </button>
      )}
      <p aria-live="polite" className="min-w-0 flex-1 truncate sm:whitespace-normal">
        {target ? (
          <a
            href={linkHref}
            className="underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
          >
            {active.text}
          </a>
        ) : (
          active.text
        )}
      </p>
      {visible.length > 1 && (
        <button
          type="button"
          onClick={() => step(1)}
          aria-label={nextLabel}
          className={stepperBtn}
        >
          <span aria-hidden="true">›</span>
        </button>
      )}
      {dismissible && (
        <button
          type="button"
          onClick={() => dismiss(active.id)}
          aria-label={dismissLabel}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-fq-sm text-base leading-none motion-safe:transition-colors hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
