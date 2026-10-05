/**
 * Songoskriti announcement presentation — theme-owned (R2).
 *
 * Claims the `songoskriti × announcement_bar` pair through
 * `registerThemePresentation` (first-wins, never throws) and renders
 * fully theme-owned heritage bar chrome from the shared headless state
 * (`useAnnouncementState` in `@/components/store/AnnouncementBar`): a
 * top-and-bottom rule frames a centered, uppercase, wide-tracked serif
 * line, single-line truncated on small screens and wrapping from `sm`
 * up. Same data, labels and links as every theme — only this markup
 * differs.
 *
 * Data handling is platform-owned (`announcementItemsOf`: repeater-first
 * `items` rows with `_bn` twins win, scalar m1/m2/m3 stay as the
 * fallback, global `href` + `link` rebase, persisted dismissal keyed per
 * node): the theme owns chrome, never the message contract. Rotation,
 * dismissal, locale and reduced-motion gating all come from the hook, so
 * behavior is identical across themes. Imports nothing from the shared
 * header and names only its own key — no theme branch lives here.
 */
import {
  announcementItemsOf,
  announcementMotionOf,
  useAnnouncementState,
} from "@/components/store/AnnouncementBar";
import { registerThemePresentation } from "@/lib/theme-presentations";
import type { WidgetComponent } from "@/components/builder/widgets";

const SONGOSKRITI_STEP_BTN =
  "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-fq-sm text-base leading-none text-[var(--theme-ink)]/60 motion-safe:transition-colors hover:text-[var(--theme-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";

export const SongoskritiAnnouncementPresentation: WidgetComponent = (ctx) => {
  const items = announcementItemsOf(
    ctx.section.props as Record<string, unknown>,
  );
  const state = useAnnouncementState({
    items,
    locale: ctx.locale,
    href: ctx.str("href") || undefined,
    dismissible: ctx.bool("dismissible"),
    rotateMs: ctx.int("rotateMs", 6000, 0, 60000),
    motion: announcementMotionOf(ctx.str("motion")) ?? "rotating",
    link: ctx.link,
    storageKey: `fq-announcement:${ctx.section.id}`,
  });
  if (!state.active) return null;
  const { active, visible, labels, linkHref, target } = state;
  return (
    <div
      data-announcement-presentation="songoskriti"
      className="border-y border-[var(--theme-border)] bg-[var(--theme-surface)]"
    >
      <div
        role="region"
        aria-label={labels.region}
        className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 sm:gap-3"
      >
        {visible.length > 1 && (
          <button
            type="button"
            onClick={() => state.step(-1)}
            aria-label={labels.prev}
            className={SONGOSKRITI_STEP_BTN}
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <p
          aria-live="polite"
          className="min-w-0 flex-1 truncate text-center font-serif text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--theme-ink)] sm:whitespace-normal"
        >
          {target ? (
            <a
              href={linkHref}
              className="underline decoration-[var(--theme-ink)]/40 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
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
            onClick={() => state.step(1)}
            aria-label={labels.next}
            className={SONGOSKRITI_STEP_BTN}
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
        {state.dismissible && (
          <button
            type="button"
            onClick={() => state.dismiss(active.id)}
            aria-label={labels.dismiss}
            className={SONGOSKRITI_STEP_BTN}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </div>
  );
};

registerThemePresentation(
  "songoskriti",
  "announcement_bar",
  SongoskritiAnnouncementPresentation,
);
