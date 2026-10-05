/**
 * T3.2 — standalone announcement surface (R2: platform owns data/state).
 *
 * `AnnouncementBar` is the first-class global announcement surface. It owns
 * data (items), state (rotation index, dismissal), persisted dismissal
 * (localStorage, SSR-safe), locale (en/bn twins with English fallback, never
 * blank), and link/action (per-item href with a global href fallback).
 *
 * R2 split — platform owns data/state, themes own presentation:
 * - Pure data helpers (`resolveAnnouncementItems`,
 *   `headerChromeAnnouncementItems`, `readDismissedIds`,
 *   `announcementItemsOf`) plus the headless `useAnnouncementState` hook
 *   are the platform contract. They import only `react` and the pure
 *   bilingual layer (`@/lib/bitext`) — never `StoreHeader`,
 *   `theme-chrome`, or any theme module.
 * - Per-theme markup (typography, spacing, color, alignment, motion,
 *   mobile layout) lives in theme-owned `announcement-presentation`
 *   modules registered per themeKey × `announcement_bar` through
 *   `registerThemePresentation`. Those presentations consume
 *   `useAnnouncementState` (same rotation/dismissal/locale/link behavior,
 *   same bilingual labels) and render fully owned markup — they never
 *   inherit the default presentation below.
 * - The `AnnouncementBar` component itself is the neutral DEFAULT
 *   presentation for unregistered pairs (the generic `announcement_bar`
 *   widget adapter renders it directly). Its tone/align/size/variant knobs
 *   are token classes only — no theme literals, no theme branches.
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

/**
 * Section-props → surface items (platform data contract, R2).
 *
 * Repeater-first read, verbatim with the generic `announcement_bar`
 * adapter: studio `items` rows (with `_bn` twins) win when present,
 * scalar m1/m2/m3 (+ twins) remain the fallback for theme-authored
 * sections. Theme presentations call this instead of duplicating the
 * row read, so identical sections resolve identical data in every theme.
 * Pure — never mutates its input.
 */
export function announcementItemsOf(
  props: Record<string, unknown>,
): AnnouncementItem[] {
  const rawRows = Array.isArray(props.items)
    ? (props.items as Record<string, unknown>[])
    : [];
  const rowItems: AnnouncementItem[] = rawRows
    .map((row) => ({
      text: typeof row.text === "string" ? row.text : "",
      text_bn: typeof row.text_bn === "string" ? row.text_bn : undefined,
    }))
    .filter((row) => row.text.trim() || (row.text_bn ?? "").trim());
  const scalarItems: AnnouncementItem[] = ["m1", "m2", "m3"]
    .map((key) => {
      const en = typeof props[key] === "string" ? (props[key] as string) : "";
      const bnRaw = props[`${key}_bn`];
      const textBn = typeof bnRaw === "string" ? bnRaw : "";
      return en.trim() || textBn.trim()
        ? { text: en, ...(textBn ? { text_bn: textBn } : {}) }
        : null;
    })
    .filter((row): row is AnnouncementItem => row !== null);
  return rowItems.length > 0 ? rowItems : scalarItems;
}

/** Bilingual region/control labels for announcement markup. */
export type AnnouncementLabels = {
  region: string;
  dismiss: string;
  prev: string;
  next: string;
};

export type UseAnnouncementStateOptions = {
  items: AnnouncementItem[];
  locale?: Locale;
  /** Global link fallback when an item carries no own `href`. */
  href?: string;
  dismissible?: boolean;
  /** ms between messages. `< 1000` disables rotation (static). */
  rotateMs?: number;
  /** Rotation behavior. Reduced-motion always forces static. */
  motion?: AnnouncementMotion;
  /** localStorage namespace for persisted dismissal. */
  storageKey?: string;
  /** SSR/test injection of already-persisted dismissed ids. */
  initialDismissedIds?: string[];
  /** Rebase a root-relative URL for the host environment. */
  link?: (href: string) => string;
};

/**
 * Headless announcement state (platform-owned, R2).
 *
 * Owns resolution, rotation index, dismissal (+ persistence),
 * reduced-motion gating, locale labels and link resolution. Theme
 * presentations render owned markup from this view model; the default
 * `AnnouncementBar` presentation below is one consumer. `active` is null
 * when nothing is visible (all blank or all dismissed) — presentations
 * render nothing in that case.
 */
export type AnnouncementState = {
  locale: Locale;
  isBn: boolean;
  resolved: ResolvedAnnouncement[];
  visible: ResolvedAnnouncement[];
  active: ResolvedAnnouncement | null;
  index: number;
  step: (delta: number) => void;
  dismiss: (id: string) => void;
  dismissible: boolean;
  dismissedIds: string[];
  reducedMotion: boolean;
  canRotate: boolean;
  labels: AnnouncementLabels;
  /** Resolved link target (item href, else global href, else ""). */
  target: string;
  /** `link`-rebased `target` (the actual anchor href). */
  linkHref: string;
};

export function useAnnouncementState({
  items,
  locale = "en",
  href,
  dismissible = false,
  rotateMs = 0,
  motion = "rotating",
  storageKey = DEFAULT_STORAGE_KEY,
  initialDismissedIds,
  link,
}: UseAnnouncementStateOptions): AnnouncementState {
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

  const active = visible.length === 0 ? null : visible[Math.min(index, visible.length - 1)]!;
  const globalHref = (href ?? "").trim();
  const target = active ? active.href || globalHref : "";
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

  return {
    locale,
    isBn,
    resolved,
    visible,
    active,
    index,
    step,
    dismiss,
    dismissible,
    dismissedIds,
    reducedMotion,
    canRotate,
    labels: {
      region: isBn ? "ঘোষণা" : "Announcement",
      dismiss: isBn ? "ঘোষণা বন্ধ করুন" : "Dismiss announcement",
      prev: isBn ? "আগের ঘোষণা" : "Previous announcement",
      next: isBn ? "পরের ঘোষণা" : "Next announcement",
    },
    target,
    linkHref,
  };
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
  // Default (neutral) presentation over the shared headless state. The
  // tone/align/size/variant knobs below are token classes only — theme
  // presentations registered in the registry render their own markup from
  // `useAnnouncementState` instead of inheriting this.
  const state = useAnnouncementState({
    items,
    locale,
    href,
    dismissible,
    rotateMs,
    motion,
    storageKey,
    initialDismissedIds,
    link,
  });
  const { visible, dismissible: canDismiss } = state;
  if (visible.length === 0) return null;
  const active = state.active!;
  const { target, linkHref } = state;
  const { step, dismiss } = state;
  const { region: regionLabel, dismiss: dismissLabel } = state.labels;
  const { prev: prevLabel, next: nextLabel } = state.labels;
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
      {canDismiss && (
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
