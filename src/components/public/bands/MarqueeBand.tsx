/**
 * MarqueeBand — the rails / courier / integration proof strip.
 *
 * Recognition beats adjectives: a merchant identifies the bKash mark faster
 * than they read the word "trusted", and recognition triggers a lower-friction
 * trust judgement than a claim does. So this band ships marks, a kicker and a
 * footnote — never a testimonial.
 *
 * The underlying Marquee already pauses on hover, on focus inside, when the tab
 * is hidden and under reduced-motion intent, degrading to a scrollable row.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Marquee } from "@/components/public/motion";

export type MarqueeMark = {
  id: string;
  /** Text or an already-labelled SVG mark. Never an unlabelled image. */
  content: ReactNode;
  /** Accessible name when `content` is decorative. */
  label?: string;
};

export type MarqueeBandProps = {
  kicker?: ReactNode;
  marks: MarqueeMark[];
  note?: ReactNode;
  /** Accessible name for the scrolling region. */
  label: string;
  reverse?: boolean;
  className?: string;
};

export function MarqueeBand({ kicker, marks, note, label, reverse, className }: MarqueeBandProps) {
  return (
    <div className={cn("fq-glass rounded-fq-lg px-4 py-6 sm:px-6", className)}>
      {kicker ? (
        <p
          data-band-eyebrow=""
          className="mb-5 text-center text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
        >
          {kicker}
        </p>
      ) : null}

      <Marquee label={label} reverse={reverse}>
        <div className="flex items-center gap-10 pr-10">
          {marks.map((mark) => (
            <span
              key={mark.id}
              aria-label={mark.label}
              className="shrink-0 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {mark.content}
            </span>
          ))}
        </div>
      </Marquee>

      {note ? <p data-type-role="caption" className="mt-5 text-center text-xs text-muted-foreground">
          {note}
        </p> : null}
    </div>
  );
}
