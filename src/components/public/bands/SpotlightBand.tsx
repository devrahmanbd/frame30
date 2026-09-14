/**
 * SpotlightBand — the one chromatic moment on a page.
 *
 * `/DESIGN.md` allows at most one aurora tile per viewport, because the gradient
 * only reads as premium while it is scarce; two tiles in a scroll and the page
 * looks like a gradient template. The tile carries white ink on saturated
 * gradient, so it never inherits the muted-foreground token — text inside a
 * spotlight uses the tile's own contrast scale.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/public/motion";

export type SpotlightBandProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  /** Optional right-hand slot: a metric, a quote attribution, a small mock. */
  aside?: ReactNode;
  level?: 2 | 3;
  id?: string;
  className?: string;
};

export function SpotlightBand({
  eyebrow,
  title,
  body,
  actions,
  aside,
  level = 2,
  id,
  className,
}: SpotlightBandProps) {
  const Heading = level === 3 ? "h3" : "h2";

  return (
    <Reveal
      className={cn(
        "fq-spotlight flex flex-wrap items-center justify-between gap-8 rounded-fq-lg p-8 sm:p-12",
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? (
          <p
            data-band-eyebrow=""
            className="mb-4 text-xs font-medium uppercase tracking-[0.14em] opacity-80"
          >
            {eyebrow}
          </p>
        ) : null}
        <Heading id={id} className="fq-display text-3xl sm:text-4xl">
          {title}
        </Heading>
        {body ? <p data-type-role="lead" className="mt-4 text-base opacity-85">{body}</p> : null}
        {actions ? (
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 [&>*]:w-full [&>*]:sm:w-auto [&>*]:min-h-[44px] [&>*]:flex [&>*]:items-center [&>*]:justify-center">
            {actions}
          </div>
        ) : null}
      </div>
      {aside ? <div className="min-w-0">{aside}</div> : null}
    </Reveal>
  );
}
