/**
 * Somvabona dressed-hero presentation — theme-owned (ITEM 8 lane).
 *
 * Dresses the shared `builtin:hero` widget through the versioned namespaced
 * contract (`registerVersionedPresentation`, first-wins, never throws):
 * everyday sans chrome over the caller's props, any widget version, no
 * floor, pass-through settings (no migrate hook). Names only its own key —
 * no owner branch lives here. SSR-safe (no hooks, no effects).
 */
import type { WidgetComponent } from "@/components/builder/widgets";

export const SomvabonaDressedHeroPresentation: WidgetComponent = (ctx) => {
  const title = ctx.str("title") || ctx.str("headline");
  const eyebrow = ctx.str("eyebrow");
  if (!title && !eyebrow) return null;
  return (
    <div
      data-dressing="somvabona-hero"
      className="w-full bg-[var(--theme-surface)] px-4 py-8"
    >
      {eyebrow ? (
        <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--theme-ink)]/70">
          {eyebrow}
        </p>
      ) : null}
      {title ? (
        <h2 className="mt-2 font-sans text-2xl font-bold text-[var(--theme-ink)]">
          {title}
        </h2>
      ) : null}
    </div>
  );
};
