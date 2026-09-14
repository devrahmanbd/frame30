/**
 * CtaBand — the closing band on every marketing route.
 *
 * Contract from the copy decks: exactly one primary CTA and one low-commitment
 * alternative. Two primaries is a choice the visitor has to make before they
 * are ready, and the measurable result is that they make neither.
 *
 * `tone="spotlight"` uses the gradient tile; `tone="glass"` is for pages that
 * already spent their one spotlight higher up the scroll.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/public/motion";
import { Band } from "./Band";
import { SpotlightBand } from "./SpotlightBand";

export type CtaBandProps = {
  title: ReactNode;
  body?: ReactNode;
  /** Primary action element (Link/button) — exactly one. */
  primary: ReactNode;
  /** Low-commitment alternative: demo store, docs, talk to sales. */
  secondary?: ReactNode;
  /** Risk-reversal line: trial length, export promise, no card. */
  note?: ReactNode;
  tone?: "spotlight" | "glass";
  id?: string;
  className?: string;
};

export function CtaBand({
  title,
  body,
  primary,
  secondary,
  note,
  tone = "spotlight",
  id = "cta-title",
  className,
}: CtaBandProps) {
  const actions = (
    <>
      {primary}
      {secondary}
    </>
  );

  return (
    <Band labelledBy={id} className={className}>
      {tone === "spotlight" ? (
        <SpotlightBand
          id={id}
          title={title}
          body={body}
          actions={actions}
          aside={note ? <div className="max-w-xs text-sm opacity-80">{note}</div> : undefined}
        />
      ) : (
        <Reveal className={cn("fq-glass fq-gridlines fq-halo fq-edge-inner rounded-fq-lg p-8 sm:p-12")}>
          <h2 id={id} className="fq-display text-3xl sm:text-4xl">
            {title}
          </h2>
          {/* `div` wrappers: `body`/`note` are ReactNode, and callers pass
              checklists. `<p><ul>` is invalid HTML and breaks hydration. */}
          {body ? <div className="fq-measure mt-4 text-muted-foreground">{body}</div> : null}
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 [&>*]:w-full [&>*]:sm:w-auto [&>*]:min-h-[44px] [&>*]:flex [&>*]:items-center [&>*]:justify-center">{actions}</div>
          {note ? <div className="mt-4 text-sm text-muted-foreground">{note}</div> : null}
        </Reveal>
      )}
    </Band>
  );
}
