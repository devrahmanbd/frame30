/**
 * Songoskriti dressed-hero presentation — theme-owned (ITEM 8 lane).
 *
 * Dresses the shared `builtin:hero` widget through the versioned namespaced
 * contract (`registerVersionedPresentation`, first-wins, never throws):
 * heritage serif chrome over the caller's props. Claims the `^1.0.0` widget
 * line with a builder-API floor, plus a legacy `headline` → `title`
 * migration so a theme switch preserves merchant settings. Also dresses the
 * compatible third-party `plugin:acme/reviews` widget (`^1.0.0`, island
 * chrome over its public `title`). Names only its own key — no owner branch
 * lives here. SSR-safe (no hooks, no effects).
 */
import type { WidgetComponent } from "@/components/builder/widgets";

export const SongoskritiDressedHeroPresentation: WidgetComponent = (ctx) => {
  const title = ctx.str("title") || ctx.str("headline");
  const eyebrow = ctx.str("eyebrow");
  if (!title && !eyebrow) return null;
  return (
    <section
      data-dressing="songoskriti-hero"
      className="mx-auto w-full max-w-3xl px-4 py-10 text-center"
    >
      {eyebrow ? (
        <p className="font-serif text-[11px] font-medium uppercase tracking-[0.25em] text-[var(--theme-ink)]">
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h2 className="mt-3 font-serif text-3xl text-[var(--theme-ink)]">
          {title}
        </h2>
      ) : null}
    </section>
  );
};

export const SongoskritiDressedReviewsPresentation: WidgetComponent = (ctx) => {
  const title = ctx.str("title");
  return (
    <aside
      data-dressing="songoskriti-reviews"
      className="mx-auto w-full max-w-3xl border-y border-[var(--theme-border)] px-4 py-6 text-center"
    >
      <p className="font-serif text-sm text-[var(--theme-ink)]">
        {title || "Loved by our customers"}
      </p>
    </aside>
  );
};
