/**
 * ZRow — the alternating 60/40 deep-dive row.
 *
 * The whole product tour is built from this one component so the eye never has
 * to relearn a scan pattern mid-page: text left, right, left, right. One claim,
 * one proof chip, one UI still per row — a row that carries two claims is a
 * row that carries none.
 *
 * On mobile the visual always follows the text, regardless of `direction`,
 * because a reversed DOM order would put an unexplained screenshot first.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/public/motion";
import { Chip } from "./Band";

export type ZRowProps = {
  /** Side the *text* sits on at ≥1024px. */
  direction?: "left" | "right";
  eyebrow?: ReactNode;
  title: ReactNode;
  body: ReactNode;
  /** Short, checkable capability chip — "4 rails, 1 checkout", not "best in class". */
  proof?: ReactNode;
  bullets?: ReactNode[];
  action?: ReactNode;
  visual?: ReactNode;
  level?: 2 | 3;
  id?: string;
  className?: string;
};

export function ZRow({
  direction = "left",
  eyebrow,
  title,
  body,
  proof,
  bullets,
  action,
  visual,
  level = 3,
  id,
  className,
}: ZRowProps) {
  const Heading = level === 2 ? "h2" : "h3";
  const textRight = direction === "right";

  return (
    <div
      className={cn(
        "grid items-center gap-8 py-10 md:gap-14 md:py-14",
        // Without a visual the second column is dead space, so the row stays a
        // single measure-limited column instead of a half-empty split.
        visual && "md:grid-cols-2 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        className,
      )}
    >
      <Reveal
        direction={textRight ? "right" : "left"}
        className={cn("min-w-0", textRight && "md:order-2 lg:order-2")}
      >
        {eyebrow ? (
          <p
            data-band-eyebrow=""
            className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground"
          >
            {eyebrow}
          </p>
        ) : null}
        <Heading id={id} className="fq-display text-2xl sm:text-3xl">
          {title}
        </Heading>
        <p data-type-role="body" className="fq-measure mt-4 text-muted-foreground">
          {body}
        </p>

        {bullets?.length ? (
          <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
            {bullets.map((item, index) => (
              <li key={index} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-border" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {proof ? <Chip className="mt-6">{proof}</Chip> : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </Reveal>

      {visual ? (
        <Reveal
          direction={textRight ? "left" : "right"}
          className={cn("min-w-0", textRight && "md:order-1 lg:order-1")}
        >
          {visual}
        </Reveal>
      ) : null}
    </div>
  );
}
