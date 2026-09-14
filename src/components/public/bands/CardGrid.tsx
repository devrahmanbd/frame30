/**
 * CardGrid — pillars, themes, plans, principles, stories.
 *
 * One grid for every "set of comparable things" band, so a pillar card on
 * /features and a plan card on /pricing share the same rhythm, radius and edge
 * light. Cards are glass by default; exactly one card per grid may be featured
 * (surface-2 + a glass pill), never a coloured border — a coloured border is
 * the tell of a template.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal, Stagger, type RevealProps } from "@/components/public/motion";
import { Chip } from "./Band";

export type BandCard = {
  id: string;
  /** Rendered as an icon slot; pass a lucide element, already labelled. */
  icon?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  /** Short capability chip under the body. */
  meta?: ReactNode;
  /** Footer slot: a price line, a CTA link, a metric. */
  footer?: ReactNode;
  /** At most one per grid. Lifts to surface-2 with a "most chosen" style pill. */
  featured?: boolean;
  featuredLabel?: ReactNode;
};

export type CardGridProps = {
  cards: BandCard[];
  columns?: 2 | 3 | 4;
  /** Heading level used by each card title. */
  level?: 3 | 4;
  /** Entrance direction for the whole grid — lets each band arrive differently. */
  direction?: RevealProps["direction"];
  distance?: number;
  className?: string;
};

const COLUMNS: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export function CardGrid({
  cards,
  columns = 3,
  level = 3,
  direction = "up",
  distance,
  className,
}: CardGridProps) {
  const Heading = level === 4 ? "h4" : "h3";

  return (
    <Stagger
      direction={direction}
      distance={distance}
      className={cn("grid grid-cols-1 gap-4", COLUMNS[columns], className)}
    >
      {cards.map((card) => (
        <Reveal
          key={card.id}
          direction="none"
          className={cn(
            "fq-glass fq-glass-hover fq-hover-spotlight fq-edge-inner flex flex-col rounded-fq-lg p-6 transition-transform duration-200 motion-safe:hover:-translate-y-0.5",
            card.featured && "fq-beam fq-gridlines fq-halo fq-card-glow bg-card ring-1 ring-border",
          )}
        >
          {card.icon || card.featured ? (
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{card.icon}</span>
              {card.featured && card.featuredLabel ? <Chip>{card.featuredLabel}</Chip> : null}
            </div>
          ) : null}

          <Heading className="fq-display text-lg">{card.title}</Heading>
          {/* `div`, not `p`: callers legitimately pass rich bodies (two
              paragraphs, a list). A `<p>` here silently produced invalid
              nesting and a real hydration mismatch on /customers. */}
          {card.body ? (
            <div data-type-role="caption" className="mt-3 text-sm text-muted-foreground">
              {card.body}
            </div>
          ) : null}
          {card.meta ? <div className="mt-4 text-sm">{card.meta}</div> : null}
          {card.footer ? <div className="mt-6 pt-2">{card.footer}</div> : null}
        </Reveal>
      ))}
    </Stagger>
  );
}
