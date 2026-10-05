/**
 * Somvabona announcement presentation — theme-owned (R2).
 *
 * Claims the `somvabona × announcement_bar` pair through
 * `registerThemePresentation` (first-wins, never throws) and renders
 * fully theme-owned everyday strip chrome from the shared headless
 * state (`useAnnouncementState` in
 * `@/components/store/AnnouncementBar`): a left-aligned sans line with
 * a marker dot under a single dashed rule, always wrapping (never
 * truncated) so the full message reads on small screens. Same data,
 * labels and links as every theme — only this markup differs.
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

const SOMVABONA_STEP_BTN =
  "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-fq-sm text-base leading-none text-[var(--theme-ink)]/50 motion-safe:transition-colors hover:text-[var(--theme-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current";

export const SomvabonaAnnouncementPresentation: WidgetComponent = (ctx) => {
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
    <section
      data-announcement-presentation="somvabona"
      className="border-b border-dashed border-[var(--theme-border)] bg-[var(--theme-surface)]"
    >
      <div
        role="region"
        aria-label={labels.region}
        className="flex items-center justify-start gap-2 px-4 py-1.5 sm:px-6"
      >
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-[var(--theme-ink)]/40"
        />
        {visible.length > 1 && (
          <button
            type="button"
            onClick={() => state.step(-1)}
            aria-label={labels.prev}
            className={SOMVABONA_STEP_BTN}
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        <p
          aria-live="polite"
          className="min-w-0 flex-1 whitespace-normal text-left font-sans text-xs font-medium text-[var(--theme-ink)]"
        >
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
            onClick={() => state.step(1)}
            aria-label={labels.next}
            className={SOMVABONA_STEP_BTN}
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
        {state.dismissible && (
          <button
            type="button"
            onClick={() => state.dismiss(active.id)}
            aria-label={labels.dismiss}
            className={SOMVABONA_STEP_BTN}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </section>
  );
};

registerThemePresentation(
  "somvabona",
  "announcement_bar",
  SomvabonaAnnouncementPresentation,
);
